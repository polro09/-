// src/web/webServer.js
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const fs = require('fs');
const expressLayouts = require('express-ejs-layouts');
const { config } = require('../config/config');
const logger = require('../utils/logger');

class WebServer {
    constructor(client) {
        this.client = client;
        this.app = express();
        this.port = config.web.port || 3000;
        
        this.setupViewEngine(); // EJS 설정 추가
        this.setupMiddleware();
        this.setupRoutes();
    }
    
    /**
     * EJS 뷰 엔진 설정
     */
    setupViewEngine() {
        // EJS를 뷰 엔진으로 설정
        this.app.set('view engine', 'ejs');
        this.app.set('views', path.join(__dirname, 'views'));
        
        // express-ejs-layouts 사용
        this.app.use(expressLayouts);
        this.app.set('layout', 'layouts/main');
        
        // 전역 변수 설정
        this.app.locals.siteName = 'Aimdot.dev';
        this.app.locals.siteDescription = '디스코드 서버를 위한 강력하고 직관적인 봇';
        
        // Helper 함수들
        this.app.locals.helpers = {
            formatDate: (date) => {
                return new Date(date).toLocaleDateString('ko-KR');
            },
            formatNumber: (num) => {
                return new Intl.NumberFormat('ko-KR').format(num);
            },
            isActive: (currentPath, path) => {
                return currentPath === path ? 'active' : '';
            }
        };
        
        // 봇 클라이언트를 뷰에서 사용할 수 있도록 설정
        this.app.locals.bot = this.client;
    }
    
    setupMiddleware() {
        // 프록시 신뢰 설정 (Cloudflare 사용 시 필요)
        this.app.set('trust proxy', 1);
        
        // CORS 설정
        this.app.use((req, res, next) => {
            const origin = req.headers.origin;
            if (origin && (origin.includes('aimdot.dev') || origin.includes('localhost'))) {
                res.header('Access-Control-Allow-Origin', origin);
                res.header('Access-Control-Allow-Credentials', 'true');
                res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            }
            next();
        });
        
        // 기본 미들웨어
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static(path.join(__dirname, 'public')));
        
        // 세션 설정 (MongoDB 연결 상태 확인)
        const mongoose = require('mongoose');
        const sessionOptions = {
            secret: config.web.sessionSecret || 'aimdot-secret-key',
            resave: false,
            saveUninitialized: false,
            name: 'aimdot.sid',
            cookie: {
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                sameSite: 'lax',
                maxAge: 1000 * 60 * 60 * 24 * 7 // 7일
            },
            proxy: true
        };
        
        // MongoDB가 연결되어 있으면 MongoStore 사용
        if (mongoose.connection.readyState === 1) {
            sessionOptions.store = MongoStore.create({
                mongoUrl: config.database.uri,
                ttl: 14 * 24 * 60 * 60, // 14일
                // 세션 직렬화/역직렬화 오류 처리
                stringify: false,
                autoRemove: 'interval',
                autoRemoveInterval: 10, // 10분마다 만료된 세션 제거
                touchAfter: 24 * 3600 // 24시간마다 세션 업데이트
            });
            logger.server('MongoDB 세션 스토어 활성화');
        } else {
            logger.server('메모리 세션 스토어 사용 (MongoDB 미연결)', 'warn');
        }
        
        this.app.use(session(sessionOptions));
        
        // 세션 오류 처리 미들웨어
        this.app.use((req, res, next) => {
            if (req.session) {
                // 세션이 손상된 경우 재생성
                req.session.regenerate = req.session.regenerate || function(callback) {
                    req.session = req.sessionStore.generate(req);
                    callback && callback();
                };
            }
            next();
        });
        
        // 클라이언트 인스턴스와 사용자 정보를 req에 추가
        this.app.use(async (req, res, next) => {
            req.client = this.client;
            // 현재 경로를 locals에 추가 (네비게이션 활성화용)
            res.locals.currentPath = req.path;
            
            // 세션 사용자 정보를 locals에 추가
            if (req.session && req.session.user) {
                try {
                    const User = require('../models/User');
                    const user = await User.findOne({ discordId: req.session.user.id });
                    
                    if (user) {
                        res.locals.user = {
                            id: user.discordId,
                            username: user.username,
                            avatar: user.avatar,
                            nickname: user.nickname,
                            dashboardRole: user.dashboardRole || 'member',
                            wins: user.gameStats?.wins || 0,
                            losses: user.gameStats?.losses || 0,
                            avgKills: user.gameStats?.avgKills || 0,
                            rankedGames: user.gameStats?.rankedGames || 0,
                            practiceGames: user.gameStats?.practiceGames || 0
                        };
                    } else {
                        res.locals.user = req.session.user;
                    }
                } catch (error) {
                    console.error('사용자 정보 조회 오류:', error);
                    res.locals.user = req.session.user;
                }
            } else {
                res.locals.user = null;
            }
            
            next();
        });
    }
    
    setupRoutes() {
        // 디버깅: 현재 디렉토리 구조 확인
        logger.server(`현재 작업 디렉토리: ${__dirname}`);
        logger.server(`views 경로: ${path.join(__dirname, 'views')}`);
        logger.server(`routes 경로: ${path.join(__dirname, 'routes')}`);
        
        // 권한 미들웨어 가져오기
        const { requirePageAccess } = require('../middleware/permissions');
        
        // API 라우트를 먼저 등록
        this.app.use('/auth', require('./routes/auth'));
        this.app.use('/api', require('./routes/api'));
        this.app.use('/dashboard/api/permissions', require('./routes/permissions'));
        this.app.use('/dashboard/api', require('./routes/dashboard'));
        this.app.use('/party/api', require('./routes/party'));
        
        // 메인 페이지 라우트 (EJS)
        try {
            const indexRouter = require('./routes/index');
            this.app.use('/', indexRouter);
            logger.server('index.js 라우트 등록 완료');
        } catch (error) {
            logger.server('index.js 파일이 없어 기본 라우트 사용:', error.message);
            
            // index.js가 없으면 직접 메인 페이지 라우트 설정
            this.app.get('/', async (req, res) => {
                try {
                    // 봇 클라이언트 가져오기
                    const bot = this.client;
                    
                    // 세션에서 사용자 정보 가져오기
                    let userData = res.locals.user; // 미들웨어에서 이미 설정됨
                    
                    // 통계 정보 수집
                    const stats = {
                        serverCount: bot ? bot.guilds.cache.size : 0,
                        userCount: bot ? bot.users.cache.size : 0,
                        commandCount: bot && bot.commands ? bot.commands.size : 0
                    };
                    
                    // EJS 템플릿 렌더링
                    res.render('pages/index', {
                        title: 'Aimdot.dev - Discord Bot',
                        ...stats,
                        user: userData
                    });
                } catch (renderError) {
                    console.error('EJS 렌더링 오류:', renderError);
                    // EJS 렌더링 실패 시 기존 HTML 파일 사용
                    res.sendFile(path.join(__dirname, 'public', 'main.html'));
                }
            });
        }
        
        // 페이지 라우트 (EJS 렌더링)
        try {
            const pagesRouter = require('./routes/pages');
            this.app.use('/', pagesRouter);
            logger.server('pages.js 라우트 등록 완료');
        } catch (error) {
            logger.error('pages.js 라우트 파일을 찾을 수 없습니다:', error.message);
        }
        
        // 기존 HTML 페이지들 (점진적 마이그레이션)
        // 로딩 페이지는 더 이상 메인에서 사용하지 않음
        this.app.get('/loading', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'loading.html'));
        });
        
        // 메인 페이지 HTML 백업
        this.app.get('/main-legacy', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'main.html'));
        });
        
        // 파티 페이지 라우트 (로그인 불필요)
        this.app.get('/party', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'party.html'));
        });
        
        this.app.get('/party/create', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'party-create.html'));
        });
        
        this.app.get('/party/:partyId', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'party-detail.html'));
        });
        
        // DB 관리 페이지 (Sub Admin 이상)
        this.app.get('/dashboard/db-management', requirePageAccess('db-management'), (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'db-management.html'));
        });
        
        // 서버 관리 페이지 (Sub Admin 이상)
        this.app.get('/dashboard/servers', requirePageAccess('servers'), (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'servers.html'));
        });
        
        // 권한 관리 페이지 (Admin 이상)
        this.app.get('/dashboard/permissions', requirePageAccess('permissions'), (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'permissions.html'));
        });
        
        // 404 처리
        this.app.use((req, res) => {
            try {
                res.status(404).render('pages/404', {
                    title: '페이지를 찾을 수 없습니다 - Aimdot.dev',
                    layout: 'layouts/main'
                });
            } catch (error) {
                res.status(404).send(`
                    <!DOCTYPE html>
                    <html lang="ko">
                    <head>
                        <meta charset="UTF-8">
                        <title>404 - 페이지를 찾을 수 없습니다</title>
                        <style>
                            body {
                                background: #0a0a0a;
                                color: #ffffff;
                                display: flex;
                                justify-content: center;
                                align-items: center;
                                height: 100vh;
                                margin: 0;
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            }
                            .error-container {
                                text-align: center;
                            }
                            .error-code {
                                font-size: 6rem;
                                font-weight: bold;
                                color: #2196f3;
                                margin: 0;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="error-container">
                            <h1 class="error-code">404</h1>
                            <p>페이지를 찾을 수 없습니다</p>
                            <a href="/" style="color: #2196f3;">메인으로 돌아가기</a>
                        </div>
                    </body>
                    </html>
                `);
            }
        });
        
        // 에러 처리
        this.app.use((err, req, res, next) => {
            logger.error('서버 오류:', err);
            
            // 개발 환경에서는 상세 에러 표시
            if (process.env.NODE_ENV !== 'production') {
                res.status(500).json({ 
                    error: '서버 오류가 발생했습니다.',
                    message: err.message,
                    stack: err.stack
                });
            } else {
                res.status(500).json({ error: '서버 오류가 발생했습니다.' });
            }
        });
    }
    
    async start() {
        try {
            // 메뉴 권한 초기화
            const MenuPermission = require('../models/MenuPermission');
            await MenuPermission.initializeDefaults();
            logger.server('메뉴 권한 초기화 완료');
            
            this.server = this.app.listen(this.port, () => {
                logger.server(`✅ 웹 서버가 포트 ${this.port}에서 실행 중입니다.`);
                logger.server(`📡 대시보드: http://localhost:${this.port}/dashboard`);
                logger.server(`🌐 프로덕션: ${config.web.domain || 'https://aimdot.dev'}`);
                logger.server(`🎨 EJS 뷰 엔진 활성화됨`);
            });
            
            // 에러 처리
            this.server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    logger.error(`포트 ${this.port}이(가) 이미 사용 중입니다.`);
                    logger.error('다른 포트를 사용하거나 기존 프로세스를 종료하세요.');
                    process.exit(1);
                } else {
                    logger.error('서버 시작 오류:', error);
                    throw error;
                }
            });
        } catch (error) {
            logger.error('웹 서버 시작 오류:', error);
            throw error;
        }
    }
    
    stop() {
        if (this.server) {
            this.server.close(() => {
                logger.server('웹 서버가 종료되었습니다.');
            });
        }
    }
}

module.exports = WebServer;
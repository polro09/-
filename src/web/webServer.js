// src/web/webServer.js
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');

class WebServer {
    constructor(client) {
        this.client = client;
        this.app = express();
        this.port = config.web.port || 3000;
        
        this.setupMiddleware();
        this.setupRoutes();
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
                ttl: 14 * 24 * 60 * 60 // 14일
            });
            logger.web('MongoDB 세션 스토어 활성화');
        } else {
            logger.web('메모리 세션 스토어 사용 (MongoDB 미연결)', 'warn');
        }
        
        this.app.use(session(sessionOptions));
        
        // 클라이언트 인스턴스를 req에 추가
        this.app.use((req, res, next) => {
            req.client = this.client;
            next();
        });
    }
    
    setupRoutes() {
        // 권한 미들웨어 가져오기
        const { requirePageAccess } = require('../middleware/permissions');
        
        // API 라우트
        this.app.use('/auth', require('./routes/auth'));
        this.app.use('/api', require('./routes/api'));
        this.app.use('/dashboard/api/permissions', require('./routes/permissions')); // permissions를 먼저 등록
        this.app.use('/dashboard/api', require('./routes/dashboard'));
        this.app.use('/party/api', require('./routes/party'));
        
        // 메인 페이지 라우트
        this.app.get('/', (req, res) => {
            // 최초 방문 여부 확인
            if (!req.session.hasVisited) {
                req.session.hasVisited = true;
                res.sendFile(path.join(__dirname, 'public', 'loading.html'));
            } else {
                res.sendFile(path.join(__dirname, 'public', 'main.html'));
            }
        });
        
        this.app.get('/main', (req, res) => {
            req.session.hasVisited = true;
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
        
        // 대시보드 페이지 (로그인 필요)
        this.app.get('/dashboard', (req, res) => {
            if (!req.session.user) {
                const currentUrl = '/dashboard';
                return res.redirect(`/auth/discord?returnUrl=${encodeURIComponent(currentUrl)}`);
            }
            res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
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
            res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
        });
        
        // 에러 처리
        this.app.use((err, req, res, next) => {
            logger.error('서버 오류:', err);
            res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        });
    }
    
    async start() {
        try {
            // 메뉴 권한 초기화
            const MenuPermission = require('../models/MenuPermission');
            await MenuPermission.initializeDefaults();
            logger.web('메뉴 권한 초기화 완료');
            
            this.server = this.app.listen(this.port, () => {
                logger.web(`✅ 웹 서버가 포트 ${this.port}에서 실행 중입니다.`);
                logger.web(`📡 대시보드: http://localhost:${this.port}/dashboard`);
                logger.web(`🌐 프로덕션: ${config.web.domain || 'https://aimdot.dev'}`);
            });
        } catch (error) {
            logger.error('웹 서버 시작 오류:', error);
            throw error;
        }
    }
    
    stop() {
        if (this.server) {
            this.server.close(() => {
                logger.web('웹 서버가 종료되었습니다.');
            });
        }
    }
}

module.exports = WebServer;
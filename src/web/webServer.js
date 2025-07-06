// src/web/webServer.js - 경로 수정 버전

const express = require('express');
const session = require('express-session');
const path = require('path');

// 선택적으로 패키지 로드 (없으면 건너뛰기)
let helmet, rateLimit, compression, ejs, ejsLayouts, MongoStore;

try {
    helmet = require('helmet');
} catch (error) {
    console.log('⚠️  helmet 패키지가 설치되지 않음 - 보안 헤더 비활성화');
}

try {
    rateLimit = require('express-rate-limit');
} catch (error) {
    console.log('⚠️  express-rate-limit 패키지가 설치되지 않음 - Rate limiting 비활성화');
}

try {
    compression = require('compression');
} catch (error) {
    console.log('⚠️  compression 패키지가 설치되지 않음 - 압축 비활성화');
}

try {
    ejs = require('ejs');
    ejsLayouts = require('express-ejs-layouts');
} catch (error) {
    console.log('⚠️  EJS 패키지가 설치되지 않음 - EJS 템플릿 비활성화');
}

try {
    MongoStore = require('connect-mongo');
} catch (error) {
    console.log('⚠️  connect-mongo 패키지가 설치되지 않음 - 메모리 세션 사용');
}

// 내부 모듈 (경로 수정)
let logger, config;

try {
    logger = require('../utils/logger');  // 상위 디렉토리로 경로 수정
} catch (error) {
    console.log('⚠️  logger 모듈 없음 - 기본 콘솔 로깅 사용');
    // 기본 로거 객체 생성
    logger = {
        server: (message) => console.log(`[SERVER] ${message}`),
        error: (message) => console.error(`[ERROR] ${message}`),
        info: (message) => console.log(`[INFO] ${message}`),
        warn: (message) => console.warn(`[WARN] ${message}`)
    };
}

try {
    config = require('../config/config');  // 상위 디렉토리로 경로 수정
} catch (error) {
    console.log('⚠️  config 모듈 없음 - 기본 설정 사용');
    // 기본 설정 객체 생성
    config = {
        websiteUrl: process.env.WEBSITE_URL || 'http://localhost:3000'
    };
}

class WebServer {
    constructor(client) {
        this.app = express();
        this.client = client;
        this.server = null;
        this.isEjsEnabled = !!(ejs && ejsLayouts); // EJS 활성화 플래그
        
        this.setupMiddleware();
        if (this.isEjsEnabled) {
            this.setupEJS();
        }
        this.setupRoutes();
        this.setupErrorHandling();
    }
    
    // 미들웨어 설정
    setupMiddleware() {
        // 압축 (선택적)
        if (compression) {
            this.app.use(compression());
            logger.server('압축 미들웨어 활성화');
        }
        
        // 보안 헤더 (선택적)
        if (helmet) {
            this.app.use(helmet({
                contentSecurityPolicy: {
                    directives: {
                        defaultSrc: ["'self'"],
                        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
                        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
                        imgSrc: ["'self'", "data:", "https:", "http:"],
                        fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
                        connectSrc: ["'self'"],
                        objectSrc: ["'none'"],
                        mediaSrc: ["'self'"],
                        frameSrc: ["'none'"]
                    }
                }
            }));
            logger.server('보안 헤더 활성화');
        }
        
        // Rate Limiting (선택적)
        if (rateLimit) {
            const limiter = rateLimit({
                windowMs: 15 * 60 * 1000, // 15분
                max: 1000, // 요청 제한
                message: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.',
                standardHeaders: true,
                legacyHeaders: false
            });
            this.app.use(limiter);
            logger.server('Rate limiting 활성화');
        }
        
        // Body 파싱
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // 세션 설정
        this.setupSession();
        
        // 정적 파일 서빙
        this.app.use(express.static(path.join(__dirname, 'public'), {
            maxAge: '1d', // 1일 캐시
            etag: true
        }));
    }
    
    // EJS 템플릿 엔진 설정
    setupEJS() {
        if (!this.isEjsEnabled) {
            logger.server('EJS 패키지가 설치되지 않아 템플릿 엔진을 건너뜁니다.');
            return;
        }
        
        try {
            // EJS 설정
            this.app.set('view engine', 'ejs');
            this.app.set('views', path.join(__dirname, 'views'));
            
            // 레이아웃 설정
            this.app.use(ejsLayouts);
            this.app.set('layout', 'layouts/main');
            this.app.set('layout extractScripts', true);
            this.app.set('layout extractStyles', true);
            
            // EJS 전역 변수 및 헬퍼 함수 설정
            this.app.locals.siteName = 'Aimdot.dev';
            this.app.locals.websiteUrl = config.websiteUrl;
            
            // package.json을 안전하게 로드
            try {
                this.app.locals.version = require('../../package.json').version;
            } catch (error) {
                this.app.locals.version = '1.0.0';
            }
            
            // 헬퍼 함수들
            this.app.locals.formatDate = (date) => {
                return new Date(date).toLocaleDateString('ko-KR');
            };
            
            this.app.locals.formatDateTime = (date) => {
                return new Date(date).toLocaleString('ko-KR');
            };
            
            this.app.locals.truncate = (text, length = 100) => {
                if (!text) return '';
                return text.length > length ? text.substring(0, length) + '...' : text;
            };
            
            this.app.locals.escapeHtml = (text) => {
                if (!text) return '';
                return text.replace(/[&<>"']/g, (match) => {
                    const escapeMap = {
                        '&': '&amp;',
                        '<': '&lt;',
                        '>': '&gt;',
                        '"': '&quot;',
                        "'": '&#x27;'
                    };
                    return escapeMap[match];
                });
            };
            
            logger.server('EJS 템플릿 엔진이 설정되었습니다.');
            
        } catch (error) {
            logger.error(`EJS 설정 오류: ${error.message}`);
            this.isEjsEnabled = false;
        }
    }
    
    // 세션 설정
    setupSession() {
        const sessionConfig = {
            secret: process.env.SESSION_SECRET || 'aimdot-dev-secret-key',
            resave: false,
            saveUninitialized: false,
            name: 'aimdot.sid',
            cookie: {
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000 // 24시간
            }
        };
        
        // MongoDB 세션 스토어 설정 (선택적)
        if (MongoStore && process.env.MONGODB_URI) {
            try {
                sessionConfig.store = MongoStore.create({
                    mongoUrl: process.env.MONGODB_URI,
                    collectionName: 'sessions',
                    ttl: 24 * 60 * 60 // 24시간
                });
                logger.server('MongoDB 세션 스토어가 설정되었습니다.');
            } catch (error) {
                logger.error(`MongoDB 세션 스토어 설정 오류: ${error.message}`);
            }
        } else {
            logger.server('메모리 세션 스토어를 사용합니다.');
        }
        
        this.app.use(session(sessionConfig));
        
        // 세션 직렬화/역직렬화 설정
        this.app.use((req, res, next) => {
            if (req.session && !req.session.serialize) {
                req.session.serialize = function() {
                    return JSON.stringify(this);
                };
            }
            next();
        });
    }
    
    // 라우트 설정
    setupRoutes() {
        // 클라이언트 인스턴스를 req에 추가
        this.app.use((req, res, next) => {
            req.client = this.client;
            next();
        });
        
        // 기본 라우트 (테스트용)
        this.app.get('/', (req, res) => {
            if (this.isEjsEnabled) {
                try {
                    res.render('pages/index', {
                        title: 'Aimdot.dev',
                        user: req.session.user || null,
                        currentPath: req.path
                    });
                    return;
                } catch (error) {
                    logger.error(`메인 페이지 렌더링 오류: ${error.message}`);
                }
            }
            
            // EJS 실패 시 기본 HTML 응답
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Aimdot.dev</title>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            text-align: center; 
                            margin-top: 100px;
                            background: #0f0f23;
                            color: #ffffff;
                        }
                        .container { max-width: 600px; margin: 0 auto; }
                        h1 { color: #5865F2; font-size: 3rem; margin-bottom: 20px; }
                        p { color: #B5BAC1; font-size: 1.2rem; }
                        .status { 
                            background: #1e1e2e; 
                            padding: 20px; 
                            border-radius: 10px; 
                            margin-top: 30px;
                        }
                        .success { color: #3BA55C; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🤖 Aimdot.dev</h1>
                        <p>Discord 봇이 성공적으로 실행 중입니다!</p>
                        <div class="status">
                            <p class="success">✅ 웹서버 가동 중</p>
                            <p>포트: ${process.env.WEB_PORT || 3000}</p>
                            <p>상태: 정상</p>
                        </div>
                    </div>
                </body>
                </html>
            `);
        });
        
        // API 라우트들 (선택적으로 로드)
        this.setupApiRoutes();
        
        // 404 핸들러 (모든 라우트 마지막에)
        this.app.use('*', (req, res) => {
            if (this.isEjsEnabled) {
                try {
                    res.status(404).render('pages/404', {
                        title: '페이지를 찾을 수 없음 - Aimdot.dev',
                        user: req.session.user || null,
                        currentPath: req.path
                    });
                    return;
                } catch (error) {
                    logger.error(`404 페이지 렌더링 오류: ${error.message}`);
                }
            }
            
            // EJS 실패 시 기본 404
            res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>404 - 페이지를 찾을 수 없음</title>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; margin-top: 100px; }
                        h1 { color: #e74c3c; }
                    </style>
                </head>
                <body>
                    <h1>404 - 페이지를 찾을 수 없습니다</h1>
                    <p>요청하신 페이지가 존재하지 않습니다.</p>
                    <a href="/">← 메인 페이지로 돌아가기</a>
                </body>
                </html>
            `);
        });
    }
    
    // API 라우트 설정 (선택적)
    setupApiRoutes() {
        try {
            // 기존 라우트들을 선택적으로 로드
            const routeFiles = [
                './routes/auth',
                './routes/dashboard', 
                './routes/party',
                './routes/permissions',
                './routes/servers',
                './routes/db-management'
            ];
            
            routeFiles.forEach(routeFile => {
                try {
                    const router = require(routeFile);
                    const routeName = routeFile.split('/').pop();
                    this.app.use(`/${routeName}`, router);
                    logger.server(`라우트 로드: /${routeName}`);
                } catch (error) {
                    logger.warn(`라우트 로드 실패: ${routeFile} - ${error.message}`);
                }
            });
            
        } catch (error) {
            logger.error(`API 라우트 설정 오류: ${error.message}`);
        }
    }
    
    // 에러 핸들링 설정
    setupErrorHandling() {
        // 일반 에러 핸들러
        this.app.use((error, req, res, next) => {
            logger.error(`웹서버 오류: ${error.message}`);
            
            // AJAX 요청인 경우 JSON 응답
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(500).json({
                    error: '서버 내부 오류가 발생했습니다.',
                    message: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
            
            // 일반 페이지 요청인 경우
            res.status(500).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>서버 오류 - Aimdot.dev</title>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                        .error-container { max-width: 600px; margin: 0 auto; }
                        h1 { color: #e74c3c; }
                        p { color: #666; }
                        .back-link { color: #5865F2; text-decoration: none; }
                    </style>
                </head>
                <body>
                    <div class="error-container">
                        <h1>🚨 서버 오류</h1>
                        <p>죄송합니다. 서버에서 오류가 발생했습니다.</p>
                        <p>잠시 후 다시 시도해주세요.</p>
                        <a href="/" class="back-link">← 메인 페이지로 돌아가기</a>
                    </div>
                </body>
                </html>
            `);
        });
    }
    
    // 서버 시작
    async start() {
        const PORT = process.env.WEB_PORT || 3000;
        
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(PORT, '0.0.0.0', (error) => {
                if (error) {
                    logger.error(`웹서버 시작 실패: ${error.message}`);
                    reject(error);
                } else {
                    logger.server(`웹서버가 포트 ${PORT}에서 시작되었습니다.`);
                    logger.server(`EJS 템플릿 엔진: ${this.isEjsEnabled ? '활성화' : '비활성화'}`);
                    logger.server(`웹사이트 URL: ${config.websiteUrl}`);
                    resolve();
                }
            });
            
            // 서버 에러 핸들링
            this.server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    logger.error(`포트 ${PORT}가 이미 사용 중입니다.`);
                } else {
                    logger.error(`웹서버 오류: ${error.message}`);
                }
                reject(error);
            });
        });
    }
    
    // 서버 중지
    async stop() {
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    logger.server('웹서버가 중지되었습니다.');
                    resolve();
                });
            });
        }
    }
    
    // 서버 상태 확인
    isRunning() {
        return this.server && this.server.listening;
    }
    
    // EJS 상태 확인
    isEjsReady() {
        return this.isEjsEnabled;
    }
}

module.exports = WebServer;
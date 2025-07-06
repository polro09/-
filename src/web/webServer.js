// src/web/webServer.js - 최종 완전 수정 버전
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

// 내부 모듈
let logger, config;

try {
    logger = require('../utils/logger');
} catch (error) {
    console.log('⚠️  logger 모듈 없음 - 기본 콘솔 로깅 사용');
    logger = {
        server: (message) => console.log(`[SERVER] ${message}`),
        error: (message) => console.error(`[ERROR] ${message}`),
        info: (message) => console.log(`[INFO] ${message}`),
        warn: (message) => console.warn(`[WARN] ${message}`)
    };
}

try {
    config = require('../config/config').config || require('../config/config');
} catch (error) {
    console.log('⚠️  config 모듈 없음 - 기본 설정 사용');
    config = {
        websiteUrl: process.env.WEBSITE_URL || 'http://localhost:3000',
        web: {
            port: process.env.WEB_PORT || 3000,
            domain: process.env.WEBSITE_URL || 'http://localhost:3000'
        }
    };
}

class WebServer {
    constructor(client) {
        this.app = express();
        this.client = client;
        this.server = null;
        this.port = process.env.WEB_PORT || config.web?.port || 3000;
        this.isEjsEnabled = !!(ejs && ejsLayouts); // EJS 활성화 플래그
        
        this.setupMiddleware();
        this.setupViewEngine();
        this.setupSession();
        this.setupRoutes();
        this.setupErrorHandling();
    }
    
    /**
     * EJS 뷰 엔진 설정 (레이아웃 없이)
     */
    setupViewEngine() {
        if (!this.isEjsEnabled) {
            logger.server('EJS 패키지가 설치되지 않아 템플릿 엔진을 건너뜁니다.');
            return;
        }
        
        try {
            // EJS 설정 (express-ejs-layouts 없이)
            this.app.set('view engine', 'ejs');
            this.app.set('views', path.join(__dirname, 'views'));
            
            // EJS 전역 변수 설정
            this.app.locals.siteName = 'Aimdot.dev';
            this.app.locals.siteDescription = '디스코드 서버를 위한 강력하고 직관적인 봇';
            this.app.locals.websiteUrl = config.websiteUrl || config.web?.domain || 'http://localhost:3000';
            
            // package.json을 안전하게 로드
            try {
                this.app.locals.version = require('../../package.json').version;
            } catch (error) {
                this.app.locals.version = '1.0.0';
            }
            
            // Helper 함수들 설정
            this.setupHelpers();
            
            logger.server('🎨 EJS 템플릿 엔진이 설정되었습니다 (레이아웃 없이).');
            
        } catch (error) {
            logger.error(`EJS 설정 오류: ${error.message}`);
            this.isEjsEnabled = false;
        }
    }
    
    /**
     * EJS Helper 함수들 설정
     */
    setupHelpers() {
        // 날짜 포맷팅
        this.app.locals.formatDate = (date) => {
            return new Date(date).toLocaleDateString('ko-KR');
        };
        
        this.app.locals.formatDateTime = (date) => {
            return new Date(date).toLocaleString('ko-KR');
        };
        
        // 숫자 포맷팅
        this.app.locals.formatNumber = (num) => {
            return new Intl.NumberFormat('ko-KR').format(num);
        };
        
        // 텍스트 자르기
        this.app.locals.truncate = (text, length = 100) => {
            if (!text) return '';
            return text.length > length ? text.substring(0, length) + '...' : text;
        };
        
        // HTML 이스케이프
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
        
        // 네비게이션 활성화 확인
        this.app.locals.isActive = (currentPath, path) => {
            return currentPath === path ? 'active' : '';
        };
        
        // 시간 차이 계산
        this.app.locals.timeAgo = (date) => {
            const now = new Date();
            const diff = now - new Date(date);
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
            
            if (minutes < 1) return '방금 전';
            if (minutes < 60) return `${minutes}분 전`;
            if (hours < 24) return `${hours}시간 전`;
            return `${days}일 전`;
        };
    }
    
    /**
     * 미들웨어 설정
     */
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
                        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
                        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
                        imgSrc: ["'self'", "data:", "https:", "http:", "https://i.imgur.com", "https://cdn.discordapp.com"],
                        fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
                        connectSrc: ["'self'", "https://discord.com", "https://discordapp.com"],
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
        
        // 정적 파일 서빙
        this.app.use(express.static(path.join(__dirname, 'public'), {
            maxAge: '1d', // 1일 캐시
            etag: true
        }));
    }
    
    /**
     * 세션 설정
     */
    setupSession() {
        const sessionConfig = {
            secret: process.env.SESSION_SECRET || 'aimdot-dev-secret-key-2024',
            resave: false,
            saveUninitialized: false,
            name: 'aimdot.sid',
            cookie: {
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000, // 24시간
                sameSite: 'lax'
            }
        };
        
        // MongoDB 세션 스토어 설정 (선택적)
        if (MongoStore && process.env.MONGODB_URI) {
            try {
                sessionConfig.store = MongoStore.create({
                    mongoUrl: process.env.MONGODB_URI,
                    collectionName: 'sessions',
                    ttl: 24 * 60 * 60, // 24시간
                    autoRemove: 'interval',
                    autoRemoveInterval: 10, // 10분마다 만료된 세션 제거
                    touchAfter: 24 * 3600 // 24시간마다 세션 업데이트
                });
                logger.server('MongoDB 세션 스토어가 설정되었습니다.');
            } catch (error) {
                logger.error(`MongoDB 세션 스토어 설정 오류: ${error.message}`);
                logger.server('메모리 세션 스토어 사용 (MongoDB 미연결)');
            }
        } else {
            logger.server('메모리 세션 스토어를 사용합니다.');
        }
        
        this.app.use(session(sessionConfig));
        
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
        
        // 클라이언트 인스턴스 및 전역 변수를 req에 추가
        this.app.use((req, res, next) => {
            req.client = this.client;
            // 현재 경로를 locals에 추가 (네비게이션 활성화용)
            res.locals.currentPath = req.path;
            // 세션 사용자 정보를 locals에 추가
            res.locals.user = req.session.user || null;
            next();
        });
    }
    
    /**
     * 라우트 설정
     */
    setupRoutes() {
        // 디버깅: 현재 디렉토리 구조 확인
        logger.server(`현재 작업 디렉토리: ${__dirname}`);
        logger.server(`views 경로: ${path.join(__dirname, 'views')}`);
        logger.server(`routes 경로: ${path.join(__dirname, 'routes')}`);
        
        // **API 라우트들 (최우선)**
        this.setupApiRoutes();
        
        // **메인 페이지 라우트 (직접 설정)**
        this.setupMainRoutes();
        
        // **기타 페이지 라우트**
        this.setupPageRoutes();
        
        // **404 핸들러 (모든 라우트 마지막에)**
        this.setup404Handler();
        
        logger.server('모든 라우트 등록 완료');
    }
    
    /**
     * API 라우트 설정
     */
    setupApiRoutes() {
        try {
            // 기존 API 라우트들을 안전하게 로드
            const apiRoutes = [
                { path: '/auth', file: './routes/auth' },
                { path: '/api', file: './routes/api' },
                { path: '/dashboard/api', file: './routes/dashboard' },
                { path: '/party/api', file: './routes/party' },
                { path: '/permissions', file: './routes/permissions' }
            ];
            
            apiRoutes.forEach(({ path, file }) => {
                try {
                    const router = require(file);
                    this.app.use(path, router);
                    logger.server(`API 라우트 등록: ${path}`);
                } catch (error) {
                    logger.warn(`API 라우트 로드 실패: ${path} - ${error.message}`);
                }
            });
            
        } catch (error) {
            logger.error(`API 라우트 설정 오류: ${error.message}`);
        }
    }
    
    /**
     * 메인 페이지 라우트 설정 (직접)
     */
    setupMainRoutes() {
        // 메인 페이지 (/)
        this.app.get('/', (req, res) => {
            try {
                // 봇 통계 정보 수집 (안전하게)
                const stats = this.getBotStats();
                
                // 사용자 정보 가져오기
                const userData = req.session?.user || null;
                
                if (this.isEjsEnabled) {
                    // EJS 템플릿 렌더링 시도
                    const renderData = {
                        title: 'Aimdot.dev - Discord Bot',
                        user: userData,
                        serverCount: stats.serverCount,
                        userCount: stats.userCount,
                        commandCount: stats.commandCount,
                        currentPath: req.path,
                        websiteUrl: config.websiteUrl || config.web?.domain
                    };
                    
                    logger.server(`메인 페이지 렌더링 시도: 사용자=${userData ? userData.username : '게스트'}, 통계=${JSON.stringify(stats)}`);
                    
                    return res.render('pages/index', renderData);
                }
                
            } catch (error) {
                logger.error(`메인 페이지 EJS 렌더링 실패: ${error.message}`);
            }
            
            // EJS 실패 시 기본 HTML 응답
            res.send(this.getDefaultHomePage());
        });
        
        // 메인 페이지 직접 접근 (로딩 없이) - 별칭
        this.app.get('/main', (req, res) => {
            res.redirect('/');
        });
        
        // 헬스 체크
        this.app.get('/health', (req, res) => {
            const stats = this.getBotStats();
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                bot: {
                    ready: this.client ? this.client.isReady() : false,
                    guilds: stats.serverCount,
                    users: stats.userCount
                }
            });
        });
    }
    
    /**
     * 기타 페이지 라우트 설정
     */
    setupPageRoutes() {
        // 권한 미들웨어 가져오기 (선택적)
        let requirePageAccess;
        try {
            requirePageAccess = require('../middleware/permissions').requirePageAccess;
        } catch (error) {
            logger.warn('권한 미들웨어를 찾을 수 없습니다. 기본 권한 검사 사용');
            // 기본 권한 검사 함수
            requirePageAccess = (permission) => (req, res, next) => {
                if (!req.session.user) {
                    return res.redirect('/auth/discord?returnUrl=' + encodeURIComponent(req.originalUrl));
                }
                // 기본적으로 로그인된 사용자는 통과
                next();
            };
        }
        
        // **대시보드 페이지 (인증 필요)**
        this.app.get('/dashboard', (req, res) => {
            if (!req.session.user) {
                const currentUrl = '/dashboard';
                return res.redirect(`/auth/discord?returnUrl=${encodeURIComponent(currentUrl)}`);
            }
            
            try {
                if (this.isEjsEnabled) {
                    // 봇 통계 정보 수집
                    const stats = this.getBotStats();
                    
                    return res.render('pages/dashboard', {
                        title: '대시보드 - Aimdot.dev',
                        user: req.session.user,
                        currentPath: req.path,
                        stats: stats,
                        websiteUrl: config.websiteUrl || config.web?.domain
                    });
                }
            } catch (error) {
                logger.error(`대시보드 EJS 렌더링 실패: ${error.message}`);
            }
            
            // 폴백 HTML
            res.send(this.getDefaultDashboardPage());
        });
        
        // **파티 시스템 페이지들**
        this.setupPartyRoutes();
        
        // **관리자 페이지들 (권한별 접근 제어)**
        this.setupAdminRoutes(requirePageAccess);
    }
    
    /**
     * 파티 시스템 라우트 설정
     */
    setupPartyRoutes() {
        // 파티 메인 페이지 (로그인 불필요)
        this.app.get('/party', (req, res) => {
            try {
                if (this.isEjsEnabled) {
                    return res.render('pages/party', {
                        title: '파티 시스템 - Aimdot.dev',
                        user: req.session.user || null,
                        currentPath: req.path,
                        websiteUrl: config.websiteUrl || config.web?.domain
                    });
                }
            } catch (error) {
                logger.error(`파티 EJS 렌더링 실패: ${error.message}`);
            }
            
            res.send('<h1>파티 시스템</h1><p>파티 기능을 준비 중입니다.</p>');
        });
        
        // 파티 생성 페이지 (인증 필요)
        this.app.get('/party/create', (req, res) => {
            if (!req.session.user) {
                return res.redirect('/auth/discord?returnUrl=/party/create');
            }
            
            try {
                if (this.isEjsEnabled) {
                    return res.render('pages/party-create', {
                        title: '파티 생성 - Aimdot.dev',
                        user: req.session.user,
                        currentPath: req.path,
                        websiteUrl: config.websiteUrl || config.web?.domain
                    });
                }
            } catch (error) {
                logger.error(`파티 생성 EJS 렌더링 실패: ${error.message}`);
            }
            
            res.send('<h1>파티 생성</h1><p>파티 생성 기능을 준비 중입니다.</p>');
        });
        
        // 파티 상세 페이지 (인증 필요)
        this.app.get('/party/:partyId', (req, res) => {
            if (!req.session.user) {
                return res.redirect('/auth/discord?returnUrl=' + req.originalUrl);
            }
            
            try {
                if (this.isEjsEnabled) {
                    return res.render('pages/party-detail', {
                        title: '파티 상세 - Aimdot.dev',
                        user: req.session.user,
                        currentPath: req.path,
                        partyId: req.params.partyId,
                        websiteUrl: config.websiteUrl || config.web?.domain,
                        party: { partyId: req.params.partyId }
                    });
                }
            } catch (error) {
                logger.error(`파티 상세 EJS 렌더링 실패: ${error.message}`);
            }
            
            res.send(`<h1>파티 상세</h1><p>파티 ID: ${req.params.partyId}</p>`);
        });
    }
    
    /**
     * 관리자 페이지 라우트 설정
     */
    setupAdminRoutes(requirePageAccess) {
        // 권한 관리 페이지 (관리자만)
        this.app.get('/dashboard/permissions', requirePageAccess('permissions'), (req, res) => {
            // 관리자 권한 확인
            const userRole = req.session.user?.dashboardRole || 'guest';
            if (!['admin', 'owner'].includes(userRole)) {
                return res.status(403).send(this.getAccessDeniedPage());
            }
            
            try {
                if (this.isEjsEnabled) {
                    return res.render('pages/permissions', {
                        title: '권한 관리 - Aimdot.dev',
                        user: req.session.user,
                        currentPath: req.path,
                        websiteUrl: config.websiteUrl || config.web?.domain
                    });
                }
            } catch (error) {
                logger.error(`권한 관리 EJS 렌더링 실패: ${error.message}`);
            }
            
            res.send('<h1>권한 관리</h1><p>권한 관리 기능을 준비 중입니다.</p>');
        });
        
        // 서버 관리 페이지 (Sub Admin 이상)
        this.app.get('/dashboard/servers', requirePageAccess('servers'), (req, res) => {
            const userRole = req.session.user?.dashboardRole || 'guest';
            if (!['subadmin', 'admin', 'owner'].includes(userRole)) {
                return res.status(403).send(this.getAccessDeniedPage());
            }
            
            try {
                if (this.isEjsEnabled) {
                    return res.render('pages/servers', {
                        title: '서버 관리 - Aimdot.dev',
                        user: req.session.user,
                        currentPath: req.path,
                        websiteUrl: config.websiteUrl || config.web?.domain
                    });
                }
            } catch (error) {
                logger.error(`서버 관리 EJS 렌더링 실패: ${error.message}`);
            }
            
            res.send('<h1>서버 관리</h1><p>서버 관리 기능을 준비 중입니다.</p>');
        });
        
        // DB 관리 페이지 (Sub Admin 이상)
        this.app.get('/dashboard/db-management', requirePageAccess('db-management'), (req, res) => {
            const userRole = req.session.user?.dashboardRole || 'guest';
            if (!['subadmin', 'admin', 'owner'].includes(userRole)) {
                return res.status(403).send(this.getAccessDeniedPage());
            }
            
            try {
                if (this.isEjsEnabled) {
                    return res.render('pages/db-management', {
                        title: 'DB 관리 - Aimdot.dev',
                        user: req.session.user,
                        currentPath: req.path,
                        websiteUrl: config.websiteUrl || config.web?.domain
                    });
                }
            } catch (error) {
                logger.error(`DB 관리 EJS 렌더링 실패: ${error.message}`);
            }
            
            res.send('<h1>DB 관리</h1><p>DB 관리 기능을 준비 중입니다.</p>');
        });
    }
    
    /**
     * 404 핸들러 설정
     */
    setup404Handler() {
        this.app.use('*', (req, res) => {
            try {
                if (this.isEjsEnabled) {
                    return res.status(404).render('pages/404', {
                        title: '페이지를 찾을 수 없음 - Aimdot.dev',
                        user: req.session.user || null,
                        currentPath: req.path,
                        websiteUrl: config.websiteUrl || config.web?.domain
                    });
                }
            } catch (error) {
                logger.error(`404 페이지 렌더링 오류: ${error.message}`);
            }
            
            // EJS 실패 시 기본 404
            res.status(404).send(this.getDefault404Page());
        });
    }
    
    /**
     * 에러 핸들링 설정
     */
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
            res.status(500).send(this.getDefaultErrorPage(error));
        });
    }
    
    /**
     * 봇 통계 정보 수집 (안전하게)
     */
    getBotStats() {
        const stats = {
            serverCount: 0,
            userCount: 0,
            commandCount: 0
        };
        
        if (this.client) {
            try {
                stats.serverCount = this.client.guilds ? this.client.guilds.cache.size : 0;
                stats.userCount = this.client.users ? this.client.users.cache.size : 0;
                stats.commandCount = this.client.commands ? this.client.commands.size : 0;
            } catch (botError) {
                logger.warn(`봇 통계 수집 실패: ${botError.message}`);
            }
        }
        
        return stats;
    }
    
    /**
     * 기본 홈페이지 HTML
     */
    getDefaultHomePage() {
        const stats = this.getBotStats();
        
        return `
            <!DOCTYPE html>
            <html lang="ko">
            <head>
                <title>Aimdot.dev - Discord Bot</title>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%);
                        color: #ffffff;
                        margin: 0;
                        padding: 20px;
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .container { 
                        max-width: 800px; 
                        text-align: center;
                        background: rgba(30, 30, 46, 0.8);
                        padding: 40px;
                        border-radius: 15px;
                        border: 1px solid rgba(88, 101, 242, 0.3);
                    }
                    h1 { 
                        color: #5865F2; 
                        font-size: 3rem; 
                        margin-bottom: 1rem;
                        background: linear-gradient(45deg, #5865F2, #7289DA);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        background-clip: text;
                    }
                    p { 
                        color: #B5BAC1; 
                        font-size: 1.2rem; 
                        margin-bottom: 2rem;
                        line-height: 1.6;
                    }
                    .stats {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                        gap: 1rem;
                        margin: 2rem 0;
                    }
                    .stat-card {
                        background: rgba(15, 15, 35, 0.8);
                        padding: 1.5rem;
                        border-radius: 10px;
                        border: 1px solid rgba(88, 101, 242, 0.3);
                    }
                    .stat-number {
                        font-size: 2rem;
                        font-weight: bold;
                        color: #5865F2;
                        margin-bottom: 0.5rem;
                    }
                    .stat-label {
                        color: #B5BAC1;
                        font-size: 0.9rem;
                    }
                    .buttons {
                        margin-top: 2rem;
                        display: flex;
                        gap: 1rem;
                        justify-content: center;
                        flex-wrap: wrap;
                    }
                    .btn {
                        padding: 12px 24px;
                        background: #5865F2;
                        color: white;
                        text-decoration: none;
                        border-radius: 8px;
                        font-weight: 500;
                        transition: all 0.3s;
                        display: inline-flex;
                        align-items: center;
                        gap: 0.5rem;
                    }
                    .btn:hover {
                        background: #4752C4;
                        transform: translateY(-2px);
                    }
                    .btn-secondary {
                        background: transparent;
                        border: 1px solid rgba(255, 255, 255, 0.3);
                    }
                    .btn-secondary:hover {
                        background: rgba(255, 255, 255, 0.1);
                    }
                    .warning {
                        background: rgba(255, 152, 0, 0.1);
                        border: 1px solid rgba(255, 152, 0, 0.3);
                        padding: 1rem;
                        border-radius: 8px;
                        margin: 1rem 0;
                        color: #ff9800;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 Aimdot.dev</h1>
                    <p>Discord 봇이 성공적으로 실행 중입니다!</p>
                    
                    <div class="warning">
                        ⚠️ EJS 템플릿 엔진을 사용할 수 없어 기본 페이지를 표시합니다.<br>
                        정상적인 사용을 위해 <code>npm install ejs express-ejs-layouts</code>를 실행하세요.
                    </div>
                    
                    <div class="stats">
                        <div class="stat-card">
                            <div class="stat-number">${stats.serverCount}</div>
                            <div class="stat-label">서버</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stats.userCount}</div>
                            <div class="stat-label">사용자</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stats.commandCount}</div>
                            <div class="stat-label">명령어</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">24/7</div>
                            <div class="stat-label">운영</div>
                        </div>
                    </div>
                    
                    <div class="buttons">
                        <a href="/auth/discord" class="btn">Discord 로그인</a>
                        <a href="/dashboard" class="btn btn-secondary">대시보드</a>
                        <a href="/health" class="btn btn-secondary">상태 확인</a>
                    </div>
                </div>
            </body>
            </html>
        `;
    }
    
    /**
     * 기본 대시보드 HTML
     */
    getDefaultDashboardPage() {
        return `
            <!DOCTYPE html>
            <html lang="ko">
            <head>
                <title>대시보드 - Aimdot.dev</title>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        background: #0f0f23;
                        color: #ffffff;
                        margin: 0;
                        padding: 20px;
                    }
                    .container { max-width: 800px; margin: 0 auto; }
                    h1 { color: #5865F2; }
                    .back-link { color: #5865F2; text-decoration: none; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📊 대시보드</h1>
                    <p>대시보드 기능을 준비 중입니다.</p>
                    <a href="/" class="back-link">← 메인 페이지로 돌아가기</a>
                </div>
            </body>
            </html>
        `;
    }
    
    /**
     * 접근 거부 페이지 HTML
     */
    getAccessDeniedPage() {
        return `
            <html>
            <head><title>권한 없음</title><meta charset="utf-8"></head>
            <body style="font-family: Arial; text-align: center; margin-top: 100px; background: #0f0f23; color: #fff;">
                <h1 style="color: #e74c3c;">⛔ 접근 권한 없음</h1>
                <p>이 페이지는 관리자만 접근할 수 있습니다.</p>
                <a href="/dashboard" style="color: #5865F2;">대시보드로 돌아가기</a>
            </body>
            </html>
        `;
    }
    
    /**
     * 기본 404 페이지 HTML
     */
    getDefault404Page() {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>404 - 페이지를 찾을 수 없음</title>
                <meta charset="utf-8">
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        margin-top: 100px;
                        background: #0f0f23;
                        color: #ffffff;
                    }
                    h1 { color: #e74c3c; }
                    a { color: #5865F2; text-decoration: none; }
                </style>
            </head>
            <body>
                <h1>404 - 페이지를 찾을 수 없습니다</h1>
                <p>요청하신 페이지가 존재하지 않습니다.</p>
                <a href="/">← 메인 페이지로 돌아가기</a>
            </body>
            </html>
        `;
    }
    
    /**
     * 기본 에러 페이지 HTML
     */
    getDefaultErrorPage(error) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>서버 오류 - Aimdot.dev</title>
                <meta charset="utf-8">
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        margin-top: 50px;
                        background: #0f0f23;
                        color: #ffffff;
                    }
                    .error-container { max-width: 600px; margin: 0 auto; }
                    h1 { color: #e74c3c; }
                    p { color: #B5BAC1; }
                    .back-link { color: #5865F2; text-decoration: none; }
                    .error-details { 
                        background: #1e1e2e; 
                        padding: 15px; 
                        border-radius: 5px; 
                        margin: 20px 0;
                        font-family: monospace;
                        text-align: left;
                    }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <h1>🚨 서버 오류</h1>
                    <p>죄송합니다. 서버에서 오류가 발생했습니다.</p>
                    <p>잠시 후 다시 시도해주세요.</p>
                    ${process.env.NODE_ENV === 'development' ? 
                        `<div class="error-details">오류 상세: ${error.message}</div>` : 
                        ''}
                    <a href="/" class="back-link">← 메인 페이지로 돌아가기</a>
                </div>
            </body>
            </html>
        `;
    }
    
    /**
     * 서버 시작
     */
    async start() {
        try {
            // 메뉴 권한 초기화 (선택적)
            try {
                const MenuPermission = require('../models/MenuPermission');
                await MenuPermission.initializeDefaults();
                logger.server('메뉴 권한 초기화 완료');
            } catch (error) {
                logger.warn('메뉴 권한 시스템 초기화 실패 - 계속 진행');
            }
            
            return new Promise((resolve, reject) => {
                this.server = this.app.listen(this.port, '0.0.0.0', (error) => {
                    if (error) {
                        logger.error(`웹서버 시작 실패: ${error.message}`);
                        reject(error);
                    } else {
                        logger.server(`✅ 웹 서버가 포트 ${this.port}에서 실행 중입니다.`);
                        logger.server(`📡 메인 페이지: http://localhost:${this.port}/`);
                        logger.server(`📊 대시보드: http://localhost:${this.port}/dashboard`);
                        logger.server(`🏥 헬스체크: http://localhost:${this.port}/health`);
                        logger.server(`🌐 프로덕션: ${config.web?.domain || config.websiteUrl || 'https://aimdot.dev'}`);
                        logger.server(`🎨 EJS 템플릿 엔진: ${this.isEjsEnabled ? '활성화' : '비활성화'}`);
                        resolve();
                    }
                });
                
                // 서버 에러 핸들링
                this.server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        logger.error(`포트 ${this.port}가 이미 사용 중입니다.`);
                        logger.error('다른 포트를 사용하거나 기존 프로세스를 종료하세요.');
                    } else {
                        logger.error(`웹서버 오류: ${error.message}`);
                    }
                    reject(error);
                });
            });
        } catch (error) {
            logger.error('웹 서버 시작 오류:', error);
            throw error;
        }
    }
    
    /**
     * 서버 중지
     */
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
    
    /**
     * 서버 상태 확인
     */
    isRunning() {
        return this.server && this.server.listening;
    }
    
    /**
     * EJS 상태 확인
     */
    isEjsReady() {
        return this.isEjsEnabled;
    }
}

module.exports = WebServer;
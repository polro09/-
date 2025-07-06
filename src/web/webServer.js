// src/web/webServer.js - 완전한 웹 서버 설정
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
        warn: (message) => console.warn(`[WARN] ${message}`),
        debug: (message) => console.log(`[DEBUG] ${message}`)
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
        },
        sessionSecret: process.env.SESSION_SECRET || 'aimdot-dev-secret-key-2024'
    };
}

class WebServer {
    constructor(client) {
        this.app = express();
        this.client = client;
        this.server = null;
        this.port = process.env.WEB_PORT || config.web?.port || 3000;
        this.isEjsEnabled = !!(ejs && ejsLayouts); // EJS 활성화 플래그
        
        // 🔧 Trust Proxy 설정 - 가장 먼저 설정해야 함
        this.setupTrustProxy();
        
        this.setupMiddleware();
        this.setupViewEngine();
        this.setupSession();
        this.setupRoutes();
        this.setupErrorHandling();
    }
    
    /**
     * Trust Proxy 설정 - Cloudflared 터널 환경에 최적화
     */
    setupTrustProxy() {
        const isProduction = process.env.NODE_ENV === 'production';
        const isCloudflared = process.env.CLOUDFLARED === 'true' || 
                             process.env.WEBSITE_URL?.includes('aimdot.dev') ||
                             process.env.CLOUDFLARE_TUNNEL === 'true';
        
        if (isProduction || isCloudflared) {
            // 프로덕션 또는 Cloudflared 환경: 모든 프록시 신뢰
            this.app.set('trust proxy', true);
            logger.server('🔒 Trust Proxy 활성화 - 프로덕션/Cloudflared 환경');
        } else {
            // 개발 환경: 프록시 비활성화
            this.app.set('trust proxy', false);
            logger.server('🔓 Trust Proxy 비활성화 - 개발 환경');
        }
        
        // 환경 정보 로깅
        logger.server(`📊 환경 정보:`);
        logger.server(`   - NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
        logger.server(`   - CLOUDFLARED: ${isCloudflared ? 'true' : 'false'}`);
        logger.server(`   - WEBSITE_URL: ${process.env.WEBSITE_URL || 'localhost'}`);
        logger.server(`   - Trust Proxy: ${this.app.get('trust proxy')}`);
    }
    
    /**
     * 미들웨어 설정
     */
    setupMiddleware() {
        // 압축 (선택적)
        if (compression) {
            this.app.use(compression());
            logger.server('📦 압축 미들웨어 활성화');
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
            logger.server('🛡️ 보안 헤더 활성화');
        }
        
        // Rate Limiting (환경별 최적화)
        if (rateLimit) {
            const isProduction = process.env.NODE_ENV === 'production';
            const isTrustProxy = this.app.get('trust proxy');
            
            const limiterConfig = {
                windowMs: 15 * 60 * 1000, // 15분
                max: isProduction ? 500 : 1000, // 프로덕션에서 더 엄격
                message: {
                    error: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.',
                    retryAfter: '15분 후 다시 시도해주세요.'
                },
                standardHeaders: true,
                legacyHeaders: false,
                // Trust Proxy 설정에 따른 키 생성기
                keyGenerator: (req) => {
                    if (isTrustProxy) {
                        // 프로덕션/Cloudflared: X-Forwarded-For 또는 실제 IP 사용
                        return req.ip || 
                               req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                               req.headers['x-real-ip'] ||
                               req.connection.remoteAddress ||
                               'unknown';
                    } else {
                        // 개발 환경: 연결 IP만 사용
                        return req.connection.remoteAddress || 
                               req.socket.remoteAddress || 
                               'localhost';
                    }
                },
                // 스킵 조건 (내부 헬스체크 등)
                skip: (req) => {
                    const skipPaths = ['/health', '/status', '/favicon.ico'];
                    return skipPaths.includes(req.path);
                }
            };
            
            const limiter = rateLimit(limiterConfig);
            this.app.use(limiter);
            
            logger.server(`⚡ Rate Limiting 활성화:`);
            logger.server(`   - 최대 요청: ${limiterConfig.max}/15분`);
            logger.server(`   - IP 추출 방식: ${isTrustProxy ? 'Proxy Headers' : 'Direct Connection'}`);
        }
        
        // Body 파싱
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // 정적 파일 서빙
        this.app.use(express.static(path.join(__dirname, 'public'), {
            maxAge: '1d', // 1일 캐시
            etag: true
        }));
        
        // 요청 로깅 미들웨어 (개발 환경에서만)
        if (process.env.NODE_ENV !== 'production') {
            this.app.use((req, res, next) => {
                const startTime = Date.now();
                res.on('finish', () => {
                    const duration = Date.now() - startTime;
                    const status = res.statusCode;
                    const method = req.method;
                    const url = req.originalUrl;
                    const ip = req.ip || req.connection.remoteAddress;
                    
                    logger.info(`${method} ${url} - ${status} (${duration}ms) - IP: ${ip}`);
                });
                next();
            });
        }
    }
    
    /**
     * EJS 뷰 엔진 설정 (독립형 모드)
     */
    setupViewEngine() {
        if (!this.isEjsEnabled) {
            logger.server('⚠️ EJS 패키지가 설치되지 않아 템플릿 엔진을 건너뜁니다.');
            return;
        }
        
        // EJS 설정 (express-ejs-layouts 없이)
        this.app.set('view engine', 'ejs');
        this.app.set('views', path.join(__dirname, 'views'));
        
        // EJS 옵션 설정
        this.app.set('view options', {
            delimiter: '%',
            openDelimiter: '<',
            closeDelimiter: '>',
            rmWhitespace: true // 공백 제거로 성능 향상
        });
        
        // 전역 변수 설정
        this.app.locals.siteName = 'Aimdot.dev';
        this.app.locals.version = '2.0.0';
        this.app.locals.year = new Date().getFullYear();
        
        // Helper 함수들
        this.app.locals.formatDate = (date) => {
            return new Date(date).toLocaleDateString('ko-KR');
        };
        
        this.app.locals.isActive = (currentPath, targetPath) => {
            return currentPath === targetPath ? 'active' : '';
        };
        
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
        
        logger.server('🎨 EJS 뷰 엔진 설정 완료 (독립형 모드)');
    }
    
    /**
     * 세션 설정
     */
    setupSession() {
        const isProduction = process.env.NODE_ENV === 'production';
        const isTrustProxy = this.app.get('trust proxy');
        
        const sessionConfig = {
            secret: process.env.SESSION_SECRET || config.sessionSecret || 'aimdot-dev-secret-key-2024',
            resave: false,
            saveUninitialized: false,
            name: 'aimdot.sid',
            proxy: isTrustProxy, // Trust Proxy 설정과 동기화
            cookie: {
                secure: isProduction && isTrustProxy, // HTTPS + Proxy 환경에서만 secure
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000, // 24시간
                sameSite: isProduction ? 'lax' : 'lax', // CSRF 보호
                domain: isProduction ? undefined : undefined // 자동 설정
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
                logger.server('🗄️ MongoDB 세션 스토어가 설정되었습니다.');
            } catch (error) {
                logger.error(`MongoDB 세션 스토어 설정 오류: ${error.message}`);
                logger.server('💾 메모리 세션 스토어 사용 (MongoDB 미연결)');
            }
        } else {
            logger.server('💾 메모리 세션 스토어를 사용합니다.');
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
        
        logger.server(`🔐 세션 설정 완료:`);
        logger.server(`   - Proxy 모드: ${sessionConfig.proxy}`);
        logger.server(`   - Secure 쿠키: ${sessionConfig.cookie.secure}`);
        logger.server(`   - SameSite: ${sessionConfig.cookie.sameSite}`);
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
        
        logger.server('✅ 모든 라우트 등록 완료');
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
                    logger.server(`✅ API 라우트 등록: ${path}`);
                } catch (error) {
                    logger.warn(`⚠️ API 라우트 로드 실패: ${path} - ${error.message}`);
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
                    
                    logger.server(`🏠 메인 페이지 렌더링 시도: 사용자=${userData ? userData.username : '게스트'}, 통계=${JSON.stringify(stats)}`);
                    
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
                },
                server: {
                    trustProxy: this.app.get('trust proxy'),
                    environment: process.env.NODE_ENV || 'development'
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
            logger.warn('⚠️ 권한 미들웨어를 찾을 수 없습니다. 기본 권한 검사 사용');
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
        
        // **권한 관리 페이지 (관리자만)**
        this.app.get('/permissions', requirePageAccess('admin'), (req, res) => {
            try {
                if (this.isEjsEnabled) {
                    return res.render('pages/permissions', {
                        title: '권한 관리 - Aimdot.dev',
                        user: req.session.user,
                        currentPath: req.path
                    });
                }
            } catch (error) {
                logger.error(`권한 관리 페이지 렌더링 실패: ${error.message}`);
            }
            
            res.send('<h1>권한 관리</h1><p>관리자 전용 페이지입니다.</p>');
        });
        
        // **서버 관리 페이지 (관리자만)**
        this.app.get('/servers', requirePageAccess('admin'), (req, res) => {
            try {
                if (this.isEjsEnabled) {
                    return res.render('pages/servers', {
                        title: '서버 관리 - Aimdot.dev',
                        user: req.session.user,
                        currentPath: req.path
                    });
                }
            } catch (error) {
                logger.error(`서버 관리 페이지 렌더링 실패: ${error.message}`);
            }
            
            res.send('<h1>서버 관리</h1><p>관리자 전용 페이지입니다.</p>');
        });
    }
    
    /**
     * 파티 시스템 라우트 설정
     */
    setupPartyRoutes() {
        // 파티 목록 페이지
        this.app.get('/party', (req, res) => {
            try {
                if (this.isEjsEnabled) {
                    return res.render('pages/party', {
                        title: '파티 찾기 - Aimdot.dev',
                        user: req.session.user,
                        currentPath: req.path
                    });
                }
            } catch (error) {
                logger.error(`파티 페이지 렌더링 실패: ${error.message}`);
            }
            
            res.send('<h1>파티 찾기</h1><p>함께 플레이할 파티를 찾아보세요!</p>');
        });
        
        // 파티 생성 페이지 (인증 필요)
        this.app.get('/party/create', (req, res) => {
            if (!req.session.user) {
                return res.redirect('/auth/discord?returnUrl=' + encodeURIComponent(req.originalUrl));
            }
            
            try {
                if (this.isEjsEnabled) {
                    return res.render('pages/party-create', {
                        title: '파티 생성 - Aimdot.dev',
                        user: req.session.user,
                        currentPath: req.path
                    });
                }
            } catch (error) {
                logger.error(`파티 생성 페이지 렌더링 실패: ${error.message}`);
            }
            
            res.send('<h1>파티 생성</h1><p>새로운 파티를 만들어보세요!</p>');
        });
        
        // 파티 상세 페이지
        this.app.get('/party/:id', (req, res) => {
            const partyId = req.params.id;
            
            try {
                if (this.isEjsEnabled) {
                    return res.render('pages/party-detail', {
                        title: `파티 정보 - Aimdot.dev`,
                        user: req.session.user,
                        currentPath: req.path,
                        partyId: partyId
                    });
                }
            } catch (error) {
                logger.error(`파티 상세 페이지 렌더링 실패: ${error.message}`);
            }
            
            res.send(`<h1>파티 정보</h1><p>파티 ID: ${partyId}</p>`);
        });
    }
    
    /**
     * 404 핸들러 설정
     */
    setup404Handler() {
        this.app.use((req, res, next) => {
            if (this.isEjsEnabled) {
                res.status(404).render('pages/404', {
                    title: '페이지를 찾을 수 없습니다 - Aimdot.dev',
                    url: req.originalUrl,
                    user: req.session?.user || null,
                    currentPath: req.path
                });
            } else {
                res.status(404).json({
                    error: '페이지를 찾을 수 없습니다',
                    path: req.originalUrl,
                    method: req.method,
                    timestamp: new Date().toISOString()
                });
            }
        });
    }
    
    /**
     * 에러 핸들링 설정
     */
    setupErrorHandling() {
        // 일반 에러 처리
        this.app.use((err, req, res, next) => {
            logger.error(`🚨 웹 서버 오류: ${err.message}`);
            logger.error(`스택 트레이스: ${err.stack}`);
            
            // 프로덕션에서는 에러 세부사항 숨김
            const isProduction = process.env.NODE_ENV === 'production';
            const errorResponse = {
                error: '서버 오류가 발생했습니다',
                timestamp: new Date().toISOString(),
                path: req.originalUrl,
                method: req.method,
                ...(isProduction ? {} : { 
                    message: err.message,
                    stack: err.stack 
                })
            };
            
            if (this.isEjsEnabled && !req.xhr && req.accepts('html')) {
                // HTML 에러 페이지
                res.status(500).render('pages/error', {
                    title: '서버 오류 - Aimdot.dev',
                    error: errorResponse,
                    user: req.session?.user || null,
                    currentPath: req.path
                });
            } else {
                // JSON 에러 응답
                res.status(500).json(errorResponse);
            }
        });
        
        logger.server('🚨 에러 핸들링 설정 완료');
    }
    
    /**
     * 봇 통계 정보 수집
     */
    getBotStats() {
        try {
            if (!this.client || !this.client.isReady()) {
                return {
                    serverCount: 0,
                    userCount: 0,
                    commandCount: 0
                };
            }
            
            const guilds = this.client.guilds.cache;
            const serverCount = guilds.size;
            const userCount = guilds.reduce((acc, guild) => acc + guild.memberCount, 0);
            
            // 명령어 수 (슬래시 명령어 기준)
            const commandCount = this.client.commands?.size || 5; // 기본값
            
            return {
                serverCount,
                userCount,
                commandCount
            };
        } catch (error) {
            logger.error(`봇 통계 수집 오류: ${error.message}`);
            return {
                serverCount: 0,
                userCount: 0,
                commandCount: 0
            };
        }
    }
    
    /**
     * 기본 홈페이지 HTML (EJS 폴백)
     */
    getDefaultHomePage() {
        return `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Aimdot.dev - Discord Bot</title>
            <style>
                body { font-family: Arial, sans-serif; background: #000; color: #fff; text-align: center; padding: 50px; }
                .container { max-width: 800px; margin: 0 auto; }
                .logo { width: 100px; height: 100px; border-radius: 50%; margin: 20px auto; }
                .btn { display: inline-block; padding: 12px 24px; background: #5865F2; color: white; text-decoration: none; border-radius: 6px; margin: 10px; }
                .btn:hover { background: #4752C4; }
            </style>
        </head>
        <body>
            <div class="container">
                <img src="https://i.imgur.com/IOPA7gL.gif" alt="Aimdot.dev" class="logo">
                <h1>Aimdot.dev</h1>
                <p>Discord 게임 봇 - 폴백 페이지</p>
                <p>EJS 템플릿을 사용할 수 없어 기본 페이지를 표시하고 있습니다.</p>
                <a href="/auth/discord" class="btn">Discord로 로그인</a>
                <a href="/dashboard" class="btn">대시보드</a>
                <br><br>
                <p><small>서버 시간: ${new Date().toLocaleString('ko-KR')}</small></p>
            </div>
        </body>
        </html>`;
    }
    
    /**
     * 기본 대시보드 HTML (EJS 폴백)
     */
    getDefaultDashboardPage() {
        return `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>대시보드 - Aimdot.dev</title>
            <style>
                body { font-family: Arial, sans-serif; background: #000; color: #fff; padding: 20px; }
                .container { max-width: 1200px; margin: 0 auto; }
                .header { text-align: center; margin-bottom: 40px; }
                .nav { background: #1a1a1a; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                .nav a { color: #5865F2; text-decoration: none; margin: 0 15px; }
                .content { background: #1a1a1a; padding: 20px; border-radius: 8px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>대시보드</h1>
                    <p>Aimdot.dev 관리 패널 - 폴백 페이지</p>
                </div>
                <div class="nav">
                    <a href="/">홈</a>
                    <a href="/dashboard">대시보드</a>
                    <a href="/party">파티</a>
                    <a href="/auth/logout">로그아웃</a>
                </div>
                <div class="content">
                    <h2>대시보드 기능</h2>
                    <p>EJS 템플릿을 사용할 수 없어 기본 대시보드를 표시하고 있습니다.</p>
                    <ul>
                        <li>봇 상태 모니터링</li>
                        <li>서버 관리</li>
                        <li>사용자 관리</li>
                        <li>파티 시스템</li>
                    </ul>
                </div>
            </div>
        </body>
        </html>`;
    }
    
    /**
     * 서버 시작
     */
    async start() {
        try {
            this.server = this.app.listen(this.port, () => {
                logger.server(`🚀 Aimdot.dev 웹 서버가 시작되었습니다!`);
                logger.server(`📍 포트: ${this.port}`);
                logger.server(`🌐 로컬: http://localhost:${this.port}`);
                
                if (process.env.WEBSITE_URL) {
                    logger.server(`🌍 프로덕션: ${process.env.WEBSITE_URL}`);
                }
                
                // 환경별 정보 출력
                const env = process.env.NODE_ENV || 'development';
                const trustProxy = this.app.get('trust proxy');
                
                logger.server(`📊 실행 환경:`);
                logger.server(`   - 환경: ${env}`);
                logger.server(`   - Trust Proxy: ${trustProxy}`);
                logger.server(`   - EJS 활성화: ${this.isEjsEnabled}`);
                logger.server(`   - MongoDB: ${MongoStore && process.env.MONGODB_URI ? '연결됨' : '로컬/메모리'}`);
                
                // 주요 라우트 정보
                logger.server(`🛣️ 주요 라우트:`);
                logger.server(`   - 메인 페이지: GET /`);
                logger.server(`   - 대시보드: GET /dashboard`);
                logger.server(`   - 파티 시스템: GET /party`);
                logger.server(`   - 인증: GET /auth/discord`);
                logger.server(`   - API: GET /api/*`);
                logger.server(`   - 헬스체크: GET /health`);
            });
            
            return this.server;
        } catch (error) {
            logger.error(`웹 서버 시작 실패: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * 서버 종료
     */
    async stop() {
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    logger.server('🛑 웹 서버가 종료되었습니다.');
                    resolve();
                });
            });
        }
    }
}

module.exports = WebServer;
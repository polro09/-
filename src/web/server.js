// src/web/server.js
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const { config } = require('../config/config');
const logger = require('../utils/logger');

module.exports = async (client) => {
    const app = express();
    
    // 미들웨어 설정
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // 정적 파일 제공
    app.use(express.static(path.join(__dirname, 'public')));
    
    // 세션 설정
    const sessionConfig = {
        secret: config.sessionSecret || 'aimdot-dev-secret-key-2024',
        resave: true, // 세션 저장 강제
        saveUninitialized: true, // 초기화되지 않은 세션도 저장
        name: 'aimdot.sid', // 세션 쿠키 이름
        cookie: {
            maxAge: 24 * 60 * 60 * 1000, // 24시간
            secure: false, // 개발 환경에서는 false
            httpOnly: true,
            sameSite: 'lax', // CSRF 보호
            path: '/', // 명시적으로 경로 설정
            domain: undefined // 도메인 설정 제거 (로컬호스트 호환성)
        },
        proxy: process.env.NODE_ENV === 'production' // 프로덕션에서 프록시 사용
    };
    
    // MongoDB 세션 스토어 설정 (사용 가능한 경우)
    try {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState === 1) {
            sessionConfig.store = MongoStore.create({
                mongoUrl: config.mongoUri,
                touchAfter: 24 * 3600, // 24시간
                crypto: {
                    secret: config.sessionSecret || 'aimdot-dev-secret-key-2024'
                }
            });
            logger.server('MongoDB 세션 스토어 사용');
        } else {
            logger.warn('MongoDB 연결 없음 - 메모리 세션 스토어 사용', 'server');
        }
    } catch (error) {
        logger.warn('세션 스토어 생성 실패 - 메모리 세션 사용', 'server');
    }
    
    app.use(session(sessionConfig));
    
    // 세션 디버깅 미들웨어
    app.use((req, res, next) => {
        // OAuth 관련 경로에서만 간단한 디버깅
        if (req.path.startsWith('/auth')) {
            logger.debug(`[${req.method}] ${req.path} - 세션 ID: ${req.sessionID}`, 'session');
            // 상세 세션 데이터는 필요할 때만 표시
            if (process.env.DEBUG_SESSION === 'true') {
                logger.debug(`세션 데이터: ${JSON.stringify(req.session)}`, 'session');
            }
        }
        next();
    });
    
    // 봇 클라이언트를 요청 객체에 추가
    app.use((req, res, next) => {
        req.client = client;
        next();
    });
    
    // 라우트 등록 전 세션 확인
    app.use((req, res, next) => {
        if (!req.session) {
            logger.error('세션 미들웨어가 작동하지 않습니다', 'server');
        }
        next();
    });
    
    // 라우트 등록
    app.use('/auth', require('./routes/auth'));
    app.use('/api', require('./routes/api'));
    app.use('/dashboard/api', require('./routes/dashboard'));
    app.use('/test', require('./routes/test')); // 테스트 라우트
    
    // 메인 페이지 (최초 방문 체크)
    app.get('/', (req, res) => {
        // 최초 방문 여부 확인
        if (!req.session.hasVisited) {
            req.session.hasVisited = true;
            // 최초 방문 시 로딩 페이지 표시
            res.sendFile(path.join(__dirname, 'public', 'loading.html'));
        } else {
            // 이미 방문한 경우 바로 메인 페이지로
            res.sendFile(path.join(__dirname, 'public', 'main.html'));
        }
    });
    
    // 메인 페이지 직접 접근 (로딩 없이)
    app.get('/main', (req, res) => {
        req.session.hasVisited = true;
        res.sendFile(path.join(__dirname, 'public', 'main.html'));
    });
    
    // 대시보드 페이지
    app.get('/dashboard', (req, res) => {
        if (!req.session.user) {
            return res.redirect('/auth/discord');
        }
        res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    });
    
    // 404 처리
    app.use((req, res) => {
        res.status(404).json({ error: '페이지를 찾을 수 없습니다.' });
    });
    
    // 에러 처리
    app.use((err, req, res, next) => {
        logger.error(`웹 서버 오류: ${err.message}`, 'server');
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    });
    
    // 서버 시작
    app.listen(config.port, () => {
        logger.server(`🌐 웹 서버가 포트 ${config.port}에서 실행 중입니다.`);
        logger.server(`📍 로컬: http://localhost:${config.port}`);
        
        // 환경 변수 확인
        if (!config.clientSecret) {
            logger.warn('CLIENT_SECRET이 설정되지 않았습니다. OAuth가 작동하지 않습니다.', 'server');
        }
        if (!config.mongoUri || config.mongoUri.includes('localhost')) {
            logger.warn('MongoDB가 로컬에서 실행 중입니다. 프로덕션에서는 원격 DB를 사용하세요.', 'server');
        }
    });
};
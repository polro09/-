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
    app.use(session({
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: config.mongoUri,
            touchAfter: 24 * 3600 // 24시간
        }),
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true
        }
    }));
    
    // 봇 클라이언트를 요청 객체에 추가
    app.use((req, res, next) => {
        req.client = client;
        next();
    });
    
    // 라우트 등록
    app.use('/auth', require('./routes/auth'));
    app.use('/api', require('./routes/api'));
    app.use('/dashboard', require('./routes/dashboard'));
    
    // 메인 페이지
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'loading.html'));
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
    });
};
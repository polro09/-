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
            cookie: {
                secure: process.env.NODE_ENV === 'production',
                maxAge: 1000 * 60 * 60 * 24 * 7 // 7일
            }
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
        // API 라우트
        this.app.use('/auth', require('./routes/auth'));
        this.app.use('/dashboard/api', require('./routes/dashboard'));
        
        // 페이지 라우트
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });
        
        this.app.get('/dashboard', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
        });
        
        // DB 관리 페이지 (Sub Admin 이상)
        this.app.get('/dashboard/db-management', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'db-management.html'));
        });
        
        // 서버 관리 페이지
        this.app.get('/dashboard/servers', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'servers.html'));
        });
        
        // 권한 관리 페이지
        this.app.get('/dashboard/permissions', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'permissions.html'));
        });
        
        // 404 처리
        this.app.use((req, res) => {
            res.status(404).json({ error: '페이지를 찾을 수 없습니다.' });
        });
        
        // 에러 처리
        this.app.use((err, req, res, next) => {
            logger.error('서버 오류:', err);
            res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        });
    }
    
    start() {
        this.server = this.app.listen(this.port, () => {
            logger.web(`✅ 웹 서버가 포트 ${this.port}에서 실행 중입니다.`);
            logger.web(`📡 대시보드: http://localhost:${this.port}/dashboard`);
        });
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
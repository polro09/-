// src/config/database.js
const mongoose = require('mongoose');
const { config } = require('./config');
const logger = require('../utils/logger');

async function connectDatabase() {
    try {
        // 개발 환경에서 MongoDB 연결 실패 시 경고만 표시
        const options = {
            serverSelectionTimeoutMS: 5000, // 5초 타임아웃
        };
        
        await mongoose.connect(config.mongoUri, options);
        
        logger.success('MongoDB 연결 성공', 'database');
        
        // 연결 이벤트 리스너
        mongoose.connection.on('error', err => {
            logger.error(`MongoDB 연결 오류: ${err.message}`, 'database');
        });
        
        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB 연결 끊김', 'database');
        });
        
        return true;
        
    } catch (error) {
        logger.error('MongoDB 연결 실패:', error.message);
        
        // 개발 환경에서는 MongoDB 없이도 봇 실행 가능
        if (process.env.NODE_ENV === 'development') {
            logger.warn('⚠️ MongoDB 없이 봇을 실행합니다. 일부 기능이 작동하지 않을 수 있습니다.');
            return false;
        }
        
        throw error;
    }
}

module.exports = { connectDatabase };
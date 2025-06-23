// src/config/database.js
const mongoose = require('mongoose');
const { config } = require('./config');
const logger = require('../utils/logger');

async function connectDatabase() {
    try {
        await mongoose.connect(config.mongoUri);
        
        logger.info('MongoDB 연결 성공');
        
        // 연결 이벤트 리스너
        mongoose.connection.on('error', err => {
            logger.error('MongoDB 연결 오류:', err);
        });
        
        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB 연결 끊김');
        });
        
    } catch (error) {
        logger.error('MongoDB 연결 실패:', error);
        throw error;
    }
}

module.exports = { connectDatabase };
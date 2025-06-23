// src/web/routes/test.js
const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');

// 세션 테스트
router.get('/session', (req, res) => {
    logger.debug(`테스트 세션 ID: ${req.sessionID}`, 'test');
    logger.debug(`테스트 세션 데이터: ${JSON.stringify(req.session)}`, 'test');
    
    // 테스트 데이터 저장
    req.session.test = 'Hello World';
    req.session.timestamp = Date.now();
    
    req.session.save((err) => {
        if (err) {
            logger.error('테스트 세션 저장 실패:', err);
            return res.status(500).json({ error: '세션 저장 실패' });
        }
        
        res.json({
            sessionId: req.sessionID,
            session: req.session,
            cookie: req.session.cookie
        });
    });
});

// 세션 확인
router.get('/session/check', (req, res) => {
    res.json({
        sessionId: req.sessionID,
        session: req.session,
        test: req.session.test,
        timestamp: req.session.timestamp
    });
});

module.exports = router;
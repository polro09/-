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
    req.session.random = Math.random().toString(36).substring(7);
    
    req.session.save((err) => {
        if (err) {
            logger.error('테스트 세션 저장 실패:', err);
            return res.status(500).json({ error: '세션 저장 실패', details: err.message });
        }
        
        res.json({
            message: '세션 테스트 성공',
            sessionId: req.sessionID,
            session: req.session,
            cookie: req.session.cookie,
            headers: {
                cookie: req.headers.cookie,
                'user-agent': req.headers['user-agent']
            }
        });
    });
});

// 세션 확인
router.get('/session/check', (req, res) => {
    res.json({
        message: '세션 확인',
        sessionId: req.sessionID,
        session: req.session,
        test: req.session.test,
        timestamp: req.session.timestamp,
        random: req.session.random,
        isNew: req.session.isNew
    });
});

// 세션 삭제
router.get('/session/clear', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: '세션 삭제 실패' });
        }
        res.json({ message: '세션이 삭제되었습니다' });
    });
});

// OAuth state 테스트
router.get('/oauth/state', (req, res) => {
    const state = Math.random().toString(36).substring(7);
    req.session.test_state = state;
    
    req.session.save((err) => {
        if (err) {
            return res.status(500).json({ error: 'State 저장 실패' });
        }
        
        res.json({
            message: 'State 생성 및 저장 완료',
            state: state,
            sessionId: req.sessionID,
            session: req.session
        });
    });
});

// OAuth state 검증
router.get('/oauth/verify/:state', (req, res) => {
    const { state } = req.params;
    const sessionState = req.session.test_state;
    
    res.json({
        message: 'State 검증',
        provided: state,
        stored: sessionState,
        match: state === sessionState,
        sessionId: req.sessionID,
        session: req.session
    });
});

module.exports = router;
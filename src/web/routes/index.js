const express = require('express');
const router = express.Router();

/**
 * 메인 페이지 라우트
 * EJS 템플릿을 사용하여 동적 데이터와 함께 렌더링
 */
router.get('/', async (req, res) => {
    try {
        // 봇 클라이언트 가져오기
        const bot = req.app.locals.bot;
        
        // 통계 데이터 수집
        const stats = {
            serverCount: bot ? bot.guilds.cache.size : 0,
            userCount: bot ? bot.users.cache.size : 0,
            commandCount: bot ? bot.commands?.size || 0 : 0
        };
        
        // EJS 템플릿 렌더링
        res.render('pages/index', {
            title: 'Aimdot.dev - Discord Bot',
            ...stats,
            user: req.session?.user || null
        });
    } catch (error) {
        console.error('메인 페이지 렌더링 오류:', error);
        
        // 오류 발생 시 기본값으로 렌더링
        res.render('pages/index', {
            title: 'Aimdot.dev - Discord Bot',
            serverCount: 0,
            userCount: 0,
            commandCount: 0,
            user: null
        });
    }
});

/**
 * 봇 초대 링크 리다이렉트
 */
router.get('/invite', (req, res) => {
    const botId = process.env.BOT_CLIENT_ID || 'YOUR_BOT_ID';
    const permissions = '8'; // Administrator 권한
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${botId}&permissions=${permissions}&scope=bot%20applications.commands`;
    
    res.redirect(inviteUrl);
});

/**
 * API 상태 체크 엔드포인트
 */
router.get('/api/status', (req, res) => {
    const bot = req.app.locals.bot;
    
    res.json({
        success: true,
        data: {
            online: bot ? bot.ws.ping > 0 : false,
            ping: bot ? bot.ws.ping : null,
            uptime: bot ? bot.uptime : 0,
            servers: bot ? bot.guilds.cache.size : 0,
            users: bot ? bot.users.cache.size : 0
        }
    });
});

module.exports = router;
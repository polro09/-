// src/web/routes/index.js
const express = require('express');
const router = express.Router();
const User = require('../../models/User');

// 메인 페이지
router.get('/', async (req, res) => {
    try {
        // 봇 클라이언트 가져오기 (봇이 아직 초기화되지 않았을 수 있음)
        const bot = req.app.locals.bot || req.client;
        
        // 세션에서 사용자 정보 가져오기
        let userData = null;
        if (req.session && req.session.user) {
            // DB에서 전체 사용자 정보 조회
            const user = await User.findOne({ discordId: req.session.user.id });
            if (user) {
                userData = {
                    id: user.discordId,
                    username: user.username,
                    avatar: user.avatar,
                    nickname: user.nickname,
                    dashboardRole: user.dashboardRole || 'member',
                    // 게임 전적 정보
                    wins: user.gameStats?.wins || 0,
                    losses: user.gameStats?.losses || 0,
                    avgKills: user.gameStats?.avgKills || 0,
                    rankedGames: user.gameStats?.rankedGames || 0,
                    practiceGames: user.gameStats?.practiceGames || 0
                };
            } else {
                userData = req.session.user;
            }
        }
        
        // 통계 정보 수집
        const stats = {
            serverCount: bot ? bot.guilds.cache.size : 0,
            userCount: bot ? bot.users.cache.size : 0,
            commandCount: bot && bot.commands ? bot.commands.size : 0
        };
        
        // EJS 템플릿 렌더링
        res.render('pages/index', {
            title: 'Aimdot.dev - Discord Bot',
            ...stats,
            user: userData
        });
    } catch (error) {
        console.error('메인 페이지 렌더링 오류:', error);
        
        // 오류 시 기본값으로 렌더링
        res.render('pages/index', {
            title: 'Aimdot.dev - Discord Bot',
            serverCount: 0,
            userCount: 0,
            commandCount: 0,
            user: req.session?.user || null
        });
    }
});

module.exports = router;
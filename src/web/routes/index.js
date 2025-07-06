// src/web/routes/index.js - 수정된 버전
const express = require('express');
const router = express.Router();

// 선택적으로 User 모델 로드
let User;
try {
    User = require('../../models/User');
} catch (error) {
    console.log('⚠️  User 모델을 찾을 수 없습니다 - 세션 데이터만 사용');
    User = null;
}

// 메인 페이지
router.get('/', async (req, res) => {
    try {
        // 봇 클라이언트 가져오기 (여러 방법으로 시도)
        const bot = req.app.locals.bot || req.client || req.app.locals.client;
        
        // 세션에서 사용자 정보 가져오기
        let userData = null;
        if (req.session && req.session.user) {
            // 데이터베이스에서 추가 정보 조회 (가능한 경우)
            if (User) {
                try {
                    const user = await User.findOne({ discordId: req.session.user.id });
                    if (user) {
                        userData = {
                            id: user.discordId,
                            username: user.username,
                            discriminator: user.discriminator || '0000',
                            avatar: user.avatar,
                            nickname: user.nickname,
                            dashboardRole: user.dashboardRole || 'member',
                            // 게임 전적 정보 (있다면)
                            wins: user.gameStats?.wins || 0,
                            losses: user.gameStats?.losses || 0,
                            avgKills: user.gameStats?.avgKills || 0,
                            rankedGames: user.gameStats?.rankedGames || 0,
                            practiceGames: user.gameStats?.practiceGames || 0
                        };
                    }
                } catch (dbError) {
                    console.warn('데이터베이스 조회 실패:', dbError.message);
                }
            }
            
            // DB에서 못 가져왔으면 세션 데이터 사용
            if (!userData) {
                userData = {
                    id: req.session.user.id,
                    username: req.session.user.username,
                    discriminator: req.session.user.discriminator || '0000',
                    avatar: req.session.user.avatar,
                    dashboardRole: req.session.user.dashboardRole || 'member'
                };
            }
        }
        
        // 봇 통계 정보 수집 (안전하게)
        const stats = {
            serverCount: 0,
            userCount: 0,
            commandCount: 0
        };
        
        if (bot) {
            try {
                stats.serverCount = bot.guilds ? bot.guilds.cache.size : 0;
                stats.userCount = bot.users ? bot.users.cache.size : 0;
                stats.commandCount = bot.commands ? bot.commands.size : 0;
            } catch (botError) {
                console.warn('봇 통계 수집 실패:', botError.message);
            }
        }
        
        // EJS 템플릿 렌더링
        const renderData = {
            title: 'Aimdot.dev - Discord Bot',
            user: userData,
            serverCount: stats.serverCount,
            userCount: stats.userCount,
            commandCount: stats.commandCount,
            // 추가 메타데이터
            currentPath: req.path,
            websiteUrl: process.env.WEBSITE_URL || 'http://localhost:3000'
        };
        
        console.log('메인 페이지 렌더링:', {
            user: userData ? userData.username : '게스트',
            stats: stats
        });
        
        res.render('pages/index', renderData);
        
    } catch (error) {
        console.error('메인 페이지 렌더링 오류:', error);
        
        // 오류 시 기본값으로 렌더링 시도
        try {
            res.render('pages/index', {
                title: 'Aimdot.dev - Discord Bot',
                user: req.session?.user || null,
                serverCount: 0,
                userCount: 0,
                commandCount: 0,
                currentPath: req.path,
                websiteUrl: process.env.WEBSITE_URL || 'http://localhost:3000'
            });
        } catch (fallbackError) {
            console.error('폴백 렌더링도 실패:', fallbackError);
            
            // 최후의 수단: 기본 HTML 응답
            res.send(`
                <!DOCTYPE html>
                <html lang="ko">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Aimdot.dev - Discord Bot</title>
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            text-align: center; 
                            margin-top: 100px;
                            background: #0f0f23;
                            color: #ffffff;
                        }
                        .container { 
                            max-width: 600px; 
                            margin: 0 auto;
                            background: #1e1e2e;
                            padding: 40px;
                            border-radius: 10px;
                        }
                        h1 { color: #5865F2; }
                        .error { color: #e74c3c; margin: 20px 0; }
                        a { color: #5865F2; text-decoration: none; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🤖 Aimdot.dev</h1>
                        <p>Discord 봇이 실행 중입니다!</p>
                        <div class="error">
                            ⚠️ 템플릿 렌더링 오류 - 기본 페이지를 표시합니다.
                        </div>
                        <p>
                            <a href="/auth/discord">Discord 로그인</a> |
                            <a href="/dashboard">대시보드</a>
                        </p>
                    </div>
                </body>
                </html>
            `);
        }
    }
});

// 추가 라우트들 (필요시)
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API 상태 확인
router.get('/api/status', (req, res) => {
    const bot = req.app.locals.bot || req.client || req.app.locals.client;
    
    res.json({
        bot: {
            ready: bot ? bot.isReady() : false,
            guilds: bot ? bot.guilds.cache.size : 0,
            users: bot ? bot.users.cache.size : 0
        },
        server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
        }
    });
});

module.exports = router;
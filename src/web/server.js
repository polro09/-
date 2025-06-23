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
    
    // 메인 페이지
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'loading.html'));
    });
    
    // 404 처리
    app.use((req, res) => {
        res.status(404).json({ error: '페이지를 찾을 수 없습니다.' });
    });
    
    // 에러 처리
    app.use((err, req, res, next) => {
        logger.error('웹 서버 오류:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    });
    
    // 서버 시작
    app.listen(config.port, () => {
        logger.info(`웹 서버가 포트 ${config.port}에서 실행 중입니다.`);
    });
};

// src/web/routes/auth.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { config } = require('../../config/config');
const User = require('../../models/User');
const logger = require('../../utils/logger');

// OAuth URL 생성
router.get('/discord', (req, res) => {
    const state = Math.random().toString(36).substring(7);
    req.session.state = state;
    
    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'identify email guilds',
        state: state
    });
    
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// OAuth 콜백
router.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    
    // State 검증
    if (!state || state !== req.session.state) {
        return res.status(400).send('잘못된 요청입니다.');
    }
    
    delete req.session.state;
    
    try {
        // 액세스 토큰 획득
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams({
                client_id: config.clientId,
                client_secret: config.clientSecret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: config.redirectUri
            }), 
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        const { access_token, refresh_token, expires_in } = tokenResponse.data;
        
        // 사용자 정보 가져오기
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        });
        
        const userData = userResponse.data;
        
        // 사용자 길드 정보 가져오기
        const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        });
        
        const guilds = guildsResponse.data;
        
        // 데이터베이스에 사용자 정보 저장 또는 업데이트
        const user = await User.findOneAndUpdate(
            { discordId: userData.id },
            {
                username: userData.username,
                discriminator: userData.discriminator,
                avatar: userData.avatar,
                email: userData.email,
                accessToken: access_token,
                refreshToken: refresh_token,
                tokenExpiry: new Date(Date.now() + expires_in * 1000),
                guilds: guilds.map(guild => ({
                    id: guild.id,
                    name: guild.name,
                    icon: guild.icon,
                    owner: guild.owner,
                    permissions: guild.permissions
                }))
            },
            { upsert: true, new: true }
        );
        
        await user.updateLogin();
        
        // 세션에 사용자 정보 저장
        req.session.user = {
            id: user.discordId,
            username: user.username,
            avatar: user.avatar,
            guilds: user.guilds
        };
        
        logger.info(`사용자 로그인: ${user.username}#${user.discriminator}`);
        
        // 대시보드로 리다이렉트
        res.redirect('/dashboard');
        
    } catch (error) {
        logger.error('OAuth 콜백 오류:', error);
        res.status(500).send('로그인 중 오류가 발생했습니다.');
    }
});

// 로그아웃
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

module.exports = router;
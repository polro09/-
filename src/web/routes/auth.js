// src/web/routes/auth.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { config } = require('../../config/config');
const User = require('../../models/User');
const logger = require('../../utils/logger');

// OAuth URL 생성
router.get('/discord', (req, res) => {
    try {
        const state = Math.random().toString(36).substring(7);
        
        // 세션이 없으면 생성
        if (!req.session) {
            logger.error('세션이 초기화되지 않았습니다', 'auth');
            return res.status(500).send('세션 오류가 발생했습니다.');
        }
        
        req.session.state = state;
        
        // 세션 저장 보장
        req.session.save((err) => {
            if (err) {
                logger.error(`세션 저장 오류: ${err.message}`, 'auth');
                return res.status(500).send('세션 오류가 발생했습니다.');
            }
            
            const params = new URLSearchParams({
                client_id: config.clientId,
                redirect_uri: config.redirectUri,
                response_type: 'code',
                scope: 'identify email guilds',
                state: state
            });
            
            const authUrl = `https://discord.com/api/oauth2/authorize?${params}`;
            logger.auth(`OAuth URL 생성 - State: ${state}`, 'info');
            
            res.redirect(authUrl);
        });
    } catch (error) {
        logger.error(`OAuth URL 생성 오류: ${error.message}`, 'auth');
        res.status(500).send('인증 URL 생성 중 오류가 발생했습니다.');
    }
});

// OAuth 콜백
router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;
    
    // Discord에서 오류 반환 시
    if (error) {
        logger.error('Discord OAuth 오류:', error);
        return res.status(400).send(`Discord 인증 오류: ${error}`);
    }
    
    // 코드가 없는 경우
    if (!code) {
        logger.error('인증 코드가 없습니다');
        return res.status(400).send('인증 코드가 없습니다.');
    }
    
    // State 검증
    const sessionState = req.session.state;
    logger.info(`State 검증 - 세션: ${sessionState}, 쿼리: ${state}`);
    
    if (!state || !sessionState || state !== sessionState) {
        logger.error('State 불일치 또는 세션 만료');
        return res.status(400).send('세션이 만료되었거나 잘못된 요청입니다. 다시 시도해주세요.');
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
        
        // 개발자 또는 최초 사용자에게 owner 권한 부여
        if (!user.dashboardRole || user.dashboardRole === 'guest') {
            const { config } = require('../../config/config');
            if (config.developers.includes(userData.id)) {
                user.dashboardRole = 'owner';
                await user.save();
                logger.auth(`개발자 권한 부여: ${userData.username} (${userData.id})`, 'permission');
            } else {
                // 최초 사용자인 경우 owner 권한 부여
                const userCount = await User.countDocuments();
                if (userCount === 1) {
                    user.dashboardRole = 'owner';
                    await user.save();
                    logger.auth(`최초 사용자 owner 권한 부여: ${userData.username}`, 'permission');
                }
            }
        }
        
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
// src/web/routes/auth.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { config } = require('../../config/config');
const User = require('../../models/User');
const logger = require('../../utils/logger');

// OAuth URL 생성
router.get('/discord', async (req, res) => {
    try {
        // 디버깅: 현재 세션 상태 확인
        logger.debug(`Discord 로그인 시작 - 세션 ID: ${req.sessionID}`, 'auth');
        logger.debug(`현재 세션 데이터: ${JSON.stringify(req.session)}`, 'auth');
        
        const state = Math.random().toString(36).substring(7);
        
        // 세션이 없으면 생성
        if (!req.session) {
            logger.error('세션이 초기화되지 않았습니다', 'auth');
            return res.status(500).send('세션 오류가 발생했습니다.');
        }
        
        req.session.state = state;
        req.session.timestamp = Date.now(); // 디버깅용 타임스탬프 추가
        
        // 세션 저장을 Promise로 처리
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    logger.error(`세션 저장 오류: ${err.message}`, 'auth');
                    reject(err);
                } else {
                    logger.auth(`세션 state 저장 완료: ${state}, 세션 ID: ${req.sessionID}`, 'info');
                    logger.debug(`저장된 세션 데이터: ${JSON.stringify(req.session)}`, 'auth');
                    resolve();
                }
            });
        });
        
        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            response_type: 'code',
            scope: 'identify email guilds',
            state: state
        });
        
        const authUrl = `https://discord.com/api/oauth2/authorize?${params}`;
        logger.auth(`OAuth URL 생성 - State: ${state}, Redirect URI: ${config.redirectUri}`, 'info');
        
        res.redirect(authUrl);
    } catch (error) {
        logger.error(`OAuth URL 생성 오류: ${error.message}`, 'auth');
        res.status(500).send('인증 URL 생성 중 오류가 발생했습니다.');
    }
});

// OAuth 콜백
router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;
    
    // 디버깅: 콜백 시작
    logger.debug(`콜백 시작 - 세션 ID: ${req.sessionID}`, 'auth');
    logger.debug(`콜백 쿼리 파라미터: code=${code}, state=${state}, error=${error}`, 'auth');
    logger.debug(`현재 세션 데이터: ${JSON.stringify(req.session)}`, 'auth');
    
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
    
    // 세션 state 확인 전 세션 다시 로드
    await new Promise((resolve) => {
        req.session.reload((err) => {
            if (err) {
                logger.error('세션 리로드 실패:', err);
            } else {
                logger.debug(`세션 리로드 후: ${JSON.stringify(req.session)}`, 'auth');
            }
            resolve();
        });
    });
    
    // State 검증
    const sessionState = req.session.state;
    logger.info(`State 검증 - 세션: ${sessionState}, 쿼리: ${state}`);
    logger.debug(`세션 타임스탬프: ${req.session.timestamp}`, 'auth');
    
    // State가 없는 경우 더 자세한 디버깅
    if (!sessionState) {
        logger.error('세션에 state가 없습니다. 전체 세션:', JSON.stringify(req.session));
        logger.error(`세션 쿠키 확인: ${JSON.stringify(req.headers.cookie)}`, 'auth');
    }
    
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
        let user;
        try {
            user = await User.findOneAndUpdate(
                { discordId: userData.id },
                {
                    username: userData.username,
                    discriminator: userData.discriminator || '0',
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
        } catch (dbError) {
            logger.error('사용자 정보 저장 실패:', dbError);
            // DB 오류가 있어도 세션은 생성
            user = {
                discordId: userData.id,
                username: userData.username,
                avatar: userData.avatar,
                guilds: guilds
            };
        }
        
        // 세션에 사용자 정보 저장
        req.session.user = {
            id: userData.id,
            username: userData.username,
            avatar: userData.avatar,
            guilds: guilds
        };
        
        // 세션 저장 확인
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    logger.error('세션 저장 실패:', err);
                    reject(err);
                } else {
                    logger.auth('사용자 세션 저장 완료', 'info');
                    resolve();
                }
            });
        });
        
        logger.info(`사용자 로그인: ${userData.username}`);
        
        // 대시보드로 리다이렉트
        res.redirect('/dashboard');
        
    } catch (error) {
        logger.error('OAuth 콜백 오류:', error.response?.data || error.message);
        
        if (error.response?.status === 401) {
            res.status(401).send('Discord 인증 실패. Client Secret을 확인하세요.');
        } else {
            res.status(500).send('로그인 중 오류가 발생했습니다.');
        }
    }
});

// 로그아웃
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            logger.error('세션 삭제 실패:', err);
        }
        res.redirect('/');
    });
});

module.exports = router;
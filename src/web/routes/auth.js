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
        const state = Math.random().toString(36).substring(7);
        
        // 세션이 없으면 생성
        if (!req.session) {
            logger.error('세션이 초기화되지 않았습니다', 'auth');
            return res.status(500).send('세션 오류가 발생했습니다.');
        }
        
        req.session.oauth_state = state; // 키 이름을 명확하게 변경
        req.session.oauth_timestamp = Date.now();
        
        // 세션 저장을 Promise로 처리
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    logger.error(`세션 저장 오류: ${err.message}`, 'auth');
                    reject(err);
                } else {
                    logger.info(`OAuth 시작 - State: ${state}`, 'auth');
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
        res.redirect(authUrl);
    } catch (error) {
        logger.error(`OAuth URL 생성 오류: ${error.message}`, 'auth');
        res.status(500).send('인증 URL 생성 중 오류가 발생했습니다.');
    }
});

// OAuth 콜백
router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;
    
    logger.info(`OAuth 콜백 수신 - State: ${state || '없음'}`, 'auth');
    
    // Discord에서 오류 반환 시
    if (error) {
        logger.error(`Discord OAuth 오류: ${error}`, 'auth');
        return res.status(400).send(`Discord 인증 오류: ${error}`);
    }
    
    // 코드가 없는 경우
    if (!code) {
        logger.error('인증 코드가 없습니다', 'auth');
        return res.status(400).send('인증 코드가 없습니다.');
    }
    
    // State 검증
    const sessionState = req.session.oauth_state;
    
    // State가 없는 경우 더 자세한 디버깅
    if (!sessionState) {
        logger.error(`세션에 state가 없습니다. 세션 ID: ${req.sessionID}`, 'auth');
        
        // State 검증을 임시로 스킵 (개발 환경에서만)
        if (process.env.NODE_ENV === 'development') {
            logger.warn('개발 환경: State 검증을 스킵합니다', 'auth');
        } else {
            return res.status(400).send('세션이 만료되었거나 잘못된 요청입니다. 다시 시도해주세요.');
        }
    } else if (state !== sessionState) {
        logger.error(`State 불일치 - 세션: ${sessionState}, 쿼리: ${state}`, 'auth');
        return res.status(400).send('잘못된 인증 요청입니다. 다시 시도해주세요.');
    }
    
    // State 삭제
    delete req.session.oauth_state;
    delete req.session.oauth_timestamp;
    
    try {
        // 액세스 토큰 획득
        logger.info('Discord 토큰 요청 중...', 'auth');
        
        const tokenData = {
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: config.redirectUri
        };
        
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams(tokenData), 
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
        logger.info(`사용자 정보 획득: ${userData.username}#${userData.discriminator}`, 'auth');
        
        // 사용자 길드 정보 가져오기
        const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        });
        
        const guilds = guildsResponse.data;
        logger.debug(`${guilds.length}개의 길드 정보 획득`, 'auth');
        
        // 로그에는 관리 권한이 있는 서버만 표시
        const adminGuilds = guilds.filter(guild => {
            const permissions = BigInt(guild.permissions);
            return (permissions & BigInt(0x8)) === BigInt(0x8);
        });
        logger.info(`관리 권한이 있는 서버: ${adminGuilds.map(g => g.name).slice(0, 5).join(', ')}${adminGuilds.length > 5 ? ` 외 ${adminGuilds.length - 5}개` : ''}`, 'auth');
        
        // 데이터베이스에 사용자 정보 저장 또는 업데이트
        let user;
        let dashboardRole = 'guest'; // 기본 권한
        
        try {
            const mongoose = require('mongoose');
            if (mongoose.connection.readyState === 1) {
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
                        logger.auth(`개발자 권한 부여: ${userData.username} (${userData.id})`);
                    } else {
                        // 최초 사용자인 경우 owner 권한 부여
                        const userCount = await User.countDocuments();
                        if (userCount === 1) {
                            user.dashboardRole = 'owner';
                            await user.save();
                            logger.auth(`최초 사용자 owner 권한 부여: ${userData.username}`);
                        }
                    }
                }
                
                dashboardRole = user.dashboardRole || 'guest';
                await user.updateLogin();
            } else {
                logger.warn('MongoDB 연결 없음 - 사용자 정보를 저장하지 않습니다', 'auth');
            }
        } catch (dbError) {
            logger.error(`사용자 정보 저장 실패: ${dbError.message}`, 'auth');
        }
        
        // 세션에 사용자 정보 저장 (필요한 정보만 간단히)
        req.session.user = {
            id: userData.id,
            username: userData.username,
            avatar: userData.avatar,
            email: userData.email,
            guilds: guilds.map(guild => ({
                id: guild.id,
                name: guild.name,
                icon: guild.icon,
                owner: guild.owner,
                permissions: guild.permissions
            })).slice(0, 10), // 최대 10개 서버만 저장
            dashboardRole: dashboardRole,
            guildCount: guilds.length // 전체 서버 수는 별도로 저장
        };
        
        // 세션 저장 확인
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    logger.error(`세션 저장 실패: ${err.message}`, 'auth');
                    reject(err);
                } else {
                    logger.auth('사용자 세션 저장 완료', 'info');
                    logger.debug(`저장된 사용자 정보: ${userData.username} (${userData.id}), 서버 수: ${guilds.length}`, 'auth');
                    resolve();
                }
            });
        });
        
        logger.success(`사용자 로그인 성공: ${userData.username}`, 'auth');
        
        // 대시보드로 리다이렉트
        res.redirect('/dashboard');
        
    } catch (error) {
        logger.error(`OAuth 콜백 오류: ${error.message}`, 'auth');
        
        if (error.response) {
            logger.error(`Discord API 응답: ${JSON.stringify(error.response.data)}`, 'auth');
            
            if (error.response.status === 401) {
                res.status(401).send('Discord 인증 실패. Client ID와 Client Secret을 확인하세요.');
            } else if (error.response.status === 400) {
                res.status(400).send('잘못된 인증 요청입니다. 다시 시도해주세요.');
            } else {
                res.status(500).send('Discord 서버 오류가 발생했습니다.');
            }
        } else {
            res.status(500).send('로그인 중 오류가 발생했습니다.');
        }
    }
});

// 로그아웃
router.get('/logout', (req, res) => {
    const username = req.session.user?.username;
    
    req.session.destroy((err) => {
        if (err) {
            logger.error(`세션 삭제 실패: ${err.message}`, 'auth');
        } else {
            logger.auth(`사용자 로그아웃: ${username || '알 수 없음'}`, 'info');
        }
        res.redirect('/');
    });
});

// 세션 확인 (디버깅용)
router.get('/check', (req, res) => {
    res.json({
        sessionId: req.sessionID,
        session: req.session,
        user: req.session.user || null
    });
});

module.exports = router;
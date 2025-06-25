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
        
        req.session.oauth_state = state;
        req.session.oauth_timestamp = Date.now();
        
        // 리턴 URL 저장 (어디에서 왔는지 기억)
        const returnUrl = req.query.returnUrl || req.header('Referer') || '/dashboard';
        req.session.returnUrl = returnUrl;
        
        logger.info(`OAuth 시작 - State: ${state}, Return URL: ${returnUrl}`, 'auth');
        
        // 세션 저장을 Promise로 처리
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    logger.error(`세션 저장 오류: ${err.message}`, 'auth');
                    reject(err);
                } else {
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
    
    // 리턴 URL 가져오기
    const returnUrl = req.session.returnUrl || '/dashboard';
    
    // State와 returnUrl 삭제
    delete req.session.oauth_state;
    delete req.session.oauth_timestamp;
    delete req.session.returnUrl;
    
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
        
        // MongoDB 연결 확인 및 사용자 정보 업데이트
        const mongoose = require('mongoose');
        let dbUser = null;
        let dashboardRole = 'member';
        
        if (mongoose.connection.readyState === 1) {
            try {
                dbUser = await User.findOne({ discordId: userData.id });
                
                if (!dbUser) {
                    // 첫 사용자는 owner
                    const userCount = await User.countDocuments();
                    if (userCount === 0) {
                        dashboardRole = 'owner';
                    } else if (config.developers && config.developers.includes(userData.id)) {
                        // 개발자는 admin
                        dashboardRole = 'admin';
                    }
                    
                    dbUser = new User({
                        discordId: userData.id,
                        username: userData.username,
                        discriminator: userData.discriminator || '0',
                        avatar: userData.avatar,
                        email: userData.email,
                        dashboardRole: dashboardRole,
                        guilds: guilds.map(guild => ({
                            id: guild.id,
                            name: guild.name,
                            icon: guild.icon,
                            owner: guild.owner,
                            permissions: guild.permissions.toString() // BigInt를 String으로
                        })).slice(0, 10) // 최대 10개만 저장
                    });
                    
                    await dbUser.save();
                    logger.success(`새 사용자 등록: ${userData.username} (역할: ${dashboardRole})`, 'auth');
                } else {
                    // 기존 사용자 정보 업데이트
                    dbUser.username = userData.username;
                    dbUser.discriminator = userData.discriminator || '0';
                    dbUser.avatar = userData.avatar;
                    dbUser.email = userData.email;
                    dbUser.guilds = guilds.map(guild => ({
                        id: guild.id,
                        name: guild.name,
                        icon: guild.icon,
                        owner: guild.owner,
                        permissions: guild.permissions.toString() // BigInt를 String으로
                    })).slice(0, 10);
                    
                    await dbUser.updateLogin(); // 로그인 시간 업데이트
                    dashboardRole = dbUser.dashboardRole;
                    logger.info(`사용자 정보 업데이트: ${userData.username} (역할: ${dashboardRole})`, 'auth');
                }
            } catch (dbError) {
                logger.error(`사용자 DB 작업 오류: ${dbError.message}`, 'auth');
                // DB 오류가 있어도 세션은 계속 진행
            }
        } else {
            logger.warn('MongoDB 연결이 없어 세션에만 사용자 정보를 저장합니다', 'auth');
        }
        
        // 세션에 사용자 정보 저장
        req.session.user = {
            id: userData.id,
            username: userData.username,
            discriminator: userData.discriminator,
            avatar: userData.avatar,
            email: userData.email,
            nickname: dbUser?.nickname || userData.username,
            gameStats: dbUser?.gameStats || {
                wins: 0,
                losses: 0,
                totalKills: 0,
                totalDeaths: 0,
                avgKills: 0,
                rankedGames: 0,
                practiceGames: 0
            },
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresAt: Date.now() + (expires_in * 1000),
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
        
        logger.success(`사용자 로그인 성공: ${userData.username}, 리다이렉트: ${returnUrl}`, 'auth');
        
        // 원래 페이지로 리다이렉트
        res.redirect(returnUrl);
        
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
    const returnUrl = req.query.returnUrl || req.header('Referer') || '/';
    
    req.session.destroy((err) => {
        if (err) {
            logger.error(`세션 삭제 실패: ${err.message}`, 'auth');
        } else {
            logger.auth(`사용자 로그아웃: ${username || '알 수 없음'}`, 'info');
        }
        res.redirect(returnUrl);
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
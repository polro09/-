// src/web/routes/auth.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { config } = require('../../config/config');
const User = require('../../models/User');
const logger = require('../../utils/logger');
const RoleSync = require('../../utils/roleSync'); // 추가

// OAuth URL 생성
router.get('/discord', async (req, res) => {
    try {
        const state = Math.random().toString(36).substring(7);
        
        // 디버깅 정보
        logger.info(`OAuth 시작 - Host: ${req.get('host')}, Protocol: ${req.protocol}`, 'auth');
        logger.info(`Redirect URI: ${config.redirectUri}`, 'auth');
        
        // 세션이 없으면 생성
        if (!req.session) {
            logger.error('세션이 초기화되지 않았습니다', 'auth');
            return res.status(500).send('세션 오류가 발생했습니다.');
        }
        
        req.session.oauth_state = state;
        req.session.oauth_timestamp = Date.now();
        
        // 리턴 URL 저장 (어디에서 왔는지 기억) - 도메인 처리
        let returnUrl = req.query.returnUrl || req.header('Referer') || '/dashboard';
        
        // Referer가 있고 같은 도메인인 경우만 사용
        if (req.header('Referer')) {
            try {
                const refererUrl = new URL(req.header('Referer'));
                const currentHost = req.get('host');
                // 같은 호스트인 경우만 Referer 사용
                if (refererUrl.host === currentHost || (config.isProduction && refererUrl.host === 'aimdot.dev')) {
                    returnUrl = refererUrl.pathname + refererUrl.search;
                }
            } catch (e) {
                // URL 파싱 실패 시 기본값 사용
            }
        }
        
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
        
        logger.info(`Discord로 리디렉션: ${authUrl}`, 'auth');
        
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
    const sessionState = req.session?.oauth_state;
    
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
    
    // 리턴 URL 가져오기 - 도메인 포함 처리
    let returnUrl = req.session?.returnUrl || '/dashboard';
    
    // 상대 경로인 경우 도메인 추가 (간단한 방법)
    if (returnUrl.startsWith('/')) {
        // aimdot.dev로 접속한 경우 항상 https://aimdot.dev 사용
        if (req.get('host').includes('aimdot.dev')) {
            returnUrl = 'https://aimdot.dev' + returnUrl;
        } else {
            returnUrl = `${req.protocol}://${req.get('host')}${returnUrl}`;
        }
    }
    
    // State와 returnUrl 삭제
    if (req.session) {
        delete req.session.oauth_state;
        delete req.session.oauth_timestamp;
        delete req.session.returnUrl;
    }
    
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
        logger.info(`관리 권한이 있는 서버: ${adminGuilds.map(g => g.name).slice(0, 5).join(', ')}${adminGuilds.length > 5 ? ' 외 ' + (adminGuilds.length - 5) + '개' : ''}`, 'auth');
        
        // 역할 동기화 수행 (추가된 부분)
        let dashboardRole = 'guest'; // 기본값
        let autoRoleSyncResult = null;
        
        // req.client가 있을 때만 역할 동기화 수행
        if (req.client) {
            const roleSync = new RoleSync(req.client);
            const syncResult = await roleSync.syncUserRole(userData.id);
            dashboardRole = syncResult.role || 'guest';
            autoRoleSyncResult = syncResult;
            
            if (syncResult.updated || syncResult.isNew) {
                logger.auth(`Discord 역할 동기화 완료: ${userData.username} → ${dashboardRole}`, 'info');
            }
        } else {
            logger.warn('Discord 클라이언트가 없어 역할 동기화를 건너뜁니다', 'auth');
        }
        
        // 사용자 정보 DB에 저장/업데이트
        let user = await User.findOne({ discordId: userData.id });
        
        if (!user) {
            // 신규 사용자
            user = new User({
                discordId: userData.id,
                username: userData.username,
                discriminator: userData.discriminator,
                avatar: userData.avatar,
                email: userData.email,
                dashboardRole: dashboardRole, // 동기화된 역할 사용
                createdAt: new Date(),
                updatedAt: new Date()
            });
            await user.save();
            logger.info(`신규 사용자 등록: ${userData.username} (권한: ${dashboardRole})`, 'auth');
        } else {
            // 기존 사용자 업데이트
            user.username = userData.username;
            user.discriminator = userData.discriminator;
            user.avatar = userData.avatar;
            user.email = userData.email;
            user.updatedAt = new Date();
            
            // 역할 동기화가 수행되었고 업데이트가 필요한 경우만 변경
            if (autoRoleSyncResult && autoRoleSyncResult.updated) {
                user.dashboardRole = dashboardRole;
                logger.info(`기존 사용자 권한 업데이트: ${userData.username} → ${dashboardRole}`, 'auth');
            } else {
                dashboardRole = user.dashboardRole || 'guest';
            }
            
            await user.save();
            logger.info(`기존 사용자 정보 업데이트: ${userData.username}`, 'auth');
        }
        
        // 세션에 사용자 정보 저장
        req.session.user = {
            id: userData.id,
            username: userData.username,
            discriminator: userData.discriminator,
            avatar: userData.avatar,
            email: userData.email,
            nickname: user.nickname || userData.username,
            gameStats: user.gameStats || {
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
            guildCount: guilds.length, // 전체 서버 수는 별도로 저장
            autoRoleSync: autoRoleSyncResult // 자동 역할 동기화 결과 저장
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
        
        // 원래 페이지로 리다이렉트 - 도메인 강제 적용
        let finalRedirectUrl = returnUrl;
        
        // aimdot.dev로 접속한 경우 처리
        const originalHost = req.get('host');
        if (originalHost && originalHost.includes('aimdot.dev')) {
            if (finalRedirectUrl.startsWith('/')) {
                finalRedirectUrl = 'https://aimdot.dev' + finalRedirectUrl;
            } else if (finalRedirectUrl.includes('localhost')) {
                // localhost URL을 aimdot.dev로 변경
                finalRedirectUrl = finalRedirectUrl.replace(/https?:\/\/localhost:\d+/, 'https://aimdot.dev');
            }
        }
        
        logger.info(`최종 리디렉션 URL: ${finalRedirectUrl}`, 'auth');
        res.redirect(finalRedirectUrl);
        
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
    const username = req.session?.user?.username;
    let returnUrl = req.query.returnUrl || req.header('Referer') || '/';
    
    // 상대 경로인 경우 도메인 추가
    if (returnUrl.startsWith('/')) {
        const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        const host = req.get('host');
        const domain = config.isProduction ? 'https://aimdot.dev' : `${protocol}://${host}`;
        returnUrl = domain + returnUrl;
    }
    
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
        user: req.session?.user || null,
        redirectUri: config.redirectUri,
        environment: process.env.NODE_ENV || 'development'
    });
});

module.exports = router;
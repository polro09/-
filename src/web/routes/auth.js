// 1. src/web/routes/auth.js - 세션 만료 문제 해결

const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../../models/User');
const logger = require('../../utils/logger');

// config 모듈을 안전하게 로드
let config;
try {
    config = require('../../config/config').config || require('../../config/config');
} catch (error) {
    console.log('⚠️  config 모듈 없음 - 환경변수 사용');
    config = {
        clientId: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        redirectUri: process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/auth/callback',
        websiteUrl: process.env.WEBSITE_URL || 'http://localhost:3000'
    };
}

// 인증 상태 확인 API (추가)
router.get('/check', (req, res) => {
    try {
        if (req.session && req.session.user) {
            res.json({
                success: true,
                user: req.session.user,
                authenticated: true
            });
        } else {
            res.json({
                success: false,
                user: null,
                authenticated: false
            });
        }
    } catch (error) {
        logger.error(`인증 상태 확인 오류: ${error.message}`);
        res.status(500).json({
            success: false,
            error: '인증 상태를 확인할 수 없습니다.'
        });
    }
});

// Discord OAuth 시작 (세션 문제 해결)
router.get('/discord', async (req, res) => {
    try {
        const state = Math.random().toString(36).substring(7);
        
        logger.server(`OAuth 시작 - Host: ${req.get('host')}, Protocol: ${req.protocol}`);
        
        // 세션이 없으면 에러
        if (!req.session) {
            logger.error('세션이 초기화되지 않았습니다');
            return res.status(500).send(`
                <html>
                <head><title>세션 오류</title><meta charset="utf-8"></head>
                <body style="font-family: Arial; text-align: center; margin-top: 100px; background: #0a0a0a; color: #fff;">
                    <h1 style="color: #e74c3c;">⚠️ 세션 오류</h1>
                    <p>세션이 초기화되지 않았습니다.</p>
                    <p>브라우저를 새로고침하고 다시 시도해주세요.</p>
                    <a href="/" style="color: #2196f3;">← 메인 페이지로 돌아가기</a>
                    <script>
                        // 3초 후 자동으로 메인 페이지로 이동
                        setTimeout(() => {
                            window.location.href = '/';
                        }, 3000);
                    </script>
                </body>
                </html>
            `);
        }
        
        // State 및 리턴 URL 저장 (개선된 방법)
        req.session.oauth_state = state;
        req.session.oauth_timestamp = Date.now();
        
        // 리턴 URL 처리
        let returnUrl = req.query.returnUrl || '/';
        
        // Referer 기반 URL 결정
        if (req.header('Referer') && !req.query.returnUrl) {
            try {
                const refererUrl = new URL(req.header('Referer'));
                const currentHost = req.get('host');
                if (refererUrl.host === currentHost) {
                    returnUrl = refererUrl.pathname + refererUrl.search;
                }
            } catch (e) {
                // URL 파싱 실패 시 기본값 사용
            }
        }
        
        req.session.returnUrl = returnUrl;
        
        logger.server(`OAuth 시작 - State: ${state}, Return URL: ${returnUrl}`);
        
        // 세션 저장 확인 (강화된 버전)
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    logger.error(`세션 저장 오류: ${err.message}`);
                    reject(err);
                } else {
                    logger.server('OAuth 세션 저장 완료');
                    resolve();
                }
            });
        });
        
        // Discord OAuth URL 생성
        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            response_type: 'code',
            scope: 'identify email guilds',
            state: state
        });
        
        const authUrl = `https://discord.com/api/oauth2/authorize?${params}`;
        
        logger.server(`Discord로 리디렉션: ${authUrl}`);
        res.redirect(authUrl);
        
    } catch (error) {
        logger.error(`OAuth URL 생성 오류: ${error.message}`);
        res.status(500).send(`
            <html>
            <head><title>인증 오류</title><meta charset="utf-8"></head>
            <body style="font-family: Arial; text-align: center; margin-top: 100px; background: #0a0a0a; color: #fff;">
                <h1 style="color: #e74c3c;">🚨 인증 오류</h1>
                <p>Discord 인증을 시작할 수 없습니다.</p>
                <p>오류: ${error.message}</p>
                <a href="/" style="color: #2196f3;">← 메인 페이지로 돌아가기</a>
            </body>
            </html>
        `);
    }
});

// OAuth 콜백 처리 (세션 문제 해결)
router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;
    
    logger.server(`OAuth 콜백 수신 - State: ${state || '없음'}`);
    
    // Discord 오류 처리
    if (error) {
        logger.error(`Discord OAuth 오류: ${error}`);
        return res.status(400).send(`
            <html>
            <head><title>Discord 인증 오류</title><meta charset="utf-8"></head>
            <body style="font-family: Arial; text-align: center; margin-top: 100px; background: #0a0a0a; color: #fff;">
                <h1 style="color: #e74c3c;">❌ Discord 인증 오류</h1>
                <p>Discord에서 인증을 거부했습니다.</p>
                <p>오류: ${error}</p>
                <a href="/" style="color: #2196f3;">← 메인 페이지로 돌아가기</a>
            </body>
            </html>
        `);
    }
    
    // 코드 확인
    if (!code) {
        logger.error('인증 코드가 없습니다');
        return res.status(400).send(`
            <html>
            <head><title>인증 코드 오류</title><meta charset="utf-8"></head>
            <body style="font-family: Arial; text-align: center; margin-top: 100px; background: #0a0a0a; color: #fff;">
                <h1 style="color: #e74c3c;">❌ 인증 코드 오류</h1>
                <p>Discord에서 인증 코드를 받지 못했습니다.</p>
                <a href="/auth/discord" style="color: #2196f3;">다시 로그인 시도</a>
            </body>
            </html>
        `);
    }
    
    // State 검증 (완화된 버전)
    const sessionState = req.session?.oauth_state;
    
    if (!sessionState) {
        logger.error(`세션에 state가 없습니다. 세션 ID: ${req.sessionID || 'N/A'}`);
        
        // 개발 환경에서는 경고만 하고 계속 진행
        if (process.env.NODE_ENV !== 'production') {
            logger.warn('개발 환경: State 검증을 스킵하고 계속 진행합니다');
        } else {
            // 프로덕션에서는 새로 로그인 시도
            return res.redirect('/auth/discord');
        }
    } else if (state !== sessionState) {
        logger.error(`State 불일치 - 세션: ${sessionState}, 쿼리: ${state}`);
        
        // 개발 환경에서는 경고만 하고 계속 진행
        if (process.env.NODE_ENV !== 'production') {
            logger.warn('개발 환경: State 불일치를 무시하고 계속 진행합니다');
        } else {
            return res.redirect('/auth/discord');
        }
    }
    
    // 리턴 URL 가져오기
    let returnUrl = req.session?.returnUrl || '/';
    
    try {
        // Discord 토큰 교환
        logger.server('Discord 토큰 요청 중...');
        
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
                },
                timeout: 10000 // 10초 타임아웃
            }
        );
        
        const { access_token } = tokenResponse.data;
        
        // 사용자 정보 가져오기
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${access_token}`
            },
            timeout: 10000
        });
        
        const userData = userResponse.data;
        logger.server(`사용자 정보 획득: ${userData.username}#${userData.discriminator || '0000'}`);
        
        // 길드 정보 가져오기 (선택적)
        let guilds = [];
        try {
            const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
                headers: {
                    Authorization: `Bearer ${access_token}`
                },
                timeout: 10000
            });
            guilds = guildsResponse.data || [];
        } catch (guildError) {
            logger.warn(`길드 정보 가져오기 실패: ${guildError.message}`);
        }
        
        // 데이터베이스에 사용자 저장/업데이트 (선택적)
        let dashboardRole = 'member';
        try {
            let user = await User.findOne({ discordId: userData.id });
            if (!user) {
                user = new User({
                    discordId: userData.id,
                    username: userData.username,
                    discriminator: userData.discriminator || '0000',
                    avatar: userData.avatar,
                    email: userData.email,
                    dashboardRole: 'member'
                });
                await user.save();
                logger.server(`새 사용자 생성: ${userData.username}`);
            } else {
                // 기존 사용자 정보 업데이트
                user.username = userData.username;
                user.discriminator = userData.discriminator || '0000';
                user.avatar = userData.avatar;
                user.email = userData.email;
                user.lastLogin = new Date();
                await user.save();
                logger.server(`사용자 정보 업데이트: ${userData.username}`);
            }
            dashboardRole = user.dashboardRole;
        } catch (dbError) {
            logger.warn(`데이터베이스 저장 실패: ${dbError.message} - 세션만 사용`);
        }
        
        // 세션에 사용자 정보 저장
        req.session.user = {
            id: userData.id,
            username: userData.username,
            discriminator: userData.discriminator || '0000',
            avatar: userData.avatar,
            email: userData.email,
            dashboardRole: dashboardRole,
            guilds: guilds.slice(0, 10) // 최대 10개만 저장
        };
        
        // 세션 저장 확인
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    logger.error(`세션 저장 실패: ${err.message}`);
                    reject(err);
                } else {
                    logger.server('사용자 세션 저장 완료');
                    resolve();
                }
            });
        });
        
        // OAuth 정보 정리
        delete req.session.oauth_state;
        delete req.session.oauth_timestamp;
        delete req.session.returnUrl;
        
        logger.server(`사용자 로그인 성공: ${userData.username}, 리다이렉트: ${returnUrl}`);
        
        // 성공 페이지를 표시한 후 리디렉션
        res.send(`
            <html>
            <head>
                <title>로그인 성공</title>
                <meta charset="utf-8">
                <meta http-equiv="refresh" content="2;url=${returnUrl}">
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        margin-top: 100px;
                        background: #0a0a0a;
                        color: #ffffff;
                    }
                    .success-container { 
                        max-width: 600px; 
                        margin: 0 auto;
                        background: #1a1a1a;
                        padding: 40px;
                        border-radius: 10px;
                        border: 1px solid rgba(33, 150, 243, 0.3);
                    }
                    h1 { color: #4caf50; }
                    .spinner {
                        border: 4px solid #1a1a1a;
                        border-top: 4px solid #2196f3;
                        border-radius: 50%;
                        width: 40px;
                        height: 40px;
                        animation: spin 1s linear infinite;
                        margin: 20px auto;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            </head>
            <body>
                <div class="success-container">
                    <h1>✅ 로그인 성공!</h1>
                    <p>환영합니다, ${userData.username}님!</p>
                    <div class="spinner"></div>
                    <p>잠시 후 페이지로 이동합니다...</p>
                    <a href="${returnUrl}" style="color: #2196f3;">즉시 이동하기</a>
                </div>
            </body>
            </html>
        `);
        
    } catch (error) {
        logger.error(`OAuth 콜백 오류: ${error.message}`);
        
        // 구체적인 오류 메시지 제공
        let errorMessage = '로그인 중 오류가 발생했습니다.';
        let errorDetail = error.message;
        
        if (error.response) {
            if (error.response.status === 401) {
                errorMessage = 'Discord 인증 실패';
                errorDetail = 'Client ID와 Client Secret을 확인하세요.';
            } else if (error.response.status === 400) {
                errorMessage = '잘못된 인증 요청';
                errorDetail = '인증 코드가 만료되었거나 잘못되었습니다.';
            } else if (error.response.status === 429) {
                errorMessage = '요청 한도 초과';
                errorDetail = '잠시 후 다시 시도해주세요.';
            }
        } else if (error.code === 'ECONNABORTED') {
            errorMessage = '네트워크 타임아웃';
            errorDetail = 'Discord 서버 연결이 지연되고 있습니다.';
        }
        
        res.status(500).send(`
            <html>
            <head><title>로그인 오류</title><meta charset="utf-8"></head>
            <body style="font-family: Arial; text-align: center; margin-top: 100px; background: #0a0a0a; color: #fff;">
                <div style="max-width: 600px; margin: 0 auto; background: #1a1a1a; padding: 40px; border-radius: 10px; border: 1px solid rgba(244, 67, 54, 0.3);">
                    <h1 style="color: #f44336;">🚨 ${errorMessage}</h1>
                    <p style="color: #999;">${errorDetail}</p>
                    <div style="margin: 20px 0; padding: 15px; background: #2a2a2a; border-radius: 5px; font-family: monospace; font-size: 12px; color: #666;">
                        ${process.env.NODE_ENV === 'development' ? error.stack : '개발자에게 문의하세요.'}
                    </div>
                    <a href="/auth/discord" style="color: #2196f3; margin-right: 20px;">다시 로그인</a>
                    <a href="/" style="color: #2196f3;">메인으로 돌아가기</a>
                </div>
            </body>
            </html>
        `);
    }
});

// 로그아웃
router.get('/logout', (req, res) => {
    const username = req.session?.user?.username;
    let returnUrl = req.query.returnUrl || '/';
    
    // 세션 삭제
    req.session.destroy((err) => {
        if (err) {
            logger.error(`로그아웃 오류: ${err.message}`);
            return res.status(500).send('로그아웃 중 오류가 발생했습니다.');
        }
        
        logger.server(`사용자 로그아웃: ${username || '알 수 없음'}`);
        
        // 로그아웃 성공 페이지
        res.send(`
            <html>
            <head>
                <title>로그아웃 완료</title>
                <meta charset="utf-8">
                <meta http-equiv="refresh" content="2;url=${returnUrl}">
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        margin-top: 100px;
                        background: #0a0a0a;
                        color: #ffffff;
                    }
                    .logout-container { 
                        max-width: 600px; 
                        margin: 0 auto;
                        background: #1a1a1a;
                        padding: 40px;
                        border-radius: 10px;
                        border: 1px solid rgba(255, 152, 0, 0.3);
                    }
                    h1 { color: #ff9800; }
                </style>
            </head>
            <body>
                <div class="logout-container">
                    <h1>👋 로그아웃 완료</h1>
                    <p>성공적으로 로그아웃되었습니다.</p>
                    <p>잠시 후 페이지로 이동합니다...</p>
                    <a href="${returnUrl}" style="color: #2196f3;">즉시 이동하기</a>
                </div>
            </body>
            </html>
        `);
    });
});

module.exports = router;
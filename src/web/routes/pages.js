// src/web/routes/pages.js
const express = require('express');
const router = express.Router();
const path = require('path');
const User = require('../../models/User');
const logger = require('../../utils/logger');

/**
 * 권한 레벨 값 매핑
 */
const roleValues = {
    guest: 0,
    member: 1,
    subadmin: 2,
    admin: 3,
    owner: 4
};

/**
 * 인증 및 권한 확인 미들웨어
 */
const checkAuth = (requiredRole = 'member') => {
    return async (req, res, next) => {
        // AJAX 요청 여부 확인
        const isAjax = req.xhr || req.headers.accept?.includes('application/json');
        
        // 로그인 확인
        if (!req.session || !req.session.user) {
            if (isAjax) {
                return res.status(401).json({ 
                    error: '로그인이 필요합니다.',
                    needAuth: true 
                });
            }
            return res.redirect(`/auth/discord?returnUrl=${encodeURIComponent(req.originalUrl)}`);
        }
        
        try {
            // 사용자 정보 조회
            const user = await User.findOne({ discordId: req.session.user.id });
            if (!user) {
                if (isAjax) {
                    return res.status(403).json({ 
                        error: '사용자를 찾을 수 없습니다.' 
                    });
                }
                return res.status(403).send('사용자를 찾을 수 없습니다.');
            }
            
            // 권한 확인
            const userRoleValue = roleValues[user.dashboardRole] || 0;
            const requiredRoleValue = roleValues[requiredRole] || 0;
            
            if (userRoleValue < requiredRoleValue) {
                logger.auth(`권한 부족: ${user.username} (${user.dashboardRole}) < ${requiredRole}`, 'permission');
                
                if (isAjax) {
                    return res.status(403).json({ 
                        error: '권한이 부족합니다.',
                        required: requiredRole,
                        current: user.dashboardRole
                    });
                }
                
                return res.status(403).send(`
                    <!DOCTYPE html>
                    <html lang="ko">
                    <head>
                        <meta charset="UTF-8">
                        <title>접근 거부 - Aimdot.dev</title>
                        <link rel="stylesheet" href="/css/common.css">
                        <style>
                            body {
                                background: #0a0a0a;
                                color: #ffffff;
                                display: flex;
                                justify-content: center;
                                align-items: center;
                                height: 100vh;
                                margin: 0;
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            }
                            .error-container {
                                text-align: center;
                                padding: 2rem;
                            }
                            .error-icon {
                                font-size: 4rem;
                                color: #f44336;
                                margin-bottom: 1rem;
                            }
                            .error-message {
                                font-size: 1.5rem;
                                margin-bottom: 1rem;
                            }
                            .error-detail {
                                color: #999;
                                margin-bottom: 2rem;
                            }
                            .back-button {
                                display: inline-block;
                                padding: 0.75rem 1.5rem;
                                background: #2196f3;
                                color: white;
                                text-decoration: none;
                                border-radius: 4px;
                                transition: background 0.3s;
                            }
                            .back-button:hover {
                                background: #1976d2;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="error-container">
                            <div class="error-icon">🚫</div>
                            <div class="error-message">접근 권한이 없습니다</div>
                            <div class="error-detail">
                                이 페이지에 접근하려면 ${requiredRole} 이상의 권한이 필요합니다.<br>
                                현재 권한: ${user.dashboardRole}
                            </div>
                            <a href="/" class="back-button">메인으로 돌아가기</a>
                        </div>
                    </body>
                    </html>
                `);
            }
            
            // 요청 객체에 사용자 정보 추가
            req.user = user;
            req.userRole = user.dashboardRole;
            next();
            
        } catch (error) {
            logger.error('권한 확인 오류:', error);
            
            if (isAjax) {
                return res.status(500).json({ 
                    error: '권한 확인 중 오류가 발생했습니다.' 
                });
            }
            
            res.status(500).send('권한 확인 중 오류가 발생했습니다.');
        }
    };
};

/**
 * 페이지 라우트 - EJS 템플릿 렌더링
 */

// 대시보드 페이지
router.get('/dashboard', checkAuth('member'), async (req, res) => {
    try {
        // 봇 클라이언트 가져오기
        const bot = req.app.locals.bot || req.client;
        
        // 초기 통계 데이터
        const stats = {
            guilds: bot?.guilds.cache.size || 0,
            users: bot?.users.cache.size || 0,
            channels: bot?.guilds.cache.reduce((acc, guild) => acc + guild.channels.cache.size, 0) || 0,
            commands: bot?.commands?.size || 0
        };
        
        // EJS 템플릿 렌더링
        res.render('pages/dashboard', {
            title: '대시보드 - Aimdot.dev',
            stats,
            user: req.session.user
        });
    } catch (error) {
        console.error('대시보드 렌더링 오류:', error);
        
        // EJS 파일이 없으면 기존 HTML 사용
        const htmlPath = path.join(__dirname, '../public', 'dashboard.html');
        if (require('fs').existsSync(htmlPath)) {
            res.sendFile(htmlPath);
        } else {
            res.status(500).send('페이지를 불러올 수 없습니다.');
        }
    }
});

// 파티 페이지 (로그인 불필요)
router.get('/party', async (req, res) => {
    try {
        res.render('pages/party', {
            title: '파티 - Aimdot.dev',
            user: req.session?.user || null
        });
    } catch (error) {
        // 아직 EJS 파일이 없으면 기존 HTML 사용
        res.sendFile(path.join(__dirname, '../public', 'party.html'));
    }
});

// 파티 생성 페이지
router.get('/party/create', async (req, res) => {
    try {
        res.render('pages/party-create', {
            title: '파티 생성 - Aimdot.dev',
            user: req.session?.user || null
        });
    } catch (error) {
        res.sendFile(path.join(__dirname, '../public', 'party-create.html'));
    }
});

// 파티 상세 페이지
router.get('/party/:partyId', async (req, res) => {
    try {
        res.render('pages/party-detail', {
            title: '파티 상세 - Aimdot.dev',
            partyId: req.params.partyId,
            user: req.session?.user || null
        });
    } catch (error) {
        res.sendFile(path.join(__dirname, '../public', 'party-detail.html'));
    }
});

// 권한 관리 페이지 (admin 이상)
router.get('/dashboard/permissions', checkAuth('admin'), async (req, res) => {
    try {
        res.render('pages/permissions', {
            title: '권한 관리 - Aimdot.dev',
            user: req.session.user
        });
    } catch (error) {
        res.sendFile(path.join(__dirname, '../public', 'permissions.html'));
    }
});

// 서버 관리 페이지 (subadmin 이상)
router.get('/dashboard/servers', checkAuth('subadmin'), async (req, res) => {
    try {
        res.render('pages/servers', {
            title: '서버 관리 - Aimdot.dev',
            user: req.session.user
        });
    } catch (error) {
        res.sendFile(path.join(__dirname, '../public', 'servers.html'));
    }
});

// DB 관리 페이지 (subadmin 이상)
router.get('/dashboard/db-management', checkAuth('subadmin'), async (req, res) => {
    try {
        res.render('pages/db-management', {
            title: 'DB 관리 - Aimdot.dev',
            user: req.session.user
        });
    } catch (error) {
        res.sendFile(path.join(__dirname, '../public', 'db-management.html'));
    }
});

// 404 페이지
router.get('*', (req, res) => {
    try {
        res.status(404).render('pages/404', {
            title: '페이지를 찾을 수 없습니다 - Aimdot.dev',
            user: req.session?.user || null
        });
    } catch (error) {
        res.status(404).send(`
            <!DOCTYPE html>
            <html lang="ko">
            <head>
                <meta charset="UTF-8">
                <title>404 - 페이지를 찾을 수 없습니다</title>
                <style>
                    body {
                        background: #0a0a0a;
                        color: #ffffff;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    }
                    .error-container {
                        text-align: center;
                    }
                    .error-code {
                        font-size: 6rem;
                        font-weight: bold;
                        color: #2196f3;
                        margin: 0;
                    }
                    .error-message {
                        font-size: 1.5rem;
                        margin: 1rem 0 2rem;
                    }
                    .home-link {
                        color: #2196f3;
                        text-decoration: none;
                        font-size: 1.1rem;
                    }
                    .home-link:hover {
                        text-decoration: underline;
                    }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <h1 class="error-code">404</h1>
                    <p class="error-message">페이지를 찾을 수 없습니다</p>
                    <a href="/" class="home-link">메인으로 돌아가기</a>
                </div>
            </body>
            </html>
        `);
    }
});

module.exports = router;
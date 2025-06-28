// src/middleware/permissions.js
const User = require('../models/User');
const MenuPermission = require('../models/MenuPermission');
const logger = require('../utils/logger');

// 권한 레벨 값 매핑
const roleValues = {
    guest: 0,
    member: 1,
    subadmin: 2,
    admin: 3,
    owner: 4
};

/**
 * 사용자 권한 확인 미들웨어
 * @param {string} requiredRole - 필요한 최소 권한
 */
const requireRole = (requiredRole) => {
    return async (req, res, next) => {
        try {
            // 로그인 확인
            if (!req.session.user) {
                return res.status(401).json({ 
                    error: '로그인이 필요합니다.',
                    redirect: '/auth/discord'
                });
            }
            
            // 사용자 조회
            const user = await User.findOne({ discordId: req.session.user.id });
            if (!user) {
                return res.status(403).json({ 
                    error: '사용자를 찾을 수 없습니다.' 
                });
            }
            
            // 권한 검증
            const userRoleValue = roleValues[user.dashboardRole] || 0;
            const requiredRoleValue = roleValues[requiredRole] || 0;
            
            if (userRoleValue < requiredRoleValue) {
                logger.auth(`권한 부족: ${user.username} (${user.dashboardRole}) < ${requiredRole}`, 'permission');
                return res.status(403).json({ 
                    error: '권한이 부족합니다.',
                    required: requiredRole,
                    current: user.dashboardRole
                });
            }
            
            // 요청 객체에 사용자 정보 추가
            req.user = user;
            req.userRole = user.dashboardRole;
            next();
        } catch (error) {
            logger.error('권한 확인 오류:', error);
            res.status(500).json({ 
                error: '권한 확인 중 오류가 발생했습니다.' 
            });
        }
    };
};

/**
 * 메뉴 접근 권한 확인 미들웨어
 * @param {string} menuId - 메뉴 ID
 */
const requireMenuAccess = (menuId) => {
    return async (req, res, next) => {
        try {
            // 로그인 확인
            if (!req.session.user) {
                return res.status(401).json({ 
                    error: '로그인이 필요합니다.',
                    redirect: '/auth/discord'
                });
            }
            
            // 사용자 조회
            const user = await User.findOne({ discordId: req.session.user.id });
            if (!user) {
                return res.status(403).json({ 
                    error: '사용자를 찾을 수 없습니다.' 
                });
            }
            
            // 메뉴 권한 조회
            const menuPermission = await MenuPermission.findOne({ menuId });
            if (!menuPermission) {
                // 메뉴 권한이 설정되지 않은 경우 기본적으로 member 권한 필요
                const userRoleValue = roleValues[user.dashboardRole] || 0;
                if (userRoleValue < roleValues.member) {
                    return res.status(403).json({ 
                        error: '메뉴에 접근할 권한이 없습니다.' 
                    });
                }
            } else {
                // 메뉴 권한 검증
                if (!menuPermission.canAccess(user.dashboardRole)) {
                    logger.auth(`메뉴 접근 거부: ${user.username} → ${menuId}`, 'permission');
                    return res.status(403).json({ 
                        error: '메뉴에 접근할 권한이 없습니다.',
                        required: menuPermission.minRole,
                        current: user.dashboardRole
                    });
                }
            }
            
            // 요청 객체에 정보 추가
            req.user = user;
            req.userRole = user.dashboardRole;
            req.menuPermission = menuPermission;
            next();
        } catch (error) {
            logger.error('메뉴 권한 확인 오류:', error);
            res.status(500).json({ 
                error: '권한 확인 중 오류가 발생했습니다.' 
            });
        }
    };
};

/**
 * 페이지 접근 권한 확인 미들웨어 (HTML 페이지용)
 */
const requirePageAccess = (menuId) => {
    return async (req, res, next) => {
        try {
            // 로그인 확인
            if (!req.session.user) {
                const currentUrl = req.originalUrl;
                return res.redirect(`/auth/discord?returnUrl=${encodeURIComponent(currentUrl)}`);
            }
            
            // 사용자 조회
            const user = await User.findOne({ discordId: req.session.user.id });
            if (!user) {
                return res.status(403).send('접근 권한이 없습니다.');
            }
            
            // 기본 권한 매핑 (MenuPermission이 없을 경우를 대비)
            const defaultMenuRoles = {
                'dashboard': 'member',
                'servers': 'subadmin',
                'db-management': 'subadmin',
                'permissions': 'admin',
                'system': 'admin'
            };
            
            // 메뉴 권한 조회
            const menuPermission = await MenuPermission.findOne({ menuId });
            let requiredRole = defaultMenuRoles[menuId] || 'member';
            
            if (menuPermission) {
                requiredRole = menuPermission.minRole;
            }
            
            // 권한 검증
            const userRoleValue = roleValues[user.dashboardRole] || 0;
            const requiredRoleValue = roleValues[requiredRole] || 0;
            
            if (userRoleValue < requiredRoleValue) {
                logger.auth(`페이지 접근 거부: ${user.username} → ${req.originalUrl}`, 'permission');
                return res.status(403).send(`
                    <!DOCTYPE html>
                    <html lang="ko">
                    <head>
                        <meta charset="UTF-8">
                        <title>접근 거부 - Aimdot.dev</title>
                        <style>
                            body {
                                background: #0D1117;
                                color: #F0F6FC;
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                                display: flex;
                                justify-content: center;
                                align-items: center;
                                height: 100vh;
                                margin: 0;
                            }
                            .error-container {
                                text-align: center;
                                padding: 40px;
                                background: #161B22;
                                border-radius: 12px;
                                border: 1px solid #30363D;
                            }
                            h1 {
                                font-size: 48px;
                                margin: 0 0 20px;
                                color: #DA3633;
                            }
                            p {
                                color: #949BA4;
                                margin: 0 0 30px;
                            }
                            a {
                                background: #238636;
                                color: white;
                                padding: 12px 24px;
                                border-radius: 8px;
                                text-decoration: none;
                                display: inline-block;
                                transition: background 0.3s;
                            }
                            a:hover {
                                background: #2EA043;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="error-container">
                            <h1>403</h1>
                            <p>이 페이지에 접근할 권한이 없습니다.</p>
                            <a href="/dashboard">대시보드로 돌아가기</a>
                        </div>
                    </body>
                    </html>
                `);
            }
            
            next();
        } catch (error) {
            logger.error('페이지 권한 확인 오류:', error);
            res.status(500).send('권한 확인 중 오류가 발생했습니다.');
        }
    };
};

module.exports = {
    requireRole,
    requireMenuAccess,
    requirePageAccess,
    roleValues
};
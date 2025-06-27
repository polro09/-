// src/web/middleware/auth.js
const User = require('../../models/User');
const Permission = require('../../models/Permission');
const logger = require('../../utils/logger');

// 인증 확인 미들웨어
const ensureAuthenticated = (req, res, next) => {
    if (!req.session || !req.session.user) {
        if (req.path.startsWith('/api')) {
            return res.status(401).json({ error: '로그인이 필요합니다.' });
        }
        return res.redirect('/auth/discord');
    }
    next();
};

// 권한 확인 미들웨어
const checkPermission = (requiredLevel) => {
    return async (req, res, next) => {
        // 인증 확인
        if (!req.session || !req.session.user) {
            if (req.path.startsWith('/api')) {
                return res.status(401).json({ error: '로그인이 필요합니다.' });
            }
            return res.redirect('/auth/discord');
        }
        
        try {
            // 사용자 정보 가져오기
            const user = await User.findOne({ discordId: req.session.user.id });
            if (!user) {
                return res.status(403).json({ error: '사용자를 찾을 수 없습니다.' });
            }
            
            // 권한 레벨 확인
            const permissions = await Permission.findOne({ level: user.dashboardRole });
            const requiredPerm = await Permission.findOne({ level: requiredLevel });
            
            if (!permissions || !requiredPerm) {
                logger.error(`권한 정보를 찾을 수 없음 - User: ${user.dashboardRole}, Required: ${requiredLevel}`);
                return res.status(500).json({ error: '권한 정보를 찾을 수 없습니다.' });
            }
            
            // 권한 값 비교
            if (permissions.value < requiredPerm.value) {
                logger.auth(`권한 부족 - ${user.username} (${user.dashboardRole}) < ${requiredLevel}`, 'permission');
                return res.status(403).json({ 
                    error: '권한이 부족합니다.',
                    required: requiredLevel,
                    current: user.dashboardRole
                });
            }
            
            // 요청 객체에 권한 정보 추가
            req.userPermissions = permissions;
            req.user = user;
            next();
            
        } catch (error) {
            logger.error('권한 확인 오류:', error);
            res.status(500).json({ error: '권한 확인 중 오류가 발생했습니다.' });
        }
    };
};

// API 전용 인증 미들웨어
const apiAuth = async (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: '인증이 필요합니다.' });
    }
    
    try {
        const user = await User.findOne({ discordId: req.session.user.id });
        if (!user) {
            return res.status(401).json({ error: '유효하지 않은 사용자입니다.' });
        }
        
        req.user = user;
        next();
    } catch (error) {
        logger.error('API 인증 오류:', error);
        res.status(500).json({ error: '인증 처리 중 오류가 발생했습니다.' });
    }
};

module.exports = {
    ensureAuthenticated,
    checkPermission,
    apiAuth
};
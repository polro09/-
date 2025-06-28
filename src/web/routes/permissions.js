// src/web/routes/permissions.js
const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const MenuPermission = require('../../models/MenuPermission');
const logger = require('../../utils/logger');

// 테스트 엔드포인트
router.get('/test', (req, res) => {
    res.json({ message: 'Permissions API is working!' });
});

// 권한 레벨 값 매핑
const roleValues = {
    guest: 0,
    member: 1,
    subadmin: 2,
    admin: 3,
    owner: 4
};

// 권한 확인 미들웨어
const checkPermission = (requiredRole) => {
    return async (req, res, next) => {
        if (!req.session.user) {
            return res.status(401).json({ error: '로그인이 필요합니다.' });
        }
        
        try {
            const user = await User.findOne({ discordId: req.session.user.id });
            if (!user) {
                return res.status(403).json({ error: '사용자를 찾을 수 없습니다.' });
            }
            
            const userRoleValue = roleValues[user.dashboardRole] || 0;
            const requiredRoleValue = roleValues[requiredRole] || 0;
            
            if (userRoleValue < requiredRoleValue) {
                return res.status(403).json({ error: '권한이 부족합니다.' });
            }
            
            req.userRole = user.dashboardRole;
            next();
        } catch (error) {
            logger.error('권한 확인 오류:', error);
            res.status(500).json({ error: '권한 확인 중 오류가 발생했습니다.' });
        }
    };
};

// 사용자 권한 목록 조회
router.get('/users', checkPermission('admin'), async (req, res) => {
    try {
        const users = await User.find({}, 
            'discordId username avatar dashboardRole lastLogin createdAt'
        ).sort('-lastLogin');
        
        res.json({ 
            success: true,
            users: users.map(user => ({
                discordId: user.discordId,
                username: user.username,
                avatar: user.avatar,
                dashboardRole: user.dashboardRole,
                lastLogin: user.lastLogin,
                createdAt: user.createdAt
            }))
        });
    } catch (error) {
        logger.error('사용자 목록 조회 오류:', error);
        res.status(500).json({ error: '사용자 목록을 조회할 수 없습니다.' });
    }
});

// 특정 사용자 권한 조회
router.get('/user/:userId', checkPermission('admin'), async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findOne({ discordId: userId });
        
        if (!user) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }
        
        res.json({
            success: true,
            user: {
                discordId: user.discordId,
                username: user.username,
                avatar: user.avatar,
                dashboardRole: user.dashboardRole,
                permissions: user.permissions,
                gameStats: user.gameStats,
                lastLogin: user.lastLogin,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        logger.error('사용자 정보 조회 오류:', error);
        res.status(500).json({ error: '사용자 정보를 조회할 수 없습니다.' });
    }
});

// 사용자 권한 변경
router.put('/user/:userId', checkPermission('admin'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;
        
        // 권한 유효성 확인
        const validRoles = ['guest', 'member', 'subadmin', 'admin'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: '유효하지 않은 권한입니다.' });
        }
        
        // 대상 사용자 확인
        const targetUser = await User.findOne({ discordId: userId });
        if (!targetUser) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }
        
        // 소유자는 변경 불가
        if (targetUser.dashboardRole === 'owner') {
            return res.status(403).json({ error: '소유자 권한은 변경할 수 없습니다.' });
        }
        
        // 자기 자신의 권한은 변경 불가
        if (userId === req.session.user.id) {
            return res.status(403).json({ error: '자신의 권한은 변경할 수 없습니다.' });
        }
        
        // 권한 업데이트
        targetUser.dashboardRole = role;
        await targetUser.save();
        
        logger.auth(`사용자 권한 변경: ${targetUser.username} (${userId}) → ${role}`, 'permission');
        
        res.json({ 
            success: true, 
            message: `${targetUser.username}님의 권한이 ${role}로 변경되었습니다.` 
        });
    } catch (error) {
        logger.error('권한 변경 오류:', error);
        res.status(500).json({ error: '권한 변경 중 오류가 발생했습니다.' });
    }
});

// 메뉴 권한 목록 조회
router.get('/menus', checkPermission('admin'), async (req, res) => {
    try {
        const menus = await MenuPermission.find({});
        
        res.json({
            success: true,
            menus: menus.map(menu => ({
                id: menu.menuId,
                name: menu.name,
                minRole: menu.minRole,
                description: menu.description,
                updatedAt: menu.updatedAt
            }))
        });
    } catch (error) {
        logger.error('메뉴 권한 조회 오류:', error);
        res.status(500).json({ error: '메뉴 권한을 조회할 수 없습니다.' });
    }
});

// 메뉴 권한 변경
router.put('/menu/:menuId', checkPermission('admin'), async (req, res) => {
    try {
        const { menuId } = req.params;
        const { minRole } = req.body;
        
        // 권한 유효성 확인
        const validRoles = ['guest', 'member', 'subadmin', 'admin', 'owner'];
        if (!validRoles.includes(minRole)) {
            return res.status(400).json({ error: '유효하지 않은 권한입니다.' });
        }
        
        // 메뉴 권한 업데이트 또는 생성
        const menu = await MenuPermission.findOneAndUpdate(
            { menuId },
            { 
                menuId,
                minRole,
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );
        
        logger.auth(`메뉴 권한 변경: ${menuId} → ${minRole}`, 'permission');
        
        res.json({ 
            success: true, 
            message: `메뉴 권한이 ${minRole}로 변경되었습니다.` 
        });
    } catch (error) {
        logger.error('메뉴 권한 변경 오류:', error);
        res.status(500).json({ error: '메뉴 권한 변경 중 오류가 발생했습니다.' });
    }
});

// 권한별 사용자 수 통계
router.get('/statistics', checkPermission('admin'), async (req, res) => {
    try {
        const statistics = await User.aggregate([
            {
                $group: {
                    _id: '$dashboardRole',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        const roleStats = {
            guest: 0,
            member: 0,
            subadmin: 0,
            admin: 0,
            owner: 0
        };
        
        statistics.forEach(stat => {
            if (stat._id && roleStats.hasOwnProperty(stat._id)) {
                roleStats[stat._id] = stat.count;
            }
        });
        
        res.json({
            success: true,
            statistics: roleStats,
            total: Object.values(roleStats).reduce((a, b) => a + b, 0)
        });
    } catch (error) {
        logger.error('권한 통계 조회 오류:', error);
        res.status(500).json({ error: '통계를 조회할 수 없습니다.' });
    }
});

module.exports = router;
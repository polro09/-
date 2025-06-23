// src/web/routes/dashboard.js
const express = require('express');
const router = express.Router();
const { config } = require('../../config/config');
const User = require('../../models/User');
const Permission = require('../../models/Permission');
const BotStatus = require('../../models/BotStatus');
const logger = require('../../utils/logger');

// 권한 확인 미들웨어
const checkPermission = (requiredLevel) => {
    return async (req, res, next) => {
        if (!req.session.user) {
            return res.redirect('/auth/discord');
        }
        
        try {
            const user = await User.findOne({ discordId: req.session.user.id });
            if (!user) {
                return res.status(403).json({ error: '사용자를 찾을 수 없습니다.' });
            }
            
            // 권한 레벨 확인
            const permissions = await Permission.findOne({ level: user.dashboardRole });
            const requiredPerm = await Permission.findOne({ level: requiredLevel });
            
            if (!permissions || permissions.value < requiredPerm.value) {
                return res.status(403).json({ error: '권한이 부족합니다.' });
            }
            
            req.userPermissions = permissions;
            next();
        } catch (error) {
            logger.error('권한 확인 오류:', error);
            res.status(500).json({ error: '권한 확인 중 오류가 발생했습니다.' });
        }
    };
};

// 대시보드 메인 페이지
router.get('/', checkPermission('member'), async (req, res) => {
    try {
        const botStatus = await BotStatus.findOne({ botId: req.client.user.id });
        
        res.json({
            user: req.session.user,
            permissions: req.userPermissions,
            botStatus: botStatus || { status: 'offline' }
        });
    } catch (error) {
        logger.error('대시보드 로드 오류:', error);
        res.status(500).json({ error: '대시보드를 로드할 수 없습니다.' });
    }
});

// 봇 통계
router.get('/statistics', checkPermission('member'), async (req, res) => {
    try {
        const client = req.client;
        
        const stats = {
            guilds: client.guilds.cache.size,
            users: client.users.cache.size,
            channels: client.channels.cache.size,
            uptime: client.uptime,
            memory: process.memoryUsage(),
            commands: client.commands.size,
            ping: client.ws.ping
        };
        
        // BotStatus 업데이트
        await BotStatus.findOneAndUpdate(
            { botId: client.user.id },
            { 
                'statistics.guilds': stats.guilds,
                'statistics.users': stats.users,
                'statistics.channels': stats.channels,
                'statistics.memoryUsage': stats.memory.heapUsed,
                lastUpdate: new Date()
            }
        );
        
        res.json(stats);
    } catch (error) {
        logger.error('통계 조회 오류:', error);
        res.status(500).json({ error: '통계를 조회할 수 없습니다.' });
    }
});

// 봇 제어 - 재시작
router.post('/control/restart', checkPermission('subadmin'), async (req, res) => {
    try {
        logger.bot('대시보드에서 봇 재시작 요청', 'control');
        
        await BotStatus.findOneAndUpdate(
            { botId: req.client.user.id },
            { 
                status: 'restarting',
                'runtime.lastRestart': new Date()
            }
        );
        
        res.json({ success: true, message: '봇을 재시작합니다...' });
        
        // 1초 후 재시작
        setTimeout(() => {
            process.exit(0); // PM2나 nodemon이 자동으로 재시작
        }, 1000);
        
    } catch (error) {
        logger.error('봇 재시작 오류:', error);
        res.status(500).json({ error: '봇 재시작 중 오류가 발생했습니다.' });
    }
});

// 봇 제어 - 종료
router.post('/control/stop', checkPermission('admin'), async (req, res) => {
    try {
        logger.bot('대시보드에서 봇 종료 요청', 'control');
        
        await BotStatus.findOneAndUpdate(
            { botId: req.client.user.id },
            { status: 'offline' }
        );
        
        res.json({ success: true, message: '봇을 종료합니다...' });
        
        // 봇 종료
        setTimeout(async () => {
            await req.client.destroy();
            process.exit(0);
        }, 1000);
        
    } catch (error) {
        logger.error('봇 종료 오류:', error);
        res.status(500).json({ error: '봇 종료 중 오류가 발생했습니다.' });
    }
});

// 로그 조회
router.get('/logs', checkPermission('subadmin'), async (req, res) => {
    try {
        const { limit = 100, level } = req.query;
        const botStatus = await BotStatus.findOne({ botId: req.client.user.id });
        
        if (!botStatus) {
            return res.json({ logs: [] });
        }
        
        let logs = botStatus.logs;
        
        // 레벨 필터링
        if (level) {
            logs = logs.filter(log => log.level === level);
        }
        
        // 최신 로그부터 제한된 수만큼
        logs = logs.slice(-limit).reverse();
        
        res.json({ logs });
    } catch (error) {
        logger.error('로그 조회 오류:', error);
        res.status(500).json({ error: '로그를 조회할 수 없습니다.' });
    }
});

// 권한 관리 페이지
router.get('/permissions', checkPermission('admin'), async (req, res) => {
    try {
        const users = await User.find({}, 'discordId username avatar dashboardRole lastLogin');
        const permissions = await Permission.find({});
        
        res.json({ users, permissions });
    } catch (error) {
        logger.error('권한 관리 조회 오류:', error);
        res.status(500).json({ error: '권한 정보를 조회할 수 없습니다.' });
    }
});

// 사용자 권한 변경
router.put('/permissions/user/:userId', checkPermission('admin'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;
        
        // 권한 유효성 확인
        const validRoles = ['guest', 'member', 'subadmin', 'admin'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: '유효하지 않은 권한입니다.' });
        }
        
        // 소유자는 변경 불가
        const targetUser = await User.findOne({ discordId: userId });
        if (targetUser.dashboardRole === 'owner') {
            return res.status(403).json({ error: '소유자 권한은 변경할 수 없습니다.' });
        }
        
        // 권한 업데이트
        await User.findOneAndUpdate(
            { discordId: userId },
            { dashboardRole: role }
        );
        
        logger.auth(`사용자 권한 변경: ${userId} → ${role}`, 'permission');
        
        res.json({ success: true, message: '권한이 변경되었습니다.' });
    } catch (error) {
        logger.error('권한 변경 오류:', error);
        res.status(500).json({ error: '권한 변경 중 오류가 발생했습니다.' });
    }
});

module.exports = router;
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
        
        // 사용자 정보 업데이트 (닉네임과 게임 전적 포함)
        const user = await User.findOne({ discordId: req.session.user.id });
        const userData = {
            ...req.session.user,
            nickname: user?.nickname || req.session.user.username,
            gameStats: user?.gameStats || {
                wins: 0,
                losses: 0,
                totalKills: 0,
                totalDeaths: 0,
                avgKills: 0,
                rankedGames: 0,
                practiceGames: 0
            }
        };
        
        res.json({
            user: userData,
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
        
        // 더 정확한 사용자 수 계산 (중복 제거)
        let totalUsers = 0;
        const uniqueUsers = new Set();
        
        client.guilds.cache.forEach(guild => {
            guild.members.cache.forEach(member => {
                if (!member.user.bot) {
                    uniqueUsers.add(member.user.id);
                }
            });
            totalUsers = uniqueUsers.size;
        });
        
        // 전체 채널 수 계산
        let totalChannels = 0;
        client.guilds.cache.forEach(guild => {
            totalChannels += guild.channels.cache.size;
        });
        
        const stats = {
            guilds: client.guilds.cache.size,
            users: totalUsers || client.users.cache.size,
            channels: totalChannels,
            uptime: client.uptime,
            memory: process.memoryUsage(),
            commands: client.commands.size,
            ping: Math.round(client.ws.ping) // 정수로 반올림
        };
        
        // BotStatus 업데이트 (DB 연결된 경우에만)
        try {
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
        } catch (dbError) {
            logger.warn('통계 DB 업데이트 실패 (DB 연결 필요)', 'database');
        }
        
        res.json(stats);
    } catch (error) {
        logger.error('통계 조회 오류:', error);
        res.status(500).json({ error: '통계를 조회할 수 없습니다.' });
    }
});

// 봇 제어 - 시작 (개발 환경용)
router.post('/control/start', checkPermission('admin'), async (req, res) => {
    try {
        logger.bot('대시보드에서 봇 시작 요청');
        
        // 이미 온라인인 경우
        if (req.client.ws.status === 0) {
            return res.json({ success: false, message: '봇이 이미 실행 중입니다.' });
        }
        
        res.json({ success: true, message: '봇을 시작합니다...' });
        
        // 봇 재연결 시도
        req.client.login(config.token);
        
    } catch (error) {
        logger.error('봇 시작 오류:', error);
        res.status(500).json({ error: '봇 시작 중 오류가 발생했습니다.' });
    }
});

// 봇 제어 - 재시작
router.post('/control/restart', checkPermission('subadmin'), async (req, res) => {
    try {
        logger.bot('대시보드에서 봇 재시작 요청');
        
        // MongoDB 연결 상태 확인
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState === 1) {
            await BotStatus.findOneAndUpdate(
                { botId: req.client.user.id },
                { 
                    status: 'restarting',
                    'runtime.lastRestart': new Date(),
                    '$inc': { 'runtime.restarts': 1 }
                }
            );
        }
        
        res.json({ success: true, message: '봇을 재시작합니다...' });
        
        // 봇 종료 후 재시작
        setTimeout(async () => {
            logger.bot('봇 재시작 중...');
            
            // 봇 클라이언트 종료
            await req.client.destroy();
            
            // nodemon이 아닌 경우를 위한 처리
            if (process.env.NODE_ENV === 'production') {
                // 프로덕션 환경에서는 프로세스 종료 (PM2가 재시작)
                process.exit(0);
            } else {
                // 개발 환경에서는 재로그인 시도
                setTimeout(() => {
                    req.client.login(config.token)
                        .then(() => logger.bot('봇 재시작 완료'))
                        .catch(err => {
                            logger.error('봇 재시작 실패:', err);
                            process.exit(1);
                        });
                }, 2000);
            }
        }, 1000);
        
    } catch (error) {
        logger.error('봇 재시작 오류:', error);
        res.status(500).json({ error: '봇 재시작 중 오류가 발생했습니다.' });
    }
});

// 봇 제어 - 종료
router.post('/control/stop', checkPermission('admin'), async (req, res) => {
    try {
        logger.bot('대시보드에서 봇 종료 요청');
        
        // MongoDB 연결 상태 확인
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState === 1) {
            await BotStatus.findOneAndUpdate(
                { botId: req.client.user.id },
                { status: 'offline' }
            );
        }
        
        res.json({ success: true, message: '봇을 종료합니다...' });
        
        // 봇 종료
        setTimeout(async () => {
            logger.bot('봇 종료 중...');
            await req.client.destroy();
            
            // 개발 환경에서는 프로세스를 종료하지 않음
            if (process.env.NODE_ENV === 'production') {
                process.exit(0);
            } else {
                logger.bot('봇이 종료되었습니다. (개발 모드 - 프로세스 유지)');
            }
        }, 1000);
        
    } catch (error) {
        logger.error('봇 종료 오류:', error);
        res.status(500).json({ error: '봇 종료 중 오류가 발생했습니다.' });
    }
});

// DB 관리 - 사용자 목록 조회 (Sub Admin 이상)
router.get('/db-management/users', checkPermission('subadmin'), async (req, res) => {
    try {
        const users = await User.find({}, 
            'discordId username avatar gameStats partyStats lastLogin'
        ).sort({ lastLogin: -1 });
        
        res.json({ users });
    } catch (error) {
        logger.error('사용자 목록 조회 오류:', error);
        res.status(500).json({ error: '사용자 목록을 조회할 수 없습니다.' });
    }
});

// DB 관리 - 통계 조회 (Sub Admin 이상)
router.get('/db-management/statistics', checkPermission('subadmin'), async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        
        // 집계 통계
        const stats = await User.aggregate([
            {
                $group: {
                    _id: null,
                    totalGames: { $sum: '$gameStats.totalGames' },
                    totalWins: { $sum: '$gameStats.wins' },
                    avgWinRate: { $avg: '$gameStats.winRate' }
                }
            }
        ]);
        
        // 오늘 활동한 사용자
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const activeToday = await User.countDocuments({
            lastLogin: { $gte: today }
        });
        
        res.json({
            totalUsers,
            totalGames: stats[0]?.totalGames || 0,
            avgWinRate: Math.round(stats[0]?.avgWinRate || 0),
            activeToday
        });
    } catch (error) {
        logger.error('통계 조회 오류:', error);
        res.status(500).json({ error: '통계를 조회할 수 없습니다.' });
    }
});

// DB 관리 - 사용자 전적 수정 (Sub Admin 이상)
router.put('/db-management/user/:userId', checkPermission('subadmin'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { gameStats } = req.body;
        
        // 유효성 검증
        if (!gameStats || typeof gameStats !== 'object') {
            return res.status(400).json({ error: '잘못된 데이터 형식입니다.' });
        }
        
        // 승률 재계산
        const totalGames = (gameStats.wins || 0) + (gameStats.losses || 0);
        const winRate = totalGames > 0 ? Math.round((gameStats.wins / totalGames) * 100) : 0;
        
        // 사용자 업데이트
        const updatedUser = await User.findOneAndUpdate(
            { discordId: userId },
            {
                'gameStats.wins': gameStats.wins || 0,
                'gameStats.losses': gameStats.losses || 0,
                'gameStats.totalGames': gameStats.totalGames || 0,
                'gameStats.avgKills': gameStats.avgKills || 0,
                'gameStats.rankedGames': gameStats.rankedGames || 0,
                'gameStats.winRate': winRate
            },
            { new: true }
        );
        
        if (!updatedUser) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }
        
        logger.database(`사용자 전적 수정: ${userId} by ${req.session.user.username}`);
        
        res.json({ 
            success: true, 
            message: '전적이 수정되었습니다.',
            user: updatedUser 
        });
        
    } catch (error) {
        logger.error('사용자 전적 수정 오류:', error);
        res.status(500).json({ error: '전적 수정 중 오류가 발생했습니다.' });
    }
});

// 로그 조회
router.get('/logs', checkPermission('subadmin'), async (req, res) => {
    try {
        const { limit = 100, level } = req.query;
        
        // MongoDB 연결 확인
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) {
            return res.json({ logs: [] });
        }
        
        const botStatus = await BotStatus.findOne({ botId: req.client.user.id });
        
        if (!botStatus) {
            return res.json({ logs: [] });
        }
        
        let logs = botStatus.logs || [];
        
        // 레벨 필터링
        if (level && level !== 'all') {
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
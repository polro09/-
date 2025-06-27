// src/web/routes/api.js
const express = require('express');
const router = express.Router();
const { config } = require('../../config/config');
const Guild = require('../../models/Guild');
const User = require('../../models/User');
const Party = require('../../models/Party');
const PartyMember = require('../../models/PartyMember');
const logger = require('../../utils/logger');

// 인증 미들웨어
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    next();
};

// OAuth URL 반환 (main.html에서 사용)
router.get('/oauth-url', (req, res) => {
    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'identify email guilds'
    });
    
    res.json({ url: `https://discord.com/api/oauth2/authorize?${params}` });
});

// 사용자 정보
router.get('/user', (req, res) => {
    // 로그인하지 않은 경우
    if (!req.session.user) {
        return res.status(401).json({ error: '로그인이 필요합니다.', user: null });
    }
    
    // 민감한 정보 제외하고 필요한 정보만 반환
    const { id, username, avatar, email, dashboardRole, guildCount, nickname, gameStats } = req.session.user;
    res.json({ 
        user: {
            id, 
            username, 
            avatar, 
            email, 
            dashboardRole, 
            guildCount,
            nickname: nickname || username,
            gameStats: gameStats || {
                wins: 0,
                losses: 0,
                totalKills: 0,
                totalDeaths: 0,
                avgKills: 0,
                rankedGames: 0,
                practiceGames: 0
            }
        }
    });
});

// 사용자 통계 조회
router.get('/user/stats', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: '로그인이 필요합니다.' });
        }
        
        const user = await User.findOne({ discordId: req.session.user.id });
        
        if (!user || !user.gameStats) {
            return res.json({
                wins: 0,
                losses: 0,
                totalKills: 0,
                avgKills: 0,
                rankedGames: 0,
                practiceGames: 0,
                winRate: 0
            });
        }
        
        res.json(user.gameStats);
        
    } catch (error) {
        logger.error(`사용자 통계 조회 오류: ${error.message}`, 'api');
        res.status(500).json({ error: '통계를 불러올 수 없습니다.' });
    }
});

// 닉네임 변경
router.put('/user/nickname', requireAuth, async (req, res) => {
    try {
        const { nickname } = req.body;
        
        // 유효성 검사
        if (!nickname || nickname.trim().length === 0) {
            return res.status(400).json({ success: false, error: '닉네임을 입력해주세요.' });
        }
        
        if (nickname.length > 20) {
            return res.status(400).json({ success: false, error: '닉네임은 20자 이내여야 합니다.' });
        }
        
        // 부적절한 단어 필터링 (필요시 추가)
        const bannedWords = ['admin', 'administrator', 'moderator', 'aimdot'];
        const lowerNickname = nickname.toLowerCase();
        if (bannedWords.some(word => lowerNickname.includes(word))) {
            return res.status(400).json({ success: false, error: '사용할 수 없는 닉네임입니다.' });
        }
        
        // MongoDB 연결 확인 및 업데이트
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState === 1) {
            await User.findOneAndUpdate(
                { discordId: req.session.user.id },
                { nickname: nickname.trim() }
            );
        }
        
        // 세션 업데이트
        req.session.user.nickname = nickname.trim();
        
        res.json({ success: true, nickname: nickname.trim(), message: '닉네임이 변경되었습니다.' });
        
    } catch (error) {
        logger.error('닉네임 변경 오류:', error);
        res.status(500).json({ success: false, error: '닉네임 변경 중 오류가 발생했습니다.' });
    }
});

// 사용자 길드 목록
router.get('/guilds', requireAuth, (req, res) => {
    const userGuilds = req.session.user.guilds || [];
    
    // 관리 권한이 있는 서버만 필터링
    const adminGuilds = userGuilds.filter(guild => {
        const permissions = BigInt(guild.permissions);
        return (permissions & BigInt(0x8)) === BigInt(0x8) || // Administrator
               (permissions & BigInt(0x20)) === BigInt(0x20);   // Manage Guild
    });
    
    res.json({ 
        guilds: adminGuilds.map(guild => ({
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            owner: guild.owner
        }))
    });
});

// 특정 길드의 채널 목록
router.get('/guilds/:guildId/channels', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    
    try {
        // 사용자가 해당 길드에 권한이 있는지 확인
        const userGuild = req.session.user.guilds.find(g => g.id === guildId);
        if (!userGuild) {
            return res.status(403).json({ error: '해당 서버에 대한 권한이 없습니다.' });
        }
        
        // 봇이 해당 길드에 있는지 확인
        const guild = req.client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: '봇이 해당 서버에 없습니다.' });
        }
        
        // 텍스트 채널만 필터링
        const textChannels = guild.channels.cache
            .filter(channel => channel.type === 0) // 0 = GUILD_TEXT
            .map(channel => ({
                id: channel.id,
                name: channel.name,
                position: channel.position
            }))
            .sort((a, b) => a.position - b.position);
        
        res.json({ channels: textChannels });
    } catch (error) {
        logger.error(`채널 목록 조회 오류: ${error.message}`, 'api');
        res.status(500).json({ error: '채널 목록을 불러올 수 없습니다.' });
    }
});

// 서버 설정 조회
router.get('/servers/:guildId/settings', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    
    try {
        // 권한 확인
        const userGuild = req.session.user.guilds.find(g => g.id === guildId);
        if (!userGuild) {
            return res.status(403).json({ error: '해당 서버에 대한 권한이 없습니다.' });
        }
        
        const permissions = BigInt(userGuild.permissions);
        if (!(permissions & BigInt(0x8)) && !(permissions & BigInt(0x20))) {
            return res.status(403).json({ error: '서버 관리 권한이 필요합니다.' });
        }
        
        // 서버 설정 조회
        let guildData = await Guild.findOne({ guildId });
        
        if (!guildData) {
            // 기본 설정 생성
            const guild = req.client.guilds.cache.get(guildId);
            if (!guild) {
                return res.status(404).json({ error: '서버를 찾을 수 없습니다.' });
            }
            
            guildData = await Guild.create({
                guildId: guildId,
                guildName: guild.name
            });
        }
        
        res.json(guildData);
    } catch (error) {
        logger.error('서버 설정 조회 오류:', error);
        res.status(500).json({ error: '서버 설정을 불러올 수 없습니다.' });
    }
});

// 서버 모듈 설정 업데이트
router.put('/servers/:guildId/modules/:module', requireAuth, async (req, res) => {
    const { guildId, module } = req.params;
    const { settings } = req.body;
    
    try {
        // 권한 확인
        const userGuild = req.session.user.guilds.find(g => g.id === guildId);
        if (!userGuild) {
            return res.status(403).json({ error: '해당 서버에 대한 권한이 없습니다.' });
        }
        
        const permissions = BigInt(userGuild.permissions);
        if (!(permissions & BigInt(0x8)) && !(permissions & BigInt(0x20))) {
            return res.status(403).json({ error: '서버 관리 권한이 필요합니다.' });
        }
        
        // 길드 설정 업데이트
        let guildData = await Guild.findOne({ guildId });
        
        if (!guildData) {
            const guild = req.client.guilds.cache.get(guildId);
            if (!guild) {
                return res.status(404).json({ error: '서버를 찾을 수 없습니다.' });
            }
            
            guildData = await Guild.create({
                guildId: guildId,
                guildName: guild.name
            });
        }
        
        // 모듈 설정 업데이트
        if (guildData.modules[module]) {
            guildData.modules[module] = {
                ...guildData.modules[module],
                ...settings
            };
            
            await guildData.save();
            
            logger.info(`모듈 설정 업데이트: ${guildId} - ${module}`);
            res.json({ success: true, module: guildData.modules[module] });
        } else {
            res.status(400).json({ error: '잘못된 모듈입니다.' });
        }
    } catch (error) {
        logger.error('모듈 설정 업데이트 오류:', error);
        res.status(500).json({ error: '설정을 업데이트할 수 없습니다.' });
    }
});

// 봇 통계
router.get('/stats', (req, res) => {
    const client = req.client;
    
    res.json({
        guilds: client.guilds.cache.size,
        users: client.users.cache.size,
        channels: client.channels.cache.size,
        uptime: client.uptime,
        memory: process.memoryUsage().heapUsed / 1024 / 1024,
        ping: client.ws.ping
    });
});

// 봇 초대 링크 생성
router.get('/invite', (req, res) => {
    const permissions = '8'; // Administrator
    const params = new URLSearchParams({
        client_id: config.clientId,
        permissions: permissions,
        scope: 'bot applications.commands'
    });
    
    res.json({ url: `https://discord.com/api/oauth2/authorize?${params}` });
});

module.exports = router;
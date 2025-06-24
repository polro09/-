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
router.get('/user', requireAuth, (req, res) => {
    // 민감한 정보 제외하고 필요한 정보만 반환
    const { id, username, avatar, email, dashboardRole, guildCount } = req.session.user;
    res.json({ 
        id, 
        username, 
        avatar, 
        email, 
        dashboardRole, 
        guildCount,
        nickname: req.session.user.nickname,
        gameStats: req.session.user.gameStats
    });
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
        
        res.json({ success: true, message: '닉네임이 변경되었습니다.' });
        
    } catch (error) {
        logger.error('닉네임 변경 오류:', error);
        res.status(500).json({ success: false, error: '닉네임 변경 중 오류가 발생했습니다.' });
    }
});

// 사용자가 관리할 수 있는 서버 목록
router.get('/guilds', requireAuth, async (req, res) => {
    try {
        // 세션에 저장된 길드 정보 사용
        const userGuilds = req.session.user.guilds || [];
        
        const managableGuilds = userGuilds.filter(guild => {
            // 관리자 권한이 있는 서버만 필터링
            const permissions = BigInt(guild.permissions);
            return (permissions & BigInt(0x8)) === BigInt(0x8); // ADMINISTRATOR
        });
        
        // 봇이 있는 서버 확인
        const botGuilds = req.client.guilds.cache.map(g => g.id);
        
        const guildsWithBot = managableGuilds.map(guild => ({
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            botJoined: botGuilds.includes(guild.id)
        }));
        
        res.json({
            guilds: guildsWithBot,
            totalCount: req.session.user.guildCount || userGuilds.length
        });
    } catch (error) {
        logger.error('길드 목록 가져오기 오류:', error);
        res.status(500).json({ error: '서버 목록을 가져올 수 없습니다.' });
    }
});

// 특정 서버 설정 가져오기
router.get('/guilds/:guildId', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        
        // 권한 확인
        const hasPermission = req.session.user.guilds.some(guild => {
            if (guild.id !== guildId) return false;
            const permissions = BigInt(guild.permissions);
            return (permissions & BigInt(0x8)) === BigInt(0x8);
        });
        
        if (!hasPermission) {
            return res.status(403).json({ error: '권한이 없습니다.' });
        }
        
        // 길드 설정 가져오기
        const guildData = await Guild.findOne({ guildId });
        
        if (!guildData) {
            return res.json({ modules: {} });
        }
        
        res.json(guildData);
    } catch (error) {
        logger.error('길드 설정 가져오기 오류:', error);
        res.status(500).json({ error: '서버 설정을 가져올 수 없습니다.' });
    }
});

// 서버 설정 업데이트
router.put('/guilds/:guildId/modules', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const { module, settings } = req.body;
        
        // 권한 확인
        const hasPermission = req.session.user.guilds.some(guild => {
            if (guild.id !== guildId) return false;
            const permissions = BigInt(guild.permissions);
            return (permissions & BigInt(0x8)) === BigInt(0x8);
        });
        
        if (!hasPermission) {
            return res.status(403).json({ error: '권한이 없습니다.' });
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
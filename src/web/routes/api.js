// src/web/routes/api.js
const express = require('express');
const router = express.Router();
const { config } = require('../../config/config');
const Guild = require('../../models/Guild');
const User = require('../../models/User');
const Party = require('../../models/Party');
const PartyMember = require('../../models/PartyMember');
const logger = require('../../utils/logger');
const { checkSessionAPI } = require('../middleware/checkSession');

// 인증 미들웨어
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    next();
};

// OAuth URL 반환 (main.html에서 사용)
router.get('/oauth-url', (req, res) => {
    // 현재 호스트 확인
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    // 상태값 생성
    const state = Math.random().toString(36).substring(7);
    
    // 세션에 상태 저장
    if (req.session) {
        req.session.oauth_state = state;
        req.session.save();
    }
    
    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri, // 환경 변수에서 설정된 값 사용
        response_type: 'code',
        scope: 'identify email guilds',
        state: state
    });
    
    const url = `https://discord.com/api/oauth2/authorize?${params}`;
    
    logger.debug(`OAuth URL 생성 - Redirect URI: ${config.redirectUri}`, 'api');
    
    res.json({ 
        url: url,
        baseUrl: baseUrl,
        redirectUri: config.redirectUri
    });
});

// 사용자 정보 - 세션 체크 미들웨어 적용
router.get('/user', checkSessionAPI, (req, res) => {
    // checkSessionAPI에서 이미 세션을 업데이트했으므로
    // 업데이트된 세션 정보를 그대로 반환
    const userSession = req.session.user;
    
    res.json({
        success: true,
        user: {
            id: userSession.id,
            username: userSession.username,
            discriminator: userSession.discriminator,
            avatar: userSession.avatar,
            email: userSession.email,
            nickname: userSession.nickname,
            dashboardRole: userSession.dashboardRole, // 최신 권한
            gameStats: userSession.gameStats,
            guilds: userSession.guilds,
            guildCount: userSession.guildCount
        }
    });
});

// 세션 확인 엔드포인트
router.get('/session', (req, res) => {
    if (req.session.user) {
        res.json({
            user: {
                id: req.session.user.id,
                username: req.session.user.username,
                avatar: req.session.user.avatar
            }
        });
    } else {
        res.json({ user: null });
    }
});

// 사용자 통계 조회
router.get('/user/stats', checkSessionAPI, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        const user = await User.findOne({ discordId: userId });
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
router.put('/user/nickname', checkSessionAPI, async (req, res) => {
    try {
        const { nickname } = req.body;
        const userId = req.session.user.id;
        
        // 유효성 검사
        if (!nickname || nickname.trim().length === 0) {
            return res.status(400).json({ success: false, error: '닉네임을 입력해주세요.' });
        }
        
        if (nickname.length > 20) {
            return res.status(400).json({ success: false, error: '닉네임은 20자 이내로 입력해주세요.' });
        }
        
        // 사용자 업데이트
        const user = await User.findOneAndUpdate(
            { discordId: userId },
            { 
                nickname: nickname.trim(),
                updatedAt: new Date()
            },
            { new: true }
        );
        
        if (!user) {
            return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
        }
        
        // 세션 업데이트
        req.session.user.nickname = nickname.trim();
        
        logger.info(`닉네임 변경: ${userId} -> ${nickname.trim()}`, 'api');
        
        res.json({
            success: true,
            nickname: nickname.trim(),
            message: '닉네임이 변경되었습니다.'
        });
        
    } catch (error) {
        logger.error(`닉네임 변경 오류: ${error.message}`, 'api');
        res.status(500).json({ success: false, error: '닉네임 변경 중 오류가 발생했습니다.' });
    }
});

// 관리자 권한 서버 목록
router.get('/servers', requireAuth, async (req, res) => {
    try {
        const guilds = req.session.user.guilds || [];
        
        // 관리자 권한이 있는 서버만 필터링
        const adminGuilds = guilds.filter(guild => {
            const permissions = BigInt(guild.permissions);
            // 관리자(0x8) 또는 서버 관리(0x20) 권한 체크
            return (permissions & BigInt(0x8)) === BigInt(0x8) || 
                   (permissions & BigInt(0x20)) === BigInt(0x20);
        });
        
        // 봇이 있는 서버 확인
        const guildsWithBot = [];
        for (const guild of adminGuilds) {
            const botGuild = req.client.guilds.cache.get(guild.id);
            
            guildsWithBot.push({
                id: guild.id,
                name: guild.name,
                icon: guild.icon,
                owner: guild.owner,
                hasBot: !!botGuild,
                memberCount: botGuild ? botGuild.memberCount : 0
            });
        }
        
        res.json({
            success: true,
            guilds: guildsWithBot
        });
        
    } catch (error) {
        logger.error(`서버 목록 조회 오류: ${error.message}`, 'api');
        res.status(500).json({ error: '서버 목록을 불러올 수 없습니다.' });
    }
});

// 서버 상세 정보
router.get('/servers/:guildId', requireAuth, async (req, res) => {
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
        
        // Discord 서버 정보
        const guild = req.client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ 
                error: '봇이 해당 서버에 없습니다.',
                hasBot: false
            });
        }
        
        // DB에서 서버 설정 가져오기
        const guildData = await Guild.findOne({ guildId }) || {};
        
        res.json({
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL(),
            memberCount: guild.memberCount,
            createdAt: guild.createdAt,
            roles: guild.roles.cache.map(role => ({
                id: role.id,
                name: role.name,
                color: role.hexColor,
                position: role.position
            })).sort((a, b) => b.position - a.position),
            channels: guild.channels.cache
                .filter(ch => ch.type === 0 || ch.type === 5) // 텍스트 채널만
                .map(ch => ({
                    id: ch.id,
                    name: ch.name,
                    type: ch.type
                })),
            settings: guildData.settings || {},
            hasBot: true
        });
        
    } catch (error) {
        logger.error(`서버 상세 정보 조회 오류: ${error.message}`, 'api');
        res.status(500).json({ error: '서버 정보를 불러올 수 없습니다.' });
    }
});

// 서버 설정 업데이트
router.put('/servers/:guildId/settings', requireAuth, async (req, res) => {
    const { guildId } = req.params;
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
        
        // 설정 업데이트
        await Guild.findOneAndUpdate(
            { guildId },
            { 
                settings: settings,
                updatedAt: new Date()
            },
            { upsert: true }
        );
        
        logger.info(`서버 설정 업데이트: ${guildId}`, 'api');
        res.json({ success: true, message: '설정이 저장되었습니다.' });
        
    } catch (error) {
        logger.error(`서버 설정 업데이트 오류: ${error.message}`, 'api');
        res.status(500).json({ error: '설정을 저장할 수 없습니다.' });
    }
});

// 봇 초대 URL 생성
router.get('/bot/invite', (req, res) => {
    const botId = config.clientId || '1251188343629262879';
    const permissions = '8'; // 관리자 권한
    
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${botId}&permissions=${permissions}&scope=bot%20applications.commands`;
    
    res.json({
        success: true,
        url: inviteUrl
    });
});

// 모듈 설정 조회
router.get('/modules/:guildId', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    
    try {
        const guild = req.client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: '서버를 찾을 수 없습니다.' });
        }
        
        const guildData = await Guild.findOne({ guildId });
        const modules = guildData?.settings?.modules || {
            party: true,
            moderation: true,
            welcome: false,
            logging: false,
            automod: false
        };
        
        res.json({ modules });
    } catch (error) {
        logger.error('모듈 설정 조회 오류:', error);
        res.status(500).json({ error: '모듈 설정을 불러올 수 없습니다.' });
    }
});

// 모듈 설정 업데이트
router.put('/modules/:guildId', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    const { modules } = req.body;
    
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
        
        await Guild.findOneAndUpdate(
            { guildId },
            { 
                'settings.modules': modules,
                updatedAt: new Date()
            },
            { upsert: true }
        );
        
        res.json({ success: true, message: '모듈 설정이 업데이트되었습니다.' });
    } catch (error) {
        logger.error('모듈 설정 업데이트 오류:', error);
        res.status(500).json({ error: '설정을 업데이트할 수 없습니다.' });
    }
});

// 파티 관련 API
// 파티 생성
router.post('/party/create', requireAuth, async (req, res) => {
    try {
        const { name, maxMembers, isPublic, description } = req.body;
        
        // 유효성 검사
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ success: false, error: '파티 이름을 입력해주세요.' });
        }
        
        // 파티 생성
        const party = new Party({
            name: name.trim(),
            creator: req.session.user.id,
            maxMembers: maxMembers || 4,
            isPublic: isPublic !== false,
            description: description || '',
            createdAt: new Date()
        });
        
        await party.save();
        
        // 생성자를 파티원으로 추가
        const member = new PartyMember({
            partyId: party._id,
            userId: req.session.user.id,
            role: 'leader',
            joinedAt: new Date()
        });
        
        await member.save();
        
        res.json({
            success: true,
            party: {
                id: party._id,
                name: party.name,
                code: party.code,
                maxMembers: party.maxMembers,
                currentMembers: 1
            }
        });
        
    } catch (error) {
        logger.error(`파티 생성 오류: ${error.message}`, 'api');
        res.status(500).json({ success: false, error: '파티 생성 중 오류가 발생했습니다.' });
    }
});

// 공개 파티 목록 조회
router.get('/party/list', async (req, res) => {
    try {
        const parties = await Party.find({ 
            isPublic: true, 
            status: 'active' 
        }).populate('members').limit(20);
        
        const partyList = parties.map(party => ({
            id: party._id,
            name: party.name,
            creator: party.creator,
            maxMembers: party.maxMembers,
            currentMembers: party.members?.length || 0,
            description: party.description,
            createdAt: party.createdAt
        }));
        
        res.json({ success: true, parties: partyList });
        
    } catch (error) {
        logger.error(`파티 목록 조회 오류: ${error.message}`, 'api');
        res.status(500).json({ success: false, error: '파티 목록을 불러올 수 없습니다.' });
    }
});

// 파티 참가
router.post('/party/:partyId/join', requireAuth, async (req, res) => {
    try {
        const { partyId } = req.params;
        const userId = req.session.user.id;
        
        // 파티 확인
        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ success: false, error: '파티를 찾을 수 없습니다.' });
        }
        
        if (party.status !== 'active') {
            return res.status(400).json({ success: false, error: '활성 상태가 아닌 파티입니다.' });
        }
        
        // 이미 참가했는지 확인
        const existingMember = await PartyMember.findOne({ partyId, userId });
        if (existingMember) {
            return res.status(400).json({ success: false, error: '이미 참가한 파티입니다.' });
        }
        
        // 인원 수 확인
        const memberCount = await PartyMember.countDocuments({ partyId });
        if (memberCount >= party.maxMembers) {
            return res.status(400).json({ success: false, error: '파티가 가득 찼습니다.' });
        }
        
        // 파티원 추가
        const member = new PartyMember({
            partyId,
            userId,
            role: 'member',
            joinedAt: new Date()
        });
        
        await member.save();
        
        res.json({ success: true, message: '파티에 참가했습니다.' });
        
    } catch (error) {
        logger.error(`파티 참가 오류: ${error.message}`, 'api');
        res.status(500).json({ success: false, error: '파티 참가 중 오류가 발생했습니다.' });
    }
});

// 파티 나가기
router.post('/party/:partyId/leave', requireAuth, async (req, res) => {
    try {
        const { partyId } = req.params;
        const userId = req.session.user.id;
        
        // 파티원 확인
        const member = await PartyMember.findOne({ partyId, userId });
        if (!member) {
            return res.status(404).json({ success: false, error: '파티원이 아닙니다.' });
        }
        
        // 리더인 경우 처리
        if (member.role === 'leader') {
            // 다른 멤버가 있는지 확인
            const otherMembers = await PartyMember.find({ 
                partyId, 
                userId: { $ne: userId } 
            });
            
            if (otherMembers.length > 0) {
                // 다음 멤버를 리더로 지정
                otherMembers[0].role = 'leader';
                await otherMembers[0].save();
            } else {
                // 파티 비활성화
                await Party.findByIdAndUpdate(partyId, { status: 'inactive' });
            }
        }
        
        // 파티원 삭제
        await member.remove();
        
        res.json({ success: true, message: '파티에서 나갔습니다.' });
        
    } catch (error) {
        logger.error(`파티 나가기 오류: ${error.message}`, 'api');
        res.status(500).json({ success: false, error: '파티 나가기 중 오류가 발생했습니다.' });
    }
});

// 내 파티 목록
router.get('/party/my', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // 내가 속한 파티 찾기
        const myPartyMembers = await PartyMember.find({ userId });
        const partyIds = myPartyMembers.map(m => m.partyId);
        
        const parties = await Party.find({ 
            _id: { $in: partyIds },
            status: 'active'
        });
        
        const myParties = await Promise.all(parties.map(async (party) => {
            const memberCount = await PartyMember.countDocuments({ partyId: party._id });
            const myRole = myPartyMembers.find(m => m.partyId.equals(party._id))?.role || 'member';
            
            return {
                id: party._id,
                name: party.name,
                code: party.code,
                maxMembers: party.maxMembers,
                currentMembers: memberCount,
                myRole: myRole,
                isLeader: myRole === 'leader',
                createdAt: party.createdAt
            };
        }));
        
        res.json({ success: true, parties: myParties });
        
    } catch (error) {
        logger.error(`내 파티 목록 조회 오류: ${error.message}`, 'api');
        res.status(500).json({ success: false, error: '파티 목록을 불러올 수 없습니다.' });
    }
});

// 파티 상세 정보
router.get('/party/:partyId', async (req, res) => {
    try {
        const { partyId } = req.params;
        
        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ success: false, error: '파티를 찾을 수 없습니다.' });
        }
        
        // 파티원 정보 가져오기
        const members = await PartyMember.find({ partyId });
        const memberDetails = await Promise.all(members.map(async (member) => {
            const user = await User.findOne({ discordId: member.userId });
            return {
                userId: member.userId,
                username: user?.username || 'Unknown',
                avatar: user?.avatar,
                role: member.role,
                joinedAt: member.joinedAt
            };
        }));
        
        res.json({
            success: true,
            party: {
                id: party._id,
                name: party.name,
                code: party.code,
                description: party.description,
                creator: party.creator,
                maxMembers: party.maxMembers,
                isPublic: party.isPublic,
                status: party.status,
                createdAt: party.createdAt,
                members: memberDetails
            }
        });
        
    } catch (error) {
        logger.error(`파티 상세 정보 조회 오류: ${error.message}`, 'api');
        res.status(500).json({ success: false, error: '파티 정보를 불러올 수 없습니다.' });
    }
});

// 테스트 엔드포인트
router.get('/test', (req, res) => {
    res.json({ 
        message: 'API is working!',
        session: req.session,
        timestamp: new Date()
    });
});

module.exports = router;
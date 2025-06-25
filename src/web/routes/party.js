// src/web/routes/party.js
const express = require('express');
const router = express.Router();
const Party = require('../../models/Party');
const User = require('../../models/User');
const Permission = require('../../models/Permission');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

// 권한 체크 미들웨어
const checkPermission = (requiredLevel) => {
    return async (req, res, next) => {
        if (!req.session.user) {
            return res.status(401).json({ error: '로그인이 필요합니다.' });
        }
        
        const levels = ['guest', 'member', 'subadmin', 'admin', 'owner'];
        const userLevel = levels.indexOf(req.session.user.dashboardRole || 'guest');
        const required = levels.indexOf(requiredLevel);
        
        if (userLevel < required) {
            return res.status(403).json({ error: '권한이 부족합니다.' });
        }
        
        next();
    };
};

// 파티 목록 조회
router.get('/list', async (req, res) => {
    try {
        const { status = 'recruiting', page = 1, limit = 12 } = req.query;
        const skip = (page - 1) * limit;
        
        const query = {};
        if (status !== 'all') {
            query.status = status;
        }
        
        const parties = await Party.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();
            
        const total = await Party.countDocuments(query);
        
        res.json({
            parties,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error(`파티 목록 조회 오류: ${error.message}`, 'party');
        res.status(500).json({ error: '파티 목록을 불러올 수 없습니다.' });
    }
});

// 파티 상세 조회
router.get('/:partyId', async (req, res) => {
    try {
        const party = await Party.findOne({ partyId: req.params.partyId }).lean();
        
        if (!party) {
            return res.status(404).json({ error: '파티를 찾을 수 없습니다.' });
        }
        
        // 참여자 상세 정보 추가
        const participantIds = party.participants.map(p => p.userId);
        const users = await User.find({ discordId: { $in: participantIds } }).lean();
        
        party.participants = party.participants.map(participant => {
            const user = users.find(u => u.discordId === participant.userId);
            if (user && user.gameStats) {
                participant.stats = user.gameStats;
            }
            return participant;
        });
        
        res.json(party);
    } catch (error) {
        logger.error(`파티 상세 조회 오류: ${error.message}`, 'party');
        res.status(500).json({ error: '파티 정보를 불러올 수 없습니다.' });
    }
});

// 파티 생성
router.post('/create', checkPermission('member'), async (req, res) => {
    try {
        const { title, description, type, startTime, requirements, guildId, channelId } = req.body;
        
        if (!title || !type || !guildId || !channelId) {
            return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
        }
        
        const partyId = uuidv4().split('-')[0].toUpperCase();
        
        const newParty = new Party({
            partyId,
            guildId,
            channelId,
            hostId: req.session.user.id,
            hostName: req.session.user.username,
            title,
            description,
            type,
            startTime: startTime ? new Date(startTime) : null,
            requirements
        });
        
        await newParty.save();
        
        // 디스코드에 알림 전송
        await notifyDiscord(req.client, newParty);
        
        logger.party(`파티 생성: ${partyId} - ${title} by ${req.session.user.username}`);
        res.json({ success: true, partyId, party: newParty });
    } catch (error) {
        logger.error(`파티 생성 오류: ${error.message}`, 'party');
        res.status(500).json({ error: '파티 생성에 실패했습니다.' });
    }
});

// 파티 참여/팀 변경
router.post('/:partyId/join', checkPermission('member'), async (req, res) => {
    try {
        const { team = 'waitlist', country, unit } = req.body;
        const party = await Party.findOne({ partyId: req.params.partyId });
        
        if (!party) {
            return res.status(404).json({ error: '파티를 찾을 수 없습니다.' });
        }
        
        if (party.status !== 'recruiting') {
            return res.status(400).json({ error: '모집이 마감된 파티입니다.' });
        }
        
        const userData = {
            userId: req.session.user.id,
            username: req.session.user.username,
            avatar: req.session.user.avatar,
            team,
            country,
            unit
        };
        
        // 기존 참여자인지 확인
        const existingIndex = party.participants.findIndex(p => p.userId === userData.userId);
        
        if (existingIndex !== -1) {
            // 팀 변경
            party.participants[existingIndex] = { ...party.participants[existingIndex], ...userData };
        } else {
            // 새로 참여
            party.participants.push(userData);
        }
        
        party.updatedAt = new Date();
        await party.save();
        
        // 디스코드 메시지 업데이트
        await party.updateDiscordMessage(req.client);
        
        logger.party(`파티 참여: ${req.params.partyId} - ${req.session.user.username} (${team})`);
        res.json({ success: true, party });
    } catch (error) {
        logger.error(`파티 참여 오류: ${error.message}`, 'party');
        res.status(500).json({ error: '파티 참여에 실패했습니다.' });
    }
});

// 파티 나가기
router.post('/:partyId/leave', checkPermission('member'), async (req, res) => {
    try {
        const party = await Party.findOne({ partyId: req.params.partyId });
        
        if (!party) {
            return res.status(404).json({ error: '파티를 찾을 수 없습니다.' });
        }
        
        const result = await party.removeParticipant(req.session.user.id);
        
        if (!result.success) {
            return res.status(400).json({ error: result.message });
        }
        
        // 디스코드 메시지 업데이트
        await party.updateDiscordMessage(req.client);
        
        logger.party(`파티 나가기: ${req.params.partyId} - ${req.session.user.username}`);
        res.json({ success: true });
    } catch (error) {
        logger.error(`파티 나가기 오류: ${error.message}`, 'party');
        res.status(500).json({ error: '파티 나가기에 실패했습니다.' });
    }
});

// 파티 수정 (주최자만)
router.put('/:partyId', checkPermission('member'), async (req, res) => {
    try {
        const party = await Party.findOne({ partyId: req.params.partyId });
        
        if (!party) {
            return res.status(404).json({ error: '파티를 찾을 수 없습니다.' });
        }
        
        if (party.hostId !== req.session.user.id && req.session.user.dashboardRole !== 'admin') {
            return res.status(403).json({ error: '파티를 수정할 권한이 없습니다.' });
        }
        
        const updateFields = ['title', 'description', 'startTime', 'requirements'];
        updateFields.forEach(field => {
            if (req.body[field] !== undefined) {
                party[field] = req.body[field];
            }
        });
        
        party.updatedAt = new Date();
        await party.save();
        
        // 디스코드 메시지 업데이트
        await party.updateDiscordMessage(req.client);
        
        logger.party(`파티 수정: ${req.params.partyId} by ${req.session.user.username}`);
        res.json({ success: true, party });
    } catch (error) {
        logger.error(`파티 수정 오류: ${error.message}`, 'party');
        res.status(500).json({ error: '파티 수정에 실패했습니다.' });
    }
});

// 파티 종료/취소 (주최자만)
router.post('/:partyId/end', checkPermission('member'), async (req, res) => {
    try {
        const { action, winner, team1Score, team2Score } = req.body;
        const party = await Party.findOne({ partyId: req.params.partyId });
        
        if (!party) {
            return res.status(404).json({ error: '파티를 찾을 수 없습니다.' });
        }
        
        if (party.hostId !== req.session.user.id && req.session.user.dashboardRole !== 'admin') {
            return res.status(403).json({ error: '파티를 종료할 권한이 없습니다.' });
        }
        
        if (action === 'complete') {
            party.status = 'completed';
            party.result = {
                winner,
                team1Score,
                team2Score,
                completedBy: req.session.user.username,
                completedAt: new Date()
            };
            
            // 참여자 전적 업데이트
            await updateParticipantStats(party);
            
            // 결과 알림
            await notifyPartyResult(req.client, party);
        } else {
            party.status = 'cancelled';
        }
        
        await party.save();
        
        // 디스코드 메시지 업데이트
        await party.updateDiscordMessage(req.client);
        
        logger.party(`파티 ${action}: ${req.params.partyId} by ${req.session.user.username}`);
        res.json({ success: true });
    } catch (error) {
        logger.error(`파티 종료 오류: ${error.message}`, 'party');
        res.status(500).json({ error: '파티 종료에 실패했습니다.' });
    }
});

// 디스코드 알림 함수 (개선된 버전)
async function notifyDiscord(client, party) {
    try {
        const channel = await client.channels.fetch(party.channelId);
        if (!channel) return;
        
        const embed = await party.createDiscordEmbed(client);
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        
        // 버튼 생성
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('파티 참여')
                    .setEmoji('🎮')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`${process.env.WEB_URL || 'http://localhost:3000'}/party/${party.partyId}`),
                new ButtonBuilder()
                    .setCustomId(`party_info_${party.partyId}`)
                    .setLabel('상세 정보')
                    .setEmoji('📋')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`party_participants_${party.partyId}`)
                    .setLabel('참여자 목록')
                    .setEmoji('👥')
                    .setStyle(ButtonStyle.Secondary)
            );
        
        // 모든 파티 타입에 @everyone 멘션
        const mention = '@everyone';
        
        const message = await channel.send({ 
            content: `${mention} 🎮 **새로운 파티가 생성되었습니다!**`,
            embeds: [embed],
            components: [row]
        });
        
        party.messageId = message.id;
        await party.save();
        
        logger.party(`파티 알림 전송 완료: ${party.partyId} - ${party.title}`);
    } catch (error) {
        logger.error(`디스코드 알림 오류: ${error.message}`, 'party');
    }
}

// 파티 결과 알림
async function notifyPartyResult(client, party) {
    try {
        const channel = await client.channels.fetch(party.channelId);
        if (!channel) return;
        
        const CustomEmbedBuilder = require('../../utils/embedBuilder');
        const resultEmbed = CustomEmbedBuilder.createBasicEmbed({
            title: '🏆 파티 종료',
            description: `**${party.title}** 파티가 종료되었습니다.`,
            fields: [
                {
                    name: '결과',
                    value: party.result.winner === 'draw' ? '무승부' : `${party.result.winner} 승리`,
                    inline: true
                },
                {
                    name: '점수',
                    value: `팀1: ${party.result.team1Score} - 팀2: ${party.result.team2Score}`,
                    inline: true
                }
            ],
            color: 0x00FF00
        });
        
        await channel.send({ embeds: [resultEmbed] });
    } catch (error) {
        logger.error(`파티 결과 알림 오류: ${error.message}`, 'party');
    }
}

// 참여자 전적 업데이트
async function updateParticipantStats(party) {
    try {
        const { winner, team1Score, team2Score } = party.result;
        
        for (const participant of party.participants) {
            const isWinner = 
                (winner === 'team1' && participant.team === 'team1') ||
                (winner === 'team2' && participant.team === 'team2');
            
            await User.findOneAndUpdate(
                { discordId: participant.userId },
                {
                    $inc: {
                        'gameStats.wins': isWinner ? 1 : 0,
                        'gameStats.losses': !isWinner && winner !== 'draw' ? 1 : 0,
                        'gameStats.totalGames': 1,
                        'gameStats.rankedGames': party.type === '정규전' ? 1 : 0,
                        'gameStats.practiceGames': party.type === '모의전' ? 1 : 0
                    },
                    $set: {
                        'gameStats.lastPlayed': new Date()
                    }
                },
                { upsert: true }
            );
        }
    } catch (error) {
        logger.error(`전적 업데이트 오류: ${error.message}`, 'party');
    }
}

module.exports = router;
// src/web/routes/party.js
const express = require('express');
const router = express.Router();
const Party = require('../../models/Party');
const User = require('../../models/User');
const Permission = require('../../models/Permission');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');
const { checkSessionAPI } = require('../middleware/checkSession');
const { config } = require('../../config/config');

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

// 모든 파티 라우트에 세션 확인 미들웨어 적용
router.use(checkSessionAPI);

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
            
        // 참여자의 추가 정보 포함
        for (const party of parties) {
            if (party.participants && party.participants.length > 0) {
                const participantIds = party.participants.map(p => p.userId);
                const users = await User.find({ discordId: { $in: participantIds } }).lean();
                
                party.participants = party.participants.map(participant => {
                    const user = users.find(u => u.discordId === participant.userId);
                    if (user) {
                        participant.nickname = participant.nickname || user.nickname || user.username;
                        participant.avgKills = user.gameStats?.avgKills || 0;
                        participant.winRate = user.gameStats?.winRate || 0;
                        participant.killRank = user.gameStats?.killRank || 0;
                        participant.teamRank = user.gameStats?.teamRank || 0;
                    }
                    return participant;
                });
            }
            
            // 호스트 닉네임도 업데이트
            const hostUser = await User.findOne({ discordId: party.hostId }).lean();
            if (hostUser) {
                party.hostNickname = hostUser.nickname || party.hostName;
            }
        }
            
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
        
        // 참여자 상세 정보 추가 (nickname 포함)
        const participantIds = party.participants.map(p => p.userId);
        const users = await User.find({ discordId: { $in: participantIds } }).lean();
        
        // 호스트 정보도 가져오기
        const hostUser = await User.findOne({ discordId: party.hostId }).lean();
        if (hostUser) {
            party.hostNickname = hostUser.nickname || hostUser.username;
        }
        
        party.participants = party.participants.map(participant => {
            const user = users.find(u => u.discordId === participant.userId);
            if (user) {
                // 사용자의 nickname 추가
                participant.nickname = user.nickname || participant.username;
                if (user.gameStats) {
                    participant.stats = user.gameStats;
                }
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
        
        // 사용자 nickname 가져오기
        const user = await User.findOne({ discordId: req.session.user.id }).lean();
        
        const newParty = new Party({
            partyId,
            guildId,
            channelId,
            hostId: req.session.user.id,
            hostName: req.session.user.username,
            hostNickname: user?.nickname || req.session.user.username,
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
        const { team = 'waitlist', country, unit, tier } = req.body;
        const party = await Party.findOne({ partyId: req.params.partyId });
        
        if (!party) {
            return res.status(404).json({ error: '파티를 찾을 수 없습니다.' });
        }
        
        if (party.status !== 'recruiting') {
            return res.status(400).json({ error: '모집이 마감된 파티입니다.' });
        }
        
        // 권한 확인 - 세션의 최신 권한 사용
        if (party.requirements) {
            const roleValues = {
                guest: 0,
                member: 1,
                subadmin: 2,
                admin: 3,
                owner: 4
            };
            
            const userRoleValue = roleValues[req.session.user.dashboardRole] || 0;
            const minRoleValue = roleValues[party.requirements] || 0;
            
            if (userRoleValue < minRoleValue) {
                return res.status(403).json({ 
                    error: `이 파티는 ${party.requirements} 이상의 권한이 필요합니다. 현재 권한: ${req.session.user.dashboardRole}` 
                });
            }
        }
        
        // 사용자의 nickname 정보도 가져오기
        const user = await User.findOne({ discordId: req.session.user.id }).lean();
        
        const userData = {
            userId: req.session.user.id,
            username: req.session.user.username,
            nickname: user?.nickname || req.session.user.username,
            avatar: req.session.user.avatar,
            discordId: req.session.user.id,
            team,
            country,
            unit,
            tier: tier || '5t'
        };
        
        // 기존 참여자인지 확인
        const existingIndex = party.participants.findIndex(p => p.userId === userData.userId);
        
        if (existingIndex !== -1) {
            // 팀 변경 - 기존 데이터를 유지하면서 업데이트
            party.participants[existingIndex] = { 
                ...party.participants[existingIndex], 
                ...userData,
                joinedAt: party.participants[existingIndex].joinedAt // 참여 시간은 유지
            };
        } else {
            // 새로 참여
            userData.joinedAt = new Date();
            party.participants.push(userData);
        }
        
        party.updatedAt = new Date();
        await party.save();
        
        // 디스코드 메시지 업데이트 (실패해도 계속 진행)
        party.updateDiscordMessage(req.client).catch(err => {
            logger.debug(`Discord 메시지 업데이트 실패 (무시됨): ${err.message}`, 'party');
        });
        
        logger.party(`파티 참여: ${req.params.partyId} - ${userData.nickname} (${team}) - 티어: ${tier}`);
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
        
        // 디스코드 메시지 업데이트 (실패해도 계속 진행)
        party.updateDiscordMessage(req.client).catch(err => {
            logger.debug(`Discord 메시지 업데이트 실패 (무시됨): ${err.message}`, 'party');
        });
        
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
        
        // 디스코드 메시지 업데이트 (실패해도 계속 진행)
        party.updateDiscordMessage(req.client).catch(err => {
            logger.debug(`Discord 메시지 업데이트 실패 (무시됨): ${err.message}`, 'party');
        });
        
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
        
        // 디스코드 메시지 업데이트 (실패해도 계속 진행)
        party.updateDiscordMessage(req.client).catch(err => {
            logger.debug(`Discord 메시지 업데이트 실패 (무시됨): ${err.message}`, 'party');
        });
        
        logger.party(`파티 ${action}: ${req.params.partyId} by ${req.session.user.username}`);
        res.json({ success: true });
    } catch (error) {
        logger.error(`파티 종료 오류: ${error.message}`, 'party');
        res.status(500).json({ error: '파티 종료에 실패했습니다.' });
    }
});

// 파티 전적 기입 (Sub Admin 이상)
router.post('/:partyId/record', checkPermission('subadmin'), async (req, res) => {
    try {
        const { winner, participantKills } = req.body;
        const party = await Party.findOne({ partyId: req.params.partyId });
        
        if (!party) {
            return res.status(404).json({ error: '파티를 찾을 수 없습니다.' });
        }
        
        if (party.status !== 'completed') {
            return res.status(400).json({ error: '완료된 파티만 전적을 기입할 수 있습니다.' });
        }
        
        if (party.type !== '정규전' && party.type !== '모의전') {
            return res.status(400).json({ error: '정규전과 모의전만 전적 기입이 가능합니다.' });
        }
        
        // 각 참여자의 통계 업데이트
        for (const participant of party.participants) {
            const user = await User.findOne({ discordId: participant.userId });
            if (!user) continue;
            
            // gameStats 초기화
            if (!user.gameStats) {
                user.gameStats = {
                    wins: 0,
                    losses: 0,
                    totalKills: 0,
                    totalDeaths: 0,
                    avgKills: 0,
                    rankedGames: 0,
                    practiceGames: 0,
                    winRate: 0,
                    killRank: 0,
                    teamRank: 0
                };
            }
            
            const kills = participantKills[participant.userId] || 0;
            
            // 정규전 처리
            if (party.type === '정규전') {
                user.gameStats.rankedGames += 1;
                
                if (winner === 'win') {
                    user.gameStats.wins += 1;
                } else {
                    user.gameStats.losses += 1;
                }
            } 
            // 모의전 처리
            else if (party.type === '모의전') {
                user.gameStats.practiceGames += 1;
                
                // 모의전에서는 해당 팀이 이긴 경우만 승리로 계산
                if ((winner === 'team1' && participant.team === 'team1') ||
                    (winner === 'team2' && participant.team === 'team2')) {
                    user.gameStats.wins += 1;
                } else {
                    user.gameStats.losses += 1;
                }
            }
            
            // 킬 수 업데이트
            user.gameStats.totalKills += kills;
            
            // 평균 킬 계산
            const totalGames = user.gameStats.wins + user.gameStats.losses;
            if (totalGames > 0) {
                user.gameStats.avgKills = user.gameStats.totalKills / totalGames;
                user.gameStats.winRate = Math.round((user.gameStats.wins / totalGames) * 100);
            }
            
            await user.save();
        }
        
        // 파티에 전적 기록 표시
        party.recordSaved = true;
        party.recordSavedAt = new Date();
        party.recordSavedBy = req.session.user.id;
        party.matchResult = {
            winner: winner,
            participantKills: participantKills
        };
        
        await party.save();
        
        logger.party(`파티 전적 기입: ${req.params.partyId} by ${req.session.user.username}`);
        res.json({ success: true, message: '전적이 저장되었습니다.' });
        
    } catch (error) {
        logger.error(`파티 전적 기입 오류: ${error.message}`, 'party');
        res.status(500).json({ error: '전적 기입에 실패했습니다.' });
    }
});

// 파티 삭제 (Sub Admin 이상)
router.delete('/:partyId', checkPermission('subadmin'), async (req, res) => {
    try {
        const party = await Party.findOne({ partyId: req.params.partyId });
        
        if (!party) {
            return res.status(404).json({ error: '파티를 찾을 수 없습니다.' });
        }
        
        // 삭제 전 로그 기록
        logger.party(`파티 삭제: ${req.params.partyId} - ${party.title} by ${req.session.user.username}`);
        
        // 파티 삭제
        await Party.deleteOne({ partyId: req.params.partyId });
        
        res.json({ success: true, message: '파티가 삭제되었습니다.' });
        
    } catch (error) {
        logger.error(`파티 삭제 오류: ${error.message}`, 'party');
        res.status(500).json({ error: '파티 삭제에 실패했습니다.' });
    }
});

// 디스코드 알림 함수
async function notifyDiscord(client, party) {
    try {
        const channel = await client.channels.fetch(party.channelId);
        if (!channel) return;
        
        const embed = await party.createDiscordEmbed(client);
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        
        // 버튼 생성 - 파티 참여 버튼만
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('파티 참여')
                    .setEmoji('🎮')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`${config.websiteUrl}/party/${party.partyId}`)
            );
        
        // 모든 파티 타입에 @everyone 멘션
        const mention = '@everyone';
        
        const message = await channel.send({ 
            content: `${mention} 🎮 **새로운 파티가 생성되었습니다!**`,
            embeds: [embed],
            components: [row]
        });
        
        // 메시지 ID 저장
        party.messageId = message.id;
        await party.save();
        
        logger.party(`Discord 알림 전송 완료: ${party.partyId}`);
    } catch (error) {
        logger.error(`Discord 알림 전송 오류: ${error.message}`, 'party');
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
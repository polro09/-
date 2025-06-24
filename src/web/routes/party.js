// src/web/routes/party.js
const express = require('express');
const router = express.Router();
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Party = require('../../models/Party');
const User = require('../../models/User');
const Guild = require('../../models/Guild');
const Component = require('../../models/Component');
const logger = require('../../utils/logger');
const { config } = require('../../config/config');
const { v4: uuidv4 } = require('uuid');

// 인증 미들웨어
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    next();
};

// 국가 정보
const countries = {
    empire: { name: '제국', icon: '🏛️' },
    vlandia: { name: '블란디아', icon: '🦁' },
    battania: { name: '바타니아', icon: '🌲' },
    sturgia: { name: '스터지아', icon: '❄️' },
    khuzait: { name: '쿠자이트', icon: '🏹' },
    aserai: { name: '아세라이', icon: '🏜️' }
};

// 병종 정보
const units = {
    '5t_polearm_infantry': '5t 폴암보병',
    '5t_shield_infantry': '5t 방패보병',
    '5t_archer': '5t 궁병',
    '5t_crossbow': '5t 석궁병',
    '5t_spearman': '5t 창병',
    '5t_horse_archer': '5t 궁기병',
    '5t_lancer': '5t 창기병',
    '6t_archer': '6t 궁병',
    '6t_horse_archer': '6t 궁기병',
    '6t_lancer': '6t 창기병'
};

// 파티 타입 정보
const partyTypes = {
    ranked: { name: '정규전', emoji: '⚔️' },
    practice: { name: '모의전', emoji: '🎯' },
    training: { name: '훈련', emoji: '📚' },
    pvp: { name: 'PVP', emoji: '⚡' },
    blackclaw: { name: '검은발톱', emoji: '🦅' },
    raid_desert: { name: '레이드-사막', emoji: '🏜️' },
    raid_north: { name: '레이드-북부', emoji: '❄️' }
};

// 파티 생성
router.post('/create', requireAuth, async (req, res) => {
    try {
        const { 
            guildId, 
            channelId, 
            type, 
            title, 
            description, 
            scheduledDate, 
            scheduledTime,
            preparations,
            maxTeamSize 
        } = req.body;
        
        // 사용자 정보 가져오기
        const user = await User.findOne({ discordId: req.session.user.id });
        if (!user) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }
        
        // 파티 생성
        const partyId = uuidv4();
        const party = await Party.create({
            partyId,
            guildId,
            channelId,
            type,
            title,
            description,
            hostId: user.discordId,
            hostName: user.nickname || user.username,
            scheduledDate,
            scheduledTime,
            preparations,
            maxTeamSize: maxTeamSize || 50
        });
        
        // Discord 알림 전송
        const guild = req.client.guilds.cache.get(guildId);
        const channel = guild?.channels.cache.get(channelId);
        
        if (channel) {
            const partyEmbed = createPartyEmbed(party);
            const components = createPartyComponents(party);
            
            const message = await channel.send({
                content: '@everyone 새로운 파티가 생성되었습니다!',
                embeds: [partyEmbed],
                components: components
            });
            
            // 메시지 ID 업데이트
            party.messageId = message.id;
            await party.save();
            
            // 컴포넌트 저장
            await Component.create({
                customId: `persistent_button_party_join_${partyId}`,
                type: 'button',
                guildId,
                channelId,
                messageId: message.id,
                handlerName: 'party_join',
                data: { partyId },
                createdBy: user.discordId
            });
            
            await Component.create({
                customId: `persistent_button_party_view_${partyId}`,
                type: 'button',
                guildId,
                channelId,
                messageId: message.id,
                handlerName: 'party_view',
                data: { partyId },
                createdBy: user.discordId
            });
        }
        
        res.json({ success: true, partyId });
        
    } catch (error) {
        logger.error('파티 생성 오류:', error);
        res.status(500).json({ error: '파티 생성 중 오류가 발생했습니다.' });
    }
});

// 파티 목록 조회
router.get('/list', async (req, res) => {
    try {
        const { status = 'recruiting', page = 1, limit = 10 } = req.query;
        
        const parties = await Party.find({ status })
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);
        
        const total = await Party.countDocuments({ status });
        
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
        logger.error('파티 목록 조회 오류:', error);
        res.status(500).json({ error: '파티 목록을 불러올 수 없습니다.' });
    }
});

// 특정 파티 조회
router.get('/:partyId', async (req, res) => {
    try {
        const party = await Party.findOne({ partyId: req.params.partyId });
        
        if (!party) {
            return res.status(404).json({ error: '파티를 찾을 수 없습니다.' });
        }
        
        res.json(party);
        
    } catch (error) {
        logger.error('파티 조회 오류:', error);
        res.status(500).json({ error: '파티 정보를 불러올 수 없습니다.' });
    }
});

// 파티 참여/이동
router.post('/:partyId/join', requireAuth, async (req, res) => {
    try {
        const { partyId } = req.params;
        const { action, from, to, country, unit } = req.body;
        
        const party = await Party.findOne({ partyId });
        if (!party) {
            return res.status(404).json({ error: '파티를 찾을 수 없습니다.' });
        }
        
        const user = await User.findOne({ discordId: req.session.user.id });
        if (!user) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }
        
        const participant = {
            userId: user.discordId,
            username: user.username,
            nickname: user.nickname,
            avatar: req.session.user.avatar,
            country,
            unit,
            stats: {
                wins: user.gameStats.wins,
                losses: user.gameStats.losses,
                winRate: user.gameStats.wins + user.gameStats.losses > 0 
                    ? Math.round((user.gameStats.wins / (user.gameStats.wins + user.gameStats.losses)) * 100)
                    : 0,
                avgKills: user.gameStats.avgKills
            }
        };
        
        if (action === 'join') {
            await party.addParticipant(participant, to);
        } else if (action === 'move') {
            await party.moveParticipant(user.discordId, from, to);
        }
        
        // Discord 메시지 업데이트
        await updatePartyMessage(req.client, party);
        
        res.json({ success: true });
        
    } catch (error) {
        logger.error('파티 참여 오류:', error);
        res.status(500).json({ error: error.message || '파티 참여 중 오류가 발생했습니다.' });
    }
});

// 파티 수정 (개최자만)
router.put('/:partyId', requireAuth, async (req, res) => {
    try {
        const { partyId } = req.params;
        const updates = req.body;
        
        const party = await Party.findOne({ partyId });
        if (!party) {
            return res.status(404).json({ error: '파티를 찾을 수 없습니다.' });
        }
        
        // 개최자 확인
        if (party.hostId !== req.session.user.id) {
            return res.status(403).json({ error: '파티를 수정할 권한이 없습니다.' });
        }
        
        // 업데이트 가능한 필드만 수정
        const allowedUpdates = ['title', 'description', 'scheduledDate', 'scheduledTime', 'preparations', 'maxTeamSize'];
        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                party[field] = updates[field];
            }
        });
        
        await party.save();
        
        // Discord 메시지 업데이트
        await updatePartyMessage(req.client, party);
        
        res.json({ success: true });
        
    } catch (error) {
        logger.error('파티 수정 오류:', error);
        res.status(500).json({ error: '파티 수정 중 오류가 발생했습니다.' });
    }
});

// 파티 종료/취소
router.post('/:partyId/complete', requireAuth, async (req, res) => {
    try {
        const { partyId } = req.params;
        const { action, outcome, resultMessage } = req.body;
        
        const party = await Party.findOne({ partyId });
        if (!party) {
            return res.status(404).json({ error: '파티를 찾을 수 없습니다.' });
        }
        
        // 개최자 확인
        if (party.hostId !== req.session.user.id) {
            return res.status(403).json({ error: '파티를 종료할 권한이 없습니다.' });
        }
        
        if (action === 'cancel') {
            party.status = 'cancelled';
            await party.save();
            
            // Discord 메시지 삭제
            const guild = req.client.guilds.cache.get(party.guildId);
            const channel = guild?.channels.cache.get(party.channelId);
            if (channel && party.messageId) {
                try {
                    const message = await channel.messages.fetch(party.messageId);
                    await message.delete();
                } catch (err) {
                    logger.warn('파티 메시지 삭제 실패:', err);
                }
            }
        } else if (action === 'complete') {
            await party.completeParty(outcome, req.session.user.id);
            party.result.resultMessage = resultMessage || '';
            await party.save();
            
            // 결과 임베드 전송
            await sendPartyResultEmbed(req.client, party);
        }
        
        res.json({ success: true });
        
    } catch (error) {
        logger.error('파티 종료 오류:', error);
        res.status(500).json({ error: '파티 종료 중 오류가 발생했습니다.' });
    }
});

// 전적 기록 (Sub Admin 이상)
router.post('/:partyId/stats', requireAuth, async (req, res) => {
    try {
        const { partyId } = req.params;
        const { playerStats } = req.body;
        
        // 권한 확인
        const user = await User.findOne({ discordId: req.session.user.id });
        if (!user || !['subadmin', 'admin', 'owner'].includes(user.dashboardRole)) {
            return res.status(403).json({ error: '전적을 기록할 권한이 없습니다.' });
        }
        
        const party = await Party.findOne({ partyId });
        if (!party) {
            return res.status(404).json({ error: '파티를 찾을 수 없습니다.' });
        }
        
        if (party.status !== 'completed') {
            return res.status(400).json({ error: '종료된 파티만 전적을 기록할 수 있습니다.' });
        }
        
        // 전적 기록
        party.playerStats = playerStats;
        party.statsRecorded = true;
        party.statsRecordedBy = req.session.user.id;
        party.statsRecordedAt = new Date();
        await party.save();
        
        // 각 플레이어의 전적 업데이트
        for (const stat of playerStats) {
            const player = await User.findOne({ discordId: stat.userId });
            if (player) {
                if (stat.won) {
                    player.gameStats.wins += 1;
                } else {
                    player.gameStats.losses += 1;
                }
                
                player.gameStats.totalKills += stat.kills;
                player.gameStats.totalDeaths += stat.deaths;
                
                if (party.type === 'ranked') {
                    player.gameStats.rankedGames += 1;
                } else if (party.type === 'practice') {
                    player.gameStats.practiceGames += 1;
                }
                
                // 평균 킬 재계산
                const totalGames = player.gameStats.wins + player.gameStats.losses;
                if (totalGames > 0) {
                    player.gameStats.avgKills = player.gameStats.totalKills / totalGames;
                }
                
                player.gameStats.lastGameAt = new Date();
                await player.save();
            }
        }
        
        res.json({ success: true });
        
    } catch (error) {
        logger.error('전적 기록 오류:', error);
        res.status(500).json({ error: '전적 기록 중 오류가 발생했습니다.' });
    }
});

// 파티 임베드 생성 함수
function createPartyEmbed(party) {
    const type = partyTypes[party.type];
    const dateStr = new Date(party.scheduledDate).toLocaleDateString('ko-KR');
    
    const embed = new EmbedBuilder()
        .setColor(config.embed.color)
        .setTitle(`${type.emoji} ${party.title}`)
        .setDescription(party.description || '파티 설명이 없습니다.')
        .setThumbnail('https://i.imgur.com/Sd8qK9c.gif')
        .addFields(
            { name: '📋 파티 종류', value: type.name, inline: true },
            { name: '👤 주최자', value: party.hostName, inline: true },
            { name: '📅 일시', value: `${dateStr} ${party.scheduledTime}`, inline: true }
        );
    
    // 팀 정보
    if (party.team1.length > 0) {
        const team1List = party.team1.slice(0, 10).map(p => {
            const countryIcon = p.country ? countries[p.country].icon : '❓';
            return `${countryIcon} ${p.nickname || p.username} (${p.stats.winRate}%)`;
        }).join('\n');
        embed.addFields({ 
            name: `🔵 1팀 (${party.team1.length}/${party.maxTeamSize})`, 
            value: team1List + (party.team1.length > 10 ? '\n...' : ''), 
            inline: true 
        });
    } else {
        embed.addFields({ name: `🔵 1팀 (0/${party.maxTeamSize})`, value: '비어있음', inline: true });
    }
    
    if (party.team2.length > 0) {
        const team2List = party.team2.slice(0, 10).map(p => {
            const countryIcon = p.country ? countries[p.country].icon : '❓';
            return `${countryIcon} ${p.nickname || p.username} (${p.stats.winRate}%)`;
        }).join('\n');
        embed.addFields({ 
            name: `🔴 2팀 (${party.team2.length}/${party.maxTeamSize})`, 
            value: team2List + (party.team2.length > 10 ? '\n...' : ''), 
            inline: true 
        });
    } else {
        embed.addFields({ name: `🔴 2팀 (0/${party.maxTeamSize})`, value: '비어있음', inline: true });
    }
    
    if (party.waitlist.length > 0) {
        embed.addFields({ 
            name: `⏳ 대기자 (${party.waitlist.length}명)`, 
            value: party.waitlist.slice(0, 5).map(p => p.nickname || p.username).join(', ') + 
                   (party.waitlist.length > 5 ? ` 외 ${party.waitlist.length - 5}명` : ''), 
            inline: false 
        });
    }
    
    if (party.preparations) {
        embed.addFields({ name: '📌 준비물', value: party.preparations, inline: false });
    }
    
    embed.setFooter({
        text: 'Aimdot.dev Party System',
        iconURL: 'https://i.imgur.com/Sd8qK9c.gif'
    })
    .setTimestamp();
    
    return embed;
}

// 파티 버튼 컴포넌트 생성
function createPartyComponents(party) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`persistent_button_party_join_${party.partyId}`)
                .setLabel('파티 참여')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('➕'),
            new ButtonBuilder()
                .setLabel('상세 보기')
                .setStyle(ButtonStyle.Link)
                .setURL(`${process.env.WEBSITE_URL || 'http://localhost:3000'}/party/${party.partyId}`)
                .setEmoji('🔍')
        );
    
    return [row];
}

// 파티 메시지 업데이트
async function updatePartyMessage(client, party) {
    try {
        const guild = client.guilds.cache.get(party.guildId);
        const channel = guild?.channels.cache.get(party.channelId);
        
        if (channel && party.messageId) {
            const message = await channel.messages.fetch(party.messageId);
            const embed = createPartyEmbed(party);
            await message.edit({ embeds: [embed] });
        }
    } catch (error) {
        logger.error('파티 메시지 업데이트 오류:', error);
    }
}

// 파티 결과 임베드 전송
async function sendPartyResultEmbed(client, party) {
    try {
        const guild = client.guilds.cache.get(party.guildId);
        const channel = guild?.channels.cache.get(party.channelId);
        
        if (!channel) return;
        
        const type = partyTypes[party.type];
        let resultText = '';
        let color = config.embed.color;
        
        switch (party.result.outcome) {
            case 'team1_win':
                resultText = '🔵 1팀 승리!';
                color = 0x0099FF;
                break;
            case 'team2_win':
                resultText = '🔴 2팀 승리!';
                color = 0xFF0000;
                break;
            case 'draw':
                resultText = '⚪ 무승부';
                color = 0x808080;
                break;
            case 'completed':
                resultText = '✅ 완료';
                color = 0x00FF00;
                break;
        }
        
        const resultEmbed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${type.emoji} ${party.title} - 종료`)
            .setDescription(party.result.resultMessage || '파티가 종료되었습니다.')
            .addFields(
                { name: '📊 결과', value: resultText, inline: true },
                { name: '👤 주최자', value: party.hostName, inline: true },
                { name: '⏱️ 종료 시간', value: new Date(party.result.completedAt).toLocaleString('ko-KR'), inline: true }
            );
        
        // 참여자 목록
        const allParticipants = [...party.team1, ...party.team2];
        if (allParticipants.length > 0) {
            const participantList = allParticipants.slice(0, 20).map(p => {
                const countryIcon = p.country ? countries[p.country].icon : '❓';
                return `${countryIcon} ${p.nickname || p.username}`;
            }).join(', ');
            
            resultEmbed.addFields({
                name: `👥 참여자 (${allParticipants.length}명)`,
                value: participantList + (allParticipants.length > 20 ? ` 외 ${allParticipants.length - 20}명` : ''),
                inline: false
            });
        }
        
        resultEmbed.setFooter({
            text: 'Aimdot.dev Party System',
            iconURL: 'https://i.imgur.com/Sd8qK9c.gif'
        })
        .setTimestamp();
        
        await channel.send({ embeds: [resultEmbed] });
        
    } catch (error) {
        logger.error('파티 결과 전송 오류:', error);
    }
}

module.exports = router;
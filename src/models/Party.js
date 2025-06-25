// src/models/Party.js
const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true
    },
    username: String,
    avatar: String,
    team: {
        type: String,
        enum: ['team1', 'team2', 'waitlist'],
        default: 'waitlist'
    },
    country: {
        type: String,
        enum: ['empire', 'vlandia', 'battania', 'sturgia', 'khuzait', 'aserai'],
        default: null
    },
    unit: {
        type: String,
        default: null
    },
    stats: {
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        kills: { type: Number, default: 0 },
        deaths: { type: Number, default: 0 }
    },
    joinedAt: {
        type: Date,
        default: Date.now
    }
});

const partySchema = new mongoose.Schema({
    partyId: {
        type: String,
        required: true,
        unique: true
    },
    guildId: {
        type: String,
        required: true
    },
    channelId: {
        type: String,
        required: true
    },
    messageId: String,
    hostId: {
        type: String,
        required: true
    },
    hostName: String,
    title: {
        type: String,
        required: true
    },
    description: String,
    type: {
        type: String,
        enum: ['정규전', '모의전', '훈련', 'PVP', '검은발톱', '레이드'],
        required: true
    },
    maxPlayers: {
        type: Number,
        default: 100
    },
    requirements: String,
    startTime: Date,
    status: {
        type: String,
        enum: ['recruiting', 'in_progress', 'completed', 'cancelled'],
        default: 'recruiting'
    },
    participants: [participantSchema],
    result: {
        winner: {
            type: String,
            enum: ['team1', 'team2', 'draw', null],
            default: null
        },
        team1Score: { type: Number, default: 0 },
        team2Score: { type: Number, default: 0 },
        completedBy: String,
        completedAt: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// 인덱스 추가
partySchema.index({ status: 1, createdAt: -1 });
partySchema.index({ hostId: 1, status: 1 });
partySchema.index({ 'participants.userId': 1 });

// 메서드 추가
partySchema.methods.addParticipant = async function(userData) {
    const existing = this.participants.find(p => p.userId === userData.userId);
    if (existing) {
        return { success: false, message: '이미 참여 중입니다.' };
    }
    
    this.participants.push(userData);
    this.updatedAt = new Date();
    await this.save();
    
    return { success: true };
};

partySchema.methods.removeParticipant = async function(userId) {
    const index = this.participants.findIndex(p => p.userId === userId);
    if (index === -1) {
        return { success: false, message: '참여자를 찾을 수 없습니다.' };
    }
    
    this.participants.splice(index, 1);
    this.updatedAt = new Date();
    await this.save();
    
    return { success: true };
};

partySchema.methods.changeTeam = async function(userId, newTeam) {
    const participant = this.participants.find(p => p.userId === userId);
    if (!participant) {
        return { success: false, message: '참여자를 찾을 수 없습니다.' };
    }
    
    participant.team = newTeam;
    this.updatedAt = new Date();
    await this.save();
    
    return { success: true };
};

partySchema.methods.updateDiscordMessage = async function(client) {
    try {
        if (!this.messageId || !this.channelId) return;
        
        const channel = await client.channels.fetch(this.channelId);
        if (!channel) return;
        
        const message = await channel.messages.fetch(this.messageId);
        if (!message) return;
        
        const embed = await this.createDiscordEmbed(client);
        await message.edit({ embeds: [embed] });
        
        return true;
    } catch (error) {
        console.error('Discord 메시지 업데이트 오류:', error);
        return false;
    }
};

// 개선된 Discord 임베드 생성 메서드
partySchema.methods.createDiscordEmbed = async function(client) {
    const CustomEmbedBuilder = require('../utils/embedBuilder');
    const User = require('./User');
    
    const team1 = this.participants.filter(p => p.team === 'team1');
    const team2 = this.participants.filter(p => p.team === 'team2');
    const waitlist = this.participants.filter(p => p.team === 'waitlist');
    
    // 파티 타입별 이모지와 색상
    const partyTypeData = {
        '정규전': { emoji: '⚔️', color: 0xED4245 },
        '모의전': { emoji: '🛡️', color: 0x5865F2 },
        '훈련': { emoji: '🎯', color: 0xFEE75C },
        'PVP': { emoji: '🏆', color: 0xEB459E },
        '검은발톱': { emoji: '🦅', color: 0x57F287 },
        '레이드': { emoji: '🏜️', color: 0xFAA61A }
    };
    
    const typeData = partyTypeData[this.type] || { emoji: '🎮', color: 0x5865F2 };
    
    // 상태별 표시
    const statusDisplay = {
        recruiting: '🟢 모집 중',
        in_progress: '🟡 진행 중',
        completed: '⚫ 완료됨',
        cancelled: '🔴 취소됨'
    };
    
    // 길드 정보 미리 가져오기
    let guild = null;
    if (client) {
        try {
            guild = await client.guilds.fetch(this.guildId);
        } catch (error) {
            console.log('길드를 가져올 수 없음:', error.message);
        }
    }
    
    // 참여자 전적 정보 가져오기
    const formatParticipant = async (participant) => {
        try {
            // Discord에서 길드 멤버 정보 가져오기
            let displayName = participant.username;
            if (guild) {
                try {
                    const member = await guild.members.fetch(participant.userId);
                    displayName = member.nickname || member.user.username;
                } catch (memberError) {
                    console.log('멤버 정보를 가져올 수 없음:', participant.userId);
                }
            }
            
            const user = await User.findOne({ discordId: participant.userId });
            if (user && user.gameStats) {
                const winRate = user.gameStats.totalGames > 0 
                    ? Math.round((user.gameStats.wins / user.gameStats.totalGames) * 100)
                    : 0;
                const kdRatio = user.gameStats.totalDeaths > 0
                    ? (user.gameStats.totalKills / user.gameStats.totalDeaths).toFixed(2)
                    : user.gameStats.totalKills;
                
                return `${displayName} | 승률 ${winRate}% | K/D ${kdRatio}`;
            }
            return displayName;
        } catch (error) {
            console.error('참여자 정보 조회 오류:', error);
            return participant.username || '알 수 없음';
        }
    };
    
    // 팀별 참여자 목록 생성
    const formatTeam = async (team, maxDisplay = 5) => {
        if (team.length === 0) return '```\n참여자 없음\n```';
        
        const formatted = await Promise.all(
            team.slice(0, maxDisplay).map(p => formatParticipant(p))
        );
        
        let result = '```\n' + formatted.join('\n');
        if (team.length > maxDisplay) {
            result += `\n... 외 ${team.length - maxDisplay}명`;
        }
        result += '\n```';
        
        return result;
    };
    
    // 임베드 생성
    const embed = CustomEmbedBuilder.createBasicEmbed({
        title: `${typeData.emoji} ${this.title}`,
        color: typeData.color,
        fields: [
            {
                name: '📋 파티 정보',
                value: `**타입:** ${this.type}\n**상태:** ${statusDisplay[this.status]}\n**주최자:** <@${this.hostId}>`,
                inline: true
            },
            {
                name: '⏰ 일정',
                value: this.startTime 
                    ? `**시작:** ${new Date(this.startTime).toLocaleString('ko-KR')}`
                    : '**시작:** 미정',
                inline: true
            },
            {
                name: '📊 참여 현황',
                value: `**총원:** ${this.participants.length}명\n**1팀:** ${team1.length}명 | **2팀:** ${team2.length}명\n**대기:** ${waitlist.length}명`,
                inline: true
            }
        ]
    });
    
    // 설명 추가
    if (this.description) {
        embed.setDescription(`📝 **설명**\n${this.description}`);
    }
    
    // 참가 조건 추가
    if (this.requirements) {
        embed.addFields({
            name: '⚠️ 참가 조건',
            value: this.requirements,
            inline: false
        });
    }
    
    // 팀 구성 표시
    embed.addFields(
        {
            name: `⚔️ 1팀 (${team1.length}명)`,
            value: await formatTeam(team1),
            inline: true
        },
        {
            name: `🛡️ 2팀 (${team2.length}명)`,
            value: await formatTeam(team2),
            inline: true
        },
        {
            name: `⏳ 대기자 (${waitlist.length}명)`,
            value: await formatTeam(waitlist),
            inline: false
        }
    );
    
    // 푸터 설정
    embed.setFooter({
        text: `파티 ID: ${this.partyId} • ${new Date().toLocaleString('ko-KR')}`,
        iconURL: 'https://i.imgur.com/Sd8qK9c.gif'
    });
    
    // 썸네일 설정 (파티 타입별 이미지)
    const thumbnails = {
        '정규전': 'https://i.imgur.com/IOPA7gL.gif',
        '모의전': 'https://i.imgur.com/IOPA7gL.gif',
        '훈련': 'https://i.imgur.com/IOPA7gL.gif',
        'PVP': 'https://i.imgur.com/IOPA7gL.gif',
        '검은발톱': 'https://i.imgur.com/IOPA7gL.gif',
        '레이드': 'https://i.imgur.com/IOPA7gL.gif'
    };
    
    embed.setThumbnail(thumbnails[this.type] || 'https://i.imgur.com/IOPA7gL.gif');
    
    return embed;
};

module.exports = mongoose.model('Party', partySchema);
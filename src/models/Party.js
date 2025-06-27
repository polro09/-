// src/models/Party.js
const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true
    },
    username: String,
    nickname: String,
    avatar: String,
    discordId: String,
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
    tier: {
        type: String,
        default: 'Unranked'
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
    hostNickname: String,
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
    
    // 전적 기록 관련 필드 추가
    recordSaved: {
        type: Boolean,
        default: false
    },
    recordSavedAt: {
        type: Date
    },
    recordSavedBy: {
        type: String // Discord User ID
    },
    matchResult: {
        winner: String, // 'win', 'lose', 'team1', 'team2'
        participantKills: {
            type: Map,
            of: Number
        }
    },
    
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
    notified: {
        startReminder: { type: Boolean, default: false }
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
    
    // 호스트가 나가는 경우 처리
    if (this.hostId === userId) {
        if (this.participants.length > 1) {
            // 다음 참여자에게 호스트 권한 이양
            const nextHost = this.participants.find(p => p.userId !== userId);
            if (nextHost) {
                this.hostId = nextHost.userId;
                this.hostName = nextHost.username;
                this.hostNickname = nextHost.nickname || nextHost.username;
            }
        } else {
            // 마지막 참여자인 경우 파티 취소
            this.status = 'cancelled';
        }
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
    
    // 참여자 전적 정보 가져오기 (수정된 포맷)
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
                const totalGames = user.gameStats.totalGames || 0;
                
                // 국가 이모지
                const countryEmoji = {
                    'empire': '🏛️',
                    'vlandia': '🛡️',
                    'battania': '🏹',
                    'sturgia': '❄️',
                    'khuzait': '🐎',
                    'aserai': '☀️'
                };
                
                // 티어 표시
                const tierDisplay = participant.tier || 'Unranked';
                
                // 여백을 줄인 포맷
                let info = `${displayName}`;
                
                // 국가, 티어, 병종을 공백 없이 연결
                const additionalInfo = [];
                if (participant.country) additionalInfo.push(`${countryEmoji[participant.country] || '🏳️'}`);
                if (participant.tier) additionalInfo.push(`${tierDisplay}`);
                if (participant.unit) additionalInfo.push(`${participant.unit}`);
                
                if (additionalInfo.length > 0) {
                    info += ` |${additionalInfo.join('|')}`;
                }
                
                // W/R과 T/R 형식 수정 (% 앞에 공백 추가, game 제거)
                info += ` | W/R: ${winRate} % | T/R: ${totalGames}`;
                
                return info;
            }
            
            // 전적 정보가 없는 경우
            let info = displayName;
            const additionalInfo = [];
            if (participant.country) {
                const countryEmoji = {
                    'empire': '🏛️',
                    'vlandia': '🛡️',
                    'battania': '🏹',
                    'sturgia': '❄️',
                    'khuzait': '🐎',
                    'aserai': '☀️'
                };
                additionalInfo.push(`${countryEmoji[participant.country] || '🏳️'}`);
            }
            if (participant.tier) additionalInfo.push(`${participant.tier}`);
            if (participant.unit) additionalInfo.push(`${participant.unit}`);
            
            if (additionalInfo.length > 0) {
                info += ` |${additionalInfo.join('|')}`;
            }
            
            return info;
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
                    ? `<t:${Math.floor(new Date(this.startTime).getTime() / 1000)}:F>`
                    : '시간 미정',
                inline: true
            },
            {
                name: '👥 참여자',
                value: `전체: ${this.participants.length}명\n1팀: ${team1.length}명 | 2팀: ${team2.length}명`,
                inline: true
            },
            {
                name: `⚔️ 1팀 (${team1.length}명)`,
                value: await formatTeam(team1),
                inline: false
            },
            {
                name: `🛡️ 2팀 (${team2.length}명)`,
                value: await formatTeam(team2),
                inline: false
            }
        ],
        footer: {
            text: `파티 ID: ${this.partyId} | ${this.requirements || '참가 제한 없음'}`,
            iconURL: 'https://i.imgur.com/Sd8qK9c.gif'
        }
    });
    
    // 대기자가 있는 경우 추가
    if (waitlist.length > 0) {
        embed.addFields({
            name: `⏳ 대기자 (${waitlist.length}명)`,
            value: await formatTeam(waitlist),
            inline: false
        });
    }
    
    // 설명이 있는 경우 추가
    if (this.description) {
        embed.setDescription(this.description);
    }
    
    return embed;
};

module.exports = mongoose.model('Party', partySchema);
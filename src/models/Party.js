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
        
        const embed = await this.createDiscordEmbed();
        await message.edit({ embeds: [embed] });
        
        return true;
    } catch (error) {
        console.error('Discord 메시지 업데이트 오류:', error);
        return false;
    }
};

partySchema.methods.createDiscordEmbed = async function() {
    const CustomEmbedBuilder = require('../utils/embedBuilder');
    
    const team1 = this.participants.filter(p => p.team === 'team1');
    const team2 = this.participants.filter(p => p.team === 'team2');
    const waitlist = this.participants.filter(p => p.team === 'waitlist');
    
    const statusEmoji = {
        recruiting: '🟢',
        in_progress: '🟡',
        completed: '⚫',
        cancelled: '🔴'
    };
    
    const embed = CustomEmbedBuilder.createBasicEmbed({
        title: `${statusEmoji[this.status]} ${this.title}`,
        description: this.description || '설명이 없습니다.',
        fields: [
            {
                name: '🎮 파티 타입',
                value: this.type,
                inline: true
            },
            {
                name: '👤 주최자',
                value: `<@${this.hostId}>`,
                inline: true
            },
            {
                name: '⏰ 시작 시간',
                value: this.startTime ? new Date(this.startTime).toLocaleString('ko-KR') : '미정',
                inline: true
            },
            {
                name: `⚔️ 팀 1 (${team1.length}명)`,
                value: team1.length > 0 
                    ? team1.slice(0, 10).map(p => `<@${p.userId}>`).join('\n') + (team1.length > 10 ? `\n... 외 ${team1.length - 10}명` : '')
                    : '참여자 없음',
                inline: true
            },
            {
                name: `🛡️ 팀 2 (${team2.length}명)`,
                value: team2.length > 0 
                    ? team2.slice(0, 10).map(p => `<@${p.userId}>`).join('\n') + (team2.length > 10 ? `\n... 외 ${team2.length - 10}명` : '')
                    : '참여자 없음',
                inline: true
            },
            {
                name: `⏳ 대기자 (${waitlist.length}명)`,
                value: waitlist.length > 0 
                    ? waitlist.slice(0, 10).map(p => `<@${p.userId}>`).join('\n') + (waitlist.length > 10 ? `\n... 외 ${waitlist.length - 10}명` : '')
                    : '대기자 없음',
                inline: true
            }
        ],
        footer: {
            text: `파티 ID: ${this.partyId} | 상태: ${this.status}`,
            iconURL: 'https://i.imgur.com/Sd8qK9c.gif'
        },
        timestamp: this.updatedAt
    });
    
    // 결과가 있는 경우 추가
    if (this.status === 'completed' && this.result.winner) {
        embed.addFields({
            name: '🏆 결과',
            value: `승리: ${this.result.winner === 'draw' ? '무승부' : this.result.winner} | 점수: ${this.result.team1Score} - ${this.result.team2Score}`,
            inline: false
        });
    }
    
    return embed;
};

module.exports = mongoose.model('Party', partySchema);
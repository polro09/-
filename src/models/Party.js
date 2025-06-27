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
            // 별명 우선 표시 (사이트에서 설정한 별명)
            let displayName = participant.nickname || participant.username;
            
            const user = await User.findOne({ discordId: participant.userId });
            if (user && user.gameStats) {
                const totalGames = user.gameStats.totalGames || 0;
                const wins = user.gameStats.wins || 0;
                const totalKills = user.gameStats.totalKills || 0;
                const totalDeaths = user.gameStats.totalDeaths || 0;
                const totalRounds = user.gameStats.totalRounds || totalGames; // 라운드 수 (없으면 게임 수로 대체)
                
                // W/R (Win Rate) 계산
                const winRate = totalGames > 0 
                    ? Math.round((wins / totalGames) * 100)
                    : 0;
                
                // K/R (Kill per Round) 계산
                const killPerRound = totalRounds > 0
                    ? (totalKills / totalRounds).toFixed(2)
                    : '0.00';
                
                // T/R (Total Rounds) - 총 라운드 수
                const totalRoundDisplay = totalRounds;
                
                // 국가 정보
                const countryNames = {
                    'empire': '제국',
                    'vlandia': '블란디아',
                    'battania': '바타니아',
                    'sturgia': '스투르기아',
                    'khuzait': '쿠자이트',
                    'aserai': '아세라이'
                };
                
                const countryEmoji = {
                    'empire': '🏛️',
                    'vlandia': '🛡️',
                    'battania': '🏹',
                    'sturgia': '❄️',
                    'khuzait': '🐎',
                    'aserai': '☀️'
                };
                
                // 병력 이름 한글화
                const unitNames = {
                    'shield_infantry': '방패보병',
                    'spear_infantry': '창보병',
                    'polearm_infantry': '폴암병',
                    'archer': '궁병',
                    'crossbow': '석궁병',
                    'cavalry': '기병',
                    'spear_cavalry': '창기병',
                    'horse_archer': '궁기병',
                    'infantry': '보병',
                    'skirmisher': '투척병'
                };
                
                const country = participant.country || user.preferredCountry || '';
                const countryDisplay = country ? `${countryEmoji[country] || ''}${countryNames[country] || country}` : '';
                const unitDisplay = participant.unit ? unitNames[participant.unit] || participant.unit : '';
                
                // 티어 표시
                const tier = participant.tier || '5t';
                
                // 포맷: 별명 | 국가 | 티어 | 병력
                // K/R | W/R | T/R (다음 줄)
                let info = `${displayName}`;
                
                const additionalInfo = [];
                if (countryDisplay) additionalInfo.push(countryDisplay);
                if (tier) additionalInfo.push(tier);
                if (unitDisplay) additionalInfo.push(unitDisplay);
                
                if (additionalInfo.length > 0) {
                    info += ` | ${additionalInfo.join(' | ')}`;
                }
                
                // 전적 정보는 다음 줄에 추가
                info += `\nK/R: ${killPerRound} | W/R: ${winRate}% | T/R: ${totalRoundDisplay}`;
                
                return info;
            }
            
            // 전적 정보가 없는 경우
            let info = displayName;
            const additionalInfo = [];
            
            // 국가 정보
            const countryNames = {
                'empire': '제국',
                'vlandia': '블란디아',
                'battania': '바타니아',
                'sturgia': '스투르기아',
                'khuzait': '쿠자이트',
                'aserai': '아세라이'
            };
            
            const countryEmoji = {
                'empire': '🏛️',
                'vlandia': '🛡️',
                'battania': '🏹',
                'sturgia': '❄️',
                'khuzait': '🐎',
                'aserai': '☀️'
            };
            
            // 병력 이름 한글화
            const unitNames = {
                'shield_infantry': '방패보병',
                'spear_infantry': '창보병',
                'polearm_infantry': '폴암병',
                'archer': '궁병',
                'crossbow': '석궁병',
                'cavalry': '기병',
                'spear_cavalry': '창기병',
                'horse_archer': '궁기병',
                'infantry': '보병',
                'skirmisher': '투척병'
            };
            
            if (participant.country) {
                const countryDisplay = `${countryEmoji[participant.country] || ''}${countryNames[participant.country] || participant.country}`;
                additionalInfo.push(countryDisplay);
            }
            if (participant.tier) additionalInfo.push(participant.tier);
            if (participant.unit) {
                const unitDisplay = unitNames[participant.unit] || participant.unit;
                additionalInfo.push(unitDisplay);
            }
            
            if (additionalInfo.length > 0) {
                info += ` | ${additionalInfo.join(' | ')}`;
            }
            
            // 전적 정보가 없는 경우 기본값 표시
            info += `\nK/R: 0.00 | W/R: 0% | T/R: 0`;
            
            return info;
        } catch (error) {
            console.error('참여자 정보 조회 오류:', error);
            return participant.nickname || participant.username || '알 수 없음';
        }
    };
    
    // 팀별 참여자 목록 생성
    const formatTeam = async (team, maxDisplay = 5) => {
        if (team.length === 0) return '```\n참여자 없음\n```';
        
        const formatted = await Promise.all(
            team.slice(0, maxDisplay).map(p => formatParticipant(p))
        );
        
        let result = '```\n' + formatted.join('\n\n');
        if (team.length > maxDisplay) {
            result += `\n\n... 외 ${team.length - maxDisplay}명`;
        }
        result += '\n```';
        
        return result;
    };
    
    // 타입에 따라 다른 팀 구성 표시
    const isTeamBasedType = this.type === '모의전' || this.type === '훈련';
    
    // 기본 필드 설정
    const fields = [
        {
            name: '📋 파티 정보',
            value: `**타입:** ${this.type}\n**상태:** ${statusDisplay[this.status]}\n**주최자:** <@${this.hostId}>`,
            inline: true
        },
        {
            name: '⏰ 일정',
            value: this.startTime 
                ? `<t:${Math.floor(new Date(this.startTime).getTime() / 1000)}:D>\n<t:${Math.floor(new Date(this.startTime).getTime() / 1000)}:t>`
                : '시간 미정',
            inline: true
        }
    ];
    
    // 팀 기반 파티 (모의전, 훈련)
    if (isTeamBasedType) {
        fields.push({
            name: '👥 참여자',
            value: `전체: ${this.participants.length}명\n1팀: ${team1.length}명 | 2팀: ${team2.length}명`,
            inline: true
        });
        
        fields.push(
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
        );
    } else {
        // 일반 파티 (정규전 및 기타)
        const activeParticipants = [...team1, ...team2];
        fields.push({
            name: '👥 참여자',
            value: `참여: ${activeParticipants.length}명 | 대기: ${waitlist.length}명`,
            inline: true
        });
        
        fields.push({
            name: `🎮 참여자 (${activeParticipants.length}명)`,
            value: await formatTeam(activeParticipants, 8),
            inline: false
        });
    }
    
    // 임베드 생성
    const embed = CustomEmbedBuilder.createBasicEmbed({
        title: `${typeData.emoji} ${this.title}`,
        color: typeData.color,
        fields: fields,
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
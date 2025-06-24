// src/models/Party.js
const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true
    },
    username: {
        type: String,
        required: true
    },
    nickname: {
        type: String,
        default: null
    },
    avatar: {
        type: String,
        default: null
    },
    country: {
        type: String,
        enum: ['empire', 'vlandia', 'battania', 'sturgia', 'khuzait', 'aserai', null],
        default: null
    },
    unit: {
        type: String,
        enum: [
            '5t_polearm_infantry', '5t_shield_infantry', '5t_archer', '5t_crossbow', 
            '5t_spearman', '5t_horse_archer', '5t_lancer', '6t_archer', 
            '6t_horse_archer', '6t_lancer', null
        ],
        default: null
    },
    stats: {
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        winRate: { type: Number, default: 0 },
        avgKills: { type: Number, default: 0 }
    },
    joinedAt: {
        type: Date,
        default: Date.now
    }
});

const partySchema = new mongoose.Schema({
    // 기본 정보
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
    messageId: {
        type: String,
        default: null
    },
    
    // 파티 정보
    type: {
        type: String,
        enum: ['ranked', 'practice', 'training', 'pvp', 'blackclaw', 'raid_desert', 'raid_north'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    
    // 개최자 정보
    hostId: {
        type: String,
        required: true
    },
    hostName: {
        type: String,
        required: true
    },
    
    // 일정
    scheduledDate: {
        type: Date,
        required: true
    },
    scheduledTime: {
        type: String,
        required: true
    },
    preparations: {
        type: String,
        default: ''
    },
    
    // 참여자
    team1: [participantSchema],
    team2: [participantSchema],
    waitlist: [participantSchema],
    
    // 제한
    maxTeamSize: {
        type: Number,
        default: 50
    },
    
    // 상태
    status: {
        type: String,
        enum: ['recruiting', 'in_progress', 'completed', 'cancelled'],
        default: 'recruiting'
    },
    
    // 결과
    result: {
        outcome: {
            type: String,
            enum: ['team1_win', 'team2_win', 'draw', 'completed', null],
            default: null
        },
        team1Score: { type: Number, default: 0 },
        team2Score: { type: Number, default: 0 },
        completedAt: { type: Date, default: null },
        completedBy: { type: String, default: null },
        resultMessage: { type: String, default: '' }
    },
    
    // 전적 기록
    statsRecorded: {
        type: Boolean,
        default: false
    },
    statsRecordedBy: {
        type: String,
        default: null
    },
    statsRecordedAt: {
        type: Date,
        default: null
    },
    
    // 개별 전적 (전적 기록 시 사용)
    playerStats: [{
        userId: String,
        team: Number, // 1 or 2
        kills: { type: Number, default: 0 },
        deaths: { type: Number, default: 0 },
        won: { type: Boolean, default: false }
    }],
    
    // 메타데이터
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// 업데이트 시 updatedAt 자동 갱신
partySchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// 참여자 추가 메서드
partySchema.methods.addParticipant = async function(participant, targetList) {
    // 이미 참여 중인지 확인
    const isInTeam1 = this.team1.some(p => p.userId === participant.userId);
    const isInTeam2 = this.team2.some(p => p.userId === participant.userId);
    const isInWaitlist = this.waitlist.some(p => p.userId === participant.userId);
    
    if (isInTeam1 || isInTeam2 || isInWaitlist) {
        throw new Error('이미 파티에 참여 중입니다.');
    }
    
    // 팀 크기 확인
    if ((targetList === 'team1' && this.team1.length >= this.maxTeamSize) ||
        (targetList === 'team2' && this.team2.length >= this.maxTeamSize)) {
        throw new Error('팀이 가득 찼습니다.');
    }
    
    this[targetList].push(participant);
    await this.save();
};

// 참여자 이동 메서드
partySchema.methods.moveParticipant = async function(userId, from, to) {
    let participant = null;
    
    // from 리스트에서 제거
    const fromIndex = this[from].findIndex(p => p.userId === userId);
    if (fromIndex !== -1) {
        participant = this[from].splice(fromIndex, 1)[0];
    } else {
        throw new Error('참여자를 찾을 수 없습니다.');
    }
    
    // to 리스트에 추가
    if (to !== 'remove') {
        // 팀 크기 확인
        if ((to === 'team1' || to === 'team2') && this[to].length >= this.maxTeamSize) {
            // 원래 위치로 복원
            this[from].splice(fromIndex, 0, participant);
            throw new Error('대상 팀이 가득 찼습니다.');
        }
        this[to].push(participant);
    }
    
    await this.save();
};

// 파티 종료 메서드
partySchema.methods.completeParty = async function(outcome, completedBy) {
    this.status = 'completed';
    this.result.outcome = outcome;
    this.result.completedAt = new Date();
    this.result.completedBy = completedBy;
    await this.save();
};

module.exports = mongoose.model('Party', partySchema);
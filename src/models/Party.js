// src/models/Party.js
const mongoose = require('mongoose');

const partySchema = new mongoose.Schema({
    // 기본 정보
    name: {
        type: String,
        required: true,
        maxLength: 50
    },
    game: {
        type: String,
        required: true,
        enum: ['valorant', 'leagueoflegends', 'overwatch', 'other']
    },
    mode: {
        type: String,
        required: true
    },
    
    // 파티 설정
    maxMembers: {
        type: Number,
        required: true,
        min: 2,
        max: 10,
        default: 5
    },
    minTier: {
        type: String,
        default: '제한 없음'
    },
    voiceRequired: {
        type: Boolean,
        default: false
    },
    description: {
        type: String,
        maxLength: 200
    },
    
    // 리더와 멤버
    leader: {
        type: String,
        required: true,
        ref: 'User'
    },
    members: [{
        user: {
            type: String,
            ref: 'User'
        },
        role: {
            type: String,
            enum: ['leader', 'member'],
            default: 'member'
        },
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // 상태
    status: {
        type: String,
        enum: ['waiting', 'in_game', 'completed', 'cancelled'],
        default: 'waiting'
    },
    
    // Discord 정보
    guildId: {
        type: String,
        default: null
    },
    voiceChannelId: {
        type: String,
        default: null
    },
    textChannelId: {
        type: String,
        default: null
    },
    messageId: {
        type: String,
        default: null
    },
    
    // 게임 결과
    gameResult: {
        winner: { type: Boolean, default: null },
        mvp: { type: String, default: null },
        stats: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    
    // 타임스탬프
    createdAt: {
        type: Date,
        default: Date.now
    },
    startedAt: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// 인덱스
partySchema.index({ status: 1, createdAt: -1 });
partySchema.index({ leader: 1 });
partySchema.index({ 'members.user': 1 });
partySchema.index({ game: 1, mode: 1 });

// 가상 필드
partySchema.virtual('currentMembers').get(function() {
    return this.members.length;
});

partySchema.virtual('isFull').get(function() {
    return this.members.length >= this.maxMembers;
});

// 업데이트 시 updatedAt 갱신
partySchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// 파티 시작 메서드
partySchema.methods.startGame = async function() {
    this.status = 'in_game';
    this.startedAt = new Date();
    await this.save();
};

// 파티 완료 메서드
partySchema.methods.completeGame = async function(result) {
    this.status = 'completed';
    this.completedAt = new Date();
    if (result) {
        this.gameResult = result;
    }
    await this.save();
};

// 멤버 추가 메서드
partySchema.methods.addMember = async function(userId) {
    if (this.isFull) {
        throw new Error('파티가 가득 찼습니다.');
    }
    
    if (this.members.some(m => m.user === userId)) {
        throw new Error('이미 파티에 참가했습니다.');
    }
    
    this.members.push({
        user: userId,
        role: 'member',
        joinedAt: new Date()
    });
    
    await this.save();
};

// 멤버 제거 메서드
partySchema.methods.removeMember = async function(userId) {
    const index = this.members.findIndex(m => m.user === userId);
    
    if (index === -1) {
        throw new Error('파티 멤버가 아닙니다.');
    }
    
    this.members.splice(index, 1);
    await this.save();
};

module.exports = mongoose.model('Party', partySchema);
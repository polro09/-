// src/models/PartyMember.js
const mongoose = require('mongoose');

const partyMemberSchema = new mongoose.Schema({
    // 사용자 정보
    userId: {
        type: String,
        required: true,
        ref: 'User'
    },
    partyId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Party'
    },
    
    // 게임 정보
    gameProfile: {
        nickname: { type: String, default: null },
        tier: { type: String, default: '언랭' },
        mainRole: { type: String, default: null },
        preferredRoles: [{ type: String }],
        winRate: { type: Number, default: 0 },
        kda: { type: Number, default: 0 }
    },
    
    // 파티 내 역할
    role: {
        type: String,
        enum: ['leader', 'member'],
        default: 'member'
    },
    
    // 활동 기록
    activity: {
        totalParties: { type: Number, default: 0 },
        completedGames: { type: Number, default: 0 },
        wins: { type: Number, default: 0 },
        mvpCount: { type: Number, default: 0 },
        lastActive: { type: Date, default: Date.now }
    },
    
    // 평가
    rating: {
        communication: { type: Number, default: 5, min: 1, max: 5 },
        teamwork: { type: Number, default: 5, min: 1, max: 5 },
        skill: { type: Number, default: 5, min: 1, max: 5 },
        totalRatings: { type: Number, default: 0 }
    },
    
    // 상태
    status: {
        type: String,
        enum: ['active', 'inactive', 'banned'],
        default: 'active'
    },
    
    // 설정
    preferences: {
        autoJoinVoice: { type: Boolean, default: true },
        showProfile: { type: Boolean, default: true },
        receiveInvites: { type: Boolean, default: true }
    },
    
    // 타임스탬프
    joinedAt: {
        type: Date,
        default: Date.now
    },
    leftAt: {
        type: Date,
        default: null
    }
});

// 인덱스
partyMemberSchema.index({ userId: 1, partyId: 1 }, { unique: true });
partyMemberSchema.index({ userId: 1, status: 1 });

// 평균 평점 계산
partyMemberSchema.virtual('averageRating').get(function() {
    const { communication, teamwork, skill } = this.rating;
    return ((communication + teamwork + skill) / 3).toFixed(1);
});

// 승률 계산
partyMemberSchema.virtual('winRate').get(function() {
    if (this.activity.completedGames === 0) return 0;
    return Math.round((this.activity.wins / this.activity.completedGames) * 100);
});

// 활동 업데이트
partyMemberSchema.methods.updateActivity = async function(result) {
    this.activity.lastActive = new Date();
    this.activity.completedGames += 1;
    
    if (result.won) {
        this.activity.wins += 1;
    }
    
    if (result.mvp === this.userId) {
        this.activity.mvpCount += 1;
    }
    
    await this.save();
};

// 평가 추가
partyMemberSchema.methods.addRating = async function(ratings) {
    const { communication, teamwork, skill } = ratings;
    const totalRatings = this.rating.totalRatings + 1;
    
    // 가중 평균 계산
    this.rating.communication = ((this.rating.communication * this.rating.totalRatings) + communication) / totalRatings;
    this.rating.teamwork = ((this.rating.teamwork * this.rating.totalRatings) + teamwork) / totalRatings;
    this.rating.skill = ((this.rating.skill * this.rating.totalRatings) + skill) / totalRatings;
    this.rating.totalRatings = totalRatings;
    
    await this.save();
};

module.exports = mongoose.model('PartyMember', partyMemberSchema);
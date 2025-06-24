// src/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Discord 정보
    userId: {
        type: String,
        required: true,
        unique: true
    },
    username: {
        type: String,
        required: true
    },
    discriminator: {
        type: String,
        default: '0'
    },
    avatar: {
        type: String,
        default: null
    },
    email: {
        type: String,
        default: null
    },
    
    // OAuth 정보
    accessToken: {
        type: String,
        default: null
    },
    refreshToken: {
        type: String,
        default: null
    },
    tokenExpiry: {
        type: Date,
        default: null
    },
    
    // 권한 관리
    permissions: {
        admin: { type: Boolean, default: false },
        premium: { type: Boolean, default: false },
        beta: { type: Boolean, default: false }
    },
    
    // 대시보드 권한
    dashboardRole: {
        type: String,
        enum: ['guest', 'member', 'subadmin', 'admin', 'owner'],
        default: 'guest'
    },
    
    // 닉네임 (대시보드용)
    nickname: {
        type: String,
        default: null,
        maxLength: 20
    },
    
    // 게임 통계 (파티 시스템용)
    gameStats: {
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        totalGames: { type: Number, default: 0 },
        kills: { type: Number, default: 0 },
        deaths: { type: Number, default: 0 },
        rankedGames: { type: Number, default: 0 },
        customGames: { type: Number, default: 0 },
        lastPlayed: Date,
        favoriteCountry: String,
        favoriteUnit: String
    },
    
    // 파티 통계
    partyStats: {
        totalParties: { type: Number, default: 0 },
        partiesCreated: { type: Number, default: 0 },
        partiesJoined: { type: Number, default: 0 },
        favoriteGame: { type: String, default: null },
        preferredRole: { type: String, default: null },
        rating: {
            communication: { type: Number, default: 5, min: 1, max: 5 },
            teamwork: { type: Number, default: 5, min: 1, max: 5 },
            skill: { type: Number, default: 5, min: 1, max: 5 },
            totalRatings: { type: Number, default: 0 }
        }
    },
    
    // 관리 중인 서버 목록
    guilds: [{
        id: String,
        name: String,
        icon: String,
        owner: Boolean,
        permissions: Number
    }],
    
    // 설정
    settings: {
        theme: { type: String, default: 'dark' },
        language: { type: String, default: 'ko' },
        notifications: { type: Boolean, default: true }
    },
    
    // 메타데이터
    firstLogin: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    loginCount: {
        type: Number,
        default: 1
    }
});

// 로그인 시 정보 업데이트
userSchema.methods.updateLogin = async function() {
    this.lastLogin = new Date();
    this.loginCount += 1;
    await this.save();
};

// 전적 승률 계산
userSchema.methods.getWinRate = function() {
    if (this.gameStats.totalGames === 0) return 0;
    return ((this.gameStats.wins / this.gameStats.totalGames) * 100).toFixed(2);
};

// K/D 비율 계산
userSchema.methods.getKDRatio = function() {
    if (this.gameStats.deaths === 0) return this.gameStats.kills;
    return (this.gameStats.kills / this.gameStats.deaths).toFixed(2);
};

// 평균 평점 계산
userSchema.methods.getAverageRating = function() {
    const { communication, teamwork, skill, totalRatings } = this.partyStats.rating;
    if (totalRatings === 0) return 0;
    return ((communication + teamwork + skill) / 3).toFixed(1);
};

module.exports = mongoose.model('User', userSchema);
// src/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Discord 정보
    discordId: {
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
        default: 'member'  // guest가 아닌 member를 기본값으로
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
        totalKills: { type: Number, default: 0 },
        totalDeaths: { type: Number, default: 0 },
        avgKills: { type: Number, default: 0 },
        rankedGames: { type: Number, default: 0 },
        practiceGames: { type: Number, default: 0 },
        winRate: { type: Number, default: 0 },
        killRank: { type: Number, default: 0 },
        teamRank: { type: Number, default: 0 },
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
        permissions: String  // BigInt는 String으로 저장
    }],
    
    // 설정
    settings: {
        theme: { type: String, default: 'dark' },
        language: { type: String, default: 'ko' },
        notifications: {
            partyInvites: { type: Boolean, default: true },
            partyReminders: { type: Boolean, default: true },
            gameResults: { type: Boolean, default: true }
        }
    },
    
    // 상태
    status: {
        banned: { type: Boolean, default: false },
        banReason: { type: String, default: null },
        warningCount: { type: Number, default: 0 }
    },
    
    // 타임스탬프
    firstLogin: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// 인덱스
userSchema.index({ discordId: 1 });
userSchema.index({ username: 1 });
userSchema.index({ dashboardRole: 1 });

// 가상 필드
userSchema.virtual('displayName').get(function() {
    return this.nickname || this.username;
});

// 승률 계산
userSchema.virtual('winRate').get(function() {
    if (this.gameStats.totalGames === 0) return 0;
    return Math.round((this.gameStats.wins / this.gameStats.totalGames) * 100);
});

// K/D 비율 계산
userSchema.virtual('kdRatio').get(function() {
    if (this.gameStats.totalDeaths === 0) return this.gameStats.totalKills;
    return (this.gameStats.totalKills / this.gameStats.totalDeaths).toFixed(2);
});

// 메서드
userSchema.methods.updateLogin = async function() {
    this.lastLogin = new Date();
    return this.save();
};

userSchema.methods.updateGameStats = async function(gameResult) {
    const { won, kills, deaths, gameType } = gameResult;
    
    this.gameStats.totalGames += 1;
    this.gameStats.totalKills += kills || 0;
    this.gameStats.totalDeaths += deaths || 0;
    
    if (won) {
        this.gameStats.wins += 1;
    } else {
        this.gameStats.losses += 1;
    }
    
    if (gameType === 'ranked') {
        this.gameStats.rankedGames += 1;
    } else if (gameType === 'practice') {
        this.gameStats.practiceGames += 1;
    }
    
    // 평균 킬 계산
    this.gameStats.avgKills = Math.round(this.gameStats.totalKills / this.gameStats.totalGames);
    this.gameStats.lastPlayed = new Date();
    
    return this.save();
};

userSchema.methods.addWarning = async function(reason) {
    this.status.warningCount += 1;
    
    if (this.status.warningCount >= 3) {
        this.status.banned = true;
        this.status.banReason = `경고 3회 누적: ${reason}`;
    }
    
    return this.save();
};

module.exports = mongoose.model('User', userSchema);
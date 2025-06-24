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
        required: true
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
        required: true
    },
    refreshToken: {
        type: String,
        required: true
    },
    tokenExpiry: {
        type: Date,
        required: true
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

module.exports = mongoose.model('User', userSchema);
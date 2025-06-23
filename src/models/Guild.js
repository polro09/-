// src/models/Guild.js
const mongoose = require('mongoose');

const guildSchema = new mongoose.Schema({
    // 기본 정보
    guildId: {
        type: String,
        required: true,
        unique: true
    },
    guildName: {
        type: String,
        required: true
    },
    
    // 모듈 설정 (웹사이트에서 관리 가능)
    modules: {
        welcome: {
            enabled: { type: Boolean, default: false },
            channel: { type: String, default: null },
            message: { type: String, default: null }
        },
        moderation: {
            enabled: { type: Boolean, default: true },
            logChannel: { type: String, default: null },
            autoModEnabled: { type: Boolean, default: false },
            bannedWords: { type: [String], default: [] }
        },
        leveling: {
            enabled: { type: Boolean, default: false },
            channel: { type: String, default: null },
            multiplier: { type: Number, default: 1 }
        },
        tickets: {
            enabled: { type: Boolean, default: false },
            category: { type: String, default: null },
            supportRole: { type: String, default: null }
        },
        music: {
            enabled: { type: Boolean, default: false },
            djRole: { type: String, default: null },
            volume: { type: Number, default: 50 }
        }
    },
    
    // 기본 설정
    prefix: {
        type: String,
        default: '!'
    },
    language: {
        type: String,
        default: 'ko'
    },
    
    // 환영 시스템
    welcomeChannel: {
        type: String,
        default: null
    },
    welcomeMessage: {
        type: String,
        default: '{user}님, {server}에 오신 것을 환영합니다!'
    },
    
    // 자동 역할
    autoRole: {
        type: String,
        default: null
    },
    
    // 로깅
    logChannel: {
        type: String,
        default: null
    },
    
    // 프리미엄 상태
    premium: {
        enabled: { type: Boolean, default: false },
        expiresAt: { type: Date, default: null }
    },
    
    // 메타데이터
    addedAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// 업데이트 시 updatedAt 자동 갱신
guildSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Guild', guildSchema);
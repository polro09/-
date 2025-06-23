// src/models/BotStatus.js
const mongoose = require('mongoose');

const botStatusSchema = new mongoose.Schema({
    // 봇 상태
    status: {
        type: String,
        enum: ['online', 'offline', 'restarting', 'maintenance'],
        default: 'offline'
    },
    
    // 봇 정보
    botId: {
        type: String,
        required: true
    },
    botName: {
        type: String,
        required: true
    },
    
    // 통계
    statistics: {
        guilds: { type: Number, default: 0 },
        users: { type: Number, default: 0 },
        channels: { type: Number, default: 0 },
        commands: { type: Number, default: 0 },
        uptime: { type: Number, default: 0 },
        memoryUsage: { type: Number, default: 0 },
        cpuUsage: { type: Number, default: 0 }
    },
    
    // 실행 정보
    runtime: {
        startedAt: { type: Date, default: null },
        lastRestart: { type: Date, default: null },
        crashes: { type: Number, default: 0 },
        restarts: { type: Number, default: 0 }
    },
    
    // 버전 정보
    version: {
        bot: { type: String, default: '1.0.0' },
        node: { type: String, default: process.version },
        discord: { type: String, default: '14.14.1' }
    },
    
    // 로그
    logs: [{
        level: String,
        message: String,
        category: String,
        timestamp: { type: Date, default: Date.now }
    }],
    
    // 마지막 업데이트
    lastUpdate: {
        type: Date,
        default: Date.now
    }
});

// 로그 추가 메서드 (최대 1000개 유지)
botStatusSchema.methods.addLog = async function(level, message, category) {
    this.logs.push({ level, message, category });
    
    // 최대 1000개의 로그만 유지
    if (this.logs.length > 1000) {
        this.logs = this.logs.slice(-1000);
    }
    
    await this.save();
};

// 통계 업데이트 메서드
botStatusSchema.methods.updateStatistics = async function(stats) {
    this.statistics = { ...this.statistics, ...stats };
    this.lastUpdate = new Date();
    await this.save();
};

module.exports = mongoose.model('BotStatus', botStatusSchema);
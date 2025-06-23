// src/models/Component.js
const mongoose = require('mongoose');

const componentSchema = new mongoose.Schema({
    // 컴포넌트 식별 정보
    customId: {
        type: String,
        required: true,
        unique: true
    },
    type: {
        type: String,
        enum: ['button', 'menu', 'modal'],
        required: true
    },
    
    // 관련 정보
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
        required: true
    },
    
    // 컴포넌트 데이터
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    // 핸들러 정보
    handlerName: {
        type: String,
        required: true
    },
    
    // 상태 관리
    active: {
        type: Boolean,
        default: true
    },
    uses: {
        type: Number,
        default: 0
    },
    maxUses: {
        type: Number,
        default: null // null은 무제한
    },
    
    // 만료 시간
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30일
    },
    
    // 메타데이터
    createdBy: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastUsedAt: {
        type: Date,
        default: null
    }
});

// 인덱스 설정
componentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
componentSchema.index({ guildId: 1, active: 1 });

// 사용 횟수 증가 메서드
componentSchema.methods.incrementUses = async function() {
    this.uses += 1;
    this.lastUsedAt = new Date();
    
    // 최대 사용 횟수 확인
    if (this.maxUses && this.uses >= this.maxUses) {
        this.active = false;
    }
    
    await this.save();
};

module.exports = mongoose.model('Component', componentSchema);
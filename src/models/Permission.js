// src/models/Permission.js
const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
    // 권한 레벨
    level: {
        type: String,
        enum: ['guest', 'member', 'subadmin', 'admin', 'owner'],
        default: 'guest',
        required: true
    },
    
    // 권한 수치 (높을수록 더 많은 권한)
    value: {
        type: Number,
        required: true,
        default: 0
    },
    
    // 권한 이름
    name: {
        type: String,
        required: true
    },
    
    // 권한 설명
    description: {
        type: String,
        default: ''
    },
    
    // 허용된 기능들
    permissions: {
        // 대시보드 접근
        dashboard: {
            view: { type: Boolean, default: false },
            statistics: { type: Boolean, default: false },
            logs: { type: Boolean, default: false }
        },
        
        // 봇 제어
        bot: {
            start: { type: Boolean, default: false },
            stop: { type: Boolean, default: false },
            restart: { type: Boolean, default: false },
            commands: { type: Boolean, default: false }
        },
        
        // 서버 관리
        guild: {
            view: { type: Boolean, default: false },
            manage: { type: Boolean, default: false },
            settings: { type: Boolean, default: false }
        },
        
        // 사용자 관리
        users: {
            view: { type: Boolean, default: false },
            manage: { type: Boolean, default: false },
            permissions: { type: Boolean, default: false }
        },
        
        // 시스템 설정
        system: {
            settings: { type: Boolean, default: false },
            modules: { type: Boolean, default: false },
            backup: { type: Boolean, default: false }
        }
    },
    
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

// 기본 권한 설정
const defaultPermissions = {
    guest: {
        level: 'guest',
        value: 0,
        name: '게스트',
        description: '기본 방문자 권한',
        permissions: {
            dashboard: { view: false, statistics: false, logs: false },
            bot: { start: false, stop: false, restart: false, commands: false },
            guild: { view: false, manage: false, settings: false },
            users: { view: false, manage: false, permissions: false },
            system: { settings: false, modules: false, backup: false }
        }
    },
    member: {
        level: 'member',
        value: 1,
        name: '멤버',
        description: '기본 멤버 권한',
        permissions: {
            dashboard: { view: true, statistics: true, logs: false },
            bot: { start: false, stop: false, restart: false, commands: true },
            guild: { view: true, manage: false, settings: false },
            users: { view: true, manage: false, permissions: false },
            system: { settings: false, modules: false, backup: false }
        }
    },
    subadmin: {
        level: 'subadmin',
        value: 2,
        name: '부관리자',
        description: '부관리자 권한',
        permissions: {
            dashboard: { view: true, statistics: true, logs: true },
            bot: { start: false, stop: false, restart: true, commands: true },
            guild: { view: true, manage: true, settings: true },
            users: { view: true, manage: true, permissions: false },
            system: { settings: false, modules: true, backup: false }
        }
    },
    admin: {
        level: 'admin',
        value: 3,
        name: '관리자',
        description: '관리자 권한',
        permissions: {
            dashboard: { view: true, statistics: true, logs: true },
            bot: { start: true, stop: true, restart: true, commands: true },
            guild: { view: true, manage: true, settings: true },
            users: { view: true, manage: true, permissions: true },
            system: { settings: true, modules: true, backup: true }
        }
    },
    owner: {
        level: 'owner',
        value: 4,
        name: '소유자',
        description: '최고 관리자 권한',
        permissions: {
            dashboard: { view: true, statistics: true, logs: true },
            bot: { start: true, stop: true, restart: true, commands: true },
            guild: { view: true, manage: true, settings: true },
            users: { view: true, manage: true, permissions: true },
            system: { settings: true, modules: true, backup: true }
        }
    }
};

// 기본 권한 초기화 메서드
permissionSchema.statics.initializeDefaults = async function() {
    for (const [key, permission] of Object.entries(defaultPermissions)) {
        await this.findOneAndUpdate(
            { level: key },
            permission,
            { upsert: true }
        );
    }
};

module.exports = mongoose.model('Permission', permissionSchema);
module.exports.defaultPermissions = defaultPermissions;
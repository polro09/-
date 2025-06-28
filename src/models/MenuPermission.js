// src/models/MenuPermission.js
const mongoose = require('mongoose');

const menuPermissionSchema = new mongoose.Schema({
    // 메뉴 ID (고유 식별자)
    menuId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    
    // 메뉴 이름
    name: {
        type: String,
        required: true
    },
    
    // 메뉴 설명
    description: {
        type: String,
        default: ''
    },
    
    // 최소 필요 권한
    minRole: {
        type: String,
        enum: ['guest', 'member', 'subadmin', 'admin', 'owner'],
        default: 'member',
        required: true
    },
    
    // 메뉴 경로
    path: {
        type: String,
        default: ''
    },
    
    // 메뉴 아이콘
    icon: {
        type: String,
        default: 'fa-circle'
    },
    
    // 활성화 상태
    isActive: {
        type: Boolean,
        default: true
    },
    
    // 메뉴 순서
    order: {
        type: Number,
        default: 0
    },
    
    // 부모 메뉴 (서브메뉴인 경우)
    parentId: {
        type: String,
        default: null
    },
    
    // 추가 권한 옵션
    permissions: {
        // 읽기 권한
        read: {
            type: Boolean,
            default: true
        },
        // 쓰기 권한
        write: {
            type: Boolean,
            default: false
        },
        // 삭제 권한
        delete: {
            type: Boolean,
            default: false
        },
        // 관리 권한
        manage: {
            type: Boolean,
            default: false
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

// 인덱스
menuPermissionSchema.index({ menuId: 1, minRole: 1 });
menuPermissionSchema.index({ parentId: 1, order: 1 });

// 업데이트 시 updatedAt 자동 갱신
menuPermissionSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// 권한 검증 메서드
menuPermissionSchema.methods.canAccess = function(userRole) {
    const roleValues = {
        guest: 0,
        member: 1,
        subadmin: 2,
        admin: 3,
        owner: 4
    };
    
    const userRoleValue = roleValues[userRole] || 0;
    const minRoleValue = roleValues[this.minRole] || 0;
    
    return userRoleValue >= minRoleValue;
};

// 기본 메뉴 초기화
menuPermissionSchema.statics.initializeDefaults = async function() {
    const defaultMenus = [
        {
            menuId: 'dashboard',
            name: '대시보드',
            description: '메인 대시보드 페이지',
            minRole: 'member',
            path: '/dashboard',
            icon: 'fa-tachometer-alt',
            order: 1
        },
        {
            menuId: 'party',
            name: '파티 시스템',
            description: '파티 생성 및 참여',
            minRole: 'guest',
            path: '/party',
            icon: 'fa-users',
            order: 2
        },
        {
            menuId: 'servers',
            name: '서버 관리',
            description: '디스코드 서버 관리',
            minRole: 'subadmin',
            path: '/dashboard/servers',
            icon: 'fa-server',
            order: 3,
            parentId: 'dashboard'
        },
        {
            menuId: 'db-management',
            name: 'DB 관리',
            description: '데이터베이스 직접 관리',
            minRole: 'subadmin',
            path: '/dashboard/db-management',
            icon: 'fa-database',
            order: 4,
            parentId: 'dashboard'
        },
        {
            menuId: 'permissions',
            name: '권한 관리',
            description: '사용자 및 메뉴 권한 관리',
            minRole: 'admin',
            path: '/dashboard/permissions',
            icon: 'fa-user-shield',
            order: 5,
            parentId: 'dashboard'
        },
        {
            menuId: 'system',
            name: '시스템 설정',
            description: '봇 시스템 전체 설정',
            minRole: 'admin',
            path: '/dashboard/settings',
            icon: 'fa-cog',
            order: 6,
            parentId: 'dashboard'
        }
    ];
    
    for (const menu of defaultMenus) {
        await this.findOneAndUpdate(
            { menuId: menu.menuId },
            menu,
            { upsert: true }
        );
    }
};

// 사용자가 접근 가능한 메뉴 목록 조회
menuPermissionSchema.statics.getAccessibleMenus = async function(userRole) {
    const roleValues = {
        guest: 0,
        member: 1,
        subadmin: 2,
        admin: 3,
        owner: 4
    };
    
    const userRoleValue = roleValues[userRole] || 0;
    
    // 모든 활성 메뉴 조회
    const allMenus = await this.find({ isActive: true }).sort('order');
    
    // 권한에 따라 필터링
    return allMenus.filter(menu => {
        const minRoleValue = roleValues[menu.minRole] || 0;
        return userRoleValue >= minRoleValue;
    });
};

module.exports = mongoose.model('MenuPermission', menuPermissionSchema);
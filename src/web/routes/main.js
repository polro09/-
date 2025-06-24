// src/web/routes/main.js
const express = require('express');
const router = express.Router();
const path = require('path');
const logger = require('../../utils/logger');

// 메인 페이지 - 정적 파일 제공 대신 권한 체크 포함
router.get('/', (req, res) => {
    // 로그인 상태와 권한 정보를 함께 전달
    const userData = req.session.user ? {
        id: req.session.user.id,
        username: req.session.user.username,
        avatar: req.session.user.avatar,
        dashboardRole: req.session.user.dashboardRole || 'guest'
    } : null;
    
    // 권한 레벨 확인
    const permissionLevels = {
        'guest': 0,
        'member': 1,
        'subadmin': 2,
        'admin': 3,
        'owner': 4
    };
    
    const userLevel = userData ? (permissionLevels[userData.dashboardRole] || 0) : 0;
    const showMenu = userLevel >= 1; // member 이상
    
    logger.debug(`메인 페이지 접속 - 사용자: ${userData?.username || '비로그인'}, 권한: ${userData?.dashboardRole || 'guest'}`);
    
    // main.html을 직접 제공 (나중에 템플릿 엔진 사용 시 동적 렌더링 가능)
    res.sendFile(path.join(__dirname, '../public/main.html'));
});

module.exports = router;
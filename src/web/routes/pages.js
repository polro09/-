const express = require('express');
const router = express.Router();
const path = require('path'); // path 모듈 추가

/**
 * 페이지 라우트 - EJS 템플릿 렌더링
 * API 라우트와는 별개의 파일
 */

// 대시보드 페이지
router.get('/dashboard', async (req, res) => {
    // 로그인 확인
    if (!req.session || !req.session.user) {
        return res.redirect('/auth/discord?returnUrl=/dashboard');
    }
    
    try {
        // 봇 클라이언트 가져오기
        const bot = req.app.locals.bot || req.client;
        
        // 초기 통계 데이터
        const stats = {
            guilds: bot?.guilds.cache.size || 0,
            users: bot?.users.cache.size || 0,
            channels: bot?.guilds.cache.reduce((acc, guild) => acc + guild.channels.cache.size, 0) || 0,
            commands: bot?.commands?.size || 0
        };
        
        // EJS 템플릿 렌더링
        res.render('pages/dashboard', {
            title: '대시보드 - Aimdot.dev',
            stats,
            user: req.session.user
        });
    } catch (error) {
        console.error('대시보드 렌더링 오류:', error);
        
        // EJS 파일이 없으면 기존 HTML 사용
        const htmlPath = path.join(__dirname, '../public', 'dashboard.html');
        if (require('fs').existsSync(htmlPath)) {
            res.sendFile(htmlPath);
        } else {
            res.status(500).send('페이지를 불러올 수 없습니다.');
        }
    }
});

// 파티 페이지 (추후 추가 예정)
router.get('/party', async (req, res) => {
    try {
        res.render('pages/party', {
            title: '파티 - Aimdot.dev',
            user: req.session.user || null
        });
    } catch (error) {
        // 아직 EJS 파일이 없으면 기존 HTML 사용
        res.sendFile(path.join(__dirname, '../public', 'party.html'));
    }
});

// 권한 관리 페이지 (추후 추가 예정)
router.get('/dashboard/permissions', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/auth/discord?returnUrl=/dashboard/permissions');
    }
    
    try {
        res.render('pages/permissions', {
            title: '권한 관리 - Aimdot.dev',
            user: req.session.user
        });
    } catch (error) {
        res.sendFile(path.join(__dirname, '../public', 'permissions.html'));
    }
});

module.exports = router;
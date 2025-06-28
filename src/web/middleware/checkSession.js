// src/web/middleware/checkSession.js
const User = require('../../models/User');
const logger = require('../../utils/logger');

/**
 * 세션 검증 및 업데이트 미들웨어
 * 사용자 권한이 변경되었을 경우 세션을 자동으로 업데이트합니다
 */
async function checkSession(req, res, next) {
    try {
        // 로그인되지 않은 경우 통과
        if (!req.session || !req.session.user) {
            return next();
        }

        const userId = req.session.user.id;
        
        // DB에서 최신 사용자 정보 조회
        const user = await User.findOne({ discordId: userId });
        
        if (!user) {
            // 사용자가 삭제된 경우 세션 무효화
            req.session.destroy();
            return res.status(401).json({ error: '사용자를 찾을 수 없습니다.' });
        }

        // 권한이 변경된 경우 세션 업데이트
        if (user.dashboardRole !== req.session.user.dashboardRole) {
            logger.info(`세션 권한 업데이트: ${req.session.user.username} - ${req.session.user.dashboardRole} → ${user.dashboardRole}`, 'session');
            
            // 세션 사용자 정보 업데이트
            req.session.user.dashboardRole = user.dashboardRole;
            
            // 닉네임도 함께 업데이트
            if (user.nickname !== req.session.user.nickname) {
                req.session.user.nickname = user.nickname || user.username;
            }
            
            // 게임 통계도 업데이트
            req.session.user.gameStats = user.gameStats || {
                wins: 0,
                losses: 0,
                totalKills: 0,
                totalDeaths: 0,
                avgKills: 0,
                rankedGames: 0,
                practiceGames: 0
            };
            
            // 세션 저장
            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err) {
                        logger.error(`세션 저장 실패: ${err.message}`, 'session');
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        }

        // 마지막 로그인 시간 업데이트 (5분마다)
        const lastUpdate = user.lastLogin ? new Date(user.lastLogin) : new Date(0);
        const now = new Date();
        const diffMinutes = (now - lastUpdate) / (1000 * 60);
        
        if (diffMinutes > 5) {
            user.lastLogin = now;
            await user.save();
        }

        next();
    } catch (error) {
        logger.error(`세션 확인 오류: ${error.message}`, 'session');
        next(); // 오류가 발생해도 계속 진행
    }
}

/**
 * API 라우트용 세션 검증 미들웨어
 * JSON 응답을 반환합니다
 */
async function checkSessionAPI(req, res, next) {
    try {
        // 로그인되지 않은 경우
        if (!req.session || !req.session.user) {
            return res.status(401).json({ error: '로그인이 필요합니다.' });
        }

        const userId = req.session.user.id;
        
        // DB에서 최신 사용자 정보 조회
        const user = await User.findOne({ discordId: userId });
        
        if (!user) {
            // 사용자가 삭제된 경우 세션 무효화
            req.session.destroy();
            return res.status(401).json({ error: '사용자를 찾을 수 없습니다.' });
        }

        // 권한이 변경된 경우 세션 업데이트
        if (user.dashboardRole !== req.session.user.dashboardRole) {
            logger.info(`API 세션 권한 업데이트: ${req.session.user.username} - ${req.session.user.dashboardRole} → ${user.dashboardRole}`, 'session');
            
            req.session.user.dashboardRole = user.dashboardRole;
            req.session.user.nickname = user.nickname || user.username;
            req.session.user.gameStats = user.gameStats;
            
            // 세션 저장
            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        next();
    } catch (error) {
        logger.error(`API 세션 확인 오류: ${error.message}`, 'session');
        res.status(500).json({ error: '세션 확인 중 오류가 발생했습니다.' });
    }
}

module.exports = {
    checkSession,
    checkSessionAPI
};
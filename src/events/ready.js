// src/events/ready.js
const { Events, ActivityType } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        logger.info(`봇이 준비되었습니다! ${client.user.tag}로 로그인됨`);
        logger.info(`${client.guilds.cache.size}개의 서버에서 활동 중`);
        logger.info(`${client.users.cache.size}명의 사용자와 함께`);
        
        // 봇 상태 설정
        const activities = [
            { name: `${client.guilds.cache.size}개의 서버`, type: ActivityType.Watching },
            { name: '/help | Aimdot.dev', type: ActivityType.Playing },
            { name: '업데이트 확인 중...', type: ActivityType.Custom }
        ];
        
        let activityIndex = 0;
        
        // 상태 메시지 순환
        setInterval(() => {
            const activity = activities[activityIndex];
            client.user.setActivity(activity.name, { type: activity.type });
            activityIndex = (activityIndex + 1) % activities.length;
        }, 30000); // 30초마다 변경
        
        // 초기 상태 설정
        client.user.setActivity(activities[0].name, { type: activities[0].type });
        
        // 봇 상태를 온라인으로 설정
        client.user.setStatus('online');
        
        // 만료된 영속적 컴포넌트 정리 (24시간마다)
        setInterval(async () => {
            try {
                const Component = require('../models/Component');
                const expiredComponents = await Component.deleteMany({
                    expiresAt: { $lt: new Date() }
                });
                
                if (expiredComponents.deletedCount > 0) {
                    logger.info(`${expiredComponents.deletedCount}개의 만료된 컴포넌트 삭제됨`);
                }
            } catch (error) {
                logger.error('만료된 컴포넌트 정리 중 오류:', error);
            }
        }, 24 * 60 * 60 * 1000); // 24시간
    }
};
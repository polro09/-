// src/events/ready.js
const { Events, ActivityType } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        logger.bot(`✅ 봇이 준비되었습니다! ${client.user.tag}로 로그인됨`);
        logger.bot(`📊 ${client.guilds.cache.size}개의 서버에서 활동 중`);
        logger.bot(`👥 ${client.users.cache.size}명의 사용자와 함께`);
        
        // 봇 상태 업데이트 (MongoDB 연결된 경우에만)
        try {
            const BotStatus = require('../models/BotStatus');
            const botStatus = await BotStatus.findOneAndUpdate(
                { botId: client.user.id },
                {
                    botId: client.user.id,
                    botName: client.user.tag,
                    status: 'online',
                    'runtime.startedAt': new Date(),
                    'statistics.guilds': client.guilds.cache.size,
                    'statistics.users': client.users.cache.size,
                    'statistics.channels': client.channels.cache.size,
                    lastUpdate: new Date()
                },
                { upsert: true, new: true }
            );
            
            // 재시작 횟수 증가
            if (botStatus) {
                botStatus.runtime.restarts = (botStatus.runtime.restarts || 0) + 1;
                await botStatus.save();
                
                // 시작 로그 추가
                await botStatus.addLog('info', `봇이 시작되었습니다 (${client.user.tag})`, 'startup');
                await botStatus.addLog('info', `${client.guilds.cache.size}개 서버, ${client.users.cache.size}명 사용자`, 'startup');
                
                logger.database('봇 상태 업데이트 완료');
            }
        } catch (error) {
            logger.database('봇 상태 업데이트 실패 (DB 연결 필요)', 'warn');
            logger.error(`봇 상태 업데이트 오류: ${error.message}`, 'database');
        }
        
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
                    logger.handler(`${expiredComponents.deletedCount}개의 만료된 컴포넌트 삭제됨`);
                }
            } catch (error) {
                logger.error(`만료된 컴포넌트 정리 중 오류: ${error.message}`, 'handler');
            }
        }, 24 * 60 * 60 * 1000); // 24시간
        
        // 통계 업데이트 (5분마다)
        setInterval(async () => {
            try {
                const BotStatus = require('../models/BotStatus');
                await BotStatus.findOneAndUpdate(
                    { botId: client.user.id },
                    {
                        'statistics.guilds': client.guilds.cache.size,
                        'statistics.users': client.users.cache.size,
                        'statistics.channels': client.channels.cache.size,
                        'statistics.uptime': client.uptime,
                        'statistics.memoryUsage': process.memoryUsage().heapUsed,
                        lastUpdate: new Date()
                    }
                );
            } catch (error) {
                logger.error(`통계 업데이트 오류: ${error.message}`, 'database');
            }
        }, 5 * 60 * 1000); // 5분마다
    }
};
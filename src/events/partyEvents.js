// src/events/partyEvents.js
const { Events } = require('discord.js');
const Party = require('../models/Party');
const logger = require('../utils/logger');

module.exports = {
    name: Events.ClientReady,
    once: false,
    async execute(client) {
        // 30분마다 오래된 파티 정리
        setInterval(async () => {
            try {
                const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                
                // 24시간 이상 지난 모집 중인 파티 자동 취소
                const oldParties = await Party.updateMany(
                    {
                        status: 'recruiting',
                        createdAt: { $lt: oneDayAgo }
                    },
                    {
                        status: 'cancelled',
                        updatedAt: new Date()
                    }
                );
                
                if (oldParties.modifiedCount > 0) {
                    logger.party(`${oldParties.modifiedCount}개의 오래된 파티가 자동으로 취소되었습니다.`);
                }
                
                // 7일 이상 지난 완료/취소된 파티 삭제
                const veryOldParties = await Party.deleteMany({
                    status: { $in: ['completed', 'cancelled'] },
                    updatedAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                });
                
                if (veryOldParties.deletedCount > 0) {
                    logger.party(`${veryOldParties.deletedCount}개의 오래된 파티가 삭제되었습니다.`);
                }
            } catch (error) {
                logger.error(`파티 정리 오류: ${error.message}`, 'party');
            }
        }, 30 * 60 * 1000); // 30분

        // 파티 시작 알림 (5분마다 체크)
        setInterval(async () => {
            try {
                const now = new Date();
                const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);
                
                // 5분 내에 시작하는 파티 찾기
                const startingParties = await Party.find({
                    status: 'recruiting',
                    startTime: {
                        $gte: now,
                        $lte: fiveMinutesLater
                    },
                    'notified.startReminder': { $ne: true }
                });
                
                for (const party of startingParties) {
                    try {
                        const channel = await client.channels.fetch(party.channelId);
                        if (!channel) continue;
                        
                        const participants = party.participants.map(p => `<@${p.userId}>`).join(' ');
                        
                        await channel.send({
                            content: `🔔 **파티 시작 알림**\n${participants}\n\n**${party.title}** 파티가 곧 시작됩니다!`,
                            embeds: [await party.createDiscordEmbed()]
                        });
                        
                        // 알림 표시
                        party.notified = party.notified || {};
                        party.notified.startReminder = true;
                        await party.save();
                        
                        logger.party(`파티 시작 알림 전송: ${party.partyId}`);
                    } catch (error) {
                        logger.error(`파티 알림 전송 오류: ${error.message}`, 'party');
                    }
                }
            } catch (error) {
                logger.error(`파티 시작 알림 체크 오류: ${error.message}`, 'party');
            }
        }, 5 * 60 * 1000); // 5분
        
        logger.party('파티 이벤트 핸들러 초기화 완료');
    }
};
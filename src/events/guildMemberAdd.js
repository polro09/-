// src/events/guildMemberAdd.js
const { Events } = require('discord.js');
const logger = require('../utils/logger');
const Guild = require('../models/Guild');
const CustomEmbedBuilder = require('../utils/embedBuilder');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        try {
            // 길드 설정 가져오기
            const guildData = await Guild.findOne({ guildId: member.guild.id });
            
            if (!guildData || !guildData.welcomeChannel) return;
            
            // 환영 채널 찾기
            const welcomeChannel = member.guild.channels.cache.get(guildData.welcomeChannel);
            if (!welcomeChannel) return;
            
            // 환영 메시지 생성
            const welcomeEmbed = CustomEmbedBuilder.createBasicEmbed({
                title: '👋 새로운 멤버',
                description: `${member.user}님, **${member.guild.name}**에 오신 것을 환영합니다!`,
                fields: [
                    {
                        name: '멤버 수',
                        value: `현재 ${member.guild.memberCount}명`,
                        inline: true
                    },
                    {
                        name: '계정 생성일',
                        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
                        inline: true
                    }
                ],
                thumbnail: member.user.displayAvatarURL({ dynamic: true, size: 256 })
            });
            
            await welcomeChannel.send({ embeds: [welcomeEmbed] });
            
            // 자동 역할 부여
            if (guildData.autoRole) {
                const role = member.guild.roles.cache.get(guildData.autoRole);
                if (role && !member.roles.cache.has(role.id)) {
                    await member.roles.add(role, '자동 역할 부여');
                    logger.info(`자동 역할 부여: ${member.user.tag}에게 ${role.name}`);
                }
            }
            
        } catch (error) {
            logger.error('멤버 가입 이벤트 처리 오류:', error);
        }
    }
};
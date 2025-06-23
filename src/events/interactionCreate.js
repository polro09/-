// src/events/interactionCreate.js
const { Events } = require('discord.js');
const logger = require('../utils/logger');
const CustomEmbedBuilder = require('../utils/embedBuilder');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        try {
            // 슬래시 명령어 처리
            if (interaction.isChatInputCommand()) {
                const command = client.commands.get(interaction.commandName);
                
                if (!command) {
                    logger.warn(`존재하지 않는 명령어: ${interaction.commandName}`);
                    return;
                }
                
                try {
                    await command.execute(interaction);
                    logger.info(`명령어 실행: ${interaction.commandName} by ${interaction.user.tag}`);
                } catch (error) {
                    logger.error(`명령어 실행 오류 (${interaction.commandName}):`, error);
                    
                    const errorEmbed = CustomEmbedBuilder.error(
                        '명령어 실행 중 오류가 발생했습니다.\n문제가 지속되면 관리자에게 문의해주세요.'
                    );
                    
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                    } else {
                        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                    }
                }
            }
            
            // 버튼 상호작용 처리
            else if (interaction.isButton()) {
                // 영속적 버튼 처리
                if (interaction.customId.startsWith('persistent_')) {
                    const handler = client.buttons.get(interaction.customId);
                    if (handler) {
                        await handler.execute(interaction);
                        return;
                    }
                }
                
                // 일반 버튼 처리
                const button = client.buttons.get(interaction.customId);
                
                if (!button) {
                    logger.warn(`존재하지 않는 버튼: ${interaction.customId}`);
                    await interaction.reply({
                        content: '이 버튼은 더 이상 사용할 수 없습니다.',
                        ephemeral: true
                    });
                    return;
                }
                
                try {
                    await button.execute(interaction);
                    logger.info(`버튼 실행: ${interaction.customId} by ${interaction.user.tag}`);
                } catch (error) {
                    logger.error(`버튼 실행 오류 (${interaction.customId}):`, error);
                    
                    const errorEmbed = CustomEmbedBuilder.error(
                        '버튼 처리 중 오류가 발생했습니다.'
                    );
                    
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                    } else {
                        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                    }
                }
            }
            
            // 드롭다운 메뉴 상호작용 처리
            else if (interaction.isStringSelectMenu()) {
                // 영속적 메뉴 처리
                if (interaction.customId.startsWith('persistent_')) {
                    const handler = client.menus.get(interaction.customId);
                    if (handler) {
                        await handler.execute(interaction);
                        return;
                    }
                }
                
                // 일반 메뉴 처리
                const menu = client.menus.get(interaction.customId);
                
                if (!menu) {
                    logger.warn(`존재하지 않는 메뉴: ${interaction.customId}`);
                    await interaction.reply({
                        content: '이 메뉴는 더 이상 사용할 수 없습니다.',
                        ephemeral: true
                    });
                    return;
                }
                
                try {
                    await menu.execute(interaction);
                    logger.info(`메뉴 실행: ${interaction.customId} by ${interaction.user.tag}`);
                } catch (error) {
                    logger.error(`메뉴 실행 오류 (${interaction.customId}):`, error);
                    
                    const errorEmbed = CustomEmbedBuilder.error(
                        '메뉴 처리 중 오류가 발생했습니다.'
                    );
                    
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                    } else {
                        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                    }
                }
            }
        } catch (error) {
            logger.error('인터랙션 처리 중 전역 오류:', error);
        }
    }
};
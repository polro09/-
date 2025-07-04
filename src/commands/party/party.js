// src/commands/party/party.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const Party = require('../../models/Party');
const logger = require('../../utils/logger');
const { config } = require('../../config/config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('파티모집')
        .setDescription('파티 모집 시스템을 시작합니다.'),
    
    async execute(interaction) {
        try {
            // 파티 모집 임베드 생성
            const partyEmbed = CustomEmbedBuilder.createBasicEmbed({
                title: '🎮 파티 모집 시스템',
                description: '아래 버튼을 클릭하여 파티를 생성하거나 참여하세요!\n\n' +
                           '**📌 사용 방법**\n' +
                           '• **파티 생성** - 새로운 파티를 만들어 팀원을 모집합니다\n' +
                           '• **파티 목록** - 현재 모집 중인 파티들을 확인합니다\n' +
                           '• **내 파티** - 내가 참여 중인 파티를 확인합니다',
                fields: [
                    {
                        name: '⚔️ 정규전',
                        value: '공식 랭크 매치를 위한 파티',
                        inline: true
                    },
                    {
                        name: '🛡️ 모의전',
                        value: '연습을 위한 친선 경기',
                        inline: true
                    },
                    {
                        name: '🎯 훈련',
                        value: '실력 향상을 위한 훈련 파티',
                        inline: true
                    },
                    {
                        name: '🏆 PVP',
                        value: '플레이어 대 플레이어 전투',
                        inline: true
                    },
                    {
                        name: '🦅 검은발톱',
                        value: '검은발톱 레이드 파티',
                        inline: true
                    },
                    {
                        name: '🏜️ 레이드',
                        value: '사막/북부 레이드 파티',
                        inline: true
                    }
                ],
                footer: {
                    text: '파티 시스템 • 버튼을 클릭하면 웹사이트로 이동합니다',
                    iconURL: 'https://i.imgur.com/Sd8qK9c.gif'
                }
            });

            // 버튼 생성 (Link 버튼으로 변경)
            const webUrl = config.websiteUrl;
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('파티 생성')
                        .setEmoji('✅')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`${webUrl}/party/create`),
                    new ButtonBuilder()
                        .setLabel('파티 목록')
                        .setEmoji('📋')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`${webUrl}/party`),
                );

            await interaction.reply({ 
                embeds: [partyEmbed], 
                components: [row] 
            });

            logger.party(`파티 모집 명령어 실행 - ${interaction.user.tag}`);
        } catch (error) {
            logger.error(`파티 모집 명령어 오류: ${error.message}`, 'party');
            const errorEmbed = CustomEmbedBuilder.error('파티 모집 시스템을 시작하는 중 오류가 발생했습니다.');
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    },
    
    category: 'party'
};
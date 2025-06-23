// src/commands/info/ping.js
const { SlashCommandBuilder } = require('discord.js');
const CustomEmbedBuilder = require('../../utils/embedBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setNameLocalizations({ 'ko': '핑' })
        .setDescription('봇의 응답 속도를 확인합니다.')
        .setDescriptionLocalizations({ 'ko': '봇의 응답 속도를 확인합니다.' }),
    
    async execute(interaction) {
        const sent = await interaction.deferReply({ fetchReply: true });
        
        const embed = CustomEmbedBuilder.createBasicEmbed({
            title: '🏓 Pong!',
            fields: [
                {
                    name: '지연 시간',
                    value: `${sent.createdTimestamp - interaction.createdTimestamp}ms`,
                    inline: true
                },
                {
                    name: 'API 지연 시간',
                    value: `${Math.round(interaction.client.ws.ping)}ms`,
                    inline: true
                },
                {
                    name: '업타임',
                    value: `<t:${Math.floor((Date.now() - interaction.client.uptime) / 1000)}:R>`,
                    inline: true
                }
            ]
        });
        
        await interaction.editReply({ embeds: [embed] });
    },
    
    category: 'info'
};
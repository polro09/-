// src/commands/info/help.js
const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const CustomEmbedBuilder = require('../../utils/embedBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setNameLocalizations({ 'ko': '도움말' })
        .setDescription('봇의 명령어와 사용법을 확인합니다.')
        .setDescriptionLocalizations({ 'ko': '봇의 명령어와 사용법을 확인합니다.' })
        .addStringOption(option =>
            option.setName('command')
                .setNameLocalizations({ 'ko': '명령어' })
                .setDescription('특정 명령어의 자세한 정보를 확인합니다.')
                .setDescriptionLocalizations({ 'ko': '특정 명령어의 자세한 정보를 확인합니다.' })
                .setRequired(false)),
    
    async execute(interaction) {
        const commandName = interaction.options.getString('command');
        
        if (commandName) {
            // 특정 명령어 도움말
            const command = interaction.client.commands.get(commandName);
            
            if (!command) {
                const errorEmbed = CustomEmbedBuilder.error('해당 명령어를 찾을 수 없습니다.');
                return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            const commandEmbed = CustomEmbedBuilder.createBasicEmbed({
                title: `/${command.data.name} 명령어`,
                description: command.data.description,
                fields: [
                    {
                        name: '사용법',
                        value: `\`/${command.data.name}\``,
                        inline: false
                    }
                ]
            });
            
            if (command.data.options?.length > 0) {
                const options = command.data.options.map(opt => 
                    `• **${opt.name}** - ${opt.description} ${opt.required ? '(필수)' : '(선택)'}`
                ).join('\n');
                
                commandEmbed.addFields({
                    name: '옵션',
                    value: options,
                    inline: false
                });
            }
            
            return await interaction.reply({ embeds: [commandEmbed] });
        }
        
        // 전체 도움말
        const categories = {
            info: { name: '📌 정보', commands: [] },
            moderation: { name: '🛡️ 관리', commands: [] },
            utility: { name: '🔧 유틸리티', commands: [] },
            fun: { name: '🎮 재미', commands: [] },
            music: { name: '🎵 음악', commands: [] }
        };
        
        // 명령어 분류
        interaction.client.commands.forEach(command => {
            const category = command.category || 'utility';
            if (categories[category]) {
                categories[category].commands.push(command.data.name);
            }
        });
        
        // 도움말 임베드 생성
        const helpEmbed = CustomEmbedBuilder.createBasicEmbed({
            title: 'Aimdot.dev 도움말',
            description: '아래 드롭다운 메뉴에서 카테고리를 선택하여 명령어를 확인하세요.',
            fields: Object.entries(categories)
                .filter(([_, cat]) => cat.commands.length > 0)
                .map(([key, cat]) => ({
                    name: cat.name,
                    value: cat.commands.map(cmd => `\`/${cmd}\``).join(', ') || '명령어 없음',
                    inline: false
                }))
        });
        
        // 카테고리 선택 메뉴
        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('help_category')
                    .setPlaceholder('카테고리를 선택하세요')
                    .addOptions(
                        Object.entries(categories)
                            .filter(([_, cat]) => cat.commands.length > 0)
                            .map(([key, cat]) => ({
                                label: cat.name,
                                value: key,
                                emoji: cat.name.split(' ')[0]
                            }))
                    )
            );
        
        await interaction.reply({ 
            embeds: [helpEmbed], 
            components: [row] 
        });
    },
    
    category: 'info'
};

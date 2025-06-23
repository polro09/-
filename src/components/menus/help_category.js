// src/components/menus/help_category.js
const CustomEmbedBuilder = require('../../utils/embedBuilder');

module.exports = {
    customId: 'help_category',
    
    async execute(interaction) {
        const category = interaction.values[0];
        const categoryInfo = {
            info: {
                name: '📌 정보',
                description: '서버와 봇에 대한 정보를 확인하는 명령어들입니다.'
            },
            moderation: {
                name: '🛡️ 관리',
                description: '서버 관리와 모더레이션을 위한 명령어들입니다.'
            },
            utility: {
                name: '🔧 유틸리티',
                description: '다양한 유용한 기능을 제공하는 명령어들입니다.'
            },
            fun: {
                name: '🎮 재미',
                description: '재미있는 기능과 게임 관련 명령어들입니다.'
            },
            music: {
                name: '🎵 음악',
                description: '음악 재생과 관련된 명령어들입니다.'
            }
        };
        
        const info = categoryInfo[category];
        if (!info) return;
        
        // 해당 카테고리의 명령어들 가져오기
        const commands = [];
        interaction.client.commands.forEach(command => {
            if (command.category === category) {
                commands.push({
                    name: `/${command.data.name}`,
                    value: command.data.description,
                    inline: false
                });
            }
        });
        
        const embed = CustomEmbedBuilder.createBasicEmbed({
            title: info.name,
            description: info.description,
            fields: commands.length > 0 ? commands : [{
                name: '명령어 없음',
                value: '이 카테고리에는 아직 명령어가 없습니다.',
                inline: false
            }]
        });
        
        await interaction.update({ embeds: [embed] });
    }
};
// src/components/buttons/mystats.js
const { EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const { config } = require('../../config/config');

module.exports = {
    customId: 'persistent_mystats',
    
    async execute(interaction, data) {
        try {
            // 사용자 정보 가져오기
            const user = await User.findOne({ discordId: interaction.user.id });
            
            if (!user) {
                await interaction.reply({ 
                    content: '전적 정보를 찾을 수 없습니다. 먼저 웹사이트에 로그인해주세요.', 
                    ephemeral: true 
                });
                return;
            }
            
            const stats = user.gameStats || {
                wins: 0,
                losses: 0,
                totalKills: 0,
                totalDeaths: 0,
                avgKills: 0,
                rankedGames: 0,
                practiceGames: 0
            };
            
            const totalGames = stats.wins + stats.losses;
            const winRate = totalGames > 0 ? Math.round((stats.wins / stats.losses) * 100) : 0;
            const kda = stats.totalDeaths > 0 ? (stats.totalKills / stats.totalDeaths).toFixed(2) : stats.totalKills;
            
            // 전적 임베드 생성
            const statsEmbed = new EmbedBuilder()
                .setColor(config.embed.color)
                .setTitle(`📊 ${user.nickname || user.username}님의 전적`)
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '⚔️ 전적', value: `${stats.wins}승 ${stats.losses}패`, inline: true },
                    { name: '📈 승률', value: `${winRate}%`, inline: true },
                    { name: '🎯 K/D', value: kda.toString(), inline: true },
                    { name: '💀 총 킬', value: stats.totalKills.toString(), inline: true },
                    { name: '☠️ 총 데스', value: stats.totalDeaths.toString(), inline: true },
                    { name: '🗡️ 평균 킬', value: stats.avgKills.toFixed(1), inline: true },
                    { name: '🏆 정규전', value: `${stats.rankedGames}회`, inline: true },
                    { name: '🎯 모의전', value: `${stats.practiceGames}회`, inline: true },
                    { name: '📊 총 게임', value: `${totalGames}회`, inline: true }
                )
                .setFooter({
                    text: 'Aimdot.dev Party System',
                    iconURL: 'https://i.imgur.com/Sd8qK9c.gif'
                })
                .setTimestamp();
            
            // DM으로 전송
            try {
                await interaction.user.send({ embeds: [statsEmbed] });
                await interaction.reply({ 
                    content: '📊 전적 정보를 DM으로 전송했습니다!', 
                    ephemeral: true 
                });
            } catch (error) {
                // DM을 보낼 수 없는 경우
                await interaction.reply({ 
                    embeds: [statsEmbed], 
                    ephemeral: true 
                });
            }
            
        } catch (error) {
            console.error('전적 버튼 오류:', error);
            await interaction.reply({ 
                content: '전적 조회 중 오류가 발생했습니다.', 
                ephemeral: true 
            });
        }
    }
};
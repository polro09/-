// src/commands/party/party.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const Component = require('../../models/Component');
const Guild = require('../../models/Guild');
const User = require('../../models/User');
const Party = require('../../models/Party');
const { config } = require('../../config/config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('party')
        .setNameLocalizations({ 'ko': '파티' })
        .setDescription('파티 모집 시스템')
        .setDescriptionLocalizations({ 'ko': '파티 모집 시스템' })
        .addSubcommand(subcommand =>
            subcommand
                .setName('recruit')
                .setNameLocalizations({ 'ko': '모집' })
                .setDescription('파티 모집 안내를 표시합니다')
                .setDescriptionLocalizations({ 'ko': '파티 모집 안내를 표시합니다' }))
        .addSubcommand(subcommand =>
            subcommand
                .setName('mystats')
                .setNameLocalizations({ 'ko': '내전적' })
                .setDescription('내 전적을 DM으로 받습니다')
                .setDescriptionLocalizations({ 'ko': '내 전적을 DM으로 받습니다' })),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'recruit': {
                // 파티 종류 설명
                const partyTypes = {
                    ranked: { 
                        name: '⚔️ 정규전', 
                        description: '랭크가 반영되는 공식 매치'
                    },
                    practice: { 
                        name: '🎯 모의전', 
                        description: '연습을 위한 비공식 매치'
                    },
                    training: { 
                        name: '📚 훈련', 
                        description: '초보자를 위한 교육 세션'
                    },
                    pvp: { 
                        name: '⚡ PVP', 
                        description: '개인전 대결'
                    },
                    blackclaw: { 
                        name: '🦅 검은발톱', 
                        description: '검은발톱 특별 이벤트'
                    },
                    raid_desert: { 
                        name: '🏜️ 레이드-사막', 
                        description: '사막 지역 레이드'
                    },
                    raid_north: { 
                        name: '❄️ 레이드-북부', 
                        description: '북부 지역 레이드'
                    }
                };
                
                // 파티 모집 안내 임베드
                const recruitEmbed = new EmbedBuilder()
                    .setColor(config.embed.color)
                    .setTitle('🎮 파티 모집 시스템')
                    .setDescription('아래 버튼을 클릭하여 파티를 생성하거나 참여하세요!')
                    .setThumbnail('https://i.imgur.com/Sd8qK9c.gif')
                    .setImage('https://i.imgur.com/Sd8qK9c.gif')
                    .setFooter({
                        text: 'Aimdot.dev',
                        iconURL: 'https://i.imgur.com/Sd8qK9c.gif'
                    })
                    .setTimestamp();
                
                // 파티 종류 필드 추가
                Object.entries(partyTypes).forEach(([key, type]) => {
                    recruitEmbed.addFields({
                        name: type.name,
                        value: type.description,
                        inline: true
                    });
                });
                
                // 버튼 생성
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('파티 생성')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('➕')
                            .setURL(`${process.env.WEBSITE_URL || 'http://localhost:3000'}/party/create?guild=${interaction.guild.id}&channel=${interaction.channel.id}`),
                        new ButtonBuilder()
                            .setLabel('파티 목록')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('📋')
                            .setURL(`${process.env.WEBSITE_URL || 'http://localhost:3000'}/party`),
                        new ButtonBuilder()
                            .setCustomId(`persistent_button_mystats_${interaction.guild.id}`)
                            .setLabel('내 전적 확인')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('📊')
                    );
                
                const message = await interaction.reply({ 
                    embeds: [recruitEmbed], 
                    components: [row],
                    fetchReply: true
                });
                
                // 영속적 버튼 컴포넌트 저장
                await Component.create({
                    customId: `persistent_button_mystats_${interaction.guild.id}`,
                    type: 'button',
                    guildId: interaction.guild.id,
                    channelId: interaction.channel.id,
                    messageId: message.id,
                    handlerName: 'mystats',
                    data: {},
                    createdBy: interaction.user.id
                });
                
                break;
            }
            
            case 'mystats': {
                await sendUserStats(interaction, interaction.user.id);
                break;
            }
        }
    },
    
    category: 'party'
};

// 사용자 전적 전송 함수
async function sendUserStats(interaction, userId) {
    try {
        // 사용자 정보 가져오기
        const user = await User.findOne({ discordId: userId });
        
        if (!user) {
            await interaction.reply({ 
                content: '전적 정보를 찾을 수 없습니다.', 
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
            await interaction.reply({ 
                content: '❌ DM을 보낼 수 없습니다. DM 설정을 확인해주세요.', 
                ephemeral: true 
            });
        }
        
    } catch (error) {
        console.error('전적 조회 오류:', error);
        await interaction.reply({ 
            content: '전적 조회 중 오류가 발생했습니다.', 
            ephemeral: true 
        });
    }
}
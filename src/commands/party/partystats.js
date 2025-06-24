// src/commands/party/partystats.js
const { SlashCommandBuilder } = require('discord.js');
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const User = require('../../models/User');
const Party = require('../../models/Party');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('partystats')
        .setNameLocalizations({ 'ko': '파티전적' })
        .setDescription('파티 전적을 확인합니다.')
        .setDescriptionLocalizations({ 'ko': '파티 전적을 확인합니다.' })
        .addUserOption(option =>
            option.setName('user')
                .setNameLocalizations({ 'ko': '사용자' })
                .setDescription('전적을 확인할 사용자')
                .setDescriptionLocalizations({ 'ko': '전적을 확인할 사용자' })
                .setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;

        try {
            // 사용자 정보 가져오기
            let user = await User.findOne({ discordId: targetUser.id });
            
            if (!user) {
                // 새 사용자 생성
                user = await User.create({
                    discordId: targetUser.id,
                    username: targetUser.username,
                    discriminator: targetUser.discriminator || '0',
                    avatar: targetUser.avatar
                });
            }

            // 파티 통계 가져오기
            const totalParties = await Party.countDocuments({
                'members.user': targetUser.id
            });

            const completedParties = await Party.countDocuments({
                'members.user': targetUser.id,
                status: 'completed'
            });

            const createdParties = await Party.countDocuments({
                leader: targetUser.id
            });

            const activeParties = await Party.countDocuments({
                'members.user': targetUser.id,
                status: 'waiting'
            });

            // 게임별 통계
            const gameStats = await Party.aggregate([
                { $match: { 'members.user': targetUser.id } },
                { $group: { 
                    _id: '$game',
                    count: { $sum: 1 }
                }},
                { $sort: { count: -1 } }
            ]);

            const favoriteGame = gameStats.length > 0 ? getGameName(gameStats[0]._id) : '없음';

            // 전적 임베드 생성
            const statsEmbed = CustomEmbedBuilder.createBasicEmbed({
                title: `📊 ${targetUser.username}님의 파티 전적`,
                fields: [
                    {
                        name: '🎮 게임 전적',
                        value: `**승:** ${user.gameStats.wins}회\n**패:** ${user.gameStats.losses}회\n**승률:** ${calculateWinRate(user.gameStats.wins, user.gameStats.losses)}%`,
                        inline: true
                    },
                    {
                        name: '🎯 KDA',
                        value: `**총 킬:** ${user.gameStats.totalKills}\n**총 데스:** ${user.gameStats.totalDeaths}\n**평균 킬:** ${user.gameStats.avgKills.toFixed(1)}`,
                        inline: true
                    },
                    {
                        name: '🎲 게임 모드',
                        value: `**정규전:** ${user.gameStats.rankedGames}회\n**모의전:** ${user.gameStats.practiceGames}회\n**총 게임:** ${user.gameStats.rankedGames + user.gameStats.practiceGames}회`,
                        inline: true
                    },
                    {
                        name: '👥 파티 활동',
                        value: `**총 파티:** ${totalParties}개\n**생성한 파티:** ${createdParties}개\n**완료한 파티:** ${completedParties}개`,
                        inline: true
                    },
                    {
                        name: '⭐ 평가',
                        value: `**소통:** ${user.partyStats.rating.communication.toFixed(1)}/5.0\n**팀워크:** ${user.partyStats.rating.teamwork.toFixed(1)}/5.0\n**실력:** ${user.partyStats.rating.skill.toFixed(1)}/5.0`,
                        inline: true
                    },
                    {
                        name: '📌 기타 정보',
                        value: `**활동 중인 파티:** ${activeParties}개\n**선호 게임:** ${favoriteGame}\n**평가 횟수:** ${user.partyStats.rating.totalRatings}회`,
                        inline: true
                    }
                ],
                thumbnail: targetUser.displayAvatarURL({ dynamic: true })
            });

            // 평균 평점 계산
            const avgRating = ((user.partyStats.rating.communication + 
                               user.partyStats.rating.teamwork + 
                               user.partyStats.rating.skill) / 3).toFixed(1);

            statsEmbed.setFooter({
                text: `평균 평점: ${avgRating}/5.0 | 마지막 게임: ${user.gameStats.lastGameAt ? new Date(user.gameStats.lastGameAt).toLocaleDateString('ko-KR') : '기록 없음'}`
            });

            await interaction.reply({ embeds: [statsEmbed] });

        } catch (error) {
            console.error('파티 전적 조회 오류:', error);
            const errorEmbed = CustomEmbedBuilder.error('전적을 조회할 수 없습니다.');
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    },

    category: 'party'
};

// 승률 계산
function calculateWinRate(wins, losses) {
    const total = wins + losses;
    if (total === 0) return 0;
    return Math.round((wins / total) * 100);
}

// 게임 이름 변환
function getGameName(game) {
    const gameNames = {
        'valorant': 'Valorant',
        'leagueoflegends': 'League of Legends',
        'overwatch': 'Overwatch 2',
        'other': '기타'
    };
    return gameNames[game] || game;
}
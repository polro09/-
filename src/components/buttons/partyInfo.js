// src/components/buttons/partyInfo.js
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const Party = require('../../models/Party');

module.exports = {
    customId: 'persistent_party_info',
    
    async execute(interaction, data) {
        try {
            const party = await Party.findById(data.partyId)
                .populate('members.user', 'username');
            
            if (!party) {
                const errorEmbed = CustomEmbedBuilder.error('파티를 찾을 수 없습니다.');
                return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            const infoEmbed = CustomEmbedBuilder.createBasicEmbed({
                title: `🎮 ${party.name}`,
                description: party.description || '설명이 없습니다.',
                fields: [
                    {
                        name: '게임',
                        value: getGameName(party.game),
                        inline: true
                    },
                    {
                        name: '모드',
                        value: party.mode,
                        inline: true
                    },
                    {
                        name: '인원',
                        value: `${party.currentMembers}/${party.maxMembers}`,
                        inline: true
                    },
                    {
                        name: '상태',
                        value: getStatusText(party.status),
                        inline: true
                    },
                    {
                        name: '최소 티어',
                        value: party.minTier || '제한 없음',
                        inline: true
                    },
                    {
                        name: '음성 채팅',
                        value: party.voiceRequired ? '필수' : '선택',
                        inline: true
                    },
                    {
                        name: '멤버 목록',
                        value: party.members.map(m => `${m.role === 'leader' ? '👑' : '👤'} ${m.user.username}`).join('\n') || '없음',
                        inline: false
                    },
                    {
                        name: '생성 시간',
                        value: `<t:${Math.floor(party.createdAt.getTime() / 1000)}:R>`,
                        inline: false
                    }
                ]
            });
            
            await interaction.reply({ embeds: [infoEmbed], ephemeral: true });
            
        } catch (error) {
            console.error('파티 정보 버튼 오류:', error);
            const errorEmbed = CustomEmbedBuilder.error('파티 정보를 가져올 수 없습니다.');
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
};

function getGameName(game) {
    const gameNames = {
        'valorant': 'Valorant',
        'leagueoflegends': 'League of Legends',
        'overwatch': 'Overwatch 2',
        'other': '기타'
    };
    return gameNames[game] || game;
}

function getStatusText(status) {
    const statusTexts = {
        'waiting': '🟢 대기 중',
        'in_game': '🔵 게임 중',
        'completed': '⚫ 완료',
        'cancelled': '🔴 취소됨'
    };
    return statusTexts[status] || status;
}
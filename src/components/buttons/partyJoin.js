// src/components/buttons/partyJoin.js
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const Party = require('../../models/Party');

module.exports = {
    customId: 'persistent_party_join',
    
    async execute(interaction, data) {
        try {
            const party = await Party.findById(data.partyId);
            
            if (!party) {
                const errorEmbed = CustomEmbedBuilder.error('파티를 찾을 수 없습니다.');
                return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            if (party.status !== 'waiting') {
                const errorEmbed = CustomEmbedBuilder.error('대기 중인 파티가 아닙니다.');
                return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            if (party.members.some(m => m.user === interaction.user.id)) {
                const warningEmbed = CustomEmbedBuilder.warning('이미 파티에 참가했습니다.');
                return await interaction.reply({ embeds: [warningEmbed], ephemeral: true });
            }
            
            if (party.isFull) {
                const errorEmbed = CustomEmbedBuilder.error('파티가 가득 찼습니다.');
                return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // 파티 참가
            await party.addMember(interaction.user.id);
            
            const successEmbed = CustomEmbedBuilder.success(`${party.name} 파티에 참가했습니다!`);
            await interaction.reply({ embeds: [successEmbed], ephemeral: true });
            
            // 파티 메시지 업데이트
            await updatePartyEmbed(interaction, party);
            
        } catch (error) {
            console.error('파티 참가 버튼 오류:', error);
            const errorEmbed = CustomEmbedBuilder.error('파티 참가 중 오류가 발생했습니다.');
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
};

// 파티 임베드 업데이트
async function updatePartyEmbed(interaction, party) {
    try {
        const updatedParty = await Party.findById(party._id)
            .populate('members.user', 'username');
        
        const partyEmbed = CustomEmbedBuilder.createBasicEmbed({
            title: `🎮 ${updatedParty.name}`,
            description: `**게임:** ${getGameName(updatedParty.game)}\n**모드:** ${updatedParty.mode}\n**인원:** ${updatedParty.currentMembers}/${updatedParty.maxMembers}`,
            fields: [
                {
                    name: '파티장',
                    value: `<@${updatedParty.leader}>`,
                    inline: true
                },
                {
                    name: '상태',
                    value: '🟢 대기 중',
                    inline: true
                },
                {
                    name: 'ID',
                    value: updatedParty._id.toString(),
                    inline: true
                },
                {
                    name: '멤버',
                    value: updatedParty.members.map(m => m.user.username).join(', ') || '없음',
                    inline: false
                }
            ],
            color: updatedParty.isFull ? 0xED4245 : 0x5865F2
        });
        
        await interaction.message.edit({ embeds: [partyEmbed] });
        
    } catch (error) {
        console.error('파티 임베드 업데이트 오류:', error);
    }
}

function getGameName(game) {
    const gameNames = {
        'valorant': 'Valorant',
        'leagueoflegends': 'League of Legends',
        'overwatch': 'Overwatch 2',
        'other': '기타'
    };
    return gameNames[game] || game;
}
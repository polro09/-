// src/components/buttons/partyLeave.js
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const Party = require('../../models/Party');
const Component = require('../../models/Component');

module.exports = {
    customId: 'persistent_party_leave',
    
    async execute(interaction, data) {
        try {
            const party = await Party.findById(data.partyId);
            
            if (!party) {
                const errorEmbed = CustomEmbedBuilder.error('파티를 찾을 수 없습니다.');
                return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            if (!party.members.some(m => m.user === interaction.user.id)) {
                const warningEmbed = CustomEmbedBuilder.warning('파티에 참가하지 않았습니다.');
                return await interaction.reply({ embeds: [warningEmbed], ephemeral: true });
            }
            
            // 리더가 나가는 경우
            if (party.leader === interaction.user.id) {
                if (party.members.length > 1) {
                    // 다른 멤버에게 리더 위임
                    const newLeader = party.members.find(m => m.user !== interaction.user.id);
                    party.leader = newLeader.user;
                    newLeader.role = 'leader';
                    await party.removeMember(interaction.user.id);
                    
                    const infoEmbed = CustomEmbedBuilder.info('리더 위임', `파티 리더가 <@${newLeader.user}>님에게 위임되었습니다.`);
                    await interaction.reply({ embeds: [infoEmbed] });
                    
                    // 파티 메시지 업데이트
                    await updatePartyEmbed(interaction, party);
                } else {
                    // 파티 해산
                    await party.deleteOne();
                    
                    // 관련 컴포넌트 삭제
                    await Component.deleteMany({
                        customId: { $regex: `^persistent_button_party_.*_${party._id}$` }
                    });
                    
                    const infoEmbed = CustomEmbedBuilder.info('파티 해산', '파티가 해산되었습니다.');
                    await interaction.reply({ embeds: [infoEmbed] });
                    
                    // 메시지 삭제
                    try {
                        await interaction.message.delete();
                    } catch (error) {
                        console.error('메시지 삭제 오류:', error);
                    }
                    return;
                }
            } else {
                // 일반 멤버가 나가는 경우
                await party.removeMember(interaction.user.id);
                
                const successEmbed = CustomEmbedBuilder.success('파티에서 나갔습니다.');
                await interaction.reply({ embeds: [successEmbed], ephemeral: true });
                
                // 파티 메시지 업데이트
                await updatePartyEmbed(interaction, party);
            }
            
        } catch (error) {
            console.error('파티 나가기 버튼 오류:', error);
            const errorEmbed = CustomEmbedBuilder.error('파티 나가기 중 오류가 발생했습니다.');
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
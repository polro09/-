// src/components/buttons/party_buttons.js
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const Party = require('../../models/Party');
const User = require('../../models/User');
const logger = require('../../utils/logger');

module.exports = {
    customId: 'party_',
    
    async execute(interaction) {
        const action = interaction.customId.split('_')[1];
        
        try {
            switch(action) {
                case 'myparty':
                    await handleMyParty(interaction);
                    break;
                case 'record':
                    await handleRecord(interaction);
                    break;
                default:
                    await interaction.reply({ 
                        content: '알 수 없는 액션입니다.', 
                        ephemeral: true 
                    });
            }
        } catch (error) {
            logger.error(`파티 버튼 처리 오류: ${error.message}`, 'party');
            const errorEmbed = CustomEmbedBuilder.error('처리 중 오류가 발생했습니다.');
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
};

async function handleMyParty(interaction) {
    try {
        // 유저의 현재 파티 찾기
        const activeParty = await Party.findOne({
            $or: [
                { hostId: interaction.user.id },
                { 'participants.userId': interaction.user.id }
            ],
            status: { $in: ['recruiting', 'in_progress'] }
        });

        if (!activeParty) {
            const noPartyEmbed = CustomEmbedBuilder.createBasicEmbed({
                title: '참여 중인 파티 없음',
                description: '현재 참여 중인 파티가 없습니다.',
                color: 0xFF6B6B
            });
            return await interaction.reply({ embeds: [noPartyEmbed], ephemeral: true });
        }

        // 파티 정보 임베드 생성
        const partyInfoEmbed = await createPartyInfoEmbed(activeParty, interaction.user.id);
        
        await interaction.reply({ 
            embeds: [partyInfoEmbed], 
            ephemeral: true 
        });
    } catch (error) {
        throw error;
    }
}

async function handleRecord(interaction) {
    try {
        // 전적 확인 로직 - DM으로 전송
        const user = await User.findOne({ userId: interaction.user.id });
        
        if (!user || !user.gameStats) {
            const noRecordEmbed = CustomEmbedBuilder.createBasicEmbed({
                title: '전적 없음',
                description: '아직 기록된 전적이 없습니다.',
                color: 0xFF6B6B
            });
            return await interaction.reply({ embeds: [noRecordEmbed], ephemeral: true });
        }

        const stats = user.gameStats;
        const winRate = stats.totalGames > 0 
            ? ((stats.wins / stats.totalGames) * 100).toFixed(2) 
            : 0;

        const recordEmbed = CustomEmbedBuilder.createBasicEmbed({
            title: `${interaction.user.username}님의 전적`,
            fields: [
                {
                    name: '📊 전체 통계',
                    value: `승: ${stats.wins || 0} | 패: ${stats.losses || 0} | 승률: ${winRate}%`,
                    inline: false
                },
                {
                    name: '⚔️ 전투 기록',
                    value: `킬: ${stats.kills || 0} | 데스: ${stats.deaths || 0} | K/D: ${stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills}`,
                    inline: false
                },
                {
                    name: '🎮 참여 게임',
                    value: `정규전: ${stats.rankedGames || 0} | 모의전: ${stats.customGames || 0}`,
                    inline: false
                }
            ],
            footer: {
                text: '파티 시스템 전적',
                iconURL: 'https://i.imgur.com/Sd8qK9c.gif'
            }
        });

        // DM 전송 시도
        try {
            await interaction.user.send({ embeds: [recordEmbed] });
            await interaction.reply({ 
                content: '전적 정보를 DM으로 전송했습니다!', 
                ephemeral: true 
            });
        } catch (dmError) {
            // DM 실패 시 임시 메시지로 전송
            await interaction.reply({ 
                embeds: [recordEmbed], 
                ephemeral: true 
            });
        }
    } catch (error) {
        throw error;
    }
}

async function createPartyInfoEmbed(party, userId) {
    const isHost = party.hostId === userId;
    const participant = party.participants.find(p => p.userId === userId);
    const team = participant ? participant.team : null;
    
    const team1 = party.participants.filter(p => p.team === 'team1');
    const team2 = party.participants.filter(p => p.team === 'team2');
    const waitlist = party.participants.filter(p => p.team === 'waitlist');
    
    const fields = [
        {
            name: '🎮 파티 타입',
            value: party.type,
            inline: true
        },
        {
            name: '👤 주최자',
            value: `<@${party.hostId}>`,
            inline: true
        },
        {
            name: '⏰ 시작 시간',
            value: party.startTime ? new Date(party.startTime).toLocaleString('ko-KR') : '미정',
            inline: true
        },
        {
            name: '⚔️ 팀 1',
            value: team1.length > 0 
                ? team1.map(p => `<@${p.userId}>`).join('\n') 
                : '참여자 없음',
            inline: true
        },
        {
            name: '🛡️ 팀 2',
            value: team2.length > 0 
                ? team2.map(p => `<@${p.userId}>`).join('\n') 
                : '참여자 없음',
            inline: true
        },
        {
            name: '⏳ 대기자',
            value: waitlist.length > 0 
                ? waitlist.map(p => `<@${p.userId}>`).join('\n') 
                : '대기자 없음',
            inline: true
        }
    ];
    
    return CustomEmbedBuilder.createBasicEmbed({
        title: `${party.title} - ${isHost ? '(주최자)' : `(${team || '미참여'})`}`,
        description: party.description || '설명이 없습니다.',
        fields: fields,
        color: party.status === 'recruiting' ? 0x3BA55C : 0xFAA61A
    });
}
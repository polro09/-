// src/handlers/buttons/party_info.js
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const Party = require('../../models/Party');
const logger = require('../../utils/logger');
const { config } = require('../../config/config');

module.exports = {
    customId: 'party_info',
    
    async execute(interaction) {
        try {
            // customId에서 파티 ID 추출 (party_info_PARTYID 형식)
            const partyId = interaction.customId.split('_')[2];
            
            await interaction.deferReply({ ephemeral: true });
            
            const party = await Party.findOne({ partyId });
            
            if (!party) {
                const errorEmbed = CustomEmbedBuilder.error('파티를 찾을 수 없습니다.');
                return await interaction.editReply({ embeds: [errorEmbed] });
            }
            
            const infoEmbed = CustomEmbedBuilder.createBasicEmbed({
                title: `📋 ${party.title} - 상세 정보`,
                fields: [
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
                        name: '🆔 파티 ID',
                        value: party.partyId,
                        inline: true
                    },
                    {
                        name: '📝 설명',
                        value: party.description || '설명이 없습니다.',
                        inline: false
                    },
                    {
                        name: '⚠️ 참가 조건',
                        value: party.requirements || '조건 없음',
                        inline: false
                    },
                    {
                        name: '⏰ 시작 시간',
                        value: party.startTime 
                            ? new Date(party.startTime).toLocaleString('ko-KR')
                            : '미정',
                        inline: true
                    },
                    {
                        name: '📅 생성 시간',
                        value: new Date(party.createdAt).toLocaleString('ko-KR'),
                        inline: true
                    },
                    {
                        name: '🌐 웹 링크',
                        value: `[파티 페이지로 이동](${config.websiteUrl}/party/${party.partyId})`,
                        inline: false
                    }
                ]
            });
            
            await interaction.editReply({ embeds: [infoEmbed] });
            
        } catch (error) {
            logger.error(`파티 정보 조회 오류: ${error.message}`, 'party');
            const errorEmbed = CustomEmbedBuilder.error('파티 정보를 불러오는 중 오류가 발생했습니다.');
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};

// src/handlers/buttons/party_participants.js
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const Party = require('../../models/Party');
const User = require('../../models/User');
const logger = require('../../utils/logger');

module.exports = {
    customId: 'party_participants',
    
    async execute(interaction) {
        try {
            // customId에서 파티 ID 추출
            const partyId = interaction.customId.split('_')[2];
            
            await interaction.deferReply({ ephemeral: true });
            
            const party = await Party.findOne({ partyId });
            
            if (!party) {
                const errorEmbed = CustomEmbedBuilder.error('파티를 찾을 수 없습니다.');
                return await interaction.editReply({ embeds: [errorEmbed] });
            }
            
            // 참여자 상세 정보 가져오기
            const getParticipantDetails = async (participant) => {
                try {
                    const user = await User.findOne({ discordId: participant.userId });
                    if (user && user.gameStats) {
                        const winRate = user.gameStats.totalGames > 0 
                            ? Math.round((user.gameStats.wins / user.gameStats.totalGames) * 100)
                            : 0;
                        const kdRatio = user.gameStats.totalDeaths > 0
                            ? (user.gameStats.totalKills / user.gameStats.totalDeaths).toFixed(2)
                            : user.gameStats.totalKills.toFixed(2);
                        
                        const countryEmoji = {
                            'empire': '🏛️',
                            'vlandia': '🛡️',
                            'battania': '🏹',
                            'sturgia': '❄️',
                            'khuzait': '🐎',
                            'aserai': '☀️'
                        };
                        
                        return {
                            name: `${participant.username}`,
                            value: `👤 <@${participant.userId}>\n` +
                                   `📊 승률: ${winRate}% | K/D: ${kdRatio}\n` +
                                   `🎮 게임: ${user.gameStats.totalGames}회\n` +
                                   `${participant.country ? `${countryEmoji[participant.country] || '🏳️'} ${participant.country}` : ''} ` +
                                   `${participant.unit ? `| ⚔️ ${participant.unit}` : ''}`,
                            inline: true
                        };
                    }
                } catch (error) {
                    console.error('참여자 정보 조회 오류:', error);
                }
                
                return {
                    name: participant.username,
                    value: `👤 <@${participant.userId}>\n전적 정보 없음`,
                    inline: true
                };
            };
            
            const team1 = party.participants.filter(p => p.team === 'team1');
            const team2 = party.participants.filter(p => p.team === 'team2');
            const waitlist = party.participants.filter(p => p.team === 'waitlist');
            
            const participantsEmbed = CustomEmbedBuilder.createBasicEmbed({
                title: `👥 ${party.title} - 참여자 목록`,
                description: `총 ${party.participants.length}명이 참여 중입니다.`
            });
            
            // 1팀
            if (team1.length > 0) {
                participantsEmbed.addFields({
                    name: `⚔️ 1팀 (${team1.length}명)`,
                    value: '━━━━━━━━━━━━━━━',
                    inline: false
                });
                
                for (const participant of team1) {
                    const details = await getParticipantDetails(participant);
                    participantsEmbed.addFields(details);
                }
            }
            
            // 2팀
            if (team2.length > 0) {
                participantsEmbed.addFields({
                    name: `🛡️ 2팀 (${team2.length}명)`,
                    value: '━━━━━━━━━━━━━━━',
                    inline: false
                });
                
                for (const participant of team2) {
                    const details = await getParticipantDetails(participant);
                    participantsEmbed.addFields(details);
                }
            }
            
            // 대기자
            if (waitlist.length > 0) {
                participantsEmbed.addFields({
                    name: `⏳ 대기자 (${waitlist.length}명)`,
                    value: '━━━━━━━━━━━━━━━',
                    inline: false
                });
                
                for (const participant of waitlist) {
                    const details = await getParticipantDetails(participant);
                    participantsEmbed.addFields(details);
                }
            }
            
            await interaction.editReply({ embeds: [participantsEmbed] });
            
        } catch (error) {
            logger.error(`참여자 목록 조회 오류: ${error.message}`, 'party');
            const errorEmbed = CustomEmbedBuilder.error('참여자 목록을 불러오는 중 오류가 발생했습니다.');
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};
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
                        const totalGames = user.gameStats.totalGames || 0;
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
                        
                        // 여백을 줄인 포맷
                        let details = `👤 <@${participant.userId}>\n`;
                        
                        // 국가, 티어, 병종을 공백 없이 표시
                        const additionalInfo = [];
                        if (participant.country) additionalInfo.push(`${countryEmoji[participant.country] || '🏳️'}${participant.country}`);
                        if (participant.tier) additionalInfo.push(`⚔️${participant.tier}`);
                        if (participant.unit) additionalInfo.push(`🛡️${participant.unit}`);
                        
                        if (additionalInfo.length > 0) {
                            details += `${additionalInfo.join('|')}\n`;
                        }
                        
                        // W/R과 T/R 형식 수정
                        details += `📊 W/R: ${winRate} % | K/D: ${kdRatio}\n`;
                        details += `🎮 T/R: ${totalGames}`;
                        
                        return {
                            name: `${participant.nickname || participant.username}`,
                            value: details,
                            inline: true
                        };
                    }
                } catch (error) {
                    console.error('참여자 정보 조회 오류:', error);
                }
                
                // 전적 정보가 없는 경우
                let details = `👤 <@${participant.userId}>\n`;
                
                const countryEmoji = {
                    'empire': '🏛️',
                    'vlandia': '🛡️',
                    'battania': '🏹',
                    'sturgia': '❄️',
                    'khuzait': '🐎',
                    'aserai': '☀️'
                };
                
                const additionalInfo = [];
                if (participant.country) additionalInfo.push(`${countryEmoji[participant.country] || '🏳️'}${participant.country}`);
                if (participant.tier) additionalInfo.push(`⚔️${participant.tier}`);
                if (participant.unit) additionalInfo.push(`🛡️${participant.unit}`);
                
                if (additionalInfo.length > 0) {
                    details += `${additionalInfo.join('|')}\n`;
                }
                
                details += `전적 정보 없음`;
                
                return {
                    name: participant.nickname || participant.username,
                    value: details,
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
            
            // 파티 정보 추가
            participantsEmbed.addFields({
                name: '📌 파티 정보',
                value: `**주최자:** <@${party.hostId}>\n**상태:** ${party.status === 'recruiting' ? '🟢 모집 중' : party.status === 'in_progress' ? '🟡 진행 중' : '⚫ 종료됨'}\n**파티 ID:** ${party.partyId}`,
                inline: false
            });
            
            // Footer 설정
            participantsEmbed.setFooter({
                text: '파티 시스템',
                iconURL: 'https://i.imgur.com/Sd8qK9c.gif'
            });
            
            await interaction.editReply({ embeds: [participantsEmbed] });
            
        } catch (error) {
            logger.error(`참여자 목록 조회 오류: ${error.message}`, 'party');
            const errorEmbed = CustomEmbedBuilder.error('참여자 목록을 불러오는 중 오류가 발생했습니다.');
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};
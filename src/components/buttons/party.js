// src/components/buttons/party.js
const { EmbedBuilder } = require('discord.js');
const Party = require('../../models/Party');
const { config } = require('../../config/config');

module.exports = {
    customId: 'persistent_party',
    
    async execute(interaction, data) {
        try {
            const action = data.action; // 'join' or 'view'
            const partyId = data.partyId;
            
            const party = await Party.findOne({ partyId });
            
            if (!party) {
                await interaction.reply({ 
                    content: '파티를 찾을 수 없습니다.', 
                    ephemeral: true 
                });
                return;
            }
            
            if (action === 'join') {
                // 웹사이트로 리다이렉트 - config.websiteUrl 사용
                const joinUrl = `${config.websiteUrl}/party/${partyId}`;
                
                await interaction.reply({ 
                    content: `🎮 파티에 참여하려면 아래 링크를 클릭하세요!\n${joinUrl}`, 
                    ephemeral: true 
                });
            } else if (action === 'view') {
                // 파티 정보 표시
                const partyTypes = {
                    ranked: { name: '정규전', emoji: '⚔️' },
                    practice: { name: '모의전', emoji: '🎯' },
                    training: { name: '훈련', emoji: '📚' },
                    pvp: { name: 'PVP', emoji: '⚡' },
                    blackclaw: { name: '검은발톱', emoji: '🦅' },
                    raid_desert: { name: '레이드-사막', emoji: '🏜️' },
                    raid_north: { name: '레이드-북부', emoji: '❄️' }
                };
                
                const type = partyTypes[party.type];
                const dateStr = new Date(party.scheduledDate).toLocaleDateString('ko-KR');
                
                const infoEmbed = new EmbedBuilder()
                    .setColor(config.embed.color)
                    .setTitle(`${type.emoji} ${party.title}`)
                    .setDescription(party.description || '파티 설명이 없습니다.')
                    .addFields(
                        { name: '📋 파티 종류', value: type.name, inline: true },
                        { name: '👤 주최자', value: party.hostName, inline: true },
                        { name: '📅 일시', value: `${dateStr} ${party.scheduledTime}`, inline: true },
                        { name: '🔵 1팀', value: `${party.team1.length}/${party.maxTeamSize}명`, inline: true },
                        { name: '🔴 2팀', value: `${party.team2.length}/${party.maxTeamSize}명`, inline: true },
                        { name: '⏳ 대기자', value: `${party.waitlist.length}명`, inline: true }
                    );
                
                if (party.preparations) {
                    infoEmbed.addFields({ name: '📌 준비물', value: party.preparations, inline: false });
                }
                
                // config.websiteUrl 사용
                const viewUrl = `${config.websiteUrl}/party/${partyId}`;
                infoEmbed.addFields({ 
                    name: '🔗 파티 페이지', 
                    value: `[여기를 클릭하여 참여하기](${viewUrl})`, 
                    inline: false 
                });
                
                infoEmbed.setFooter({
                    text: 'Aimdot.dev Party System',
                    iconURL: 'https://i.imgur.com/Sd8qK9c.gif'
                })
                .setTimestamp();
                
                await interaction.reply({ 
                    embeds: [infoEmbed], 
                    ephemeral: true 
                });
            }
            
        } catch (error) {
            console.error('파티 버튼 오류:', error);
            await interaction.reply({ 
                content: '파티 정보를 불러오는 중 오류가 발생했습니다.', 
                ephemeral: true 
            });
        }
    }
};
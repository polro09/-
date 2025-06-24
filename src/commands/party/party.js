// src/commands/party/party.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const Party = require('../../models/Party');
const User = require('../../models/User');
const Component = require('../../models/Component');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('party')
        .setNameLocalizations({ 'ko': '파티' })
        .setDescription('파티 시스템을 관리합니다.')
        .setDescriptionLocalizations({ 'ko': '파티 시스템을 관리합니다.' })
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setNameLocalizations({ 'ko': '생성' })
                .setDescription('새로운 파티를 생성합니다.')
                .setDescriptionLocalizations({ 'ko': '새로운 파티를 생성합니다.' })
                .addStringOption(option =>
                    option.setName('name')
                        .setNameLocalizations({ 'ko': '이름' })
                        .setDescription('파티 이름')
                        .setDescriptionLocalizations({ 'ko': '파티 이름' })
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('game')
                        .setNameLocalizations({ 'ko': '게임' })
                        .setDescription('게임 선택')
                        .setDescriptionLocalizations({ 'ko': '게임 선택' })
                        .setRequired(true)
                        .addChoices(
                            { name: 'Valorant', value: 'valorant' },
                            { name: 'League of Legends', value: 'leagueoflegends' },
                            { name: 'Overwatch 2', value: 'overwatch' },
                            { name: '기타', value: 'other' }
                        ))
                .addStringOption(option =>
                    option.setName('mode')
                        .setNameLocalizations({ 'ko': '모드' })
                        .setDescription('게임 모드')
                        .setDescriptionLocalizations({ 'ko': '게임 모드' })
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('max')
                        .setNameLocalizations({ 'ko': '최대인원' })
                        .setDescription('최대 인원 (2-10)')
                        .setDescriptionLocalizations({ 'ko': '최대 인원 (2-10)' })
                        .setMinValue(2)
                        .setMaxValue(10)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setNameLocalizations({ 'ko': '목록' })
                .setDescription('파티 목록을 확인합니다.')
                .setDescriptionLocalizations({ 'ko': '파티 목록을 확인합니다.' })
                .addStringOption(option =>
                    option.setName('game')
                        .setNameLocalizations({ 'ko': '게임' })
                        .setDescription('게임 필터')
                        .setDescriptionLocalizations({ 'ko': '게임 필터' })
                        .addChoices(
                            { name: '전체', value: 'all' },
                            { name: 'Valorant', value: 'valorant' },
                            { name: 'League of Legends', value: 'leagueoflegends' },
                            { name: 'Overwatch 2', value: 'overwatch' },
                            { name: '기타', value: 'other' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setNameLocalizations({ 'ko': '정보' })
                .setDescription('파티 정보를 확인합니다.')
                .setDescriptionLocalizations({ 'ko': '파티 정보를 확인합니다.' })
                .addStringOption(option =>
                    option.setName('id')
                        .setNameLocalizations({ 'ko': '아이디' })
                        .setDescription('파티 ID')
                        .setDescriptionLocalizations({ 'ko': '파티 ID' })
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('join')
                .setNameLocalizations({ 'ko': '참가' })
                .setDescription('파티에 참가합니다.')
                .setDescriptionLocalizations({ 'ko': '파티에 참가합니다.' })
                .addStringOption(option =>
                    option.setName('id')
                        .setNameLocalizations({ 'ko': '아이디' })
                        .setDescription('파티 ID')
                        .setDescriptionLocalizations({ 'ko': '파티 ID' })
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leave')
                .setNameLocalizations({ 'ko': '나가기' })
                .setDescription('파티에서 나갑니다.')
                .setDescriptionLocalizations({ 'ko': '파티에서 나갑니다.' })
                .addStringOption(option =>
                    option.setName('id')
                        .setNameLocalizations({ 'ko': '아이디' })
                        .setDescription('파티 ID')
                        .setDescriptionLocalizations({ 'ko': '파티 ID' })
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('my')
                .setNameLocalizations({ 'ko': '내파티' })
                .setDescription('내 파티 목록을 확인합니다.')
                .setDescriptionLocalizations({ 'ko': '내 파티 목록을 확인합니다.' })),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'create':
                await handleCreate(interaction);
                break;
            case 'list':
                await handleList(interaction);
                break;
            case 'info':
                await handleInfo(interaction);
                break;
            case 'join':
                await handleJoin(interaction);
                break;
            case 'leave':
                await handleLeave(interaction);
                break;
            case 'my':
                await handleMyParties(interaction);
                break;
        }
    },

    category: 'party'
};

// 파티 생성 처리
async function handleCreate(interaction) {
    const name = interaction.options.getString('name');
    const game = interaction.options.getString('game');
    const mode = interaction.options.getString('mode');
    const maxMembers = interaction.options.getInteger('max');

    try {
        // 사용자가 이미 대기 중인 파티가 있는지 확인
        const existingParty = await Party.findOne({
            leader: interaction.user.id,
            status: 'waiting'
        });

        if (existingParty) {
            const errorEmbed = CustomEmbedBuilder.error('이미 대기 중인 파티가 있습니다.');
            return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        // 파티 생성
        const party = await Party.create({
            name,
            game,
            mode,
            maxMembers,
            leader: interaction.user.id,
            guildId: interaction.guild.id,
            members: [{
                user: interaction.user.id,
                role: 'leader',
                joinedAt: new Date()
            }]
        });

        // 파티 임베드 생성
        const partyEmbed = CustomEmbedBuilder.createBasicEmbed({
            title: `🎮 ${name}`,
            description: `**게임:** ${getGameName(game)}\n**모드:** ${mode}\n**인원:** 1/${maxMembers}`,
            fields: [
                {
                    name: '파티장',
                    value: `<@${interaction.user.id}>`,
                    inline: true
                },
                {
                    name: '상태',
                    value: '🟢 대기 중',
                    inline: true
                },
                {
                    name: 'ID',
                    value: party._id.toString(),
                    inline: true
                }
            ],
            color: 0x5865F2
        });

        // 버튼 생성
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`persistent_button_party_join_${party._id}`)
                    .setLabel('참가하기')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId(`persistent_button_party_leave_${party._id}`)
                    .setLabel('나가기')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🚪'),
                new ButtonBuilder()
                    .setCustomId(`persistent_button_party_info_${party._id}`)
                    .setLabel('정보')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('ℹ️')
            );

        const message = await interaction.reply({ embeds: [partyEmbed], components: [row], fetchReply: true });

        // 메시지 ID 저장
        party.messageId = message.id;
        party.textChannelId = interaction.channel.id;
        await party.save();

        // 영속적 컴포넌트 저장
        await Component.create({
            customId: `persistent_button_party_join_${party._id}`,
            type: 'button',
            guildId: interaction.guild.id,
            channelId: interaction.channel.id,
            messageId: message.id,
            handlerName: 'partyJoin',
            data: { partyId: party._id.toString() },
            createdBy: interaction.user.id
        });

        await Component.create({
            customId: `persistent_button_party_leave_${party._id}`,
            type: 'button',
            guildId: interaction.guild.id,
            channelId: interaction.channel.id,
            messageId: message.id,
            handlerName: 'partyLeave',
            data: { partyId: party._id.toString() },
            createdBy: interaction.user.id
        });

        await Component.create({
            customId: `persistent_button_party_info_${party._id}`,
            type: 'button',
            guildId: interaction.guild.id,
            channelId: interaction.channel.id,
            messageId: message.id,
            handlerName: 'partyInfo',
            data: { partyId: party._id.toString() },
            createdBy: interaction.user.id
        });

    } catch (error) {
        console.error('파티 생성 오류:', error);
        const errorEmbed = CustomEmbedBuilder.error('파티 생성 중 오류가 발생했습니다.');
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

// 파티 목록 조회
async function handleList(interaction) {
    const gameFilter = interaction.options.getString('game') || 'all';

    try {
        const filter = { status: 'waiting' };
        if (gameFilter !== 'all') {
            filter.game = gameFilter;
        }

        const parties = await Party.find(filter)
            .populate('leader', 'username')
            .sort('-createdAt')
            .limit(10);

        if (parties.length === 0) {
            const noPartyEmbed = CustomEmbedBuilder.info('파티 없음', '현재 대기 중인 파티가 없습니다.');
            return await interaction.reply({ embeds: [noPartyEmbed], ephemeral: true });
        }

        const listEmbed = CustomEmbedBuilder.createBasicEmbed({
            title: '🎮 파티 목록',
            description: '현재 대기 중인 파티 목록입니다.',
            fields: parties.map(party => ({
                name: `${party.name} (${party.currentMembers}/${party.maxMembers})`,
                value: `**게임:** ${getGameName(party.game)}\n**모드:** ${party.mode}\n**파티장:** ${party.leader.username}\n**ID:** ${party._id}`,
                inline: false
            }))
        });

        await interaction.reply({ embeds: [listEmbed] });

    } catch (error) {
        console.error('파티 목록 조회 오류:', error);
        const errorEmbed = CustomEmbedBuilder.error('파티 목록을 가져올 수 없습니다.');
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

// 파티 정보 조회
async function handleInfo(interaction) {
    const partyId = interaction.options.getString('id');

    try {
        const party = await Party.findById(partyId)
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
                    value: party.members.map(m => `${m.role === 'leader' ? '👑' : '👤'} ${m.user.username}`).join('\n'),
                    inline: false
                }
            ]
        });

        await interaction.reply({ embeds: [infoEmbed] });

    } catch (error) {
        console.error('파티 정보 조회 오류:', error);
        const errorEmbed = CustomEmbedBuilder.error('파티 정보를 가져올 수 없습니다.');
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

// 파티 참가
async function handleJoin(interaction) {
    const partyId = interaction.options.getString('id');

    try {
        const party = await Party.findById(partyId);

        if (!party) {
            const errorEmbed = CustomEmbedBuilder.error('파티를 찾을 수 없습니다.');
            return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        if (party.status !== 'waiting') {
            const errorEmbed = CustomEmbedBuilder.error('대기 중인 파티가 아닙니다.');
            return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        if (party.members.some(m => m.user === interaction.user.id)) {
            const errorEmbed = CustomEmbedBuilder.warning('이미 파티에 참가했습니다.');
            return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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
        await updatePartyMessage(party);

    } catch (error) {
        console.error('파티 참가 오류:', error);
        const errorEmbed = CustomEmbedBuilder.error('파티 참가 중 오류가 발생했습니다.');
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

// 파티 나가기
async function handleLeave(interaction) {
    const partyId = interaction.options.getString('id');

    try {
        const party = await Party.findById(partyId);

        if (!party) {
            const errorEmbed = CustomEmbedBuilder.error('파티를 찾을 수 없습니다.');
            return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        if (!party.members.some(m => m.user === interaction.user.id)) {
            const errorEmbed = CustomEmbedBuilder.warning('파티에 참가하지 않았습니다.');
            return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        // 리더가 나가는 경우
        if (party.leader === interaction.user.id) {
            if (party.members.length > 1) {
                // 다른 멤버에게 리더 위임
                const newLeader = party.members.find(m => m.user !== interaction.user.id);
                party.leader = newLeader.user;
                newLeader.role = 'leader';
                await party.removeMember(interaction.user.id);
                
                const successEmbed = CustomEmbedBuilder.info('리더 위임', `파티 리더가 <@${newLeader.user}>님에게 위임되었습니다.`);
                await interaction.reply({ embeds: [successEmbed] });
            } else {
                // 파티 해산
                await party.deleteOne();
                
                const successEmbed = CustomEmbedBuilder.info('파티 해산', '파티가 해산되었습니다.');
                await interaction.reply({ embeds: [successEmbed] });
                return;
            }
        } else {
            // 일반 멤버가 나가는 경우
            await party.removeMember(interaction.user.id);
            
            const successEmbed = CustomEmbedBuilder.success('파티에서 나갔습니다.');
            await interaction.reply({ embeds: [successEmbed], ephemeral: true });
        }

        // 파티 메시지 업데이트
        await updatePartyMessage(party);

    } catch (error) {
        console.error('파티 나가기 오류:', error);
        const errorEmbed = CustomEmbedBuilder.error('파티 나가기 중 오류가 발생했습니다.');
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

// 내 파티 목록
async function handleMyParties(interaction) {
    try {
        const parties = await Party.find({
            'members.user': interaction.user.id,
            status: { $in: ['waiting', 'in_game'] }
        }).populate('leader', 'username');

        if (parties.length === 0) {
            const noPartyEmbed = CustomEmbedBuilder.info('파티 없음', '참여 중인 파티가 없습니다.');
            return await interaction.reply({ embeds: [noPartyEmbed], ephemeral: true });
        }

        const myPartiesEmbed = CustomEmbedBuilder.createBasicEmbed({
            title: '📋 내 파티 목록',
            fields: parties.map(party => ({
                name: `${party.name} ${party.leader === interaction.user.id ? '👑' : ''}`,
                value: `**게임:** ${getGameName(party.game)}\n**모드:** ${party.mode}\n**인원:** ${party.currentMembers}/${party.maxMembers}\n**상태:** ${getStatusText(party.status)}\n**ID:** ${party._id}`,
                inline: false
            }))
        });

        await interaction.reply({ embeds: [myPartiesEmbed], ephemeral: true });

    } catch (error) {
        console.error('내 파티 조회 오류:', error);
        const errorEmbed = CustomEmbedBuilder.error('파티 목록을 가져올 수 없습니다.');
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

// 헬퍼 함수들
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

// 파티 메시지 업데이트
async function updatePartyMessage(party) {
    if (!party.messageId || !party.textChannelId) return;

    try {
        const channel = await party.client.channels.fetch(party.textChannelId);
        const message = await channel.messages.fetch(party.messageId);

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
                    value: getStatusText(updatedParty.status),
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

        await message.edit({ embeds: [partyEmbed] });

    } catch (error) {
        console.error('파티 메시지 업데이트 오류:', error);
    }
}
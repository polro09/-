// src/commands/utility/setup.js
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const PermissionChecker = require('../../utils/permissions');
const Guild = require('../../models/Guild');
const Component = require('../../models/Component');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setNameLocalizations({ 'ko': '설정' })
        .setDescription('서버의 기본 설정을 구성합니다.')
        .setDescriptionLocalizations({ 'ko': '서버의 기본 설정을 구성합니다.' })
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('welcome')
                .setNameLocalizations({ 'ko': '환영' })
                .setDescription('환영 메시지 설정')
                .setDescriptionLocalizations({ 'ko': '환영 메시지 설정' })
                .addChannelOption(option =>
                    option.setName('channel')
                        .setNameLocalizations({ 'ko': '채널' })
                        .setDescription('환영 메시지를 보낼 채널')
                        .setDescriptionLocalizations({ 'ko': '환영 메시지를 보낼 채널' })
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('verify')
                .setNameLocalizations({ 'ko': '인증' })
                .setDescription('인증 시스템 설정')
                .setDescriptionLocalizations({ 'ko': '인증 시스템 설정' })
                .addChannelOption(option =>
                    option.setName('channel')
                        .setNameLocalizations({ 'ko': '채널' })
                        .setDescription('인증 메시지를 보낼 채널')
                        .setDescriptionLocalizations({ 'ko': '인증 메시지를 보낼 채널' })
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('role')
                        .setNameLocalizations({ 'ko': '역할' })
                        .setDescription('인증 후 부여할 역할')
                        .setDescriptionLocalizations({ 'ko': '인증 후 부여할 역할' })
                        .setRequired(true))),
    
    async execute(interaction) {
        // 권한 확인
        if (!PermissionChecker.hasPermissions(interaction.member, ['ManageGuild'])) {
            const errorEmbed = CustomEmbedBuilder.error(
                PermissionChecker.getMissingPermissionsMessage(['ManageGuild'])
            );
            return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        
        const subcommand = interaction.options.getSubcommand();
        
        // 길드 데이터 가져오기 또는 생성
        let guildData = await Guild.findOne({ guildId: interaction.guild.id });
        if (!guildData) {
            guildData = await Guild.create({
                guildId: interaction.guild.id,
                guildName: interaction.guild.name
            });
        }
        
        switch (subcommand) {
            case 'welcome': {
                const channel = interaction.options.getChannel('channel');
                
                // 설정 업데이트
                guildData.welcomeChannel = channel.id;
                guildData.modules.welcome.enabled = true;
                guildData.modules.welcome.channel = channel.id;
                await guildData.save();
                
                const successEmbed = CustomEmbedBuilder.success(
                    `환영 메시지가 ${channel} 채널로 설정되었습니다.`
                );
                
                await interaction.reply({ embeds: [successEmbed] });
                break;
            }
            
            case 'verify': {
                const channel = interaction.options.getChannel('channel');
                const role = interaction.options.getRole('role');
                
                // 인증 메시지 임베드
                const verifyEmbed = CustomEmbedBuilder.createBasicEmbed({
                    title: '✅ 서버 인증',
                    description: '아래 버튼을 클릭하여 서버 이용 약관에 동의하고 인증을 완료하세요.',
                    fields: [
                        {
                            name: '인증 후 부여되는 역할',
                            value: `<@&${role.id}>`,
                            inline: true
                        }
                    ]
                });
                
                // 영속적 버튼 생성
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`persistent_button_verify_${interaction.guild.id}`)
                            .setLabel('인증하기')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('✅')
                    );
                
                // 인증 메시지 전송
                const message = await channel.send({ 
                    embeds: [verifyEmbed], 
                    components: [row] 
                });
                
                // 영속적 컴포넌트 데이터베이스에 저장
                await Component.create({
                    customId: `persistent_button_verify_${interaction.guild.id}`,
                    type: 'button',
                    guildId: interaction.guild.id,
                    channelId: channel.id,
                    messageId: message.id,
                    handlerName: 'verify',
                    data: {
                        roleId: role.id
                    },
                    createdBy: interaction.user.id
                });
                
                const successEmbed = CustomEmbedBuilder.success(
                    `인증 시스템이 ${channel} 채널에 설정되었습니다.`
                );
                
                await interaction.reply({ embeds: [successEmbed], ephemeral: true });
                break;
            }
        }
    },
    
    category: 'utility'
};
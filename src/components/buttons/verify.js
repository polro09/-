// src/components/buttons/verify.js
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const Component = require('../../models/Component');

module.exports = {
    customId: 'persistent_verify',
    
    async execute(interaction, data) {
        try {
            // 이미 역할을 가지고 있는지 확인
            if (interaction.member.roles.cache.has(data.roleId)) {
                const alreadyVerified = CustomEmbedBuilder.warning('이미 인증이 완료되었습니다.');
                return await interaction.reply({ embeds: [alreadyVerified], ephemeral: true });
            }
            
            // 역할 부여
            const role = interaction.guild.roles.cache.get(data.roleId);
            if (!role) {
                const errorEmbed = CustomEmbedBuilder.error('인증 역할을 찾을 수 없습니다. 관리자에게 문의해주세요.');
                return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            await interaction.member.roles.add(role, '서버 인증 완료');
            
            // 컴포넌트 사용 횟수 증가
            const component = await Component.findOne({ 
                customId: interaction.customId,
                guildId: interaction.guild.id 
            });
            
            if (component) {
                await component.incrementUses();
            }
            
            // 성공 메시지
            const successEmbed = CustomEmbedBuilder.success(
                `인증이 완료되었습니다! ${role} 역할이 부여되었습니다.`
            );
            
            await interaction.reply({ embeds: [successEmbed], ephemeral: true });
            
        } catch (error) {
            console.error('인증 버튼 오류:', error);
            const errorEmbed = CustomEmbedBuilder.error('인증 처리 중 오류가 발생했습니다.');
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
};
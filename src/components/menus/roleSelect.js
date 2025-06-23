// src/components/menus/roleSelect.js
const CustomEmbedBuilder = require('../../utils/embedBuilder');

module.exports = {
    customId: 'persistent_roles',
    
    async execute(interaction, data) {
        try {
            const selectedRoles = interaction.values;
            const member = interaction.member;
            
            // 제거할 역할과 추가할 역할 구분
            const rolesToAdd = [];
            const rolesToRemove = [];
            
            // data.roles는 선택 가능한 모든 역할 ID 배열
            for (const roleId of data.roles) {
                if (selectedRoles.includes(roleId)) {
                    if (!member.roles.cache.has(roleId)) {
                        rolesToAdd.push(roleId);
                    }
                } else {
                    if (member.roles.cache.has(roleId)) {
                        rolesToRemove.push(roleId);
                    }
                }
            }
            
            // 역할 업데이트
            if (rolesToAdd.length > 0) {
                await member.roles.add(rolesToAdd, '역할 자율 선택');
            }
            if (rolesToRemove.length > 0) {
                await member.roles.remove(rolesToRemove, '역할 자율 선택 해제');
            }
            
            // 응답 메시지 생성
            const changes = [];
            if (rolesToAdd.length > 0) {
                changes.push(`**추가된 역할:** ${rolesToAdd.map(id => `<@&${id}>`).join(', ')}`);
            }
            if (rolesToRemove.length > 0) {
                changes.push(`**제거된 역할:** ${rolesToRemove.map(id => `<@&${id}>`).join(', ')}`);
            }
            
            const embed = changes.length > 0 
                ? CustomEmbedBuilder.success(`역할이 업데이트되었습니다!\n\n${changes.join('\n')}`)
                : CustomEmbedBuilder.info('역할 변경 없음', '선택한 역할에 변경사항이 없습니다.');
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
            
        } catch (error) {
            console.error('역할 선택 메뉴 오류:', error);
            const errorEmbed = CustomEmbedBuilder.error('역할 업데이트 중 오류가 발생했습니다.');
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
};
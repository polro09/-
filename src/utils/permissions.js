// src/utils/permissions.js
const { PermissionFlagsBits } = require('discord.js');
const { config } = require('../config/config');

class PermissionChecker {
    /**
     * 사용자가 특정 권한을 가지고 있는지 확인
     * @param {GuildMember} member - 확인할 멤버
     * @param {Array<string>} permissions - 필요한 권한 배열
     * @returns {boolean}
     */
    static hasPermissions(member, permissions) {
        if (!member) return false;
        
        // 서버 소유자는 모든 권한 보유
        if (member.guild.ownerId === member.id) return true;
        
        // 개발자는 모든 권한 보유
        if (config.developers.includes(member.id)) return true;
        
        // 권한 확인
        return permissions.every(perm => member.permissions.has(PermissionFlagsBits[perm]));
    }
    
    /**
     * 봇이 특정 권한을 가지고 있는지 확인
     * @param {Guild} guild - 확인할 길드
     * @param {Array<string>} permissions - 필요한 권한 배열
     * @returns {boolean}
     */
    static botHasPermissions(guild, permissions) {
        const botMember = guild.members.cache.get(guild.client.user.id);
        if (!botMember) return false;
        
        return permissions.every(perm => botMember.permissions.has(PermissionFlagsBits[perm]));
    }
    
    /**
     * 개발자인지 확인
     * @param {string} userId - 사용자 ID
     * @returns {boolean}
     */
    static isDeveloper(userId) {
        return config.developers.includes(userId);
    }
    
    /**
     * 권한 부족 메시지 생성
     * @param {Array<string>} permissions - 필요한 권한 배열
     * @returns {string}
     */
    static getMissingPermissionsMessage(permissions) {
        const permissionNames = permissions.map(perm => {
            const permMap = {
                'Administrator': '관리자',
                'ManageGuild': '서버 관리',
                'ManageChannels': '채널 관리',
                'ManageRoles': '역할 관리',
                'ManageMessages': '메시지 관리',
                'KickMembers': '멤버 추방',
                'BanMembers': '멤버 차단',
                'ModerateMembers': '멤버 타임아웃'
            };
            return permMap[perm] || perm;
        });
        
        return `이 명령어를 사용하려면 다음 권한이 필요합니다: ${permissionNames.join(', ')}`;
    }
}

module.exports = PermissionChecker;
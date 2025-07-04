// src/utils/roleSync.js
const User = require('../models/User');
const logger = require('./logger');

class RoleSync {
    constructor(client) {
        this.client = client;
        
        // 대상 서버 및 역할 설정
        this.config = {
            guildId: '1369351558302662821', // 대상 서버 ID
            roleMapping: {
                // Discord 역할 ID: 웹 권한
                '1369963953702047785': 'member',  // 특정 역할 → member
                // 추가 역할 매핑 가능
                // 'ANOTHER_ROLE_ID': 'subadmin',
                // 'ADMIN_ROLE_ID': 'admin',
            }
        };
    }
    
    /**
     * 권한 레벨 값 가져오기
     */
    getRoleValue(role) {
        const roleValues = {
            'guest': 0,
            'member': 1,
            'subadmin': 2,
            'admin': 3,
            'owner': 4
        };
        return roleValues[role] || 0;
    }
    
    /**
     * 사용자의 Discord 역할을 확인하고 웹 권한을 결정
     * @param {string} userId - Discord 사용자 ID
     * @returns {Promise<string>} - 부여할 권한
     */
    async determineUserRole(userId) {
        try {
            // Discord 서버와 멤버 정보 가져오기
            const guild = await this.client.guilds.fetch(this.config.guildId).catch(() => null);
            if (!guild) {
                logger.warn(`서버를 찾을 수 없음: ${this.config.guildId}`, 'roleSync');
                return 'guest';
            }
            
            const member = await guild.members.fetch(userId).catch(() => null);
            
            if (!member) {
                logger.info(`사용자가 서버 멤버가 아님: ${userId}`, 'roleSync');
                return 'guest';
            }
            
            // 가장 높은 권한 찾기
            let highestRole = 'guest';
            
            for (const [roleId, webRole] of Object.entries(this.config.roleMapping)) {
                if (member.roles.cache.has(roleId)) {
                    if (this.getRoleValue(webRole) > this.getRoleValue(highestRole)) {
                        highestRole = webRole;
                        logger.info(`역할 감지: ${userId} - Discord 역할 ${roleId} → ${webRole}`, 'roleSync');
                    }
                }
            }
            
            return highestRole;
        } catch (error) {
            logger.error(`역할 확인 오류: ${error.message}`, 'roleSync');
            return 'guest';
        }
    }
    
    /**
     * 사용자의 Discord 역할을 확인하고 웹 권한을 동기화
     * @param {string} userId - Discord 사용자 ID
     * @param {boolean} forceUpdate - 강제 업데이트 여부
     * @returns {Promise<Object>} - 동기화 결과
     */
    async syncUserRole(userId, forceUpdate = false) {
        try {
            const newRole = await this.determineUserRole(userId);
            
            // DB에서 사용자 조회
            const user = await User.findOne({ discordId: userId });
            if (!user) {
                logger.info(`신규 사용자 역할 설정: ${userId} → ${newRole}`, 'roleSync');
                return { role: newRole, updated: false, isNew: true };
            }
            
            const currentRole = user.dashboardRole || 'guest';
            const currentValue = this.getRoleValue(currentRole);
            const newValue = this.getRoleValue(newRole);
            
            // owner는 변경하지 않음
            if (currentRole === 'owner') {
                return { role: currentRole, updated: false, reason: 'owner 권한은 변경 불가' };
            }
            
            // 강제 업데이트가 아닌 경우, 현재 권한이 더 높으면 유지
            if (!forceUpdate && currentValue >= newValue) {
                logger.debug(`현재 권한 유지: ${userId} - ${currentRole} (새 권한: ${newRole})`, 'roleSync');
                return { role: currentRole, updated: false, reason: '현재 권한이 더 높음' };
            }
            
            // 권한 업데이트
            user.dashboardRole = newRole;
            await user.save();
            
            logger.success(`역할 동기화 완료: ${userId} - ${currentRole} → ${newRole}`, 'roleSync');
            return { 
                role: newRole, 
                updated: true, 
                previousRole: currentRole 
            };
            
        } catch (error) {
            logger.error(`역할 동기화 오류: ${error.message}`, 'roleSync');
            return { role: 'guest', error: error.message };
        }
    }
    
    /**
     * 모든 사용자의 역할을 동기화 (정기적 실행용)
     */
    async syncAllUsers() {
        try {
            const users = await User.find({ dashboardRole: { $ne: 'owner' } });
            const guild = await this.client.guilds.fetch(this.config.guildId).catch(() => null);
            
            if (!guild) {
                logger.error(`서버를 찾을 수 없어 동기화 중단: ${this.config.guildId}`, 'roleSync');
                return;
            }
            
            let syncCount = 0;
            let removeCount = 0;
            
            for (const user of users) {
                try {
                    const member = await guild.members.fetch(user.discordId).catch(() => null);
                    
                    if (!member) {
                        // 서버를 나간 사용자는 guest로 변경
                        if (user.dashboardRole !== 'guest') {
                            user.dashboardRole = 'guest';
                            await user.save();
                            removeCount++;
                            logger.info(`서버 탈퇴로 권한 제거: ${user.username}`, 'roleSync');
                        }
                        continue;
                    }
                    
                    // 역할 확인 및 동기화
                    const result = await this.syncUserRole(user.discordId, true);
                    if (result.updated) {
                        syncCount++;
                    }
                } catch (error) {
                    logger.error(`사용자 동기화 오류 ${user.username}: ${error.message}`, 'roleSync');
                }
            }
            
            logger.success(`전체 사용자 역할 동기화 완료 - 업데이트: ${syncCount}명, 제거: ${removeCount}명`, 'roleSync');
        } catch (error) {
            logger.error(`전체 동기화 오류: ${error.message}`, 'roleSync');
        }
    }
    
    /**
     * Discord 역할 변경 이벤트 처리 설정
     */
    setupEventListeners() {
        // 멤버 역할 업데이트 이벤트
        this.client.on('guildMemberUpdate', async (oldMember, newMember) => {
            if (newMember.guild.id !== this.config.guildId) return;
            
            const oldRoles = oldMember.roles.cache;
            const newRoles = newMember.roles.cache;
            
            // 관심 있는 역할의 변경사항 확인
            const trackedRoleIds = Object.keys(this.config.roleMapping);
            const hasRelevantChange = trackedRoleIds.some(roleId => 
                oldRoles.has(roleId) !== newRoles.has(roleId)
            );
            
            if (hasRelevantChange) {
                logger.info(`역할 변경 감지: ${newMember.user.username}`, 'roleSync');
                await this.syncUserRole(newMember.user.id, true);
            }
        });
        
        // 멤버 서버 참가 이벤트
        this.client.on('guildMemberAdd', async (member) => {
            if (member.guild.id !== this.config.guildId) return;
            logger.info(`새 멤버 참가: ${member.user.username}`, 'roleSync');
            await this.syncUserRole(member.user.id);
        });
        
        // 멤버 서버 탈퇴 이벤트
        this.client.on('guildMemberRemove', async (member) => {
            if (member.guild.id !== this.config.guildId) return;
            
            const user = await User.findOne({ discordId: member.user.id });
            if (user && user.dashboardRole !== 'owner' && user.dashboardRole !== 'guest') {
                user.dashboardRole = 'guest';
                await user.save();
                logger.info(`서버 탈퇴로 권한 제거: ${member.user.username}`, 'roleSync');
            }
        });
        
        logger.success('Discord 역할 동기화 이벤트 리스너 설정 완료', 'roleSync');
    }
}

module.exports = RoleSync;
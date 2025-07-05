/**
 * 사용자 프로필 컴포넌트
 * 사용자 정보 표시 및 수정 기능
 */
export class UserProfile {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? 
            document.querySelector(container) : container;
        
        this.options = {
            editable: true,
            showStats: true,
            showActions: true,
            onUpdate: null,
            ...options
        };
        
        this.user = null;
        this.init();
    }
    
    /**
     * 컴포넌트 초기화
     */
    init() {
        if (!this.container) {
            console.error('UserProfile: 컨테이너를 찾을 수 없습니다.');
            return;
        }
        
        this.loadUserData();
    }
    
    /**
     * 사용자 데이터 로드
     */
    async loadUserData() {
        try {
            const response = await fetch('/api/user');
            const data = await response.json();
            
            if (data.success) {
                this.user = data.user;
                this.render();
            } else {
                this.renderGuest();
            }
        } catch (error) {
            console.error('사용자 데이터 로드 오류:', error);
            this.renderError();
        }
    }
    
    /**
     * 프로필 렌더링
     */
    render() {
        if (!this.user) {
            this.renderGuest();
            return;
        }
        
        const profileHTML = `
            <div class="profile-container">
                <div class="profile-header">
                    <img src="${this.user.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         alt="Avatar" 
                         class="profile-avatar-large">
                    <div class="profile-info">
                        <h2 class="profile-username">
                            ${this.escapeHtml(this.user.username)}
                            ${this.options.editable ? `
                                <button class="btn-edit-nickname" onclick="userProfile.editNickname()">
                                    <i class="fas fa-pencil-alt"></i>
                                </button>
                            ` : ''}
                        </h2>
                        <p class="profile-nickname">${this.escapeHtml(this.user.nickname || this.user.username)}</p>
                        <div class="profile-badges">
                            <span class="badge badge-${this.user.dashboardRole || 'member'}">
                                ${this.getRoleName(this.user.dashboardRole)}
                            </span>
                            ${this.user.isOnline ? '<span class="badge badge-online">온라인</span>' : ''}
                        </div>
                    </div>
                </div>
                
                ${this.options.showStats ? this.renderStats() : ''}
                ${this.options.showActions ? this.renderActions() : ''}
            </div>
        `;
        
        this.container.innerHTML = profileHTML;
        
        // 전역 참조 설정 (인라인 이벤트 핸들러용)
        window.userProfile = this;
    }
    
    /**
     * 통계 렌더링
     */
    renderStats() {
        const stats = this.user.gameStats || {
            wins: 0,
            losses: 0,
            totalKills: 0,
            avgKills: 0,
            rankedGames: 0,
            practiceGames: 0
        };
        
        const winRate = stats.wins + stats.losses > 0 ? 
            Math.round((stats.wins / (stats.wins + stats.losses)) * 100) : 0;
        
        return `
            <div class="profile-stats">
                <h3 class="stats-title">게임 통계</h3>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">전적</div>
                        <div class="stat-value">${stats.wins}승 ${stats.losses}패</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">승률</div>
                        <div class="stat-value">${winRate}%</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">평균 킬</div>
                        <div class="stat-value">${stats.avgKills.toFixed(1)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">랭크전</div>
                        <div class="stat-value">${stats.rankedGames}회</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">연습전</div>
                        <div class="stat-value">${stats.practiceGames}회</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">총 게임</div>
                        <div class="stat-value">${stats.rankedGames + stats.practiceGames}회</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * 액션 버튼 렌더링
     */
    renderActions() {
        return `
            <div class="profile-actions">
                <button class="btn btn-primary" onclick="userProfile.viewFullProfile()">
                    <i class="fas fa-user"></i> 전체 프로필
                </button>
                <a href="/dashboard" class="btn btn-secondary">
                    <i class="fas fa-th-large"></i> 대시보드
                </a>
                <a href="/auth/logout" class="btn btn-danger">
                    <i class="fas fa-sign-out-alt"></i> 로그아웃
                </a>
            </div>
        `;
    }
    
    /**
     * 비로그인 상태 렌더링
     */
    renderGuest() {
        this.container.innerHTML = `
            <div class="profile-container guest">
                <div class="guest-message">
                    <i class="fas fa-user-circle guest-icon"></i>
                    <h3>로그인이 필요합니다</h3>
                    <p>Discord로 로그인하여 모든 기능을 이용하세요.</p>
                    <a href="/auth/discord" class="btn btn-primary">
                        <i class="fab fa-discord"></i> Discord로 로그인
                    </a>
                </div>
            </div>
        `;
    }
    
    /**
     * 에러 상태 렌더링
     */
    renderError() {
        this.container.innerHTML = `
            <div class="profile-container error">
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle error-icon"></i>
                    <h3>오류가 발생했습니다</h3>
                    <p>프로필을 불러올 수 없습니다.</p>
                    <button class="btn btn-secondary" onclick="userProfile.loadUserData()">
                        <i class="fas fa-redo"></i> 다시 시도
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * 닉네임 수정
     */
    async editNickname() {
        const { Modal } = window;
        
        const modal = new Modal({
            title: '닉네임 변경',
            content: `
                <form id="nickname-form">
                    <div class="form-group">
                        <label for="new-nickname">새 닉네임</label>
                        <input type="text" 
                               id="new-nickname" 
                               class="form-control" 
                               value="${this.escapeHtml(this.user.nickname || this.user.username)}"
                               maxlength="32"
                               required>
                        <small class="form-text">2-32자 사이로 입력하세요.</small>
                    </div>
                </form>
            `,
            buttons: [
                {
                    text: '취소',
                    type: 'secondary'
                },
                {
                    text: '변경',
                    type: 'primary',
                    onClick: async (modal) => {
                        const nickname = document.getElementById('new-nickname').value.trim();
                        
                        if (nickname.length < 2 || nickname.length > 32) {
                            window.toast.error('닉네임은 2-32자 사이여야 합니다.');
                            return false;
                        }
                        
                        try {
                            const response = await fetch('/api/user/nickname', {
                                method: 'PUT',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ nickname })
                            });
                            
                            const result = await response.json();
                            
                            if (result.success) {
                                window.toast.success('닉네임이 변경되었습니다.');
                                this.user.nickname = nickname;
                                this.render();
                                
                                if (this.options.onUpdate) {
                                    this.options.onUpdate(this.user);
                                }
                            } else {
                                window.toast.error(result.error || '닉네임 변경에 실패했습니다.');
                            }
                        } catch (error) {
                            window.toast.error('오류가 발생했습니다.');
                        }
                    }
                }
            ]
        });
        
        modal.show();
        
        // 엔터키로 제출
        setTimeout(() => {
            const form = document.getElementById('nickname-form');
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const primaryBtn = modal.element.querySelector('.btn-primary');
                primaryBtn.click();
            });
        }, 100);
    }
    
    /**
     * 전체 프로필 보기
     */
    viewFullProfile() {
        // TODO: 프로필 페이지로 이동
        window.location.href = `/profile/${this.user.id}`;
    }
    
    /**
     * 역할 이름 변환
     */
    getRoleName(role) {
        const roleNames = {
            owner: 'Owner',
            admin: 'Admin',
            subadmin: 'Sub Admin',
            member: 'Member',
            guest: 'Guest'
        };
        return roleNames[role] || 'Member';
    }
    
    /**
     * HTML 이스케이프
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 스타일 주입
const style = document.createElement('style');
style.textContent = `
    .profile-container {
        background: var(--bg-secondary);
        border-radius: 12px;
        padding: 24px;
    }
    
    .profile-header {
        display: flex;
        align-items: center;
        gap: 20px;
        margin-bottom: 24px;
    }
    
    .profile-avatar-large {
        width: 100px;
        height: 100px;
        border-radius: 50%;
        border: 4px solid var(--accent-primary);
    }
    
    .profile-info {
        flex: 1;
    }
    
    .profile-username {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0 0 4px 0;
        display: flex;
        align-items: center;
        gap: 12px;
    }
    
    .btn-edit-nickname {
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        transition: all 0.2s;
    }
    
    .btn-edit-nickname:hover {
        background: var(--bg-tertiary);
        color: var(--accent-primary);
    }
    
    .profile-nickname {
        color: var(--text-secondary);
        margin: 0 0 12px 0;
    }
    
    .profile-badges {
        display: flex;
        gap: 8px;
    }
    
    .badge {
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 0.85rem;
        font-weight: 500;
    }
    
    .badge-owner {
        background: var(--danger);
        color: white;
    }
    
    .badge-admin {
        background: var(--warning);
        color: white;
    }
    
    .badge-subadmin {
        background: var(--info);
        color: white;
    }
    
    .badge-member {
        background: var(--success);
        color: white;
    }
    
    .badge-online {
        background: var(--success);
        color: white;
    }
    
    .profile-stats {
        margin-top: 24px;
    }
    
    .stats-title {
        font-size: 1.1rem;
        margin-bottom: 16px;
    }
    
    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 12px;
    }
    
    .stat-card {
        background: var(--bg-tertiary);
        padding: 16px;
        border-radius: 8px;
        text-align: center;
    }
    
    .stat-label {
        font-size: 0.85rem;
        color: var(--text-secondary);
        margin-bottom: 4px;
    }
    
    .stat-value {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--text-primary);
    }
    
    .profile-actions {
        display: flex;
        gap: 12px;
        margin-top: 24px;
        flex-wrap: wrap;
    }
    
    .guest-message,
    .error-message {
        text-align: center;
        padding: 48px 24px;
    }
    
    .guest-icon,
    .error-icon {
        font-size: 4rem;
        color: var(--text-muted);
        margin-bottom: 16px;
    }
    
    .error-icon {
        color: var(--danger);
    }
    
    .btn-danger {
        background: rgba(237, 66, 69, 0.1);
        color: var(--danger);
    }
    
    .btn-danger:hover {
        background: var(--danger);
        color: white;
    }
    
    .form-group {
        margin-bottom: 16px;
    }
    
    .form-group label {
        display: block;
        margin-bottom: 8px;
        font-weight: 500;
    }
    
    .form-control {
        width: 100%;
        padding: 8px 12px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        color: var(--text-primary);
        font-size: 1rem;
    }
    
    .form-control:focus {
        outline: none;
        border-color: var(--accent-primary);
    }
    
    .form-text {
        display: block;
        margin-top: 4px;
        font-size: 0.85rem;
        color: var(--text-secondary);
    }
`;
document.head.appendChild(style);
// src/web/public/js/auth-handler.js
// 클라이언트 사이드 인증 핸들러

class AuthHandler {
    constructor() {
        this.isLoggedIn = false;
        this.userInfo = null;
        this.initializeAuth();
    }
    
    // 인증 시스템 초기화
    async initializeAuth() {
        try {
            // 현재 로그인 상태 확인
            await this.checkAuthStatus();
            
            // 페이지별 인증 처리
            this.handlePageAuth();
            
        } catch (error) {
            console.error('인증 초기화 오류:', error);
            this.showToast('인증 시스템 초기화 중 오류가 발생했습니다.', 'error');
        }
    }
    
    // 현재 인증 상태 확인
    async checkAuthStatus() {
        try {
            const response = await fetch('/auth/check');
            const data = await response.json();
            
            if (data.user) {
                this.isLoggedIn = true;
                this.userInfo = data.user;
                this.updateUI(true);
            } else {
                this.isLoggedIn = false;
                this.userInfo = null;
                this.updateUI(false);
            }
            
        } catch (error) {
            console.error('인증 상태 확인 오류:', error);
            this.isLoggedIn = false;
            this.updateUI(false);
        }
    }
    
    // 페이지별 인증 처리
    handlePageAuth() {
        const currentPath = window.location.pathname;
        
        // 보호된 페이지 목록
        const protectedPages = [
            '/dashboard',
            '/party/create',
            '/party/',
            '/dashboard/permissions',
            '/dashboard/servers',
            '/dashboard/db-management'
        ];
        
        // 현재 페이지가 보호된 페이지인지 확인
        const isProtectedPage = protectedPages.some(page => 
            currentPath.startsWith(page)
        );
        
        if (isProtectedPage && !this.isLoggedIn) {
            this.redirectToLogin();
            return;
        }
        
        // 로그인된 상태라면 사용자 정보 표시
        if (this.isLoggedIn) {
            this.displayUserInfo();
        }
    }
    
    // Discord 로그인 시작
    async startDiscordLogin() {
        try {
            this.showToast('Discord 로그인 중...', 'info');
            
            // OAuth URL 요청
            const response = await fetch('/api/oauth-url');
            const data = await response.json();
            
            if (data.success && data.url) {
                // Discord OAuth 페이지로 리디렉션
                window.location.href = data.url;
            } else {
                throw new Error(data.error || '로그인 URL을 생성할 수 없습니다.');
            }
            
        } catch (error) {
            console.error('Discord 로그인 오류:', error);
            this.showToast('로그인 중 오류가 발생했습니다.', 'error');
        }
    }
    
    // 로그인 페이지로 리디렉션
    redirectToLogin() {
        const currentUrl = encodeURIComponent(window.location.pathname + window.location.search);
        const loginUrl = `/auth/discord?returnUrl=${currentUrl}`;
        
        this.showToast('로그인이 필요합니다. Discord로 로그인해주세요.', 'warning');
        
        // 3초 후 리디렉션
        setTimeout(() => {
            window.location.href = loginUrl;
        }, 3000);
    }
    
    // 로그아웃
    async logout() {
        try {
            this.showToast('로그아웃 중...', 'info');
            
            const response = await fetch('/auth/logout', {
                method: 'GET'
            });
            
            if (response.ok) {
                this.isLoggedIn = false;
                this.userInfo = null;
                this.updateUI(false);
                this.showToast('로그아웃되었습니다.', 'success');
                
                // 메인 페이지로 이동
                setTimeout(() => {
                    window.location.href = '/';
                }, 1500);
            } else {
                throw new Error('로그아웃 요청이 실패했습니다.');
            }
            
        } catch (error) {
            console.error('로그아웃 오류:', error);
            this.showToast('로그아웃 중 오류가 발생했습니다.', 'error');
        }
    }
    
    // UI 업데이트
    updateUI(isLoggedIn) {
        // 로그인 버튼 처리
        const loginBtns = document.querySelectorAll('.btn-login, .login-btn');
        const logoutBtns = document.querySelectorAll('.btn-logout, .logout-btn');
        const userProfile = document.querySelectorAll('.user-profile');
        
        if (isLoggedIn) {
            // 로그인된 상태
            loginBtns.forEach(btn => btn.style.display = 'none');
            logoutBtns.forEach(btn => btn.style.display = 'inline-block');
            userProfile.forEach(profile => profile.style.display = 'block');
        } else {
            // 로그아웃된 상태
            loginBtns.forEach(btn => btn.style.display = 'inline-block');
            logoutBtns.forEach(btn => btn.style.display = 'none');
            userProfile.forEach(profile => profile.style.display = 'none');
        }
    }
    
    // 사용자 정보 표시
    displayUserInfo() {
        if (!this.userInfo) return;
        
        // 사용자 이름 표시
        const usernameElements = document.querySelectorAll('.user-username, .username');
        usernameElements.forEach(el => {
            el.textContent = this.userInfo.username || this.userInfo.displayName;
        });
        
        // 사용자 아바타 표시
        const avatarElements = document.querySelectorAll('.user-avatar, .avatar');
        avatarElements.forEach(el => {
            if (this.userInfo.avatar) {
                el.src = this.userInfo.avatar;
                el.alt = this.userInfo.username;
            }
        });
        
        // 권한 레벨 표시
        const roleElements = document.querySelectorAll('.user-role, .role');
        roleElements.forEach(el => {
            el.textContent = this.userInfo.dashboardRole || 'member';
        });
    }
    
    // 권한 확인
    hasPermission(requiredRole) {
        if (!this.isLoggedIn || !this.userInfo) return false;
        
        const roleHierarchy = {
            'guest': 0,
            'member': 1,
            'subadmin': 2,
            'admin': 3,
            'owner': 4
        };
        
        const userLevel = roleHierarchy[this.userInfo.dashboardRole] || 0;
        const requiredLevel = roleHierarchy[requiredRole] || 999;
        
        return userLevel >= requiredLevel;
    }
    
    // 권한 기반 UI 처리
    handlePermissionBasedUI() {
        // 관리자 전용 요소들
        const adminElements = document.querySelectorAll('.admin-only');
        const subAdminElements = document.querySelectorAll('.subadmin-only');
        
        if (this.hasPermission('admin')) {
            adminElements.forEach(el => el.style.display = 'block');
        } else {
            adminElements.forEach(el => el.style.display = 'none');
        }
        
        if (this.hasPermission('subadmin')) {
            subAdminElements.forEach(el => el.style.display = 'block');
        } else {
            subAdminElements.forEach(el => el.style.display = 'none');
        }
    }
    
    // 토스트 메시지 표시
    showToast(message, type = 'info') {
        // 기존 토스트 시스템 활용
        if (window.toast && typeof window.toast.show === 'function') {
            window.toast.show(message, type);
        } else if (window.showToast && typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            // 기본 토스트 생성
            this.createToast(message, type);
        }
    }
    
    // 기본 토스트 생성
    createToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'times' : type === 'warning' ? 'exclamation' : 'info'}-circle"></i>
                <span>${message}</span>
            </div>
        `;
        
        // 스타일 적용
        Object.assign(toast.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            backgroundColor: type === 'success' ? '#28a745' : 
                            type === 'error' ? '#dc3545' : 
                            type === 'warning' ? '#ffc107' : '#17a2b8',
            color: 'white',
            borderRadius: '8px',
            zIndex: '9999',
            opacity: '0',
            transition: 'opacity 0.3s ease',
            fontFamily: 'Arial, sans-serif'
        });
        
        document.body.appendChild(toast);
        
        // 애니메이션
        setTimeout(() => toast.style.opacity = '1', 100);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 3000);
    }
    
    // 이벤트 리스너 등록
    setupEventListeners() {
        // 로그인 버튼들
        document.addEventListener('click', (e) => {
            if (e.target.matches('.btn-login, .login-btn, [data-auth="login"]')) {
                e.preventDefault();
                this.startDiscordLogin();
            }
            
            if (e.target.matches('.btn-logout, .logout-btn, [data-auth="logout"]')) {
                e.preventDefault();
                this.logout();
            }
        });
        
        // 페이지 로드 시 권한 UI 처리
        document.addEventListener('DOMContentLoaded', () => {
            this.handlePermissionBasedUI();
        });
    }
}

// 전역 인스턴스 생성
window.authHandler = new AuthHandler();

// 이벤트 리스너 등록
window.authHandler.setupEventListeners();

// 레거시 함수들 (기존 코드 호환성)
window.loginWithDiscord = () => window.authHandler.startDiscordLogin();
window.logout = () => window.authHandler.logout();
window.checkAuth = () => window.authHandler.checkAuthStatus();

// 모듈 내보내기 (ES6 환경에서 사용 가능)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthHandler;
}
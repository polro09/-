// src/web/public/js/auth-handler.js
/**
 * 대시보드 및 보호된 페이지 접근 시 인증 처리
 */

// 페이지 로드 시 인증 상태 확인
document.addEventListener('DOMContentLoaded', async function() {
    // 대시보드 링크들을 찾아서 처리
    const dashboardLinks = document.querySelectorAll('a[href="/dashboard"], a[href^="/dashboard/"]');
    
    dashboardLinks.forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const targetUrl = link.getAttribute('href');
            
            try {
                // 세션 확인 API 호출
                const response = await fetch('/auth/check');
                const data = await response.json();
                
                if (data.user) {
                    // 로그인된 상태 - 권한 확인
                    const roleValues = {
                        guest: 0,
                        member: 1,
                        subadmin: 2,
                        admin: 3,
                        owner: 4
                    };
                    
                    const userRole = data.user.dashboardRole || 'guest';
                    const userRoleValue = roleValues[userRole] || 0;
                    
                    // 페이지별 필요 권한 매핑
                    const pagePermissions = {
                        '/dashboard': 'member',
                        '/dashboard/servers': 'subadmin',
                        '/dashboard/db-management': 'subadmin',
                        '/dashboard/permissions': 'admin'
                    };
                    
                    const requiredRole = pagePermissions[targetUrl] || 'member';
                    const requiredRoleValue = roleValues[requiredRole] || 1;
                    
                    if (userRoleValue >= requiredRoleValue) {
                        // 권한이 충분한 경우 - 페이지 이동
                        window.location.href = targetUrl;
                    } else {
                        // 권한 부족
                        showAuthToast(`이 페이지에 접근하려면 ${requiredRole} 이상의 권한이 필요합니다.`, 'warning');
                    }
                } else {
                    // 로그인되지 않은 상태
                    showAuthToast('로그인이 필요한 페이지입니다.', 'info');
                    
                    // 로그인 버튼 하이라이트 효과
                    highlightLoginButton();
                }
            } catch (error) {
                console.error('인증 확인 오류:', error);
                showAuthToast('인증 상태를 확인할 수 없습니다.', 'error');
            }
        });
    });
});

// 인증 관련 토스트 메시지 표시
function showAuthToast(message, type = 'info') {
    // 기존 toast 함수가 있으면 사용
    if (typeof showToast === 'function') {
        showToast(message, type);
    } else if (window.toast) {
        window.toast[type](message);
    } else {
        // Toast가 없으면 간단한 알림 표시
        const toastHtml = `
            <div class="auth-toast ${type}">
                <div class="auth-toast-content">
                    <i class="fas fa-${getToastIcon(type)}"></i>
                    <span>${message}</span>
                </div>
            </div>
        `;
        
        const toastElement = document.createElement('div');
        toastElement.innerHTML = toastHtml;
        document.body.appendChild(toastElement.firstElementChild);
        
        setTimeout(() => {
            const toast = document.querySelector('.auth-toast');
            if (toast) {
                toast.classList.add('fade-out');
                setTimeout(() => toast.remove(), 300);
            }
        }, 3000);
    }
}

// 로그인 버튼 하이라이트
function highlightLoginButton() {
    const loginBtn = document.querySelector('a[href="/auth/discord"]');
    if (loginBtn) {
        loginBtn.classList.add('highlight-pulse');
        setTimeout(() => {
            loginBtn.classList.remove('highlight-pulse');
        }, 3000);
    }
}

// 토스트 아이콘 결정
function getToastIcon(type) {
    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// CSS 스타일 추가
const style = document.createElement('style');
style.textContent = `
    .auth-toast {
        position: fixed;
        top: 20px;
        right: 20px;
        background: #1e1e1e;
        border-radius: 8px;
        padding: 16px 24px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        border-left: 4px solid;
    }
    
    .auth-toast.info {
        border-left-color: #2196f3;
    }
    
    .auth-toast.warning {
        border-left-color: #ff9800;
    }
    
    .auth-toast.error {
        border-left-color: #f44336;
    }
    
    .auth-toast.success {
        border-left-color: #4caf50;
    }
    
    .auth-toast-content {
        display: flex;
        align-items: center;
        gap: 12px;
        color: #ffffff;
    }
    
    .auth-toast-content i {
        font-size: 20px;
    }
    
    .auth-toast.info i { color: #2196f3; }
    .auth-toast.warning i { color: #ff9800; }
    .auth-toast.error i { color: #f44336; }
    .auth-toast.success i { color: #4caf50; }
    
    .auth-toast.fade-out {
        animation: slideOut 0.3s ease-out forwards;
    }
    
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(100%);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
    
    @keyframes slideOut {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100%);
        }
    }
    
    .highlight-pulse {
        animation: pulse 1s ease-in-out 3;
    }
    
    @keyframes pulse {
        0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7);
        }
        50% {
            transform: scale(1.05);
            box-shadow: 0 0 0 10px rgba(33, 150, 243, 0);
        }
    }
`;
document.head.appendChild(style);
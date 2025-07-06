// src/web/public/js/main.js

// 세션 확인 함수 (checkUserSession이 없을 경우를 대비)
window.checkUserSession = async function() {
    try {
        const response = await fetch('/api/session');
        const data = await response.json();
        
        if (data.user) {
            console.log('사용자 로그인됨:', data.user.username);
            // 로그인 상태에 따른 UI 업데이트가 필요한 경우 여기에 추가
        } else {
            console.log('비로그인 상태');
            // 비로그인 상태 처리 - 자동 리다이렉트는 하지 않음
        }
        
        return data.user;
    } catch (error) {
        console.error('세션 확인 오류:', error);
        return null;
    }
};

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', async function() {
    // 세션 확인 (자동 리다이렉트 없이)
    const user = await checkUserSession();
    
    // 대시보드 링크 처리 (로그인하지 않은 경우)
    const dashboardLinks = document.querySelectorAll('a[href="/dashboard"], a[href^="/dashboard/"]');
    
    dashboardLinks.forEach(link => {
        link.addEventListener('click', async (e) => {
            // 로그인 상태 재확인
            const response = await fetch('/api/session');
            const data = await response.json();
            
            if (!data.user) {
                e.preventDefault();
                // 토스트 메시지 표시
                if (typeof showToast === 'function') {
                    showToast('로그인이 필요한 페이지입니다.', 'info');
                } else {
                    alert('로그인이 필요한 페이지입니다.');
                }
                
                // 로그인 버튼 하이라이트 (있는 경우)
                const loginBtn = document.querySelector('a[href="/auth/discord"]');
                if (loginBtn) {
                    loginBtn.classList.add('highlight');
                    setTimeout(() => {
                        loginBtn.classList.remove('highlight');
                    }, 3000);
                }
            }
        });
    });
});

// 토스트 메시지 함수 (없는 경우를 대비한 간단한 구현)
if (typeof showToast === 'undefined') {
    window.showToast = function(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // 간단한 토스트 구현
        const toast = document.createElement('div');
        toast.className = `simple-toast ${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #333;
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };
}

// 간단한 애니메이션 스타일 추가
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .highlight {
        animation: pulse 1s ease-in-out 3;
    }
    
    @keyframes pulse {
        0%, 100% {
            transform: scale(1);
        }
        50% {
            transform: scale(1.05);
        }
    }
`;
document.head.appendChild(style);
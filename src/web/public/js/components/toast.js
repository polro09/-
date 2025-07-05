/**
 * Toast 알림 컴포넌트
 * 화면 우측 상단에 일시적으로 표시되는 알림 메시지
 */
export class Toast {
    static container = null;
    static toasts = new Map();
    
    /**
     * Toast 컨테이너 초기화
     */
    static init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            this.container.setAttribute('aria-live', 'polite');
            this.container.setAttribute('aria-atomic', 'true');
            document.body.appendChild(this.container);
            
            // 스타일 주입
            this.injectStyles();
        }
    }
    
    /**
     * Toast 메시지 표시
     * @param {string} message - 표시할 메시지
     * @param {string} type - 메시지 타입 (success, error, warning, info)
     * @param {number} duration - 표시 시간 (ms)
     * @returns {string} - Toast ID
     */
    static show(message, type = 'info', duration = 3000) {
        this.init();
        
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.id = id;
        
        // 아이콘 설정
        const icon = this.getIcon(type);
        
        // Toast 내용 구성
        toast.innerHTML = `
            <div class="toast-content">
                <div class="toast-icon">${icon}</div>
                <div class="toast-message">${this.escapeHtml(message)}</div>
                <button class="toast-close" aria-label="닫기">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="toast-progress">
                <div class="toast-progress-bar" style="animation-duration: ${duration}ms"></div>
            </div>
        `;
        
        // 닫기 버튼 이벤트
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this.remove(id));
        
        // Toast 추가
        this.container.appendChild(toast);
        this.toasts.set(id, toast);
        
        // 애니메이션을 위한 약간의 지연
        requestAnimationFrame(() => {
            toast.classList.add('toast-show');
        });
        
        // 자동 제거
        if (duration > 0) {
            setTimeout(() => this.remove(id), duration);
        }
        
        return id;
    }
    
    /**
     * Toast 제거
     * @param {string} id - Toast ID
     */
    static remove(id) {
        const toast = this.toasts.get(id);
        if (toast) {
            toast.classList.add('toast-hide');
            
            // 애니메이션 완료 후 DOM에서 제거
            toast.addEventListener('animationend', () => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                this.toasts.delete(id);
            });
        }
    }
    
    /**
     * 모든 Toast 제거
     */
    static clear() {
        this.toasts.forEach((toast, id) => {
            this.remove(id);
        });
    }
    
    /**
     * 타입별 아이콘 반환
     * @param {string} type - Toast 타입
     * @returns {string} - 아이콘 HTML
     */
    static getIcon(type) {
        const icons = {
            success: '<i class="fas fa-check-circle"></i>',
            error: '<i class="fas fa-exclamation-circle"></i>',
            warning: '<i class="fas fa-exclamation-triangle"></i>',
            info: '<i class="fas fa-info-circle"></i>'
        };
        return icons[type] || icons.info;
    }
    
    /**
     * HTML 이스케이프
     * @param {string} text - 이스케이프할 텍스트
     * @returns {string} - 이스케이프된 텍스트
     */
    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Toast 스타일 주입
     */
    static injectStyles() {
        if (document.getElementById('toast-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            .toast-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                pointer-events: none;
            }
            
            .toast {
                background: var(--bg-secondary, #1a1a1a);
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                margin-bottom: 12px;
                overflow: hidden;
                pointer-events: all;
                min-width: 300px;
                max-width: 500px;
                opacity: 0;
                transform: translateX(100%);
            }
            
            .toast-show {
                animation: slideIn 0.3s ease forwards;
            }
            
            .toast-hide {
                animation: slideOut 0.3s ease forwards;
            }
            
            .toast-content {
                display: flex;
                align-items: center;
                padding: 16px;
                gap: 12px;
            }
            
            .toast-icon {
                font-size: 1.25rem;
                flex-shrink: 0;
            }
            
            .toast-message {
                flex: 1;
                font-size: 0.875rem;
                line-height: 1.5;
                color: var(--text-primary, #ffffff);
            }
            
            .toast-close {
                background: none;
                border: none;
                color: var(--text-secondary, #999999);
                cursor: pointer;
                padding: 4px;
                font-size: 1rem;
                opacity: 0.6;
                transition: opacity 0.2s;
            }
            
            .toast-close:hover {
                opacity: 1;
            }
            
            .toast-progress {
                height: 3px;
                background: rgba(255, 255, 255, 0.1);
                position: relative;
                overflow: hidden;
            }
            
            .toast-progress-bar {
                height: 100%;
                background: currentColor;
                animation: progress linear forwards;
            }
            
            /* Toast 타입별 색상 */
            .toast-success {
                border-left: 4px solid #4caf50;
            }
            
            .toast-success .toast-icon {
                color: #4caf50;
            }
            
            .toast-success .toast-progress-bar {
                background: #4caf50;
            }
            
            .toast-error {
                border-left: 4px solid #f44336;
            }
            
            .toast-error .toast-icon {
                color: #f44336;
            }
            
            .toast-error .toast-progress-bar {
                background: #f44336;
            }
            
            .toast-warning {
                border-left: 4px solid #ff9800;
            }
            
            .toast-warning .toast-icon {
                color: #ff9800;
            }
            
            .toast-warning .toast-progress-bar {
                background: #ff9800;
            }
            
            .toast-info {
                border-left: 4px solid #2196f3;
            }
            
            .toast-info .toast-icon {
                color: #2196f3;
            }
            
            .toast-info .toast-progress-bar {
                background: #2196f3;
            }
            
            /* 애니메이션 */
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
            
            @keyframes progress {
                from {
                    width: 100%;
                }
                to {
                    width: 0%;
                }
            }
            
            /* 반응형 */
            @media (max-width: 640px) {
                .toast-container {
                    left: 20px;
                    right: 20px;
                }
                
                .toast {
                    min-width: auto;
                    max-width: none;
                }
            }
        `;
        
        document.head.appendChild(style);
    }
}

// 전역 헬퍼 함수
window.toast = {
    success: (message, duration) => Toast.show(message, 'success', duration),
    error: (message, duration) => Toast.show(message, 'error', duration),
    warning: (message, duration) => Toast.show(message, 'warning', duration),
    info: (message, duration) => Toast.show(message, 'info', duration),
    clear: () => Toast.clear()
};
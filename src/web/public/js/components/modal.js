/**
 * Modal 컴포넌트
 * 재사용 가능한 모달 대화상자
 */
export class Modal {
    constructor(options = {}) {
        this.options = {
            title: '',
            content: '',
            size: 'medium', // small, medium, large, fullscreen
            closable: true,
            closeOnBackdrop: true,
            closeOnEscape: true,
            buttons: [],
            className: '',
            onShow: null,
            onHide: null,
            ...options
        };
        
        this.element = null;
        this.isVisible = false;
        this.init();
    }
    
    /**
     * Modal 초기화
     */
    init() {
        this.createElement();
        this.attachEvents();
        Modal.injectStyles();
    }
    
    /**
     * Modal 엘리먼트 생성
     */
    createElement() {
        // Modal 컨테이너
        this.element = document.createElement('div');
        this.element.className = `modal ${this.options.className}`;
        this.element.setAttribute('role', 'dialog');
        this.element.setAttribute('aria-modal', 'true');
        this.element.setAttribute('aria-labelledby', 'modal-title');
        
        // Modal 내용
        const modalContent = `
            <div class="modal-backdrop"></div>
            <div class="modal-dialog modal-${this.options.size}">
                <div class="modal-content">
                    ${this.options.closable ? `
                        <button class="modal-close" aria-label="닫기">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : ''}
                    ${this.options.title ? `
                        <div class="modal-header">
                            <h3 class="modal-title" id="modal-title">${this.escapeHtml(this.options.title)}</h3>
                        </div>
                    ` : ''}
                    <div class="modal-body">
                        ${this.options.content}
                    </div>
                    ${this.options.buttons.length > 0 ? `
                        <div class="modal-footer">
                            ${this.createButtons()}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        this.element.innerHTML = modalContent;
        document.body.appendChild(this.element);
    }
    
    /**
     * 버튼 생성
     */
    createButtons() {
        return this.options.buttons.map((button, index) => {
            const type = button.type || 'secondary';
            const disabled = button.disabled ? 'disabled' : '';
            const dataAction = button.action ? `data-action="${button.action}"` : '';
            
            return `
                <button 
                    class="btn btn-${type} modal-button" 
                    ${disabled} 
                    ${dataAction}
                    data-index="${index}"
                >
                    ${button.icon ? `<i class="${button.icon}"></i>` : ''}
                    ${this.escapeHtml(button.text)}
                </button>
            `;
        }).join('');
    }
    
    /**
     * 이벤트 리스너 연결
     */
    attachEvents() {
        // 닫기 버튼
        const closeBtn = this.element.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }
        
        // 배경 클릭
        if (this.options.closeOnBackdrop) {
            const backdrop = this.element.querySelector('.modal-backdrop');
            backdrop.addEventListener('click', () => this.hide());
        }
        
        // ESC 키
        if (this.options.closeOnEscape) {
            this.escapeHandler = (e) => {
                if (e.key === 'Escape' && this.isVisible) {
                    this.hide();
                }
            };
        }
        
        // 버튼 클릭
        this.element.querySelectorAll('.modal-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                const buttonConfig = this.options.buttons[index];
                
                if (buttonConfig.onClick) {
                    buttonConfig.onClick(this, e);
                }
                
                if (buttonConfig.closeModal !== false) {
                    this.hide();
                }
            });
        });
    }
    
    /**
     * Modal 표시
     */
    show() {
        if (this.isVisible) return;
        
        this.isVisible = true;
        this.element.style.display = 'block';
        
        // 애니메이션을 위한 지연
        requestAnimationFrame(() => {
            this.element.classList.add('modal-show');
        });
        
        // ESC 키 이벤트 등록
        if (this.escapeHandler) {
            document.addEventListener('keydown', this.escapeHandler);
        }
        
        // body 스크롤 방지
        document.body.style.overflow = 'hidden';
        
        // 포커스 설정
        const focusable = this.element.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable) focusable.focus();
        
        // 콜백 실행
        if (this.options.onShow) {
            this.options.onShow(this);
        }
    }
    
    /**
     * Modal 숨기기
     */
    hide() {
        if (!this.isVisible) return;
        
        this.isVisible = false;
        this.element.classList.remove('modal-show');
        
        // 애니메이션 완료 후 숨김
        setTimeout(() => {
            this.element.style.display = 'none';
        }, 300);
        
        // ESC 키 이벤트 제거
        if (this.escapeHandler) {
            document.removeEventListener('keydown', this.escapeHandler);
        }
        
        // body 스크롤 복원
        document.body.style.overflow = '';
        
        // 콜백 실행
        if (this.options.onHide) {
            this.options.onHide(this);
        }
    }
    
    /**
     * Modal 토글
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
    
    /**
     * Modal 제거
     */
    destroy() {
        this.hide();
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
    
    /**
     * 내용 업데이트
     */
    setContent(content) {
        const body = this.element.querySelector('.modal-body');
        if (body) {
            body.innerHTML = content;
        }
    }
    
    /**
     * 제목 업데이트
     */
    setTitle(title) {
        const titleElement = this.element.querySelector('.modal-title');
        if (titleElement) {
            titleElement.textContent = title;
        }
    }
    
    /**
     * HTML 이스케이프
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Modal 스타일 주입
     */
    static injectStyles() {
        if (document.getElementById('modal-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'modal-styles';
        style.textContent = `
            .modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 10000;
            }
            
            .modal-backdrop {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            
            .modal-show .modal-backdrop {
                opacity: 1;
            }
            
            .modal-dialog {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.9);
                max-height: 90vh;
                opacity: 0;
                transition: all 0.3s ease;
            }
            
            .modal-show .modal-dialog {
                transform: translate(-50%, -50%) scale(1);
                opacity: 1;
            }
            
            .modal-content {
                background: var(--bg-secondary, #1a1a1a);
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                overflow: hidden;
                display: flex;
                flex-direction: column;
                max-height: 90vh;
            }
            
            .modal-close {
                position: absolute;
                top: 16px;
                right: 16px;
                background: none;
                border: none;
                color: var(--text-secondary, #999999);
                font-size: 1.5rem;
                cursor: pointer;
                padding: 8px;
                z-index: 1;
                opacity: 0.6;
                transition: opacity 0.2s;
            }
            
            .modal-close:hover {
                opacity: 1;
            }
            
            .modal-header {
                padding: 24px 24px 16px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .modal-title {
                margin: 0;
                font-size: 1.5rem;
                font-weight: 600;
                color: var(--text-primary, #ffffff);
            }
            
            .modal-body {
                padding: 24px;
                overflow-y: auto;
                flex: 1;
                color: var(--text-primary, #ffffff);
            }
            
            .modal-footer {
                padding: 16px 24px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                justify-content: flex-end;
                gap: 12px;
            }
            
            /* Modal 크기 */
            .modal-small {
                width: 400px;
            }
            
            .modal-medium {
                width: 600px;
            }
            
            .modal-large {
                width: 800px;
            }
            
            .modal-fullscreen {
                width: calc(100% - 40px);
                height: calc(100% - 40px);
                max-height: none;
            }
            
            .modal-fullscreen .modal-content {
                height: 100%;
            }
            
            /* 반응형 */
            @media (max-width: 768px) {
                .modal-dialog {
                    width: calc(100% - 32px) !important;
                    max-width: none;
                }
                
                .modal-content {
                    max-height: calc(100vh - 32px);
                }
            }
        `;
        
        document.head.appendChild(style);
    }
}

// 전역 헬퍼 함수
window.modal = {
    /**
     * 확인 모달
     */
    confirm: (options) => {
        return new Promise((resolve) => {
            const modal = new Modal({
                title: options.title || '확인',
                content: options.content || '계속 진행하시겠습니까?',
                size: 'small',
                buttons: [
                    {
                        text: options.cancelText || '취소',
                        type: 'secondary',
                        onClick: () => resolve(false)
                    },
                    {
                        text: options.confirmText || '확인',
                        type: 'primary',
                        onClick: () => resolve(true)
                    }
                ],
                onHide: () => {
                    setTimeout(() => modal.destroy(), 300);
                }
            });
            modal.show();
        });
    },
    
    /**
     * 알림 모달
     */
    alert: (options) => {
        const modal = new Modal({
            title: options.title || '알림',
            content: options.content || '',
            size: 'small',
            buttons: [
                {
                    text: options.buttonText || '확인',
                    type: 'primary'
                }
            ],
            onHide: () => {
                setTimeout(() => modal.destroy(), 300);
            }
        });
        modal.show();
        return modal;
    }
};
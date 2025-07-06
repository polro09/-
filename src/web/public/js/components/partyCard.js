// src/web/public/js/components/partyCard.js
// 파티 카드 컴포넌트
class PartyCard {
    constructor() {
        this.typeEmojis = {
            '정규전': '⚔️',
            '모의전': '🛡️',
            '훈련': '🎯',
            'PVP': '🏆',
            '검은발톱': '🦅',
            '레이드': '🏜️'
        };
        
        this.statusColors = {
            'recruiting': 'success',
            'in_progress': 'warning',
            'completed': 'secondary',
            'cancelled': 'danger'
        };
        
        this.statusTexts = {
            'recruiting': '모집 중',
            'in_progress': '진행 중',
            'completed': '완료됨',
            'cancelled': '취소됨'
        };
    }
    
    // 파티 카드 HTML 생성
    create(party) {
        const scheduledDate = new Date(party.scheduledDate);
        const formattedDate = scheduledDate.toLocaleDateString('ko-KR', {
            month: 'short',
            day: 'numeric',
            weekday: 'short'
        });
        
        return `
            <div class="party-card" data-party-id="${party.partyId}">
                <div class="party-header">
                    <div class="party-type">
                        <span class="party-emoji">${this.typeEmojis[party.type] || '🎮'}</span>
                        <span class="party-type-name">${party.type}</span>
                    </div>
                    <span class="party-status status-${this.statusColors[party.status]}">
                        ${this.statusTexts[party.status]}
                    </span>
                </div>
                
                <div class="party-body">
                    <h3 class="party-title">${this.escapeHtml(party.title)}</h3>
                    ${party.description ? `<p class="party-description">${this.escapeHtml(party.description)}</p>` : ''}
                    
                    <div class="party-info">
                        <div class="info-item">
                            <i class="fas fa-user"></i>
                            <span>${this.escapeHtml(party.hostName)}</span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-calendar"></i>
                            <span>${formattedDate} ${party.scheduledTime}</span>
                        </div>
                    </div>
                    
                    <div class="party-teams">
                        <div class="team-info">
                            <span class="team-label">1팀</span>
                            <span class="team-count">${party.team1.length}/${party.maxTeamSize}</span>
                        </div>
                        <div class="team-info">
                            <span class="team-label">2팀</span>
                            <span class="team-count">${party.team2.length}/${party.maxTeamSize}</span>
                        </div>
                        ${party.waitlist.length > 0 ? `
                            <div class="team-info">
                                <span class="team-label">대기</span>
                                <span class="team-count">${party.waitlist.length}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <div class="party-footer">
                    <button class="btn btn-outline" onclick="window.partyManager.viewDetail('${party.partyId}')">
                        <i class="fas fa-eye"></i>
                        상세보기
                    </button>
                    ${party.status === 'recruiting' ? `
                        <a href="/party/${party.partyId}" class="btn btn-primary">
                            <i class="fas fa-plus"></i>
                            참여하기
                        </a>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    // HTML 이스케이프
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// src/web/public/js/components/partyManager.js
// 파티 관리 매니저 클래스
class PartyManager {
    constructor() {
        this.partyCard = new PartyCard();
        this.statsCard = window.statsCard || null;
        this.currentFilter = 'recruiting';
        this.parties = [];
        this.stats = {};
    }
    
    // 초기화
    async initialize() {
        try {
            await Promise.all([
                this.loadStats(),
                this.loadParties()
            ]);
            
            this.setupEventListeners();
            
            // 주기적 업데이트
            setInterval(() => this.loadParties(), 30000);
            
        } catch (error) {
            console.error('파티 매니저 초기화 오류:', error);
            window.toast?.error('파티 시스템을 초기화하는 중 오류가 발생했습니다.');
        }
    }
    
    // 파티 통계 로드
    async loadStats() {
        try {
            const response = await fetch('/party/api/stats');
            if (!response.ok) throw new Error('통계를 불러올 수 없습니다.');
            
            const stats = await response.json();
            this.stats = stats;
            this.renderStats(stats);
            
        } catch (error) {
            console.error('파티 통계 로드 오류:', error);
        }
    }
    
    // 파티 목록 로드
    async loadParties() {
        const loadingEl = document.getElementById('loading');
        const gridEl = document.getElementById('partyGrid');
        const emptyEl = document.getElementById('emptyState');
        
        try {
            if (loadingEl) loadingEl.style.display = 'block';
            
            const response = await fetch(`/party/api/list?status=${this.currentFilter}`);
            if (!response.ok) throw new Error('파티 목록을 불러올 수 없습니다.');
            
            const parties = await response.json();
            this.parties = parties;
            
            if (loadingEl) loadingEl.style.display = 'none';
            
            if (parties.length === 0) {
                if (gridEl) gridEl.style.display = 'none';
                if (emptyEl) emptyEl.style.display = 'block';
            } else {
                if (emptyEl) emptyEl.style.display = 'none';
                if (gridEl) gridEl.style.display = 'grid';
                this.renderParties(parties);
            }
            
        } catch (error) {
            console.error('파티 목록 로드 오류:', error);
            if (loadingEl) loadingEl.style.display = 'none';
            window.toast?.error('파티 목록을 불러오는 중 오류가 발생했습니다.');
        }
    }
    
    // 통계 렌더링
    renderStats(stats) {
        const container = document.getElementById('partyStats');
        if (!container) return;
        
        const statsData = [
            { icon: 'fas fa-bullhorn', value: stats.recruiting || 0, label: '모집 중', color: '#3BA55C' },
            { icon: 'fas fa-play', value: stats.inProgress || 0, label: '진행 중', color: '#FAA61A' },
            { icon: 'fas fa-check', value: stats.completed || 0, label: '완료', color: '#747F8D' },
            { icon: 'fas fa-users', value: stats.totalParticipants || 0, label: '총 참여자', color: '#5865F2' }
        ];
        
        if (this.statsCard) {
            container.innerHTML = statsData.map(stat => 
                this.statsCard.create(stat.value, stat.label, stat.icon, stat.color)
            ).join('');
        } else {
            // 기본 통계 카드 HTML
            container.innerHTML = statsData.map(stat => `
                <div class="stat-card">
                    <div class="stat-icon" style="background-color: ${stat.color}">
                        <i class="${stat.icon}"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-value">${stat.value}</div>
                        <div class="stat-label">${stat.label}</div>
                    </div>
                </div>
            `).join('');
        }
    }
    
    // 파티 목록 렌더링
    renderParties(parties) {
        const container = document.getElementById('partyGrid');
        if (!container) return;
        
        const partiesHTML = parties.map(party => this.partyCard.create(party)).join('');
        container.innerHTML = partiesHTML;
    }
    
    // 필터 변경
    changeFilter(newFilter) {
        this.currentFilter = newFilter;
        
        // 필터 탭 UI 업데이트
        const tabs = document.querySelectorAll('.filter-tab');
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.status === newFilter);
        });
        
        // 파티 목록 새로고침
        this.loadParties();
    }
    
    // 파티 새로고침
    async refresh() {
        await Promise.all([
            this.loadStats(),
            this.loadParties()
        ]);
        window.toast?.success('파티 목록이 새로고침되었습니다.');
    }
    
    // 파티 상세보기
    async viewDetail(partyId) {
        try {
            const response = await fetch(`/party/api/${partyId}`);
            if (!response.ok) throw new Error('파티 정보를 불러올 수 없습니다.');
            
            const party = await response.json();
            
            // 모달로 표시하거나 페이지로 이동
            if (window.partyDetailModal) {
                window.partyDetailModal.show(party);
            } else {
                window.location.href = `/party/${partyId}`;
            }
            
        } catch (error) {
            console.error('파티 상세 정보 로드 오류:', error);
            window.toast?.error('파티 정보를 불러오는 중 오류가 발생했습니다.');
        }
    }
    
    // 이벤트 리스너 설정
    setupEventListeners() {
        // 필터 탭 이벤트
        const filterTabs = document.querySelectorAll('.filter-tab');
        filterTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.changeFilter(tab.dataset.status);
            });
        });
        
        // 새로고침 버튼
        const refreshBtn = document.querySelector('[onclick="refreshParties()"]');
        if (refreshBtn) {
            refreshBtn.onclick = () => this.refresh();
        }
    }
}

// src/web/public/js/components/partyDetailModal.js
// 파티 상세 모달 클래스
class PartyDetailModal {
    constructor() {
        this.modal = null;
        this.partyCard = new PartyCard();
        this.isInitialized = false;
    }
    
    // 모달 초기화
    initialize() {
        if (this.isInitialized) return;
        
        this.createModal();
        this.setupEventListeners();
        this.isInitialized = true;
    }
    
    // 모달 HTML 생성
    createModal() {
        const modalHTML = `
            <div class="modal" id="partyDetailModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">파티 상세 정보</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body" id="partyDetailContent">
                        <!-- 파티 상세 내용이 여기에 로드됩니다 -->
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('partyDetailModal');
    }
    
    // 파티 상세 정보 표시
    show(party) {
        if (!this.isInitialized) this.initialize();
        
        const content = document.getElementById('partyDetailContent');
        content.innerHTML = this.createDetailContent(party);
        
        this.modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
    
    // 모달 닫기
    hide() {
        if (this.modal) {
            this.modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }
    
    // 상세 내용 HTML 생성
    createDetailContent(party) {
        const typeEmojis = this.partyCard.typeEmojis;
        
        return `
            <div class="party-detail">
                <div class="party-detail-header">
                    <h2>${typeEmojis[party.type]} ${this.escapeHtml(party.title)}</h2>
                    <p class="party-type-badge">${party.type}</p>
                </div>
                
                ${party.description ? `
                    <div class="party-detail-section">
                        <h3>📝 설명</h3>
                        <p>${this.escapeHtml(party.description)}</p>
                    </div>
                ` : ''}
                
                <div class="party-detail-section">
                    <h3>📅 일정</h3>
                    <p>${new Date(party.scheduledDate).toLocaleDateString('ko-KR')} ${party.scheduledTime}</p>
                </div>
                
                <div class="party-detail-section">
                    <h3>👥 팀 구성</h3>
                    <div class="team-composition">
                        <div class="team-box">
                            <h4>🔵 1팀 (${party.team1.length}/${party.maxTeamSize})</h4>
                            <ul class="participant-list">
                                ${party.team1.map(p => `<li>${this.escapeHtml(p.username)}</li>`).join('')}
                            </ul>
                        </div>
                        <div class="team-box">
                            <h4>🔴 2팀 (${party.team2.length}/${party.maxTeamSize})</h4>
                            <ul class="participant-list">
                                ${party.team2.map(p => `<li>${this.escapeHtml(p.username)}</li>`).join('')}
                            </ul>
                        </div>
                        ${party.waitlist.length > 0 ? `
                            <div class="team-box">
                                <h4>⏳ 대기자 (${party.waitlist.length})</h4>
                                <ul class="participant-list">
                                    ${party.waitlist.map(p => `<li>${this.escapeHtml(p.username)}</li>`).join('')}
                                </ul>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                ${party.preparations ? `
                    <div class="party-detail-section">
                        <h3>📌 준비물</h3>
                        <p>${this.escapeHtml(party.preparations)}</p>
                    </div>
                ` : ''}
                
                <div class="party-detail-actions">
                    <button class="btn btn-secondary" onclick="window.partyDetailModal.hide()">닫기</button>
                    ${party.status === 'recruiting' ? `
                        <a href="/party/${party.partyId}" class="btn btn-primary">
                            <i class="fas fa-plus"></i>
                            참여하기
                        </a>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    // 이벤트 리스너 설정
    setupEventListeners() {
        // 닫기 버튼
        this.modal.querySelector('.modal-close').addEventListener('click', () => this.hide());
        
        // 모달 외부 클릭
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.hide();
        });
        
        // ESC 키
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'block') {
                this.hide();
            }
        });
    }
    
    // HTML 이스케이프
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// src/web/public/js/components/partyFormValidator.js
// 파티 폼 유효성 검사 클래스
class PartyFormValidator {
    constructor() {
        this.rules = {
            type: { required: true, message: '파티 타입을 선택해주세요.' },
            title: { required: true, minLength: 2, maxLength: 50, message: '파티 제목을 2-50자로 입력해주세요.' },
            maxTeamSize: { required: true, message: '팀당 최대 인원을 선택해주세요.' },
            scheduledDate: { required: true, futureDate: true, message: '내일 이후의 날짜를 선택해주세요.' },
            scheduledTime: { required: true, message: '시간을 선택해주세요.' }
        };
    }
    
    // 폼 데이터 검증
    validate(formData) {
        const errors = [];
        
        for (const [field, rule] of Object.entries(this.rules)) {
            const value = formData[field];
            
            // 필수 필드 검사
            if (rule.required && (!value || value.toString().trim() === '')) {
                errors.push(rule.message);
                continue;
            }
            
            // 길이 검사
            if (value && rule.minLength && value.length < rule.minLength) {
                errors.push(rule.message);
            }
            
            if (value && rule.maxLength && value.length > rule.maxLength) {
                errors.push(rule.message);
            }
            
            // 미래 날짜 검사
            if (value && rule.futureDate) {
                const selectedDate = new Date(value);
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(0, 0, 0, 0);
                
                if (selectedDate < tomorrow) {
                    errors.push(rule.message);
                }
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }
    
    // 실시간 필드 검증
    validateField(fieldName, value) {
        const rule = this.rules[fieldName];
        if (!rule) return { isValid: true };
        
        const tempData = { [fieldName]: value };
        return this.validate(tempData);
    }
    
    // 폼에 검증 이벤트 리스너 추가
    attachToForm(formElement) {
        const inputs = formElement.querySelectorAll('input, select, textarea');
        
        inputs.forEach(input => {
            input.addEventListener('blur', () => {
                const result = this.validateField(input.name, input.value);
                this.showFieldValidation(input, result);
            });
        });
    }
    
    // 필드 검증 결과 표시
    showFieldValidation(input, result) {
        const errorElement = input.parentNode.querySelector('.field-error');
        
        if (result.isValid) {
            input.classList.remove('error');
            if (errorElement) errorElement.remove();
        } else {
            input.classList.add('error');
            
            if (!errorElement) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'field-error';
                errorDiv.textContent = result.errors[0];
                input.parentNode.appendChild(errorDiv);
            }
        }
    }
}

// 전역 인스턴스 생성
window.PartyCard = PartyCard;
window.PartyManager = PartyManager;
window.PartyDetailModal = PartyDetailModal;
window.PartyFormValidator = PartyFormValidator;

// 자동 초기화 (파티 페이지에서)
document.addEventListener('DOMContentLoaded', function() {
    // 파티 목록 페이지
    if (document.getElementById('partyGrid')) {
        window.partyManager = new PartyManager();
        window.partyManager.initialize();
        
        // 상세 모달 초기화
        window.partyDetailModal = new PartyDetailModal();
    }
    
    // 파티 생성 페이지
    if (document.getElementById('partyForm')) {
        window.partyFormValidator = new PartyFormValidator();
        const form = document.getElementById('partyForm');
        window.partyFormValidator.attachToForm(form);
    }
});
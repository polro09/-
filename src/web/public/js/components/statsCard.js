/**
 * 통계 카드 컴포넌트
 * 다양한 통계 정보를 카드 형태로 표시
 */
export class StatsCard {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? 
            document.querySelector(container) : container;
        
        this.options = {
            title: '통계',
            icon: 'fas fa-chart-bar',
            value: 0,
            suffix: '',
            prefix: '',
            description: '',
            trend: null, // { value: 10, direction: 'up' }
            animated: true,
            decimals: 0,
            updateInterval: 0, // 0 = 자동 업데이트 안함
            fetchUrl: null,
            ...options
        };
        
        this.currentValue = 0;
        this.targetValue = this.options.value;
        this.updateTimer = null;
        
        this.init();
    }
    
    /**
     * 컴포넌트 초기화
     */
    init() {
        if (!this.container) {
            console.error('StatsCard: 컨테이너를 찾을 수 없습니다.');
            return;
        }
        
        this.render();
        
        if (this.options.animated) {
            this.animateValue();
        }
        
        if (this.options.updateInterval > 0 && this.options.fetchUrl) {
            this.startAutoUpdate();
        }
    }
    
    /**
     * 카드 렌더링
     */
    render() {
        const trendHTML = this.options.trend ? `
            <div class="stats-trend ${this.options.trend.direction}">
                <i class="fas fa-arrow-${this.options.trend.direction}"></i>
                <span>${Math.abs(this.options.trend.value)}%</span>
            </div>
        ` : '';
        
        const cardHTML = `
            <div class="stats-card ${this.options.className || ''}">
                <div class="stats-card-header">
                    <div class="stats-icon">
                        <i class="${this.options.icon}"></i>
                    </div>
                    ${trendHTML}
                </div>
                <div class="stats-card-body">
                    <h3 class="stats-title">${this.options.title}</h3>
                    <div class="stats-value">
                        ${this.options.prefix}
                        <span class="stats-number" data-value="${this.targetValue}">
                            ${this.options.animated ? '0' : this.formatNumber(this.targetValue)}
                        </span>
                        ${this.options.suffix}
                    </div>
                    ${this.options.description ? `
                        <p class="stats-description">${this.options.description}</p>
                    ` : ''}
                </div>
            </div>
        `;
        
        this.container.innerHTML = cardHTML;
        this.numberElement = this.container.querySelector('.stats-number');
    }
    
    /**
     * 값 애니메이션
     */
    animateValue() {
        const duration = 2000;
        const steps = 60;
        const stepDuration = duration / steps;
        const increment = (this.targetValue - this.currentValue) / steps;
        
        let step = 0;
        
        const animate = () => {
            step++;
            this.currentValue += increment;
            
            if (step < steps) {
                this.numberElement.textContent = this.formatNumber(
                    Math.round(this.currentValue * Math.pow(10, this.options.decimals)) / 
                    Math.pow(10, this.options.decimals)
                );
                requestAnimationFrame(animate);
            } else {
                this.currentValue = this.targetValue;
                this.numberElement.textContent = this.formatNumber(this.targetValue);
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    /**
     * 값 업데이트
     */
    updateValue(newValue, trend = null) {
        this.currentValue = this.targetValue;
        this.targetValue = newValue;
        
        if (trend) {
            this.options.trend = trend;
            this.render();
        } else if (this.options.animated) {
            this.animateValue();
        } else {
            this.numberElement.textContent = this.formatNumber(newValue);
        }
    }
    
    /**
     * 자동 업데이트 시작
     */
    startAutoUpdate() {
        this.fetchData();
        
        this.updateTimer = setInterval(() => {
            this.fetchData();
        }, this.options.updateInterval);
    }
    
    /**
     * 자동 업데이트 중지
     */
    stopAutoUpdate() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }
    
    /**
     * 데이터 가져오기
     */
    async fetchData() {
        try {
            const response = await fetch(this.options.fetchUrl);
            const data = await response.json();
            
            if (data.value !== undefined) {
                this.updateValue(data.value, data.trend);
            }
        } catch (error) {
            console.error('StatsCard: 데이터 가져오기 오류:', error);
        }
    }
    
    /**
     * 숫자 포맷팅
     */
    formatNumber(value) {
        // 큰 숫자 축약
        if (value >= 1000000) {
            return (value / 1000000).toFixed(1) + 'M';
        } else if (value >= 1000) {
            return (value / 1000).toFixed(1) + 'K';
        }
        
        // 소수점 처리
        if (this.options.decimals > 0) {
            return value.toFixed(this.options.decimals);
        }
        
        return Math.round(value).toLocaleString();
    }
    
    /**
     * 컴포넌트 제거
     */
    destroy() {
        this.stopAutoUpdate();
        this.container.innerHTML = '';
    }
}

/**
 * 통계 카드 그룹 관리
 */
export class StatsCardGroup {
    constructor(container, cards = []) {
        this.container = typeof container === 'string' ? 
            document.querySelector(container) : container;
        this.cards = [];
        
        if (this.container) {
            this.render(cards);
        }
    }
    
    /**
     * 카드 그룹 렌더링
     */
    render(cardsConfig) {
        this.container.innerHTML = '<div class="stats-grid"></div>';
        const grid = this.container.querySelector('.stats-grid');
        
        cardsConfig.forEach(config => {
            const cardContainer = document.createElement('div');
            grid.appendChild(cardContainer);
            
            const card = new StatsCard(cardContainer, config);
            this.cards.push(card);
        });
    }
    
    /**
     * 모든 카드 업데이트
     */
    updateAll(data) {
        data.forEach((item, index) => {
            if (this.cards[index]) {
                this.cards[index].updateValue(item.value, item.trend);
            }
        });
    }
    
    /**
     * 특정 카드 업데이트
     */
    updateCard(index, value, trend = null) {
        if (this.cards[index]) {
            this.cards[index].updateValue(value, trend);
        }
    }
    
    /**
     * 모든 카드 제거
     */
    destroy() {
        this.cards.forEach(card => card.destroy());
        this.cards = [];
        this.container.innerHTML = '';
    }
}

// 스타일 주입
const style = document.createElement('style');
style.textContent = `
    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
    }
    
    .stats-card {
        background: var(--bg-secondary);
        border-radius: 12px;
        padding: 24px;
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
    }
    
    .stats-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    }
    
    .stats-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 16px;
    }
    
    .stats-icon {
        width: 48px;
        height: 48px;
        background: var(--accent-primary);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        color: white;
    }
    
    .stats-trend {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.85rem;
        font-weight: 500;
        padding: 4px 8px;
        border-radius: 20px;
    }
    
    .stats-trend.up {
        color: var(--success);
        background: rgba(59, 165, 92, 0.1);
    }
    
    .stats-trend.down {
        color: var(--danger);
        background: rgba(237, 66, 69, 0.1);
    }
    
    .stats-card-body {
        position: relative;
    }
    
    .stats-title {
        font-size: 0.9rem;
        color: var(--text-secondary);
        margin: 0 0 8px 0;
        font-weight: 500;
    }
    
    .stats-value {
        font-size: 2rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
        display: flex;
        align-items: baseline;
        gap: 4px;
    }
    
    .stats-number {
        font-variant-numeric: tabular-nums;
    }
    
    .stats-description {
        font-size: 0.85rem;
        color: var(--text-muted);
        margin: 8px 0 0 0;
    }
    
    /* 특별한 카드 스타일 */
    .stats-card.primary {
        background: var(--accent-primary);
        color: white;
    }
    
    .stats-card.primary .stats-icon {
        background: rgba(255, 255, 255, 0.2);
    }
    
    .stats-card.primary .stats-title,
    .stats-card.primary .stats-description {
        color: rgba(255, 255, 255, 0.9);
    }
    
    .stats-card.primary .stats-value {
        color: white;
    }
    
    /* 애니메이션 */
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .stats-card {
        animation: fadeIn 0.5s ease-out;
    }
`;
document.head.appendChild(style);
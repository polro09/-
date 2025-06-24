// src/utils/logger.js
const winston = require('winston');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');

// 로그 레벨별 스타일 정의
const levelStyles = {
    error: { color: 'red', emoji: '❌', label: 'ERROR' },
    warn: { color: 'yellow', emoji: '⚠️', label: 'WARN' },
    info: { color: 'cyan', emoji: 'ℹ️', label: 'INFO' },
    debug: { color: 'gray', emoji: '🐛', label: 'DEBUG' }
};

// 카테고리별 색상과 이모지 정의
const categoryEmojis = {
    database: { emoji: '🗄️', color: 'blue' },
    server: { emoji: '🌐', color: 'green' },
    bot: { emoji: '🤖', color: 'cyan' },
    command: { emoji: '⚡', color: 'yellow' },
    event: { emoji: '📡', color: 'magenta' },
    handler: { emoji: '🔧', color: 'gray' },
    auth: { emoji: '🔐', color: 'red' },
    api: { emoji: '🔌', color: 'blue' },
    startup: { emoji: '🚀', color: 'green' },
    party: { emoji: '🎮', color: 'magenta' },
    error: { emoji: '💀', color: 'red' },
    success: { emoji: '✅', color: 'green' },
    session: { emoji: '🍪', color: 'yellow' }
};

// 커스텀 포맷 정의
const customFormat = winston.format.printf(({ level, message, timestamp, category }) => {
    const style = levelStyles[level] || { color: 'white', emoji: '📝', label: level.toUpperCase() };
    
    // 카테고리 객체 체크 (category가 Error 객체인 경우 처리)
    const safeCategory = category && typeof category === 'string' ? category : null;
    const categoryInfo = safeCategory && categoryEmojis[safeCategory] ? 
        categoryEmojis[safeCategory] || { emoji: '📝', color: 'white' } : { emoji: '📝', color: 'white' };
    
    // 시간 포맷
    const time = new Date(timestamp).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    // 색상 적용
    const coloredTime = chalk.gray(`[${time}]`);
    const coloredLevel = chalk[style.color](`[${style.label}]`);
    const emoji = style.emoji;
    
    // 카테고리가 있으면 추가 (카테고리별 색상 적용)
    const categoryStr = safeCategory ? chalk[categoryInfo.color](`[${safeCategory.toUpperCase()}]`) : '';
    
    return `${coloredTime} ${emoji} ${coloredLevel} ${categoryInfo.emoji} ${categoryStr} ${message}`;
});

// Winston 로거 생성
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.splat()
    ),
    transports: [
        // 콘솔 출력 (개선된 포맷)
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.timestamp(),
                customFormat
            )
        }),
        // 파일 출력 (에러 로그)
        new winston.transports.File({
            filename: path.join(__dirname, '../../logs/error.log'),
            level: 'error',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        }),
        // 파일 출력 (전체 로그)
        new winston.transports.File({
            filename: path.join(__dirname, '../../logs/combined.log'),
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        })
    ]
});

// 로그 디렉토리 생성
const logDir = path.join(__dirname, '../../logs');

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// 카테고리별 로거 메서드 추가
class CategoryLogger {
    constructor(baseLogger) {
        this.logger = baseLogger;
    }
    
    // 데이터베이스 관련
    database(message, level = 'info') {
        this.logger.log({ level, message, category: 'database' });
    }
    
    // 서버/웹 관련
    server(message, level = 'info') {
        this.logger.log({ level, message, category: 'server' });
    }
    
    // 봇 관련
    bot(message, level = 'info') {
        this.logger.log({ level, message, category: 'bot' });
    }
    
    // 명령어 관련
    command(message, level = 'info') {
        this.logger.log({ level, message, category: 'command' });
    }
    
    // 이벤트 관련
    event(message, level = 'info') {
        this.logger.log({ level, message, category: 'event' });
    }
    
    // 핸들러 관련
    handler(message, level = 'info') {
        this.logger.log({ level, message, category: 'handler' });
    }
    
    // 인증 관련
    auth(message, level = 'info') {
        this.logger.log({ level, message, category: 'auth' });
    }
    
    // API 관련
    api(message, level = 'info') {
        this.logger.log({ level, message, category: 'api' });
    }
    
    // 시작 관련
    startup(message, level = 'info') {
        this.logger.log({ level, message, category: 'startup' });
    }
    
    // 파티 관련
    party(message, level = 'info') {
        this.logger.log({ level, message, category: 'party' });
    }
    
    // 성공 메시지 (커스텀 레벨)
    success(message, category = null) {
        this.logger.log({ level: 'info', message, category });
    }
}

// 카테고리 로거 인스턴스 생성
const categoryLogger = new CategoryLogger(logger);

// 기본 메서드들도 카테고리 로거에 추가
categoryLogger.info = (message, category = null) => {
    // category가 Error 객체인 경우 처리
    if (category instanceof Error) {
        logger.error({ message: `${message}: ${category.message}`, category: 'error' });
    } else {
        logger.info({ message, category });
    }
};
categoryLogger.error = (message, category = null) => {
    // category가 Error 객체인 경우 처리
    if (category instanceof Error) {
        logger.error({ message: `${message}: ${category.message}`, category: 'error' });
    } else {
        logger.error({ message, category });
    }
};
categoryLogger.warn = (message, category = null) => logger.warn({ message, category });
categoryLogger.debug = (message, category = null) => logger.debug({ message, category });

// 시작 메시지
console.log(chalk.cyan('╔════════════════════════════════════════╗'));
console.log(chalk.cyan('║') + chalk.white.bold('    Aimdot.dev Discord Bot Start  🚀    ') + chalk.cyan('║'));
console.log(chalk.cyan('╚════════════════════════════════════════╝'));

module.exports = categoryLogger;
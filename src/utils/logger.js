// src/utils/logger.js
const winston = require('winston');
const chalk = require('chalk');
const path = require('path');

// 로그 레벨별 이모지와 색상 정의
const levelStyles = {
    error: { emoji: '❌', color: 'red', label: 'ERROR' },
    warn: { emoji: '⚠️ ', color: 'yellow', label: 'WARN ' },
    info: { emoji: '📌', color: 'cyan', label: 'INFO ' },
    debug: { emoji: '🔍', color: 'green', label: 'DEBUG' },
    success: { emoji: '✅', color: 'green', label: 'OK   ' }
};

// 카테고리별 이모지와 색상
const categoryEmojis = {
    database: { emoji: '🗄️', color: 'blue' },
    server: { emoji: '🌐', color: 'green' },
    bot: { emoji: '🤖', color: 'cyan' },
    command: { emoji: '⚡', color: 'yellow' },
    event: { emoji: '📡', color: 'magenta' },
    handler: { emoji: '🔧', color: 'blue' },
    auth: { emoji: '🔐', color: 'red' },
    api: { emoji: '🔌', color: 'green' },
    error: { emoji: '💥', color: 'red' },
    startup: { emoji: '🚀', color: 'cyan' }
};

// 커스텀 포맷 생성
const customFormat = winston.format.printf(({ level, message, timestamp, category }) => {
    const style = levelStyles[level] || levelStyles.info;
    
    // category가 문자열이 아닌 경우 안전하게 처리
    let safeCategory = category;
    if (category && typeof category !== 'string') {
        // Error 객체인 경우
        if (category instanceof Error) {
            safeCategory = 'error';
        }
        // 기타 객체인 경우
        else if (typeof category === 'object') {
            safeCategory = 'unknown';
        }
        // 그 외의 경우
        else {
            safeCategory = String(category);
        }
    }
    
    const categoryInfo = safeCategory ? categoryEmojis[safeCategory] || { emoji: '📝', color: 'white' } : { emoji: '📝', color: 'white' };
    
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
const fs = require('fs');
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
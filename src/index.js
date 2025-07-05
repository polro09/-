// src/index.js - 메인 봇 파일
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { config } = require('./config/config');
const { connectDatabase } = require('./config/database');
const logger = require('./utils/logger');

// 봇 클라이언트 생성
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// 컬렉션 초기화
client.commands = new Collection();
client.buttons = new Collection();
client.menus = new Collection();

// 봇 초기화 함수
async function initializeBot() {
    try {
        // 데이터베이스 연결
        const dbConnected = await connectDatabase();
        
        if (dbConnected) {
            logger.database('데이터베이스 연결 성공', 'info');
            
            // 권한 시스템 초기화
            try {
                const Permission = require('./models/Permission');
                await Permission.initializeDefaults();
                logger.startup('권한 시스템 초기화 완료', 'info');
            } catch (error) {
                logger.warn('권한 시스템 초기화 실패', 'startup');
            }
        }

        // 핸들러 로드
        await require('./handlers/eventHandler')(client);
        await require('./handlers/commandHandler')(client);
        await require('./handlers/buttonHandler')(client);
        await require('./handlers/menuHandler')(client);
        
        logger.handler('모든 핸들러 로드 완료', 'info');

        // 웹 서버 시작 - WebServer 클래스 사용
        if (dbConnected) {
            // 기존 server.js 대신 WebServer 클래스 사용
            const WebServer = require('./web/webServer');
            const webServer = new WebServer(client);
            await webServer.start();
        } else {
            logger.server('데이터베이스 없이는 웹 대시보드를 사용할 수 없습니다.', 'warn');
        }
        
        // 봇 로그인
        await client.login(config.token);
        
    } catch (error) {
        logger.error(`봇 초기화 중 오류 발생: ${error.message}`, 'startup');
        console.error(error);
        process.exit(1);
    }
}

// 봇 시작
initializeBot();

// 프로세스 에러 핸들링
process.on('unhandledRejection', error => {
    logger.error(`처리되지 않은 프로미스 거부: ${error.message}`, 'error');
    console.error(error);
});

process.on('uncaughtException', error => {
    logger.error(`처리되지 않은 예외: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
});
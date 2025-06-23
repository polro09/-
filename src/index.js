// src/index.js - 메인 봇 파일
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { config } = require('./config/config');
const { connectDatabase } = require('./config/database');
const logger = require('./utils/logger');
const express = require('express');
const path = require('path');

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
        await connectDatabase();
        logger.info('데이터베이스 연결 성공');

        // 핸들러 로드
        await require('./handlers/eventHandler')(client);
        await require('./handlers/commandHandler')(client);
        await require('./handlers/buttonHandler')(client);
        await require('./handlers/menuHandler')(client);
        
        logger.info('모든 핸들러 로드 완료');

        // 웹 서버 시작
        await require('./web/server')(client);
        
        // 봇 로그인
        await client.login(config.token);
        
    } catch (error) {
        logger.error('봇 초기화 중 오류 발생:', error);
        process.exit(1);
    }
}

// 봇 시작
initializeBot();

// 프로세스 에러 핸들링
process.on('unhandledRejection', error => {
    logger.error('처리되지 않은 프로미스 거부:', error);
});

process.on('uncaughtException', error => {
    logger.error('처리되지 않은 예외:', error);
    process.exit(1);
});
// src/config/config.js
require('dotenv').config();

const config = {
    // Discord 봇 설정
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    
    // 웹 서버 설정
    port: process.env.PORT || 3000,
    sessionSecret: process.env.SESSION_SECRET || 'aimdot-secret-key',
    
    // OAuth2 설정
    redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000/auth/callback',
    
    // 데이터베이스 설정
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/aimdot',
    
    // 봇 설정
    defaultPrefix: '!',
    developers: ['257097077782216704'], // 개발자 Discord ID
    
    // 임베드 기본 설정
    embed: {
        color: 0x5865F2, // Discord 브랜드 색상
        thumbnail: 'https://i.imgur.com/Sd8qK9c.gif',
        image: 'https://i.imgur.com/Sd8qK9c.gif',
        footer: {
            text: 'Aimdot.dev',
            iconURL: 'https://i.imgur.com/Sd8qK9c.gif'
        },
        author: {
            name: 'Aimdot.dev',
            iconURL: 'https://i.imgur.com/Sd8qK9c.gif'
        }
    }
};

module.exports = { config };
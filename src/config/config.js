// src/config/config.js
require('dotenv').config();

const config = {
    // Discord 봇 설정
    token: process.env.DISCORD_TOKEN || process.env.TOKEN,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    
    // 웹 서버 설정
    web: {
        port: process.env.PORT || 3000,
        sessionSecret: process.env.SESSION_SECRET || 'aimdot-secret-key',
        domain: process.env.DOMAIN || 'https://aimdot.dev'
    },
    
    // 웹사이트 URL 통합 설정 (새로 추가)
    websiteUrl: process.env.WEBSITE_URL || process.env.WEB_URL || 'https://aimdot.dev',
    
    // 간단한 포트 접근 (기존 코드 호환성)
    port: process.env.PORT || 3000,
    sessionSecret: process.env.SESSION_SECRET || 'aimdot-secret-key',
    
    // OAuth2 설정 - 환경 변수 우선 사용
    redirectUri: process.env.REDIRECT_URI || 'https://aimdot.dev/auth/callback',
    
    // 데이터베이스 설정
    database: {
        uri: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/aimdot'
    },
    mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/aimdot',
    
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
    },
    
    // 웹사이트 URL 통합 설정
    websiteUrl: process.env.WEBSITE_URL || process.env.WEB_URL || 'https://aimdot.dev',
    
    // 환경 설정
    isDevelopment: process.env.NODE_ENV !== 'production',
    isProduction: process.env.NODE_ENV === 'production'
};

// 설정 검증
if (!config.token) {
    console.error('⚠️  봇 토큰이 설정되지 않았습니다. DISCORD_TOKEN 또는 TOKEN 환경 변수를 확인하세요.');
}

if (!config.clientId || !config.clientSecret) {
    console.error('⚠️  Discord OAuth 설정이 없습니다. CLIENT_ID와 CLIENT_SECRET을 확인하세요.');
}

// 로그 출력
console.log('📍 OAuth Redirect URI:', config.redirectUri);
console.log('🌐 Domain:', config.web.domain);
console.log('🌐 Website URL:', config.websiteUrl);
console.log('🚀 Environment:', process.env.NODE_ENV || 'development');

module.exports = { config };
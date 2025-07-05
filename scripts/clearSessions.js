// scripts/clearSessions.js
const mongoose = require('mongoose');
const { config } = require('../src/config/config');

async function clearSessions() {
    try {
        // MongoDB 연결
        await mongoose.connect(config.database.uri);
        console.log('MongoDB 연결 성공');
        
        // sessions 컬렉션 비우기
        const db = mongoose.connection.db;
        const sessionsCollection = db.collection('sessions');
        
        const result = await sessionsCollection.deleteMany({});
        console.log(`${result.deletedCount}개의 세션이 삭제되었습니다.`);
        
        // 연결 종료
        await mongoose.connection.close();
        console.log('작업 완료');
        
    } catch (error) {
        console.error('오류 발생:', error);
    }
    
    process.exit(0);
}

clearSessions();
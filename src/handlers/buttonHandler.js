// src/handlers/buttonHandler.js
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const Component = require('../models/Component');

module.exports = async (client) => {
    const buttonFiles = fs.readdirSync(path.join(__dirname, '../components/buttons'))
        .filter(file => file.endsWith('.js'));
    
    for (const file of buttonFiles) {
        const button = require(`../components/buttons/${file}`);
        client.buttons.set(button.customId, button);
        logger.handler(`버튼 핸들러 로드: ${button.customId}`);
    }
    
    // 영속적 컴포넌트 복원
    try {
        const persistentComponents = await Component.find({ type: 'button', active: true });
        
        for (const comp of persistentComponents) {
            // 동적으로 핸들러 생성
            const handler = {
                customId: comp.customId,
                execute: async (interaction) => {
                    // customId 파싱하여 적절한 핸들러 호출
                    const [prefix, type, action] = comp.customId.split('_');
                    
                    if (prefix === 'persistent' && type === 'button') {
                        const handler = client.buttons.get(`persistent_${action}`);
                        if (handler) {
                            await handler.execute(interaction, comp.data);
                        }
                    }
                }
            };
            
            client.buttons.set(comp.customId, handler);
        }
        
        logger.success(`${persistentComponents.length}개의 영속적 버튼 복원 완료`, 'handler');
    } catch (error) {
        logger.error(`영속적 버튼 복원 오류: ${error.message}`, 'handler');
    }
};
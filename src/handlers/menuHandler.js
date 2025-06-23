// src/handlers/menuHandler.js
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const Component = require('../models/Component');

module.exports = async (client) => {
    const menuFiles = fs.readdirSync(path.join(__dirname, '../components/menus'))
        .filter(file => file.endsWith('.js'));
    
    for (const file of menuFiles) {
        const menu = require(`../components/menus/${file}`);
        client.menus.set(menu.customId, menu);
        logger.info(`메뉴 핸들러 로드: ${menu.customId}`);
    }
    
    // 영속적 메뉴 복원
    try {
        const persistentMenus = await Component.find({ type: 'menu', active: true });
        
        for (const menu of persistentMenus) {
            const handler = {
                customId: menu.customId,
                execute: async (interaction) => {
                    const [prefix, type, action] = menu.customId.split('_');
                    
                    if (prefix === 'persistent' && type === 'menu') {
                        const handler = client.menus.get(`persistent_${action}`);
                        if (handler) {
                            await handler.execute(interaction, menu.data);
                        }
                    }
                }
            };
            
            client.menus.set(menu.customId, handler);
        }
        
        logger.info(`${persistentMenus.length}개의 영속적 메뉴 복원 완료`);
    } catch (error) {
        logger.error('영속적 메뉴 복원 오류:', error);
    }
};
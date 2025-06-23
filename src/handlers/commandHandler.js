// src/handlers/commandHandler.js
const { REST, Routes } = require('discord.js');
const { config } = require('../config/config');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

module.exports = async (client) => {
    const commands = [];
    const commandFolders = fs.readdirSync(path.join(__dirname, '../commands'));
    
    // 명령어 로드
    for (const folder of commandFolders) {
        const commandFiles = fs.readdirSync(path.join(__dirname, '../commands', folder))
            .filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const command = require(`../commands/${folder}/${file}`);
            
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                commands.push(command.data.toJSON());
                logger.info(`명령어 로드: ${command.data.name}`);
            } else {
                logger.warn(`잘못된 명령어 형식: ${file}`);
            }
        }
    }
    
    // 슬래시 명령어 등록
    const rest = new REST({ version: '10' }).setToken(config.token);
    
    try {
        logger.info('슬래시 명령어 등록 시작...');
        
        await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: commands }
        );
        
        logger.info(`${commands.length}개의 슬래시 명령어 등록 완료`);
    } catch (error) {
        logger.error('슬래시 명령어 등록 오류:', error);
    }
};
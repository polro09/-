// src/utils/embedBuilder.js
const { EmbedBuilder } = require('discord.js');
const { config } = require('../config/config');

class CustomEmbedBuilder {
    /**
     * 기본 임베드 생성
     * @param {Object} options - 임베드 옵션
     * @returns {EmbedBuilder}
     */
    static createBasicEmbed(options = {}) {
        const embed = new EmbedBuilder()
            .setColor(options.color || config.embed.color)
            .setTimestamp()
            .setFooter({
                text: config.embed.footer.text,
                iconURL: config.embed.footer.iconURL
            });
        
        // 기본 썸네일 설정
        if (!options.noThumbnail) {
            embed.setThumbnail(config.embed.thumbnail);
        }
        
        // 옵션 적용
        if (options.title) embed.setTitle(options.title);
        if (options.description) embed.setDescription(options.description);
        if (options.fields) embed.addFields(options.fields);
        if (options.image) embed.setImage(options.image);
        if (options.url) embed.setURL(options.url);
        
        return embed;
    }
    
    /**
     * 성공 임베드 생성
     * @param {string} message - 성공 메시지
     * @returns {EmbedBuilder}
     */
    static success(message) {
        return this.createBasicEmbed({
            color: 0x57F287, // 초록색
            title: '✅ 성공',
            description: message
        });
    }
    
    /**
     * 오류 임베드 생성
     * @param {string} message - 오류 메시지
     * @returns {EmbedBuilder}
     */
    static error(message) {
        return this.createBasicEmbed({
            color: 0xED4245, // 빨간색
            title: '❌ 오류',
            description: message
        });
    }
    
    /**
     * 경고 임베드 생성
     * @param {string} message - 경고 메시지
     * @returns {EmbedBuilder}
     */
    static warning(message) {
        return this.createBasicEmbed({
            color: 0xFEE75C, // 노란색
            title: '⚠️ 경고',
            description: message
        });
    }
    
    /**
     * 정보 임베드 생성
     * @param {string} title - 제목
     * @param {string} description - 설명
     * @returns {EmbedBuilder}
     */
    static info(title, description) {
        return this.createBasicEmbed({
            color: 0x5865F2, // Discord 브랜드 색상
            title: `ℹ️ ${title}`,
            description: description
        });
    }
}

module.exports = CustomEmbedBuilder;
const vertexAi = require('../../vertexAi');
const visibilityService = require('./VisibilityService');

class AiService {
    async isAiFeatureLocked(currentUser) {
        const settings = await visibilityService.getEffectiveSettings(currentUser);
        // If admin and admin bypass is enabled, not locked
        if (currentUser && currentUser.role === 'admin' && settings.adminBypassHidden !== false) {
            return false;
        }
        return Boolean(settings.lockAi);
    }

    async generateContent(payload) {
        const { prompt, systemInstruction, jsonMode, usePro, model, preferredModel } = payload;
        const targetModel = preferredModel || model || null;
        return await vertexAi.generateContent(prompt, systemInstruction, jsonMode, usePro, targetModel);
    }

    async processAudio(payload) {
        const { base64Audio, mimeType, prompt, jsonMode } = payload;
        return await vertexAi.processAudio(base64Audio, mimeType, prompt, jsonMode);
    }
}

module.exports = new AiService();

const visibilityRepository = require('../repositories/VisibilityRepository');

const DEFAULT_VISIBILITY = {
    hiddenTopics: [],
    sidebarHiddenTopics: [],
    showGrammar: true,
    showGames: true,
    showVocabPractice: true,
    hiddenPracticeItems: [],
    adminBypassHidden: true,
    lockAi: false,
    showEnglishVoiceSettings: true,
    showJapaneseVoiceSettings: true,
    showWordCount: true,
    showChuyendeVocab: true,
    showDailyVocab: true,
    showMasterVocab: true
};

function normalizeVisibility(parsed, isCustom = false) {
    if (!parsed) return { ...DEFAULT_VISIBILITY };
    const res = {
        hiddenTopics: Array.isArray(parsed.hiddenTopics) ? parsed.hiddenTopics : [],
        sidebarHiddenTopics: Array.isArray(parsed.sidebarHiddenTopics) ? parsed.sidebarHiddenTopics : [],
        showGrammar: parsed.showGrammar !== false,
        showGames: parsed.showGames !== false,
        showVocabPractice: parsed.showVocabPractice !== false,
        hiddenPracticeItems: Array.isArray(parsed.hiddenPracticeItems) ? parsed.hiddenPracticeItems : [],
        adminBypassHidden: parsed.adminBypassHidden !== false,
        lockAi: parsed.lockAi === true,
        showEnglishVoiceSettings: parsed.showEnglishVoiceSettings !== false,
        showJapaneseVoiceSettings: parsed.showJapaneseVoiceSettings !== false,
        showWordCount: parsed.showWordCount !== false,
        showChuyendeVocab: parsed.showChuyendeVocab !== false,
        showDailyVocab: parsed.showDailyVocab !== false,
        showMasterVocab: parsed.showMasterVocab !== false
    };
    if (isCustom) res.isCustom = true;
    return res;
}

class VisibilityService {
    async getEffectiveSettings(currentUser) {
        // If regular logged-in user (non-admin), check for custom per-user permissions
        if (currentUser && currentUser.role !== 'admin' && currentUser.id) {
            const userPerms = await visibilityRepository.getUserSettings(currentUser.id);
            if (userPerms) {
                try {
                    const parsed = JSON.parse(userPerms);
                    return normalizeVisibility(parsed, true);
                } catch (e) {
                    console.error('Error parsing user permissions:', e);
                }
            }
        }

        // Global default settings from system_settings
        const globalSettings = await visibilityRepository.getGlobalSettings();
        if (globalSettings) {
            try {
                const parsed = JSON.parse(globalSettings);
                return normalizeVisibility(parsed, false);
            } catch (e) {
                console.error('Error parsing global settings:', e);
            }
        }

        return { ...DEFAULT_VISIBILITY };
    }

    async updateGlobalSettings(body) {
        const config = normalizeVisibility(body, false);
        await visibilityRepository.saveGlobalSettings(JSON.stringify(config));
        return config;
    }

    async getCustomUserIds() {
        return await visibilityRepository.getCustomUserIds();
    }

    async getUserVisibility(userId) {
        const userPerms = await visibilityRepository.getUserSettings(userId);
        if (userPerms) {
            try {
                const parsed = JSON.parse(userPerms);
                return {
                    success: true,
                    isCustom: true,
                    settings: normalizeVisibility(parsed)
                };
            } catch (e) {
                console.error('Error parsing user permissions:', e);
            }
        }

        const globalSettings = await visibilityRepository.getGlobalSettings();
        const fallback = globalSettings ? JSON.parse(globalSettings) : DEFAULT_VISIBILITY;
        return {
            success: true,
            isCustom: false,
            settings: normalizeVisibility(fallback)
        };
    }

    async saveUserVisibility(userId, body) {
        const config = normalizeVisibility(body);
        await visibilityRepository.saveUserSettings(userId, JSON.stringify(config));
        return { success: true, settings: config };
    }

    async deleteUserVisibility(userId) {
        await visibilityRepository.deleteUserSettings(userId);
        return { success: true };
    }
}

module.exports = new VisibilityService();

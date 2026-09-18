const wordRepository = require('../repositories/WordRepository');

class WordService {
    async search(query, limit = 30) {
        const trimmed = (query || '').trim();
        if (!trimmed) return [];
        const safeLimit = Math.min(parseInt(limit, 10) || 30, 100);
        return await wordRepository.search(trimmed, safeLimit);
    }

    async getAll() {
        return await wordRepository.getAll();
    }

    async saveWord(wordData) {
        if (!wordData.en || !wordData.vi) {
            throw { status: 400, message: 'Từ tiếng Anh (en) và nghĩa tiếng Việt (vi) không được để trống' };
        }
        const id = await wordRepository.upsert(wordData);
        return { success: true, id };
    }

    async updateHelpers(id, helpers) {
        if (!id) {
            throw { status: 400, message: 'ID từ vựng không hợp lệ' };
        }
        await wordRepository.updateHelpers(id, helpers);
        return { success: true };
    }

    async deleteWord(id) {
        if (!id) {
            throw { status: 400, message: 'ID từ vựng không hợp lệ' };
        }
        await wordRepository.delete(id);
        return { success: true };
    }
}

module.exports = new WordService();

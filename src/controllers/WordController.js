const wordService = require('../services/WordService');

class WordController {
    async search(req, res, next) {
        try {
            const query = req.query.q || '';
            const limit = req.query.limit;
            const results = await wordService.search(query, limit);
            res.json(results);
        } catch (err) {
            next(err);
        }
    }

    async getAll(req, res, next) {
        try {
            const words = await wordService.getAll();
            res.json(words);
        } catch (err) {
            next(err);
        }
    }

    async save(req, res, next) {
        try {
            const result = await wordService.saveWord(req.body);
            res.json(result);
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message || 'Failed to save word' });
        }
    }

    async updateHelpers(req, res, next) {
        try {
            const { id } = req.params;
            const result = await wordService.updateHelpers(id, req.body);
            res.json(result);
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message || 'Failed to update word helpers' });
        }
    }

    async delete(req, res, next) {
        try {
            const { id } = req.params;
            const result = await wordService.deleteWord(id);
            res.json(result);
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message || 'Failed to delete word' });
        }
    }
}

module.exports = new WordController();

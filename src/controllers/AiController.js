const aiService = require('../services/AiService');
const { verifySignedToken } = require('../../security');

class AiController {
    async generate(req, res, next) {
        try {
            const authHeader = req.headers['authorization'];
            let currentUser = null;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                currentUser = verifySignedToken(token);
            }

            if (await aiService.isAiFeatureLocked(currentUser)) {
                return res.status(403).json({
                    error: 'Tính năng Trí tuệ nhân tạo (AI) đang tạm thời bị khóa bởi Quản trị viên hệ thống.',
                    aiLocked: true
                });
            }

            const result = await aiService.generateContent(req.body);
            res.json({ text: result.text, metadata: result.metadata });
        } catch (err) {
            console.error('AI Generate Error:', err);
            res.status(500).json({ error: 'Failed to generate AI content' });
        }
    }

    async audio(req, res, next) {
        try {
            const authHeader = req.headers['authorization'];
            let currentUser = null;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                currentUser = verifySignedToken(token);
            }

            if (await aiService.isAiFeatureLocked(currentUser)) {
                return res.status(403).json({
                    error: 'Tính năng Trí tuệ nhân tạo (AI) đang tạm thời bị khóa bởi Quản trị viên hệ thống.',
                    aiLocked: true
                });
            }

            const result = await aiService.processAudio(req.body);
            res.json({ text: result.text, metadata: result.metadata });
        } catch (err) {
            console.error('AI Audio Error:', err);
            res.status(500).json({ error: 'Failed to process audio with AI' });
        }
    }
}

module.exports = new AiController();

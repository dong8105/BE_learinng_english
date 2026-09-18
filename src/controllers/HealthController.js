const wordRepository = require('../repositories/WordRepository');

class HealthController {
    async check(req, res) {
        try {
            const count = await wordRepository.count();
            res.json({
                status: 'ok',
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                db: 'connected',
                wordCount: count
            });
        } catch (err) {
            res.status(500).json({
                status: 'degraded',
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                db: 'disconnected',
                error: err.message
            });
        }
    }
}

module.exports = new HealthController();

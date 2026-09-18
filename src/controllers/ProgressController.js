const progressService = require('../services/ProgressService');

class ProgressController {
    async getProgress(req, res, next) {
        try {
            const { type } = req.params;
            const userId = req.user.id;
            const result = await progressService.getUserProgress(userId, type);
            res.json({ success: true, ...result });
        } catch (err) {
            console.error('Error fetching user progress:', err);
            res.status(500).json({ error: 'Không thể lấy tiến trình người dùng' });
        }
    }

    async saveProgress(req, res, next) {
        try {
            const { type } = req.params;
            const { data } = req.body;
            const userId = req.user.id;

            if (data === undefined) {
                return res.status(400).json({ error: 'Dữ liệu tiến trình không được để trống' });
            }

            const result = await progressService.saveUserProgress(userId, type, data);
            res.json(result);
        } catch (err) {
            console.error('Error saving user progress:', err);
            res.status(500).json({ error: 'Không thể lưu tiến trình người dùng' });
        }
    }

    async getMetrics(req, res, next) {
        try {
            const metrics = await progressService.getMetrics();
            res.json(metrics);
        } catch (err) {
            console.error('Error fetching metrics:', err);
            res.status(500).json({ error: 'Failed to fetch metrics' });
        }
    }

    async getUsersWithStreaks(req, res, next) {
        try {
            const users = await progressService.getUsersWithStreaks();
            res.json(users);
        } catch (err) {
            console.error('Error fetching users with streaks:', err);
            res.status(500).json({ error: 'Failed to fetch users list' });
        }
    }

    async updateStreak(req, res, next) {
        try {
            const { id } = req.params;
            const { streakCount, lastActiveDate } = req.body;
            const streak = await progressService.updateUserStreak(id, streakCount, lastActiveDate);
            res.json({ success: true, streak });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message || 'Không thể cập nhật chuỗi học tập của người dùng' });
        }
    }
}

module.exports = new ProgressController();

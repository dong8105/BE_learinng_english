const { getPool } = require('../db/connection');

class ProgressRepository {
    async getProgress(userId, type) {
        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT data, updated_at FROM user_progress WHERE user_id = ? AND progress_type = ?',
            [userId, type]
        );
        return rows[0] || null;
    }

    async saveProgress(userId, type, stringifiedData) {
        const pool = getPool();
        await pool.query(
            'INSERT INTO user_progress (user_id, progress_type, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
            [userId, type, stringifiedData]
        );
        return true;
    }

    async getAllProgressByType(type) {
        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT user_id, data, updated_at FROM user_progress WHERE progress_type = ?',
            [type]
        );
        return rows;
    }

    async getMetrics() {
        const pool = getPool();
        const [[{ totalWords }]] = await pool.query('SELECT COUNT(*) as totalWords FROM words');
        const [[{ withIpa }]] = await pool.query('SELECT COUNT(*) as withIpa FROM words WHERE ipa IS NOT NULL AND ipa != ""');
        const [[{ withExample }]] = await pool.query('SELECT COUNT(*) as withExample FROM words WHERE example_en IS NOT NULL AND example_en != ""');
        const [[{ totalUsers }]] = await pool.query('SELECT COUNT(*) as totalUsers FROM users');
        const [[{ totalAdmins }]] = await pool.query('SELECT COUNT(*) as totalAdmins FROM users WHERE role = "admin"');
        const [[{ totalLearners }]] = await pool.query('SELECT COUNT(*) as totalLearners FROM users WHERE role != "admin"');
        const [[{ newUsers7d }]] = await pool.query('SELECT COUNT(*) as newUsers7d FROM users WHERE created_at >= NOW() - INTERVAL 7 DAY');
        const [[{ newUsers30d }]] = await pool.query('SELECT COUNT(*) as newUsers30d FROM users WHERE created_at >= NOW() - INTERVAL 30 DAY');

        const [categories] = await pool.query('SELECT category, COUNT(*) as count FROM words GROUP BY category ORDER BY count DESC LIMIT 10');
        const [masterGroups] = await pool.query('SELECT master_group, COUNT(*) as count FROM words WHERE master_group IS NOT NULL GROUP BY master_group ORDER BY count DESC');

        return {
            totalWords,
            withIpa,
            withExample,
            totalUsers,
            totalAdmins,
            totalLearners,
            newUsers7d,
            newUsers30d,
            categories,
            masterGroups
        };
    }
}

module.exports = new ProgressRepository();

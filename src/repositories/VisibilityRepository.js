const { getPool } = require('../db/connection');

class VisibilityRepository {
    async getGlobalSettings() {
        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT setting_value FROM system_settings WHERE setting_key = ?',
            ['feature_visibility']
        );
        return rows[0] ? rows[0].setting_value : null;
    }

    async saveGlobalSettings(jsonString) {
        const pool = getPool();
        await pool.query(
            'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
            ['feature_visibility', jsonString]
        );
        return true;
    }

    async getUserSettings(userId) {
        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT settings FROM user_permissions WHERE user_id = ?',
            [userId]
        );
        return rows[0] ? rows[0].settings : null;
    }

    async saveUserSettings(userId, jsonString) {
        const pool = getPool();
        await pool.query(
            'INSERT INTO user_permissions (user_id, settings) VALUES (?, ?) ON DUPLICATE KEY UPDATE settings = VALUES(settings)',
            [userId, jsonString]
        );
        return true;
    }

    async deleteUserSettings(userId) {
        const pool = getPool();
        const [result] = await pool.query('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
        return result.affectedRows > 0;
    }

    async getCustomUserIds() {
        const pool = getPool();
        const [rows] = await pool.query('SELECT user_id FROM user_permissions');
        return rows.map(r => r.user_id);
    }
}

module.exports = new VisibilityRepository();

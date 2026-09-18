const { getPool } = require('../db/connection');

class UserRepository {
    async findByUsername(username) {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        return rows[0] || null;
    }

    async findById(id) {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
        return rows[0] || null;
    }

    async create({ id, username, password, name, role }) {
        const pool = getPool();
        await pool.query(
            'INSERT INTO users (id, username, password, name, role) VALUES (?, ?, ?, ?, ?)',
            [id, username, password, name, role]
        );
        return { id, username, name, role };
    }

    async getAll() {
        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT id, username, name, role, created_at FROM users ORDER BY created_at DESC'
        );
        return rows;
    }

    async delete(id) {
        const pool = getPool();
        const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = new UserRepository();

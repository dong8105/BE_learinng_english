const userRepository = require('../repositories/UserRepository');
const progressService = require('../services/ProgressService');
const { getPool } = require('../db/connection');
const {
    hashPassword,
    validateUsername,
    validatePassword,
    sanitizeName
} = require('../../security');

class UserController {
    async getMetrics(req, res, next) {
        try {
            const metrics = await progressService.getMetrics();
            res.json(metrics);
        } catch (err) {
            console.error('Error fetching metrics:', err);
            res.status(500).json({ error: 'Failed to fetch metrics' });
        }
    }

    async getAllUsers(req, res, next) {
        try {
            const users = await progressService.getUsersWithStreaks();
            res.json(users);
        } catch (err) {
            console.error('Error fetching users with streaks:', err);
            res.status(500).json({ error: 'Failed to fetch users list' });
        }
    }

    async createUser(req, res, next) {
        try {
            const { username, password, name, role } = req.body;
            const userCheck = validateUsername(username, false);
            if (!userCheck.valid) {
                return res.status(400).json({ error: userCheck.error });
            }
            const passCheck = validatePassword(password);
            if (!passCheck.valid) {
                return res.status(400).json({ error: passCheck.error });
            }

            const existing = await userRepository.findByUsername(userCheck.sanitized);
            if (existing) {
                return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
            }

            const userId = `user-${Date.now()}`;
            const hashedPassword = hashPassword(password);
            const assignedRole = role === 'admin' ? 'admin' : 'user';

            await userRepository.create({
                id: userId,
                username: userCheck.sanitized,
                password: hashedPassword,
                name: sanitizeName(name, userCheck.sanitized),
                role: assignedRole
            });

            res.json({
                success: true,
                user: {
                    id: userId,
                    username: userCheck.sanitized,
                    name: sanitizeName(name, userCheck.sanitized),
                    role: assignedRole
                }
            });
        } catch (err) {
            console.error('Admin create user error:', err);
            res.status(500).json({ error: 'Không thể tạo tài khoản người dùng' });
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

    async deleteUser(req, res, next) {
        try {
            const { id } = req.params;
            const pool = getPool();
            await pool.query('DELETE FROM users WHERE id = ?', [id]);
            await pool.query('DELETE FROM user_progress WHERE user_id = ?', [id]);
            await pool.query('DELETE FROM user_permissions WHERE user_id = ?', [id]);
            res.json({ success: true, message: 'Đã xóa người dùng thành công' });
        } catch (err) {
            console.error('Error deleting user:', err);
            res.status(500).json({ error: 'Failed to delete user' });
        }
    }
}

module.exports = new UserController();

const userRepository = require('../repositories/UserRepository');
const { getPool } = require('../db/connection');
const {
    hashPassword,
    verifyPassword,
    generateSignedToken,
    validateUsername,
    validatePassword,
    sanitizeName
} = require('../../security');

class AuthService {
    async login(username, password) {
        if (!username || !password) {
            throw { status: 400, message: 'Vui lòng cung cấp đầy đủ tên đăng nhập và mật khẩu' };
        }

        const userRow = await userRepository.findByUsername(username.trim());
        if (!userRow) {
            throw { status: 401, message: 'Tên đăng nhập hoặc mật khẩu không chính xác' };
        }

        const verifyResult = verifyPassword(password, userRow.password);
        if (!verifyResult.valid) {
            throw { status: 401, message: 'Tên đăng nhập hoặc mật khẩu không chính xác' };
        }

        // Auto-upgrade legacy plain text password to secure scrypt hash
        if (verifyResult.needsUpgrade) {
            try {
                const secureHash = hashPassword(password);
                const pool = getPool();
                await pool.query('UPDATE users SET password = ? WHERE id = ?', [secureHash, userRow.id]);
                console.log(`Upgraded password for ${userRow.username} to secure scrypt hash`);
            } catch (upgErr) {
                console.error('Failed to auto-upgrade password:', upgErr);
            }
        }

        const user = {
            id: userRow.id,
            username: userRow.username,
            name: userRow.name,
            role: userRow.role,
            created_at: userRow.created_at
        };

        const token = generateSignedToken(user);
        return { user, token };
    }

    async register({ username, password, name }) {
        const userCheck = validateUsername(username, true);
        if (!userCheck.valid) {
            throw { status: 400, message: userCheck.error };
        }

        const passCheck = validatePassword(password);
        if (!passCheck.valid) {
            throw { status: 400, message: passCheck.error };
        }

        const sanitizedUsername = userCheck.sanitized;
        const sanitizedUserName = sanitizeName(name, sanitizedUsername);

        const existing = await userRepository.findByUsername(sanitizedUsername);
        if (existing) {
            throw { status: 409, message: 'Tên đăng nhập đã tồn tại, vui lòng chọn tên khác' };
        }

        const userId = `user-${Date.now()}`;
        const hashedPassword = hashPassword(password);
        const role = 'user';

        await userRepository.create({
            id: userId,
            username: sanitizedUsername,
            password: hashedPassword,
            name: sanitizedUserName,
            role
        });

        const user = {
            id: userId,
            username: sanitizedUsername,
            name: sanitizedUserName,
            role
        };

        const token = generateSignedToken(user);
        return { user, token };
    }
}

module.exports = new AuthService();

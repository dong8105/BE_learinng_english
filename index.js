const express = require('express');
const cors = require('cors');
const { initDB, getPool } = require('./db');
const {
    hashPassword,
    verifyPassword,
    generateSignedToken,
    verifySignedToken,
    checkLoginRateLimit,
    recordLoginFailure,
    recordLoginSuccess,
    checkRegisterRateLimit,
    validateUsername,
    validatePassword,
    sanitizeName
} = require('./security');

const vertexAi = require('./vertexAi');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health Check Endpoint
app.get('/api/health', async (req, res) => {
    try {
        const pool = getPool();
        const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM words');
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
});

// Quick Search Endpoint
app.get('/api/words/search', async (req, res) => {
    try {
        const query = (req.query.q || '').trim();
        const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
        if (!query) {
            return res.json([]);
        }
        const pool = getPool();
        const searchPattern = `%${query}%`;
        const [rows] = await pool.query(
            'SELECT * FROM words WHERE en LIKE ? OR vi LIKE ? OR category LIKE ? LIMIT ?',
            [searchPattern, searchPattern, searchPattern, limit]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error searching words:', err);
        res.status(500).json({ error: 'Failed to search words' });
    }
});


// --- AUTHENTICATION & AUTHORIZATION MIDDLEWARES ---
const authenticateUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Yêu cầu đăng nhập để tiếp tục' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = verifySignedToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.' });
    }
    req.user = decoded;
    next();
};

const requireAdmin = (req, res, next) => {
    authenticateUser(req, res, () => {
        if (req.user && req.user.role === 'admin') {
            return next();
        }
        return res.status(403).json({ error: 'Truy cập bị từ chối: Yêu cầu quyền Quản trị viên (Admin)' });
    });
};

// --- AUTHENTICATION ROUTES ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const rateLimit = checkLoginRateLimit(req);
        if (!rateLimit.allowed) {
            return res.status(429).json({ error: rateLimit.message });
        }

        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ tên đăng nhập và mật khẩu' });
        }

        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT id, username, password, name, role, created_at FROM users WHERE username = ?',
            [username.trim()]
        );

        if (rows.length === 0) {
            recordLoginFailure(req);
            return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác' });
        }

        const verifyResult = verifyPassword(password, rows[0].password);
        if (!verifyResult.valid) {
            recordLoginFailure(req);
            return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác' });
        }

        // Auto-upgrade legacy plain text password to secure scrypt hash
        if (verifyResult.needsUpgrade) {
            try {
                const secureHash = hashPassword(password);
                await pool.query('UPDATE users SET password = ? WHERE id = ?', [secureHash, rows[0].id]);
                console.log(`Upgraded password for ${rows[0].username} to secure scrypt hash`);
            } catch (upgErr) {
                console.error('Failed to auto-upgrade password:', upgErr);
            }
        }

        recordLoginSuccess(req);

        const user = {
            id: rows[0].id,
            username: rows[0].username,
            name: rows[0].name,
            role: rows[0].role,
            created_at: rows[0].created_at
        };

        const token = generateSignedToken(user);

        res.json({
            success: true,
            user,
            token
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Lỗi đăng nhập hệ thống' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const rateLimit = checkRegisterRateLimit(req);
        if (!rateLimit.allowed) {
            return res.status(429).json({ error: rateLimit.message });
        }

        const { username, password, name } = req.body;

        const userCheck = validateUsername(username, true);
        if (!userCheck.valid) {
            return res.status(400).json({ error: userCheck.error });
        }

        const passCheck = validatePassword(password);
        if (!passCheck.valid) {
            return res.status(400).json({ error: passCheck.error });
        }

        const sanitizedUsername = userCheck.sanitized;
        const sanitizedUserName = sanitizeName(name, sanitizedUsername);

        const pool = getPool();
        const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [sanitizedUsername]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại, vui lòng chọn tên khác' });
        }

        const userId = `user-${Date.now()}`;
        const hashedPassword = hashPassword(password);
        const role = 'user'; // Strictly enforced user role (clients can never self-assign admin)

        await pool.query(
            'INSERT INTO users (id, username, password, name, role) VALUES (?, ?, ?, ?, ?)',
            [userId, sanitizedUsername, hashedPassword, sanitizedUserName, role]
        );

        const user = {
            id: userId,
            username: sanitizedUsername,
            name: sanitizedUserName,
            role
        };

        const token = generateSignedToken(user);

        res.json({
            success: true,
            user,
            token
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Lỗi khi tạo tài khoản' });
    }
});

// --- USER PROGRESS ENDPOINTS (ISOLATED PER USER & MYSQL SYNC) ---
app.get('/api/progress/:type', authenticateUser, async (req, res) => {
    try {
        const { type } = req.params;
        const userId = req.user.id;
        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT data, updated_at FROM user_progress WHERE user_id = ? AND progress_type = ?',
            [userId, type]
        );

        if (rows.length > 0) {
            let parsed = {};
            try {
                parsed = JSON.parse(rows[0].data);
            } catch {
                parsed = rows[0].data;
            }
            return res.json({ success: true, progressType: type, data: parsed, updatedAt: rows[0].updated_at });
        }

        res.json({ success: true, progressType: type, data: null });
    } catch (err) {
        console.error('Error fetching user progress:', err);
        res.status(500).json({ error: 'Không thể lấy tiến trình người dùng' });
    }
});

app.post('/api/progress/:type', authenticateUser, async (req, res) => {
    try {
        const { type } = req.params;
        const { data } = req.body;
        const userId = req.user.id;

        if (data === undefined) {
            return res.status(400).json({ error: 'Dữ liệu tiến trình không được để trống' });
        }

        const stringified = typeof data === 'string' ? data : JSON.stringify(data);
        const pool = getPool();
        await pool.query(
            'INSERT INTO user_progress (user_id, progress_type, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
            [userId, type, stringified]
        );

        res.json({ success: true, progressType: type });
    } catch (err) {
        console.error('Error saving user progress:', err);
        res.status(500).json({ error: 'Không thể lưu tiến trình người dùng' });
    }
});

// --- ADMIN ROUTES (SECURED WITH REQUIRE_ADMIN) ---
app.get('/api/admin/metrics', requireAdmin, async (req, res) => {
    try {
        const pool = getPool();
        const [[{ totalWords }]] = await pool.query('SELECT COUNT(*) as totalWords FROM words');
        const [[{ withIpa }]] = await pool.query('SELECT COUNT(*) as withIpa FROM words WHERE ipa IS NOT NULL AND ipa != ""');
        const [[{ withExample }]] = await pool.query('SELECT COUNT(*) as withExample FROM words WHERE example_en IS NOT NULL AND example_en != ""');
        const [[{ totalUsers }]] = await pool.query('SELECT COUNT(*) as totalUsers FROM users');
        const [categories] = await pool.query('SELECT category, COUNT(*) as count FROM words GROUP BY category ORDER BY count DESC LIMIT 10');
        const [masterGroups] = await pool.query('SELECT master_group, COUNT(*) as count FROM words WHERE master_group IS NOT NULL GROUP BY master_group ORDER BY count DESC');

        const mem = process.memoryUsage();

        res.json({
            status: 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            metrics: {
                totalWords,
                withIpa,
                withExample,
                totalUsers,
                memoryRssMb: Math.round(mem.rss / 1024 / 1024),
                memoryHeapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
                nodeVersion: process.version,
                platform: process.platform,
                categories,
                masterGroups
            }
        });
    } catch (err) {
        console.error('Admin metrics error:', err);
        res.status(500).json({ error: 'Failed to fetch admin metrics' });
    }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT id, username, name, role, created_at FROM users ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
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

        const pool = getPool();
        const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [userCheck.sanitized]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
        }

        const userId = `user-${Date.now()}`;
        const hashedPassword = hashPassword(password);
        const assignedRole = role === 'admin' ? 'admin' : 'user';

        await pool.query(
            'INSERT INTO users (id, username, password, name, role) VALUES (?, ?, ?, ?, ?)',
            [userId, userCheck.sanitized, hashedPassword, sanitizeName(name, userCheck.sanitized), assignedRole]
        );

        res.json({
            success: true,
            user: { id: userId, username: userCheck.sanitized, name: sanitizeName(name, userCheck.sanitized), role: assignedRole }
        });
    } catch (err) {
        console.error('Admin create user error:', err);
        res.status(500).json({ error: 'Không thể tạo tài khoản người dùng' });
    }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
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
});

// --- FEATURE VISIBILITY SETTINGS (GLOBAL & PER-USER) ---
app.get('/api/settings/visibility', async (req, res) => {
    try {
        const pool = getPool();

        // Check if there is an auth token in request header
        const authHeader = req.headers['authorization'];
        let currentUser = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            currentUser = verifySignedToken(token);
        }

        // If user is Admin, they should see everything
        if (currentUser && currentUser.role === 'admin') {
            return res.json({
                hiddenTopics: [],
                showGrammar: true,
                showGames: true,
                isAdmin: true
            });
        }

        // If regular logged-in user, check for custom per-user permissions
        if (currentUser && currentUser.id) {
            const [userPerms] = await pool.query(
                'SELECT settings FROM user_permissions WHERE user_id = ?',
                [currentUser.id]
            );
            if (userPerms.length > 0) {
                try {
                    const parsed = JSON.parse(userPerms[0].settings);
                    return res.json({ ...parsed, isCustom: true });
                } catch (e) {
                    console.error('Error parsing user permissions:', e);
                }
            }
        }

        // Fallback: Global default settings
        const [rows] = await pool.query('SELECT setting_value FROM system_settings WHERE setting_key = ?', ['feature_visibility']);
        if (rows.length > 0) {
            const parsed = JSON.parse(rows[0].setting_value);
            return res.json(parsed);
        }
        res.json({ hiddenTopics: [], showGrammar: true, showGames: true });
    } catch (err) {
        console.error('Error fetching visibility settings:', err);
        res.status(500).json({ error: 'Failed to fetch visibility settings' });
    }
});

app.post('/api/settings/visibility', requireAdmin, async (req, res) => {
    try {
        const { hiddenTopics, showGrammar, showGames } = req.body;
        const config = {
            hiddenTopics: Array.isArray(hiddenTopics) ? hiddenTopics : [],
            showGrammar: showGrammar !== false,
            showGames: showGames !== false
        };
        const pool = getPool();
        await pool.query(
            'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
            ['feature_visibility', JSON.stringify(config)]
        );
        res.json({ success: true, settings: config });
    } catch (err) {
        console.error('Error saving visibility settings:', err);
        res.status(500).json({ error: 'Failed to save visibility settings' });
    }
});

// List all user IDs that currently have custom visibility permissions
app.get('/api/admin/visibility/custom-users', requireAdmin, async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT user_id FROM user_permissions');
        const customUserIds = rows.map(r => r.user_id);
        res.json({ success: true, customUserIds });
    } catch (err) {
        console.error('Error fetching custom users list:', err);
        res.status(500).json({ error: 'Failed to fetch custom users list' });
    }
});

// Get visibility settings for a specific user (or global fallback)
app.get('/api/admin/users/:id/visibility', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = getPool();

        const [users] = await pool.query('SELECT id, username, name, role FROM users WHERE id = ?', [id]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'Người dùng không tồn tại' });
        }

        const [rows] = await pool.query('SELECT settings FROM user_permissions WHERE user_id = ?', [id]);
        if (rows.length > 0) {
            try {
                const parsed = JSON.parse(rows[0].settings);
                return res.json({
                    hasCustom: true,
                    settings: parsed,
                    user: users[0]
                });
            } catch (e) {
                console.error('Error parsing user permissions JSON:', e);
            }
        }

        // Return global default if no custom setting
        const [defaultRows] = await pool.query('SELECT setting_value FROM system_settings WHERE setting_key = ?', ['feature_visibility']);
        const defaultSettings = defaultRows.length > 0
            ? JSON.parse(defaultRows[0].setting_value)
            : { hiddenTopics: [], showGrammar: true, showGames: true };

        res.json({
            hasCustom: false,
            settings: defaultSettings,
            user: users[0]
        });
    } catch (err) {
        console.error('Error fetching user visibility settings:', err);
        res.status(500).json({ error: 'Failed to fetch user visibility settings' });
    }
});

// Save custom visibility settings for a specific user
app.post('/api/admin/users/:id/visibility', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { hiddenTopics, showGrammar, showGames } = req.body;
        const pool = getPool();

        const [users] = await pool.query('SELECT id, username, name, role FROM users WHERE id = ?', [id]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'Người dùng không tồn tại' });
        }

        const config = {
            hiddenTopics: Array.isArray(hiddenTopics) ? hiddenTopics : [],
            showGrammar: showGrammar !== false,
            showGames: showGames !== false
        };

        await pool.query(
            'INSERT INTO user_permissions (user_id, settings) VALUES (?, ?) ON DUPLICATE KEY UPDATE settings = VALUES(settings)',
            [id, JSON.stringify(config)]
        );

        res.json({ success: true, settings: config });
    } catch (err) {
        console.error('Error saving user visibility settings:', err);
        res.status(500).json({ error: 'Failed to save user visibility settings' });
    }
});

// Revert custom visibility settings for a specific user back to global default
app.delete('/api/admin/users/:id/visibility', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = getPool();
        await pool.query('DELETE FROM user_permissions WHERE user_id = ?', [id]);
        res.json({ success: true, message: 'Đã hoàn tác về cấu hình mặc định chung cho người dùng' });
    } catch (err) {
        console.error('Error resetting user visibility settings:', err);
        res.status(500).json({ error: 'Failed to reset user visibility settings' });
    }
});

// Routes
app.get('/api/words', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM words');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching words:', err);
        res.status(500).json({ error: 'Failed to fetch words' });
    }
});

app.post('/api/words', async (req, res) => {
    try {
        const { id, en, vi, ipa, category, unit, master_group, sub_group, definition_en, definition_vi, example_en, example_vi, collocations, mnemonics, context_passage, io_prompt } = req.body;
        const wordId = id || `word-new-${Date.now()}`;
        const pool = getPool();
        await pool.query(
            'INSERT INTO words (id, en, vi, ipa, category, unit, master_group, sub_group, definition_en, definition_vi, example_en, example_vi, collocations, mnemonics, context_passage, io_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE en=VALUES(en), vi=VALUES(vi), ipa=VALUES(ipa), category=VALUES(category), unit=VALUES(unit), master_group=VALUES(master_group), sub_group=VALUES(sub_group), definition_en=VALUES(definition_en), definition_vi=VALUES(definition_vi), example_en=VALUES(example_en), example_vi=VALUES(example_vi), collocations=VALUES(collocations), mnemonics=VALUES(mnemonics), context_passage=VALUES(context_passage), io_prompt=VALUES(io_prompt)',
            [wordId, en, vi, ipa || '', category || '', unit || 1, master_group || null, sub_group || null, definition_en || null, definition_vi || null, example_en || null, example_vi || null, collocations || null, mnemonics || null, context_passage || null, io_prompt || null]
        );
        res.json({ success: true, id: wordId });
    } catch (err) {
        console.error('Error adding word:', err);
        res.status(500).json({ error: 'Failed to add word' });
    }
});

app.put('/api/words/:id/helpers', async (req, res) => {
    try {
        const { id } = req.params;
        const { collocations, mnemonics, context_passage, io_prompt } = req.body;
        const pool = getPool();
        await pool.query(
            'UPDATE words SET collocations=?, mnemonics=?, context_passage=?, io_prompt=? WHERE id=?',
            [collocations || null, mnemonics || null, context_passage || null, io_prompt || null, id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating word helpers:', err);
        res.status(500).json({ error: 'Failed to update word helpers' });
    }
});

app.delete('/api/words/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const pool = getPool();
        await pool.query('DELETE FROM words WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting word:', err);
        res.status(500).json({ error: 'Failed to delete word' });
    }
});

// AI Routes
app.post('/api/ai/generate', async (req, res) => {
    try {
        const { prompt, systemInstruction, jsonMode, usePro, model, preferredModel } = req.body;
        const targetModel = preferredModel || model || null;
        const result = await vertexAi.generateContent(prompt, systemInstruction, jsonMode, usePro, targetModel);
        res.json({ text: result.text, metadata: result.metadata });
    } catch (err) {
        console.error('AI Generate Error:', err);
        res.status(500).json({ error: 'Failed to generate AI content' });
    }
});

app.post('/api/ai/audio', async (req, res) => {
    try {
        const { base64Audio, mimeType, prompt, jsonMode } = req.body;
        const result = await vertexAi.processAudio(base64Audio, mimeType, prompt, jsonMode);
        res.json({ text: result.text, metadata: result.metadata });
    } catch (err) {
        console.error('AI Audio Error:', err);
        res.status(500).json({ error: 'Failed to process audio with AI' });
    }
});

// Start Server
async function startServer() {
    console.log('Initializing database...');
    await initDB();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

startServer();

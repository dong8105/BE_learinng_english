const express = require('express');
const cors = require('cors');
const { initDB, getPool } = require('./db');
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

// --- AUTHENTICATION ROUTES ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ tên đăng nhập và mật khẩu' });
        }

        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT id, username, password, name, role, created_at FROM users WHERE username = ?',
            [username.trim()]
        );

        if (rows.length === 0 || rows[0].password !== password) {
            return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác' });
        }

        const user = rows[0];
        delete user.password;

        const token = `token-${user.id}-${Date.now()}`;

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
        const { username, password, name } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Vui lòng điền tên đăng nhập và mật khẩu' });
        }

        const pool = getPool();
        const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username.trim()]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại, vui lòng chọn tên khác' });
        }

        const userId = `user-${Date.now()}`;
        const userName = name?.trim() || username.trim();
        const role = 'user';

        await pool.query(
            'INSERT INTO users (id, username, password, name, role) VALUES (?, ?, ?, ?, ?)',
            [userId, username.trim(), password, userName, role]
        );

        res.json({
            success: true,
            user: {
                id: userId,
                username: username.trim(),
                name: userName,
                role
            },
            token: `token-${userId}-${Date.now()}`
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Lỗi khi tạo tài khoản' });
    }
});

// --- ADMIN ROUTES ---
app.get('/api/admin/metrics', async (req, res) => {
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

app.get('/api/admin/users', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT id, username, name, role, created_at FROM users ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.delete('/api/admin/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const pool = getPool();
        await pool.query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true, message: 'Đã xóa người dùng thành công' });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// --- FEATURE VISIBILITY SETTINGS ---
app.get('/api/settings/visibility', async (req, res) => {
    try {
        const pool = getPool();
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

app.post('/api/settings/visibility', async (req, res) => {
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

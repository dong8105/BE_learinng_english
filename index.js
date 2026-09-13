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

const { getPool } = require('../db/connection');

class WordRepository {
    async count() {
        const pool = getPool();
        const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM words');
        return count;
    }

    async search(query, limit = 30) {
        const pool = getPool();
        const searchPattern = `%${query}%`;
        const [rows] = await pool.query(
            'SELECT * FROM words WHERE en LIKE ? OR vi LIKE ? OR category LIKE ? LIMIT ?',
            [searchPattern, searchPattern, searchPattern, limit]
        );
        return rows;
    }

    async getAll() {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM words');
        return rows;
    }

    async upsert(wordData) {
        const pool = getPool();
        const {
            id, en, vi, ipa, category, unit,
            master_group, sub_group,
            definition_en, definition_vi,
            example_en, example_vi,
            collocations, mnemonics,
            context_passage, io_prompt,
            kanji, hiragana, romaji, am_han
        } = wordData;

        const wordId = id || `word-new-${Date.now()}`;
        await pool.query(
            `INSERT INTO words (
                id, en, vi, ipa, category, unit, master_group, sub_group,
                definition_en, definition_vi, example_en, example_vi,
                collocations, mnemonics, context_passage, io_prompt,
                kanji, hiragana, romaji, am_han
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                en=VALUES(en), vi=VALUES(vi), ipa=VALUES(ipa), category=VALUES(category),
                unit=VALUES(unit), master_group=VALUES(master_group), sub_group=VALUES(sub_group),
                definition_en=VALUES(definition_en), definition_vi=VALUES(definition_vi),
                example_en=VALUES(example_en), example_vi=VALUES(example_vi),
                collocations=VALUES(collocations), mnemonics=VALUES(mnemonics),
                context_passage=VALUES(context_passage), io_prompt=VALUES(io_prompt),
                kanji=VALUES(kanji), hiragana=VALUES(hiragana), romaji=VALUES(romaji), am_han=VALUES(am_han)`,
            [
                wordId, en, vi, ipa || '', category || '', unit || 1,
                master_group || null, sub_group || null,
                definition_en || null, definition_vi || null,
                example_en || null, example_vi || null,
                collocations || null, mnemonics || null,
                context_passage || null, io_prompt || null,
                kanji || null, hiragana || null, romaji || null, am_han || null
            ]
        );
        return wordId;
    }

    async updateHelpers(id, { collocations, mnemonics, context_passage, io_prompt }) {
        const pool = getPool();
        const [result] = await pool.query(
            'UPDATE words SET collocations=?, mnemonics=?, context_passage=?, io_prompt=? WHERE id=?',
            [collocations || null, mnemonics || null, context_passage || null, io_prompt || null, id]
        );
        return result.affectedRows > 0;
    }

    async delete(id) {
        const pool = getPool();
        const [result] = await pool.query('DELETE FROM words WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = new WordRepository();

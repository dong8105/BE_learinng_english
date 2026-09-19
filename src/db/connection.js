const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { hashPassword } = require('../../security');

let pool;

async function initDB() {
    try {
        // 1. Create DB if not exists (soft attempt, allowed to fail on managed cloud DBs)
        try {
            const { database, ...serverConnConfig } = config.db;
            const connection = await mysql.createConnection(serverConnConfig);
            await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
            await connection.end();
        } catch (dbCreateErr) {
            console.warn('Notice: CREATE DATABASE skipped or not permitted (using pre-created database):', dbCreateErr.message);
        }

        // 2. Create Pool
        pool = mysql.createPool(config.db);

        // 3. Create Words Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS words (
                id VARCHAR(100) PRIMARY KEY,
                en VARCHAR(255) NOT NULL,
                vi VARCHAR(255) NOT NULL,
                ipa VARCHAR(100),
                category VARCHAR(100),
                unit INT,
                master_group VARCHAR(100) DEFAULT NULL,
                sub_group VARCHAR(100) DEFAULT NULL,
                definition_en TEXT DEFAULT NULL,
                definition_vi TEXT DEFAULT NULL,
                example_en TEXT DEFAULT NULL,
                example_vi TEXT DEFAULT NULL,
                collocations TEXT DEFAULT NULL,
                mnemonics TEXT DEFAULT NULL,
                context_passage TEXT DEFAULT NULL,
                io_prompt TEXT DEFAULT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Safely add missing columns
        const optionalColumns = [
            'master_group VARCHAR(100) DEFAULT NULL',
            'sub_group VARCHAR(100) DEFAULT NULL',
            'definition_en TEXT DEFAULT NULL',
            'definition_vi TEXT DEFAULT NULL',
            'example_en TEXT DEFAULT NULL',
            'example_vi TEXT DEFAULT NULL',
            'collocations TEXT DEFAULT NULL',
            'mnemonics TEXT DEFAULT NULL',
            'context_passage TEXT DEFAULT NULL',
            'io_prompt TEXT DEFAULT NULL',
            'kanji VARCHAR(255) DEFAULT NULL',
            'hiragana VARCHAR(255) DEFAULT NULL',
            'romaji VARCHAR(255) DEFAULT NULL',
            'am_han VARCHAR(255) DEFAULT NULL'
        ];

        for (const col of optionalColumns) {
            try {
                await pool.query(`ALTER TABLE words ADD COLUMN ${col}`);
            } catch (e) {
                // Column already exists
            }
        }

        // Auto-seed words dataset if table is empty or has fewer than 100 words
        try {
            const [wordCountRows] = await pool.query('SELECT COUNT(*) as count FROM words');
            if (wordCountRows[0].count < 100) {
                const seedPath = path.join(__dirname, '../../words_seed.json');
                if (fs.existsSync(seedPath)) {
                    console.log('Seeding initial 5000 words dataset into database...');
                    const seedWords = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
                    const chunkSize = 200;
                    for (let i = 0; i < seedWords.length; i += chunkSize) {
                        const chunk = seedWords.slice(i, i + chunkSize);
                        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
                        const values = [];
                        chunk.forEach(w => {
                            values.push(
                                w.id,
                                w.en || '',
                                w.vi || '',
                                w.ipa || '',
                                w.category || '',
                                w.unit !== undefined ? w.unit : null,
                                w.master_group || null,
                                w.sub_group || null,
                                w.definition_en || null,
                                w.definition_vi || null,
                                w.example_en || null,
                                w.example_vi || null,
                                w.collocations || null,
                                w.mnemonics || null,
                                w.context_passage || null,
                                w.io_prompt || null,
                                w.kanji || null,
                                w.hiragana || null,
                                w.romaji || null,
                                w.am_han || null
                            );
                        });
                        await pool.query(
                            `INSERT INTO words (
                                id, en, vi, ipa, category, unit, master_group, sub_group,
                                definition_en, definition_vi, example_en, example_vi,
                                collocations, mnemonics, context_passage, io_prompt,
                                kanji, hiragana, romaji, am_han
                            ) VALUES ${placeholders}
                            ON DUPLICATE KEY UPDATE
                                en=VALUES(en), vi=VALUES(vi), ipa=VALUES(ipa), category=VALUES(category),
                                unit=VALUES(unit), master_group=VALUES(master_group), sub_group=VALUES(sub_group),
                                definition_en=VALUES(definition_en), definition_vi=VALUES(definition_vi),
                                example_en=VALUES(example_en), example_vi=VALUES(example_vi),
                                kanji=VALUES(kanji), hiragana=VALUES(hiragana), romaji=VALUES(romaji), am_han=VALUES(am_han)`,
                            values
                        );
                    }
                    console.log(`Successfully seeded ${seedWords.length} words into database!`);
                }
            }
        } catch (seedErr) {
            console.warn('Notice: Words auto-seed warning (will retry on next launch):', seedErr.message);
        }

        // 4. Create Users Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(100) PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                name VARCHAR(255) DEFAULT 'User',
                role VARCHAR(50) DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Seed default users if empty
        const [userRows] = await pool.query('SELECT COUNT(*) as count FROM users');
        if (userRows[0].count === 0) {
            console.log('Seeding default users (admin & user)...');
            await pool.query(
                'INSERT INTO users (id, username, password, name, role) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)',
                [
                    'user-admin-001', 'admin', hashPassword('admin123'), 'Quản Trị Viên (Admin)', 'admin',
                    'user-learner-001', 'user', hashPassword('user123'), 'Học Viên Mẫu', 'user'
                ]
            );
            console.log('Default users seeded successfully.');
        }

        // 5. Create User Progress Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_progress (
                user_id VARCHAR(100) NOT NULL,
                progress_type VARCHAR(50) NOT NULL,
                data LONGTEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, progress_type),
                INDEX idx_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 6. Create System Settings Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS system_settings (
                setting_key VARCHAR(100) PRIMARY KEY,
                setting_value LONGTEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Seed default feature_visibility if not present
        const [settingsRows] = await pool.query('SELECT COUNT(*) as count FROM system_settings WHERE setting_key = ?', ['feature_visibility']);
        if (settingsRows[0].count === 0) {
            console.log('Seeding default feature_visibility settings...');
            const defaultVisibility = {
                hiddenTopics: [],
                showGrammar: true,
                showGames: true,
                showVocabPractice: true,
                hiddenPracticeItems: [],
                showEnglishVoiceSettings: true,
                showJapaneseVoiceSettings: true,
                showWordCount: true,
                showChuyendeVocab: true,
                showDailyVocab: true,
                showMasterVocab: true
            };
            await pool.query(
                'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)',
                ['feature_visibility', JSON.stringify(defaultVisibility)]
            );
        }

        // 7. Create User Permissions Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_permissions (
                user_id VARCHAR(100) PRIMARY KEY,
                settings LONGTEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        console.log('Database initialized successfully in modular architecture.');
    } catch (err) {
        console.error('Database initialization failed (server will stay alive and retry):', err.message);
    }
}

function getPool() {
    return pool;
}

module.exports = {
    initDB,
    getPool
};

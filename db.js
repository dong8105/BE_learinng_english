const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { hashPassword } = require('./security');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    port: process.env.DB_PORT || 3306,
    ssl: {
        rejectUnauthorized: false
    }
};

const DB_NAME = process.env.DB_NAME || 'server_learning_english';

let pool;

async function initDB() {
    try {
        // Create DB if not exists
        const connection = await mysql.createConnection(dbConfig);
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await connection.end();

        // Create Pool
        pool = mysql.createPool({
            ...dbConfig,
            database: DB_NAME,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        // Create Table
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

        // Safely try to alter existing table if these columns don't exist
        try {
            await pool.query('ALTER TABLE words ADD COLUMN master_group VARCHAR(100) DEFAULT NULL');
        } catch (e) { /* Column might already exist */ }
        
        try {
            await pool.query('ALTER TABLE words ADD COLUMN sub_group VARCHAR(100) DEFAULT NULL');
        } catch (e) { /* Column might already exist */ }

        try { await pool.query('ALTER TABLE words ADD COLUMN definition_en TEXT DEFAULT NULL'); } catch(e){}
        try { await pool.query('ALTER TABLE words ADD COLUMN definition_vi TEXT DEFAULT NULL'); } catch(e){}
        try { await pool.query('ALTER TABLE words ADD COLUMN example_en TEXT DEFAULT NULL'); } catch(e){}
        try { await pool.query('ALTER TABLE words ADD COLUMN example_vi TEXT DEFAULT NULL'); } catch(e){}
        try { await pool.query('ALTER TABLE words ADD COLUMN collocations TEXT DEFAULT NULL'); } catch(e){}
        try { await pool.query('ALTER TABLE words ADD COLUMN mnemonics TEXT DEFAULT NULL'); } catch(e){}
        try { await pool.query('ALTER TABLE words ADD COLUMN context_passage TEXT DEFAULT NULL'); } catch(e){}
        try { await pool.query('ALTER TABLE words ADD COLUMN io_prompt TEXT DEFAULT NULL'); } catch(e){}

        // Check if data exists
        const [rows] = await pool.query('SELECT COUNT(*) as count FROM words');
        if (rows[0].count === 0) {
            console.log('Table is empty. Seeding from data.json...');
            const dataPath = path.join(__dirname, '..', '..', 'client', 'angel-english', 'src', 'data', 'data.json');
            
            if (fs.existsSync(dataPath)) {
                const rawData = fs.readFileSync(dataPath, 'utf8');
                const words = JSON.parse(rawData);
                
                let count = 0;
                for (const word of words) {
                    const wordId = word.id || `word-${count}-${Date.now()}`;
                    await pool.query(
                        'INSERT INTO words (id, en, vi, ipa, category, unit, master_group, sub_group, definition_en, definition_vi, example_en, example_vi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)',
                        [wordId, word.en, word.vi, word.ipa || '', word.category || '', word.unit || 1, word.master_group || null, word.sub_group || null]
                    );
                    count++;
                }
                console.log(`Successfully seeded ${count} words.`);
            } else {
                console.log('data.json not found at ' + dataPath);
            }
        } else {
            console.log('Database already has data. Skipping seed.');
        }

        // Create Users Table
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

        // Check if users exist, seed default admin and user if empty
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
        } else {
            // Auto-migrate legacy plain text passwords in users table
            try {
                const [users] = await pool.query('SELECT id, password FROM users');
                for (const u of users) {
                    if (u.password && !u.password.includes(':')) {
                        const hashed = hashPassword(u.password);
                        await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, u.id]);
                        console.log(`Migrated user ${u.id} password to secure scrypt hash.`);
                    }
                }
            } catch (migErr) {
                console.error('Password migration error:', migErr);
            }
        }

        // Create User Progress Table
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

        // Create System Settings Table
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
                showGames: true
            };
            await pool.query(
                'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)',
                ['feature_visibility', JSON.stringify(defaultVisibility)]
            );
        }

        console.log('Database initialized successfully.');
    } catch (err) {
        console.error('Database initialization failed:', err);
        process.exit(1);
    }
}

function getPool() {
    return pool;
}

module.exports = {
    initDB,
    getPool
};

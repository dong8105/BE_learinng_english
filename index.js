/**
 * Bluebell Pro Backend Server
 * Architecture: SOLID Layered Architecture
 * Entry point: Bootstraps database and starts Express HTTP server
 */
const app = require('./src/app');
const config = require('./src/config');
const { initDB, getPool } = require('./src/db/connection');

const PORT = config.PORT;

async function startServer() {
    // 1. Bind HTTP port immediately so Render health checks pass without delay
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on port ${PORT} (SOLID modular architecture)`);
    });

    // 2. Initialize database asynchronously
    console.log('Initializing database in SOLID architecture...');
    initDB().catch(err => {
        console.error('Database initialization warning:', err.message);
    });

    return server;
}

if (require.main === module) {
    startServer();
}

module.exports = {
    app,
    startServer,
    initDB,
    getPool
};

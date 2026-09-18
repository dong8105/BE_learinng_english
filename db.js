/**
 * Modular Database Access (SOLID Facade)
 * Re-exports connection pool and initDB from src/db/connection
 */
const { initDB, getPool } = require('./src/db/connection');

module.exports = {
    initDB,
    getPool
};

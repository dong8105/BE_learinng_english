require('dotenv').config();

const isRemoteDb = Boolean(
    process.env.DB_HOST &&
    process.env.DB_HOST !== 'localhost' &&
    process.env.DB_HOST !== '127.0.0.1'
);

const sslConfig = isRemoteDb
    ? {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: false
    }
    : false;

module.exports = {
    PORT: process.env.PORT || 5000,
    db: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '123456',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        database: process.env.DB_NAME || 'server_learning_english',
        ssl: sslConfig,
        connectionLimit: 10,
        waitForConnections: true,
        queueLimit: 0
    }
};

const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const errorHandler = require('./middlewares/errorHandler');

const cookieParser = require('./middlewares/cookieParser');
const securityHeaders = require('./middlewares/securityHeaders');

const app = express();

app.use(securityHeaders);
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl) or any localhost/domain origin
        callback(null, origin || true);
    },
    credentials: true
}));
app.use(cookieParser);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Mount all API routes under /api
app.use('/api', apiRoutes);

// Centralized error handling
app.use(errorHandler);

module.exports = app;

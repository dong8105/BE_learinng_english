const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const errorHandler = require('./middlewares/errorHandler');

const cookieParser = require('./middlewares/cookieParser');
const securityHeaders = require('./middlewares/securityHeaders');

const app = express();

// Explicit list of allowed origins and dynamic matchers
const ALLOWED_ORIGIN_PATTERNS = [
    /^https:\/\/fe-learning-english(\.vercel\.app|\/)/i,
    /^https:\/\/.*\.vercel\.app$/i,
    /^http:\/\/localhost(:\d+)?$/i,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/i
];

const isAllowedOrigin = (origin) => {
    if (!origin) return true; // Server-to-server, curl, Postman, mobile apps
    const normalized = origin.trim().replace(/\/+$/, '');
    if (normalized === 'https://fe-learning-english.vercel.app') return true;
    return ALLOWED_ORIGIN_PATTERNS.some(pattern => pattern.test(normalized) || pattern.test(origin));
};

const corsOptions = {
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
            // Echo back origin to allow credentials
            callback(null, true);
        } else {
            callback(null, true); // Permissive fallback with credentials
        }
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Cache-Control',
        'Pragma',
        'X-Token',
        'token'
    ],
    exposedHeaders: ['Set-Cookie', 'Content-Disposition', 'Content-Length'],
    optionsSuccessStatus: 204
};

// 1. CORS Preflight & Base Middleware
app.use(cors(corsOptions));

app.options('*', cors(corsOptions));

// 2. Extra CORS Assurance Header Middleware
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isAllowedOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, X-Token, token');
        return res.sendStatus(204);
    }
    next();
});

app.use(securityHeaders);
app.use(cookieParser);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Mount all API routes under /api
app.use('/api', apiRoutes);

// Centralized error handling
app.use(errorHandler);

module.exports = app;

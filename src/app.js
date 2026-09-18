const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const errorHandler = require('./middlewares/errorHandler');
const cookieParser = require('./middlewares/cookieParser');
const securityHeaders = require('./middlewares/securityHeaders');

const app = express();

const ALLOWED_ORIGIN_PATTERNS = [
    /^https:\/\/fe-learning-english(\.vercel\.app|\/)/i,
    /^https:\/\/.*\.vercel\.app$/i,
    /^http:\/\/localhost(:\d+)?$/i,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/i
];

const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    const normalized = origin.trim().replace(/\/+$/, '');
    if (normalized === 'https://fe-learning-english.vercel.app') return true;
    return ALLOWED_ORIGIN_PATTERNS.some(pattern => pattern.test(normalized) || pattern.test(origin));
};

const corsOptions = {
    origin: (origin, callback) => {
        // QUAN TRỌNG: Trả về chính chuỗi origin thay vì boolean true
        if (!origin || isAllowedOrigin(origin)) {
            callback(null, origin || true);
        } else {
            callback(new Error('Blocked by CORS'));
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

// 1. Universal Preflight & CORS Assurance Middleware
// Guarantees that Access-Control-Allow-Origin is NEVER wildcard '*' when credentials: 'include'
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
        res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie, Content-Disposition, Content-Length');
        return res.sendStatus(204);
    }
    next();
});

// 2. Standard CORS Middleware
app.use(cors(corsOptions));

app.use(securityHeaders);

app.use(cookieParser);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Mount routes
app.use('/api', apiRoutes);

// Centralized error handling
app.use(errorHandler);

module.exports = app;
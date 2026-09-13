const crypto = require('crypto');

// Secret for HMAC tokens (reads from process.env or falls back to stable secret)
const JWT_SECRET = process.env.JWT_SECRET || 'engmaster_secure_hmac_secret_2026_!@#$';

/**
 * Hash password with scrypt and a random 16-byte salt
 * Format: salt:hexHash
 */
function hashPassword(password) {
    if (!password || typeof password !== 'string') {
        throw new Error('Mật khẩu không hợp lệ');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

/**
 * Verify password against stored password
 * Supports both legacy plain text and scrypt hashed passwords
 * Uses timingSafeEqual to protect against timing attacks
 */
function verifyPassword(password, storedPassword) {
    if (!password || !storedPassword) return { valid: false, needsUpgrade: false };

    // If password contains salt (salt:hash)
    if (storedPassword.includes(':')) {
        const [salt, originalHash] = storedPassword.split(':');
        if (!salt || !originalHash) return { valid: false, needsUpgrade: false };

        const testHash = crypto.scryptSync(password, salt, 64).toString('hex');
        try {
            const bufA = Buffer.from(testHash, 'hex');
            const bufB = Buffer.from(originalHash, 'hex');
            if (bufA.length !== bufB.length) return { valid: false, needsUpgrade: false };
            const valid = crypto.timingSafeEqual(bufA, bufB);
            return { valid, needsUpgrade: false };
        } catch {
            return { valid: false, needsUpgrade: false };
        }
    }

    // Legacy plain-text check with auto-upgrade flag
    if (password === storedPassword) {
        return { valid: true, needsUpgrade: true };
    }

    return { valid: false, needsUpgrade: false };
}

/**
 * Generate a signed HMAC-SHA256 Token
 * Payload: { id, username, role, iat, exp }
 */
function generateSignedToken(user, expiresInMs = 7 * 24 * 60 * 60 * 1000) { // 7 days default
    const now = Date.now();
    const payload = {
        id: user.id,
        username: user.username,
        role: user.role,
        iat: now,
        exp: now + expiresInMs
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(payloadB64).digest('base64url');
    return `${payloadB64}.${signature}`;
}

/**
 * Verify signed HMAC-SHA256 Token
 * Returns payload or null if invalid/expired
 */
function verifySignedToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadB64, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(payloadB64).digest('base64url');

    try {
        const bufA = Buffer.from(signature);
        const bufB = Buffer.from(expectedSig);
        if (bufA.length !== bufB.length) return null;
        if (!crypto.timingSafeEqual(bufA, bufB)) return null;

        const jsonStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
        const payload = JSON.parse(jsonStr);

        if (payload.exp && Date.now() > payload.exp) {
            return null; // Expired
        }

        return payload;
    } catch {
        return null;
    }
}

/**
 * In-Memory Sliding-Window Rate Limiters
 */
const loginAttempts = new Map(); // key: ip_or_username -> { count: number, firstAttempt: number, lockedUntil: number }
const registerAttempts = new Map(); // key: ip -> { count: number, firstAttempt: number }

// Cleanup old memory entries every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of loginAttempts.entries()) {
        if (val.lockedUntil && now > val.lockedUntil) loginAttempts.delete(key);
        else if (now - val.firstAttempt > 15 * 60 * 1000) loginAttempts.delete(key);
    }
    for (const [key, val] of registerAttempts.entries()) {
        if (now - val.firstAttempt > 10 * 60 * 1000) registerAttempts.delete(key);
    }
}, 10 * 60 * 1000);

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';
}

function checkLoginRateLimit(req) {
    const ip = getClientIp(req);
    const username = (req.body?.username || '').trim().toLowerCase();
    const key = `${ip}_${username}`;
    const now = Date.now();

    const record = loginAttempts.get(key);
    if (!record) return { allowed: true };

    if (record.lockedUntil && now < record.lockedUntil) {
        const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
        return {
            allowed: false,
            message: `Tài khoản hoặc IP đã bị tạm khóa do nhập sai mật khẩu quá 5 lần. Vui lòng thử lại sau ${remainingMinutes} phút.`
        };
    }

    return { allowed: true };
}

function recordLoginFailure(req) {
    const ip = getClientIp(req);
    const username = (req.body?.username || '').trim().toLowerCase();
    const key = `${ip}_${username}`;
    const now = Date.now();

    let record = loginAttempts.get(key);
    if (!record || (now - record.firstAttempt > 15 * 60 * 1000)) {
        record = { count: 1, firstAttempt: now, lockedUntil: 0 };
    } else {
        record.count += 1;
    }

    // Lock if 5 failed attempts
    if (record.count >= 5) {
        record.lockedUntil = now + 15 * 60 * 1000; // Lock for 15 minutes
    }

    loginAttempts.set(key, record);
}

function recordLoginSuccess(req) {
    const ip = getClientIp(req);
    const username = (req.body?.username || '').trim().toLowerCase();
    loginAttempts.delete(`${ip}_${username}`);
}

function checkRegisterRateLimit(req) {
    const ip = getClientIp(req);
    const now = Date.now();

    let record = registerAttempts.get(ip);
    if (!record || (now - record.firstAttempt > 10 * 60 * 1000)) {
        record = { count: 1, firstAttempt: now };
        registerAttempts.set(ip, record);
        return { allowed: true };
    }

    if (record.count >= 3) {
        return {
            allowed: false,
            message: 'Bạn đã đăng ký quá 3 tài khoản trong 10 phút. Vui lòng chờ trước khi tiếp tục tạo thêm.'
        };
    }

    record.count += 1;
    registerAttempts.set(ip, record);
    return { allowed: true };
}

/**
 * Strict Input Sanitization
 */
const RESERVED_USERNAMES = new Set([
    'admin', 'administrator', 'root', 'system', 'superuser', 'support', 
    'help', 'null', 'undefined', 'anonymous', 'moderator'
]);

function validateUsername(username, isNewRegistration = true) {
    if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Tên đăng nhập không được để trống' };
    }
    const trimmed = username.trim();
    if (trimmed.length < 3 || trimmed.length > 30) {
        return { valid: false, error: 'Tên đăng nhập phải từ 3 đến 30 ký tự' };
    }
    // Only alphanumeric and underscores allowed
    const validRegex = /^[a-zA-Z0-9_]+$/;
    if (!validRegex.test(trimmed)) {
        return { valid: false, error: 'Tên đăng nhập chỉ được chứa chữ cái, chữ số và dấu gạch dưới (_)' };
    }

    if (isNewRegistration && RESERVED_USERNAMES.has(trimmed.toLowerCase())) {
        return { valid: false, error: 'Tên đăng nhập này thuộc danh sách bảo lưu hệ thống, vui lòng chọn tên khác' };
    }

    return { valid: true, sanitized: trimmed };
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Mật khẩu không được để trống' };
    }
    if (password.length < 6) {
        return { valid: false, error: 'Mật khẩu phải có độ dài tối thiểu 6 ký tự' };
    }
    if (password.length > 100) {
        return { valid: false, error: 'Mật khẩu quá dài (tối đa 100 ký tự)' };
    }
    return { valid: true };
}

function sanitizeName(name, defaultName = 'User') {
    if (!name || typeof name !== 'string') return defaultName;
    // Strip HTML tags and control chars
    const cleaned = name.replace(/<[^>]*>?/gm, '').trim();
    return cleaned.slice(0, 50) || defaultName;
}

module.exports = {
    hashPassword,
    verifyPassword,
    generateSignedToken,
    verifySignedToken,
    checkLoginRateLimit,
    recordLoginFailure,
    recordLoginSuccess,
    checkRegisterRateLimit,
    validateUsername,
    validatePassword,
    sanitizeName
};

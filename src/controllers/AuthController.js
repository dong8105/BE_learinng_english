const authService = require('../services/AuthService');
const {
    checkLoginRateLimit,
    recordLoginFailure,
    recordLoginSuccess,
    checkRegisterRateLimit,
    recordRegisterAttempt
} = require('../../security');

const COOKIE_NAME = 'token';
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
};

class AuthController {
    async login(req, res, next) {
        try {
            const rateLimit = checkLoginRateLimit(req);
            if (!rateLimit.allowed) {
                return res.status(429).json({ error: rateLimit.message });
            }

            const { username, password } = req.body;
            try {
                const result = await authService.login(username, password);
                recordLoginSuccess(req);
                if (result.token) {
                    res.cookie(COOKIE_NAME, result.token, COOKIE_OPTIONS);
                }
                return res.json({ success: true, ...result });
            } catch (authErr) {
                recordLoginFailure(req);
                return res.status(authErr.status || 401).json({ error: authErr.message });
            }
        } catch (err) {
            next(err);
        }
    }

    async register(req, res, next) {
        try {
            const rateLimit = checkRegisterRateLimit(req);
            if (!rateLimit.allowed) {
                return res.status(429).json({ error: rateLimit.message });
            }

            const { username, password, name } = req.body;
            try {
                const result = await authService.register({ username, password, name });
                recordRegisterAttempt(req);
                if (result.token) {
                    res.cookie(COOKIE_NAME, result.token, COOKIE_OPTIONS);
                }
                return res.json({ success: true, ...result });
            } catch (regErr) {
                return res.status(regErr.status || 400).json({ error: regErr.message });
            }
        } catch (err) {
            next(err);
        }
    }

    async logout(req, res, next) {
        try {
            res.clearCookie(COOKIE_NAME, {
                httpOnly: true,
                sameSite: 'lax',
                path: '/'
            });
            return res.json({ success: true, message: 'Đăng xuất thành công' });
        } catch (err) {
            next(err);
        }
    }

    async getMe(req, res, next) {
        try {
            return res.json({ success: true, user: req.user });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AuthController();

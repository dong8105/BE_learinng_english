const { verifySignedToken } = require('../../security');

const authenticateUser = (req, res, next) => {
    // 1. Check HttpOnly cookie first
    let token = req.cookies?.token;

    // 2. Fallback to Authorization: Bearer <token>
    if (!token) {
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
    }

    // 3. Fallback to query parameter (dành cho EventSource / SSE kết nối trực tiếp)
    if (!token && req.query?.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Yêu cầu đăng nhập để tiếp tục' });
    }

    const decoded = verifySignedToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.' });
    }
    req.user = decoded;
    next();
};

const requireAdmin = (req, res, next) => {
    authenticateUser(req, res, () => {
        if (req.user && req.user.role === 'admin') {
            return next();
        }
        return res.status(403).json({ error: 'Truy cập bị từ chối: Yêu cầu quyền Quản trị viên (Admin)' });
    });
};

module.exports = {
    authenticateUser,
    requireAdmin
};

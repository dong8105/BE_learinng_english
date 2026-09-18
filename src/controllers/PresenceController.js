/**
 * PresenceController.js
 * Điều hướng các yêu cầu Heartbeat và Luồng phát trực tiếp (SSE) Presence
 */

const presenceService = require('../services/PresenceService');
const { verifySignedToken } = require('../../security');

class PresenceController {
    /**
     * Nhận heartbeat từ client
     * POST /api/presence/heartbeat
     */
    heartbeat(req, res) {
        try {
            const { sessionId, currentTab } = req.body || {};
            const authHeader = req.headers['authorization'];
            let user = null;

            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                user = verifySignedToken(token);
            }

            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
            const userAgent = req.headers['user-agent'] || 'Unknown Device';

            const session = presenceService.recordHeartbeat({
                sessionId,
                userId: user ? user.id : null,
                username: user ? (user.username || user.name) : null,
                name: user ? user.name : null,
                role: user ? user.role : 'guest',
                currentTab: currentTab || 'home',
                ip,
                userAgent
            });

            res.json({
                success: true,
                sessionId: session.sessionId,
                isOnline: true,
                timestamp: Date.now()
            });
        } catch (err) {
            console.error('Error handling presence heartbeat:', err);
            res.status(500).json({ error: 'Lỗi ghi nhận trạng thái hoạt động' });
        }
    }

    /**
     * Lấy thống kê và danh sách người dùng đang online (dành cho polling fallback)
     * GET /api/admin/presence/online-users
     */
    getOnlineUsers(req, res) {
        try {
            const stats = presenceService.getOnlineStats();
            res.json({
                success: true,
                ...stats
            });
        } catch (err) {
            console.error('Error fetching online users:', err);
            res.status(500).json({ error: 'Không thể lấy dữ liệu người dùng đang online' });
        }
    }

    /**
     * Mở luồng Server-Sent Events (SSE) phát trực tiếp thay đổi người dùng online
     * GET /api/admin/presence/stream
     */
    streamOnlineUsers(req, res) {
        try {
            // Thiết lập headers cho SSE
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no' // Chống buffering trên Nginx / proxies
            });

            if (typeof res.flushHeaders === 'function') {
                res.flushHeaders();
            }

            // Gửi một comment để khởi động kết nối SSE
            res.write(': connected to presence stream\n\n');

            // Đăng ký subscriber vào PresenceService
            presenceService.addSubscriber(res);

            // Gửi ping giữ kết nối mỗi 20 giây
            const keepAliveTimer = setInterval(() => {
                try {
                    res.write(': keepalive\n\n');
                } catch {
                    clearInterval(keepAliveTimer);
                }
            }, 20000);

            req.on('close', () => {
                clearInterval(keepAliveTimer);
            });
        } catch (err) {
            console.error('Error establishing SSE stream:', err);
            res.status(500).end();
        }
    }
}

module.exports = new PresenceController();

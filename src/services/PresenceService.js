/**
 * PresenceService.js
 * Quản lý trạng thái hiện diện (Presence) thời gian thực của người dùng
 * Hỗ trợ lưu trữ in-memory, timeout phiên (TTL), thống kê và luồng SSE
 */

class PresenceService {
    constructor() {
        this.sessions = new Map();
        this.subscribers = new Set();
        this.SESSION_TIMEOUT_MS = 45000; // 45 giây không ping => coi như đã offline
        
        // Định kỳ 5 giây dọn dẹp các session đã hết hạn và cập nhật SSE subscribers
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredSessions();
        }, 5000);
    }

    /**
     * Ghi nhận hoặc gia hạn heartbeat từ client
     */
    recordHeartbeat({ sessionId, userId, username, name, role, currentTab, ip, userAgent }) {
        if (!sessionId) {
            sessionId = `sess_${userId || 'anon'}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        }

        const now = Date.now();
        const existing = this.sessions.get(sessionId);

        const sessionData = {
            sessionId,
            userId: userId || null,
            username: username || (userId ? 'Học viên' : 'Khách vãng lai'),
            name: name || username || 'Khách vãng lai',
            role: role || (userId ? 'user' : 'guest'),
            currentTab: currentTab || 'home',
            ip: ip || '127.0.0.1',
            userAgent: userAgent || 'Unknown Browser',
            firstSeen: existing ? existing.firstSeen : now,
            lastPing: now,
            isOnline: true
        };

        this.sessions.set(sessionId, sessionData);

        // Phát tín hiệu cập nhật tức thì nếu là session mới hoặc vừa đổi tab
        if (!existing || existing.currentTab !== currentTab) {
            this.broadcastPresence();
        }

        return sessionData;
    }

    /**
     * Dọn dẹp các session không còn ping trong vòng SESSION_TIMEOUT_MS
     */
    cleanupExpiredSessions() {
        const now = Date.now();
        let changed = false;

        for (const [sessionId, session] of this.sessions.entries()) {
            if (now - session.lastPing > this.SESSION_TIMEOUT_MS) {
                this.sessions.delete(sessionId);
                changed = true;
            }
        }

        if (changed) {
            this.broadcastPresence();
        }
    }

    /**
     * Lấy danh sách toàn bộ người dùng đang online hợp lệ
     */
    getOnlineUsers() {
        const now = Date.now();
        const activeUsers = [];

        for (const session of this.sessions.values()) {
            if (now - session.lastPing <= this.SESSION_TIMEOUT_MS) {
                activeUsers.push({
                    sessionId: session.sessionId,
                    userId: session.userId,
                    username: session.username,
                    name: session.name,
                    role: session.role,
                    currentTab: session.currentTab,
                    firstSeen: session.firstSeen,
                    lastPing: session.lastPing,
                    idleSeconds: Math.round((now - session.lastPing) / 1000)
                });
            }
        }

        // Sắp xếp người dùng hoạt động gần nhất lên đầu
        activeUsers.sort((a, b) => b.lastPing - a.lastPing);
        return activeUsers;
    }

    /**
     * Thống kê tóm tắt tình trạng online
     */
    getOnlineStats() {
        const users = this.getOnlineUsers();
        let learnersCount = 0;
        let adminsCount = 0;
        let guestsCount = 0;

        const tabDistribution = {};

        for (const u of users) {
            if (u.role === 'admin') adminsCount++;
            else if (u.role === 'guest') guestsCount++;
            else learnersCount++;

            const tab = u.currentTab || 'home';
            tabDistribution[tab] = (tabDistribution[tab] || 0) + 1;
        }

        return {
            totalOnline: users.length,
            learnersCount,
            adminsCount,
            guestsCount,
            tabDistribution,
            timestamp: new Date().toISOString(),
            users
        };
    }

    /**
     * Đăng ký một kết nối SSE mới từ Admin
     */
    addSubscriber(res) {
        this.subscribers.add(res);

        // Gửi snapshot ban đầu ngay lập tức
        const snapshot = this.getOnlineStats();
        res.write(`data: ${JSON.stringify({ type: 'snapshot', ...snapshot })}\n\n`);

        // Xử lý khi kết nối bị đóng
        res.on('close', () => {
            this.subscribers.delete(res);
        });
    }

    /**
     * Gửi broadcast dữ liệu presence đến tất cả Admin đang xem stream
     */
    broadcastPresence() {
        if (this.subscribers.size === 0) return;

        const stats = this.getOnlineStats();
        const payload = `data: ${JSON.stringify({ type: 'update', ...stats })}\n\n`;

        for (const res of this.subscribers) {
            try {
                res.write(payload);
            } catch (err) {
                console.error('Error broadcasting to SSE subscriber:', err);
                this.subscribers.delete(res);
            }
        }
    }
}

module.exports = new PresenceService();

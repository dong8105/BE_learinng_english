const express = require('express');
const router = express.Router();
const presenceController = require('../controllers/PresenceController');
const { requireAdmin } = require('../middlewares/authMiddleware');

// 1. Client heartbeat (Public - khách vãng lai hoặc học viên đều ping được)
router.post('/presence/heartbeat', (req, res) => presenceController.heartbeat(req, res));

// 2. Admin lấy danh sách & thống kê người dùng đang online (Polling fallback)
router.get('/admin/presence/online-users', requireAdmin, (req, res) => presenceController.getOnlineUsers(req, res));

// 3. Admin mở luồng phát trực tiếp Server-Sent Events (SSE)
router.get('/admin/presence/stream', requireAdmin, (req, res) => presenceController.streamOnlineUsers(req, res));

module.exports = router;

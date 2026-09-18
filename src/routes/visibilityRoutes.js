const express = require('express');
const router = express.Router();
const visibilityController = require('../controllers/VisibilityController');
const { requireAdmin } = require('../middlewares/authMiddleware');

// Public / Authenticated user fetch settings
router.get('/settings/visibility', (req, res, next) => visibilityController.getSettings(req, res, next));
// Admin update global settings
router.post('/settings/visibility', requireAdmin, (req, res, next) => visibilityController.updateSettings(req, res, next));

// Admin custom users list
router.get('/admin/visibility/custom-users', requireAdmin, (req, res, next) => visibilityController.getCustomUsers(req, res, next));

// Admin per-user visibility overrides
router.get('/admin/users/:id/visibility', requireAdmin, (req, res, next) => visibilityController.getUserVisibility(req, res, next));
router.post('/admin/users/:id/visibility', requireAdmin, (req, res, next) => visibilityController.saveUserVisibility(req, res, next));
router.delete('/admin/users/:id/visibility', requireAdmin, (req, res, next) => visibilityController.deleteUserVisibility(req, res, next));

module.exports = router;

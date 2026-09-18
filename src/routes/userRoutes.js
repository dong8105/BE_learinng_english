const express = require('express');
const router = express.Router();
const userController = require('../controllers/UserController');
const { requireAdmin } = require('../middlewares/authMiddleware');

router.get('/metrics', requireAdmin, (req, res, next) => userController.getMetrics(req, res, next));
router.get('/users', requireAdmin, (req, res, next) => userController.getAllUsers(req, res, next));
router.post('/users', requireAdmin, (req, res, next) => userController.createUser(req, res, next));
router.put('/users/:id/streak', requireAdmin, (req, res, next) => userController.updateStreak(req, res, next));
router.delete('/users/:id', requireAdmin, (req, res, next) => userController.deleteUser(req, res, next));

module.exports = router;

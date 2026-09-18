const express = require('express');
const router = express.Router();
const authController = require('../controllers/AuthController');
const { authenticateUser } = require('../middlewares/authMiddleware');

router.post('/login', (req, res, next) => authController.login(req, res, next));
router.post('/register', (req, res, next) => authController.register(req, res, next));
router.post('/logout', (req, res, next) => authController.logout(req, res, next));
router.get('/me', authenticateUser, (req, res, next) => authController.getMe(req, res, next));

module.exports = router;

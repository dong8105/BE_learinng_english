const express = require('express');
const router = express.Router();
const aiController = require('../controllers/AiController');
const { authenticateUser } = require('../middlewares/authMiddleware');

// Protected AI routes: only authenticated users with valid access tokens can call AI endpoints
router.post('/generate', authenticateUser, (req, res, next) => aiController.generate(req, res, next));
router.post('/audio', authenticateUser, (req, res, next) => aiController.audio(req, res, next));

module.exports = router;

const express = require('express');
const router = express.Router();
const progressController = require('../controllers/ProgressController');
const { authenticateUser } = require('../middlewares/authMiddleware');

router.get('/:type', authenticateUser, (req, res, next) => progressController.getProgress(req, res, next));
router.post('/:type', authenticateUser, (req, res, next) => progressController.saveProgress(req, res, next));

module.exports = router;

const express = require('express');
const router = express.Router();
const wordController = require('../controllers/WordController');
const { authenticateUser, requireAdmin } = require('../middlewares/authMiddleware');

// Public read routes
router.get('/search', (req, res, next) => wordController.search(req, res, next));
router.get('/', (req, res, next) => wordController.getAll(req, res, next));

// Protected write routes controlled by access token
router.post('/', authenticateUser, (req, res, next) => wordController.save(req, res, next));
router.put('/:id/helpers', authenticateUser, (req, res, next) => wordController.updateHelpers(req, res, next));
router.delete('/:id', requireAdmin, (req, res, next) => wordController.delete(req, res, next));

module.exports = router;

const express = require('express');
const router = express.Router();
const healthController = require('../controllers/HealthController');

router.get('/health', (req, res) => healthController.check(req, res));

module.exports = router;

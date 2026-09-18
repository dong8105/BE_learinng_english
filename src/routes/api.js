const express = require('express');
const router = express.Router();

const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const wordRoutes = require('./wordRoutes');
const progressRoutes = require('./progressRoutes');
const userRoutes = require('./userRoutes');
const visibilityRoutes = require('./visibilityRoutes');
const aiRoutes = require('./aiRoutes');
const presenceRoutes = require('./presenceRoutes');

// Mount modular sub-routers
router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/words', wordRoutes);
router.use('/progress', progressRoutes);
router.use('/admin', userRoutes);
router.use('/', visibilityRoutes);
router.use('/ai', aiRoutes);
router.use('/', presenceRoutes);

module.exports = router;

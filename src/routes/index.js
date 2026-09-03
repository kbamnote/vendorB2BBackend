'use strict';

const express = require('express');

const router = express.Router();

router.get('/health', (_req, res) =>
  res.json({ success: true, message: 'API is healthy', data: { uptime: process.uptime() } })
);

router.use('/auth', require('./auth.routes'));
router.use('/vendors', require('./vendor.routes'));
router.use('/products', require('./product.routes'));
router.use('/users', require('./user.routes'));
router.use('/my', require('./my.routes'));
router.use('/dashboard', require('./dashboard.routes'));

module.exports = router;

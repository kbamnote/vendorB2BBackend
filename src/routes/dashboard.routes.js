'use strict';

const express = require('express');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/dashboard.controller');

const router = express.Router();

router.get('/summary', protect, ctrl.summary);

module.exports = router;

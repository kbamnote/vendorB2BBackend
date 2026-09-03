'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');
const {
  loginRules,
  updateProfileRules,
  changePasswordRules,
} = require('../validators/auth.validators');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many sign-in attempts. Please try again later.' },
});

router.post('/login', loginLimiter, validate(loginRules), ctrl.login);

router.get('/me', protect, ctrl.me);
router.patch('/profile', protect, validate(updateProfileRules), ctrl.updateProfile);
router.patch('/change-password', protect, validate(changePasswordRules), ctrl.changePassword);

module.exports = router;

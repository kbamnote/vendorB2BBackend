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

/**
 * Sign-in throttling, keyed on the account rather than the caller's IP.
 *
 * The app sits behind two proxies in production (a Vercel rewrite in front of
 * Railway), so `req.ip` is derived from an X-Forwarded-For chain the client can
 * prepend to. Keying on IP there is worthless: a spoofed header moves the
 * attacker to a fresh bucket, and the honest edge address shifts between
 * requests anyway. Keying on the submitted email protects the thing that
 * actually matters - a single account cannot be brute forced - and cannot be
 * bypassed, because the attacker has to keep sending the email they are
 * attacking. The global limiter in app.js still covers volume per IP.
 */
const loginLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    return email ? `email:${email}` : `ip:${req.ip}`;
  },
  // A successful sign-in should not count against the account.
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many sign-in attempts. Please try again later.' },
});

router.post('/login', loginLimiter, validate(loginRules), ctrl.login);

router.get('/me', protect, ctrl.me);
router.patch('/profile', protect, validate(updateProfileRules), ctrl.updateProfile);
router.patch('/change-password', protect, validate(changePasswordRules), ctrl.changePassword);

module.exports = router;

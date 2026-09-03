'use strict';

const { body } = require('express-validator');

const strongPassword = (field = 'password') =>
  body(field)
    .isString()
    .isLength({ min: 8, max: 72 })
    .withMessage('Password must be 8-72 characters')
    .matches(/[A-Za-z]/)
    .withMessage('Password must contain at least one letter')
    .matches(/\d/)
    .withMessage('Password must contain at least one number');

const loginRules = [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isString().notEmpty().withMessage('Password is required'),
];

const updateProfileRules = [
  body('name').optional().isString().trim().isLength({ min: 2, max: 100 }),
  body('phone').optional().isString().trim().isLength({ max: 20 }),
  body('designation').optional().isString().trim().isLength({ max: 80 }),
];

const changePasswordRules = [
  body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
  strongPassword('newPassword'),
];

module.exports = { loginRules, updateProfileRules, changePasswordRules, strongPassword };

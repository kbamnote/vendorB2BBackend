'use strict';

const { body } = require('express-validator');
const { ROLES } = require('../config/roles');
const { strongPassword } = require('./auth.validators');

const createUserRules = [
  body('name').isString().trim().isLength({ min: 2, max: 100 }).withMessage('Name is required'),
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  strongPassword('password'),
  body('role')
    .isIn([ROLES.VENDOR_ADMIN, ROLES.VENDOR_STAFF])
    .withMessage('Role must be vendor_admin or vendor_staff'),
  body('vendor').optional().isMongoId().withMessage('vendor must be a valid id'),
  body('vendorId').optional().isMongoId().withMessage('vendorId must be a valid id'),
  body('phone').optional({ values: 'falsy' }).isString().trim().isLength({ max: 20 }),
  body('designation').optional({ values: 'falsy' }).isString().trim().isLength({ max: 80 }),
];

const updateUserRules = [
  body('name').optional().isString().trim().isLength({ min: 2, max: 100 }),
  body('email').optional().isEmail().withMessage('Enter a valid email').normalizeEmail(),
  body('phone').optional({ values: 'falsy' }).isString().trim().isLength({ max: 20 }),
  body('designation').optional({ values: 'falsy' }).isString().trim().isLength({ max: 80 }),
];

const resetPasswordRules = [strongPassword('password')];

module.exports = { createUserRules, updateUserRules, resetPasswordRules };

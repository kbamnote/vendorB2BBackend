'use strict';

const { body } = require('express-validator');
const { ROLES } = require('../config/roles');
const { strongPassword } = require('./auth.validators');
const { STAFF_LEVEL_MIN, STAFF_LEVEL_MAX } = require('../config/approvals');

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
  body('approvalLevel')
    .optional()
    .isInt({ min: STAFF_LEVEL_MIN, max: STAFF_LEVEL_MAX })
    .withMessage(`Approval level must be between ${STAFF_LEVEL_MIN} and ${STAFF_LEVEL_MAX}`),
];

const updateUserRules = [
  body('name').optional().isString().trim().isLength({ min: 2, max: 100 }),
  body('email').optional().isEmail().withMessage('Enter a valid email').normalizeEmail(),
  body('phone').optional({ values: 'falsy' }).isString().trim().isLength({ max: 20 }),
  body('designation').optional({ values: 'falsy' }).isString().trim().isLength({ max: 80 }),
  body('approvalLevel')
    .optional()
    .isInt({ min: STAFF_LEVEL_MIN, max: STAFF_LEVEL_MAX })
    .withMessage(`Approval level must be between ${STAFF_LEVEL_MIN} and ${STAFF_LEVEL_MAX}`),
];

const resetPasswordRules = [strongPassword('password')];

module.exports = { createUserRules, updateUserRules, resetPasswordRules };

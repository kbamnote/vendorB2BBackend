'use strict';

const { body } = require('express-validator');

// Each rule set builds its own chains: express-validator chains are mutable,
// so reusing one array and calling .optional() on it would also mutate the other.
const nameRule = () => body('name').isString().trim().isLength({ min: 2, max: 120 });
const codeRule = () =>
  body('code')
    .isString()
    .trim()
    .isLength({ min: 2, max: 20 })
    .withMessage('Vendor code must be 2-20 characters')
    .matches(/^[A-Za-z0-9_-]+$/)
    .withMessage('Vendor code may only contain letters, numbers, - and _');

const optionalDetailRules = () => [
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Enter a valid email'),
  body('phone').optional({ values: 'falsy' }).isString().trim().isLength({ max: 20 }),
  body('gstNumber').optional({ values: 'falsy' }).isString().trim().isLength({ max: 20 }),
  body('contactPerson').optional({ values: 'falsy' }).isString().trim().isLength({ max: 100 }),
  body('notes').optional({ values: 'falsy' }).isString().trim().isLength({ max: 1000 }),
  body('address').optional().isObject().withMessage('address must be an object'),
  body('address.line1').optional({ values: 'falsy' }).isString().trim().isLength({ max: 200 }),
  body('address.city').optional({ values: 'falsy' }).isString().trim().isLength({ max: 80 }),
  body('address.state').optional({ values: 'falsy' }).isString().trim().isLength({ max: 80 }),
  body('address.country').optional({ values: 'falsy' }).isString().trim().isLength({ max: 80 }),
  body('address.pincode').optional({ values: 'falsy' }).isString().trim().isLength({ max: 12 }),
];

const createVendorRules = [
  nameRule().withMessage('Vendor name is required'),
  codeRule(),
  ...optionalDetailRules(),
];

const updateVendorRules = [
  nameRule().optional().withMessage('Vendor name must be 2-120 characters'),
  codeRule().optional(),
  ...optionalDetailRules(),
];

const statusRules = [body('isActive').isBoolean().withMessage('isActive must be true or false')];

module.exports = { createVendorRules, updateVendorRules, statusRules };

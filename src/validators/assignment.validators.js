'use strict';

const { body } = require('express-validator');

const bulkAssignRules = [
  body('productIds')
    .isArray({ min: 1 })
    .withMessage('productIds must be a non-empty array'),
  body('productIds.*').isMongoId().withMessage('Each product id must be valid'),
];

const updateAssignmentRules = [
  body('vendorPrice')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('vendorPrice must be 0 or more'),
  body('minOrderQty').optional().isInt({ min: 0 }).withMessage('minOrderQty must be 0 or more'),
  body('isActive').optional().isBoolean().withMessage('isActive must be true or false'),
];

module.exports = { bulkAssignRules, updateAssignmentRules };

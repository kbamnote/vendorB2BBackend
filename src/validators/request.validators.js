'use strict';

const { body } = require('express-validator');
const { STATUS_VALUES } = require('../models/PurchaseRequest');

const createRequestRules = [
  body('items').isArray({ min: 1 }).withMessage('Add at least one product to the request'),
  body('items.*.product').isMongoId().withMessage('Each line must reference a valid product'),
  body('items.*.quantity')
    .isInt({ min: 1, max: 1000000 })
    .withMessage('Quantity must be a whole number of at least 1'),
  body('notes').optional({ values: 'falsy' }).isString().trim().isLength({ max: 2000 }),
  body('expectedDeliveryDate')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('Expected delivery date must be a valid date'),
];

const quoteRules = [
  body('items').isArray({ min: 1 }).withMessage('A quotation needs at least one priced line'),
  body('items.*.product').isMongoId().withMessage('Each line must reference a valid product'),
  body('items.*.unitPrice').isFloat({ min: 0 }).withMessage('Unit price must be 0 or more'),
  body('items.*.taxPercent').optional().isFloat({ min: 0, max: 100 }),
  body('validUntil').optional({ values: 'falsy' }).isISO8601().withMessage('Enter a valid date'),
  body('notes').optional({ values: 'falsy' }).isString().trim().isLength({ max: 2000 }),
  body('currency').optional({ values: 'falsy' }).isString().trim().isLength({ min: 3, max: 3 }),
];

const statusRules = [
  body('status')
    .isIn(STATUS_VALUES)
    .withMessage(`Status must be one of: ${STATUS_VALUES.join(', ')}`),
  body('note').optional({ values: 'falsy' }).isString().trim().isLength({ max: 1000 }),
];

const approvalNoteRules = [
  body('note').optional({ values: 'falsy' }).isString().trim().isLength({ max: 1000 }),
];

const editItemsRules = [
  body('items').isArray({ min: 1 }).withMessage('Keep at least one product'),
  body('items.*.product').isMongoId().withMessage('Each line must reference a valid product'),
  body('items.*.quantity')
    .isInt({ min: 1, max: 1000000 })
    .withMessage('Quantity must be a whole number of at least 1'),
  ...approvalNoteRules,
];

module.exports = {
  createRequestRules,
  quoteRules,
  statusRules,
  approvalNoteRules,
  editItemsRules,
};

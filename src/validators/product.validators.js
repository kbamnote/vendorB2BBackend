'use strict';

const { body } = require('express-validator');

const nameRule = () => body('name').isString().trim().isLength({ min: 2, max: 150 });
const skuRule = () =>
  body('sku')
    .isString()
    .trim()
    .isLength({ min: 2, max: 40 })
    .withMessage('SKU must be 2-40 characters')
    .matches(/^[A-Za-z0-9_-]+$/)
    .withMessage('SKU may only contain letters, numbers, - and _');
const priceRule = () => body('basePrice').isFloat({ min: 0 }).withMessage('Base price must be 0 or more');

const optionalDetailRules = () => [
  body('category').optional({ values: 'falsy' }).isString().trim().isLength({ max: 60 }),
  body('description').optional({ values: 'falsy' }).isString().trim().isLength({ max: 2000 }),
  body('unit').optional({ values: 'falsy' }).isString().trim().isLength({ max: 20 }),
  body('currency').optional({ values: 'falsy' }).isString().trim().isLength({ min: 3, max: 3 }),
  body('hsnCode').optional({ values: 'falsy' }).isString().trim().isLength({ max: 20 }),
  body('taxPercent').optional({ values: 'falsy' }).isFloat({ min: 0, max: 100 }),
  body('imageUrl').optional({ values: 'falsy' }).isString().trim().isLength({ max: 500 }),
  body('imagePublicId').optional({ values: 'falsy' }).isString().trim().isLength({ max: 300 }),
];

const createProductRules = [
  nameRule().withMessage('Product name is required'),
  skuRule(),
  priceRule(),
  ...optionalDetailRules(),
];

const updateProductRules = [
  nameRule().optional().withMessage('Product name must be 2-150 characters'),
  skuRule().optional(),
  priceRule().optional(),
  ...optionalDetailRules(),
];

const statusRules = [body('isActive').isBoolean().withMessage('isActive must be true or false')];

module.exports = { createProductRules, updateProductRules, statusRules };

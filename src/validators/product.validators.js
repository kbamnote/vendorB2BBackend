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
  body('shortDescription').optional({ values: 'falsy' }).isString().trim().isLength({ max: 600 }),
  body('images').optional().isArray({ max: 12 }).withMessage('At most 12 images'),
  body('attributes').optional().isArray({ max: 10 }).withMessage('At most 10 attributes'),
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

const setVendorsRules = [
  body('vendorIds').isArray().withMessage('vendorIds must be an array'),
  body('vendorIds.*').isMongoId().withMessage('Each vendor id must be valid'),
];

const bulkAssignRules = [
  body('productIds').isArray({ min: 1 }).withMessage('Select at least one product'),
  body('productIds.*').isMongoId().withMessage('Each product id must be valid'),
  body('vendorIds').isArray({ min: 1 }).withMessage('Select at least one vendor'),
  body('vendorIds.*').isMongoId().withMessage('Each vendor id must be valid'),
];

module.exports = {
  createProductRules,
  updateProductRules,
  statusRules,
  setVendorsRules,
  bulkAssignRules,
};

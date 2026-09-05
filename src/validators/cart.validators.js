'use strict';

const { body } = require('express-validator');

const cartRules = [
  body('items').isArray({ max: 200 }).withMessage('items must be an array'),
  body('items.*.product').isMongoId().withMessage('Each line needs a valid product id'),
  body('items.*.quantity')
    .isInt({ min: 1, max: 1000000 })
    .withMessage('Quantity must be a whole number of at least 1'),
];

module.exports = { cartRules };

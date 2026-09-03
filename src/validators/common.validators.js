'use strict';

const { param, query } = require('express-validator');

const mongoIdParam = (name = 'id') =>
  param(name).isMongoId().withMessage(`${name} must be a valid id`);

const paginationQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1-100'),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('status').optional().isIn(['active', 'inactive', 'all']),
];

module.exports = { mongoIdParam, paginationQuery };

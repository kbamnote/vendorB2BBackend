'use strict';

const express = require('express');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { ROLES } = require('../config/roles');
const ctrl = require('../controllers/product.controller');
const {
  createProductRules,
  updateProductRules,
  statusRules,
  setVendorsRules,
  bulkAssignRules,
} = require('../validators/product.validators');
const { mongoIdParam, paginationQuery } = require('../validators/common.validators');

const router = express.Router();

// The master catalogue belongs to the super admin. Vendor roles read their own
// subset through /my/products instead.
router.use(protect, authorize(ROLES.SUPER_ADMIN));

router.get('/categories', ctrl.listCategories);
router.get('/', validate(paginationQuery), ctrl.listProducts);
router.post('/', validate(createProductRules), ctrl.createProduct);

// Assignment from the catalogue side. Declared before /:id so the static path
// is never swallowed by the id parameter.
router.post('/assign', validate(bulkAssignRules), ctrl.bulkAssignProducts);

router.get('/:id', validate([mongoIdParam('id')]), ctrl.getProduct);
router.put('/:id', validate([mongoIdParam('id'), ...updateProductRules]), ctrl.updateProduct);
router.patch('/:id/status', validate([mongoIdParam('id'), ...statusRules]), ctrl.setProductStatus);
router.put(
  '/:id/vendors',
  validate([mongoIdParam('id'), ...setVendorsRules]),
  ctrl.setProductVendors
);
router.delete('/:id', validate([mongoIdParam('id')]), ctrl.deleteProduct);

module.exports = router;

'use strict';

const express = require('express');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { authorize, scopeToVendor } = require('../middleware/authorize');
const { ROLES } = require('../config/roles');
const assignmentCtrl = require('../controllers/assignment.controller');
const { mongoIdParam, paginationQuery } = require('../validators/common.validators');

const router = express.Router();

// Vendor facing catalogue. scopeToVendor pins every query to the caller own
// vendor, so a vendor admin or staff member can never read another vendor data
// even by tampering with the request body or query string.
router.use(protect, authorize(ROLES.VENDOR_ADMIN, ROLES.VENDOR_STAFF), scopeToVendor);

router.get('/products', validate(paginationQuery), assignmentCtrl.listVendorProducts);
router.get('/categories', assignmentCtrl.listVendorCategories);
router.get(
  '/products/:productId',
  validate([mongoIdParam('productId')]),
  assignmentCtrl.getVendorProduct
);

module.exports = router;

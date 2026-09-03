'use strict';

const express = require('express');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { authorize, scopeToVendor } = require('../middleware/authorize');
const { ROLES } = require('../config/roles');
const ctrl = require('../controllers/vendor.controller');
const assignmentCtrl = require('../controllers/assignment.controller');
const {
  createVendorRules,
  updateVendorRules,
  statusRules,
} = require('../validators/vendor.validators');
const { bulkAssignRules, updateAssignmentRules } = require('../validators/assignment.validators');
const { mongoIdParam, paginationQuery } = require('../validators/common.validators');

const router = express.Router();

// Everything below is super admin only.
router.use(protect, authorize(ROLES.SUPER_ADMIN));

router.get('/', validate(paginationQuery), ctrl.listVendors);
router.post('/', validate(createVendorRules), ctrl.createVendor);

router.get('/:id', validate([mongoIdParam('id')]), ctrl.getVendor);
router.put('/:id', validate([mongoIdParam('id'), ...updateVendorRules]), ctrl.updateVendor);
router.patch('/:id/status', validate([mongoIdParam('id'), ...statusRules]), ctrl.setVendorStatus);
router.delete('/:id', validate([mongoIdParam('id')]), ctrl.deleteVendor);

/* ---------- Product assignment for one vendor ---------- */

router.get(
  '/:vendorId/products',
  validate([mongoIdParam('vendorId'), ...paginationQuery]),
  scopeToVendor,
  assignmentCtrl.listVendorProducts
);

router.get(
  '/:vendorId/assignable-products',
  validate([mongoIdParam('vendorId'), ...paginationQuery]),
  scopeToVendor,
  assignmentCtrl.listAssignableProducts
);

router.post(
  '/:vendorId/products',
  validate([mongoIdParam('vendorId'), ...bulkAssignRules]),
  scopeToVendor,
  assignmentCtrl.assignProducts
);

router.delete(
  '/:vendorId/products',
  validate([mongoIdParam('vendorId'), ...bulkAssignRules]),
  scopeToVendor,
  assignmentCtrl.unassignProducts
);

router.patch(
  '/:vendorId/products/:productId',
  validate([mongoIdParam('vendorId'), mongoIdParam('productId'), ...updateAssignmentRules]),
  scopeToVendor,
  assignmentCtrl.updateAssignment
);

module.exports = router;

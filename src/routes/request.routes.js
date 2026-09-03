'use strict';

const express = require('express');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { ROLES } = require('../config/roles');
const ctrl = require('../controllers/request.controller');
const {
  createRequestRules,
  quoteRules,
  statusRules,
} = require('../validators/request.validators');
const { mongoIdParam, paginationQuery } = require('../validators/common.validators');

const router = express.Router();

router.use(protect);

// Listing is shared: the controller pins vendor roles to their own vendor.
router.get('/', validate(paginationQuery), ctrl.listRequests);
router.get('/stats', ctrl.requestStats);

// Only a vendor can raise a request - the super admin never buys from itself.
router.post(
  '/',
  authorize(ROLES.VENDOR_ADMIN, ROLES.VENDOR_STAFF),
  validate(createRequestRules),
  ctrl.createRequest
);

router.get('/:id', validate([mongoIdParam('id')]), ctrl.getRequest);

router.patch(
  '/:id/quote',
  authorize(ROLES.SUPER_ADMIN),
  validate([mongoIdParam('id'), ...quoteRules]),
  ctrl.sendQuotation
);

router.patch('/:id/status', validate([mongoIdParam('id'), ...statusRules]), ctrl.updateStatus);

module.exports = router;

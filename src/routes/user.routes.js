'use strict';

const express = require('express');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { ROLES } = require('../config/roles');
const ctrl = require('../controllers/user.controller');
const {
  createUserRules,
  updateUserRules,
  resetPasswordRules,
} = require('../validators/user.validators');
const { statusRules } = require('../validators/vendor.validators');
const { mongoIdParam, paginationQuery } = require('../validators/common.validators');

const router = express.Router();

// Super admins manage vendor admins; vendor admins manage their own staff.
// The controller decides which target rows each actor may touch.
router.use(protect, authorize(ROLES.SUPER_ADMIN, ROLES.VENDOR_ADMIN));

router.get('/', validate(paginationQuery), ctrl.listUsers);
router.post('/', validate(createUserRules), ctrl.createUser);

router.get('/:id', validate([mongoIdParam('id')]), ctrl.getUser);
router.put('/:id', validate([mongoIdParam('id'), ...updateUserRules]), ctrl.updateUser);
router.patch('/:id/status', validate([mongoIdParam('id'), ...statusRules]), ctrl.setUserStatus);
router.patch(
  '/:id/password',
  validate([mongoIdParam('id'), ...resetPasswordRules]),
  ctrl.resetUserPassword
);
router.delete('/:id', validate([mongoIdParam('id')]), ctrl.deleteUser);

module.exports = router;

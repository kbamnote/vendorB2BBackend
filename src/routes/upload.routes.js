'use strict';

const express = require('express');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { ROLES } = require('../config/roles');
const ctrl = require('../controllers/upload.controller');

const router = express.Router();

// Product images are part of the master catalogue, which only the super admin
// maintains - so only the super admin may issue upload signatures.
router.use(protect, authorize(ROLES.SUPER_ADMIN));

router.get('/status', ctrl.status);
router.get('/signature', ctrl.signature);
router.delete('/', ctrl.destroy);

module.exports = router;

'use strict';

const express = require('express');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/notification.controller');
const { mongoIdParam, paginationQuery } = require('../validators/common.validators');

const router = express.Router();

// Every notification row belongs to one user, so no role gate is needed -
// each query is pinned to req.user by the controller.
router.use(protect);

router.get('/', validate(paginationQuery), ctrl.listNotifications);
router.get('/unread-count', ctrl.unreadCount);
router.patch('/read-all', ctrl.markAllRead);
router.patch('/:id/read', validate([mongoIdParam('id')]), ctrl.markRead);

module.exports = router;

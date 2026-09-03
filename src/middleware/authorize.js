'use strict';

const ApiError = require('../utils/ApiError');
const { ROLES } = require('../config/roles');

/** Allows the request only for the listed roles. Use after `protect`. */
const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden('Your role does not allow this action'));
  }
  return next();
};

/**
 * Vendor data isolation.
 *
 * Super admins may pass ?vendorId / :vendorId to look at any vendor. Vendor
 * scoped roles are pinned to their own vendor and any attempt to reference a
 * different vendor id is rejected outright.
 */
const scopeToVendor = (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());

  const body = req.body || {};
  const requested =
    req.params.vendorId || body.vendor || body.vendorId || req.query.vendorId || null;

  if (req.user.role === ROLES.SUPER_ADMIN) {
    req.scopedVendorId = requested ? String(requested) : null;
    return next();
  }

  const own = String(req.user.vendor);
  if (requested && String(requested) !== own) {
    return next(ApiError.forbidden('You can only access data for your own vendor'));
  }

  req.scopedVendorId = own;
  return next();
};

module.exports = { authorize, scopeToVendor };

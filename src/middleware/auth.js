'use strict';

const User = require('../models/User');
const Vendor = require('../models/Vendor');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../utils/token');
const { ROLES } = require('../config/roles');

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Verifies the JWT, then re-loads the user (and their vendor) from the database
 * so that deactivation takes effect immediately rather than at token expiry.
 */
const protect = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication token is missing');

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Session expired, please sign in again');
    }
    throw ApiError.unauthorized('Invalid authentication token');
  }

  const user = await User.findById(decoded.sub).lean();
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (!user.isActive) throw ApiError.forbidden('Your account has been deactivated');

  if (user.role !== ROLES.SUPER_ADMIN) {
    if (!user.vendor) throw ApiError.forbidden('Your account is not linked to a vendor');
    const vendor = await Vendor.findById(user.vendor).lean();
    if (!vendor) throw ApiError.forbidden('Linked vendor no longer exists');
    if (!vendor.isActive) throw ApiError.forbidden('Your vendor account has been deactivated');
    req.vendor = vendor;
  }

  delete user.password;
  req.user = user;
  // Convenience: vendor id as a string, null for super admins.
  req.vendorId = user.vendor ? String(user.vendor) : null;
  return next();
});

module.exports = { protect };

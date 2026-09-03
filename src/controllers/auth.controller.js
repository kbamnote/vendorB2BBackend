'use strict';

const User = require('../models/User');
const Vendor = require('../models/Vendor');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { signAccessToken } = require('../utils/token');
const { ROLES } = require('../config/roles');

/** Shapes the user object returned to the client. */
async function buildSession(userDoc) {
  const user = userDoc.toSafeJSON ? userDoc.toSafeJSON() : { ...userDoc };
  delete user.password;

  let vendor = null;
  if (user.vendor) {
    vendor = await Vendor.findById(user.vendor)
      .select('name code isActive email phone')
      .lean();
  }

  return { user: { ...user, vendor }, token: signAccessToken(userDoc) };
}

// POST /auth/login
const login = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const { password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  // Same message for unknown email and wrong password: no account enumeration.
  if (!user) throw ApiError.unauthorized('Invalid email or password');

  const matches = await user.comparePassword(password);
  if (!matches) throw ApiError.unauthorized('Invalid email or password');

  if (!user.isActive) throw ApiError.forbidden('Your account has been deactivated');

  if (user.role !== ROLES.SUPER_ADMIN) {
    const vendor = await Vendor.findById(user.vendor).lean();
    if (!vendor) throw ApiError.forbidden('Your vendor account no longer exists');
    if (!vendor.isActive) throw ApiError.forbidden('Your vendor account has been deactivated');
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const session = await buildSession(user);
  return ok(res, session, 'Signed in successfully');
});

// GET /auth/me
const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).lean();
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  delete user.password;

  let vendor = null;
  if (user.vendor) {
    vendor = await Vendor.findById(user.vendor).select('name code isActive email phone').lean();
  }

  return ok(res, { user: { ...user, vendor } }, 'Profile loaded');
});

// PATCH /auth/profile
const updateProfile = asyncHandler(async (req, res) => {
  const allowed = ['name', 'phone', 'designation'];
  const updates = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  });

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });
  if (!user) throw ApiError.notFound('User not found');

  return ok(res, { user: user.toSafeJSON() }, 'Profile updated');
});

// PATCH /auth/change-password
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  if (!user) throw ApiError.notFound('User not found');

  const matches = await user.comparePassword(currentPassword);
  if (!matches) throw ApiError.badRequest('Current password is incorrect');

  user.password = newPassword;
  await user.save();

  return ok(res, null, 'Password changed successfully');
});

module.exports = { login, me, updateProfile, changePassword };

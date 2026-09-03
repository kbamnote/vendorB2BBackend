'use strict';

const User = require('../models/User');
const Vendor = require('../models/Vendor');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { getPagination, buildSearchFilter } = require('../utils/pagination');
const { ROLES } = require('../config/roles');

/**
 * Which roles the caller is allowed to create/manage.
 * - super_admin  -> vendor admins and vendor staff (of any vendor)
 * - vendor_admin -> vendor staff of their own vendor only
 */
function manageableRoles(actor) {
  if (actor.role === ROLES.SUPER_ADMIN) return [ROLES.VENDOR_ADMIN, ROLES.VENDOR_STAFF];
  if (actor.role === ROLES.VENDOR_ADMIN) return [ROLES.VENDOR_STAFF];
  return [];
}

/** Throws unless the actor is allowed to act on this target user. */
function assertCanManage(actor, target) {
  if (String(target._id) === String(actor._id)) {
    throw ApiError.forbidden('Use your profile page to change your own account');
  }
  if (target.role === ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Super admin accounts cannot be managed from here');
  }
  if (!manageableRoles(actor).includes(target.role)) {
    throw ApiError.forbidden('Your role does not allow managing this account');
  }
  if (actor.role !== ROLES.SUPER_ADMIN && String(target.vendor) !== String(actor.vendor)) {
    throw ApiError.forbidden('You can only manage users of your own vendor');
  }
}

// GET /users
const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (req.user.role === ROLES.SUPER_ADMIN) {
    if (req.query.vendorId) filter.vendor = req.query.vendorId;
    filter.role = req.query.role
      ? req.query.role
      : { $in: [ROLES.VENDOR_ADMIN, ROLES.VENDOR_STAFF] };
  } else {
    // Vendor scoped: hard-pinned to the caller's vendor.
    filter.vendor = req.user.vendor;
    filter.role = req.query.role === ROLES.VENDOR_ADMIN ? ROLES.VENDOR_ADMIN : ROLES.VENDOR_STAFF;
  }

  if (req.query.status === 'active') filter.isActive = true;
  if (req.query.status === 'inactive') filter.isActive = false;

  const search = buildSearchFilter(req.query.search, ['name', 'email', 'phone', 'designation']);
  if (search) Object.assign(filter, search);

  const [items, total] = await Promise.all([
    User.find(filter)
      .populate('vendor', 'name code isActive')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total }, 'Users loaded');
});

// GET /users/:id
const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).populate('vendor', 'name code isActive').lean();
  if (!user) throw ApiError.notFound('User not found');

  if (req.user.role !== ROLES.SUPER_ADMIN) {
    const sameVendor = String(user.vendor?._id || user.vendor) === String(req.user.vendor);
    if (!sameVendor) throw ApiError.forbidden('You can only view users of your own vendor');
  }

  return ok(res, { user }, 'User loaded');
});

// POST /users
const createUser = asyncHandler(async (req, res) => {
  const allowedRoles = manageableRoles(req.user);
  const role = req.body.role;

  if (!allowedRoles.includes(role)) {
    throw ApiError.forbidden(`You can only create: ${allowedRoles.join(', ') || 'nothing'}`);
  }

  // Vendor admins always create staff inside their own vendor - the client
  // cannot override this by sending another vendor id.
  const vendorId =
    req.user.role === ROLES.SUPER_ADMIN ? req.body.vendor || req.body.vendorId : req.user.vendor;

  if (!vendorId) throw ApiError.badRequest('A vendor must be selected for this user');

  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor) throw ApiError.notFound('Vendor not found');
  if (!vendor.isActive && req.user.role !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('This vendor is deactivated');
  }

  const email = String(req.body.email).toLowerCase().trim();
  const exists = await User.findOne({ email }).lean();
  if (exists) throw ApiError.conflict('An account with this email already exists');

  const user = await User.create({
    name: req.body.name,
    email,
    password: req.body.password,
    phone: req.body.phone,
    designation: req.body.designation,
    role,
    vendor: vendor._id,
    isActive: req.body.isActive !== undefined ? req.body.isActive : true,
    createdBy: req.user._id,
  });

  const populated = await User.findById(user._id).populate('vendor', 'name code isActive').lean();

  return created(
    res,
    { user: populated },
    `${role === ROLES.VENDOR_ADMIN ? 'Vendor admin' : 'Staff'} account created successfully`
  );
});

// PUT /users/:id
const updateUser = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) throw ApiError.notFound('User not found');
  assertCanManage(req.user, target);

  const fields = ['name', 'phone', 'designation'];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) target[f] = req.body[f];
  });

  if (req.body.email !== undefined) {
    const email = String(req.body.email).toLowerCase().trim();
    if (email !== target.email) {
      const clash = await User.findOne({ email, _id: { $ne: target._id } }).lean();
      if (clash) throw ApiError.conflict('An account with this email already exists');
      target.email = email;
    }
  }

  await target.save();
  const populated = await User.findById(target._id).populate('vendor', 'name code isActive').lean();

  return ok(res, { user: populated }, 'User updated successfully');
});

// PATCH /users/:id/status
const setUserStatus = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) throw ApiError.notFound('User not found');
  assertCanManage(req.user, target);

  target.isActive = Boolean(req.body.isActive);
  await target.save({ validateBeforeSave: false });

  return ok(
    res,
    { user: target.toSafeJSON() },
    `Account ${target.isActive ? 'activated' : 'deactivated'} successfully`
  );
});

// PATCH /users/:id/password  - manager resets the login password.
const resetUserPassword = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id).select('+password');
  if (!target) throw ApiError.notFound('User not found');
  assertCanManage(req.user, target);

  target.password = req.body.password;
  await target.save();

  return ok(res, null, 'Password updated. Share the new credentials with the user.');
});

// DELETE /users/:id
const deleteUser = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) throw ApiError.notFound('User not found');
  assertCanManage(req.user, target);

  await User.deleteOne({ _id: target._id });
  return ok(res, null, 'User deleted successfully');
});

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  setUserStatus,
  resetUserPassword,
  deleteUser,
};

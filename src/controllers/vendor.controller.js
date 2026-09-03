'use strict';

const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const VendorProduct = require('../models/VendorProduct');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { getPagination, buildSearchFilter } = require('../utils/pagination');
const { ROLES } = require('../config/roles');

// GET /vendors
const listVendors = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (req.query.status === 'active') filter.isActive = true;
  if (req.query.status === 'inactive') filter.isActive = false;

  const search = buildSearchFilter(req.query.search, ['name', 'code', 'email', 'contactPerson']);
  if (search) Object.assign(filter, search);

  const [vendors, total] = await Promise.all([
    Vendor.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Vendor.countDocuments(filter),
  ]);

  const vendorIds = vendors.map((v) => v._id);

  // Counts per vendor in two grouped queries instead of N per-vendor queries.
  const [userCounts, productCounts] = await Promise.all([
    User.aggregate([
      { $match: { vendor: { $in: vendorIds } } },
      { $group: { _id: { vendor: '$vendor', role: '$role' }, count: { $sum: 1 } } },
    ]),
    VendorProduct.aggregate([
      { $match: { vendor: { $in: vendorIds }, isActive: true } },
      { $group: { _id: '$vendor', count: { $sum: 1 } } },
    ]),
  ]);

  const statsByVendor = new Map();
  vendorIds.forEach((id) =>
    statsByVendor.set(String(id), { adminCount: 0, staffCount: 0, productCount: 0 })
  );
  userCounts.forEach((row) => {
    const entry = statsByVendor.get(String(row._id.vendor));
    if (!entry) return;
    if (row._id.role === ROLES.VENDOR_ADMIN) entry.adminCount = row.count;
    if (row._id.role === ROLES.VENDOR_STAFF) entry.staffCount = row.count;
  });
  productCounts.forEach((row) => {
    const entry = statsByVendor.get(String(row._id));
    if (entry) entry.productCount = row.count;
  });

  const items = vendors.map((v) => ({ ...v, stats: statsByVendor.get(String(v._id)) }));

  return paginated(res, items, { page, limit, total }, 'Vendors loaded');
});

// GET /vendors/:id
const getVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id).lean();
  if (!vendor) throw ApiError.notFound('Vendor not found');

  const [admins, staff, productCount] = await Promise.all([
    User.find({ vendor: vendor._id, role: ROLES.VENDOR_ADMIN }).sort({ createdAt: -1 }).lean(),
    User.countDocuments({ vendor: vendor._id, role: ROLES.VENDOR_STAFF }),
    VendorProduct.countDocuments({ vendor: vendor._id, isActive: true }),
  ]);

  return ok(
    res,
    {
      vendor,
      admins: admins.map(({ password, ...rest }) => rest),
      stats: { adminCount: admins.length, staffCount: staff, productCount },
    },
    'Vendor loaded'
  );
});

/** Standalone mongod has no transaction support - detect that and fall back. */
const isTransactionUnsupported = (err) =>
  Boolean(err && /Transaction|replica set|Unsupported/i.test(err.message || ''));

/**
 * POST /vendors
 *
 * Creates the organisation and its first vendor admin login in one step, so a
 * vendor is never left without a way in. Both rows are written inside a
 * transaction (with a compensating delete on standalone mongod), which means a
 * duplicate admin email can never leave an orphaned vendor behind.
 */
const createVendor = asyncHandler(async (req, res) => {
  const payload = {
    name: req.body.name,
    code: req.body.code,
    email: req.body.email,
    phone: req.body.phone,
    gstNumber: req.body.gstNumber,
    contactPerson: req.body.contactPerson,
    address: req.body.address,
    notes: req.body.notes,
    isActive: req.body.isActive !== undefined ? req.body.isActive : true,
    createdBy: req.user._id,
  };

  const existing = await Vendor.findOne({ code: String(payload.code).toUpperCase() }).lean();
  if (existing) throw ApiError.conflict('A vendor with this code already exists');

  const input = req.body.admin || {};
  const adminEmail = String(input.email || '').toLowerCase().trim();

  // Check the login collision before writing anything, so the common mistake
  // gives a clean 409 rather than a rolled-back transaction.
  const emailTaken = await User.findOne({ email: adminEmail }).lean();
  if (emailTaken) throw ApiError.conflict('An account with this email already exists');

  const buildAdmin = (vendorId) => ({
    name: input.name,
    email: adminEmail,
    password: input.password,
    phone: input.phone,
    designation: input.designation,
    role: ROLES.VENDOR_ADMIN,
    vendor: vendorId,
    createdBy: req.user._id,
  });

  let vendor;
  let admin;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const [createdVendor] = await Vendor.create([payload], { session });
      // Model.create runs the save hooks, so the password is still hashed here.
      const [createdAdmin] = await User.create([buildAdmin(createdVendor._id)], { session });
      vendor = createdVendor;
      admin = createdAdmin;
    });
  } catch (err) {
    if (!isTransactionUnsupported(err)) throw err;

    vendor = await Vendor.create(payload);
    try {
      admin = await User.create(buildAdmin(vendor._id));
    } catch (adminErr) {
      await Vendor.deleteOne({ _id: vendor._id });
      throw adminErr;
    }
  } finally {
    await session.endSession();
  }

  return created(
    res,
    { vendor, admin: admin.toSafeJSON() },
    `${vendor.name} created with an admin login for ${admin.email}`
  );
});

// PUT /vendors/:id
const updateVendor = asyncHandler(async (req, res) => {
  const fields = [
    'name',
    'code',
    'email',
    'phone',
    'gstNumber',
    'contactPerson',
    'address',
    'notes',
  ];
  const updates = {};
  fields.forEach((f) => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });

  if (updates.code) {
    const clash = await Vendor.findOne({
      code: String(updates.code).toUpperCase(),
      _id: { $ne: req.params.id },
    }).lean();
    if (clash) throw ApiError.conflict('A vendor with this code already exists');
  }

  const vendor = await Vendor.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });
  if (!vendor) throw ApiError.notFound('Vendor not found');

  return ok(res, { vendor }, 'Vendor updated successfully');
});

// PATCH /vendors/:id/status
const setVendorStatus = asyncHandler(async (req, res) => {
  const isActive = Boolean(req.body.isActive);

  const vendor = await Vendor.findByIdAndUpdate(
    req.params.id,
    { isActive },
    { new: true, runValidators: true }
  );
  if (!vendor) throw ApiError.notFound('Vendor not found');

  return ok(
    res,
    { vendor },
    `Vendor ${isActive ? 'activated' : 'deactivated'} successfully. ${
      isActive ? 'Its users can sign in again.' : 'All of its users are now blocked from signing in.'
    }`
  );
});

// DELETE /vendors/:id  - removes the vendor, its users and its assignments.
const deleteVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throw ApiError.notFound('Vendor not found');

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await User.deleteMany({ vendor: vendor._id }).session(session);
      await VendorProduct.deleteMany({ vendor: vendor._id }).session(session);
      await Vendor.deleteOne({ _id: vendor._id }).session(session);
    });
  } catch (err) {
    if (!isTransactionUnsupported(err)) throw err;
    await User.deleteMany({ vendor: vendor._id });
    await VendorProduct.deleteMany({ vendor: vendor._id });
    await Vendor.deleteOne({ _id: vendor._id });
  } finally {
    await session.endSession();
  }

  return ok(res, null, 'Vendor and all of its users were deleted');
});

module.exports = {
  listVendors,
  getVendor,
  createVendor,
  updateVendor,
  setVendorStatus,
  deleteVendor,
};

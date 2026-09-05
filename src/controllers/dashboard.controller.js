'use strict';

const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const User = require('../models/User');
const VendorProduct = require('../models/VendorProduct');
const PurchaseRequest = require('../models/PurchaseRequest');
const { REQUEST_STATUS } = require('../models/PurchaseRequest');
const { VENDOR_ADMIN_LEVEL } = require('../config/approvals');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { ROLES } = require('../config/roles');

// GET /dashboard/summary - shape depends on the caller's role.
const summary = asyncHandler(async (req, res) => {
  if (req.user.role === ROLES.SUPER_ADMIN) {
    const [
      totalVendors,
      activeVendors,
      totalProducts,
      activeProducts,
      vendorAdmins,
      vendorStaff,
      totalAssignments,
      recentVendors,
      recentProducts,
      topVendors,
      awaitingQuotation,
      totalRequests,
    ] = await Promise.all([
      Vendor.countDocuments(),
      Vendor.countDocuments({ isActive: true }),
      Product.countDocuments(),
      Product.countDocuments({ isActive: true }),
      User.countDocuments({ role: ROLES.VENDOR_ADMIN }),
      User.countDocuments({ role: ROLES.VENDOR_STAFF }),
      VendorProduct.countDocuments({ isActive: true }),
      Vendor.find().sort({ createdAt: -1 }).limit(5).lean(),
      Product.find().sort({ createdAt: -1 }).limit(5).lean(),
      VendorProduct.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$vendor', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: { from: 'vendors', localField: '_id', foreignField: '_id', as: 'vendor' },
        },
        { $unwind: '$vendor' },
        { $project: { _id: 0, count: 1, name: '$vendor.name', code: '$vendor.code' } },
      ]),
      PurchaseRequest.countDocuments({ status: REQUEST_STATUS.SUBMITTED }),
      PurchaseRequest.countDocuments(),
    ]);

    return ok(
      res,
      {
        role: req.user.role,
        stats: {
          totalVendors,
          activeVendors,
          inactiveVendors: totalVendors - activeVendors,
          totalProducts,
          activeProducts,
          inactiveProducts: totalProducts - activeProducts,
          vendorAdmins,
          vendorStaff,
          totalAssignments,
          awaitingQuotation,
          totalRequests,
        },
        recentVendors,
        recentProducts,
        topVendors,
      },
      'Dashboard loaded'
    );
  }

  // Vendor admin / vendor staff - everything is scoped to their own vendor.
  const vendorId = req.user.vendor;

  const [
    assignedProducts,
    activeAssigned,
    staffCount,
    adminCount,
    recentAssignments,
    openRequests,
    awaitingDecision,
    awaitingMyApproval,
  ] = await Promise.all([
      VendorProduct.countDocuments({ vendor: vendorId }),
      VendorProduct.countDocuments({ vendor: vendorId, isActive: true }),
      User.countDocuments({ vendor: vendorId, role: ROLES.VENDOR_STAFF }),
      User.countDocuments({ vendor: vendorId, role: ROLES.VENDOR_ADMIN }),
      VendorProduct.find({ vendor: vendorId, isActive: true })
        .populate('product', 'name sku category basePrice currency imageUrl isActive')
        .sort({ assignedAt: -1 })
        .limit(6)
        .lean(),
      PurchaseRequest.countDocuments({
        vendor: vendorId,
        status: { $in: [REQUEST_STATUS.SUBMITTED, REQUEST_STATUS.QUOTED] },
      }),
      PurchaseRequest.countDocuments({ vendor: vendorId, status: REQUEST_STATUS.QUOTED }),
      PurchaseRequest.countDocuments({
        vendor: vendorId,
        status: REQUEST_STATUS.PENDING_APPROVAL,
        'approval.currentLevel':
          req.user.role === ROLES.VENDOR_ADMIN ? VENDOR_ADMIN_LEVEL : req.user.approvalLevel || 1,
      }),
    ]);

  const categories = await VendorProduct.aggregate([
    { $match: { vendor: vendorId, isActive: true } },
    { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $group: { _id: '$product.category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 6 },
    { $project: { _id: 0, category: '$_id', count: 1 } },
  ]);

  return ok(
    res,
    {
      role: req.user.role,
      vendor: req.vendor
        ? { _id: req.vendor._id, name: req.vendor.name, code: req.vendor.code }
        : null,
      stats: {
        assignedProducts,
        activeAssigned,
        inactiveAssigned: assignedProducts - activeAssigned,
        staffCount,
        adminCount,
        openRequests,
        awaitingDecision,
        awaitingMyApproval,
      },
      categories,
      recentAssignments: recentAssignments
        .filter((r) => r.product)
        .map((r) => ({
          _id: r._id,
          assignedAt: r.assignedAt,
          effectivePrice:
            r.vendorPrice !== null && r.vendorPrice !== undefined
              ? r.vendorPrice
              : r.product.basePrice,
          product: r.product,
        })),
    },
    'Dashboard loaded'
  );
});

module.exports = { summary };

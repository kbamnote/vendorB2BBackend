'use strict';

const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const VendorProduct = require('../models/VendorProduct');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, paginated } = require('../utils/response');
const { getPagination, buildSearchFilter } = require('../utils/pagination');

/** Resolves which vendor this request is allowed to touch. */
async function resolveVendor(req) {
  const vendorId = req.scopedVendorId;
  if (!vendorId) throw ApiError.badRequest('A vendor must be specified');

  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor) throw ApiError.notFound('Vendor not found');
  return vendor;
}

/**
 * GET /vendors/:vendorId/products   (super admin)
 * GET /my/products                  (vendor admin / staff - own vendor only)
 *
 * Returns the products assigned to the vendor. Vendor scoped roles never see
 * anything outside their own assignment rows.
 */
const listVendorProducts = asyncHandler(async (req, res) => {
  const vendor = await resolveVendor(req);
  const { page, limit, skip } = getPagination(req.query);

  const assignmentFilter = { vendor: vendor._id };
  if (req.query.status === 'active') assignmentFilter.isActive = true;
  if (req.query.status === 'inactive') assignmentFilter.isActive = false;

  // Product level filters are applied after populate, so pre-select ids.
  const productFilter = {};
  if (req.query.category) productFilter.category = req.query.category;
  if (req.query.onlyActiveProducts === 'true') productFilter.isActive = true;
  const search = buildSearchFilter(req.query.search, ['name', 'sku', 'category', 'description']);
  if (search) Object.assign(productFilter, search);

  if (Object.keys(productFilter).length) {
    const matchingIds = await Product.find(productFilter).distinct('_id');
    assignmentFilter.product = { $in: matchingIds };
  }

  const [rows, total] = await Promise.all([
    VendorProduct.find(assignmentFilter)
      .populate('product')
      .populate('assignedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    VendorProduct.countDocuments(assignmentFilter),
  ]);

  const items = rows
    .filter((row) => row.product) // guard against a product deleted mid-flight
    .map((row) => ({
      assignmentId: row._id,
      vendorPrice: row.vendorPrice,
      effectivePrice: row.vendorPrice !== null && row.vendorPrice !== undefined
        ? row.vendorPrice
        : row.product.basePrice,
      minOrderQty: row.minOrderQty,
      isActive: row.isActive,
      assignedAt: row.assignedAt,
      assignedBy: row.assignedBy || null,
      product: row.product,
    }));

  return paginated(
    res,
    items,
    { page, limit, total },
    `Products for ${vendor.name}`
  );
});

/**
 * GET /vendors/:vendorId/assignable-products  (super admin)
 * Catalogue products that are NOT yet assigned to this vendor.
 */
const listAssignableProducts = asyncHandler(async (req, res) => {
  const vendor = await resolveVendor(req);
  const { page, limit, skip } = getPagination(req.query);

  const assignedIds = await VendorProduct.find({ vendor: vendor._id }).distinct('product');

  const filter = { _id: { $nin: assignedIds }, isActive: true };
  if (req.query.category) filter.category = req.query.category;
  const search = buildSearchFilter(req.query.search, ['name', 'sku', 'category']);
  if (search) Object.assign(filter, search);

  const [items, total] = await Promise.all([
    Product.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total }, 'Assignable products loaded');
});

/**
 * POST /vendors/:vendorId/products
 * Body: { productIds: [...] }  - assigns many products in one call.
 * Re-assigning an existing (previously removed) row simply re-activates it.
 */
const assignProducts = asyncHandler(async (req, res) => {
  const vendor = await resolveVendor(req);
  const productIds = [...new Set((req.body.productIds || []).map(String))];

  if (!productIds.length) throw ApiError.badRequest('Select at least one product to assign');

  const products = await Product.find({ _id: { $in: productIds } }).select('_id').lean();
  if (products.length !== productIds.length) {
    throw ApiError.badRequest('One or more selected products do not exist');
  }

  const operations = products.map((product) => ({
    updateOne: {
      filter: { vendor: vendor._id, product: product._id },
      update: {
        $set: {
          isActive: true,
          assignedBy: req.user._id,
          assignedAt: new Date(),
        },
        $setOnInsert: {
          vendor: vendor._id,
          product: product._id,
          vendorPrice: null,
          minOrderQty: 1,
        },
      },
      upsert: true,
    },
  }));

  const result = await VendorProduct.bulkWrite(operations, { ordered: false });

  return ok(
    res,
    {
      assigned: productIds.length,
      newlyAssigned: result.upsertedCount || 0,
      reactivated: result.modifiedCount || 0,
    },
    `${productIds.length} product(s) assigned to ${vendor.name}`
  );
});

/**
 * DELETE /vendors/:vendorId/products
 * Body: { productIds: [...] } - removes assignments in bulk.
 */
const unassignProducts = asyncHandler(async (req, res) => {
  const vendor = await resolveVendor(req);
  const productIds = [...new Set((req.body.productIds || []).map(String))];
  if (!productIds.length) throw ApiError.badRequest('Select at least one product to remove');

  const result = await VendorProduct.deleteMany({
    vendor: vendor._id,
    product: { $in: productIds },
  });

  return ok(
    res,
    { removed: result.deletedCount },
    `${result.deletedCount} product(s) removed from ${vendor.name}`
  );
});

/**
 * PATCH /vendors/:vendorId/products/:productId
 * Updates vendor specific commercials or toggles the assignment.
 */
const updateAssignment = asyncHandler(async (req, res) => {
  const vendor = await resolveVendor(req);

  const updates = {};
  if (req.body.vendorPrice !== undefined) {
    updates.vendorPrice =
      req.body.vendorPrice === null || req.body.vendorPrice === ''
        ? null
        : Number(req.body.vendorPrice);
  }
  if (req.body.minOrderQty !== undefined) updates.minOrderQty = Number(req.body.minOrderQty);
  if (req.body.isActive !== undefined) updates.isActive = Boolean(req.body.isActive);

  if (!Object.keys(updates).length) throw ApiError.badRequest('Nothing to update');

  const assignment = await VendorProduct.findOneAndUpdate(
    { vendor: vendor._id, product: req.params.productId },
    updates,
    { new: true, runValidators: true }
  ).populate('product');

  if (!assignment) throw ApiError.notFound('This product is not assigned to the vendor');

  return ok(res, { assignment }, 'Assignment updated');
});

module.exports = {
  listVendorProducts,
  listAssignableProducts,
  assignProducts,
  unassignProducts,
  updateAssignment,
};

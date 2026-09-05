'use strict';

const Product = require('../models/Product');
const VendorProduct = require('../models/VendorProduct');
const Vendor = require('../models/Vendor');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { getPagination, buildSearchFilter } = require('../utils/pagination');
const { safeDestroyImage } = require('../utils/images');

// GET /products  (super admin - the full catalogue)
const listProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (req.query.status === 'active') filter.isActive = true;
  if (req.query.status === 'inactive') filter.isActive = false;
  if (req.query.category) filter.category = req.query.category;

  const search = buildSearchFilter(req.query.search, ['name', 'sku', 'category', 'description']);
  if (search) Object.assign(filter, search);

  const [products, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  // How many vendors each product is currently assigned to.
  const counts = await VendorProduct.aggregate([
    { $match: { product: { $in: products.map((p) => p._id) }, isActive: true } },
    { $group: { _id: '$product', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

  const items = products.map((p) => ({
    ...p,
    assignedVendorCount: countMap.get(String(p._id)) || 0,
  }));

  return paginated(res, items, { page, limit, total }, 'Products loaded');
});

// GET /products/categories
const listCategories = asyncHandler(async (_req, res) => {
  const categories = await Product.distinct('category');
  return ok(res, { categories: categories.filter(Boolean).sort() }, 'Categories loaded');
});

// GET /products/:id
const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  if (!product) throw ApiError.notFound('Product not found');

  const assignments = await VendorProduct.find({ product: product._id })
    .populate('vendor', 'name code isActive')
    .lean();

  return ok(res, { product, assignments }, 'Product loaded');
});

// POST /products
const createProduct = asyncHandler(async (req, res) => {
  const sku = String(req.body.sku).toUpperCase().trim();
  const exists = await Product.findOne({ sku }).lean();
  if (exists) throw ApiError.conflict('A product with this SKU already exists');

  const product = await Product.create({
    name: req.body.name,
    sku,
    category: req.body.category,
    description: req.body.description,
    unit: req.body.unit,
    basePrice: req.body.basePrice,
    currency: req.body.currency,
    hsnCode: req.body.hsnCode,
    taxPercent: req.body.taxPercent,
    imageUrl: req.body.imageUrl,
    imagePublicId: req.body.imagePublicId,
    shortDescription: req.body.shortDescription,
    images: req.body.images,
    attributes: req.body.attributes,
    isActive: req.body.isActive !== undefined ? req.body.isActive : true,
    createdBy: req.user._id,
  });

  return created(res, { product }, 'Product created successfully');
});

// PUT /products/:id
const updateProduct = asyncHandler(async (req, res) => {
  const fields = [
    'name',
    'sku',
    'category',
    'description',
    'unit',
    'basePrice',
    'currency',
    'hsnCode',
    'taxPercent',
    'imageUrl',
    'imagePublicId',
    'shortDescription',
    'images',
    'attributes',
  ];
  const updates = {};
  fields.forEach((f) => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });

  if (updates.sku) {
    updates.sku = String(updates.sku).toUpperCase().trim();
    const clash = await Product.findOne({ sku: updates.sku, _id: { $ne: req.params.id } }).lean();
    if (clash) throw ApiError.conflict('A product with this SKU already exists');
  }

  const previous = await Product.findById(req.params.id).select('imagePublicId').lean();

  const product = await Product.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });
  if (!product) throw ApiError.notFound('Product not found');

  // The image was swapped or cleared - remove the file it replaced.
  if (previous?.imagePublicId && previous.imagePublicId !== product.imagePublicId) {
    await safeDestroyImage(previous.imagePublicId);
  }

  return ok(res, { product }, 'Product updated successfully');
});

// PATCH /products/:id/status
const setProductStatus = asyncHandler(async (req, res) => {
  const isActive = Boolean(req.body.isActive);
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { isActive },
    { new: true, runValidators: true }
  );
  if (!product) throw ApiError.notFound('Product not found');

  return ok(res, { product }, `Product ${isActive ? 'activated' : 'deactivated'} successfully`);
});

// DELETE /products/:id
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');

  await VendorProduct.deleteMany({ product: product._id });
  await Product.deleteOne({ _id: product._id });
  await safeDestroyImage(product.imagePublicId);

  return ok(res, null, 'Product deleted and removed from all vendors');
});

/** Shared upsert used by both assignment entry points. */
const assignmentOp = (vendorId, productId, actorId) => ({
  updateOne: {
    filter: { vendor: vendorId, product: productId },
    update: {
      $set: { isActive: true, assignedBy: actorId, assignedAt: new Date() },
      $setOnInsert: { vendor: vendorId, product: productId, vendorPrice: null, minOrderQty: 1 },
    },
    upsert: true,
  },
});

/**
 * PUT /products/:id/vendors   body: { vendorIds: [] }
 *
 * Sets the exact list of vendors that can see this product: vendors that are
 * present get an assignment, vendors that were removed lose theirs. This is the
 * catalogue-side mirror of assigning products from a vendor's page.
 */
const setProductVendors = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  if (!product) throw ApiError.notFound('Product not found');

  const vendorIds = [...new Set((req.body.vendorIds || []).map(String))];

  if (vendorIds.length) {
    const found = await Vendor.countDocuments({ _id: { $in: vendorIds } });
    if (found !== vendorIds.length) throw ApiError.badRequest('One or more vendors do not exist');
  }

  const current = await VendorProduct.find({ product: product._id }).select('vendor').lean();
  const currentIds = current.map((row) => String(row.vendor));

  const toAdd = vendorIds.filter((id) => !currentIds.includes(id));
  const toRemove = currentIds.filter((id) => !vendorIds.includes(id));

  if (toAdd.length) {
    await VendorProduct.bulkWrite(
      toAdd.map((vendorId) => assignmentOp(vendorId, product._id, req.user._id)),
      { ordered: false }
    );
  }
  if (toRemove.length) {
    await VendorProduct.deleteMany({ product: product._id, vendor: { $in: toRemove } });
  }

  const summary =
    !toAdd.length && !toRemove.length
      ? 'No changes - those vendors were already set'
      : [
          toAdd.length ? `added to ${toAdd.length} vendor(s)` : null,
          toRemove.length ? `removed from ${toRemove.length} vendor(s)` : null,
        ]
          .filter(Boolean)
          .join(' and ');

  return ok(
    res,
    { added: toAdd.length, removed: toRemove.length, vendorCount: vendorIds.length },
    `${product.name} ${summary}`
  );
});

/**
 * POST /products/assign   body: { productIds: [], vendorIds: [] }
 *
 * Assigns many products to many vendors in one call. Deliberately additive:
 * removing across a mixed selection would be ambiguous, so unassignment stays
 * a per-product or per-vendor action.
 */
const bulkAssignProducts = asyncHandler(async (req, res) => {
  const productIds = [...new Set((req.body.productIds || []).map(String))];
  const vendorIds = [...new Set((req.body.vendorIds || []).map(String))];

  if (!productIds.length) throw ApiError.badRequest('Select at least one product');
  if (!vendorIds.length) throw ApiError.badRequest('Select at least one vendor');

  const [products, vendors] = await Promise.all([
    Product.countDocuments({ _id: { $in: productIds } }),
    Vendor.countDocuments({ _id: { $in: vendorIds } }),
  ]);
  if (products !== productIds.length) throw ApiError.badRequest('One or more products do not exist');
  if (vendors !== vendorIds.length) throw ApiError.badRequest('One or more vendors do not exist');

  const operations = [];
  vendorIds.forEach((vendorId) => {
    productIds.forEach((productId) => {
      operations.push(assignmentOp(vendorId, productId, req.user._id));
    });
  });

  const result = await VendorProduct.bulkWrite(operations, { ordered: false });

  return ok(
    res,
    {
      pairs: operations.length,
      newlyAssigned: result.upsertedCount || 0,
      reactivated: result.modifiedCount || 0,
    },
    `${productIds.length} product(s) assigned to ${vendorIds.length} vendor(s)`
  );
});

module.exports = {
  listProducts,
  setProductVendors,
  bulkAssignProducts,
  listCategories,
  getProduct,
  createProduct,
  updateProduct,
  setProductStatus,
  deleteProduct,
};

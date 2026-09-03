'use strict';

const Product = require('../models/Product');
const VendorProduct = require('../models/VendorProduct');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { getPagination, buildSearchFilter } = require('../utils/pagination');

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

  const product = await Product.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });
  if (!product) throw ApiError.notFound('Product not found');

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

  return ok(res, null, 'Product deleted and removed from all vendors');
});

module.exports = {
  listProducts,
  listCategories,
  getProduct,
  createProduct,
  updateProduct,
  setProductStatus,
  deleteProduct,
};

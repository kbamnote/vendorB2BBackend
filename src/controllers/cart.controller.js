'use strict';

const Cart = require('../models/Cart');
const VendorProduct = require('../models/VendorProduct');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

/**
 * Turns stored { product, quantity } pairs into full basket lines.
 *
 * Anything the vendor can no longer buy - unassigned, assignment paused, or the
 * product deactivated - is dropped rather than priced, and reported back so the
 * client can tell the user why their basket shrank.
 */
async function hydrate(vendorId, items) {
  if (!items.length) return { lines: [], removed: 0 };

  const rows = await VendorProduct.find({
    vendor: vendorId,
    product: { $in: items.map((item) => item.product) },
    isActive: true,
  })
    .populate('product')
    .lean();

  const byProduct = new Map(
    rows
      .filter((row) => row.product && row.product.isActive)
      .map((row) => [String(row.product._id), row])
  );

  const lines = [];
  items.forEach((item) => {
    const row = byProduct.get(String(item.product));
    if (!row) return;

    lines.push({
      productId: String(row.product._id),
      name: row.product.name,
      sku: row.product.sku,
      unit: row.product.unit,
      imageUrl: row.product.imageUrl,
      currency: row.product.currency,
      effectivePrice:
        row.vendorPrice !== null && row.vendorPrice !== undefined
          ? row.vendorPrice
          : row.product.basePrice,
      minOrderQty: row.minOrderQty,
      quantity: item.quantity,
    });
  });

  return { lines, removed: items.length - lines.length };
}

// GET /my/cart
const getCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id }).lean();
  const { lines, removed } = await hydrate(req.user.vendor, cart?.items || []);

  // Persist the pruning so the stale rows are not re-checked on every read.
  if (removed > 0) {
    await Cart.updateOne(
      { user: req.user._id },
      { $set: { items: lines.map((line) => ({ product: line.productId, quantity: line.quantity })) } }
    );
  }

  return ok(res, { items: lines, removed, updatedAt: cart?.updatedAt || null }, 'Basket loaded');
});

/**
 * PUT /my/cart   body: { items: [{ product, quantity }] }
 *
 * Replaces the whole basket. The client owns basket state and syncs it here,
 * which keeps add/remove/quantity edits to a single endpoint and makes the
 * write idempotent.
 */
const replaceCart = asyncHandler(async (req, res) => {
  const incoming = (req.body.items || [])
    .map((item) => ({ product: String(item.product), quantity: Math.floor(Number(item.quantity)) }))
    .filter((item) => item.product && item.quantity > 0);

  // Merge duplicate lines rather than rejecting them.
  const merged = new Map();
  incoming.forEach((item) => {
    merged.set(item.product, (merged.get(item.product) || 0) + item.quantity);
  });

  const items = [...merged.entries()].map(([product, quantity]) => ({ product, quantity }));

  if (items.length > 200) throw ApiError.badRequest('A basket cannot hold more than 200 products');

  // Only keep what this vendor may actually buy.
  const allowed = await VendorProduct.find({
    vendor: req.user.vendor,
    product: { $in: items.map((item) => item.product) },
    isActive: true,
  })
    .select('product')
    .lean();

  const allowedIds = new Set(allowed.map((row) => String(row.product)));
  const kept = items.filter((item) => allowedIds.has(item.product));

  await Cart.findOneAndUpdate(
    { user: req.user._id },
    { $set: { vendor: req.user.vendor, items: kept } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const { lines, removed } = await hydrate(req.user.vendor, kept);

  return ok(
    res,
    { items: lines, removed: removed + (items.length - kept.length) },
    'Basket saved'
  );
});

// DELETE /my/cart
const clearCart = asyncHandler(async (req, res) => {
  await Cart.findOneAndUpdate(
    { user: req.user._id },
    { $set: { vendor: req.user.vendor, items: [] } },
    { upsert: true }
  );
  return ok(res, { items: [], removed: 0 }, 'Basket cleared');
});

module.exports = { getCart, replaceCart, clearCart };

'use strict';

const mongoose = require('mongoose');

/**
 * Join model between Vendor and Product.
 *
 * A product is only visible to a vendor (and therefore to that vendor's staff)
 * when an active VendorProduct row links the two. This is the single source of
 * truth for "which vendor can see which product".
 */
const vendorProductSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    // Vendor specific commercials. Falls back to Product.basePrice when null.
    vendorPrice: { type: Number, default: null, min: 0 },
    minOrderQty: { type: Number, default: 1, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// One assignment row per vendor/product pair.
vendorProductSchema.index({ vendor: 1, product: 1 }, { unique: true });

module.exports = mongoose.model('VendorProduct', vendorProductSchema);

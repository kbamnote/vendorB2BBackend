'use strict';

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [150, 'Product name cannot exceed 150 characters'],
    },
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      trim: true,
      uppercase: true,
      unique: true,
      maxlength: [40, 'SKU cannot exceed 40 characters'],
      match: [/^[A-Z0-9_-]+$/, 'SKU may only contain letters, numbers, - and _'],
    },
    category: { type: String, trim: true, default: 'General', index: true },
    description: { type: String, trim: true, default: '', maxlength: 2000 },
    unit: { type: String, trim: true, default: 'pcs' },
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: [0, 'Base price cannot be negative'],
    },
    currency: { type: String, trim: true, uppercase: true, default: 'INR' },
    hsnCode: { type: String, trim: true, default: '' },
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    imageUrl: { type: String, trim: true, default: '' },
    // Set when the image was uploaded through Cloudinary, so it can be
    // deleted when the image is replaced or the product is removed.
    imagePublicId: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

productSchema.index({ name: 1 });
productSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);

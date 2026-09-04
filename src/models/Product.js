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
    shortDescription: { type: String, trim: true, default: '', maxlength: 600 },

    // URL friendly name, used by the storefront routes.
    slug: { type: String, trim: true, lowercase: true, default: '', index: true },

    // Primary image plus an optional gallery.
    imageUrl: { type: String, trim: true, default: '' },
    images: {
      type: [
        {
          _id: false,
          url: { type: String, trim: true, required: true },
          publicId: { type: String, trim: true, default: '' },
          alt: { type: String, trim: true, default: '' },
        },
      ],
      default: [],
    },

    // Selectable options such as Size or Finish. Presentational only - each
    // combination is not priced separately.
    attributes: {
      type: [
        {
          _id: false,
          name: { type: String, trim: true, required: true },
          options: { type: [String], default: [] },
        },
      ],
      default: [],
    },

    // Where the record came from, so a re-import updates instead of duplicating.
    source: {
      platform: { type: String, trim: true, default: '' },
      externalId: { type: String, trim: true, default: '' },
      url: { type: String, trim: true, default: '' },
    },
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
productSchema.index({ 'source.platform': 1, 'source.externalId': 1 });
productSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);

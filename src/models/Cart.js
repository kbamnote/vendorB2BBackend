'use strict';

const mongoose = require('mongoose');

/**
 * A vendor user's saved basket.
 *
 * Only the product and the quantity are stored. Prices, minimums and
 * availability are resolved from the vendor's live assignment rows on every
 * read, so a basket left for a week never quotes a stale price back at anyone.
 */
const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    // Kept alongside the user so a basket can be pruned if the user ever moves
    // vendor, and so it is queryable per organisation.
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },
    items: {
      type: [
        {
          _id: false,
          product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
          quantity: { type: Number, required: true, min: 1 },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cart', cartSchema);

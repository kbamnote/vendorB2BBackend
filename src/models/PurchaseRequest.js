'use strict';

const mongoose = require('mongoose');

const REQUEST_STATUS = Object.freeze({
  SUBMITTED: 'submitted',
  QUOTED: 'quoted',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

const STATUS_VALUES = Object.freeze(Object.values(REQUEST_STATUS));

/**
 * One line of a request.
 *
 * Name, SKU and unit are snapshotted at submission time so a quotation still
 * reads correctly months later, even if the catalogue entry is renamed or
 * deleted. `indicativePrice` is what the vendor saw when they asked;
 * `unitPrice` is what the super admin actually quoted.
 */
const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    unit: { type: String, trim: true, default: 'pcs' },

    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
    },

    indicativePrice: { type: Number, default: 0, min: 0 },

    unitPrice: { type: Number, default: null, min: 0 },
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    lineTotal: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const quotationSchema = new mongoose.Schema(
  {
    quotedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    quotedAt: { type: Date },
    validUntil: { type: Date, default: null },
    notes: { type: String, trim: true, default: '', maxlength: 2000 },
    subtotal: { type: Number, default: 0, min: 0 },
    taxTotal: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, default: 0, min: 0 },
    currency: { type: String, trim: true, uppercase: true, default: 'INR' },
    revision: { type: Number, default: 0 },
  },
  { _id: false }
);

const purchaseRequestSchema = new mongoose.Schema(
  {
    requestNumber: { type: String, required: true, unique: true, trim: true },

    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },
    // The vendor admin or staff member who raised it.
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    items: {
      type: [itemSchema],
      validate: [(value) => value.length > 0, 'A request must contain at least one product'],
    },

    notes: { type: String, trim: true, default: '', maxlength: 2000 },
    expectedDeliveryDate: { type: Date, default: null },

    status: {
      type: String,
      enum: STATUS_VALUES,
      default: REQUEST_STATUS.SUBMITTED,
      index: true,
    },

    quotation: { type: quotationSchema, default: null },

    // Set when the vendor accepts or rejects the quotation.
    respondedAt: { type: Date, default: null },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    responseNote: { type: String, trim: true, default: '', maxlength: 1000 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

purchaseRequestSchema.index({ vendor: 1, status: 1, createdAt: -1 });
purchaseRequestSchema.index({ createdAt: -1 });

/** Total units requested across all lines - handy in list views. */
purchaseRequestSchema.virtual('totalQuantity').get(function totalQuantity() {
  return (this.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
});

const PurchaseRequest = mongoose.model('PurchaseRequest', purchaseRequestSchema);

module.exports = PurchaseRequest;
module.exports.REQUEST_STATUS = REQUEST_STATUS;
module.exports.STATUS_VALUES = STATUS_VALUES;

'use strict';

const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: 'India' },
    pincode: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const vendorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Vendor name is required'],
      trim: true,
      maxlength: [120, 'Vendor name cannot exceed 120 characters'],
    },
    code: {
      type: String,
      required: [true, 'Vendor code is required'],
      trim: true,
      uppercase: true,
      unique: true,
      minlength: [2, 'Vendor code must be at least 2 characters'],
      maxlength: [20, 'Vendor code cannot exceed 20 characters'],
      match: [/^[A-Z0-9_-]+$/, 'Vendor code may only contain letters, numbers, - and _'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    phone: { type: String, trim: true, default: '' },
    gstNumber: { type: String, trim: true, uppercase: true, default: '' },
    contactPerson: { type: String, trim: true, default: '' },
    address: { type: addressSchema, default: () => ({}) },
    notes: { type: String, trim: true, default: '', maxlength: 1000 },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

vendorSchema.index({ name: 1 });
vendorSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Vendor', vendorSchema);

'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const { ROLE_VALUES, ROLES, VENDOR_SCOPED_ROLES } = require('../config/roles');

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      unique: true,
      match: [EMAIL_RX, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    phone: { type: String, trim: true, default: '' },
    role: {
      type: String,
      enum: { values: ROLE_VALUES, message: '{VALUE} is not a supported role' },
      required: true,
      index: true,
    },
    // Null for super_admin, required for vendor_admin / vendor_staff.
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      default: null,
      index: true,
    },
    designation: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.password;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

userSchema.index({ vendor: 1, role: 1 });

/** Guarantees the vendor link matches the role before anything is persisted. */
userSchema.pre('validate', function enforceVendorScope(next) {
  if (this.role === ROLES.SUPER_ADMIN) {
    this.vendor = null;
  } else if (VENDOR_SCOPED_ROLES.includes(this.role) && !this.vendor) {
    this.invalidate('vendor', `A ${this.role} must belong to a vendor`);
  }
  next();
});

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await bcrypt.hash(this.password, config.bcryptSaltRounds);
    return next();
  } catch (err) {
    return next(err);
  }
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject({ virtuals: true });
  delete obj.password;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', userSchema);

'use strict';

const mongoose = require('mongoose');

const NOTIFICATION_TYPES = Object.freeze({
  REQUEST_NEEDS_APPROVAL: 'request.needs_approval',
  REQUEST_APPROVED: 'request.approved',
  REQUEST_RETURNED: 'request.returned',
  REQUEST_EDITED: 'request.edited',
  REQUEST_RECEIVED: 'request.received',
  REQUEST_CANCELLED: 'request.cancelled',
  QUOTATION_SENT: 'quotation.sent',
  QUOTATION_ACCEPTED: 'quotation.accepted',
  QUOTATION_REJECTED: 'quotation.rejected',
  PRODUCTS_ASSIGNED: 'products.assigned',
  PRODUCTS_UNASSIGNED: 'products.unassigned',
});

const notificationSchema = new mongoose.Schema(
  {
    // Who should see it. One row per recipient, so read state is per person.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },

    type: { type: String, enum: Object.values(NOTIFICATION_TYPES), required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, trim: true, default: '', maxlength: 500 },

    // Relative path the client navigates to. Stored without a role prefix and
    // resolved per recipient at write time, since /admin and /vendor differ.
    link: { type: String, trim: true, default: '' },

    // Who caused it, for "approved by Ravi" style copy.
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, trim: true, default: '' },

    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ user: 1, createdAt: -1 });

// Housekeeping: notifications are transient, so drop them after 90 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;

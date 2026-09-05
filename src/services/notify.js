'use strict';

const Notification = require('../models/Notification');
const { NOTIFICATION_TYPES } = require('../models/Notification');
const User = require('../models/User');
const { ROLES } = require('../config/roles');
const { VENDOR_ADMIN_LEVEL } = require('../config/approvals');

/**
 * In-app notifications.
 *
 * Every emitter is fire-and-forget: a failure to notify must never fail the
 * action that triggered it, so each entry point swallows its own errors and
 * logs instead. One row is written per recipient so read state is per person.
 */

/* ------------------------------------------------------------ recipients */

const activeSuperAdmins = () =>
  User.find({ role: ROLES.SUPER_ADMIN, isActive: true }).select('_id role').lean();

const vendorAdmins = (vendorId) =>
  User.find({ vendor: vendorId, role: ROLES.VENDOR_ADMIN, isActive: true })
    .select('_id role')
    .lean();

/** Everyone at a given approval level inside one vendor. */
const usersAtLevel = (vendorId, level) => {
  if (level >= VENDOR_ADMIN_LEVEL) return vendorAdmins(vendorId);
  return User.find({
    vendor: vendorId,
    role: ROLES.VENDOR_STAFF,
    approvalLevel: level,
    isActive: true,
  })
    .select('_id role')
    .lean();
};

const allVendorUsers = (vendorId) =>
  User.find({ vendor: vendorId, isActive: true }).select('_id role').lean();

/* ------------------------------------------------------------ writing */

/** Super admins live under /admin, vendor roles under /vendor or /staff. */
function resolveLink(recipient, paths) {
  if (recipient.role === ROLES.SUPER_ADMIN) return paths.admin || '';
  if (recipient.role === ROLES.VENDOR_STAFF) return paths.staff || paths.vendor || '';
  return paths.vendor || '';
}

async function send(recipients, payload, actor = null) {
  const unique = new Map();
  (recipients || []).forEach((recipient) => {
    if (!recipient?._id) return;
    // Never notify someone about their own action.
    if (actor && String(recipient._id) === String(actor._id)) return;
    unique.set(String(recipient._id), recipient);
  });

  if (!unique.size) return 0;

  const rows = [...unique.values()].map((recipient) => ({
    user: recipient._id,
    vendor: payload.vendor || null,
    type: payload.type,
    title: payload.title,
    body: payload.body || '',
    link: resolveLink(recipient, payload.paths || {}),
    actor: actor?._id || null,
    actorName: actor?.name || '',
  }));

  await Notification.insertMany(rows, { ordered: false });
  return rows.length;
}

/** Wraps an emitter so a notification failure can never break the caller. */
const safely = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[notify] failed:', err.message);
    return 0;
  }
};

/* ------------------------------------------------------------ emitters */

const requestPaths = (id) => ({
  admin: `/admin/requests/${id}`,
  vendor: `/vendor/requests/${id}`,
  staff: `/staff/requests/${id}`,
});

/** A request has landed on someone's desk for approval. */
const requestNeedsApproval = safely(async (request, actor) => {
  const recipients = await usersAtLevel(request.vendor, request.approval.currentLevel);
  return send(
    recipients,
    {
      type: NOTIFICATION_TYPES.REQUEST_NEEDS_APPROVAL,
      vendor: request.vendor,
      title: `${request.requestNumber} needs your approval`,
      body: `${request.items.length} product(s) raised by ${actor.name}`,
      paths: requestPaths(request._id),
    },
    actor
  );
});

/** Someone approved it and passed it on - tell whoever raised it. */
const requestApproved = safely(async (request, actor) => {
  const raiser = await User.findById(request.requestedBy).select('_id role').lean();
  return send(
    [raiser],
    {
      type: NOTIFICATION_TYPES.REQUEST_APPROVED,
      vendor: request.vendor,
      title: `${request.requestNumber} approved`,
      body: `${actor.name} approved your request and sent it on`,
      paths: requestPaths(request._id),
    },
    actor
  );
});

/** Sent back down the chain. */
const requestReturned = safely(async (request, actor, note) => {
  const [atLevel, raiser] = await Promise.all([
    usersAtLevel(request.vendor, request.approval.currentLevel),
    User.findById(request.requestedBy).select('_id role').lean(),
  ]);

  return send(
    [...atLevel, raiser],
    {
      type: NOTIFICATION_TYPES.REQUEST_RETURNED,
      vendor: request.vendor,
      title: `${request.requestNumber} was sent back`,
      body: note ? `${actor.name}: ${note}` : `${actor.name} returned it for changes`,
      paths: requestPaths(request._id),
    },
    actor
  );
});

/** An approver trimmed the basket. */
const requestEdited = safely(async (request, actor, changes) => {
  const raiser = await User.findById(request.requestedBy).select('_id role').lean();
  return send(
    [raiser],
    {
      type: NOTIFICATION_TYPES.REQUEST_EDITED,
      vendor: request.vendor,
      title: `${request.requestNumber} was adjusted`,
      body: changes?.[0]
        ? `${actor.name}: ${changes[0]}${changes.length > 1 ? ` (+${changes.length - 1} more)` : ''}`
        : `${actor.name} changed the requested items`,
      paths: requestPaths(request._id),
    },
    actor
  );
});

/** It has left the vendor - the super admin now owes a quotation. */
const requestReceived = safely(async (request, actor, vendorName) => {
  const [admins, raiser] = await Promise.all([
    activeSuperAdmins(),
    User.findById(request.requestedBy).select('_id role').lean(),
  ]);

  await send(
    [raiser],
    {
      type: NOTIFICATION_TYPES.REQUEST_RECEIVED,
      vendor: request.vendor,
      title: `${request.requestNumber} sent to Print World`,
      body: 'Fully approved. A quotation will follow.',
      paths: requestPaths(request._id),
    },
    actor
  );

  return send(
    admins,
    {
      type: NOTIFICATION_TYPES.REQUEST_RECEIVED,
      vendor: request.vendor,
      title: `New quotation request ${request.requestNumber}`,
      body: `${vendorName || 'A vendor'} wants ${request.items.length} product(s) priced`,
      paths: requestPaths(request._id),
    },
    actor
  );
});

/** The super admin priced it. */
const quotationSent = safely(async (request, actor) => {
  const [admins, raiser] = await Promise.all([
    vendorAdmins(request.vendor),
    User.findById(request.requestedBy).select('_id role').lean(),
  ]);

  return send(
    [...admins, raiser],
    {
      type: NOTIFICATION_TYPES.QUOTATION_SENT,
      vendor: request.vendor,
      title: `Quotation received for ${request.requestNumber}`,
      body: 'Review the pricing and accept or reject it.',
      paths: requestPaths(request._id),
    },
    actor
  );
});

/** The vendor made a decision on a quotation. */
const quotationDecision = safely(async (request, actor, accepted) => {
  const admins = await activeSuperAdmins();
  return send(
    admins,
    {
      type: accepted
        ? NOTIFICATION_TYPES.QUOTATION_ACCEPTED
        : NOTIFICATION_TYPES.QUOTATION_REJECTED,
      vendor: request.vendor,
      title: `${request.requestNumber} ${accepted ? 'accepted' : 'rejected'}`,
      body: `${actor.name} ${accepted ? 'accepted' : 'rejected'} the quotation`,
      paths: requestPaths(request._id),
    },
    actor
  );
});

const requestCancelled = safely(async (request, actor) => {
  const admins = await activeSuperAdmins();
  return send(
    admins,
    {
      type: NOTIFICATION_TYPES.REQUEST_CANCELLED,
      vendor: request.vendor,
      title: `${request.requestNumber} cancelled`,
      body: `${actor.name} withdrew the request`,
      paths: requestPaths(request._id),
    },
    actor
  );
});

/** Products became available to a vendor - tell everyone who can order. */
const productsAssigned = safely(async (vendorId, count, actor) => {
  const recipients = await allVendorUsers(vendorId);
  return send(
    recipients,
    {
      type: NOTIFICATION_TYPES.PRODUCTS_ASSIGNED,
      vendor: vendorId,
      title: `${count} new product${count === 1 ? '' : 's'} available`,
      body: 'They are in your shop now and ready to order.',
      paths: { vendor: '/vendor/shop', staff: '/staff/shop', admin: '/admin/products' },
    },
    actor
  );
});

const productsUnassigned = safely(async (vendorId, count, actor) => {
  const recipients = await allVendorUsers(vendorId);
  return send(
    recipients,
    {
      type: NOTIFICATION_TYPES.PRODUCTS_UNASSIGNED,
      vendor: vendorId,
      title: `${count} product${count === 1 ? '' : 's'} removed from your catalogue`,
      body: 'They are no longer available to order.',
      paths: { vendor: '/vendor/shop', staff: '/staff/shop', admin: '/admin/products' },
    },
    actor
  );
});

module.exports = {
  requestNeedsApproval,
  requestApproved,
  requestReturned,
  requestEdited,
  requestReceived,
  quotationSent,
  quotationDecision,
  requestCancelled,
  productsAssigned,
  productsUnassigned,
};

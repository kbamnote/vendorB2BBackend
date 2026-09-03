'use strict';

const PurchaseRequest = require('../models/PurchaseRequest');
const { REQUEST_STATUS } = require('../models/PurchaseRequest');
const VendorProduct = require('../models/VendorProduct');
const { nextSequence } = require('../models/Counter');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { getPagination, buildSearchFilter } = require('../utils/pagination');
const { ROLES } = require('../config/roles');

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

async function buildRequestNumber() {
  const now = new Date();
  const key = `request-${now.getFullYear()}`;
  const seq = await nextSequence(key);
  return `REQ-${now.getFullYear()}-${String(seq).padStart(4, '0')}`;
}

/** Throws unless the caller may see this request. */
function assertCanView(actor, request) {
  if (actor.role === ROLES.SUPER_ADMIN) return;
  if (String(request.vendor?._id || request.vendor) !== String(actor.vendor)) {
    throw ApiError.forbidden('You can only view requests raised by your own vendor');
  }
}

/**
 * POST /requests   (vendor admin / vendor staff)
 *
 * The vendor states which products it wants and how many. Prices are taken
 * from the vendor's own assignment rows, so a vendor can never request a
 * product that was never assigned to it.
 */
const createRequest = asyncHandler(async (req, res) => {
  const vendorId = req.user.vendor;
  const lines = req.body.items || [];

  const wanted = new Map();
  lines.forEach((line) => {
    const id = String(line.product);
    const qty = Number(line.quantity);
    // Merge duplicate lines for the same product rather than rejecting them.
    wanted.set(id, (wanted.get(id) || 0) + qty);
  });

  const assignments = await VendorProduct.find({
    vendor: vendorId,
    product: { $in: [...wanted.keys()] },
    isActive: true,
  })
    .populate('product')
    .lean();

  if (assignments.length !== wanted.size) {
    throw ApiError.badRequest(
      'One or more products are not available to your organisation. Refresh and try again.'
    );
  }

  const items = assignments
    .filter((row) => row.product && row.product.isActive)
    .map((row) => ({
      product: row.product._id,
      name: row.product.name,
      sku: row.product.sku,
      unit: row.product.unit,
      quantity: wanted.get(String(row.product._id)),
      indicativePrice:
        row.vendorPrice !== null && row.vendorPrice !== undefined
          ? row.vendorPrice
          : row.product.basePrice,
      taxPercent: row.product.taxPercent || 0,
    }));

  if (items.length !== wanted.size) {
    throw ApiError.badRequest('One or more products are no longer active');
  }

  const request = await PurchaseRequest.create({
    requestNumber: await buildRequestNumber(),
    vendor: vendorId,
    requestedBy: req.user._id,
    items,
    notes: req.body.notes,
    expectedDeliveryDate: req.body.expectedDeliveryDate || null,
    status: REQUEST_STATUS.SUBMITTED,
  });

  return created(
    res,
    { request },
    `Request ${request.requestNumber} sent. The super admin will respond with a quotation.`
  );
});

/**
 * GET /requests
 * Super admin sees every vendor; vendor roles see only their own.
 */
const listRequests = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (req.user.role === ROLES.SUPER_ADMIN) {
    if (req.query.vendorId) filter.vendor = req.query.vendorId;
  } else {
    filter.vendor = req.user.vendor;
  }

  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;

  const search = buildSearchFilter(req.query.search, ['requestNumber', 'items.name', 'items.sku']);
  if (search) Object.assign(filter, search);

  const [items, total] = await Promise.all([
    PurchaseRequest.find(filter)
      .populate('vendor', 'name code isActive')
      .populate('requestedBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PurchaseRequest.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total }, 'Requests loaded');
});

// GET /requests/:id
const getRequest = asyncHandler(async (req, res) => {
  const request = await PurchaseRequest.findById(req.params.id)
    .populate('vendor', 'name code email phone isActive address gstNumber')
    .populate('requestedBy', 'name email role designation phone')
    .populate('quotation.quotedBy', 'name email')
    .populate('respondedBy', 'name email')
    .lean();

  if (!request) throw ApiError.notFound('Request not found');
  assertCanView(req.user, request);

  return ok(res, { request }, 'Request loaded');
});

/**
 * PATCH /requests/:id/quote   (super admin)
 *
 * Prices each line and moves the request to `quoted`. Re-quoting an already
 * quoted request is allowed and bumps the revision counter.
 */
const sendQuotation = asyncHandler(async (req, res) => {
  const request = await PurchaseRequest.findById(req.params.id);
  if (!request) throw ApiError.notFound('Request not found');

  if ([REQUEST_STATUS.CANCELLED, REQUEST_STATUS.ACCEPTED].includes(request.status)) {
    throw ApiError.badRequest(`A ${request.status} request can no longer be quoted`);
  }

  const priceByProduct = new Map(
    (req.body.items || []).map((line) => [String(line.product), line])
  );

  let subtotal = 0;
  let taxTotal = 0;

  request.items = request.items.map((item) => {
    const line = priceByProduct.get(String(item.product));
    if (!line) {
      throw ApiError.badRequest(`Missing a price for ${item.name}`);
    }

    const unitPrice = Number(line.unitPrice);
    const taxPercent = line.taxPercent === undefined ? item.taxPercent : Number(line.taxPercent);
    const lineTotal = round2(unitPrice * item.quantity);
    const taxAmount = round2((lineTotal * taxPercent) / 100);

    subtotal += lineTotal;
    taxTotal += taxAmount;

    item.unitPrice = unitPrice;
    item.taxPercent = taxPercent;
    item.lineTotal = lineTotal;
    item.taxAmount = taxAmount;
    return item;
  });

  subtotal = round2(subtotal);
  taxTotal = round2(taxTotal);

  request.quotation = {
    quotedBy: req.user._id,
    quotedAt: new Date(),
    validUntil: req.body.validUntil || null,
    notes: req.body.notes || '',
    currency: req.body.currency || 'INR',
    subtotal,
    taxTotal,
    grandTotal: round2(subtotal + taxTotal),
    revision: (request.quotation?.revision || 0) + 1,
  };

  request.status = REQUEST_STATUS.QUOTED;
  // A revised quotation reopens the decision.
  request.respondedAt = null;
  request.respondedBy = null;
  request.responseNote = '';

  await request.save();

  return ok(
    res,
    { request },
    `Quotation sent for ${request.requestNumber} (revision ${request.quotation.revision})`
  );
});

/**
 * PATCH /requests/:id/status
 *
 * Vendors accept or reject a quotation and may cancel a request they have not
 * been quoted for yet. The super admin can reject or cancel at any point.
 */
const updateStatus = asyncHandler(async (req, res) => {
  const request = await PurchaseRequest.findById(req.params.id);
  if (!request) throw ApiError.notFound('Request not found');
  assertCanView(req.user, request);

  const target = req.body.status;
  const isSuperAdmin = req.user.role === ROLES.SUPER_ADMIN;

  const allowed = isSuperAdmin
    ? {
        [REQUEST_STATUS.SUBMITTED]: [REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED],
        [REQUEST_STATUS.QUOTED]: [REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED],
      }
    : {
        [REQUEST_STATUS.SUBMITTED]: [REQUEST_STATUS.CANCELLED],
        [REQUEST_STATUS.QUOTED]: [
          REQUEST_STATUS.ACCEPTED,
          REQUEST_STATUS.REJECTED,
          REQUEST_STATUS.CANCELLED,
        ],
      };

  const permitted = allowed[request.status] || [];
  if (!permitted.includes(target)) {
    throw ApiError.badRequest(
      `A ${request.status} request cannot be moved to ${target}${
        permitted.length ? `. Allowed: ${permitted.join(', ')}` : ''
      }`
    );
  }

  request.status = target;
  request.respondedAt = new Date();
  request.respondedBy = req.user._id;
  request.responseNote = req.body.note || '';
  await request.save();

  return ok(res, { request }, `Request marked as ${target}`);
});

/** GET /requests/stats - small counters for the dashboards. */
const requestStats = asyncHandler(async (req, res) => {
  const match = req.user.role === ROLES.SUPER_ADMIN ? {} : { vendor: req.user.vendor };

  const rows = await PurchaseRequest.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const byStatus = rows.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {});

  return ok(
    res,
    {
      byStatus,
      total: rows.reduce((sum, row) => sum + row.count, 0),
      awaitingQuotation: byStatus[REQUEST_STATUS.SUBMITTED] || 0,
      awaitingDecision: byStatus[REQUEST_STATUS.QUOTED] || 0,
    },
    'Request stats'
  );
});

module.exports = {
  createRequest,
  listRequests,
  getRequest,
  sendQuotation,
  updateStatus,
  requestStats,
};

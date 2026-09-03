'use strict';

const ok = (res, data = null, message = 'Success', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

const created = (res, data = null, message = 'Created successfully') =>
  ok(res, data, message, 201);

const paginated = (res, items, { page, limit, total }, message = 'Success') =>
  res.status(200).json({
    success: true,
    message,
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    },
  });

module.exports = { ok, created, paginated };

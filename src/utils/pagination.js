'use strict';

const MAX_LIMIT = 100;

/** Normalises ?page & ?limit query params into safe numbers. */
function getPagination(query = {}) {
  let page = Number.parseInt(query.page, 10);
  let limit = Number.parseInt(query.limit, 10);

  if (Number.isNaN(page) || page < 1) page = 1;
  if (Number.isNaN(limit) || limit < 1) limit = 10;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  return { page, limit, skip: (page - 1) * limit };
}

/** Escapes a user supplied string so it can be safely used inside a RegExp. */
function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Builds a case-insensitive "contains" filter across the given fields. */
function buildSearchFilter(search, fields = []) {
  if (!search || !fields.length) return null;
  const rx = new RegExp(escapeRegex(search.trim()), 'i');
  return { $or: fields.map((field) => ({ [field]: rx })) };
}

module.exports = { getPagination, escapeRegex, buildSearchFilter, MAX_LIMIT };

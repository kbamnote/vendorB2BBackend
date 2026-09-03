'use strict';

const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const config = require('../config/env');

const notFound = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

/* eslint-disable no-unused-vars */
const errorHandler = (err, req, res, _next) => {
  let error = err;

  // Duplicate key -> 409 with the offending field.
  if (error && error.code === 11000) {
    const field = Object.keys(error.keyValue || {})[0] || 'field';
    error = ApiError.conflict(`A record with this ${field} already exists`);
  }

  // Mongoose schema validation -> 422 with per-field messages.
  if (error instanceof mongoose.Error.ValidationError) {
    const details = Object.values(error.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    error = new ApiError(422, 'Validation failed', details);
  }

  // Bad ObjectId in a param -> 400 instead of a 500.
  if (error instanceof mongoose.Error.CastError) {
    error = ApiError.badRequest(`Invalid value for ${error.path}`);
  }

  if (!(error instanceof ApiError)) {
    // eslint-disable-next-line no-console
    console.error('[error]', error);
    error = ApiError.internal(config.isProduction ? 'Something went wrong' : error.message);
  }

  const payload = {
    success: false,
    message: error.message,
  };
  if (error.details) payload.errors = error.details;
  if (!config.isProduction && err.stack) payload.stack = err.stack;

  return res.status(error.statusCode || 500).json(payload);
};
/* eslint-enable no-unused-vars */

module.exports = { notFound, errorHandler };

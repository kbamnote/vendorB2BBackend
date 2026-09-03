'use strict';

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/** Runs express-validator chains and turns failures into a 422 response. */
const validate = (chains = []) => [
  ...chains,
  (req, _res, next) => {
    const result = validationResult(req);
    if (result.isEmpty()) return next();

    const details = result.array().map((e) => ({
      field: e.path || e.param,
      message: e.msg,
    }));

    return next(new ApiError(422, 'Validation failed', details));
  },
];

module.exports = validate;

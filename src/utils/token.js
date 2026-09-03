'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * The JWT carries only identity claims. Permissions are re-read from the
 * database on every request so deactivating a user or vendor takes effect
 * immediately instead of when the token expires.
 */
function signAccessToken(user) {
  const payload = {
    sub: String(user._id),
    role: user.role,
    vendor: user.vendor ? String(user.vendor) : null,
  };

  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    issuer: 'vendor-b2b-portal',
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.secret, { issuer: 'vendor-b2b-portal' });
}

module.exports = { signAccessToken, verifyAccessToken };

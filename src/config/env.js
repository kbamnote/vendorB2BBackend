'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const required = ['MONGO_URI', 'JWT_SECRET'];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  // Fail fast: a misconfigured secret must never fall back to a default.
  // eslint-disable-next-line no-console
  console.error(`[config] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

/**
 * Checks the database name inside MONGO_URI.
 *
 * Two mistakes here are expensive and both fail far away from their cause: a
 * missing name silently lands every collection in `test`, which another
 * application on the same cluster may already own, and a stray slash produces
 * an unusable name that only errors on the first query.
 */
function checkMongoUri(uri) {
  // Everything between the host section and the query string is the db name.
  // Drop the scheme first, then the credentials if present - a local URI has
  // no "@" at all, and a password may legitimately contain one.
  const withoutScheme = String(uri).replace(/^mongodb(\+srv)?:\/\//i, '');
  const at = withoutScheme.lastIndexOf('@');
  const afterHost = at === -1 ? withoutScheme : withoutScheme.slice(at + 1);

  const slash = afterHost.indexOf('/');
  const dbName = slash === -1 ? '' : afterHost.slice(slash + 1).split('?')[0];

  if (!dbName) {
    // eslint-disable-next-line no-console
    console.warn(
      '[config] MONGO_URI has no database name, so MongoDB will use "test". ' +
        'Add one before the "?" (e.g. .../vendor_b2b_portal?retryWrites=true) ' +
        'so this app does not share a database with another project.'
    );
    return;
  }

  const invalid = /[/\\. "$*<>:|?]/.exec(dbName);
  if (invalid) {
    // eslint-disable-next-line no-console
    console.error(
      `[config] MONGO_URI contains an invalid database name "${dbName}" ` +
        `(the character ${JSON.stringify(invalid[0])} is not allowed). ` +
        'A trailing slash is the usual cause: use ".../vendor_b2b_portal?..." not ".../vendor_b2b_portal/?...".'
    );
    process.exit(1);
  }
}

checkMongoUri(process.env.MONGO_URI);

module.exports = {
  env: process.env.NODE_ENV || 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  port: toInt(process.env.PORT, 5000),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  mongoUri: process.env.MONGO_URI,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  bcryptSaltRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 12),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  rateLimit: {
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000,
    max: toInt(process.env.RATE_LIMIT_MAX, 300),
    authMax: toInt(process.env.AUTH_RATE_LIMIT_MAX, 20),
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'vendor-b2b-portal/products',
    // Uploads are optional: without credentials the product form falls back
    // to a plain image URL field instead of breaking.
    get isConfigured() {
      return Boolean(this.cloudName && this.apiKey && this.apiSecret);
    },
  },
  seed: {
    name: process.env.SEED_SUPERADMIN_NAME || 'Super Admin',
    email: process.env.SEED_SUPERADMIN_EMAIL || 'superadmin@portal.com',
    password: process.env.SEED_SUPERADMIN_PASSWORD || 'SuperAdmin@123',
  },
};

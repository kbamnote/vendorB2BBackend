'use strict';

const cloudinary = require('../config/cloudinary');
const config = require('../config/env');

/**
 * Deletes a Cloudinary asset without ever failing the caller.
 *
 * Image cleanup is housekeeping: if it fails we would rather leave an orphaned
 * file in Cloudinary than abort the product update the user actually asked for.
 */
async function safeDestroyImage(publicId) {
  if (!publicId || !config.cloudinary.isConfigured) return false;
  if (!String(publicId).startsWith(`${config.cloudinary.folder}/`)) return false;

  try {
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[cloudinary] Could not delete ${publicId}: ${err.message}`);
    return false;
  }
}

module.exports = { safeDestroyImage };

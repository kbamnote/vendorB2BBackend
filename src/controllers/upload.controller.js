'use strict';

const cloudinary = require('../config/cloudinary');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

function assertConfigured() {
  if (!config.cloudinary.isConfigured) {
    throw new ApiError(
      503,
      'Image uploads are not configured. Set the CLOUDINARY_* environment variables.'
    );
  }
}

// GET /uploads/status - lets the UI decide between an uploader and a URL field.
const status = asyncHandler(async (_req, res) =>
  ok(
    res,
    {
      enabled: config.cloudinary.isConfigured,
      cloudName: config.cloudinary.cloudName || null,
      folder: config.cloudinary.folder,
    },
    'Upload configuration'
  )
);

/**
 * GET /uploads/signature
 *
 * Returns a short-lived signature so the browser can upload straight to
 * Cloudinary. The file never passes through this server, which keeps large
 * images off the app's bandwidth and memory.
 *
 * Only the parameters returned here are signed - Cloudinary rejects the upload
 * if the client alters any of them, so the folder cannot be tampered with.
 */
const signature = asyncHandler(async (_req, res) => {
  assertConfigured();

  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = { timestamp, folder: config.cloudinary.folder };

  const signed = cloudinary.utils.api_sign_request(paramsToSign, config.cloudinary.apiSecret);

  return ok(
    res,
    {
      signature: signed,
      timestamp,
      folder: config.cloudinary.folder,
      apiKey: config.cloudinary.apiKey,
      cloudName: config.cloudinary.cloudName,
      // The /image/upload endpoint refuses anything that is not an image,
      // so this is enforced by Cloudinary and not only by the client.
      uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/image/upload`,
    },
    'Upload signature issued'
  );
});

// DELETE /uploads  body: { publicId }
const destroy = asyncHandler(async (req, res) => {
  assertConfigured();

  const publicId = String(req.body.publicId || '').trim();
  if (!publicId) throw ApiError.badRequest('publicId is required');

  // Never let a caller reach outside the configured folder.
  if (!publicId.startsWith(`${config.cloudinary.folder}/`)) {
    throw ApiError.forbidden('That asset is outside the managed upload folder');
  }

  const result = await cloudinary.uploader.destroy(publicId, { invalidate: true });
  if (result.result !== 'ok' && result.result !== 'not found') {
    throw ApiError.badRequest(`Cloudinary could not delete the image (${result.result})`);
  }

  return ok(res, { publicId, result: result.result }, 'Image deleted');
});

module.exports = { status, signature, destroy };

'use strict';

const { v2: cloudinary } = require('cloudinary');
const config = require('./env');

if (config.cloudinary.isConfigured) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
} else {
  // eslint-disable-next-line no-console
  console.warn('[cloudinary] Not configured - image uploads are disabled');
}

module.exports = cloudinary;

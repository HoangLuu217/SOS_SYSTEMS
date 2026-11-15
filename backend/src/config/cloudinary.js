const path = require('path');
const dotenv = require('dotenv');
const cloudinary = require('cloudinary').v2;

const envPath = path.resolve(__dirname, '../../.env');

const syncCloudinaryConfig = () => {
  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    dotenv.config({ path: envPath, override: false });
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dxwiirlxr',
    api_key: process.env.CLOUDINARY_API_KEY || '',
    api_secret: process.env.CLOUDINARY_API_SECRET || '',
    secure: true,
  });
};

syncCloudinaryConfig();

cloudinary.isConfigured = () => {
  syncCloudinaryConfig();
  return Boolean(process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
};

module.exports = cloudinary;

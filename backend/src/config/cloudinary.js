const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dxwiirlxr',
  api_key: process.env.CLOUDINARY_API_KEY || '487553137682684',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'zN5-4EbTaatH8mXzugL-ThZcpgs',
  secure: true,
});

module.exports = cloudinary;

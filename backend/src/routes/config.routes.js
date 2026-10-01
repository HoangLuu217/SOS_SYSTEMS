const express = require('express');
const router = express.Router();

/**
 * GET /api/config
 * Cung cấp thông tin cấu hình công khai cho ứng dụng mobile/web từ file .env của backend
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Lấy cấu hình hệ thống thành công',
    data: {
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    },
  });
});

module.exports = router;

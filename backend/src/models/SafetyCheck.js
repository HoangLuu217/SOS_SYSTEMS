const mongoose = require('mongoose');

/**
 * Schema: SafetyCheck (Đợt thông báo kiểm tra an toàn người dân)
 * Cho phép Quản trị viên (ADMIN) hoặc Cán bộ địa phương (LOCAL_AUTHORITY - Cấp Xã/Phường)
 * phát động đợt kiểm tra an toàn sau thiên tai, lũ lụt, bão...
 * Người dân trong khu vực (Xã hoặc toàn địa bàn) sẽ nhận được thông báo
 * và có thể xác nhận bản thân và gia đình đang "AN TOÀN" hoặc "CẦN CỨU HỘ".
 *
 * Lưu ý về phạm vi (scope) theo cấp hành chính 2 cấp (Tỉnh/TP -> Phường/Xã):
 * - Cán bộ địa phương: Đại diện cho cấp Phường/Xã (WARD), phạm vi gửi chỉ giới hạn trong Phường/Xã của mình.
 * - Quản trị viên (ADMIN): Có thể chọn gửi theo từng Phường/Xã (WARD), Tỉnh/Thành phố (PROVINCE), hoặc Toàn hệ thống (ALL).
 */
const safetyCheckSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Tiêu đề thông báo kiểm tra an toàn là bắt buộc'],
      trim: true,
      maxlength: [200, 'Tiêu đề không quá 200 ký tự'],
    },
    description: {
      type: String,
      required: [true, 'Nội dung hướng dẫn kiểm tra an toàn là bắt buộc'],
      trim: true,
    },
    disasterType: {
      type: String,
      enum: {
        values: [
          'STORM',
          'TYPHOON',
          'FLOOD',
          'FLASH_FLOOD',
          'LANDSLIDE',
          'HEAVY_RAIN',
          'EARTHQUAKE',
          'FIRE',
          'OTHER',
        ],
        message: 'Loại thiên tai/sự cố {VALUE} không hợp lệ',
      },
      default: 'STORM',
    },
    scope: {
      type: String,
      enum: {
        values: ['ALL', 'PROVINCE', 'WARD'],
        message: 'Phạm vi khu vực {VALUE} không hợp lệ (cho phép: ALL, PROVINCE, WARD)',
      },
      default: 'WARD', // Mặc định là cấp Phường/Xã (WARD)
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      default: null, // null nếu scope là ALL (Toàn hệ thống)
    },
    areaName: {
      type: String,
      trim: true,
      default: 'Toàn hệ thống',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người tạo thông báo kiểm tra an toàn là bắt buộc'],
    },
    creatorRole: {
      type: String,
      enum: {
        values: ['ADMIN', 'LOCAL_AUTHORITY'],
        message: 'Quyền người tạo {VALUE} không hợp lệ (cho phép: ADMIN, LOCAL_AUTHORITY)',
      },
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuthorityOrganization',
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'CLOSED'],
        message: 'Trạng thái {VALUE} không hợp lệ',
      },
      default: 'ACTIVE',
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: null,
    },
    stats: {
      totalTargeted: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalResponses: {
        type: Number,
        default: 0,
        min: 0,
      },
      safeCount: {
        type: Number,
        default: 0,
        min: 0,
      },
      needHelpCount: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    broadcastId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'safety_checks',
  }
);

// Indexes tối ưu truy vấn
safetyCheckSchema.index({ status: 1, createdAt: -1 });
safetyCheckSchema.index({ areaId: 1, status: 1 });
safetyCheckSchema.index({ scope: 1, status: 1 });
safetyCheckSchema.index({ createdBy: 1, createdAt: -1 });
safetyCheckSchema.index({ creatorRole: 1 });

module.exports = mongoose.model('SafetyCheck', safetyCheckSchema);

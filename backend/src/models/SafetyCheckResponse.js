const mongoose = require('mongoose');

/**
 * GeoJSON Point Sub-schema cho vị trí người dân khi phản hồi trạng thái an toàn
 */
const responsePointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true,
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: [true, 'Tọa độ GPS là bắt buộc'],
      validate: {
        validator: function (v) {
          if (!v || v.length === 0) return true;
          return Array.isArray(v) && v.length === 2 && !isNaN(v[0]) && !isNaN(v[1]);
        },
        message: 'Tọa độ GPS phải có dạng [longitude, latitude].',
      },
    },
  },
  { _id: false }
);

/**
 * Schema: SafetyCheckResponse (Phản hồi đánh dấu an toàn của người dân)
 * Lưu trữ trạng thái xác nhận của người dân cho một đợt kiểm tra an toàn cụ thể:
 * - SAFE: Tôi và người thân đã an toàn
 * - NEED_HELP: Tôi đang gặp nguy hiểm / Cần cứu hộ khẩn cấp
 */
const safetyCheckResponseSchema = new mongoose.Schema(
  {
    safetyCheckId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SafetyCheck',
      required: [true, 'Mã đợt kiểm tra an toàn (safetyCheckId) là bắt buộc'],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Mã người dân (userId) là bắt buộc'],
      index: true,
    },
    userFullName: {
      type: String,
      trim: true,
      default: '',
    },
    userPhone: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      required: [true, 'Trạng thái phản hồi là bắt buộc'],
      enum: {
        values: ['SAFE', 'NEED_HELP'],
        message: 'Trạng thái phản hồi {VALUE} không hợp lệ (cho phép: SAFE, NEED_HELP)',
      },
    },
    message: {
      type: String,
      trim: true,
      maxlength: [500, 'Lời nhắn/tình trạng không được vượt quá 500 ký tự'],
      default: '',
    },
    peopleCount: {
      type: Number,
      default: 1,
      min: [1, 'Số lượng người phải ít nhất là 1'],
    },
    location: {
      type: responsePointSchema,
      default: undefined,
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      default: null,
    },
    areaName: {
      type: String,
      trim: true,
      default: null,
    },
    sosRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SosRequest',
      default: null,
    },
    respondedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'safety_check_responses',
  }
);

// Mỗi người dân chỉ có 1 phản hồi duy nhất cho 1 đợt kiểm tra an toàn (sẽ cập nhật nếu gửi lại)
safetyCheckResponseSchema.index({ safetyCheckId: 1, userId: 1 }, { unique: true });
safetyCheckResponseSchema.index({ safetyCheckId: 1, status: 1 });
safetyCheckResponseSchema.index({ location: '2dsphere' }, { sparse: true });
safetyCheckResponseSchema.index({ respondedAt: -1 });

module.exports = mongoose.model('SafetyCheckResponse', safetyCheckResponseSchema);


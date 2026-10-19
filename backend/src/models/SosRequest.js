const mongoose = require('mongoose');

/**
 * GeoJSON Point Schema for SOS Location
 */
const pointLocationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true,
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: [true, 'Tọa độ [kinh độ, vĩ độ] là bắt buộc'],
      validate: {
        validator: function (coords) {
          if (!Array.isArray(coords) || coords.length !== 2) return false;
          const [lng, lat] = coords;
          return (
            typeof lng === 'number' &&
            typeof lat === 'number' &&
            lng >= -180 &&
            lng <= 180 &&
            lat >= -90 &&
            lat <= 90
          );
        },
        message: 'Tọa độ không hợp lệ. Định dạng [kinh độ (-180..180), vĩ độ (-90..90)].',
      },
    },
  },
  { _id: false }
);

const sosRequestSchema = new mongoose.Schema(
  {
    sosCode: {
      type: String,
      required: [true, 'Mã yêu cầu SOS (sosCode) là bắt buộc'],
      unique: true,
      uppercase: true,
      trim: true,
      default: function () {
        return (
          'SOS-' +
          Date.now().toString(36).toUpperCase() +
          '-' +
          Math.random().toString(36).substring(2, 6).toUpperCase()
        );
      },
    },
    citizenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người gửi yêu cầu cứu nạn (citizenId) là bắt buộc'],
    },
    location: {
      type: pointLocationSchema,
      required: [true, 'Vị trí GeoJSON (location) là bắt buộc'],
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      required: [true, 'Khu vực hành chính (areaId) là bắt buộc'],
    },
    address: {
      type: String,
      required: [true, 'Địa chỉ cụ thể là bắt buộc'],
      trim: true,
    },
    emergencyType: {
      type: String,
      required: [true, 'Loại tình huống khẩn cấp là bắt buộc'],
      enum: {
        values: [
          'MEDICAL',
          'FIRE',
          'POLICE',
          'RESCUE',
          'FLOOD',
          'LANDSLIDE',
          'STORM',
          'ACCIDENT',
          'MISSING_PERSON',
          'OTHER',
        ],
        message: 'Loại khẩn cấp {VALUE} không hợp lệ',
      },
    },
    priority: {
      type: String,
      required: [true, 'Mức độ ưu tiên là bắt buộc'],
      enum: {
        values: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        message: 'Mức độ ưu tiên {VALUE} không hợp lệ',
      },
      default: 'MEDIUM',
    },
    people: {
      type: Number,
      required: [true, 'Số lượng người gặp nạn là bắt buộc'],
      min: [1, 'Số người gặp nạn phải lớn hơn hoặc bằng 1'],
      default: 1,
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    contactPhone: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: function (v) {
          if (!v || !v.trim()) return true;
          const clean = v.replace(/[\s\.\-]+/g, '');
          return /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/.test(clean);
        },
        message: 'Số điện thoại liên hệ khẩn cấp không hợp lệ (cần 10 chữ số chuẩn VN)',
      },
    },
    secondaryPhone: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: function (v) {
          if (!v || !v.trim()) return true;
          const clean = v.replace(/[\s\.\-]+/g, '');
          return /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/.test(clean);
        },
        message: 'Số điện thoại dự phòng không hợp lệ (cần 10 chữ số chuẩn VN)',
      },
    },
    priorityGroups: [{
      type: String,
      trim: true,
    }],
    images: [{
      type: String,
      trim: true,
    }],
    status: {
      type: String,
      required: [true, 'Trạng thái cứu hộ là bắt buộc'],
      enum: {
        values: [
          'PENDING',
          'VERIFIED',
          'ASSIGNED',
          'ACCEPTED',
          'ON_THE_WAY',
          'EN_ROUTE',
          'ARRIVED',
          'IN_PROGRESS',
          'RESCUING',
          'COMPLETED',
          'RESOLVED',
          'CANCELLED',
          'REJECTED',
        ],
        message: 'Trạng thái cứu hộ {VALUE} không hợp lệ',
      },
      default: 'PENDING',
    },
    repeatCount: {
      type: Number,
      default: 1,
    },
    lastRepeatedAt: {
      type: Date,
      default: null,
    },
    isSecondaryRequest: {
      type: Boolean,
      default: false,
    },
    primarySosId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SosRequest',
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'sos_requests',
  }
);

// Indexes
sosRequestSchema.index({ location: '2dsphere' });
sosRequestSchema.index({ citizenId: 1 });
sosRequestSchema.index({ areaId: 1 });
sosRequestSchema.index({ status: 1 });
sosRequestSchema.index({ priority: 1 });
sosRequestSchema.index({ createdAt: -1 });
sosRequestSchema.index({ areaId: 1, status: 1, priority: 1, createdAt: -1 });

// Tự động gán resolvedAt khi chuyển sang trạng thái kết thúc
sosRequestSchema.pre('save', function () {
  if (this.isModified('status')) {
    if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(this.status) && !this.resolvedAt) {
      this.resolvedAt = new Date();
    }
  }
});

module.exports = mongoose.model('SosRequest', sosRequestSchema);

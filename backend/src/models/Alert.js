const mongoose = require('mongoose');

/**
 * GeoJSON Point Schema for Alert Location
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

const alertSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người phát cảnh báo (createdBy) là bắt buộc'],
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      required: [true, 'Khu vực phát cảnh báo (areaId) là bắt buộc'],
    },
    title: {
      type: String,
      required: [true, 'Tiêu đề cảnh báo là bắt buộc'],
      trim: true,
      maxlength: [200, 'Tiêu đề không quá 200 ký tự'],
    },
    content: {
      type: String,
      required: [true, 'Nội dung chi tiết cảnh báo là bắt buộc'],
      trim: true,
    },
    type: {
      type: String,
      required: [true, 'Loại cảnh báo là bắt buộc'],
      enum: {
        values: ['FLOOD', 'LANDSLIDE', 'STORM', 'FIRE', 'DANGEROUS_AREA', 'OTHER'],
        message: 'Loại cảnh báo {VALUE} không hợp lệ',
      },
    },
    severity: {
      type: String,
      required: [true, 'Mức độ nghiêm trọng là bắt buộc'],
      enum: {
        values: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        message: 'Mức độ {VALUE} không hợp lệ',
      },
      default: 'MEDIUM',
    },
    location: {
      type: pointLocationSchema,
      default: undefined,
    },
    radius: {
      type: Number,
      min: [0, 'Bán kính ảnh hưởng không được âm'],
      default: 500, // bán kính vùng ảnh hưởng (mét)
    },
    targetArea: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      default: null,
    },
    startTime: {
      type: Date,
      required: [true, 'Thời điểm bắt đầu cảnh báo là bắt buộc'],
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: null,
      validate: {
        validator: function (val) {
          if (!val || !this.startTime) return true;
          return val >= this.startTime;
        },
        message: 'Thời gian kết thúc cảnh báo (endTime) phải sau thời gian bắt đầu (startTime)',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'alerts',
  }
);

// Indexes
alertSchema.index({ location: '2dsphere' }, { sparse: true });
alertSchema.index({ areaId: 1 });
alertSchema.index({ isActive: 1 });
alertSchema.index({ startTime: 1 });
alertSchema.index({ endTime: 1 });
alertSchema.index({ areaId: 1, isActive: 1, severity: 1 });
alertSchema.index({ isActive: 1, startTime: 1, endTime: 1 });

module.exports = mongoose.model('Alert', alertSchema);

const mongoose = require('mongoose');

/**
 * GeoJSON Point Schema for Safe Location
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

const safeLocationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên địa điểm an toàn là bắt buộc'],
      trim: true,
      maxlength: [200, 'Tên không quá 200 ký tự'],
    },
    type: {
      type: String,
      required: [true, 'Loại địa điểm an toàn là bắt buộc'],
      enum: {
        values: [
          'EVACUATION_CENTER',
          'HOSPITAL',
          'RESCUE_STATION',
          'SHELTER',
          'MEETING_POINT',
        ],
        message: 'Loại địa điểm {VALUE} không hợp lệ',
      },
    },
    location: {
      type: pointLocationSchema,
      required: [true, 'Vị trí địa lý (location) là bắt buộc'],
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      required: [true, 'Khu vực quản lý (areaId) là bắt buộc'],
    },
    address: {
      type: String,
      required: [true, 'Địa chỉ cụ thể là bắt buộc'],
      trim: true,
    },
    capacity: {
      type: Number,
      required: [true, 'Sức chứa tối đa (capacity) là bắt buộc'],
      min: [0, 'Sức chứa không được là số âm'],
      default: 0,
    },
    currentOccupancy: {
      type: Number,
      required: [true, 'Số người hiện tại (currentOccupancy) là bắt buộc'],
      min: [0, 'Số người hiện tại không được là số âm'],
      default: 0,
    },
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'INACTIVE', 'FULL', 'MAINTENANCE'],
        message: 'Trạng thái điểm an toàn {VALUE} không hợp lệ',
      },
      default: 'ACTIVE',
    },
    images: {
      type: [String],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người tạo điểm an toàn (createdBy) là bắt buộc'],
    },
  },
  {
    timestamps: true,
    collection: 'safe_locations',
  }
);

// Indexes
safeLocationSchema.index({ location: '2dsphere' });
safeLocationSchema.index({ areaId: 1 });
safeLocationSchema.index({ type: 1 });
safeLocationSchema.index({ status: 1 });

// Kiểm tra sức chứa & tự động đồng bộ trạng thái FULL / ACTIVE
safeLocationSchema.pre('save', function () {
  if (this.isNew || this.isModified('capacity') || this.isModified('currentOccupancy')) {
    const cap = Number(this.capacity ?? 0);
    const occ = Number(this.currentOccupancy ?? 0);
    if (cap === 0 && occ > 0) {
      throw new Error('Sức chứa tối đa phải lớn hơn 0 khi có người đang lưu trú.');
    }
  }

  if (this.capacity > 0 && this.currentOccupancy >= this.capacity && this.status === 'ACTIVE') {
    this.status = 'FULL';
  } else if (this.capacity > 0 && this.currentOccupancy < this.capacity && this.status === 'FULL') {
    this.status = 'ACTIVE';
  }
});

module.exports = mongoose.model('SafeLocation', safeLocationSchema);

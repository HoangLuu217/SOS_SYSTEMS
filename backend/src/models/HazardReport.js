const mongoose = require('mongoose');

/**
 * GeoJSON Point Schema for Hazard Location
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

const hazardReportSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Tiêu đề điểm nguy hiểm là bắt buộc'],
      trim: true,
      maxlength: [200, 'Tiêu đề không quá 200 ký tự'],
    },
    description: {
      type: String,
      required: [true, 'Mô tả chi tiết điểm nguy hiểm là bắt buộc'],
      trim: true,
    },
    hazardType: {
      type: String,
      required: [true, 'Loại nguy hiểm là bắt buộc'],
      enum: {
        values: [
          'FLOOD',
          'LANDSLIDE',
          'FALLEN_TREE',
          'EROSION',
          'OBSTACLE',
          'ELECTRICAL',
          'ROAD_DAMAGE',
          'OTHER',
        ],
        message: 'Loại nguy hiểm {VALUE} không hợp lệ',
      },
      default: 'FLOOD',
    },
    customHazardType: {
      type: String,
      trim: true,
      maxlength: [100, 'Tên loại nguy hiểm tùy chỉnh không quá 100 ký tự'],
    },
    severity: {
      type: String,
      required: [true, 'Mức độ nghiêm trọng là bắt buộc'],
      enum: {
        values: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        message: 'Mức độ nghiêm trọng {VALUE} không hợp lệ',
      },
      default: 'MEDIUM',
    },
    location: {
      type: pointLocationSchema,
      required: [true, 'Vị trí địa lý (location) là bắt buộc'],
    },
    address: {
      type: String,
      required: [true, 'Địa chỉ cụ thể là bắt buộc'],
      trim: true,
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      default: null,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người báo cáo (reportedBy) là bắt buộc'],
    },
    reporterRole: {
      type: String,
      enum: {
        values: ['CITIZEN', 'RESCUER', 'LOCAL_AUTHORITY', 'ADMIN'],
        message: 'Vai trò người báo {VALUE} không hợp lệ',
      },
      default: 'CITIZEN',
    },
    images: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: {
        values: ['PENDING', 'APPROVED', 'REJECTED', 'RESOLVED'],
        message: 'Trạng thái {VALUE} không hợp lệ',
      },
      default: 'PENDING',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewNote: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'hazard_reports',
  }
);

// Indexes
hazardReportSchema.index({ location: '2dsphere' });
hazardReportSchema.index({ status: 1 });
hazardReportSchema.index({ areaId: 1 });
hazardReportSchema.index({ reportedBy: 1 });
hazardReportSchema.index({ createdAt: -1 });

module.exports = mongoose.model('HazardReport', hazardReportSchema);

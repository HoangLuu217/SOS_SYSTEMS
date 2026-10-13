const mongoose = require('mongoose');

/**
 * GeoJSON Polygon Schema for Administrative Boundary
 */
const polygonBoundarySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Polygon', 'MultiPolygon'],
      default: 'Polygon',
      required: true,
    },
    coordinates: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Tọa độ ranh giới GeoJSON là bắt buộc khi khai báo boundary'],
    },
  },
  { _id: false }
);

const administrativeAreaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên đơn vị hành chính là bắt buộc'],
      trim: true,
      maxlength: [150, 'Tên không quá 150 ký tự'],
    },
    code: {
      type: String,
      required: [true, 'Mã đơn vị hành chính là bắt buộc'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    type: {
      type: String,
      required: [true, 'Loại đơn vị hành chính là bắt buộc'],
      enum: {
        values: ['COUNTRY', 'PROVINCE', 'DISTRICT', 'WARD'],
        message: 'Cấp hành chính {VALUE} không hợp lệ',
      },
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      default: null,
    },
    boundary: {
      type: polygonBoundarySchema,
      default: undefined,
    },
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'INACTIVE'],
        message: 'Trạng thái {VALUE} không hợp lệ',
      },
      default: 'ACTIVE',
    },
  },
  {
    timestamps: true,
    collection: 'administrative_areas',
  }
);

// Indexes
administrativeAreaSchema.index({ parentId: 1 });
administrativeAreaSchema.index({ type: 1 });
administrativeAreaSchema.index({ boundary: '2dsphere' }, { sparse: true });

module.exports = mongoose.model('AdministrativeArea', administrativeAreaSchema);

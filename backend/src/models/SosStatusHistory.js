const mongoose = require('mongoose');

const sosStatusHistorySchema = new mongoose.Schema(
  {
    sosId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SosRequest',
      required: [true, 'Mã yêu cầu SOS (sosId) là bắt buộc'],
      immutable: true,
    },
    oldStatus: {
      type: String,
      enum: {
        values: [
          'PENDING',
          'VERIFIED',
          'ASSIGNED',
          'ACCEPTED',
          'ON_THE_WAY',
          'ARRIVED',
          'RESCUING',
          'COMPLETED',
          'CANCELLED',
          'REJECTED',
          null,
        ],
        message: 'Trạng thái cũ {VALUE} không hợp lệ',
      },
      default: null,
      immutable: true,
    },
    newStatus: {
      type: String,
      required: [true, 'Trạng thái mới (newStatus) là bắt buộc'],
      enum: {
        values: [
          'PENDING',
          'VERIFIED',
          'ASSIGNED',
          'ACCEPTED',
          'ON_THE_WAY',
          'ARRIVED',
          'RESCUING',
          'COMPLETED',
          'CANCELLED',
          'REJECTED',
        ],
        message: 'Trạng thái mới {VALUE} không hợp lệ',
      },
      immutable: true,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người thực hiện chuyển trạng thái (changedBy) là bắt buộc'],
      immutable: true,
    },
    note: {
      type: String,
      trim: true,
      default: null,
      immutable: true,
    },
    images: [
      {
        type: String,
        trim: true,
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: false, // Immutable audit history, chỉ tạo mới, không cập nhật
    collection: 'sos_status_history',
  }
);

// Indexes
sosStatusHistorySchema.index({ sosId: 1, createdAt: -1 });
sosStatusHistorySchema.index({ changedBy: 1 });

module.exports = mongoose.model('SosStatusHistory', sosStatusHistorySchema);

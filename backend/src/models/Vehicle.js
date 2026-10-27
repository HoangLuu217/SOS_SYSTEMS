const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RescueTeam',
      default: null,
    },
    type: {
      type: String,
      required: [true, 'Loại phương tiện là bắt buộc'],
      enum: {
        values: ['BOAT', 'AMBULANCE', 'TRUCK', 'MOTORBIKE', 'OTHER'],
        message: 'Loại phương tiện {VALUE} không hợp lệ',
      },
    },
    plateNumber: {
      type: String,
      required: [true, 'Biển kiểm soát / số hiệu phương tiện là bắt buộc'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    capacity: {
      type: Number,
      required: [true, 'Sức chứa / tải trọng người là bắt buộc'],
      min: [0, 'Sức chứa không được là số âm'],
      default: 1,
    },
    status: {
      type: String,
      enum: {
        values: ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INACTIVE'],
        message: 'Trạng thái phương tiện {VALUE} không hợp lệ',
      },
      default: 'AVAILABLE',
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'vehicles',
  }
);

// Indexes
vehicleSchema.index({ teamId: 1 });
vehicleSchema.index({ type: 1 });
vehicleSchema.index({ status: 1 });

module.exports = mongoose.model('Vehicle', vehicleSchema);

const mongoose = require('mongoose');

const sosAssignmentSchema = new mongoose.Schema(
  {
    sosRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SosRequest',
      required: [true, 'Yêu cầu cứu nạn (sosRequestId) là bắt buộc'],
    },
    // Trường tương thích ngược nếu code cũ gọi sosId
    sosId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SosRequest',
    },
    authorityOrganizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuthorityOrganization',
      required: [true, 'Cơ quan chỉ đạo điều phối (authorityOrganizationId) là bắt buộc'],
    },
    rescueTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RescueTeam',
      required: [true, 'Đội cứu hộ (rescueTeamId) là bắt buộc'],
    },
    // Trường tương thích ngược nếu code cũ gọi teamId
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RescueTeam',
    },
    rescuerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Cứu hộ viên phụ trách (rescuerId) là bắt buộc'],
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      default: null,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: [
          'PENDING',
          'ACCEPTED',
          'DISPATCHED',
          'EN_ROUTE',
          'ARRIVED',
          'IN_PROGRESS',
          'COMPLETED',
          'REJECTED',
          'CANCELLED',
          // Tương thích ngược các status cũ nếu có
          'ASSIGNED',
          'ON_THE_WAY',
          'RESCUING',
        ],
        message: 'Trạng thái phân công {VALUE} không hợp lệ',
      },
      default: 'PENDING',
    },
    priority: {
      type: String,
      enum: {
        values: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        message: 'Mức độ ưu tiên {VALUE} không hợp lệ',
      },
      default: 'MEDIUM',
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelReason: {
      type: String,
      trim: true,
      default: null,
    },
    note: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'sos_assignments',
  }
);

// Đồng bộ 2 chiều sosRequestId <-> sosId và rescueTeamId <-> teamId
sosAssignmentSchema.pre('save', function () {
  if (this.sosRequestId && !this.sosId) {
    this.sosId = this.sosRequestId;
  } else if (this.sosId && !this.sosRequestId) {
    this.sosRequestId = this.sosId;
  }

  if (this.rescueTeamId && !this.teamId) {
    this.teamId = this.rescueTeamId;
  } else if (this.teamId && !this.rescueTeamId) {
    this.rescueTeamId = this.teamId;
  }
});

// Indexes
sosAssignmentSchema.index({ sosRequestId: 1 });
sosAssignmentSchema.index({ authorityOrganizationId: 1 });
sosAssignmentSchema.index({ rescueTeamId: 1 });
sosAssignmentSchema.index({ rescuerId: 1 });
sosAssignmentSchema.index({ vehicleId: 1 });
sosAssignmentSchema.index({ assignedBy: 1 });
sosAssignmentSchema.index({ status: 1 });
sosAssignmentSchema.index({ sosRequestId: 1, status: 1 });
sosAssignmentSchema.index({ rescuerId: 1, status: 1 });

module.exports = mongoose.model('SosAssignment', sosAssignmentSchema);

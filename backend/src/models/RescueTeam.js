const mongoose = require('mongoose');

/**
 * Sub-schema: Team Member (Embedded)
 */
const teamMemberSchema = new mongoose.Schema(
  {
    rescuerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Mã cứu hộ viên (rescuerId) là bắt buộc'],
    },
    role: {
      type: String,
      enum: {
        values: ['LEADER', 'MEMBER'],
        message: 'Vai trò thành viên {VALUE} không hợp lệ',
      },
      default: 'MEMBER',
    },
    status: {
      type: String,
      enum: {
        values: ['PENDING', 'APPROVED', 'REJECTED'],
        message: 'Trạng thái {VALUE} không hợp lệ',
      },
      default: 'APPROVED',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { _id: true }
);

const rescueTeamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên đội cứu hộ là bắt buộc'],
      trim: true,
      maxlength: [150, 'Tên đội cứu hộ không quá 150 ký tự'],
    },
    type: {
      type: String,
      required: [true, 'Loại đội cứu hộ là bắt buộc'],
      enum: {
        values: [
          'FLOOD_RESCUE',
          'FIRE_RESCUE',
          'MEDICAL_RESCUE',
          'SEARCH_RESCUE',
          'GENERAL_RESCUE',
          'OTHER',
        ],
        message: 'Loại đội cứu hộ {VALUE} không hợp lệ',
      },
      default: 'GENERAL_RESCUE',
    },
    leaderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    authorityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuthorityOrganization',
      required: [true, 'Cơ quan quản lý (authorityId) là bắt buộc'],
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      required: [true, 'Khu vực hoạt động (areaId) là bắt buộc'],
    },
    members: {
      type: [teamMemberSchema],
      default: [],
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
        message: 'Trạng thái {VALUE} không hợp lệ',
      },
      default: 'ACTIVE',
    },
  },
  {
    timestamps: true,
    collection: 'rescue_teams',
  }
);

// Indexes
rescueTeamSchema.index({ authorityId: 1 });
rescueTeamSchema.index({ areaId: 1 });
rescueTeamSchema.index({ leaderId: 1 });
rescueTeamSchema.index({ 'members.rescuerId': 1 });
rescueTeamSchema.index({ status: 1 });

module.exports = mongoose.model('RescueTeam', rescueTeamSchema);

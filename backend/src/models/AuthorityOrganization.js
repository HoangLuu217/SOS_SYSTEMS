const mongoose = require('mongoose');

const authorityOrganizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên cơ quan/tổ chức là bắt buộc'],
      trim: true,
      maxlength: [200, 'Tên không được vượt quá 200 ký tự'],
    },
    code: {
      type: String,
      required: [true, 'Mã cơ quan/tổ chức là bắt buộc'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    type: {
      type: String,
      required: [true, 'Loại cơ quan/tổ chức là bắt buộc'],
      enum: {
        values: [
          'POLICE',
          'FIRE_DEPARTMENT',
          'MEDICAL',
          'DISASTER_RESPONSE',
          'MILITARY',
          'LOCAL_AUTHORITY',
          'OTHER',
          'PROVINCE',
          'DISTRICT',
          'WARD',
          'RESCUE_CENTER',
        ],
        message: 'Loại tổ chức {VALUE} không hợp lệ',
      },
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    address: {
      type: String,
      trim: true,
      default: null,
    },
    administrativeAreaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      default: null,
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      default: null,
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
    collection: 'authority_organizations',
  }
);

// Đồng bộ 2 chiều giữa administrativeAreaId và areaId
authorityOrganizationSchema.pre('save', function () {
  if (this.administrativeAreaId && !this.areaId) {
    this.areaId = this.administrativeAreaId;
  } else if (this.areaId && !this.administrativeAreaId) {
    this.administrativeAreaId = this.areaId;
  }
});

// Indexes
authorityOrganizationSchema.index({ administrativeAreaId: 1 });
authorityOrganizationSchema.index({ areaId: 1 });
authorityOrganizationSchema.index({ type: 1 });
authorityOrganizationSchema.index({ status: 1 });

module.exports = mongoose.model('AuthorityOrganization', authorityOrganizationSchema);

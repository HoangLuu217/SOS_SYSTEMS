const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Sub-schema: Citizen Profile (Embedded)
 */
const citizenSchema = new mongoose.Schema(
  {
    emergencyContact: {
      name: { type: String, trim: true, default: null },
      phone: {
        type: String,
        trim: true,
        default: null,
        validate: {
          validator: function (v) {
            if (!v) return true;
            return /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$|^\+?[1-9]\d{8,14}$/.test(v);
          },
          message: 'Số điện thoại người liên hệ khẩn cấp không hợp lệ',
        },
      },
      relation: { type: String, trim: true, default: null },
    },
  },
  { _id: false }
);

/**
 * Sub-schema: Session (Embedded)
 * Quản lý phiên trong users.sessions: lưu hash refresh token, hạn dùng, thiết bị
 */
const sessionSchema = new mongoose.Schema(
  {
    refreshTokenHash: {
      type: String,
      required: true,
      trim: true,
    },
    userAgent: {
      type: String,
      default: null,
      trim: true,
    },
    ipAddress: {
      type: String,
      default: null,
      trim: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

/**
 * Sub-schema: Rescuer Profile (Embedded)
 */
const rescuerSchema = new mongoose.Schema(
  {
    idNumber: {
      type: String,
      trim: true,
      default: null,
    },
    skills: {
      type: [String],
      default: [],
    },
    experience: {
      type: String,
      trim: true,
      default: null,
    },
    vehicleType: {
      type: String,
      enum: {
        values: ['BOAT', 'AMBULANCE', 'TRUCK', 'MOTORBIKE', 'OTHER'],
        message: 'Loại phương tiện {VALUE} không hợp lệ',
      },
      default: null,
    },
    verificationStatus: {
      type: String,
      enum: {
        values: ['PENDING', 'VERIFIED', 'REJECTED'],
        message: 'Trạng thái xác minh {VALUE} không hợp lệ',
      },
      default: 'PENDING',
    },
    availabilityStatus: {
      type: String,
      enum: {
        values: ['OFFLINE', 'AVAILABLE', 'BUSY', 'ON_MISSION', 'SUSPENDED'],
        message: 'Trạng thái sẵn sàng {VALUE} không hợp lệ',
      },
      default: 'OFFLINE',
    },
  },
  { _id: false }
);

/**
 * Sub-schema: Authority Profile (Embedded)
 */
const authoritySchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuthorityOrganization',
      default: null,
      validate: {
        validator: function (v) {
          const doc = typeof this.ownerDocument === 'function' ? this.ownerDocument() : this;
          if (doc && doc.roles && doc.roles.includes('LOCAL_AUTHORITY')) {
            return !!v;
          }
          return true;
        },
        message: 'Tài khoản LOCAL_AUTHORITY bắt buộc phải có organizationId',
      },
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      default: null,
      validate: {
        validator: function (v) {
          const doc = typeof this.ownerDocument === 'function' ? this.ownerDocument() : this;
          if (doc && doc.roles && doc.roles.includes('LOCAL_AUTHORITY')) {
            return !!v;
          }
          return true;
        },
        message: 'Tài khoản LOCAL_AUTHORITY bắt buộc phải có areaId',
      },
    },
    position: {
      type: String,
      trim: true,
      default: null,
    },
    department: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false }
);

/**
 * Main Schema: User
 */
const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: [
        function () {
          return !this.googleId;
        },
        'Số điện thoại là bắt buộc',
      ],
      unique: true,
      sparse: true,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          // Hỗ trợ số điện thoại VN (10 số, đầu 0 hoặc +84) và quốc tế (E.164: 9-15 chữ số)
          return /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$|^\+?[1-9]\d{8,14}$/.test(v);
        },
        message: props => `${props.value} không phải là số điện thoại hợp lệ!`,
      },
    },
    email: {
      type: String,
      required: [true, 'Email là bắt buộc'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: props => `${props.value} không phải là định dạng email hợp lệ!`,
      },
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [
        function () {
          return !this.googleId;
        },
        'Mật khẩu băm (passwordHash) là bắt buộc',
      ],
    },
    fullName: {
      type: String,
      required: [true, 'Họ và tên là bắt buộc'],
      trim: true,
      minlength: [2, 'Họ và tên phải có ít nhất 2 ký tự'],
      maxlength: [100, 'Họ và tên không quá 100 ký tự'],
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    gender: {
      type: String,
      enum: {
        values: ['MALE', 'FEMALE', 'OTHER'],
        message: 'Giới tính {VALUE} không hợp lệ (cho phép: MALE, FEMALE, OTHER)',
      },
      default: null,
    },
    address: {
      type: String,
      trim: true,
      default: null,
    },
    avatarUrl: {
      type: String,
      trim: true,
      default: null,
    },
    roles: {
      type: [
        {
          type: String,
          enum: {
            values: ['CITIZEN', 'RESCUER', 'LOCAL_AUTHORITY', 'ADMIN'],
            message: 'Role {VALUE} không hợp lệ',
          },
        },
      ],
      default: ['CITIZEN'],
      validate: {
        validator: function (roles) {
          return Array.isArray(roles) && roles.length > 0;
        },
        message: 'Tài khoản phải có ít nhất 1 role.',
      },
    },
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING'],
        message: 'Trạng thái {VALUE} không hợp lệ',
      },
      default: 'PENDING',
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    citizen: {
      type: citizenSchema,
      default: () => ({}),
    },
    rescuer: {
      type: rescuerSchema,
      default: () => ({}),
    },
    authority: {
      type: authoritySchema,
      default: () => ({}),
    },
    sessions: {
      type: [sessionSchema],
      default: [],
    },
    resetPasswordTokenHash: {
      type: String,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

// Indexes
userSchema.index({ roles: 1 });
userSchema.index({ 'sessions.refreshTokenHash': 1 });
userSchema.index({ resetPasswordTokenHash: 1 }, { sparse: true });
userSchema.index({ 'rescuer.verificationStatus': 1 });
userSchema.index({ 'rescuer.availabilityStatus': 1 });
userSchema.index({
  'rescuer.verificationStatus': 1,
  'rescuer.availabilityStatus': 1,
});
userSchema.index({ 'authority.organizationId': 1 });
userSchema.index({ 'authority.areaId': 1 });

/**
 * Business Validation:
 * - Khi user có role LOCAL_AUTHORITY, bắt buộc phải có authority.organizationId và authority.areaId
 */
userSchema.pre('validate', function () {
  if (this.roles && this.roles.includes('LOCAL_AUTHORITY')) {
    if (!this.authority?.organizationId) {
      this.invalidate('authority.organizationId', 'Tài khoản LOCAL_AUTHORITY bắt buộc phải có organizationId');
    }
    if (!this.authority?.areaId) {
      this.invalidate('authority.areaId', 'Tài khoản LOCAL_AUTHORITY bắt buộc phải có areaId');
    }
  }
});

/**
 * Helper: So sánh mật khẩu ứng viên với mật khẩu đã băm
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

/**
 * Helper: Trả về object an toàn, ẩn passwordHash và session/reset tokens
 */
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject ? this.toObject() : { ...this };
  delete obj.passwordHash;
  delete obj.sessions;
  delete obj.resetPasswordTokenHash;
  delete obj.resetPasswordExpires;
  return obj;
};

/**
 * Instance Helper Method:
 * Kiểm tra cứu hộ viên có đủ điều kiện nhận nhiệm vụ hay không:
 * - Phải có role RESCUER
 * - verificationStatus === 'VERIFIED'
 * - availabilityStatus === 'AVAILABLE'
 */
userSchema.methods.isEligibleForRescue = function () {
  return (
    this.roles.includes('RESCUER') &&
    this.rescuer?.verificationStatus === 'VERIFIED' &&
    this.rescuer?.availabilityStatus === 'AVAILABLE'
  );
};

module.exports = mongoose.model('User', userSchema);

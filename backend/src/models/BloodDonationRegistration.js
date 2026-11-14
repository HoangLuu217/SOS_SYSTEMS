const mongoose = require('mongoose');

/**
 * Schema: BloodDonationRegistration (Đăng ký hiến máu của người dân)
 * Hỗ trợ 2 loại bản ghi:
 * 1. PRE_REGISTRATION (eventId = null): Người dùng đăng ký sẵn sàng hiến máu trước (trạng thái PENDING).
 *    Khi có sự kiện hiến máu mới, hệ thống sẽ thông báo cho những người dùng này.
 * 2. EVENT_REGISTRATION (eventId != null): Người dùng xác nhận tham gia (CONFIRMED) hoặc từ chối (DECLINED)
 *    tại một sự kiện hiến máu cụ thể.
 */
const bloodDonationRegistrationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người dùng đăng ký là bắt buộc'],
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BloodDonationEvent',
      default: null,
    },
    registrationType: {
      type: String,
      enum: ['PRE_REGISTRATION', 'EVENT_REGISTRATION'],
      default: 'PRE_REGISTRATION',
    },
    fullName: {
      type: String,
      required: [true, 'Họ và tên người đăng ký là bắt buộc'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Số điện thoại liên hệ là bắt buộc'],
      trim: true,
    },
    bloodType: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'A', 'B', 'AB', 'O', 'UNKNOWN'],
      default: 'UNKNOWN',
    },
    weightKg: {
      type: Number,
      default: null,
    },
    lastDonationDate: {
      type: String,
      default: '',
      trim: true,
    },
    healthNote: {
      type: String,
      default: 'Sức khỏe bình thường, đủ điều kiện hiến máu',
      trim: true,
    },
    preferredTimeSlot: {
      type: String,
      default: '',
      trim: true,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      default: null,
    },
    areaName: {
      type: String,
      default: '',
      trim: true,
    },
    provinceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      default: null,
    },
    provinceName: {
      type: String,
      default: '',
      trim: true,
    },
    address: {
      type: String,
      default: '',
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [108.2022, 16.0544],
      },
    },
    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'DECLINED', 'COMPLETED', 'CANCELLED'],
      default: 'PENDING',
    },
    respondedAt: {
      type: Date,
      default: Date.now,
    },
    reminded1DayBefore: {
      type: Boolean,
      default: false,
    },
    reminded1DayAt: {
      type: Date,
      default: null,
    },
    remindedUpcoming: {
      type: Boolean,
      default: false,
    },
    remindedUpcomingAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'blood_donation_registrations',
  }
);

bloodDonationRegistrationSchema.index({ userId: 1, registrationType: 1 });
bloodDonationRegistrationSchema.index({ eventId: 1, userId: 1 });
bloodDonationRegistrationSchema.index({ status: 1, createdAt: -1 });
bloodDonationRegistrationSchema.index({ areaId: 1, status: 1 });
bloodDonationRegistrationSchema.index({ eventId: 1, status: 1, reminded1DayBefore: 1 });
bloodDonationRegistrationSchema.index({ eventId: 1, status: 1, remindedUpcoming: 1 });

module.exports = mongoose.model('BloodDonationRegistration', bloodDonationRegistrationSchema);


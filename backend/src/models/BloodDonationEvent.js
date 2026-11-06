const mongoose = require('mongoose');

/**
 * Schema: BloodDonationEvent (Sự kiện / Đợt hiến máu tình nguyện & khẩn cấp)
 * Do Quản trị viên (ADMIN) hoặc Cán bộ địa phương (LOCAL_AUTHORITY) khởi tạo.
 * Khi tạo sự kiện, hệ thống sẽ tự động gửi thông báo tới các tình nguyện viên
 * đã đăng ký hiến máu trước đó (PENDING) để họ xem địa điểm, ngày giờ và xác nhận tham gia.
 */
const bloodDonationEventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Tên sự kiện hiến máu là bắt buộc'],
      trim: true,
      maxlength: [200, 'Tên sự kiện không quá 200 ký tự'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    locationName: {
      type: String,
      required: [true, 'Tên địa điểm tổ chức hiến máu là bắt buộc'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'Địa chỉ chi tiết điểm hiến máu là bắt buộc'],
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
    eventDate: {
      type: Date,
      required: [true, 'Ngày tổ chức hiến máu là bắt buộc'],
    },
    startTime: {
      type: String,
      required: [true, 'Giờ bắt đầu là bắt buộc'],
      default: '07:30',
      trim: true,
    },
    endTime: {
      type: String,
      required: [true, 'Giờ kết thúc là bắt buộc'],
      default: '11:30',
      trim: true,
    },
    neededBloodTypes: {
      type: [String],
      default: ['ALL'],
    },
    targetDonors: {
      type: Number,
      default: 100,
      min: 1,
    },
    organizerName: {
      type: String,
      default: 'Ban Chỉ Huy Cứu Nạn & Hội Chữ Thập Đỏ',
      trim: true,
    },
    contactPhone: {
      type: String,
      default: '',
      trim: true,
    },
    requirements: {
      type: String,
      default: 'Mang theo CCCD/Giấy tờ tùy thân, ăn sáng nhẹ, không thức khuya hoặc dùng đồ uống có cồn trước khi hiến máu.',
      trim: true,
    },
    urgencyLevel: {
      type: String,
      enum: ['NORMAL', 'HIGH', 'CRITICAL'],
      default: 'HIGH',
    },
    scope: {
      type: String,
      enum: ['ALL', 'PROVINCE', 'WARD'],
      default: 'WARD',
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      default: null,
    },
    areaName: {
      type: String,
      trim: true,
      default: 'Toàn hệ thống',
    },
    provinceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      default: null,
    },
    provinceName: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    creatorRole: {
      type: String,
      enum: ['ADMIN', 'LOCAL_AUTHORITY'],
      default: 'ADMIN',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'CLOSED', 'CANCELLED'],
      default: 'ACTIVE',
    },
    stats: {
      totalNotified: { type: Number, default: 0 },
      confirmedCount: { type: Number, default: 0 },
      declinedCount: { type: Number, default: 0 },
      completedCount: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    collection: 'blood_donation_events',
  }
);

bloodDonationEventSchema.index({ status: 1, eventDate: 1, createdAt: -1 });
bloodDonationEventSchema.index({ areaId: 1, status: 1 });

module.exports = mongoose.model('BloodDonationEvent', bloodDonationEventSchema);


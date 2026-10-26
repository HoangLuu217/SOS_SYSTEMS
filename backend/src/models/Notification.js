const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người nhận thông báo (userId) là bắt buộc'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      default: null,
    },
    areaName: {
      type: String,
      trim: true,
      default: null,
    },
    sosId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SosRequest',
      default: null,
    },
    type: {
      type: String,
      required: [true, 'Loại thông báo (type) là bắt buộc'],
      trim: true,
      uppercase: true,
    },
    title: {
      type: String,
      required: [true, 'Tiêu đề thông báo là bắt buộc'],
      trim: true,
      maxlength: [200, 'Tiêu đề không quá 200 ký tự'],
    },
    content: {
      type: String,
      required: [true, 'Nội dung thông báo là bắt buộc'],
      trim: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'NORMAL', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'NORMAL',
    },
    imageUrl: {
      type: String,
      trim: true,
      default: null,
    },
    articleUrl: {
      type: String,
      trim: true,
      default: null,
    },
    sourceName: {
      type: String,
      trim: true,
      default: null,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: false,
    collection: 'notifications',
  }
);

// Indexes
notificationSchema.index({ userId: 1 });
notificationSchema.index({ isRead: 1 });
notificationSchema.index({ areaId: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

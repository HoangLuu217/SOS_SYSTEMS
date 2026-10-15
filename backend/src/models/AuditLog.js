const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // Nullable nếu action do hệ thống/cron tự động kích hoạt
    },
    actorRole: {
      type: String,
      trim: true,
      default: null,
    },
    action: {
      type: String,
      required: [true, 'Hành động ghi vết (action) là bắt buộc'],
      trim: true,
      uppercase: true,
    },
    entityType: {
      type: String,
      required: [true, 'Loại thực thể tác động (entityType) là bắt buộc'],
      trim: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      default: null,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: false,
    collection: 'audit_logs',
  }
);

// Indexes
auditLogSchema.index({ actorId: 1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ areaId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

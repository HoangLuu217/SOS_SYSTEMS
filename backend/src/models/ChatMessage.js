const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'senderId là bắt buộc'],
    },
    senderName: {
      type: String,
      trim: true,
      default: '',
    },
    senderRole: {
      type: String,
      trim: true,
      default: 'LOCAL_AUTHORITY',
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null nếu là tin nhắn trong kênh chung
    },
    channel: {
      type: String,
      trim: true,
      default: 'COMMAND_GENERAL', // COMMAND_GENERAL hoặc conversation_{id1}_{id2}
      index: true,
    },
    content: {
      type: String,
      required: [true, 'Nội dung tin nhắn không được để trống'],
      trim: true,
    },
    attachments: [
      {
        url: { type: String, trim: true },
        fileType: { type: String, trim: true },
        fileName: { type: String, trim: true },
      },
    ],
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
    collection: 'chat_messages',
  }
);

chatMessageSchema.index({ channel: 1, createdAt: 1 });
chatMessageSchema.index({ senderId: 1, recipientId: 1 });
chatMessageSchema.index({ recipientId: 1, createdAt: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);

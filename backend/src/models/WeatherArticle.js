const mongoose = require('mongoose');

/**
 * Weather article document written by the n8n workflow to `weather_articles`.
 * Legacy camelCase fields stay available for the existing weather-notification API.
 */
const weatherArticleSchema = new mongoose.Schema(
  {
    // Canonical fields from the n8n Article Schema / MongoDB Insert node.
    is_weather_vietnam: {
      type: Boolean,
      default: true,
    },
    title: {
      type: String,
      required: [true, 'Tiêu đề bài viết là bắt buộc'],
      trim: true,
      maxlength: [300, 'Tiêu đề không quá 300 ký tự'],
    },
    summary: {
      type: String,
      trim: true,
      default: '',
    },
    content: {
      type: String,
      required: [true, 'Nội dung bài viết là bắt buộc'],
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      enum: [
        'du_bao',
        'canh_bao',
        'bao_ap_thap',
        'mua_lu',
        'nang_nong',
        'ret_dam',
        'khong_khi',
        'khac',
        // Retain categories used by older clients.
        'bao',
        'sat_lo',
        'thoi_tiet',
      ],
      default: 'khac',
    },
    regions: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    relevance_score: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    ai_reason: {
      type: String,
      trim: true,
      default: '',
    },
    original_title: {
      type: String,
      trim: true,
      default: null,
    },
    source_url: {
      type: String,
      trim: true,
      default: undefined,
    },
    source_name: {
      type: String,
      trim: true,
      default: null,
    },
    image_url: {
      type: String,
      trim: true,
      default: null,
    },
    published_at: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'ACTIVE', 'ARCHIVED'],
      default: 'pending',
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    reviewed_by: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    reviewed_at: {
      type: Date,
      default: null,
    },

    // Compatibility fields used by the current SOS weather-notification API.
    imageUrl: {
      type: String,
      trim: true,
      default: null,
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    area: {
      type: String,
      trim: true,
      default: '',
    },
    articleUrl: {
      type: String,
      trim: true,
      default: null,
    },
    articleTitle: {
      type: String,
      trim: true,
      default: null,
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdministrativeArea',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    broadcastId: {
      type: String,
      default: null,
    },
    // Legacy aliases accepted from older crawler/bot payloads.
    weatherType: { type: String, trim: true },
    areaName: { type: String, trim: true },
    sourceName: { type: String, trim: true },
    reason: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: 'weather_articles',
  }
);

// Keep the n8n field names canonical while synchronizing the legacy API aliases.
weatherArticleSchema.pre('validate', function () {
  if (!this.category && this.weatherType) this.category = this.weatherType.toLowerCase();

  if (this.relevance_score == null && this.score != null) this.relevance_score = this.score;
  if (this.score == null && this.relevance_score != null) this.score = this.relevance_score;

  if (!this.regions?.length && (this.area || this.areaName)) {
    this.regions = [this.area || this.areaName];
  }
  if (!this.area && this.regions?.length) this.area = this.regions[0];
  if (!this.area && this.areaName) this.area = this.areaName;

  if (!this.source_url && this.articleUrl) this.source_url = this.articleUrl;
  if (!this.articleUrl && this.source_url) this.articleUrl = this.source_url;
  if (!this.original_title && this.articleTitle) this.original_title = this.articleTitle;
  if (!this.articleTitle && this.original_title) this.articleTitle = this.original_title;
  if (!this.source_name && this.sourceName) this.source_name = this.sourceName;
  if (!this.sourceName && this.source_name) this.sourceName = this.source_name;
  if (!this.image_url && this.imageUrl) this.image_url = this.imageUrl;
  if (!this.imageUrl && this.image_url) this.imageUrl = this.image_url;
  if (!this.ai_reason && this.reason) this.ai_reason = this.reason;
  if (!this.reason && this.ai_reason) this.reason = this.ai_reason;
});

// Indexes for feed retrieval, review queues, and duplicate-source lookup.
weatherArticleSchema.index({ created_at: -1 });
weatherArticleSchema.index({ published_at: -1 });
weatherArticleSchema.index({ category: 1, published_at: -1 });
weatherArticleSchema.index({ regions: 1 });
weatherArticleSchema.index({ relevance_score: -1 });
weatherArticleSchema.index({ status: 1, created_at: -1 });
weatherArticleSchema.index({ source_url: 1 });

const WeatherArticle =
  mongoose.models.WeatherArticle || mongoose.model('WeatherArticle', weatherArticleSchema);

// Đăng ký alias nếu chưa có để tương thích ngược khi gọi mongoose.model(...)
if (!mongoose.models['weather_article']) {
  mongoose.model('weather_article', weatherArticleSchema);
}
if (!mongoose.models['WeatherNotification']) {
  mongoose.model('WeatherNotification', weatherArticleSchema);
}

module.exports = WeatherArticle;

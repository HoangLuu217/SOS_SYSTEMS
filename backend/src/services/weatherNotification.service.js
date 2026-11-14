const mongoose = require('mongoose');
const { WeatherNotification, AdministrativeArea } = require('../models');
const ApiError = require('../utils/apiError');
const weatherArticleRealtimeService = require('./weatherArticleRealtime.service');

const parsePublishedAt = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, 'Ngày đăng bài trên báo không hợp lệ');
  }
  return date;
};

const getPublishedAtInput = (data) => (
  Object.prototype.hasOwnProperty.call(data, 'publishedAt')
    ? data.publishedAt
    : data.published_at
);

class WeatherNotificationService {
  /**
   * Lấy danh sách thông báo thời tiết (có bộ lọc và phân trang)
   */
  async getWeatherNotifications(query = {}) {
    const isAll = query.all === 'true' || query.all === true;
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = isAll
      ? 1000
      : Math.min(500, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = isAll ? 0 : (page - 1) * limit;

    const filter = {};

    // Lọc theo trạng thái bài viết
    if (query.status === 'activated' || query.activated === 'true') {
      // Chỉ lấy các bài viết thời tiết đã được kích hoạt qua thông báo (có broadcastId hoặc status là approved / ACTIVE)
      filter.status = { $nin: ['pending', 'rejected', 'ARCHIVED', 'archived'] };
      filter.$or = [
        { broadcastId: { $exists: true, $ne: null } },
        { status: { $in: ['approved', 'APPROVED', 'ACTIVE', 'active'] } },
      ];
    } else if (
      query.status === 'approved' ||
      query.status === 'APPROVED' ||
      query.status === 'active' ||
      query.status === 'ACTIVE'
    ) {
      filter.status = { $in: ['approved', 'APPROVED', 'ACTIVE', 'active'] };
    } else if (query.status === 'pending' || query.status === 'PENDING') {
      filter.status = { $in: ['pending', 'PENDING'] };
    } else if (
      query.status === 'archived' ||
      query.status === 'ARCHIVED' ||
      query.status === 'rejected' ||
      query.status === 'REJECTED'
    ) {
      filter.status = { $in: ['ARCHIVED', 'archived', 'rejected', 'REJECTED'] };
    } else if (query.status && query.status !== 'ALL') {
      const statuses = String(query.status)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const variations = [];
      for (const s of statuses) {
        if (s.toLowerCase() === 'approved' || s.toLowerCase() === 'active') {
          variations.push('approved', 'APPROVED', 'ACTIVE', 'active');
        } else if (s.toLowerCase() === 'pending') {
          variations.push('pending', 'PENDING');
        } else if (s.toLowerCase() === 'archived' || s.toLowerCase() === 'rejected') {
          variations.push('ARCHIVED', 'archived', 'rejected', 'REJECTED');
        } else {
          variations.push(s, s.toLowerCase(), s.toUpperCase());
        }
      }
      filter.status = { $in: Array.from(new Set(variations)) };
    }

    // Lọc theo danh mục (category hoặc weatherType)
    const categoryParam = query.category || query.weatherType;
    if (categoryParam && categoryParam !== 'ALL') {
      filter.$or = [
        { category: categoryParam },
        { category: categoryParam.toLowerCase() },
      ];
    }

    // Lọc theo khu vực (area hoặc areaName)
    const areaParam = query.area || query.areaName;
    if (areaParam && areaParam !== 'ALL') {
      filter.area = { $regex: areaParam.trim(), $options: 'i' };
    }

    if (query.areaId && query.areaId !== 'ALL' && mongoose.Types.ObjectId.isValid(query.areaId)) {
      filter.areaId = query.areaId;
    }

    if (query.search && query.search.trim()) {
      const q = query.search.trim();
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } },
        { area: { $regex: q, $options: 'i' } },
        { articleTitle: { $regex: q, $options: 'i' } },
      ];
    }

    // Tùy chọn sắp xếp (Mặc định: Bản tin thời tiết mới nhất xếp trước)
    let sortOptions = { published_at: -1, createdAt: -1 };
    if (query.sortBy === 'score') {
      sortOptions = { score: -1, relevance_score: -1, published_at: -1, createdAt: -1 };
    } else if (query.sortBy === 'createdAt') {
      sortOptions = { createdAt: -1, published_at: -1 };
    } else if (query.sortBy === 'publishedAt') {
      sortOptions = { published_at: -1, createdAt: -1 };
    }

    const [items, total, statusAgg] = await Promise.all([
      WeatherNotification.find(filter)
        .populate('createdBy', 'fullName phone roles')
        .populate('areaId', 'name code type')
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),
      WeatherNotification.countDocuments(filter),
      WeatherNotification.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const counts = {
      total: 0,
      approved: 0,
      pending: 0,
      archived: 0,
    };
    statusAgg.forEach((item) => {
      counts.total += item.count;
      const s = (item._id || '').toLowerCase();
      if (s === 'approved' || s === 'active') {
        counts.approved += item.count;
      } else if (s === 'pending') {
        counts.pending += item.count;
      } else if (s === 'archived' || s === 'rejected') {
        counts.archived += item.count;
      }
    });

    const totalPages = isAll ? 1 : (Math.ceil(total / limit) || 1);

    return {
      items,
      pagination: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        totalPages,
        counts,
      },
    };
  }

  /**
   * Lấy chi tiết một thông báo thời tiết theo ID
   */
  async getWeatherNotificationById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID thông báo thời tiết không hợp lệ');
    }

    const item = await WeatherNotification.findById(id)
      .populate('createdBy', 'fullName phone roles')
      .populate('areaId', 'name code type')
      .lean();

    if (!item) {
      throw new ApiError(404, 'Không tìm thấy thông báo thời tiết');
    }

    return item;
  }

  /**
   * Tạo bản tin thông báo thời tiết mới
   */
  async createWeatherNotification(data, user) {
    const {
      title,
      content,
      category = 'mua_lu',
      score = 0,
      area = '',
      imageUrl,
      articleUrl,
      articleTitle,
      areaId,
      areaName,
      weatherType,
      sourceName,
    } = data;
    const publishedAt = parsePublishedAt(getPublishedAtInput(data));

    if (!title || !title.trim()) {
      throw new ApiError(400, 'Tiêu đề thông báo thời tiết là bắt buộc');
    }
    if (!content || !content.trim()) {
      throw new ApiError(400, 'Nội dung thông báo thời tiết là bắt buộc');
    }

    let resolvedArea = area || areaName || '';
    if (areaId && !resolvedArea) {
      const areaDoc = await AdministrativeArea.findById(areaId).select('name').lean();
      if (areaDoc) {
        resolvedArea = areaDoc.name;
      }
    }

    const resolvedSummary = data.summary ? data.summary.trim() : content.trim().slice(0, 250);
    const resolvedRegions = Array.isArray(data.regions) && data.regions.length > 0
      ? data.regions
      : (resolvedArea ? [resolvedArea] : []);

    const doc = new WeatherNotification({
      title: title.trim(),
      content: content.trim(),
      summary: resolvedSummary,
      category: category || weatherType || 'mua_lu',
      score: typeof score === 'number' ? score : (Number(score) || 0),
      relevance_score: typeof score === 'number' ? score : (Number(score) || 0),
      area: resolvedArea.trim(),
      regions: resolvedRegions,
      imageUrl: imageUrl ? imageUrl.trim() : (data.image_url ? data.image_url.trim() : null),
      image_url: imageUrl ? imageUrl.trim() : (data.image_url ? data.image_url.trim() : null),
      articleUrl: articleUrl ? articleUrl.trim() : (data.source_url ? data.source_url.trim() : null),
      source_url: articleUrl ? articleUrl.trim() : (data.source_url ? data.source_url.trim() : null),
      articleTitle: articleTitle || sourceName || data.source_name || null,
      source_name: sourceName || data.source_name || null,
      original_title: articleTitle || sourceName || data.source_name || null,
      published_at: publishedAt === undefined ? new Date() : publishedAt,
      areaId: areaId && mongoose.Types.ObjectId.isValid(areaId) ? areaId : null,
      createdBy: user?._id || user?.id || null,
      status: data.status || 'ACTIVE',
      reviewed_by: (data.status === 'ACTIVE' || data.status === 'approved' || !data.status)
        ? (user?._id || user?.id || null)
        : null,
      reviewed_at: (data.status === 'ACTIVE' || data.status === 'approved' || !data.status)
        ? new Date()
        : null,
    });

    await doc.save();
    weatherArticleRealtimeService.publishArticlesUpdated({
      source: 'crud',
      reason: 'created',
      articleId: doc._id.toString(),
    });
    return doc;
  }

  /**
   * Cập nhật thông báo thời tiết
   */
  async updateWeatherNotification(id, data, user) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID thông báo thời tiết không hợp lệ');
    }

    const item = await WeatherNotification.findById(id);
    if (!item) {
      throw new ApiError(404, 'Không tìm thấy thông báo thời tiết');
    }

    const allowedFields = [
      'title',
      'content',
      'summary',
      'category',
      'score',
      'relevance_score',
      'area',
      'regions',
      'imageUrl',
      'image_url',
      'articleUrl',
      'source_url',
      'articleTitle',
      'sourceName',
      'source_name',
      'original_title',
      'published_at',
      'areaId',
      'status',
      'archivedAt',
    ];

    allowedFields.forEach((field) => {
      if (data[field] !== undefined) {
        item[field] = data[field];
      }
    });

    if (data.weatherType && !data.category) item.category = data.weatherType;
    if (data.areaName && !data.area) item.area = data.areaName;
    if (data.sourceName && !data.articleTitle) item.articleTitle = data.sourceName;
    const publishedAt = parsePublishedAt(getPublishedAtInput(data));
    if (publishedAt !== undefined) item.published_at = publishedAt;

    if (data.status === 'ACTIVE' || data.status === 'approved') {
      item.reviewed_by = user?._id || user?.id || item.reviewed_by;
      item.reviewed_at = new Date();
      item.archivedAt = null;
    } else if (data.status === 'ARCHIVED' || data.status === 'archived' || data.status === 'rejected' || data.status === 'REJECTED') {
      if (!item.archivedAt) {
        item.archivedAt = new Date();
      }
    } else if (data.status === 'pending' || data.status === 'PENDING') {
      item.archivedAt = null;
    }

    await item.save();
    weatherArticleRealtimeService.publishArticlesUpdated({
      source: 'crud',
      reason: 'updated',
      articleId: item._id.toString(),
    });
    return item;
  }

  /**
   * Hủy hoặc xóa thông báo thời tiết
   * @param {string} id - ID bài viết
   * @param {Object} options - Tùy chọn (permanent: xóa vĩnh viễn khỏi CSDL)
   */
  async deleteWeatherNotification(id, { permanent = false } = {}) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID thông báo thời tiết không hợp lệ');
    }

    if (permanent) {
      const item = await WeatherNotification.findByIdAndDelete(id);
      if (!item) {
        throw new ApiError(404, 'Không tìm thấy thông báo thời tiết');
      }

      // Xóa các bản ghi thông báo liên quan
      try {
        const { Notification } = require('../models');
        await Notification.deleteMany({
          $or: [
            { 'data.weatherArticleId': id.toString() },
            { 'data.broadcastId': item.broadcastId },
            ...(item.broadcastId && mongoose.Types.ObjectId.isValid(item.broadcastId)
              ? [{ _id: item.broadcastId }]
              : []),
          ],
        });
      } catch (delErr) {
        console.warn('Lỗi dọn dẹp Notification khi xóa vĩnh viễn bản tin:', delErr.message);
      }

      weatherArticleRealtimeService.publishArticlesUpdated({
        source: 'crud',
        reason: 'deleted',
        articleId: item._id.toString(),
      });
      return item;
    }

    const item = await WeatherNotification.findByIdAndUpdate(
      id,
      { status: 'ARCHIVED', archivedAt: new Date() },
      { returnDocument: 'after' }
    );

    if (!item) {
      throw new ApiError(404, 'Không tìm thấy thông báo thời tiết');
    }

    // Tự động xóa luôn các bản ghi thông báo (broadcast) liên quan trong bảng Notification
    try {
      const { Notification } = require('../models');
      await Notification.deleteMany({
        $or: [
          { 'data.weatherArticleId': id.toString() },
          { 'data.broadcastId': item.broadcastId },
          ...(item.broadcastId && mongoose.Types.ObjectId.isValid(item.broadcastId)
            ? [{ _id: item.broadcastId }]
            : []),
        ],
      });
    } catch (delErr) {
      console.warn('Lỗi dọn dẹp Notification liên kết khi lưu trữ bản tin thời tiết:', delErr.message);
    }

    weatherArticleRealtimeService.publishArticlesUpdated({
      source: 'crud',
      reason: 'archived',
      articleId: item._id.toString(),
    });
    return item;
  }

  /**
   * Tự động quét và xóa vĩnh viễn các bản tin thời tiết:
   * 1. Bản tin trong kho lưu trữ (ARCHIVED / rejected): Chỉ lưu trong 2 ngày, sau 2 ngày tự động xóa vĩnh viễn khỏi CSDL.
   * 2. Bản tin chưa duyệt (pending) quá 2 ngày.
   * Đồng thời tự động dọn dẹp toàn bộ Notification liên kết trong CSDL.
   * Chạy tự động ngầm không cần nút bấm.
   * @param {number} daysThreshold - Số ngày lưu trữ tối đa (mặc định: 2 ngày)
   */
  async cleanupExpiredWeatherArticles(daysThreshold = 2) {
    const thresholdDate = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000);

    const filter = {
      $or: [
        // 1. Bản tin lưu trữ / từ chối: Chỉ lưu trong 2 ngày rồi tự động xóa luôn
        {
          status: { $in: ['ARCHIVED', 'archived', 'rejected', 'REJECTED'] },
          $or: [
            { archivedAt: { $lt: thresholdDate, $ne: null } },
            { archivedAt: null, updatedAt: { $lt: thresholdDate } },
            { archivedAt: null, updatedAt: { $exists: false }, createdAt: { $lt: thresholdDate } },
          ],
        },
        // 2. Bản tin chưa duyệt (pending) quá 2 ngày
        {
          status: { $in: ['pending', 'PENDING'] },
          $or: [
            { published_at: { $lt: thresholdDate, $ne: null } },
            { published_at: null, createdAt: { $lt: thresholdDate } },
          ],
        },
      ],
    };

    const targetArticles = await WeatherNotification.find(filter)
      .select('_id broadcastId status title')
      .lean();

    if (!targetArticles || targetArticles.length === 0) {
      return { totalDeleted: 0, archivedDeleted: 0, pendingDeleted: 0 };
    }

    const idsToDelete = targetArticles.map((a) => a._id);
    const broadcastIds = targetArticles.map((a) => a.broadcastId).filter(Boolean);

    let archivedDeleted = 0;
    let pendingDeleted = 0;
    targetArticles.forEach((a) => {
      const s = (a.status || '').toLowerCase();
      if (s === 'archived' || s === 'rejected') {
        archivedDeleted++;
      } else {
        pendingDeleted++;
      }
    });

    const result = await WeatherNotification.deleteMany({ _id: { $in: idsToDelete } });

    // Dọn dẹp Notification liên quan
    try {
      const { Notification } = require('../models');
      await Notification.deleteMany({
        $or: [
          { 'data.weatherArticleId': { $in: idsToDelete.map((id) => id.toString()) } },
          ...(broadcastIds.length > 0
            ? [{ 'data.broadcastId': { $in: broadcastIds } }, { _id: { $in: broadcastIds } }]
            : []),
        ],
      });
    } catch (delErr) {
      console.warn('⚠️ Lỗi dọn dẹp Notification liên kết khi dọn rác bản tin thời tiết:', delErr.message);
    }

    console.log(
      `🧹 [Weather Auto-Cleanup] Đã tự động xóa vĩnh viễn ${result.deletedCount} bản tin quá ${daysThreshold} ngày (${archivedDeleted} tin lưu trữ, ${pendingDeleted} tin pending).`
    );

    if (result.deletedCount > 0) {
      weatherArticleRealtimeService.publishArticlesUpdated({
        source: 'cleanup',
        reason: 'cleanup_expired',
        deletedCount: result.deletedCount,
      });
    }

    return {
      totalDeleted: result.deletedCount,
      archivedDeleted,
      pendingDeleted,
    };
  }

  /**
   * Tương thích ngược: dọn dẹp các bản tin quá hạn
   */
  async cleanupExpiredPendingArticles(daysThreshold = 2) {
    const res = await this.cleanupExpiredWeatherArticles(daysThreshold);
    return res.totalDeleted;
  }
}

module.exports = new WeatherNotificationService();

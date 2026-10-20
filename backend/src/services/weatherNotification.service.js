const mongoose = require('mongoose');
const { WeatherNotification, AdministrativeArea } = require('../models');
const ApiError = require('../utils/apiError');

class WeatherNotificationService {
  /**
   * Lấy danh sách thông báo thời tiết (có bộ lọc và phân trang)
   */
  async getWeatherNotifications(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = {};

    if (query.status && query.status !== 'ALL') {
      filter.status = query.status.toUpperCase();
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

    const [items, total] = await Promise.all([
      WeatherNotification.find(filter)
        .populate('createdBy', 'fullName phone roles')
        .populate('areaId', 'name code type')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WeatherNotification.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages,
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
      areaId: areaId && mongoose.Types.ObjectId.isValid(areaId) ? areaId : null,
      createdBy: user?._id || null,
      status: data.status || 'ACTIVE',
    });

    await doc.save();
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
      'areaId',
      'status',
    ];

    allowedFields.forEach((field) => {
      if (data[field] !== undefined) {
        item[field] = data[field];
      }
    });

    if (data.weatherType && !data.category) item.category = data.weatherType;
    if (data.areaName && !data.area) item.area = data.areaName;
    if (data.sourceName && !data.articleTitle) item.articleTitle = data.sourceName;

    await item.save();
    return item;
  }

  /**
   * Hủy hoặc xóa thông báo thời tiết
   */
  async deleteWeatherNotification(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID thông báo thời tiết không hợp lệ');
    }

    const item = await WeatherNotification.findByIdAndUpdate(
      id,
      { status: 'ARCHIVED' },
      { new: true }
    );

    if (!item) {
      throw new ApiError(404, 'Không tìm thấy thông báo thời tiết');
    }

    return item;
  }
}

module.exports = new WeatherNotificationService();

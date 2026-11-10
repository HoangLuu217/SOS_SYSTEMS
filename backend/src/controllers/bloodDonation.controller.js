const bloodDonationService = require('../services/bloodDonation.service');
const { sendSuccess } = require('../utils/apiResponse');

class BloodDonationController {
  /**
   * POST /blood-donations/register
   * Người dân đăng ký hiến máu trước (trạng thái PENDING)
   */
  async registerPending(req, res, next) {
    try {
      const registration = await bloodDonationService.registerPending(req.user, req.body);
      return sendSuccess(
        res,
        201,
        'Đã ghi nhận đăng ký tình nguyện hiến máu thành công',
        registration
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /blood-donations/register/cancel
   * Người dân hủy đăng ký chờ trước
   */
  async cancelPreRegistration(req, res, next) {
    try {
      const registration = await bloodDonationService.cancelPreRegistration(req.user);
      return sendSuccess(res, 200, 'Đã hủy đăng ký hiến máu chờ trước', registration);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /blood-donations/me
   * Lấy trạng thái đăng ký hiến máu của tôi & danh sách sự kiện đang mở
   */
  async getMyStatus(req, res, next) {
    try {
      const result = await bloodDonationService.getMyStatus(req.user, req.query);
      return sendSuccess(
        res,
        200,
        'Lấy thông tin đăng ký và sự kiện hiến máu thành công',
        result
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /blood-donations/registrations
   * Danh sách các đăng ký hiến máu (Dành cho ADMIN & LOCAL_AUTHORITY)
   */
  async listRegistrations(req, res, next) {
    try {
      const result = await bloodDonationService.listRegistrations(req.user, req.query);
      return sendSuccess(
        res,
        200,
        'Lấy danh sách đăng ký hiến máu thành công',
        result.items,
        result.pagination
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /blood-donations/registrations/:id/status
   * Cập nhật trạng thái đăng ký hiến máu (ADMIN & LOCAL_AUTHORITY)
   */
  async updateRegistrationStatus(req, res, next) {
    try {
      const result = await bloodDonationService.updateRegistrationStatus(
        req.user,
        req.params.id,
        req.body
      );
      return sendSuccess(res, 200, 'Cập nhật trạng thái đăng ký thành công', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /blood-donations/events
   * Tạo sự kiện hiến máu & gửi thông báo cho những người đã đăng ký trước (ADMIN & LOCAL_AUTHORITY)
   */
  async createEvent(req, res, next) {
    try {
      const event = await bloodDonationService.createEvent(req.user, req.body);
      return sendSuccess(
        res,
        201,
        'Đã tạo sự kiện hiến máu và gửi thông báo tới các tình nguyện viên đã đăng ký',
        event
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /blood-donations/events
   * Lấy danh sách các sự kiện hiến máu
   */
  async listEvents(req, res, next) {
    try {
      const result = await bloodDonationService.listEvents(req.user, req.query);
      return sendSuccess(
        res,
        200,
        'Lấy danh sách sự kiện hiến máu thành công',
        result.items,
        result.pagination
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /blood-donations/events/:id
   * Xem chi tiết sự kiện hiến máu và danh sách phản hồi
   */
  async getEventDetail(req, res, next) {
    try {
      const result = await bloodDonationService.getEventDetail(req.user, req.params.id);
      return sendSuccess(res, 200, 'Lấy chi tiết sự kiện hiến máu thành công', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /blood-donations/events/:id/respond
   * Người dân xác nhận tham gia (CONFIRMED) hoặc từ chối (DECLINED) sự kiện hiến máu
   */
  async respondToEvent(req, res, next) {
    try {
      const result = await bloodDonationService.respondToEvent(
        req.user,
        req.params.id,
        req.body
      );
      const msg =
        result.registration.status === 'CONFIRMED'
          ? 'Đã xác nhận đăng ký tham gia hiến máu tại điểm này!'
          : result.registration.status === 'CANCELLED'
          ? 'Đã hủy đăng ký tham gia đợt hiến máu này.'
          : 'Đã ghi nhận phản hồi chưa thể tham gia đợt này.';
      return sendSuccess(res, 200, msg, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /blood-donations/events/:id/status
   * Đóng hoặc mở lại sự kiện hiến máu
   */
  async updateEventStatus(req, res, next) {
    try {
      const result = await bloodDonationService.updateEventStatus(
        req.user,
        req.params.id,
        req.body.status || 'CLOSED'
      );
      return sendSuccess(res, 200, 'Đã cập nhật trạng thái sự kiện hiến máu', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /blood-donations/events/:id
   * Xóa sự kiện hiến máu
   */
  async deleteEvent(req, res, next) {
    try {
      const result = await bloodDonationService.deleteEvent(req.user, req.params.id);
      return sendSuccess(res, 200, result.message, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /blood-donations/geocode/search?q=...
   * Tìm kiếm vị trí, địa chỉ qua Nominatim & Photon (tránh lỗi CORS và 403 ở client)
   */
  async searchLocation(req, res) {
    try {
      const q = (req.query.q || '').trim();
      if (!q) {
        return sendSuccess(res, 200, 'Thành công', []);
      }

      let results = [];

      // 1. Thử gọi Nominatim trước với User-Agent chuẩn
      try {
        const osmRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            q
          )}&countrycodes=vn&limit=5&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'SosSystem-App/1.0 (contact@sos.local)',
            },
          }
        );
        if (osmRes.ok) {
          const osmData = await osmRes.json();
          if (Array.isArray(osmData) && osmData.length > 0) {
            results = osmData.map((d) => ({
              place_id: d.place_id,
              display_name: d.display_name,
              lat: String(d.lat),
              lon: String(d.lon),
            }));
          }
        }
      } catch (_) {}

      // 2. Nếu Nominatim chưa có kết quả, fallback gọi Photon API
      if (results.length === 0) {
        try {
          const photonRes = await fetch(
            `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`
          );
          if (photonRes.ok) {
            const photonData = await photonRes.json();
            if (photonData.features && photonData.features.length > 0) {
              results = photonData.features.map((f) => {
                const props = f.properties || {};
                const parts = [
                  props.name,
                  props.street,
                  props.city,
                  props.state,
                  props.country,
                ].filter(Boolean);
                return {
                  place_id: f.properties.osm_id || Math.random(),
                  display_name: parts.join(', ') || props.name,
                  lat: String(f.geometry.coordinates[1]),
                  lon: String(f.geometry.coordinates[0]),
                };
              });
            }
          }
        } catch (_) {}
      }

      return sendSuccess(res, 200, 'Tìm kiếm vị trí thành công', results);
    } catch (err) {
      return sendSuccess(res, 200, 'Lỗi tìm kiếm vị trí', []);
    }
  }

  /**
   * GET /blood-donations/geocode/reverse?lat=...&lng=...
   * Tra cứu tên địa chỉ từ tọa độ
   */
  async reverseLocation(req, res) {
    try {
      const { lat, lng } = req.query;
      if (!lat || !lng) {
        return sendSuccess(res, 200, 'Thành công', '');
      }

      const osmRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'SosSystem-App/1.0 (contact@sos.local)',
          },
        }
      );
      if (osmRes.ok) {
        const data = await osmRes.json();
        return sendSuccess(res, 200, 'Tra cứu địa chỉ thành công', data.display_name || '');
      }
      return sendSuccess(res, 200, 'Không tìm thấy địa chỉ', '');
    } catch (err) {
      return sendSuccess(res, 200, 'Lỗi tra cứu địa chỉ', '');
    }
  }
}

module.exports = new BloodDonationController();


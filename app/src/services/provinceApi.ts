/**
 * Service tích hợp Vietnam Provinces online API (2025)
 * Tài liệu ReDoc: https://provinces.open-api.vn/api/v2/redoc
 * OpenAPI: https://provinces.open-api.vn/api/v2/openapi.json
 */

export interface Province {
  code: number;
  name: string;
  division_type?: string;
  codename?: string;
  phone_code?: number;
}

export interface Ward {
  code: number;
  name: string;
  division_type?: string;
  codename?: string;
  province_code: number;
}

const BASE_URL = 'https://provinces.open-api.vn/api/v2';

// Danh sách dự phòng 34 Tỉnh/Thành phố chuẩn 2025 trong trường hợp thiết bị mất mạng
export const FALLBACK_PROVINCES: Province[] = [
  { code: 1, name: 'Thành phố Hà Nội' },
  { code: 79, name: 'Thành phố Hồ Chí Minh' },
  { code: 31, name: 'Thành phố Hải Phòng' },
  { code: 48, name: 'Thành phố Đà Nẵng' },
  { code: 92, name: 'Thành phố Cần Thơ' },
  { code: 46, name: 'Thành phố Huế' },
  { code: 22, name: 'Thành phố Quảng Ninh' },
  { code: 24, name: 'Thành phố Bắc Ninh' },
  { code: 75, name: 'Thành phố Đồng Nai' },
  { code: 4, name: 'Tỉnh Cao Bằng' },
  { code: 8, name: 'Tỉnh Tuyên Quang' },
  { code: 11, name: 'Tỉnh Điện Biên' },
  { code: 12, name: 'Tỉnh Lai Châu' },
  { code: 14, name: 'Tỉnh Sơn La' },
  { code: 15, name: 'Tỉnh Lào Cai' },
  { code: 19, name: 'Tỉnh Thái Nguyên' },
  { code: 20, name: 'Tỉnh Lạng Sơn' },
  { code: 25, name: 'Tỉnh Phú Thọ' },
  { code: 33, name: 'Tỉnh Hưng Yên' },
  { code: 37, name: 'Tỉnh Ninh Bình' },
  { code: 38, name: 'Tỉnh Thanh Hóa' },
  { code: 40, name: 'Tỉnh Nghệ An' },
  { code: 42, name: 'Tỉnh Hà Tĩnh' },
  { code: 44, name: 'Tỉnh Quảng Trị' },
  { code: 51, name: 'Tỉnh Quảng Ngãi' },
  { code: 52, name: 'Tỉnh Gia Lai' },
  { code: 56, name: 'Tỉnh Khánh Hòa' },
  { code: 66, name: 'Tỉnh Đắk Lắk' },
  { code: 68, name: 'Tỉnh Lâm Đồng' },
  { code: 80, name: 'Tỉnh Tây Ninh' },
  { code: 82, name: 'Tỉnh Đồng Tháp' },
  { code: 86, name: 'Tỉnh Vĩnh Long' },
  { code: 91, name: 'Tỉnh An Giang' },
  { code: 96, name: 'Tỉnh Cà Mau' },
];

// Danh sách dự phòng Phường/Xã cho các tỉnh thành trọng điểm khi mạng yếu
export const FALLBACK_WARDS: Record<number, Ward[]> = {
  48: [
    { code: 20194, name: 'Phường Hải Vân', province_code: 48 },
    { code: 20197, name: 'Phường Liên Chiểu', province_code: 48 },
    { code: 20200, name: 'Phường Hòa Khánh Bắc', province_code: 48 },
    { code: 20203, name: 'Phường Hòa Khánh Nam', province_code: 48 },
    { code: 20206, name: 'Phường Hòa Minh', province_code: 48 },
    { code: 20209, name: 'Phường Thạch Thang', province_code: 48 },
    { code: 20212, name: 'Phường Hải Châu 1', province_code: 48 },
    { code: 20215, name: 'Phường Hải Châu 2', province_code: 48 },
    { code: 20218, name: 'Phường Thuận Phước', province_code: 48 },
    { code: 20221, name: 'Phường Hòa Thuận Tây', province_code: 48 },
    { code: 20224, name: 'Phường An Hải Bắc', province_code: 48 },
    { code: 20227, name: 'Phường An Hải Tây', province_code: 48 },
    { code: 20230, name: 'Phường Khuê Mỹ', province_code: 48 },
    { code: 20233, name: 'Xã Hòa Khương', province_code: 48 },
    { code: 20236, name: 'Xã Hòa Tiến', province_code: 48 },
    { code: 20239, name: 'Xã Hòa Phong', province_code: 48 },
    { code: 20242, name: 'Xã Hòa Vang', province_code: 48 },
  ],
  1: [
    { code: 101, name: 'Phường Hàng Bạc', province_code: 1 },
    { code: 102, name: 'Phường Tràng Tiền', province_code: 1 },
    { code: 103, name: 'Phường Bách Khoa', province_code: 1 },
    { code: 104, name: 'Phường Dịch Vọng', province_code: 1 },
    { code: 105, name: 'Phường Mỹ Đình 1', province_code: 1 },
    { code: 106, name: 'Phường Mỹ Đình 2', province_code: 1 },
  ],
  79: [
    { code: 7901, name: 'Phường Bến Nghé', province_code: 79 },
    { code: 7902, name: 'Phường Bến Thành', province_code: 79 },
    { code: 7903, name: 'Phường Tân Định', province_code: 79 },
    { code: 7904, name: 'Phường Thảo Điền', province_code: 79 },
    { code: 7905, name: 'Phường An Phú', province_code: 79 },
  ],
  46: [
    { code: 4601, name: 'Phường Vĩnh Ninh', province_code: 46 },
    { code: 4602, name: 'Phường Phú Nhuận', province_code: 46 },
    { code: 4603, name: 'Phường Thuận Lộc', province_code: 46 },
    { code: 4604, name: 'Phường Hương Long', province_code: 46 },
  ],
  44: [
    { code: 4401, name: 'Phường 1 (TP. Đông Hà)', province_code: 44 },
    { code: 4402, name: 'Phường 2 (TP. Đông Hà)', province_code: 44 },
    { code: 4403, name: 'Xã Triệu Phong', province_code: 44 },
    { code: 4404, name: 'Xã Hải Lăng', province_code: 44 },
  ],
  51: [
    { code: 5101, name: 'Phường Lê Hồng Phong', province_code: 51 },
    { code: 5102, name: 'Phường Trần Phú', province_code: 51 },
    { code: 5103, name: 'Phường Nghĩa Chánh', province_code: 51 },
    { code: 5104, name: 'Huyện Bình Sơn', province_code: 51 },
  ],
};

class ProvinceApiService {
  private provincesCache: Province[] | null = null;
  private wardsCache: Map<number, Ward[]> = new Map();

  /**
   * Lấy danh sách Tỉnh/Thành phố từ API v2 (/p/)
   */
  async getProvinces(search?: string): Promise<Province[]> {
    try {
      if (!this.provincesCache) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const url = `${BASE_URL}/p/`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          const data: Province[] = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            this.provincesCache = data;
          }
        }
      }

      const list = this.provincesCache || FALLBACK_PROVINCES;

      if (search && search.trim()) {
        const query = search.trim().toLowerCase();
        return list.filter((p) => p.name.toLowerCase().includes(query));
      }

      return list;
    } catch {
      const list = this.provincesCache || FALLBACK_PROVINCES;
      if (search && search.trim()) {
        const query = search.trim().toLowerCase();
        return list.filter((p) => p.name.toLowerCase().includes(query));
      }
      return list;
    }
  }

  /**
   * Lấy danh sách Phường/Xã theo mã Tỉnh từ API v2 (/w/?province={code})
   */
  async getWards(provinceCode: number, search?: string): Promise<Ward[]> {
    try {
      if (!provinceCode) return [];

      let wards = this.wardsCache.get(provinceCode);

      if (!wards) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const url = `${BASE_URL}/w/?province=${provinceCode}`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          const data: Ward[] = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            wards = data;
            this.wardsCache.set(provinceCode, wards);
          }
        }
      }

      const list = wards || FALLBACK_WARDS[provinceCode] || [];

      if (search && search.trim()) {
        const query = search.trim().toLowerCase();
        return list.filter((w) => w.name.toLowerCase().includes(query));
      }

      return list;
    } catch {
      const list = this.wardsCache.get(provinceCode) || FALLBACK_WARDS[provinceCode] || [];
      if (search && search.trim()) {
        const query = search.trim().toLowerCase();
        return list.filter((w) => w.name.toLowerCase().includes(query));
      }
      return list;
    }
  }
}

export const provinceApi = new ProvinceApiService();

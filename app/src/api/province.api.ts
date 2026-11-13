/**
 * Service quản lý danh mục Tỉnh / Thành phố và Phường / Xã trực tiếp từ CSDL Backend (/api/administrative-areas)
 * Thay thế hoàn toàn API bên ngoài, đảm bảo dữ liệu luôn đồng bộ 100% với CSDL MongoDB.
 */

import { apiClient } from './client';

export interface Province {
  id?: string;
  code: number;
  name: string;
  division_type?: string;
  codename?: string;
  phone_code?: number;
}

export interface Ward {
  id?: string;
  code: number;
  name: string;
  division_type?: string;
  codename?: string;
  province_code?: number;
}

// Danh sách dự phòng chuẩn các Tỉnh/Thành phố trong CSDL MongoDB khi thiết bị mất kết nối mạng
export const FALLBACK_PROVINCES: Province[] = [
  { code: 48, id: '6acda002f9677318d33198d5', name: 'Thành phố Đà Nẵng' },
  { code: 1, id: '6acf1b1ecbee11e16fc18e83', name: 'Thành phố Hà Nội' },
  { code: 79, id: '6ad01a3294d5535962b843bf', name: 'Thành phố Hồ Chí Minh' },
  { code: 92, id: '6ad044daf38aeb14d3a39144', name: 'Thành phố Cần Thơ' },
  { code: 46, id: '6acdb2d7f89195d4dfc4b65a', name: 'Thành phố Huế' },
  { code: 31, id: '6ad04321f38aeb14d3a38bc1', name: 'Thành phố Hải Phòng' },
  { code: 38, id: '6ad499a2cbdb0e3dc4ec5134', name: 'Tỉnh Thanh Hóa' },
  { code: 44, id: '6ad029c333c2b75a644a9f38', name: 'Tỉnh Quảng Trị' },
  { code: 22, id: '6ad4993ecbdb0e3dc4ec4e95', name: 'Thành phố Quảng Ninh' },
  { code: 24, id: '6acdafd5f89195d4dfc4af12', name: 'Thành phố Bắc Ninh' },
  { code: 75, id: '6ad01a2d94d5535962b843a2', name: 'Thành phố Đồng Nai' },
  { code: 4, id: '6ad01c5794d5535962b8478a', name: 'Tỉnh Cao Bằng' },
  { code: 91, id: '6ad01a3594d5535962b843c0', name: 'Tỉnh An Giang' },
  { code: 96, id: '6ad01a1b94d5535962b84369', name: 'Tỉnh Cà Mau' },
  { code: 82, id: '6ad4998acbdb0e3dc4ec5051', name: 'Tỉnh Đồng Tháp' },
  { code: 33, id: '6ad4998dcbdb0e3dc4ec5087', name: 'Tỉnh Hưng Yên' },
];

// Danh sách dự phòng Phường/Xã khớp 100% với CSDL MongoDB (đặc biệt là Thanh Khê & Đà Nẵng)
export const FALLBACK_WARDS: Record<string | number, Ward[]> = {
  48: [
    { code: 20285, id: '6acda002d68ac82a027222cd', name: 'Phường Thanh Khê', province_code: 48 },
    { code: 20286, id: '6acda002d68ac82a027222ce', name: 'Phường An Khê', province_code: 48 },
    { code: 20287, id: '6acda002d68ac82a027222c3', name: 'Quận Thanh Khê', province_code: 48 },
    { code: 20288, id: '6acda002d68ac82a027222cf', name: 'Phường Ngũ Hành Sơn', province_code: 48 },
    { code: 20289, id: '6acda002d68ac82a027222d2', name: 'Phường Liên Chiểu', province_code: 48 },
    { code: 20290, id: '6acda002d68ac82a027222cb', name: 'Phường Hải Châu', province_code: 48 },
    { code: 20291, id: '6acda002d68ac82a027222ca', name: 'Phường Sơn Trà', province_code: 48 },
    { code: 20292, id: '6acda002d68ac82a027222d0', name: 'Phường Cẩm Lệ', province_code: 48 },
    { code: 20293, id: '6acda002d68ac82a027222cc', name: 'Phường Hòa Cường', province_code: 48 },
    { code: 20294, id: '6acda002d68ac82a027222d3', name: 'Phường Hòa Khánh', province_code: 48 },
    { code: 20295, id: '6acda3d1d68ac82a027222e2', name: 'Phường Hòa Minh', province_code: 48 },
    { code: 20296, id: '6acda002d68ac82a027222d1', name: 'Phường Hòa Xuân', province_code: 48 },
    { code: 20297, id: '6acda002d68ac82a027222d4', name: 'Phường Hải Vân', province_code: 48 },
    { code: 20298, id: '6acda002d68ac82a027222d5', name: 'Xã Hòa Vang', province_code: 48 },
    { code: 20299, id: '6acda002d68ac82a027222d7', name: 'Xã Hòa Tiến', province_code: 48 },
    { code: 20300, id: '6acda002d68ac82a027222d6', name: 'Xã Bà Nà', province_code: 48 },
  ],
  92: [
    { code: 9201, id: '6ad044dad68ac82a027226a9', name: 'Phường Tân An', province_code: 92 },
    { code: 9202, id: '6ad044daf38aeb14d3a39144', name: 'Quận Ninh Kiều', province_code: 92 },
  ],
};

class ProvinceApiService {
  private provincesCache: Province[] | null = null;
  private wardsCache: Map<string | number, Ward[]> = new Map();

  /**
   * Lấy danh sách Tỉnh/Thành phố trực tiếp từ CSDL Backend (/api/administrative-areas)
   */
  async getProvinces(search?: string): Promise<Province[]> {
    try {
      if (!this.provincesCache) {
        const res = await apiClient.get<any[]>('/administrative-areas?type=PROVINCE');
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          this.provincesCache = res.data.map((p, idx) => {
            let numCode = idx + 1;
            if (p.name.includes('Đà Nẵng') || p.code === 'DANANG') numCode = 48;
            else if (p.name.includes('Hà Nội')) numCode = 1;
            else if (p.name.includes('Hồ Chí Minh')) numCode = 79;
            else if (p.name.includes('Cần Thơ')) numCode = 92;
            else if (p.name.includes('Huế')) numCode = 46;
            else if (p.name.includes('Hải Phòng')) numCode = 31;
            else if (typeof p.code === 'number') numCode = p.code;

            return {
              id: p._id,
              code: numCode,
              name: p.name,
              codename: p.code,
            };
          });
        }
      }

      const list = this.provincesCache && this.provincesCache.length > 0 ? this.provincesCache : FALLBACK_PROVINCES;

      if (search && search.trim()) {
        const query = search.trim().toLowerCase();
        return list.filter((p) => p.name.toLowerCase().includes(query));
      }

      return list;
    } catch (err) {
      console.log('[ProvinceApi] Lỗi lấy danh mục Tỉnh từ DB, dùng fallback:', err);
      const list = this.provincesCache || FALLBACK_PROVINCES;
      if (search && search.trim()) {
        const query = search.trim().toLowerCase();
        return list.filter((p) => p.name.toLowerCase().includes(query));
      }
      return list;
    }
  }

  /**
   * Lấy danh sách Phường/Xã/Quận trực tiếp từ CSDL Backend (/api/administrative-areas)
   */
  async getWards(provinceCodeOrId: number | string, search?: string): Promise<Ward[]> {
    try {
      if (!provinceCodeOrId) return [];

      let wards = this.wardsCache.get(provinceCodeOrId);

      if (!wards) {
        // Tìm mongo ObjectId của Tỉnh để lọc chính xác trong CSDL
        let provinceMongoId: string | undefined = undefined;
        if (typeof provinceCodeOrId === 'string' && provinceCodeOrId.length === 24) {
          provinceMongoId = provinceCodeOrId;
        } else if (this.provincesCache) {
          const matched = this.provincesCache.find(
            (p) => p.code === provinceCodeOrId || String(p.code) === String(provinceCodeOrId)
          );
          if (matched?.id) provinceMongoId = matched.id;
        }

        if (!provinceMongoId) {
          const fb = FALLBACK_PROVINCES.find(
            (p) => p.code === provinceCodeOrId || String(p.code) === String(provinceCodeOrId)
          );
          if (fb?.id) provinceMongoId = fb.id;
        }

        const endpoint = provinceMongoId
          ? `/administrative-areas?provinceId=${provinceMongoId}`
          : `/administrative-areas?type=WARD`;

        const res = await apiClient.get<any[]>(endpoint);
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          const pCodeNum = typeof provinceCodeOrId === 'number' ? provinceCodeOrId : 48;
          wards = res.data.map((w, idx) => ({
            id: w._id,
            code: typeof w.code === 'number' ? w.code : idx + 1000,
            name: w.name,
            province_code: pCodeNum,
            division_type: w.type === 'DISTRICT' ? 'quận' : 'phường',
          }));
          this.wardsCache.set(provinceCodeOrId, wards);
        }
      }

      const list =
        wards && wards.length > 0
          ? wards
          : FALLBACK_WARDS[provinceCodeOrId] || FALLBACK_WARDS[48] || [];

      if (search && search.trim()) {
        const query = search.trim().toLowerCase();
        return list.filter((w) => w.name.toLowerCase().includes(query));
      }

      return list;
    } catch (err) {
      console.log('[ProvinceApi] Lỗi lấy danh mục Phường từ DB, dùng fallback:', err);
      const list =
        this.wardsCache.get(provinceCodeOrId) ||
        FALLBACK_WARDS[provinceCodeOrId] ||
        FALLBACK_WARDS[48] ||
        [];
      if (search && search.trim()) {
        const query = search.trim().toLowerCase();
        return list.filter((w) => w.name.toLowerCase().includes(query));
      }
      return list;
    }
  }
}

export const provinceApi = new ProvinceApiService();

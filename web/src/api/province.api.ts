/**
 * Dịch vụ tích hợp Vietnam Provinces online API (2025)
 * ReDoc tài liệu: https://provinces.open-api.vn/api/v2/redoc
 * Chuẩn phân cấp hành chính mới nhất năm 2025: Tỉnh/Thành phố trực thuộc TW & Phường/Xã
 */

export interface ProvinceV2 {
  code: number;
  name: string;
  division_type: string;
  codename: string;
  phone_code?: number;
  wards?: WardV2[];
}

export interface WardV2 {
  code: number;
  name: string;
  division_type: string;
  codename: string;
  province_code: number;
}

const API_V2_BASE = 'https://provinces.open-api.vn/api/v2';

// In-memory cache để tối ưu tốc độ và không spam mạng
let cachedProvinces: ProvinceV2[] | null = null;
const cachedProvinceDetails: Record<number, ProvinceV2> = {};

// Dữ liệu dự phòng nhanh nếu mạng người dùng ngoại tuyến
const FALLBACK_PROVINCES: ProvinceV2[] = [
  { code: 48, name: 'Thành phố Đà Nẵng', division_type: 'thành phố trung ương', codename: 'da_nang' },
  { code: 1, name: 'Thành phố Hà Nội', division_type: 'thành phố trung ương', codename: 'ha_noi' },
  { code: 79, name: 'Thành phố Hồ Chí Minh', division_type: 'thành phố trung ương', codename: 'ho_chi_minh' },
  { code: 46, name: 'Thành phố Huế', division_type: 'thành phố trung ương', codename: 'hue' },
  { code: 31, name: 'Thành phố Hải Phòng', division_type: 'thành phố trung ương', codename: 'hai_phong' },
  { code: 92, name: 'Thành phố Cần Thơ', division_type: 'thành phố trung ương', codename: 'can_tho' },
  { code: 51, name: 'Tỉnh Quảng Ngãi', division_type: 'tỉnh', codename: 'quang_ngai' },
  { code: 44, name: 'Tỉnh Quảng Trị', division_type: 'tỉnh', codename: 'quang_tri' },
  { code: 42, name: 'Tỉnh Hà Tĩnh', division_type: 'tỉnh', codename: 'ha_tinh' },
  { code: 40, name: 'Tỉnh Nghệ An', division_type: 'tỉnh', codename: 'nghe_an' },
  { code: 56, name: 'Tỉnh Khánh Hòa', division_type: 'tỉnh', codename: 'khanh_hoa' },
  { code: 68, name: 'Tỉnh Lâm Đồng', division_type: 'tỉnh', codename: 'lam_dong' },
];

/**
 * Lấy danh sách toàn bộ 63 Tỉnh/Thành phố trực thuộc TW theo API v2 (2025)
 */
export async function fetchProvincesV2(): Promise<ProvinceV2[]> {
  if (cachedProvinces && cachedProvinces.length > 0) {
    return cachedProvinces;
  }

  try {
    const res = await fetch(`${API_V2_BASE}/p/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: ProvinceV2[] = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      cachedProvinces = data;
      return data;
    }
    return FALLBACK_PROVINCES;
  } catch (err) {
    console.warn('Không thể tải danh sách Tỉnh/TP từ Vietnam Provinces API v2, sử dụng fallback:', err);
    return cachedProvinces || FALLBACK_PROVINCES;
  }
}

/**
 * Lấy chi tiết Tỉnh/Thành phố kèm danh sách Phường / Xã trực thuộc (depth=2)
 */
export async function fetchProvinceWithWardsV2(provinceCode: number): Promise<ProvinceV2 | null> {
  if (cachedProvinceDetails[provinceCode]) {
    return cachedProvinceDetails[provinceCode];
  }

  try {
    const res = await fetch(`${API_V2_BASE}/p/${provinceCode}?depth=2`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: ProvinceV2 = await res.json();
    cachedProvinceDetails[provinceCode] = data;
    return data;
  } catch (err) {
    console.warn(`Không thể lấy danh sách phường/xã cho tỉnh mã ${provinceCode}:`, err);
    return null;
  }
}

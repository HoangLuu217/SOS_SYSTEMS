/**
 * Loại điểm an toàn / cơ sở cứu trợ
 */
export type SafeLocationType =
  | 'EVACUATION_CENTER'
  | 'HOSPITAL'
  | 'RESCUE_STATION'
  | 'SHELTER'
  | 'MEETING_POINT';

/**
 * Trạng thái điểm an toàn
 */
export type SafeLocationStatus = 'ACTIVE' | 'INACTIVE' | 'FULL' | 'MAINTENANCE';

/**
 * Thông tin Điểm an toàn (Safe Location)
 */
export interface SafeLocation {
  _id: string;
  name: string;
  type: SafeLocationType;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  address: string;
  capacity: number;
  currentOccupancy: number;
  status: SafeLocationStatus;
  areaId?: {
    _id: string;
    name: string;
    code: string;
    type: string;
  };
  createdBy?: {
    fullName?: string;
    phone?: string;
    email?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Loại hiểm họa được người dân đóng góp
 */
export type HazardType =
  | 'FLOOD'
  | 'LANDSLIDE'
  | 'FALLEN_TREE'
  | 'ELECTRICAL'
  | 'ROAD_DAMAGE'
  | 'OTHER'
  | string;

/**
 * Trạng thái duyệt báo cáo điểm hiểm họa
 */
export type HazardStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESOLVED';

/**
 * Báo cáo đóng góp điểm nguy hiểm từ cộng đồng
 */
export interface HazardReportItem {
  _id: string;
  title: string;
  description: string;
  hazardType: HazardType;
  customHazardType?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  address: string;
  location: {
    type: string;
    coordinates: [number, number]; // [lng, lat]
  };
  images?: string[];
  status: HazardStatus;
  reviewNote?: string;
  reviewedBy?: {
    fullName?: string;
  };
  reviewedAt?: string;
  createdAt: string;
}

/**
 * Loại cảnh báo thiên tai, hiểm họa
 */
export type AlertType =
  | 'FLOOD'
  | 'LANDSLIDE'
  | 'STORM'
  | 'FIRE'
  | 'DANGEROUS_AREA'
  | 'OTHER';

/**
 * Mức độ nghiêm trọng của cảnh báo
 */
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Thông tin cảnh báo (Alert Item)
 */
export interface AlertItem {
  _id: string;
  title: string;
  content: string;
  type: AlertType;
  severity: AlertSeverity;
  startTime: string;
  endTime?: string | null;
  isActive: boolean;
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  radius?: number; // bán kính cảnh báo (mét)
  areaId?: {
    _id: string;
    name: string;
    code: string;
    type: string;
    boundary?: {
      type: 'Polygon';
      coordinates: number[][][]; // [[[lng, lat], ...]]
    };
  };
  targetArea?: {
    _id: string;
    name: string;
    code: string;
    type: string;
    boundary?: {
      type: 'Polygon';
      coordinates: number[][][];
    };
  };
  createdBy?: {
    fullName?: string;
    phone?: string;
    email?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

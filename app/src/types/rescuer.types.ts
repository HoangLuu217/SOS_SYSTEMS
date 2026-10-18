/**
 * Kiểu dữ liệu xác minh cứu hộ viên
 */
export type RescuerVerificationStatus =
  | 'NOT_REGISTERED' // Chưa nộp đơn
  | 'PENDING'        // Đang chờ cơ quan chức năng duyệt
  | 'VERIFIED'       // Đã được phê duyệt
  | 'REJECTED';      // Bị từ chối

/**
 * Trạng thái sẵn sàng tác chiến
 */
export type RescuerAvailabilityStatus =
  | 'OFFLINE'        // Ngoại tuyến
  | 'AVAILABLE'      // Sẵn sàng nhận lệnh
  | 'BUSY'           // Đang bận
  | 'ON_MISSION'     // Đang làm nhiệm vụ cứu nạn
  | 'SUSPENDED';     // Tạm đình chỉ

/**
 * Loại phương tiện cơ động cứu hộ
 */
export type RescuerVehicleType =
  | 'BOAT'           // Xuồng / Thuyền cứu sinh
  | 'AMBULANCE'      // Xe cứu thương
  | 'TRUCK'          // Xe tải cứu trợ
  | 'MOTORBIKE'      // Xe máy cơ động
  | 'OTHER';         // Khác

/**
 * Hồ sơ chuyên môn Cứu hộ viên (Rescuer Profile)
 */
export interface RescuerProfileData {
  idNumber?: string | null;
  skills: string[];
  experience?: string | null;
  vehicleType?: RescuerVehicleType | string | null;
  verificationStatus: RescuerVerificationStatus;
  availabilityStatus: RescuerAvailabilityStatus;
  areaId?: string | { _id: string; name: string } | null;
  areaName?: string | null;
}

/**
 * Payload cập nhật / nộp hồ sơ Cứu hộ viên
 */
export interface UpdateRescuerProfileDto {
  idNumber?: string;
  skills?: string[];
  experience?: string;
  vehicleType?: RescuerVehicleType | string;
  fullName?: string;
  address?: string;
  areaId?: string;
  areaName?: string;
}

/**
 * Thành viên trong Đội Cứu hộ
 */
export interface RescueTeamMember {
  _id?: string;
  rescuerId:
    | {
        _id: string;
        fullName: string;
        phone?: string;
        avatarUrl?: string;
        rescuer?: RescuerProfileData;
      }
    | string;
  role: 'LEADER' | 'MEMBER';
  joinedAt: string;
}

/**
 * Phương tiện cứu hộ cơ động (Vehicle)
 */
export interface VehicleData {
  _id: string;
  teamId: string | any;
  type: RescuerVehicleType | string;
  plateNumber: string;
  capacity: number;
  status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE';
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Đội Cứu Hộ (Rescue Team)
 */
export interface RescueTeamData {
  _id: string;
  name: string;
  type: string;
  leaderId: any;
  authorityId: any;
  areaId: any;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  members: RescueTeamMember[];
  description?: string;
  vehicles?: VehicleData[];
  createdAt?: string;
  updatedAt?: string;
}

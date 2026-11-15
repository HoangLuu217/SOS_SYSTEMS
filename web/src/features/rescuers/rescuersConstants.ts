import type { RescueSpecialization, OperationalStatus } from './RescuersView';

export const SPECIALIZATION_LABELS: Record<RescueSpecialization, string> = {
  WATER_RESCUE: 'Đội cứu hộ đường thủy',
  EVACUATION: 'Đội sơ tán dân',
  MEDICAL_RESCUE: 'Đội y tế',
  LOGISTICS: 'Đội hậu cần',
  SEARCH_RESCUE: 'Đội tìm kiếm cứu nạn',
  COMMUNICATION: 'Đội thông tin liên lạc',
  SECURITY: 'Đội an ninh',
  // Tương thích ngược với dữ liệu cũ
  FLOOD_RESCUE: 'Đội cứu hộ đường thủy',
  FIRE_RESCUE: 'PCCC & CNCH',
  GENERAL_RESCUE: 'Cứu hộ tổng hợp',
  OTHER: 'Khác',
};

export const OPERATIONAL_STATUS_LABELS: Record<
  OperationalStatus,
  { label: string; color: string; desc: string }
> = {
  READY: {
    label: 'Sẵn sàng',
    color: 'ready',
    desc: 'Đủ điều kiện nhận lệnh tác chiến mới',
  },
  ON_MISSION: {
    label: 'Đang thực hiện nhiệm vụ',
    color: 'on_mission',
    desc: 'Đang triển khai cứu hộ tại hiện trường',
  },
  LIMITED: {
    label: 'Hạn chế hoạt động',
    color: 'limited',
    desc: 'Thiếu nhân lực hoặc phương tiện bảo dưỡng',
  },
  INACTIVE: {
    label: 'Ngừng hoạt động',
    color: 'inactive',
    desc: 'Tạm đình chỉ hoặc giải thể',
  },
};

/**
 * Danh mục nhãn kỹ năng chuẩn hóa tiếng Việt dùng chung cho Hồ sơ & Đội cứu hộ.
 */
export const SKILL_LABELS: Record<string, string> = {
  first_aid: 'Sơ cứu y tế',
  water_rescue: 'Cứu hộ vùng nước',
  search_rescue: 'Tìm kiếm cứu nạn',
  boat_driver: 'Lái xuồng vượt lũ',
  rope_climb: 'Leo dây & Độ cao',
  diving: 'Lặn cứu hộ',
  logistics: 'Hậu cần & Tiếp tế',
  evacuation: 'Sơ tán người dân',
  firefighting: 'PCCC & CNCH',
  relief_logistics: 'Tiếp tế lương thực',
  communication: 'Thông tin liên lạc',
  technical_rescue: 'Cứu hộ kỹ thuật cao',
  vehicle_op: 'Lái xe tải gầm cao',
};

export const VEHICLE_LABELS: Record<string, string> = {
  BOAT: 'Ca-nô / Xuồng máy',
  MOTORBIKE: 'Xe máy cơ động',
  TRUCK: 'Xe bán tải / Tải',
  AMBULANCE: 'Xe cứu thương',
  OTHER: 'Phương tiện đặc chủng',
};

export const EQUIPMENT_CATEGORY_LABELS: Record<string, string> = {
  LIFE_VEST: 'Bảo hộ & Cứu sinh',
  LIFE_SAVING: 'Cứu sinh vùng nước',
  MEDICAL_KIT: 'Y tế & Cấp cứu',
  MEDICAL_DEVICE: 'Thiết bị y tế',
  COMMUNICATION: 'Thông tin liên lạc',
  LIGHTING: 'Chiếu sáng dã chiến',
  ROPE_TOOL: 'Dây & Cứu nạn',
  TOOL: 'Dụng cụ cứu hộ',
  VEHICLE_ACCESSORY: 'Phụ kiện phương tiện',
  SHELTER: 'Lều bạt dã chiến',
  PPE: 'Bảo hộ cá nhân',
  FOOD_WATER: 'Lương thực & Nước',
  WATER_PURIFICATION: 'Lọc nước & Khử khuẩn',
  MEDICAL_SUPPLY: 'Dược phẩm & Vật tư',
  FUEL: 'Nhiên liệu',
  HYGIENE: 'Vệ sinh & Nhu yếu',
  OTHER: 'Trang thiết bị khác',
};

export const getApplicantInitials = (fullName?: string): string => {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (fullName || 'CH').slice(0, 2).toUpperCase();
};

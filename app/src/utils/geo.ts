/**
 * Tiện ích tính toán khoảng cách và toạ độ địa lý (GIS/GPS)
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Tính khoảng cách giữa 2 điểm toạ độ theo công thức Haversine (đơn vị: mét)
 */
export const calculateDistance = (
  coord1: LatLng,
  coord2: LatLng
): number => {
  const R = 6371e3; // Bán kính Trái Đất (mét)
  const φ1 = (coord1.latitude * Math.PI) / 180;
  const φ2 = (coord2.latitude * Math.PI) / 180;
  const Δφ = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const Δλ = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
};

/**
 * Định dạng khoảng cách hiển thị dễ đọc (ví dụ: 450 m hoặc 2.3 km)
 */
export const formatDistance = (distanceInMeters: number): string => {
  if (distanceInMeters < 1000) {
    return `${Math.round(distanceInMeters)} m`;
  }
  const km = (distanceInMeters / 1000).toFixed(1);
  return `${km} km`;
};

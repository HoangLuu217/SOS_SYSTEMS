export interface WardAuthorityDefault {
  id: string;
  ward: string;
  phone: string;
  lat: number;
  lng: number;
}

export const DANANG_WARD_AUTHORITIES: WardAuthorityDefault[] = [
  { id: 'ward-hai-chau', ward: 'Phường Hải Châu', phone: '02363810101', lat: 16.0678, lng: 108.2208 },
  { id: 'ward-thanh-khe', ward: 'Phường Thanh Khê', phone: '02363810102', lat: 16.0616, lng: 108.1872 },
  { id: 'ward-an-khe', ward: 'Phường An Khê', phone: '02363810103', lat: 16.0558, lng: 108.1726 },
  { id: 'ward-hoa-cuong', ward: 'Phường Hòa Cường', phone: '02363810104', lat: 16.0406, lng: 108.2198 },
  { id: 'ward-son-tra', ward: 'Phường Sơn Trà', phone: '02363810105', lat: 16.0908, lng: 108.2412 },
  { id: 'ward-an-hai', ward: 'Phường An Hải', phone: '02363810106', lat: 16.0672, lng: 108.2385 },
  { id: 'ward-ngu-hanh-son', ward: 'Phường Ngũ Hành Sơn', phone: '02363810107', lat: 16.0024, lng: 108.2625 },
  { id: 'ward-hai-van', ward: 'Phường Hải Vân', phone: '02363810108', lat: 16.1538, lng: 108.1286 },
  { id: 'ward-hoang-sa', ward: 'Đặc khu Hoàng Sa', phone: '02363810109', lat: 16.0985, lng: 108.2345 },
  { id: 'ward-duy-nghia', ward: 'Xã Duy Nghĩa', phone: '02363810110', lat: 15.8442, lng: 108.3746 },
  { id: 'ward-lien-chieu', ward: 'Phường Liên Chiểu', phone: '02363810111', lat: 16.0748, lng: 108.1516 },
  { id: 'ward-hoa-khanh', ward: 'Phường Hòa Khánh', phone: '02363810112', lat: 16.0665, lng: 108.1462 },
  { id: 'ward-cam-le', ward: 'Phường Cẩm Lệ', phone: '02363810113', lat: 16.0172, lng: 108.1965 },
  { id: 'ward-hoa-xuan', ward: 'Phường Hòa Xuân', phone: '02363810114', lat: 15.9985, lng: 108.2165 },
  { id: 'ward-dien-ban', ward: 'Phường Điện Bàn', phone: '02363810115', lat: 15.8914, lng: 108.2485 },
  { id: 'ward-hoa-vang', ward: 'Xã Hòa Vang', phone: '02363810116', lat: 16.0068, lng: 108.1325 },
  { id: 'ward-hoa-tien', ward: 'Xã Hòa Tiến', phone: '02363810117', lat: 15.9752, lng: 108.1654 },
  { id: 'ward-ba-na', ward: 'Xã Bà Nà', phone: '02363810118', lat: 16.0026, lng: 108.0532 },
  { id: 'ward-hoi-an', ward: 'Phường Hội An', phone: '02363810119', lat: 15.8801, lng: 108.3380 },
  { id: 'ward-tam-ky', ward: 'Phường Tam Kỳ', phone: '02353852554', lat: 15.5647, lng: 108.4839 },
];

export function stripWardPrefix(name: string): string {
  return name
    .replace(/^(Phường|Xã|Thị trấn|Đặc khu|Quận|Huyện)\s+/i, '')
    .trim()
    .toLowerCase();
}

export function findWardAuthorityByAddress(addressOrArea?: string): WardAuthorityDefault | null {
  if (!addressOrArea) return null;
  const lower = addressOrArea.toLowerCase();
  for (const entry of DANANG_WARD_AUTHORITIES) {
    const key = stripWardPrefix(entry.ward);
    if (key && lower.includes(key)) {
      return entry;
    }
  }
  return null;
}

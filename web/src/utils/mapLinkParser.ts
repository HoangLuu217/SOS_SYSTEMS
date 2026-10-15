import { resolveMapLink } from '../services/api';

export interface ParsedMapLocation {
  lat: number;
  lng: number;
  placeName?: string;
  resolvedUrl?: string;
  source?: string;
}

/**
 * Trích xuất tọa độ GPS từ chuỗi ký tự, liên kết Google Maps, Apple Maps, OpenStreetMap
 * hoặc tọa độ định dạng số thập phân, độ-phút-giây (DMS)
 */
export function parseCoordinatesFromText(input: string): ParsedMapLocation | null {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();

  // 1. Tọa độ DMS (Độ Phút Giây): ví dụ 16°03'37.8"N 108°13'01.4"E
  const dmsRegex = /(\d{1,2})[°\s]+(\d{1,2})['\s]+([\d.]+)"?\s*([NSns])[\s,]+(\d{1,3})[°\s]+(\d{1,2})['\s]+([\d.]+)"?\s*([EWew])/;
  const dmsMatch = str.match(dmsRegex);
  if (dmsMatch) {
    let lat = parseInt(dmsMatch[1], 10) + parseInt(dmsMatch[2], 10) / 60 + parseFloat(dmsMatch[3]) / 3600;
    if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
    let lng = parseInt(dmsMatch[5], 10) + parseInt(dmsMatch[6], 10) / 60 + parseFloat(dmsMatch[7]) / 3600;
    if (dmsMatch[8].toUpperCase() === 'W') lng = -lng;
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), source: 'dms' };
    }
  }

  // 2. Định dạng Google Maps URL có chứa @lat,lng e.g. /@16.0605123,108.2170456,17z
  const atMatch = str.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      let placeName: string | undefined;
      const placeMatch = str.match(/\/place\/([^/@?#]+)/);
      if (placeMatch) {
        try {
          placeName = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
        } catch (_) {}
      }
      return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), placeName, source: '@' };
    }
  }

  // 3. Query params: ?q=lat,lng hoặc ?query=lat,lng hoặc ll=lat,lng hoặc destination=lat,lng
  const queryMatch = str.match(/[?&](?:q|query|ll|destination|daddr|saddr)=(-?\d{1,2}\.\d+)[,%20\s]+(-?\d{1,3}\.\d+)/i);
  if (queryMatch) {
    const lat = parseFloat(queryMatch[1]);
    const lng = parseFloat(queryMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), source: 'query' };
    }
  }

  // 4. Data pb / embedded params của Google Maps: !3d<lat>!4d<lng> hoặc !2d<lng>!3d<lat>
  const d3d4 = str.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  if (d3d4) {
    const lat = parseFloat(d3d4[1]);
    const lng = parseFloat(d3d4[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), source: '!3d!4d' };
    }
  }
  const d2d3 = str.match(/!2d(-?\d{1,3}\.\d+)!3d(-?\d{1,2}\.\d+)/);
  if (d2d3) {
    const lng = parseFloat(d2d3[1]);
    const lat = parseFloat(d2d3[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), source: '!2d!3d' };
    }
  }

  // 5. Đường dẫn tìm kiếm: /search/16.0605,+108.2170
  const searchMatch = str.match(/\/search\/(-?\d{1,2}\.\d+)[,\s+]+(-?\d{1,3}\.\d+)/);
  if (searchMatch) {
    const lat = parseFloat(searchMatch[1]);
    const lng = parseFloat(searchMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), source: 'search_path' };
    }
  }

  // 6. Đường dẫn chỉ đường: /dir/.../16.0605,108.2170
  const dirMatch = str.match(/\/dir\/.*?(-?\d{1,2}\.\d+)[,\s+]+(-?\d{1,3}\.\d+)/);
  if (dirMatch) {
    const lat = parseFloat(dirMatch[1]);
    const lng = parseFloat(dirMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), source: 'dir_path' };
    }
  }

  // 7. OpenStreetMap: /#map=17/16.0605/108.2170
  const osmMatch = str.match(/#map=\d+\/(-?\d{1,2}\.\d+)\/(-?\d{1,3}\.\d+)/);
  if (osmMatch) {
    const lat = parseFloat(osmMatch[1]);
    const lng = parseFloat(osmMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), source: 'osm' };
    }
  }

  // 8. Tọa độ số rõ ràng: ví dụ "16.060512, 108.217045" hoặc "[16.060512, 108.217045]"
  const rawCoordRegex = /(-?\d{1,3}\.\d{3,})[,\s;]+(-?\d{1,3}\.\d{3,})/;
  const rawMatch = str.match(rawCoordRegex);
  if (rawMatch) {
    let lat = parseFloat(rawMatch[1]);
    let lng = parseFloat(rawMatch[2]);
    // Tự động nhận biết và đảo [lng, lat] nếu kinh độ đứng trước vĩ độ (ví dụ 108.2 đứng trước 16.06)
    if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
      const temp = lat;
      lat = lng;
      lng = temp;
    } else if (lat >= 100 && lat <= 115 && lng >= 8 && lng <= 25) {
      const temp = lat;
      lat = lng;
      lng = temp;
    }
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), source: 'raw' };
    }
  }

  return null;
}

/**
 * Kiểm tra xem chuỗi có phải là liên kết rút gọn của Google Maps hay không
 */
export function isShortGoogleMapsUrl(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const lower = input.toLowerCase().trim();
  return (
    lower.includes('maps.app.goo.gl') ||
    lower.includes('goo.gl/maps') ||
    lower.includes('app.goo.gl') ||
    lower.includes('g.co/maps')
  );
}

/**
 * Giải mã liên kết hoặc văn bản Google Maps thành tọa độ GPS.
 * Ưu tiên nhận diện regex tức thì ở máy khách (0ms), nếu là liên kết rút gọn
 * hoặc regex chưa nhận diện được sẽ gọi backend giải mã theo redirect.
 */
export async function resolveGoogleMapsInput(input: string): Promise<ParsedMapLocation> {
  if (!input || !input.trim()) {
    throw new Error('Vui lòng dán liên kết Google Maps hoặc nhập tọa độ');
  }

  // 1. Kiểm tra tức thì trên máy khách
  const immediate = parseCoordinatesFromText(input);
  if (immediate && !isShortGoogleMapsUrl(input)) {
    return immediate;
  }

  // 2. Nếu là shortlink hoặc chưa bắt được tọa độ, gửi lên backend để mở redirect
  try {
    const res = await resolveMapLink(input.trim());
    if (res.success && res.data && typeof res.data.lat === 'number' && typeof res.data.lng === 'number') {
      return {
        lat: Number(res.data.lat.toFixed(5)),
        lng: Number(res.data.lng.toFixed(5)),
        placeName: res.data.placeName,
        resolvedUrl: res.data.resolvedUrl,
        source: res.data.source || 'backend_resolved',
      };
    }
    throw new Error(res.message || 'Không thể trích xuất tọa độ từ liên kết này');
  } catch (err: any) {
    // Nếu backend lỗi mạng nhưng parseCoordinatesFromText trước đó đã có kết quả
    if (immediate) return immediate;
    throw new Error(
      err.message || 'Không tìm thấy tọa độ từ liên kết Google Maps. Vui lòng kiểm tra lại liên kết hoặc dán tọa độ trực tiếp.'
    );
  }
}

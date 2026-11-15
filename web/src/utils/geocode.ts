import { API_BASE } from '@/api/client';

export interface GeocodeSearchResult {
  place_id: number | string;
  display_name: string;
  title?: string;
  address?: string;
  lat: string;
  lon: string;
  source?: string;
}

function buildSearchUrl(query: string, lat?: number, lng?: number): string {
  const params = new URLSearchParams({ q: query });
  if (typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng)) {
    params.set('lat', String(lat));
    params.set('lng', String(lng));
  }
  return `${API_BASE}/blood-donations/geocode/search?${params.toString()}`;
}

function formatPhotonFeatures(features: any[]): GeocodeSearchResult[] {
  return features.map((f: any) => {
    const props = f?.properties || {};
    const parts = [props.name, props.street, props.city, props.state, props.country].filter(Boolean);
    return {
      place_id: props.osm_id || Math.random(),
      display_name: parts.join(', ') || props.name || 'Địa điểm tìm thấy',
      lat: String(f.geometry.coordinates[1]),
      lon: String(f.geometry.coordinates[0]),
      source: 'photon',
    };
  });
}

/**
 * Tìm kiếm địa điểm qua backend SerpAPI Google Maps (`/blood-donations/geocode/search`),
 * ưu tiên khu vực đang chọn rồi mở rộng toàn quốc nếu cần.
 */
export async function searchGeocodeSuggestions(
  query: string,
  options?: { areaBias?: string; lat?: number; lng?: number }
): Promise<GeocodeSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const rawArea = (options?.areaBias || '').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const normalizedArea = rawArea.toLowerCase();
  const shortArea = rawArea.replace(/^(thành phố|tp\.?|tỉnh)\s+/i, '').trim().toLowerCase();
  const lowerQuery = cleanQuery.toLowerCase();
  const alreadyHasArea =
    (normalizedArea ? lowerQuery.includes(normalizedArea) : false) ||
    (shortArea ? lowerQuery.includes(shortArea) : false);
  const fullQuery = rawArea && !alreadyHasArea ? `${cleanQuery}, ${rawArea}` : cleanQuery;

  let backendRespondedOk = false;

  try {
    const res = await fetch(buildSearchUrl(fullQuery, options?.lat, options?.lng));
    if (res.ok) {
      backendRespondedOk = true;
      const json = await res.json();
      if (Array.isArray(json?.data) && json.data.length > 0) {
        return json.data;
      }
    }
  } catch {
    // Fallback bên dưới
  }

  if (fullQuery !== cleanQuery) {
    try {
      const fbRes = await fetch(buildSearchUrl(cleanQuery));
      if (fbRes.ok) {
        backendRespondedOk = true;
        const fbJson = await fbRes.json();
        if (Array.isArray(fbJson?.data) && fbJson.data.length > 0) {
          return fbJson.data;
        }
      }
    } catch {
      // Fallback bên dưới
    }
  }

  if (!backendRespondedOk) {
    try {
      const photonRes = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery)}&limit=5`
      );
      if (photonRes.ok) {
        const photonData = await photonRes.json();
        if (Array.isArray(photonData?.features) && photonData.features.length > 0) {
          return formatPhotonFeatures(photonData.features);
        }
      }
    } catch {
      // Không tìm được qua Photon
    }
  }

  return [];
}

/**
 * Tra cứu ngược địa chỉ từ tọa độ GPS qua backend proxy (fallback Photon nếu cần).
 */
export async function reverseGeocodeCoords(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/blood-donations/geocode/reverse?lat=${lat}&lng=${lng}`);
    if (res.ok) {
      const json = await res.json();
      if (json?.data) return String(json.data);
    }
  } catch {
    // Fallback Photon API bên dưới
  }

  try {
    const fbRes = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`);
    if (fbRes.ok) {
      const fbData = await fbRes.json();
      const props = fbData?.features?.[0]?.properties;
      if (props) {
        const addr = [props.name, props.street, props.city, props.state, props.country]
          .filter(Boolean)
          .join(', ');
        if (addr) return addr;
      }
    }
  } catch {
    // Bỏ qua lỗi mạng khi tra cứu ngược địa chỉ
  }

  return '';
}


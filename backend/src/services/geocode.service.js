const SERPAPI_SEARCH_ENDPOINT = 'https://serpapi.com/search';
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

const searchCache = new Map();

function getCachedSearch(cacheKey) {
  const entry = searchCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    searchCache.delete(cacheKey);
    return null;
  }
  return entry.results;
}

function setCachedSearch(cacheKey, results) {
  if (!Array.isArray(results) || results.length === 0) return;
  if (searchCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey !== undefined) {
      searchCache.delete(oldestKey);
    }
  }
  searchCache.set(cacheKey, {
    results,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function normalizeSerpApiLl(options = {}) {
  const { ll, lat, lng } = options;
  if (typeof ll === 'string' && /^@-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,\d+(?:\.\d+)?[zm]$/i.test(ll.trim())) {
    return ll.trim();
  }
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (
    lat !== undefined &&
    lng !== undefined &&
    lat !== '' &&
    lng !== '' &&
    Number.isFinite(parsedLat) &&
    Number.isFinite(parsedLng) &&
    parsedLat >= -90 &&
    parsedLat <= 90 &&
    parsedLng >= -180 &&
    parsedLng <= 180
  ) {
    return `@${parsedLat.toFixed(6)},${parsedLng.toFixed(6)},13z`;
  }
  return '';
}

function formatSerpApiPlaceItem(item, index) {
  const coords = item?.gps_coordinates;
  const lat = Number(coords?.latitude);
  const lng = Number(coords?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const title = typeof item?.title === 'string' ? item.title.trim() : '';
  const address = typeof item?.address === 'string' ? item.address.trim() : '';

  let displayName = '';
  if (title && address) {
    displayName = address.toLowerCase().includes(title.toLowerCase())
      ? address
      : `${title} - ${address}`;
  } else {
    displayName = title || address || `Địa điểm Google Maps #${index + 1}`;
  }

  return {
    place_id: item?.place_id || item?.data_id || `serp-${index}-${lat}-${lng}`,
    display_name: displayName,
    title: title || undefined,
    address: address || undefined,
    lat: String(lat),
    lon: String(lng),
    source: 'serpapi_google_maps',
  };
}

function extractSerpApiResults(data) {
  const rawItems = [];
  if (data?.place_results && typeof data.place_results === 'object') {
    rawItems.push(data.place_results);
  }
  if (Array.isArray(data?.local_results)) {
    rawItems.push(...data.local_results);
  }

  const normalized = [];
  const seenKeys = new Set();

  for (let i = 0; i < rawItems.length; i += 1) {
    const mapped = formatSerpApiPlaceItem(rawItems[i], i);
    if (!mapped) continue;

    const dedupeKey = `${mapped.place_id}|${mapped.lat},${mapped.lon}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    normalized.push(mapped);

    if (normalized.length >= 8) break;
  }

  return normalized;
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json().catch(() => null);
    return { res, data };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function searchWithSerpApi(query, llParam) {
  const apiKey = (process.env.SERPAPI_API_KEY || process.env.SERPAPI_KEY || '').trim();
  if (!apiKey) {
    return { handled: false, reason: 'missing_key', results: [] };
  }

  const cacheKey = `${query.toLowerCase()}|${llParam}`;
  const cached = getCachedSearch(cacheKey);
  if (cached) {
    return { handled: true, results: cached };
  }

  const params = new URLSearchParams({
    engine: 'google_maps',
    type: 'search',
    q: query,
    hl: 'vi',
    gl: 'vn',
    api_key: apiKey,
  });
  if (llParam) {
    params.set('ll', llParam);
  }

  try {
    const { res, data } = await fetchJsonWithTimeout(`${SERPAPI_SEARCH_ENDPOINT}?${params.toString()}`);
    if (!res.ok || data?.error) {
      console.warn(
        '[Geocode] SerpAPI google_maps error:',
        data?.error || `HTTP ${res.status}`
      );
      return { handled: false, reason: 'api_error', results: [] };
    }

    const results = extractSerpApiResults(data);
    setCachedSearch(cacheKey, results);
    return { handled: true, results };
  } catch (err) {
    console.warn('[Geocode] SerpAPI google_maps request failed:', err?.message || 'unknown error');
    return { handled: false, reason: 'network_error', results: [] };
  }
}

async function searchWithOsmFallback(query) {
  let results = [];

  try {
    const { res, data } = await fetchJsonWithTimeout(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&countrycodes=vn&limit=5&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'SosSystem-App/1.0 (contact@sos.local)',
        },
      }
    );
    if (res.ok && Array.isArray(data) && data.length > 0) {
      results = data.map((d) => ({
        place_id: d.place_id,
        display_name: d.display_name,
        lat: String(d.lat),
        lon: String(d.lon),
        source: 'nominatim',
      }));
    }
  } catch (_) {
    // Fallback to Photon below
  }

  if (results.length === 0) {
    try {
      const { res, data } = await fetchJsonWithTimeout(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`
      );
      if (res.ok && Array.isArray(data?.features) && data.features.length > 0) {
        results = data.features.map((f) => {
          const props = f.properties || {};
          const parts = [
            props.name,
            props.street,
            props.city,
            props.state,
            props.country,
          ].filter(Boolean);
          return {
            place_id: props.osm_id || Math.random(),
            display_name: parts.join(', ') || props.name || 'Địa điểm tìm thấy',
            lat: String(f.geometry.coordinates[1]),
            lon: String(f.geometry.coordinates[0]),
            source: 'photon',
          };
        });
      }
    } catch (_) {
      // Return empty results cleanly
    }
  }

  return results;
}

/**
 * Tìm kiếm địa điểm ưu tiên qua SerpAPI Google Maps (`engine=google_maps`),
 * tự động fallback sang Nominatim/Photon khi chưa cấu hình SERPAPI_API_KEY hoặc SerpAPI lỗi.
 */
async function searchPlaces(query, options = {}) {
  const cleanQuery = typeof query === 'string' ? query.trim() : '';
  if (!cleanQuery) return [];

  const llParam = normalizeSerpApiLl(options);
  const serpResult = await searchWithSerpApi(cleanQuery, llParam);
  if (serpResult.handled) {
    return serpResult.results;
  }

  return searchWithOsmFallback(cleanQuery);
}

/**
 * Tra cứu ngược địa chỉ từ tọa độ qua Nominatim.
 */
async function reverseGeocode(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    return '';
  }

  const { res, data } = await fetchJsonWithTimeout(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${parsedLat}&lon=${parsedLng}&zoom=18&addressdetails=1`,
    {
      headers: {
        'User-Agent': 'SosSystem-App/1.0 (contact@sos.local)',
      },
    }
  );
  if (res.ok && data?.display_name) {
    const raw = String(data.display_name);
    const cleanTokens = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !/^\d{4,6}$/.test(s) && !/^việt\s*nam$/i.test(s));

    const deduped = [];
    for (const token of cleanTokens) {
      if (!deduped.some((d) => d.toLowerCase() === token.toLowerCase())) {
        deduped.push(token);
      }
    }
    return deduped.slice(0, 3).join(', ');
  }
  return '';
}

module.exports = {
  searchPlaces,
  reverseGeocode,
  extractSerpApiResults,
  normalizeSerpApiLl,
  __clearCache: () => searchCache.clear(),
};


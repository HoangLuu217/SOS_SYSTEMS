import type { FeatureCollection } from 'geojson';

/**
 * Cartographic GeoJSON Data for Vietnam's Sovereign Islands:
 * - Quần đảo Hoàng Sa (Hoang Sa Islands - Paracel Islands, TP Đà Nẵng, Việt Nam)
 * - Quần đảo Trường Sa (Truong Sa Islands - Spratly Islands, Tỉnh Khánh Hòa, Việt Nam)
 * 
 * Contains detailed landmass polygons, coral reef outlines, and centroid points for natural map rendering.
 */

// Helper to generate a realistic elliptical island polygon given center [lng, lat], radiusLng, radiusLat
function makeIslandPolygon(lng: number, lat: number, rLng: number, rLat: number, points = 16): number[][] {
  const coords: number[][] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i * 2 * Math.PI) / points;
    // Add subtle irregularity to mimic natural island shoreline
    const noise = 1 + 0.12 * Math.sin(angle * 3) + 0.08 * Math.cos(angle * 5);
    const px = lng + Math.cos(angle) * rLng * noise;
    const py = lat + Math.sin(angle) * rLat * noise;
    coords.push([Number(px.toFixed(5)), Number(py.toFixed(5))]);
  }
  return coords;
}

export const SOVEREIGN_ISLANDS_GEOJSON: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    // ========================================================
    // QUẦN ĐẢO HOÀNG SA (TP ĐÀ NẴNG, VIỆT NAM)
    // ========================================================
    {
      type: 'Feature',
      id: 'hs-atoll-crescent',
      properties: {
        id: 'hs-atoll-crescent',
        name: 'Nhóm đảo Lưỡi Liềm (Trăng Khuyết)',
        archipelago: 'Hoàng Sa',
        province: 'Đà Nẵng',
        type: 'reef_atoll',
        description: 'Vùng rạn san hô tự nhiên thuộc Quần đảo Hoàng Sa, TP Đà Nẵng',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [makeIslandPolygon(111.62, 16.52, 0.22, 0.16, 24)],
      },
    },
    {
      type: 'Feature',
      id: 'hs-atoll-amphitrite',
      properties: {
        id: 'hs-atoll-amphitrite',
        name: 'Nhóm đảo An Vĩnh',
        archipelago: 'Hoàng Sa',
        province: 'Đà Nẵng',
        type: 'reef_atoll',
        description: 'Vùng rạn san hô tự nhiên phía Đông Bắc Quần đảo Hoàng Sa',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [makeIslandPolygon(112.35, 16.85, 0.26, 0.20, 24)],
      },
    },
    {
      type: 'Feature',
      id: 'hs-phu-lam',
      properties: {
        id: 'hs-phu-lam',
        name: 'Đảo Phú Lâm',
        vietnameseName: 'Đảo Phú Lâm (Việt Nam)',
        archipelago: 'Hoàng Sa',
        province: 'Đà Nẵng',
        type: 'island',
        areaKm2: 2.1,
        elevationM: 8.5,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [makeIslandPolygon(112.335, 16.835, 0.045, 0.035, 20)],
      },
    },
    {
      type: 'Feature',
      id: 'hs-hoang-sa',
      properties: {
        id: 'hs-hoang-sa',
        name: 'Đảo Hoàng Sa',
        vietnameseName: 'Đảo Hoàng Sa (Pattle Island)',
        archipelago: 'Hoàng Sa',
        province: 'Đà Nẵng',
        type: 'island',
        areaKm2: 0.32,
        elevationM: 9.0,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [makeIslandPolygon(111.608, 16.533, 0.038, 0.028, 18)],
      },
    },
    {
      type: 'Feature',
      id: 'hs-tri-ton',
      properties: {
        id: 'hs-tri-ton',
        name: 'Đảo Tri Tôn',
        vietnameseName: 'Đảo Tri Tôn (Việt Nam)',
        archipelago: 'Hoàng Sa',
        province: 'Đà Nẵng',
        type: 'island',
        areaKm2: 1.2,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [makeIslandPolygon(111.205, 15.785, 0.042, 0.032, 18)],
      },
    },
    {
      type: 'Feature',
      id: 'hs-quang-hoa',
      properties: {
        id: 'hs-quang-hoa',
        name: 'Đảo Quang Hòa',
        vietnameseName: 'Đảo Quang Hòa (Việt Nam)',
        archipelago: 'Hoàng Sa',
        province: 'Đà Nẵng',
        type: 'island',
        areaKm2: 0.5,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [makeIslandPolygon(111.712, 16.452, 0.036, 0.026, 18)],
      },
    },
    {
      type: 'Feature',
      id: 'hs-linh-con',
      properties: {
        id: 'hs-linh-con',
        name: 'Đảo Linh Côn',
        vietnameseName: 'Đảo Linh Côn (Lincoln Island)',
        archipelago: 'Hoàng Sa',
        province: 'Đà Nẵng',
        type: 'island',
        areaKm2: 1.6,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [makeIslandPolygon(112.735, 16.665, 0.048, 0.035, 18)],
      },
    },

    // ========================================================
    // QUẦN ĐẢO TRƯỜNG SA (TỈNH KHÁNH HÒA, VIỆT NAM)
    // ========================================================
    {
      type: 'Feature',
      id: 'ts-truong-sa-lon',
      properties: {
        id: 'ts-truong-sa-lon',
        name: 'Đảo Trường Sa Lớn',
        vietnameseName: 'Thị trấn Trường Sa (Khánh Hòa, VN)',
        archipelago: 'Trường Sa',
        province: 'Khánh Hòa',
        type: 'island',
        isCenter: true,
        areaKm2: 0.48,
        runwayM: 1200,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [makeIslandPolygon(111.918, 8.644, 0.052, 0.038, 22)],
      },
    },
    {
      type: 'Feature',
      id: 'ts-song-tu-tay',
      properties: {
        id: 'ts-song-tu-tay',
        name: 'Đảo Song Tử Tây',
        vietnameseName: 'Xã đảo Song Tử Tây (Khánh Hòa)',
        archipelago: 'Trường Sa',
        province: 'Khánh Hòa',
        type: 'island',
        hasLighthouse: true,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [makeIslandPolygon(114.331, 11.428, 0.046, 0.034, 18)],
      },
    },
    {
      type: 'Feature',
      id: 'ts-son-ca',
      properties: {
        id: 'ts-son-ca',
        name: 'Đảo Sơn Ca',
        vietnameseName: 'Đảo Sơn Ca (Việt Nam)',
        archipelago: 'Trường Sa',
        province: 'Khánh Hòa',
        type: 'island',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [makeIslandPolygon(114.478, 10.378, 0.040, 0.028, 18)],
      },
    },
    {
      type: 'Feature',
      id: 'ts-nam-yet',
      properties: {
        id: 'ts-nam-yet',
        name: 'Đảo Nam Yết',
        vietnameseName: 'Đảo Nam Yết (Việt Nam)',
        archipelago: 'Trường Sa',
        province: 'Khánh Hòa',
        type: 'island',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [makeIslandPolygon(114.364, 10.180, 0.042, 0.030, 18)],
      },
    },
    {
      type: 'Feature',
      id: 'ts-sinh-ton',
      properties: {
        id: 'ts-sinh-ton',
        name: 'Đảo Sinh Tồn',
        vietnameseName: 'Xã đảo Sinh Tồn (Khánh Hòa)',
        archipelago: 'Trường Sa',
        province: 'Khánh Hòa',
        type: 'island',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [makeIslandPolygon(114.320, 9.885, 0.044, 0.032, 18)],
      },
    },
    {
      type: 'Feature',
      id: 'ts-phan-vinh',
      properties: {
        id: 'ts-phan-vinh',
        name: 'Đảo Phan Vinh',
        vietnameseName: 'Đảo Phan Vinh (Việt Nam)',
        archipelago: 'Trường Sa',
        province: 'Khánh Hòa',
        type: 'island',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [makeIslandPolygon(113.735, 8.970, 0.038, 0.028, 18)],
      },
    },
    {
      type: 'Feature',
      id: 'ts-thuyen-chai',
      properties: {
        id: 'ts-thuyen-chai',
        name: 'Đảo Thuyền Chài',
        vietnameseName: 'Đảo Thuyền Chài (Barque Canada Reef)',
        archipelago: 'Trường Sa',
        province: 'Khánh Hòa',
        type: 'reef_atoll',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [makeIslandPolygon(113.305, 8.175, 0.095, 0.040, 20)],
      },
    },
    {
      type: 'Feature',
      id: 'ts-da-tay',
      properties: {
        id: 'ts-da-tay',
        name: 'Đá Tây',
        vietnameseName: 'Đảo Đá Tây (Âu tàu cứu nạn)',
        archipelago: 'Trường Sa',
        province: 'Khánh Hòa',
        type: 'reef_atoll',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [makeIslandPolygon(112.205, 8.865, 0.065, 0.035, 18)],
      },
    },
    {
      type: 'Feature',
      id: 'ts-an-bang',
      properties: {
        id: 'ts-an-bang',
        name: 'Đảo An Bang',
        vietnameseName: 'Đảo An Bang (Việt Nam)',
        archipelago: 'Trường Sa',
        province: 'Khánh Hòa',
        type: 'island',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [makeIslandPolygon(112.905, 7.890, 0.036, 0.026, 18)],
      },
    },
  ],
};

// Points Collection for Sovereign Labels on the Map
export const SOVEREIGN_LABELS_GEOJSON: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    // Major Archipelago Sovereign Titles (Visible at regional zoom)
    {
      type: 'Feature',
      properties: {
        title: 'QUẦN ĐẢO HOÀNG SA',
        sub: '(Việt Nam)',
        level: 'archipelago',
        color: '#b91c1c',
      },
      geometry: {
        type: 'Point',
        coordinates: [112.0, 16.5],
      },
    },
    {
      type: 'Feature',
      properties: {
        title: 'QUẦN ĐẢO TRƯỜNG SA',
        sub: '(Việt Nam)',
        level: 'archipelago',
        color: '#b91c1c',
      },
      geometry: {
        type: 'Point',
        coordinates: [113.8, 10.0],
      },
    },
    // Specific Islands (Visible when zooming closer)
    {
      type: 'Feature',
      properties: { title: 'Đảo Phú Lâm', level: 'island' },
      geometry: { type: 'Point', coordinates: [112.335, 16.835] },
    },
    {
      type: 'Feature',
      properties: { title: 'Đảo Hoàng Sa', level: 'island' },
      geometry: { type: 'Point', coordinates: [111.608, 16.533] },
    },
    {
      type: 'Feature',
      properties: { title: 'Đảo Tri Tôn', level: 'island' },
      geometry: { type: 'Point', coordinates: [111.205, 15.785] },
    },
    {
      type: 'Feature',
      properties: { title: 'Đảo Trường Sa Lớn', level: 'island' },
      geometry: { type: 'Point', coordinates: [111.918, 8.644] },
    },
    {
      type: 'Feature',
      properties: { title: 'Đảo Song Tử Tây', level: 'island' },
      geometry: { type: 'Point', coordinates: [114.331, 11.428] },
    },
    {
      type: 'Feature',
      properties: { title: 'Đảo Sinh Tồn', level: 'island' },
      geometry: { type: 'Point', coordinates: [114.320, 9.885] },
    },
    {
      type: 'Feature',
      properties: { title: 'Đảo Nam Yết', level: 'island' },
      geometry: { type: 'Point', coordinates: [114.364, 10.180] },
    },
    {
      type: 'Feature',
      properties: { title: 'Đảo Sơn Ca', level: 'island' },
      geometry: { type: 'Point', coordinates: [114.478, 10.378] },
    },
    {
      type: 'Feature',
      properties: { title: 'Đảo Phan Vinh', level: 'island' },
      geometry: { type: 'Point', coordinates: [113.735, 8.970] },
    },
  ],
};

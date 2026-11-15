/**
 * Utility functions for Geographic Information System (GIS) and jurisdiction verification
 */

/**
 * Ray-casting algorithm to determine if a point [lng, lat] lies inside a linear ring
 * @param {[number, number]} point - [longitude, latitude]
 * @param {Array<[number, number]>} ring - Array of [longitude, latitude]
 * @returns {boolean}
 */
function isPointInRing(point, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  const [x, y] = point; // longitude, latitude
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Checks if a point [lng, lat] is inside a GeoJSON Polygon or MultiPolygon geometry
 * @param {[number, number]} coordinates - [longitude, latitude]
 * @param {object} geometry - GeoJSON geometry with type and coordinates
 * @returns {boolean}
 */
function isPointInPolygonGeometry(coordinates, geometry) {
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
    return false;
  }
  const [lng, lat] = coordinates;
  if (typeof lng !== 'number' || typeof lat !== 'number' || isNaN(lng) || isNaN(lat)) {
    return false;
  }

  if (!geometry || !geometry.coordinates || !Array.isArray(geometry.coordinates)) {
    return false;
  }

  const { type, coordinates: geoCoords } = geometry;

  if (type === 'Polygon') {
    // Outer ring must contain the point
    if (!geoCoords[0] || !isPointInRing([lng, lat], geoCoords[0])) {
      return false;
    }
    // Holes must NOT contain the point
    for (let h = 1; h < geoCoords.length; h++) {
      if (isPointInRing([lng, lat], geoCoords[h])) {
        return false;
      }
    }
    return true;
  }

  if (type === 'MultiPolygon') {
    for (const poly of geoCoords) {
      if (poly && poly[0] && isPointInRing([lng, lat], poly[0])) {
        let insideHole = false;
        for (let h = 1; h < poly.length; h++) {
          if (isPointInRing([lng, lat], poly[h])) {
            insideHole = true;
            break;
          }
        }
        if (!insideHole) return true;
      }
    }
    return false;
  }

  return false;
}

/**
 * Find the AdministrativeArea document whose boundary contains the given GPS [lng, lat]
 * @param {[number, number]} coordinates - [longitude, latitude]
 * @param {Model} AdministrativeAreaModel
 * @returns {Promise<Document|null>}
 */
async function findAreaByCoordinates(coordinates, AdministrativeAreaModel) {
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
    return null;
  }
  const [lng, lat] = coordinates;
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    return null;
  }

  try {
    // 1. Try MongoDB $geoIntersects on 2dsphere index (prefer WARD -> DISTRICT -> PROVINCE)
    const matchedAreas = await AdministrativeAreaModel.find({
      status: 'ACTIVE',
      boundary: {
        $geoIntersects: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat],
          },
        },
      },
    });

    if (matchedAreas && matchedAreas.length > 0) {
      const order = { WARD: 1, DISTRICT: 2, PROVINCE: 3, COUNTRY: 4 };
      matchedAreas.sort((a, b) => (order[a.type] || 5) - (order[b.type] || 5));
      return matchedAreas[0];
    }
  } catch (err) {
    // $geoIntersects might throw if geometry in DB is invalid or index issue; fallback to manual test
  }

  // 2. In-memory fallback across all active areas with boundaries
  try {
    const boundedAreas = await AdministrativeAreaModel.find({
      status: 'ACTIVE',
      'boundary.coordinates': { $exists: true, $ne: [] },
    }).lean();

    // Prefer WARD first (most specific), then DISTRICT, then PROVINCE
    const sorted = boundedAreas.sort((a, b) => {
      const order = { WARD: 1, DISTRICT: 2, PROVINCE: 3, COUNTRY: 4 };
      return (order[a.type] || 5) - (order[b.type] || 5);
    });

    for (const area of sorted) {
      if (isPointInPolygonGeometry([lng, lat], area.boundary)) {
        return area;
      }
    }
  } catch (err) {
    // ignore
  }

  return null;
}

/**
 * Verify whether a point (by GPS coordinates and/or areaId) falls strictly within an authority's jurisdiction
 * @param {object} params
 * @param {[number, number]} [params.coordinates] - [lng, lat]
 * @param {string|ObjectId} [params.areaId] - Area ID of the point
 * @param {string} [params.address] - Specific address string
 * @param {object} authorityUser - The authenticated authority user object
 * @param {Model} AdministrativeAreaModel
 * @returns {Promise<{ allowed: boolean, reason?: string, authAreaName?: string }>}
 */
async function checkPointInAuthorityJurisdiction(
  { coordinates, areaId, address },
  authorityUser,
  AdministrativeAreaModel
) {
  if (!authorityUser) {
    return { allowed: false, reason: 'NO_USER' };
  }

  const userRoles = authorityUser.roles || [];

  // 1. ADMIN has global authority across all areas
  if (userRoles.includes('ADMIN')) {
    return { allowed: true, reason: 'ADMIN' };
  }

  // 2. Must be LOCAL_AUTHORITY or AUTHORITY
  if (!userRoles.includes('LOCAL_AUTHORITY') && !userRoles.includes('AUTHORITY')) {
    return { allowed: false, reason: 'NOT_LOCAL_AUTHORITY' };
  }

  const deptStr = String(authorityUser.authority?.department || '').toLowerCase();
  const posStr = String(authorityUser.authority?.position || '').toLowerCase();

  // 3. Retrieve authority's assigned area
  const userAreaId = authorityUser.authority?.areaId;
  let authArea = null;

  if (userAreaId) {
    authArea = await AdministrativeAreaModel.findById(userAreaId);
  }

  if (!authArea && deptStr) {
    const allAreas = await AdministrativeAreaModel.find({ status: 'ACTIVE' });
    authArea = allAreas.find((a) => {
      if (!a.name) return false;
      const clean = a.name.toLowerCase().replace(/^(phường|quận|huyện|xã)\s+/i, '').trim();
      return clean.length > 2 && (deptStr.includes(clean) || posStr.includes(clean));
    });
  }

  // 4. City-level authority (Toàn Thành phố Đà Nẵng / Cấp Tỉnh-Thành phố)
  // Chỉ áp dụng khi khu vực được gán là cấp PROVINCE hoặc cơ quan cấp thành phố (không phụ trách riêng Phường/Quận)
  const isAssignedLocal = authArea && (authArea.type === 'WARD' || authArea.type === 'DISTRICT');
  if (!isAssignedLocal) {
    if (
      authArea?.type === 'PROVINCE' ||
      deptStr.includes('toàn thành phố') ||
      deptStr.includes('cấp thành phố') ||
      (deptStr.includes('ban chỉ huy pctt & tkcn tp. đà nẵng') && !deptStr.includes('phường') && !deptStr.includes('quận'))
    ) {
      return { allowed: true, reason: 'CITY_WIDE_AUTHORITY', authAreaName: authArea?.name || 'Toàn thành phố Đà Nẵng' };
    }
  }

  const authAreaName =
    authorityUser.authority?.areaName ||
    authArea?.name ||
    authorityUser.authority?.department ||
    'Khu vực được phân công';

  if (!authArea && !userAreaId) {
    return {
      allowed: false,
      reason: 'AUTHORITY_HAS_NO_ASSIGNED_AREA',
      authAreaName,
    };
  }

  // Gather authority's jurisdiction area IDs (assigned area + any sub-districts/wards)
  const jurisdictionAreaIdStrings = new Set();
  if (authArea) {
    jurisdictionAreaIdStrings.add(authArea._id.toString());

    // If assigned area is PROVINCE or DISTRICT, find all descendants
    const childAreas = await AdministrativeAreaModel.find({
      parentId: authArea._id,
      status: 'ACTIVE',
    }).select('_id boundary').lean();

    childAreas.forEach((c) => jurisdictionAreaIdStrings.add(c._id.toString()));
  } else if (userAreaId) {
    jurisdictionAreaIdStrings.add(userAreaId.toString());
  }

  // 5. GPS Boundary Test (The core requirement):
  // Check if coordinates [lng, lat] fall within the authority's polygon boundary
  const hasValidCoords =
    Array.isArray(coordinates) &&
    coordinates.length === 2 &&
    typeof coordinates[0] === 'number' &&
    typeof coordinates[1] === 'number' &&
    !isNaN(coordinates[0]) &&
    !isNaN(coordinates[1]);

  if (hasValidCoords && authArea) {
    // Test authority area's own boundary
    if (authArea.boundary && authArea.boundary.coordinates) {
      const inParent = isPointInPolygonGeometry(coordinates, authArea.boundary);
      if (inParent) {
        return { allowed: true, reason: 'GPS_INSIDE_BOUNDARY', authAreaName };
      }
    }

    // Test children boundaries (e.g. if authority is District, check wards)
    const boundedChildren = await AdministrativeAreaModel.find({
      parentId: authArea._id,
      status: 'ACTIVE',
      'boundary.coordinates': { $exists: true, $ne: [] },
    }).select('boundary').lean();

    for (const child of boundedChildren) {
      if (isPointInPolygonGeometry(coordinates, child.boundary)) {
        return { allowed: true, reason: 'GPS_INSIDE_CHILD_BOUNDARY', authAreaName };
      }
    }

    // If the authority area has an explicit boundary and coordinates are strictly outside:
    if (authArea.boundary && Array.isArray(authArea.boundary.coordinates) && authArea.boundary.coordinates.length > 0) {
      // Points with GPS strictly outside the boundary are rejected
      return {
        allowed: false,
        reason: 'GPS_OUTSIDE_AUTHORITY_BOUNDARY',
        authAreaName,
      };
    }
  }

  // 6. Area ID Match Test
  const pointAreaIdStr = areaId ? String(areaId._id || areaId) : null;
  if (pointAreaIdStr && jurisdictionAreaIdStrings.has(pointAreaIdStr)) {
    return { allowed: true, reason: 'MATCH_AREA_ID', authAreaName };
  }

  // 7. Text keyword matching on address (if area has no boundary in DB)
  if (authArea && authArea.name && address) {
    const areaKw = authArea.name.toLowerCase().replace(/^(phường|quận|huyện|xã)\s+/i, '').trim();
    const addrLower = String(address).toLowerCase();
    if (areaKw.length > 2 && addrLower.includes(areaKw)) {
      return { allowed: true, reason: 'MATCH_ADDRESS_KEYWORD', authAreaName };
    }
  }

  return {
    allowed: false,
    reason: 'OUTSIDE_JURISDICTION',
    authAreaName,
  };
}

/**
 * Normalize Vietnamese administrative area names for accent-insensitive matching.
 */
function normalizeAreaName(value) {
  return String(value || '')
    .replace(/đ/gi, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve all active PROVINCE ObjectIds sharing the same normalized province name
 * (e.g. legacy `DANANG` and official `VN-48` for Thành phố Đà Nẵng).
 */
async function getEquivalentProvinceIds(areaOrId, AdministrativeAreaModel) {
  if (!areaOrId) return [];
  const doc =
    typeof areaOrId === 'object' && areaOrId.type && areaOrId.name
      ? areaOrId
      : await AdministrativeAreaModel.findById(areaOrId).select('_id type name').lean();
  if (!doc) return [];
  if (doc.type !== 'PROVINCE' || !doc.name) return [doc._id];

  const targetNorm = normalizeAreaName(doc.name);
  const provinces = await AdministrativeAreaModel.find({ type: 'PROVINCE', status: 'ACTIVE' })
    .select('_id name')
    .lean();
  const matched = provinces.filter((p) => normalizeAreaName(p.name) === targetNorm).map((p) => p._id);
  if (!matched.some((id) => String(id) === String(doc._id))) {
    matched.push(doc._id);
  }
  return matched;
}

/**
 * Walk up parentId from any area to find its root PROVINCE and any equivalent sibling PROVINCE IDs.
 */
async function getRootProvinceIdsForArea(areaId, AdministrativeAreaModel) {
  if (!areaId) return { rootProvinceId: null, equivalentProvinceIds: [], areaDoc: null };
  let current = await AdministrativeAreaModel.findById(areaId)
    .select('_id name code type parentId')
    .lean();
  const areaDoc = current;
  let hops = 0;
  while (current && hops < 5) {
    if (current.type === 'PROVINCE') {
      const equivalentProvinceIds = await getEquivalentProvinceIds(current, AdministrativeAreaModel);
      return { rootProvinceId: current._id, equivalentProvinceIds, areaDoc };
    }
    if (!current.parentId) break;
    current = await AdministrativeAreaModel.findById(current.parentId)
      .select('_id name code type parentId')
      .lean();
    hops += 1;
  }
  return { rootProvinceId: null, equivalentProvinceIds: [], areaDoc };
}

/**
 * Collect all descendant area ObjectIds (BFS) starting from an area, optionally merging
 * sibling PROVINCE trees with the same normalized province name.
 */
async function getDescendantAreaIds(rootAreaId, AdministrativeAreaModel, { includeEquivalentProvinces = true } = {}) {
  if (!rootAreaId) return { areaIds: [], boundedAreas: [] };
  const rootDoc = await AdministrativeAreaModel.findById(rootAreaId)
    .select('_id name type boundary')
    .lean();
  if (!rootDoc) return { areaIds: [rootAreaId], boundedAreas: [] };

  const seedIds =
    includeEquivalentProvinces && rootDoc.type === 'PROVINCE'
      ? await getEquivalentProvinceIds(rootDoc, AdministrativeAreaModel)
      : [rootDoc._id];

  const allAreas = await AdministrativeAreaModel.find({ status: 'ACTIVE' })
    .select('_id parentId boundary')
    .lean();

  const selectedIds = new Set(seedIds.map((id) => id.toString()));
  const areaIds = [...seedIds];
  let foundChild = true;
  while (foundChild) {
    foundChild = false;
    for (const area of allAreas) {
      const parentId = area.parentId?.toString();
      const idStr = area._id.toString();
      if (parentId && selectedIds.has(parentId) && !selectedIds.has(idStr)) {
        selectedIds.add(idStr);
        areaIds.push(area._id);
        foundChild = true;
      }
    }
  }

  const boundedAreas = allAreas.filter(
    (area) =>
      selectedIds.has(area._id.toString()) &&
      area.boundary?.type &&
      Array.isArray(area.boundary.coordinates) &&
      area.boundary.coordinates.length > 0
  );

  return { areaIds, boundedAreas };
}

/**
 * Resolve target broadcast/check scope ('PROVINCE' | 'WARD' | 'ALL') for an AdministrativeArea.
 * Leaf DISTRICT records with no child WARDs (e.g. "Đặc khu Hoàng Sa") act as single-unit scope ('WARD').
 */
async function resolveTargetScopeForArea(areaDoc, AdministrativeAreaModel) {
  if (!areaDoc) return 'ALL';
  if (areaDoc.type === 'PROVINCE') return 'PROVINCE';
  if (areaDoc.type === 'WARD') return 'WARD';
  if (areaDoc.type === 'DISTRICT') {
    const hasChildWards = await AdministrativeAreaModel.exists({
      parentId: areaDoc._id,
      type: 'WARD',
      status: 'ACTIVE',
    });
    return hasChildWards ? 'PROVINCE' : 'WARD';
  }
  return 'PROVINCE';
}

module.exports = {
  isPointInRing,
  isPointInPolygonGeometry,
  findAreaByCoordinates,
  checkPointInAuthorityJurisdiction,
  normalizeAreaName,
  getEquivalentProvinceIds,
  getRootProvinceIdsForArea,
  getDescendantAreaIds,
  resolveTargetScopeForArea,
};

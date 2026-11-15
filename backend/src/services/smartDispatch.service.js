const mongoose = require('mongoose');
const {
  SosRequest,
  SosAssignment,
  RescueTeam,
  Vehicle,
  Equipment,
  HazardReport,
  AdministrativeArea,
  AuthorityOrganization,
} = require('../models');
const sosTriageService = require('./sosTriage.service');
const geminiService = require('./gemini.service');
const ApiError = require('../utils/apiError');

const AI_ADVISOR_CACHE = new Map();
const AI_ADVISOR_TTL_MS = 60 * 1000;
const AI_ADVISOR_CACHE_MAX_ENTRIES = 300;

function cacheAdvisorResult(key, data) {
  const now = Date.now();
  for (const [cacheKey, entry] of AI_ADVISOR_CACHE) {
    if (now - entry.ts >= AI_ADVISOR_TTL_MS) AI_ADVISOR_CACHE.delete(cacheKey);
  }
  while (AI_ADVISOR_CACHE.size >= AI_ADVISOR_CACHE_MAX_ENTRIES) {
    const oldestKey = AI_ADVISOR_CACHE.keys().next().value;
    if (!oldestKey) break;
    AI_ADVISOR_CACHE.delete(oldestKey);
  }
  AI_ADVISOR_CACHE.set(key, { ts: now, data });
}

function normalizeAreaText(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function cleanAreaKeyword(s) {
  if (!s) return '';
  const cleaned = String(s)
    .toLowerCase()
    .replace(/^(phường|xã|thị trấn|quận|huyện|thị xã|thành phố|tỉnh|tp\.?)\s+/i, '')
    .trim();
  const norm = normalizeAreaText(cleaned);
  if (!norm || norm.length < 2) return '';
  if (['da nang', 'toan quoc', 'viet nam', 'dia ban phu trach'].includes(norm)) return '';
  return norm;
}

function buildJurisdictionScope({ sos, officerAreaId, officerAreaName, isAdmin, areaMap }) {
  const areaIds = new Set();
  const districtIds = new Set();
  let keyword = '';

  const addDistrictParent = (areaDoc) => {
    const pId = areaDoc?.parentId?._id ? String(areaDoc.parentId._id) : areaDoc?.parentId ? String(areaDoc.parentId) : null;
    if (!pId) return null;
    const pDoc = areaMap.get(pId);
    if (pDoc && pDoc.type !== 'PROVINCE') {
      districtIds.add(pId);
      areaIds.add(pId);
      return pDoc;
    }
    return null;
  };

  if (!isAdmin && (officerAreaId || officerAreaName)) {
    const doc = officerAreaId ? areaMap.get(String(officerAreaId)) : null;
    if (officerAreaId) areaIds.add(String(officerAreaId));
    if (doc?.type === 'DISTRICT') districtIds.add(String(doc._id));
    const parentDistrict = addDistrictParent(doc);
    keyword = cleanAreaKeyword(officerAreaName || doc?.name || parentDistrict?.name);
    return {
      filterCompetingByScope: Boolean(areaIds.size > 0 || keyword),
      areaIds,
      districtIds,
      keyword,
    };
  }

  const sosAreaId = sos?.areaId?._id ? String(sos.areaId._id) : sos?.areaId ? String(sos.areaId) : null;
  const sosAreaDoc = sosAreaId ? areaMap.get(sosAreaId) : (typeof sos?.areaId === 'object' ? sos.areaId : null);
  if (sosAreaId) areaIds.add(sosAreaId);
  if (sosAreaDoc?.type === 'DISTRICT') districtIds.add(String(sosAreaDoc._id));
  const parentDistrict = addDistrictParent(sosAreaDoc);
  keyword = cleanAreaKeyword(parentDistrict?.name || sosAreaDoc?.name);
  return { filterCompetingByScope: false, areaIds, districtIds, keyword };
}

function isAreaEntityInScope(areaObjOrId, extraText, scope, areaMap) {
  if (!scope || (scope.areaIds.size === 0 && scope.districtIds.size === 0 && !scope.keyword)) {
    return true;
  }
  const areaId = areaObjOrId?._id ? String(areaObjOrId._id) : areaObjOrId ? String(areaObjOrId) : null;
  if (areaId && scope.areaIds.has(areaId)) return true;

  const doc = (areaId && areaMap.get(areaId)) || (typeof areaObjOrId === 'object' ? areaObjOrId : null);
  const parentId = doc?.parentId?._id ? String(doc.parentId._id) : doc?.parentId ? String(doc.parentId) : null;
  if (parentId && (scope.areaIds.has(parentId) || scope.districtIds.has(parentId))) return true;

  if (scope.keyword) {
    const parentDoc = parentId ? areaMap.get(parentId) : null;
    const normText = normalizeAreaText(`${doc?.name || ''} ${parentDoc?.name || ''} ${extraText || ''}`);
    if (normText.includes(scope.keyword)) return true;
  }
  return false;
}

function haversineKm(coordsA, coordsB) {
  if (!Array.isArray(coordsA) || !Array.isArray(coordsB) || coordsA.length !== 2 || coordsB.length !== 2) {
    return null;
  }
  const [lng1, lat1] = coordsA;
  const [lng2, lat2] = coordsB;
  if ([lng1, lat1, lng2, lat2].some((v) => typeof v !== 'number' || Number.isNaN(v))) {
    return null;
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractAreaCentroid(areaDoc) {
  const geom = areaDoc?.boundary;
  if (!geom || !Array.isArray(geom.coordinates)) return null;
  const ring = geom.type === 'Polygon' ? geom.coordinates[0] : geom.type === 'MultiPolygon' ? geom.coordinates[0]?.[0] : null;
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let sumLng = 0;
  let sumLat = 0;
  let count = 0;
  for (const pt of ring) {
    if (Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
      sumLng += pt[0];
      sumLat += pt[1];
      count++;
    }
  }
  return count > 0 ? [sumLng / count, sumLat / count] : null;
}

function resolveTeamLocation(team, areaCentroidMap) {
  const candidates = [];
  if (team.leaderId && typeof team.leaderId === 'object') {
    candidates.push(team.leaderId);
  }
  for (const m of team.members || []) {
    if (m.status === 'APPROVED' && m.rescuerId && typeof m.rescuerId === 'object') {
      candidates.push(m.rescuerId);
    }
  }

  let bestFreshGps = null;
  let bestRecentStaleGps = null;
  let fallbackAncientGps = null;
  let untimestampedGps = null;

  for (const person of candidates) {
    const coords = person.currentLocation?.coordinates;
    if (Array.isArray(coords) && coords.length === 2 && !Number.isNaN(coords[0]) && !Number.isNaN(coords[1])) {
      const updatedAt = person.currentLocationUpdatedAt || null;
      const updatedAtMs = updatedAt ? new Date(updatedAt).getTime() : NaN;
      const ageMinutes = Number.isFinite(updatedAtMs)
        ? Math.max(0, Math.round((Date.now() - updatedAtMs) / 60000))
        : null;
      if (ageMinutes !== null && ageMinutes <= 45) {
        const freshGps = {
          coordinates: [Number(coords[0]), Number(coords[1])],
          source: 'GPS_REALTIME',
          gpsAgeMinutes: ageMinutes,
        };
        if (!bestFreshGps || ageMinutes < bestFreshGps.gpsAgeMinutes) bestFreshGps = freshGps;
        continue;
      }
      if (ageMinutes !== null && ageMinutes <= 180 && !bestRecentStaleGps) {
        bestRecentStaleGps = {
          coordinates: [Number(coords[0]), Number(coords[1])],
          source: 'GPS_STALE',
          gpsAgeMinutes: ageMinutes,
        };
      } else if (ageMinutes !== null && !fallbackAncientGps) {
        fallbackAncientGps = {
          coordinates: [Number(coords[0]), Number(coords[1])],
          source: 'GPS_STALE',
          gpsAgeMinutes: ageMinutes,
        };
      } else if (ageMinutes === null && !untimestampedGps) {
        untimestampedGps = {
          coordinates: [Number(coords[0]), Number(coords[1])],
          source: 'GPS_UNKNOWN_AGE',
          gpsAgeMinutes: null,
        };
      }
    }
  }

  if (bestFreshGps) {
    return bestFreshGps;
  }

  if (bestRecentStaleGps) {
    return bestRecentStaleGps;
  }

  const baseCoords = team.baseLocation?.coordinates;
  if (Array.isArray(baseCoords) && baseCoords.length === 2 && !Number.isNaN(baseCoords[0]) && !Number.isNaN(baseCoords[1])) {
    return {
      coordinates: [Number(baseCoords[0]), Number(baseCoords[1])],
      source: 'BASE_LOCATION',
      gpsAgeMinutes: null,
    };
  }

  if (fallbackAncientGps) {
    return fallbackAncientGps;
  }

  if (untimestampedGps) {
    return untimestampedGps;
  }

  const areaIdStr = team.areaId?._id ? String(team.areaId._id) : team.areaId ? String(team.areaId) : '';
  if (areaIdStr && areaCentroidMap.has(areaIdStr)) {
    return {
      coordinates: areaCentroidMap.get(areaIdStr),
      source: 'AREA_CENTROID',
      gpsAgeMinutes: null,
    };
  }

  return {
    coordinates: null,
    source: 'UNKNOWN',
    gpsAgeMinutes: null,
  };
}

function collectTeamSkills(team) {
  const skills = [];
  if (team.leaderId?.rescuer?.verificationStatus === 'VERIFIED' && team.leaderId?.rescuer?.skills) {
    skills.push(...team.leaderId.rescuer.skills);
  }
  for (const m of team.members || []) {
    if (m.status === 'APPROVED' && m.rescuerId?.rescuer?.verificationStatus === 'VERIFIED' && m.rescuerId?.rescuer?.skills) {
      skills.push(...m.rescuerId.rescuer.skills);
    }
  }
  return Array.from(new Set(skills.map((s) => String(s).trim()).filter(Boolean)));
}

function selectInitialTeamVehicle(teamVehicles) {
  const available = (teamVehicles || []).filter((v) => v.status === 'AVAILABLE');
  return available.sort((a, b) => (Number(b.capacity) || 0) - (Number(a.capacity) || 0))[0] || null;
}

/**
 * Chuẩn bị dữ liệu sự thật của đội cho AI; chỉ chặn cứng đội đang bận hoặc không ACTIVE/READY.
 */
function buildTeamCandidate({
  team,
  teamVehicles,
  teamEquipments,
  busyAssignment,
  sos,
  sosCoords,
  approvedHazards,
  areaCentroidMap,
  jurisdictionScope,
  areaMap,
}) {
  const locInfo = resolveTeamLocation(team, areaCentroidMap);
  const distanceKm = locInfo.coordinates && sosCoords ? haversineKm(locInfo.coordinates, sosCoords) : null;
  const primaryVehicle = selectInitialTeamVehicle(teamVehicles);
  const nearbyHazards = (approvedHazards || [])
    .map((hazard) => {
      const distanceKmToSos = sosCoords ? haversineKm(hazard.location?.coordinates, sosCoords) : null;
      return { hazard, distanceKmToSos };
    })
    .filter(({ distanceKmToSos }) => distanceKmToSos !== null)
    .sort((a, b) => a.distanceKmToSos - b.distanceKmToSos)
    .slice(0, 8)
    .map(({ hazard, distanceKmToSos }) => ({
      title: hazard.title,
      hazardType: hazard.hazardType,
      severity: hazard.severity,
      distanceToIncidentMeters: Math.round(distanceKmToSos * 1000),
    }));

  const distanceLabel = distanceKm === null
    ? null
    : `${locInfo.source === 'GPS_REALTIME' ? 'GPS' : 'Vị trí tham khảo'} cách SOS ${distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`} (đường chim bay)`;
  const matchReasons = distanceLabel ? [distanceLabel] : [];
  const warnings = [];
  if (distanceKm === null) warnings.push('Chưa có vị trí đủ tin cậy để tính khoảng cách');
  if (locInfo.source === 'GPS_STALE') warnings.push(`GPS đội đã cũ (${locInfo.gpsAgeMinutes} phút)`);
  if (locInfo.source === 'GPS_UNKNOWN_AGE') warnings.push('GPS đội không có thời điểm cập nhật; cần xác minh vị trí');
  if (locInfo.source === 'AREA_CENTROID') warnings.push('Đang dùng tâm địa bàn, không phải vị trí hiện tại của đội');
  if (locInfo.source === 'BASE_LOCATION') warnings.push('Đang dùng vị trí đơn vị, không phải GPS hiện tại của đội');

  const teamSkills = collectTeamSkills(team);
  const peopleNeeded = Math.max(1, Number(sos.people) || 1);
  // Mỗi phân công hiện chọn một phương tiện cho mỗi đội, nên dùng sức chở lớn nhất
  // của một xe sẵn sàng thay vì cộng nhiều xe mà assignment chưa thể điều cùng lúc.
  const availableVehicles = (teamVehicles || [])
    .filter((vehicle) => vehicle.status === 'AVAILABLE')
    .map((vehicle) => ({
      id: String(vehicle._id),
      type: vehicle.type,
      plateNumber: vehicle.plateNumber,
      capacity: Number(vehicle.capacity) || 0,
      terrainCapabilities: Array.isArray(vehicle.terrainCapabilities) ? vehicle.terrainCapabilities : [],
    }));
  const transportCapacity = availableVehicles.reduce((max, vehicle) => Math.max(max, vehicle.capacity), 0);
  const capacityShortfall = Math.max(0, peopleNeeded - transportCapacity);
  if (capacityShortfall > 0) warnings.push(`Một phương tiện khả dụng chở tối đa ${transportCapacity} người; SOS có ${peopleNeeded} người`);

  const availableTeamEquipments = (teamEquipments || []).filter(
    (e) => e.status === 'AVAILABLE' && Number(e.quantity) > 0
  );
  const availableEquipment = Array.from(new Set(availableTeamEquipments.map((e) => e.category)));
  const teamSupplies = availableTeamEquipments.map((e) => ({
    supplyId: String(e._id),
    name: e.name,
    category: e.category,
    quantity: Number(e.quantity) || 0,
    unit: e.unit || 'cái',
  }));

  const teamAreaId = team.areaId?._id ? String(team.areaId._id) : team.areaId ? String(team.areaId) : null;
  const hasScopeConstraint = Boolean(
    jurisdictionScope &&
    (jurisdictionScope.areaIds.size > 0 || jurisdictionScope.districtIds.size > 0 || jurisdictionScope.keyword)
  );
  const isCrossArea = hasScopeConstraint
    ? !isAreaEntityInScope(team.areaId, team.name, jurisdictionScope, areaMap)
    : false;

  if (isCrossArea) {
    warnings.push(`Đội chi viện từ địa bàn khác (${team.areaId?.name || 'lân cận'})`);
  }
  if (busyAssignment) {
    warnings.push(`Đang bận nhiệm vụ (${busyAssignment.sosRequestId?.sosCode || busyAssignment.status})`);
  }
  if (team.operationalStatus === 'LIMITED') {
    warnings.push('Đội đang hoạt động hạn chế; cần cán bộ xác nhận khả năng xuất phát');
  }

  const sosCitizenId = sos.citizenId?._id ? String(sos.citizenId._id) : sos.citizenId ? String(sos.citizenId) : null;
  const teamLeaderId = team.leaderId?._id ? String(team.leaderId._id) : team.leaderId ? String(team.leaderId) : null;
  const isTeamLeaderDistressed = Boolean(sosCitizenId && teamLeaderId && sosCitizenId === teamLeaderId);
  if (isTeamLeaderDistressed) {
    warnings.push('Đội trưởng của đội này đang gửi yêu cầu SOS; không thể phân công');
  }

  // Cấm tuyệt đối đội đang bận nhiệm vụ, có đội trưởng đang gửi SOS, hoặc không ở trạng thái ACTIVE / READY
  const dispatchEligible =
    !busyAssignment &&
    !isTeamLeaderDistressed &&
    team.status === 'ACTIVE' &&
    (team.operationalStatus === 'READY' || !team.operationalStatus);

  return {
    teamId: String(team._id),
    teamName: team.name,
    teamType: team.type,
    areaId: teamAreaId,
    areaName: team.areaId?.name || null,
    isCrossArea,
    isBusy: Boolean(busyAssignment),
    dispatchEligible,
    hasCompleteCapabilityMatch: undefined,
    matchedCapabilities: [],
    busyMission: busyAssignment
      ? {
        assignmentId: String(busyAssignment._id),
        status: busyAssignment.status,
        sosCode: busyAssignment.sosRequestId?.sosCode || null,
      }
      : null,
    distanceKm: distanceKm !== null ? Number(distanceKm.toFixed(2)) : null,
    etaMinutes: null,
    etaText: 'Chưa có ETA định tuyến',
    locationSource: locInfo.source,
    gpsAgeMinutes: locInfo.gpsAgeMinutes,
    teamSkills,
    availableEquipment,
    teamSupplies,
    memberCount: (team.members || []).filter((member) => member.status === 'APPROVED').length,
    primaryVehicle: primaryVehicle
      ? {
        id: String(primaryVehicle._id),
        type: primaryVehicle.type,
        plateNumber: primaryVehicle.plateNumber,
        capacity: primaryVehicle.capacity,
        status: primaryVehicle.status,
        terrainCapabilities: Array.isArray(primaryVehicle.terrainCapabilities) ? primaryVehicle.terrainCapabilities : [],
      }
      : null,
    availableVehicles,
    totalCapacity: transportCapacity,
    capacityShortfall,
    nearbyHazards,
    matchReasons,
    warnings,
    suggestedSupplies: [],
  };
}

/**
 * Cảnh báo xung đột tài nguyên toàn cục khi nhiều SOS nguy cấp xảy ra cùng lúc.
 */
  function detectMultiSosConflicts({ sos, scoredTeams, competingSos, jurisdictionScope, areaMap }) {
    const conflicts = [];
    const readySpecialists = scoredTeams.filter((t) => t.dispatchEligible && !t.isBusy && !t.isCrossArea);
    const criticalCompeting = (competingSos || []).filter((other) => {
      if (String(other._id) === String(sos._id)) return false;
      if (!['CRITICAL', 'HIGH'].includes(other.priority)) return false;
      if (jurisdictionScope?.filterCompetingByScope) {
        return isAreaEntityInScope(other.areaId, other.address, jurisdictionScope, areaMap);
      }
      return true;
    });

    if (criticalCompeting.length > 0 && readySpecialists.length <= 2) {
      conflicts.push({
        type: 'SCARCE_READY_TEAMS',
        severity: criticalCompeting.some((c) => c.priority === 'CRITICAL') ? 'HIGH' : 'MEDIUM',
        message: `Còn ${readySpecialists.length} đội sẵn sàng trong khu vực trong khi có ${criticalCompeting.length} ca HIGH/CRITICAL khác cũng đang chờ điều phối.`,
        competingSosCodes: criticalCompeting.slice(0, 3).map((c) => c.sosCode),
      });
    }

    return conflicts;
  }

  function validateDispatchAdvisor(advisor, eligibleTeams, busyTeamIds, sosNeeds, people) {
    const recommendedIds = Array.from(new Set(
      (Array.isArray(advisor?.recommendedTeamIds) ? advisor.recommendedTeamIds : []).map(String)
    ));
    const eligibleById = new Map(eligibleTeams.map((team) => [team.teamId, team]));
    const chosen = recommendedIds.map((id) => eligibleById.get(id)).filter(Boolean);
    const issues = [];

    const pickedBusyIds = recommendedIds.filter((id) => busyTeamIds.has(id));
    if (pickedBusyIds.length > 0) {
      issues.push('AI đã chọn đội đang bận nhiệm vụ khác (bị cấm). Chỉ được chọn đội đang rảnh.');
    } else if (recommendedIds.length !== chosen.length) {
      issues.push('AI trả về ID đội không nằm trong danh sách đội sẵn sàng hiện tại.');
    }

    if (chosen.length === 0) {
      issues.push('AI chưa chọn được đội cứu hộ sẵn sàng hợp lệ.');
    } else if (chosen.length > 4) {
      issues.push('Phương án điều phối tối đa không quá 4 đội cùng lúc.');
    }

    const needsTransportCapacity = (sosNeeds?.requiredCapabilities || []).includes('EVACUATION');
    if (needsTransportCapacity && chosen.length > 0) {
      const availableCapacity = chosen.reduce((sum, team) => sum + (Number(team.totalCapacity) || 0), 0);
      if (availableCapacity < (Number(people) || 1)) {
        issues.push(`Tổng sức chở của các đội được chọn là ${availableCapacity}, thấp hơn ${Number(people) || 1} người cần sơ tán.`);
      }
    }

    let normalizedPlanType = advisor?.recommendedPlanType || 'SINGLE_TEAM';
    if (chosen.length >= 2) {
      normalizedPlanType = 'MULTI_TEAM';
    } else if (chosen.length === 1) {
      normalizedPlanType = chosen[0].isCrossArea ? 'CROSS_AREA_BACKUP' : 'SINGLE_TEAM';
    }

    return {
      chosen,
      normalizedPlanType,
      issues,
      valid: issues.length === 0 && chosen.length > 0,
    };
  }

  function applyAiEvaluationsToCandidates(candidates, aiAdvisor, allEquipments, warehouseEquipments, eligibleTeams) {
    if (!aiAdvisor) return;

    const eligibleIds = new Set((eligibleTeams || []).map((team) => team.teamId));
    aiAdvisor.recommendedTeamIds = Array.from(new Set((Array.isArray(aiAdvisor.recommendedTeamIds) ? aiAdvisor.recommendedTeamIds : []).map(String)))
      .filter((id) => eligibleIds.has(id));
    aiAdvisor.rankedTeamIds = Array.from(new Set((Array.isArray(aiAdvisor.rankedTeamIds) ? aiAdvisor.rankedTeamIds : []).map(String)))
      .filter((id) => eligibleIds.has(id));
    aiAdvisor.teamEvaluations = (Array.isArray(aiAdvisor.teamEvaluations) ? aiAdvisor.teamEvaluations : [])
      .filter((item) => item && eligibleIds.has(String(item.teamId)));
    const evalByTeamId = new Map(
      (aiAdvisor.teamEvaluations || []).map((item) => [String(item.teamId), item])
    );
    const equipmentById = new Map(
      (allEquipments || []).map((eq) => [String(eq._id), eq])
    );

    const validatedSupplies = [];
    const seenSupplyIds = new Set();
    const warehouseIds = new Set((warehouseEquipments || []).map((eq) => String(eq._id)));
    for (const item of (Array.isArray(aiAdvisor.recommendedSupplies) ? aiAdvisor.recommendedSupplies : [])) {
      if (!item?.supplyId) continue;
      const eq = equipmentById.get(String(item.supplyId));
      if (!eq || !warehouseIds.has(String(eq._id)) || eq.teamId || eq.status !== 'AVAILABLE' || Number(eq.quantity) <= 0) continue;
      const eqId = String(eq._id);
      if (seenSupplyIds.has(eqId)) continue;
      seenSupplyIds.add(eqId);

      const qty = Math.min(Number(eq.quantity), Math.max(1, Number(item.quantity) || 1));
      validatedSupplies.push({
        supplyId: eqId,
        name: eq.name,
        category: eq.category,
        quantity: qty,
        unit: eq.unit || 'cái',
        availableStock: Number(eq.quantity),
        fromTeamInventory: Boolean(eq.teamId),
      });
    }
    aiAdvisor.recommendedSupplies = validatedSupplies;

    const recommendedSet = new Set(aiAdvisor.recommendedTeamIds || []);
    const teamNameById = new Map(candidates.map((c) => [String(c.teamId), c.teamName]));
    const cleanDisplayText = (text) => {
      if (!text || typeof text !== 'string') return '';
      let out = text;
      for (const [tId, tName] of teamNameById.entries()) {
        out = out.replace(new RegExp(`\\(\\s*${tId}\\s*\\)`, 'gi'), '');
        out = out.replace(new RegExp(`\\b${tId}\\b`, 'gi'), tName || '');
      }
      return out
        .replace(/\(\s*[a-f0-9]{24}\s*\)/gi, '')
        .replace(/\b[a-f0-9]{24}\b/gi, '')
        .replace(/\bFLOOD_RESCUE\b/g, 'cứu hộ lũ')
        .replace(/\bWATER_RESCUE\b/g, 'cứu nạn đường thủy')
        .replace(/\bMEDICAL_RESCUE\b/g, 'cứu hộ y tế')
        .replace(/\bEVACUATION\b/g, 'sơ tán')
        .replace(/\bSEARCH_RESCUE\b/g, 'tìm kiếm cứu nạn')
        .replace(/\bLOGISTICS\b/g, 'hậu cần')
        .replace(/\bFIRE_RESCUE\b/g, 'PCCC')
        .replace(/\s{2,}/g, ' ')
        .trim();
    };

    if (aiAdvisor.summary) {
      aiAdvisor.summary = cleanDisplayText(aiAdvisor.summary);
    }
    if (Array.isArray(aiAdvisor.routeWarnings)) {
      aiAdvisor.routeWarnings = aiAdvisor.routeWarnings.map(cleanDisplayText).filter(Boolean);
    }

    for (const candidate of candidates) {
      if (candidate.isBusy) {
        candidate.dispatchEligible = false;
        continue;
      }

      const aiEval = evalByTeamId.get(candidate.teamId);
      if (aiEval) {
        if (Array.isArray(aiEval.matchReasons) && aiEval.matchReasons.length > 0) {
          candidate.matchReasons = aiEval.matchReasons.map(cleanDisplayText).filter(Boolean);
        }
        if (Array.isArray(aiEval.warnings) && aiEval.warnings.length > 0) {
          const mergedWarnings = aiEval.warnings.map(cleanDisplayText).filter(Boolean);
          for (const w of candidate.warnings || []) {
            const cw = cleanDisplayText(w);
            if (cw && !mergedWarnings.includes(cw)) mergedWarnings.push(cw);
          }
          candidate.warnings = mergedWarnings.slice(0, 3);
        }
      }

      if (recommendedSet.has(candidate.teamId) && validatedSupplies.length > 0) {
        candidate.suggestedSupplies = validatedSupplies;
      }
    }

    const recommendedOrder = new Map(
      (aiAdvisor.recommendedTeamIds || []).map((id, idx) => [String(id), idx])
    );
    const rankedOrder = new Map(
      (aiAdvisor.rankedTeamIds || []).map((id, idx) => [String(id), idx])
    );

    candidates.sort((a, b) => {
      if (a.dispatchEligible !== b.dispatchEligible) return a.dispatchEligible ? -1 : 1;
      if (a.isBusy !== b.isBusy) return a.isBusy ? 1 : -1;

      const recA = recommendedOrder.has(a.teamId) ? recommendedOrder.get(a.teamId) : 999;
      const recB = recommendedOrder.has(b.teamId) ? recommendedOrder.get(b.teamId) : 999;
      if (recA !== recB) return recA - recB;

      const rankA = rankedOrder.has(a.teamId) ? rankedOrder.get(a.teamId) : 999;
      const rankB = rankedOrder.has(b.teamId) ? rankedOrder.get(b.teamId) : 999;
      if (rankA !== rankB) return rankA - rankB;

      if (a.isCrossArea !== b.isCrossArea) return a.isCrossArea ? 1 : -1;
      return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
    });
  }

  async function getDispatchRecommendations(sosId, options = {}) {
    if (!mongoose.Types.ObjectId.isValid(sosId)) {
      throw new ApiError(400, 'sosId không hợp lệ');
    }

    let sos = await SosRequest.findById(sosId).populate('areaId', 'name code type parentId').lean();
    if (!sos) {
      throw new ApiError(404, 'Không tìm thấy yêu cầu SOS');
    }
    const needsAiTriage =
      sos.aiAssessment?.status !== 'COMPLETED' ||
      !String(sos.riskAssessment?.modelVersion || '').startsWith('gemini-ai-triage-');
    if (options.includeAiAdvisor && geminiService.isConfigured() && needsAiTriage) {
      await sosTriageService.runAiTriageNow(sosId, { emitSocket: true });
      sos = await SosRequest.findById(sosId).populate('areaId', 'name code type parentId').lean();
    }

    const targetAreaIds = [
      sos.areaId?._id || sos.areaId,
      sos.areaId?.parentId,
      options.officerAreaId,
    ]
      .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const [teams, allVehicles, allEquipments, activeAssignments, approvedHazards, activeAreas, unassignedSos, localAuthorities] =
      await Promise.all([
        RescueTeam.find({ status: 'ACTIVE', operationalStatus: { $ne: 'INACTIVE' } })
          .populate('leaderId', 'fullName phone rescuer currentLocation currentLocationUpdatedAt updatedAt')
          .populate('areaId', 'name code type parentId')
          .populate({
            path: 'members.rescuerId',
            select: 'fullName phone rescuer currentLocation currentLocationUpdatedAt updatedAt',
          })
          .lean(),
        Vehicle.find({ status: { $ne: 'INACTIVE' } }).lean(),
        Equipment.find({ status: 'AVAILABLE', quantity: { $gt: 0 } }).lean(),
        SosAssignment.find({
          status: { $nin: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
        })
          .populate('sosRequestId', 'sosCode priority status')
          .lean(),
        HazardReport.find({ status: 'APPROVED' }).select('title hazardType severity location').lean(),
        AdministrativeArea.find({ status: 'ACTIVE' }).select('_id name code type parentId boundary').lean(),
        SosRequest.find({
          status: { $in: ['PENDING', 'VERIFIED'] },
        })
          .populate('areaId', 'name code type parentId')
          .select('sosCode priority riskScore areaId address emergencyType')
          .lean(),
        targetAreaIds.length > 0
          ? AuthorityOrganization.find({
            $or: [{ areaId: { $in: targetAreaIds } }, { administrativeAreaId: { $in: targetAreaIds } }],
          })
            .select('_id')
            .lean()
          : Promise.resolve([]),
      ]);

    const areaMap = new Map();
    const areaCentroidMap = new Map();
    for (const area of activeAreas) {
      areaMap.set(String(area._id), area);
      const centroid = extractAreaCentroid(area);
      if (centroid) areaCentroidMap.set(String(area._id), centroid);
    }

    const jurisdictionScope = buildJurisdictionScope({
      sos,
      officerAreaId: options.officerAreaId || null,
      officerAreaName: options.officerAreaName || null,
      isAdmin: Boolean(options.isAdmin),
      areaMap,
    });

    const vehiclesByTeam = new Map();
    for (const v of allVehicles) {
      if (!v.teamId) continue;
      const k = String(v.teamId);
      if (!vehiclesByTeam.has(k)) vehiclesByTeam.set(k, []);
      vehiclesByTeam.get(k).push(v);
    }

    const localOrgIds = new Set((localAuthorities || []).map((org) => String(org._id)));
    const equipmentsByTeam = new Map();
    const localWarehouseEquipments = [];
    for (const e of allEquipments) {
      if (e.teamId) {
        const k = String(e.teamId);
        if (!equipmentsByTeam.has(k)) equipmentsByTeam.set(k, []);
        equipmentsByTeam.get(k).push(e);
      } else {
        if (e.providedBy && localOrgIds.has(String(e.providedBy))) {
          localWarehouseEquipments.push(e);
        }
      }
    }
    // Không dùng tồn kho địa bàn khác làm phương án thay thế khi kho địa phương trống.
    const warehouseEquipments = localWarehouseEquipments;

    const busyByTeam = new Map();
    for (const a of activeAssignments) {
      const rawIds = String(a.rescueTeamId || a.teamId || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const tId of rawIds) {
        busyByTeam.set(tId, a);
      }
    }

    const sosNeeds = sos.riskAssessment?.operationalNeeds || sos.aiAssessment?.operationalNeeds || {};
    const sosCoords = Array.isArray(sos.location?.coordinates) ? sos.location.coordinates : null;

    const candidates = teams.map((team) =>
      buildTeamCandidate({
        team,
        teamVehicles: vehiclesByTeam.get(String(team._id)) || [],
        teamEquipments: equipmentsByTeam.get(String(team._id)) || [],
        busyAssignment: busyByTeam.get(String(team._id)) || null,
        sos,
        sosCoords,
        approvedHazards,
        areaCentroidMap,
        jurisdictionScope,
        areaMap,
      })
    );

    // Thứ tự cơ sở chỉ dùng trạng thái và địa bàn; không dùng ETA giả định.
    candidates.sort((a, b) => {
      if (a.dispatchEligible !== b.dispatchEligible) return a.dispatchEligible ? -1 : 1;
      if (a.isBusy !== b.isBusy) return a.isBusy ? 1 : -1;
      if (a.isCrossArea !== b.isCrossArea) return a.isCrossArea ? 1 : -1;
      return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
    });

    const conflicts = detectMultiSosConflicts({
      sos,
      scoredTeams: candidates,
      competingSos: unassignedSos,
      jurisdictionScope,
      areaMap,
    });

    let aiAdvisor = null;
    let aiAdvisorStatus = !geminiService.isConfigured() ? 'UNAVAILABLE' : 'NOT_REQUESTED';
    if (options.includeAiAdvisor && geminiService.isConfigured()) {
      // Tuyệt đối chỉ lấy các đội không bận (dispatchEligible && !isBusy) cho AI chọn
      const eligibleTeams = candidates.filter((team) => team.dispatchEligible && !team.isBusy);
      const busyTeamIds = new Set(candidates.filter((team) => team.isBusy).map((team) => team.teamId));

      if (eligibleTeams.length === 0) {
        aiAdvisorStatus = 'NO_ELIGIBLE_TEAMS';
      } else {
        const sosCacheData = JSON.stringify({
          sosCode: sos.sosCode,
          inputHash: sos.riskAssessment?.inputHash || '',
          priority: sos.priority,
          emergencyType: sos.emergencyType,
          emergencyTypes: sos.emergencyTypes || [],
          people: sos.people,
          priorityGroups: sos.priorityGroups || [],
          address: sos.address || '',
          description: sos.description || '',
          location: sos.location?.coordinates || [],
          operationalNeeds: sosNeeds,
          triageReasons: sos.riskAssessment?.reasons || sos.aiAssessment?.reasons || [],
          analyzedAt: sos.aiAssessment?.analyzedAt || null,
        });
        const candidateCacheData = candidates
          .map((t) => JSON.stringify({
            id: t.teamId,
            type: t.teamType,
            eligible: t.dispatchEligible,
            busy: t.isBusy,
            crossArea: t.isCrossArea,
            distanceKm: t.distanceKm,
            locationSource: t.locationSource,
            gpsAgeMinutes: t.gpsAgeMinutes,
            skills: t.teamSkills,
            vehicles: t.availableVehicles,
            capacity: t.totalCapacity,
            hazards: t.nearbyHazards,
            supplies: t.teamSupplies,
          }))
          .join('|');
        const supplyCacheData = JSON.stringify(warehouseEquipments.map((item) => ({
          id: String(item._id),
          quantity: Number(item.quantity) || 0,
          status: item.status,
        })));
        const cacheKey = `${sosId}:${sosCacheData}:${candidateCacheData}:${supplyCacheData}:${JSON.stringify(conflicts)}`;
        const cached = options.forceRefresh ? null : AI_ADVISOR_CACHE.get(cacheKey);
        const cachedValidation = cached?.data
          ? validateDispatchAdvisor(cached.data, eligibleTeams, busyTeamIds, sosNeeds, sos.people)
          : null;
        if (
          cached &&
          Date.now() - cached.ts < AI_ADVISOR_TTL_MS &&
          Array.isArray(cached.data?.recommendedTeamIds) &&
          cached.data.recommendedTeamIds.length > 0 &&
          cached.data.recommendedTeamIds.every((id) => eligibleTeams.some((team) => team.teamId === String(id))) &&
          cachedValidation?.valid &&
          (!Array.isArray(cached.data.validationIssues) || cached.data.validationIssues.length === 0)
        ) {
          aiAdvisor = JSON.parse(JSON.stringify(cached.data));
          applyAiEvaluationsToCandidates(candidates, aiAdvisor, allEquipments, warehouseEquipments, eligibleTeams);
          aiAdvisorStatus = 'COMPLETED';
        } else {
          aiAdvisor = await geminiService.adviseDispatch({
            sos,
            candidates: eligibleTeams,
            warehouseSupplies: warehouseEquipments,
            conflicts,
          });
          if (aiAdvisor) {
            let validation = validateDispatchAdvisor(aiAdvisor, eligibleTeams, busyTeamIds, sosNeeds, sos.people);

            // Retry 1 lần nếu AI trả ID không hợp lệ hoặc chọn nhầm đội đang bận
            if (!validation.valid) {
              const retryAdvisor = await geminiService.adviseDispatch({
                sos,
                candidates: eligibleTeams,
                warehouseSupplies: warehouseEquipments,
                conflicts,
                validationFeedback: {
                  rejectedPlanType: aiAdvisor.recommendedPlanType,
                  rejectedTeamIds: aiAdvisor.recommendedTeamIds,
                  validationIssues: validation.issues,
                  validAvailableTeamIds: eligibleTeams.map((t) => t.teamId),
                  capacityValidationIssues: validation.issues,
                },
              });
              if (retryAdvisor) {
                const retryValidation = validateDispatchAdvisor(retryAdvisor, eligibleTeams, busyTeamIds, sosNeeds, sos.people);
                aiAdvisor = retryAdvisor;
                validation = retryValidation;
              }
            }

            aiAdvisor.validationIssues = validation.issues;
            if (validation.valid) {
              aiAdvisor.recommendedTeamIds = validation.chosen.map((team) => team.teamId);
              aiAdvisor.recommendedPlanType = validation.normalizedPlanType;
              applyAiEvaluationsToCandidates(candidates, aiAdvisor, allEquipments, warehouseEquipments, eligibleTeams);
              aiAdvisorStatus = 'COMPLETED';
              cacheAdvisorResult(cacheKey, aiAdvisor);
            } else {
              aiAdvisor.recommendedTeamIds = [];
              aiAdvisorStatus = 'NEEDS_HUMAN_REVIEW';
              aiAdvisor.summary =
                'AI chưa chọn được phương án hợp lệ từ danh sách đội đang rảnh. Cần cán bộ xem xét và chọn đội thủ công.';
              AI_ADVISOR_CACHE.delete(cacheKey);
            }
          } else {
            aiAdvisorStatus = 'FAILED';
          }
        }
      }
    }

    return {
      sosId: String(sos._id),
      sosCode: sos.sosCode,
      priority: sos.priority,
      operationalNeeds: sosNeeds,
      candidates,
      conflicts,
      aiAdvisor,
      aiAdvisorStatus,
      generatedAt: new Date().toISOString(),
    };
  }

  module.exports = {
    getDispatchRecommendations,
  };


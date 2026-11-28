/**
 * Trích xuất tọa độ [lng, lat] hợp lệ từ GeoJSON Point.
 */
function extractValidCoordinates(point) {
  const coords = point?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng === 0 && lat === 0) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

function extractAreaCentroid(areaDoc) {
  const geom = areaDoc?.boundary;
  if (!geom || !Array.isArray(geom.coordinates)) return null;
  const ring =
    geom.type === 'Polygon'
      ? geom.coordinates[0]
      : geom.type === 'MultiPolygon'
        ? geom.coordinates[0]?.[0]
        : null;
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let sumLng = 0;
  let sumLat = 0;
  let count = 0;
  for (const pt of ring) {
    if (Array.isArray(pt) && pt.length >= 2) {
      const lng = Number(pt[0]);
      const lat = Number(pt[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        sumLng += lng;
        sumLat += lat;
        count++;
      }
    }
  }
  return count > 0 ? [Number((sumLng / count).toFixed(6)), Number((sumLat / count).toFixed(6))] : null;
}

const ASSIGNMENT_TEAM_POPULATE = {
  path: 'rescueTeamId',
  select: 'name type areaId status leaderId baseLocation members',
  populate: [
    {
      path: 'leaderId',
      select: '_id fullName phone email avatarUrl rescuer currentLocation currentLocationUpdatedAt',
    },
    {
      path: 'members.rescuerId',
      select: '_id fullName phone currentLocation currentLocationUpdatedAt',
    },
    {
      path: 'areaId',
      select: 'name code boundary',
    },
  ],
};

const ASSIGNMENT_RESCUER_SELECT =
  '_id fullName phone email avatarUrl roles rescuer currentLocation currentLocationUpdatedAt';

/**
 * Xác định vị trí thực tế của đội/cứu hộ viên cho bản ghi phân công và gắn vào `assignment.teamLocation`.
 */
function attachAssignmentTeamLocation(assignment) {
  if (!assignment || typeof assignment !== 'object') return assignment;

  const existing = extractValidCoordinates(assignment.teamLocation);
  let resolved = existing;

  if (!resolved) {
    const gpsCandidates = [];
    const pushPerson = (person, priority) => {
      if (!person || typeof person !== 'object') return;
      const coords = extractValidCoordinates(person.currentLocation);
      if (!coords) return;
      const updatedMs = person.currentLocationUpdatedAt
        ? new Date(person.currentLocationUpdatedAt).getTime()
        : 0;
      gpsCandidates.push({
        coords,
        updatedMs: Number.isFinite(updatedMs) ? updatedMs : 0,
        priority,
      });
    };

    pushPerson(assignment.rescuerId, 3);
    pushPerson(assignment.rescueTeamId?.leaderId, 2);
    for (const member of assignment.rescueTeamId?.members || []) {
      if (member?.status === 'APPROVED' && member?.rescuerId) {
        pushPerson(member.rescuerId, 1);
      }
    }

    if (gpsCandidates.length > 0) {
      gpsCandidates.sort((a, b) => {
        if (b.updatedMs !== a.updatedMs) return b.updatedMs - a.updatedMs;
        return b.priority - a.priority;
      });
      resolved = gpsCandidates[0].coords;
    }
  }

  if (!resolved) {
    resolved =
      extractValidCoordinates(assignment.location) ||
      extractValidCoordinates(assignment.rescueTeamId?.baseLocation) ||
      extractAreaCentroid(assignment.rescueTeamId?.areaId);
  }

  if (resolved) {
    assignment.teamLocation = {
      type: 'Point',
      coordinates: resolved,
    };
  }

  // Tránh gửi kèm polygon boundary lớn trong payload SOS/Assignment
  if (assignment.rescueTeamId?.areaId && typeof assignment.rescueTeamId.areaId === 'object') {
    delete assignment.rescueTeamId.areaId.boundary;
  }

  return assignment;
}

function attachTeamLocations(assignments = []) {
  return Array.isArray(assignments) ? assignments.map(attachAssignmentTeamLocation) : [];
}

module.exports = {
  ASSIGNMENT_TEAM_POPULATE,
  ASSIGNMENT_RESCUER_SELECT,
  attachAssignmentTeamLocation,
  attachTeamLocations,
};

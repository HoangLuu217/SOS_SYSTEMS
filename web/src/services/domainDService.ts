import type {
  AdministrativeArea,
  AuthorityOrganization,
  AuthorityOfficer,
  SosRequest,
  RescueTeam,
  Vehicle,
  SosAssignment,
  AssignmentStatus,
  GeoJsonPolygon,
} from '@/types/domainD';
import {
  INITIAL_AREAS,
  INITIAL_AUTHORITIES,
  INITIAL_SOS_REQUESTS,
  INITIAL_RESCUE_TEAMS,
  INITIAL_VEHICLES,
  INITIAL_ASSIGNMENTS,
  SAMPLE_OFFICERS,
} from '@/constants/mockData';
import { fetchGeoapifyBoundaries, GEOAPIFY_CENTROIDS, slugifyVietnamese } from './geoapifyBoundariesService';
import { fetchAreaBoundary } from '@/api';

// Storage keys (v30 - Dynamic Nationwide Multi-Province Architecture)
const STORAGE_AREAS = 'rescuesos_areas_v30';
const STORAGE_AUTHORITIES = 'rescuesos_authorities_v30';
const STORAGE_SOS = 'rescuesos_sos_v30';
const STORAGE_ASSIGNMENTS = 'rescuesos_assignments_v30';
const STORAGE_ACTIVE_OFFICER = 'rescuesos_active_officer_v30';
export const STORAGE_JURISDICTION_KEY = 'sos_selected_jurisdiction_key';

export interface JurisdictionConfig {
  name: string;
  district: string;
  areaId: string;
  keywords: string[];
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

// Cấu hình địa bàn quản lý động - Hỗ trợ toàn quốc 34 tỉnh thành
export const JURISDICTION_CONFIGS: Record<string, JurisdictionConfig> = {
  national: {
    name: 'Toàn Quốc (34 Tỉnh Thành)',
    district: 'Việt Nam',
    areaId: 'area-all',
    keywords: ['toàn quốc', 'vietnam', 'việt nam'],
  },
  toan_thanh_pho: {
    name: 'Toàn Quốc (34 Tỉnh Thành)',
    district: 'Việt Nam',
    areaId: 'area-all',
    keywords: ['toàn quốc', 'vietnam', 'việt nam'],
  },
};

class DomainDService {
  private areas: AdministrativeArea[];
  private authorities: AuthorityOrganization[];
  private sosRequests: SosRequest[];
  private rescueTeams: RescueTeam[];
  private vehicles: Vehicle[];
  private assignments: Record<string, SosAssignment>;
  private officers: AuthorityOfficer[];
  private activeOfficerId: string;

  constructor() {
    this.areas = this.load(STORAGE_AREAS, INITIAL_AREAS);
    this.authorities = this.load(STORAGE_AUTHORITIES, INITIAL_AUTHORITIES);
    const loadedSos = this.load(STORAGE_SOS, INITIAL_SOS_REQUESTS);
    // Sanitize any invalid/mock SOS requests (such as 8924, 8927, 8938)
    this.sosRequests = loadedSos.filter(
      (s) =>
        !s.id?.includes('8924') &&
        !s.id?.includes('8927') &&
        !s.sosCode?.includes('8924') &&
        !s.sosCode?.includes('8927') &&
        !s.sosCode?.includes('8938') &&
        !s.locationName?.includes('Nam Kỳ Khởi Nghĩa')
    );
    // Đảm bảo các ca SOS khởi tạo mới (như Phường Hòa Xuân) được merge vào nếu localStorage chưa có
    const existingIds = new Set(this.sosRequests.map((s) => s.id));
    let hasNew = false;
    for (const initSos of INITIAL_SOS_REQUESTS) {
      if (!existingIds.has(initSos.id)) {
        this.sosRequests.push(initSos);
        hasNew = true;
      }
    }
    if (this.sosRequests.length !== loadedSos.length || hasNew) {
      this.save(STORAGE_SOS, this.sosRequests);
    }
    this.rescueTeams = INITIAL_RESCUE_TEAMS;
    this.vehicles = INITIAL_VEHICLES;
    this.assignments = this.load(STORAGE_ASSIGNMENTS, INITIAL_ASSIGNMENTS);
    this.officers = SAMPLE_OFFICERS;
    this.activeOfficerId = this.load(STORAGE_ACTIVE_OFFICER, SAMPLE_OFFICERS[0].id);
  }

  private load<T>(key: string, fallback: T): T {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch {
      // Fallback
    }
    return fallback;
  }

  private save<T>(key: string, data: T) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      // Ignore
    }
  }

  // --- Administrative Areas ---
  getAreas(): AdministrativeArea[] {
    return [...this.areas];
  }

  async syncFromGeoapify(forceRefresh: boolean = false): Promise<AdministrativeArea[]> {
    try {
      const liveAreas = await fetchGeoapifyBoundaries(forceRefresh);
      const currentMap = new Map(this.areas.map((a) => [a.id, a]));
      this.areas = liveAreas.map((la) => {
        const existing = currentMap.get(la.id);
        if (existing) {
          return {
            ...la,
            assignedAuthorityId: existing.assignedAuthorityId ?? la.assignedAuthorityId,
            assignedAuthorityName: existing.assignedAuthorityName ?? la.assignedAuthorityName,
            status: existing.status ?? la.status,
            population: existing.population ?? la.population,
            reviewPending: existing.reviewPending ?? la.reviewPending,
          };
        }
        return la;
      });
      this.save(STORAGE_AREAS, this.areas);
      return [...this.areas];
    } catch (e) {
      console.warn('syncFromGeoapify fallback to current areas:', e);
      return [...this.areas];
    }
  }

  updateArea(id: string, updates: Partial<AdministrativeArea>): AdministrativeArea {
    const idx = this.areas.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error('Area not found');
    this.areas[idx] = { ...this.areas[idx], ...updates };
    this.save(STORAGE_AREAS, this.areas);
    return this.areas[idx];
  }

  assignAuthorityToArea(areaId: string, authorityId: string): AdministrativeArea {
    const auth = this.authorities.find((a) => a.id === authorityId);
    if (!auth) throw new Error('Authority organization not found');

    const area = this.updateArea(areaId, {
      assignedAuthorityId: auth.id,
      assignedAuthorityName: auth.name,
      reviewPending: false,
      activeRescueTeams: auth.activeRescueTeams || 3,
    });

    // Update authority area tracking
    const authIdx = this.authorities.findIndex((a) => a.id === authorityId);
    if (authIdx !== -1) {
      const currentAreaIds = this.authorities[authIdx].areaIds || [];
      const currentNames = this.authorities[authIdx].areaNames || [];
      if (!currentAreaIds.includes(areaId)) {
        this.authorities[authIdx].areaIds = [...currentAreaIds, areaId];
        this.authorities[authIdx].areaNames = [...currentNames, area.name];
        this.save(STORAGE_AUTHORITIES, this.authorities);
      }
    }

    return area;
  }

  // --- Authority Organizations ---
  getAuthorities(): AuthorityOrganization[] {
    return [...this.authorities];
  }

  createAuthority(
    data: Omit<AuthorityOrganization, 'id' | 'activeRescueTeams'>
  ): AuthorityOrganization {
    const newId = `auth-${Date.now().toString(36)}`;
    const newAuth: AuthorityOrganization = {
      ...data,
      id: newId,
      activeRescueTeams: 3,
    };
    this.authorities = [newAuth, ...this.authorities];
    this.save(STORAGE_AUTHORITIES, this.authorities);

    // If an administrative area was assigned, reflect it in the area
    if (data.areaId) {
      this.assignAuthorityToArea(data.areaId, newId);
    }

    return newAuth;
  }

  // --- SOS & Dispatch ---
  getSosRequests(): SosRequest[] {
    return [...this.sosRequests];
  }

  syncRealSosRequests(realRequests: SosRequest[]): SosRequest[] {
    const realIds = new Set(realRequests.map((r) => r.id));
    // Khi có dữ liệu thật từ MongoDB, loại bỏ hoàn toàn các ca mock cũ (sos-89..., 8924, 8927)
    const nonColliding = this.sosRequests.filter(
      (s) =>
        !realIds.has(s.id) &&
        !s.id.startsWith('sos-89') &&
        !s.id.startsWith('sos-dn-') &&
        !s.sosCode.includes('8924') &&
        !s.sosCode.includes('8927')
    );
    this.sosRequests = [...realRequests, ...nonColliding];
    this.save(STORAGE_SOS, this.sosRequests);
    return [...this.sosRequests];
  }

  createSosRequest(data: Omit<SosRequest, 'id' | 'sosCode' | 'timeAgo' | 'createdAt' | 'status' | 'assignmentId'>): SosRequest {
    const nextCodeNumber = 8925 + this.sosRequests.length;
    const newSos: SosRequest = {
      ...data,
      id: `sos-${Date.now()}`,
      sosCode: `SOS #${nextCodeNumber}`,
      timeAgo: 'Just now',
      createdAt: new Date().toISOString(),
      status: 'VERIFIED',
      assignmentId: null,
    };
    this.sosRequests.unshift(newSos);
    this.save(STORAGE_SOS, this.sosRequests);
    return newSos;
  }

  getRescueTeams(authorityId?: string): RescueTeam[] {
    if (!authorityId) return [...this.rescueTeams];
    const filtered = this.rescueTeams.filter((t) => t.authorityOrganizationId === authorityId);
    return filtered.length > 0 ? filtered : this.rescueTeams;
  }

  syncRealRescueTeams(teams: RescueTeam[]): RescueTeam[] {
    if (!teams || teams.length === 0) return [...this.rescueTeams];
    const realIds = new Set(teams.map((t) => t.id));
    const kept = this.rescueTeams.filter((t) => !realIds.has(t.id));
    this.rescueTeams = [...teams, ...kept];
    return [...this.rescueTeams];
  }

  getVehicles(teamId?: string): Vehicle[] {
    if (!teamId) return [...this.vehicles];
    const filtered = this.vehicles.filter((v) => v.teamId === teamId);
    return filtered.length > 0 ? filtered : this.vehicles;
  }

  syncRealVehicles(vehicles: Vehicle[]): Vehicle[] {
    if (!vehicles || vehicles.length === 0) return [...this.vehicles];
    const realIds = new Set(vehicles.map((v) => v.id));
    const kept = this.vehicles.filter((v) => !realIds.has(v.id));
    this.vehicles = [...vehicles, ...kept];
    return [...this.vehicles];
  }

  getAssignmentBySosId(sosId: string): SosAssignment | null {
    const req = this.sosRequests.find((s) => s.id === sosId);
    if (!req || !req.assignmentId) return null;
    const assign = this.assignments[req.assignmentId];
    if (!assign || assign.status === 'CANCELLED') return null;
    return assign;
  }

  assignSos(
    sosId: string,
    params: {
      authorityOrganizationId: string;
      authorityOrganizationName: string;
      rescueTeamId: string;
      rescueTeamName: string;
      rescuerId: string;
      rescuerName: string;
      rescuerRole: string;
      vehicleId: string;
      vehicleName: string;
      vehicleCapacity: string;
    }
  ): { sos: SosRequest; assignment: SosAssignment } {
    const sosIndex = this.sosRequests.findIndex((s) => s.id === sosId);
    if (sosIndex === -1) throw new Error('SOS request not found');

    const assignmentId = `assign-${Date.now().toString(36)}`;
    const sos = this.sosRequests[sosIndex];

    const rescuerLoc = {
      lat: sos.coordinates.lat + 0.0045,
      lng: sos.coordinates.lng + 0.0035,
      svgX: Math.max(100, Math.min(750, sos.coordinates.svgX + 40)),
      svgY: Math.max(80, Math.min(500, sos.coordinates.svgY - 40)),
    };

    const assignment: SosAssignment = {
      id: assignmentId,
      sosRequestId: sosId,
      authorityOrganizationId: params.authorityOrganizationId,
      authorityOrganizationName: params.authorityOrganizationName,
      rescueTeamId: params.rescueTeamId,
      rescueTeamName: params.rescueTeamName,
      rescuerId: params.rescuerId,
      rescuerName: params.rescuerName,
      rescuerRole: params.rescuerRole,
      vehicleId: params.vehicleId,
      vehicleName: params.vehicleName,
      vehicleCapacity: params.vehicleCapacity,
      status: 'ASSIGNED',
      priority: sos.priority,
      assignedAt: new Date().toISOString(),
      rescuerLocation: rescuerLoc,
      distanceRemainingKm: 1.4,
      etaMinutes: 7,
    };

    this.assignments[assignmentId] = assignment;
    this.save(STORAGE_ASSIGNMENTS, this.assignments);

    this.sosRequests[sosIndex] = {
      ...sos,
      status: 'ASSIGNED',
      assignmentId,
    };
    this.save(STORAGE_SOS, this.sosRequests);

    return { sos: this.sosRequests[sosIndex], assignment };
  }

  syncRealAssignment(assignment: SosAssignment): void {
    if (!assignment || !assignment.id) return;
    this.assignments[assignment.id] = assignment;
    this.save(STORAGE_ASSIGNMENTS, this.assignments);
  }

  updateAssignmentStatus(assignmentId: string, nextStatus: AssignmentStatus): SosAssignment {
    const assign = this.assignments[assignmentId];
    if (!assign) throw new Error('Assignment not found');

    assign.status = nextStatus;
    const now = new Date().toISOString();
    if (nextStatus === 'ACCEPTED') assign.acceptedAt = now;
    if (nextStatus === 'ON_THE_WAY') assign.startedAt = now;
    if (nextStatus === 'COMPLETED') assign.completedAt = now;

    // Adjust remaining distance and ETA based on status progression
    if (nextStatus === 'ASSIGNED') {
      assign.distanceRemainingKm = 1.4;
      assign.etaMinutes = 7;
    } else if (nextStatus === 'ACCEPTED') {
      assign.distanceRemainingKm = 1.4;
      assign.etaMinutes = 6;
    } else if (nextStatus === 'ON_THE_WAY') {
      assign.distanceRemainingKm = 0.8;
      assign.etaMinutes = 3;
    } else if (nextStatus === 'ARRIVED') {
      assign.distanceRemainingKm = 0.1;
      assign.etaMinutes = 0;
    } else if (nextStatus === 'RESCUING') {
      assign.distanceRemainingKm = 0.0;
      assign.etaMinutes = 0;
    } else if (nextStatus === 'COMPLETED') {
      assign.distanceRemainingKm = 0.0;
      assign.etaMinutes = 0;
    }

    this.assignments[assignmentId] = { ...assign };
    this.save(STORAGE_ASSIGNMENTS, this.assignments);

    // Also update SOS request status
    const sosIdx = this.sosRequests.findIndex((s) => s.id === assign.sosRequestId);
    if (sosIdx !== -1) {
      this.sosRequests[sosIdx].status = nextStatus as any;
      this.save(STORAGE_SOS, this.sosRequests);
    }

    return this.assignments[assignmentId];
  }

  reassignMission(
    assignmentId: string,
    params: {
      rescueTeamId: string;
      rescueTeamName: string;
      rescuerId: string;
      rescuerName: string;
      rescuerRole: string;
      vehicleId: string;
      vehicleName: string;
      vehicleCapacity: string;
    }
  ): SosAssignment {
    const assign = this.assignments[assignmentId];
    if (!assign) throw new Error('Assignment not found');

    const updated: SosAssignment = {
      ...assign,
      ...params,
      status: 'ASSIGNED',
      distanceRemainingKm: 1.8,
      etaMinutes: 9,
    };

    this.assignments[assignmentId] = updated;
    this.save(STORAGE_ASSIGNMENTS, this.assignments);

    const sosIdx = this.sosRequests.findIndex((s) => s.id === assign.sosRequestId);
    if (sosIdx !== -1) {
      this.sosRequests[sosIdx].status = 'ASSIGNED';
      this.save(STORAGE_SOS, this.sosRequests);
    }

    return updated;
  }

  cancelAssignment(assignmentId: string, reason: string): { assignment: SosAssignment; sos: SosRequest } {
    const assign = this.assignments[assignmentId];
    if (!assign) throw new Error('Assignment not found');

    assign.status = 'CANCELLED';
    assign.cancelledAt = new Date().toISOString();
    assign.cancelReason = reason;

    this.assignments[assignmentId] = { ...assign };
    this.save(STORAGE_ASSIGNMENTS, this.assignments);

    const sosIdx = this.sosRequests.findIndex((s) => s.id === assign.sosRequestId);
    let updatedSos = this.sosRequests[sosIdx];
    if (sosIdx !== -1) {
      this.sosRequests[sosIdx] = {
        ...this.sosRequests[sosIdx],
        status: 'VERIFIED', // Reset to verified so it can be redispatched
        assignmentId: null,
      };
      updatedSos = this.sosRequests[sosIdx];
      this.save(STORAGE_SOS, this.sosRequests);
    }

    return { assignment: assign, sos: updatedSos };
  }

  // --- Authority Officers & Jurisdiction ---
  getOfficers(): AuthorityOfficer[] {
    return [...this.officers];
  }

  getActiveOfficer(): AuthorityOfficer {
    this.syncFromStoredAuthUser();
    const found = this.officers.find((o) => o.id === this.activeOfficerId);
    return found || this.officers[0];
  }

  setActiveOfficer(officerId: string): AuthorityOfficer {
    const matched = this.officers.find((o) => o.id === officerId);
    if (matched) {
      this.activeOfficerId = matched.id;
      this.save(STORAGE_ACTIVE_OFFICER, matched.id);
      return matched;
    }
    return this.getActiveOfficer();
  }

  setJurisdictionKey(key: string): AuthorityOfficer {
    const cfg = JURISDICTION_CONFIGS[key];
    const officer = this.getActiveOfficer();
    if (cfg && officer) {
      officer.jurisdictionAreaId = cfg.areaId;
      officer.jurisdictionAreaName = cfg.name;
      officer.districtName = cfg.district;
      this.save(STORAGE_ACTIVE_OFFICER, officer.id);
      try {
        localStorage.setItem(STORAGE_JURISDICTION_KEY, key);
      } catch { }
    }
    return officer;
  }

  getJurisdictionKey(): string {
    try {
      const stored = localStorage.getItem(STORAGE_JURISDICTION_KEY);
      if (stored && JURISDICTION_CONFIGS[stored]) return stored;
    } catch { }
    const officer = this.getActiveOfficer();
    if (!officer || officer.role === 'ADMIN' || officer.jurisdictionAreaId === 'area-all') {
      return 'national';
    }
    return officer.jurisdictionAreaId || 'national';
  }

  syncFromStoredAuthUser() {
    try {
      const stored = localStorage.getItem('sos_auth_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.syncLoggedInUser(parsed);
      }
    } catch {
      // Ignore
    }
  }

  syncLoggedInUser(user: any): AuthorityOfficer {
    if (!user) return this.getActiveOfficer();

    const areaName = String(user.authority?.jurisdictionAreaName || user.authority?.areaName || '').toLowerCase();

    // Determine managed area from user authority dynamically
    const userAreaId = user.authority?.areaId || user.authority?.administrativeAreaId;
    const userAreaName = user.authority?.jurisdictionAreaName || user.authority?.areaName;
    const userDistrict = user.authority?.districtName || user.authority?.provinceName;

    let jurKey = '';
    if (user.roles?.includes('ADMIN')) {
      jurKey = 'toan_thanh_pho';
    } else if (areaName) {
      for (const [k, c] of Object.entries(JURISDICTION_CONFIGS)) {
        if (areaName.includes(c.name.toLowerCase().replace(/^(phường|quận|huyện|xã)\s+/i, ''))) {
          jurKey = k;
          break;
        }
      }
    }

    if (typeof localStorage !== 'undefined' && jurKey) {
      localStorage.setItem(STORAGE_JURISDICTION_KEY, jurKey);
    }

    const cfg = jurKey ? JURISDICTION_CONFIGS[jurKey] : null;
    const finalAreaId = userAreaId || cfg?.areaId || (userAreaName ? `area-${slugifyVietnamese(userAreaName)}` : 'area-default');
    const finalAreaName = userAreaName || cfg?.name || user.authority?.department || 'Địa Bàn Phụ Trách';
    const finalDistrictName = userDistrict || cfg?.district || '';

    // Check if matching officer already exists
    const matched = this.officers.find(
      (o) =>
        (user.phone && o.phone === user.phone) ||
        (user.email && o.email?.toLowerCase() === user.email?.toLowerCase()) ||
        (user.fullName && o.fullName?.toLowerCase() === user.fullName?.toLowerCase())
    );

    if (matched) {
      matched.jurisdictionAreaId = finalAreaId;
      matched.jurisdictionAreaName = finalAreaName;
      matched.districtName = finalDistrictName;
      matched.department = user.authority?.department || matched.department;
      matched.position = user.authority?.position || matched.position;
      this.activeOfficerId = matched.id;
      this.save(STORAGE_ACTIVE_OFFICER, matched.id);
      return matched;
    }

    const newOfficer: AuthorityOfficer = {
      id: `off-${Date.now()}`,
      fullName: user.fullName || 'Cán bộ Quản lý Địa bàn',
      role: user.roles?.includes('ADMIN') ? 'ADMIN' : 'LOCAL_AUTHORITY',
      email: user.email || '',
      phone: user.phone || '',
      position: user.authority?.position || 'Cán bộ Chỉ huy Địa bàn',
      department: user.authority?.department || `Ban Chỉ Huy PCTT ${finalAreaName}`,
      jurisdictionAreaId: finalAreaId,
      jurisdictionAreaName: finalAreaName,
      districtName: finalDistrictName,
    };

    this.officers.unshift(newOfficer);
    this.activeOfficerId = newOfficer.id;
    this.save(STORAGE_ACTIVE_OFFICER, newOfficer.id);
    return newOfficer;
  }

  /**
   * Tự động kiểm tra và tải ranh giới GeoJSON boundary cho địa bàn của cán bộ quản lý
   * (Đặc biệt dành cho các đơn vị ngoài Đà Nẵng như Hà Nội, TP.HCM, các tỉnh thành khác)
   */
  async loadBoundaryForOfficer(officer: AuthorityOfficer): Promise<AdministrativeArea | null> {
    if (!officer || !officer.jurisdictionAreaId) return null;

    let area = this.areas.find(
      (a) =>
        a.id === officer.jurisdictionAreaId ||
        a.code === officer.jurisdictionAreaId ||
        (officer.jurisdictionAreaName &&
          a.name.toLowerCase().includes(officer.jurisdictionAreaName.replace(/^(phường|xã)\s+/i, '').toLowerCase()))
    );

    if (!area) {
      area = {
        id: officer.jurisdictionAreaId,
        name: officer.jurisdictionAreaName || 'Địa Bàn Phụ Trách',
        code: `WARD-${officer.jurisdictionAreaId.slice(-6)}`,
        type: 'WARD',
        parentId: null,
        status: 'ACTIVE',
        boundaryRef: officer.jurisdictionAreaId,
        areaKm2: 8,
        population: 30000,
        activeRescueTeams: 3,
        assignedAuthorityId: 'auth-default',
        assignedAuthorityName: officer.department,
      };
      this.areas.push(area);
    }

    const isDanang =
      officer.districtName?.toLowerCase().includes('đà nẵng') ||
      officer.jurisdictionAreaName?.toLowerCase().includes('hòa cường');

    // Kiểm tra xem boundary hiện tại có bị sai lệch địa lý không (ví dụ: tọa độ TP.HCM lat ~ 10.78 cho phường ở Đà Nẵng)
    let isCorruptedBoundary = false;
    if (area.boundary && Array.isArray(area.boundary.coordinates) && area.boundary.coordinates.length > 0) {
      try {
        const ring =
          area.boundary.type === 'MultiPolygon'
            ? (area.boundary.coordinates as any)[0][0]
            : (area.boundary.coordinates as any)[0];
        const sample = ring && ring[0];
        if (sample && Array.isArray(sample) && sample.length >= 2) {
          const [lng, lat] = sample;
          if (isDanang && (lat < 15.5 || lat > 16.6 || lng < 107.5 || lng > 108.7)) {
            isCorruptedBoundary = true;
          }
        }
      } catch {
        isCorruptedBoundary = true;
      }
    }

    if (area.boundary && Array.isArray(area.boundary.coordinates) && area.boundary.coordinates.length > 0 && !isCorruptedBoundary) {
      this.cacheAreaCentroid(officer.jurisdictionAreaId, area);
      return area;
    }

    try {
      const res = await fetchAreaBoundary({
        areaId: officer.jurisdictionAreaId,
        name: officer.jurisdictionAreaName,
        province: officer.districtName,
      });

      if (res.success && res.data && res.data.boundary) {
        area.boundary = res.data.boundary as GeoJsonPolygon;
        area.id = officer.jurisdictionAreaId;
        area.name = res.data.name || officer.jurisdictionAreaName;
        this.save(STORAGE_AREAS, this.areas);
        this.cacheAreaCentroid(officer.jurisdictionAreaId, area);
        return area;
      }
    } catch (err) {
      console.warn('Lỗi load boundary cho cán bộ:', err);
    }

    // Fallback centroid cho Hòa Cường nếu chưa có boundary
    if (isDanang && (officer.jurisdictionAreaName?.toLowerCase().includes('hòa cường') || officer.jurisdictionAreaId === 'area-htd')) {
      GEOAPIFY_CENTROIDS[officer.jurisdictionAreaId] = [108.2175, 16.0416];
    }

    return area;
  }

  private cacheAreaCentroid(areaId: string, area: AdministrativeArea) {
    if (!area.boundary?.coordinates) return;
    try {
      const coords: number[][] =
        area.boundary.type === 'MultiPolygon'
          ? (area.boundary.coordinates as number[][][][])[0][0]
          : (area.boundary.coordinates as number[][][])[0];
      if (coords && coords.length > 0) {
        let sumLng = 0;
        let sumLat = 0;
        for (const [lng, lat] of coords) {
          sumLng += lng;
          sumLat += lat;
        }
        const centroid: [number, number] = [sumLng / coords.length, sumLat / coords.length];
        GEOAPIFY_CENTROIDS[areaId] = centroid;
        GEOAPIFY_CENTROIDS[area.id] = centroid;
      }
    } catch {
      // ignore
    }
  }

  resetAll() {
    localStorage.removeItem(STORAGE_AREAS);
    localStorage.removeItem(STORAGE_AUTHORITIES);
    localStorage.removeItem(STORAGE_SOS);
    localStorage.removeItem(STORAGE_ASSIGNMENTS);
    localStorage.removeItem(STORAGE_ACTIVE_OFFICER);
    this.areas = [...INITIAL_AREAS];
    this.authorities = [...INITIAL_AUTHORITIES];
    this.sosRequests = [...INITIAL_SOS_REQUESTS];
    this.assignments = { ...INITIAL_ASSIGNMENTS };
    this.activeOfficerId = SAMPLE_OFFICERS[0].id;
  }
}

export const domainDService = new DomainDService();

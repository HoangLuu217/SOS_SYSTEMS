import type {
  AdministrativeArea,
  AuthorityOrganization,
  AuthorityOfficer,
  SosRequest,
  RescueTeam,
  Vehicle,
  SosAssignment,
  AssignmentStatus,
} from '../types/domainD';
import {
  INITIAL_AREAS,
  INITIAL_AUTHORITIES,
  INITIAL_SOS_REQUESTS,
  INITIAL_RESCUE_TEAMS,
  INITIAL_VEHICLES,
  INITIAL_ASSIGNMENTS,
  SAMPLE_OFFICERS,
} from './mockData';
import { fetchGeoapifyBoundaries } from './geoapifyBoundariesService';

// Storage keys (v25 with all 15 official merged Da Nang wards & communes from user's API)
const STORAGE_AREAS = 'rescuesos_areas_v25_all_15_official_merged_danang_wards';
const STORAGE_AUTHORITIES = 'rescuesos_authorities_v25_all_15_official_merged_danang_wards';
const STORAGE_SOS = 'rescuesos_sos_v25_all_15_official_merged_danang_wards';
const STORAGE_ASSIGNMENTS = 'rescuesos_assignments_v25_all_15_official_merged_danang_wards';
const STORAGE_ACTIVE_OFFICER = 'rescuesos_active_officer_v25_all_15_official_merged_danang_wards';

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
    // Sanitize any invalid/stray SOS requests (such as test SOS #8938 at Nam Kỳ Khởi Nghĩa)
    this.sosRequests = loadedSos.filter(
      (s) => !s.sosCode.includes('8938') && !s.locationName.includes('Nam Kỳ Khởi Nghĩa')
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

  getVehicles(teamId?: string): Vehicle[] {
    if (!teamId) return [...this.vehicles];
    const filtered = this.vehicles.filter((v) => v.teamId === teamId);
    return filtered.length > 0 ? filtered : this.vehicles;
  }

  getAssignmentBySosId(sosId: string): SosAssignment | null {
    const req = this.sosRequests.find((s) => s.id === sosId);
    if (!req || !req.assignmentId) return null;
    return this.assignments[req.assignmentId] || null;
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
      lat: sos.coordinates.lat - 0.007,
      lng: sos.coordinates.lng + 0.009,
      svgX: Math.max(100, Math.min(750, sos.coordinates.svgX + 90)),
      svgY: Math.max(80, Math.min(500, sos.coordinates.svgY - 70)),
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

    // Check if matching officer already exists
    const matched = this.officers.find(
      (o) =>
        (user.phone && o.phone === user.phone) ||
        (user.email && o.email?.toLowerCase() === user.email?.toLowerCase()) ||
        (user.authority?.department && o.department?.toLowerCase().includes(user.authority.department.toLowerCase())) ||
        (user.fullName && o.fullName?.toLowerCase() === user.fullName?.toLowerCase())
    );

    if (matched) {
      if (user.authority?.areaId) {
        const directArea = this.areas.find(
          (a) =>
            a.id === user.authority.areaId ||
            a.code === user.authority.areaId ||
            (user.authority.areaName && a.name.toLowerCase().includes(user.authority.areaName.toLowerCase()))
        );
        matched.jurisdictionAreaId = directArea ? directArea.id : user.authority.areaId;
        matched.jurisdictionAreaName = directArea ? directArea.name : (user.authority.areaName || 'Khu vực quản lý');
      }
      this.activeOfficerId = matched.id;
      this.save(STORAGE_ACTIVE_OFFICER, matched.id);
      return matched;
    }

    // Determine managed area from user authority (areaId, areaName, department, position)
    const directArea = user.authority?.areaId
      ? this.areas.find(
          (a) =>
            a.id === user.authority.areaId ||
            a.code === user.authority.areaId ||
            (user.authority.areaName && a.name.toLowerCase().includes(user.authority.areaName.toLowerCase()))
        )
      : null;

    let areaId = directArea ? directArea.id : (user.authority?.areaId || 'area-htd');
    let areaName = directArea ? directArea.name : (user.authority?.areaName || 'Phường Hòa Cường');
    let districtName = directArea ? directArea.name : (user.authority?.areaName || 'Thành phố Đà Nẵng');

    const dept = (user.authority?.department || '').toLowerCase();
    const pos = (user.authority?.position || '').toLowerCase();

    if (user.roles?.includes('ADMIN')) {
      areaId = 'area-dn';
      areaName = 'Toàn TP Đà Nẵng';
      districtName = 'Thành phố Đà Nẵng';
    } else if (directArea || user.authority?.areaId) {
      // Use direct area bound to account
      areaId = directArea ? directArea.id : user.authority.areaId;
      areaName = directArea ? directArea.name : (user.authority?.areaName || 'Khu vực quản lý');
      districtName = areaName;
    } else if (dept.includes('cẩm lệ') || pos.includes('cẩm lệ')) {
      areaId = 'area-cl';
      areaName = 'Quận Cẩm Lệ';
      districtName = 'Quận Cẩm Lệ';
    } else if (dept.includes('sơn trà') || pos.includes('sơn trà')) {
      areaId = 'area-st';
      areaName = 'Quận Sơn Trà';
      districtName = 'Quận Sơn Trà';
    } else if (dept.includes('thanh khê') || pos.includes('thanh khê')) {
      areaId = 'area-tk';
      areaName = 'Quận Thanh Khê';
      districtName = 'Quận Thanh Khê';
    } else if (dept.includes('ngũ hành sơn') || pos.includes('ngũ hành sơn')) {
      areaId = 'area-nhs';
      areaName = 'Quận Ngũ Hành Sơn';
      districtName = 'Quận Ngũ Hành Sơn';
    } else if (dept.includes('liên chiểu') || pos.includes('liên chiểu')) {
      areaId = 'area-lc';
      areaName = 'Quận Liên Chiểu';
      districtName = 'Quận Liên Chiểu';
    } else if (dept.includes('hòa vang') || pos.includes('hòa vang')) {
      areaId = 'area-hv';
      areaName = 'Huyện Hòa Vang';
      districtName = 'Huyện Hòa Vang';
    } else if (dept.includes('hoàng sa') || pos.includes('hoàng sa')) {
      areaId = 'area-hs';
      areaName = 'Huyện Hoàng Sa';
      districtName = 'Huyện Hoàng Sa';
    } else if (dept.includes('hải châu') || pos.includes('hải châu')) {
      areaId = 'area-hc';
      areaName = 'Quận Hải Châu';
      districtName = 'Quận Hải Châu';
    }

    const newOfficer: AuthorityOfficer = {
      id: `off-${Date.now()}`,
      fullName: user.fullName || 'Cán bộ Quản lý Địa bàn',
      role: user.roles?.includes('ADMIN') ? 'ADMIN' : 'LOCAL_AUTHORITY',
      email: user.email || '',
      phone: user.phone || '',
      position: user.authority?.position || 'Cán bộ Chỉ huy Địa bàn',
      department: user.authority?.department || 'UBND Phường',
      jurisdictionAreaId: areaId,
      jurisdictionAreaName: areaName,
      districtName: districtName,
    };

    this.officers.unshift(newOfficer);
    this.activeOfficerId = newOfficer.id;
    this.save(STORAGE_ACTIVE_OFFICER, newOfficer.id);
    return newOfficer;
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

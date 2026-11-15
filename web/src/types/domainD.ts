export type AdministrativeAreaType = 'COUNTRY' | 'PROVINCE' | 'DISTRICT' | 'WARD';
export type AdministrativeAreaStatus = 'ACTIVE' | 'INACTIVE';

export interface GeoJsonPolygon {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][]; // [[[lng, lat]]] for Polygon or [[[[lng, lat]]]] for MultiPolygon
}

export interface AdministrativeArea {
  id: string;
  name: string;
  code: string;
  type: AdministrativeAreaType;
  parentId: string | null;
  boundary?: GeoJsonPolygon;
  status?: AdministrativeAreaStatus;
  
  // Operational UI metadata
  boundaryRef?: string;
  areaKm2?: number;
  population?: number;
  assignedAuthorityId?: string | null;
  assignedAuthorityName?: string | null;
  activeRescueTeams?: number;
  reviewPending?: boolean;
}

export type AuthorityOrganizationType =
  | 'POLICE'
  | 'FIRE_DEPARTMENT'
  | 'MEDICAL'
  | 'DISASTER_RESPONSE'
  | 'MILITARY'
  | 'LOCAL_AUTHORITY'
  | 'OTHER'
  | 'PROVINCE'
  | 'DISTRICT'
  | 'WARD'
  | 'RESCUE_CENTER';

export type AuthorityStatus = 'ACTIVE' | 'INACTIVE';

export interface AuthorityOrganization {
  id: string;
  name: string;
  type: AuthorityOrganizationType;
  code: string;
  areaId?: string | null;
  administrativeAreaId?: string | null;
  areaIds?: string[]; // for multi-area assignment
  areaNames?: string[];
  address: string;
  phone: string;
  email: string;
  status: AuthorityStatus;
  activeRescueTeams?: number;
}

export type EmergencyPriority = 'UNASSESSED' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type EmergencyType =
  | 'MEDICAL'          // 🚑 Y tế (Mặc định)
  | 'FIRE'             // 🔥 Cháy
  | 'POLICE'           // 🚓 An ninh
  | 'RESCUE'           // 🛟 Cứu hộ
  | 'FLOOD'            // 🌊 Ngập lụt
  | 'LANDSLIDE'        // ⚠️ Sạt lở đất
  | 'EVACUATION'       // 👵 Sơ tán khẩn cấp
  | 'FOOD'             // 🍞 Tiếp tế lương thực
  | 'RELIEF'           // 📦 Cứu trợ nhu yếu phẩm
  | 'OTHER'            // ❓ Yêu cầu khác
  | 'Flood'
  | 'Medical Emergency'
  | 'Trapped Person'
  | 'Storm Damage'
  | 'Fire';

export interface AuthorityOfficer {
  id: string;
  fullName: string;
  role: 'LOCAL_AUTHORITY' | 'ADMIN' | 'AUTHOR';
  email: string;
  phone: string;
  position: string;
  department: string;
  jurisdictionAreaId: string;
  jurisdictionAreaName: string;
  districtName: string;
}

export type SosRequestStatus =
  | 'PENDING'
  | 'VERIFIED'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'ON_THE_WAY'
  | 'ARRIVED'
  | 'RESCUING'
  | 'COMPLETED'
  | 'CANCELLED';

export interface SosRiskBreakdown {
  emergencyWeight?: number;
  vulnerabilityScore?: number;
  peopleScore?: number;
  keywordScore?: number;
  spatialHazardScore?: number;
  weatherScore?: number;
  clusterScore?: number;
  repeatBonus?: number;
}

export interface SosOperationalNeeds {
  requiredCapabilities?: string[];
  recommendedVehicles?: string[];
  recommendedEquipments?: string[];
  estimatedWaterDepth?: string;
  urgentNotes?: string | null;
}

export interface SosAiAssessment {
  status?: 'PENDING' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'UNAVAILABLE';
  model?: string;
  analyzedAt?: string;
  aiScore?: number;
  deterministicScore?: number;
  recommendedPriority?: EmergencyPriority;
  confidence?: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons?: string[];
  extractedSignals?: string[];
  evidence?: string[];
  unknowns?: string[];
  priorityMismatch?: boolean;
  priorityScoreMismatch?: boolean;
  operationalNeeds?: SosOperationalNeeds;
}

export interface SosRiskAssessment {
  status?: 'PENDING' | 'COMPLETED' | 'VERIFIED' | 'NEEDS_HUMAN_REVIEW';
  source?: 'AI' | 'AUTHORITY';
  modelVersion?: string;
  inputHash?: string;
  evaluatedAt?: string;
  suggestedPriority?: EmergencyPriority;
  reasons?: string[];
  extractedSignals?: string[];
  evidence?: string[];
  unknowns?: string[];
  operationalNeeds?: SosOperationalNeeds;
  needsHumanReview?: boolean;
  verifiedPriority?: EmergencyPriority;
  verifiedBy?: string;
  verifiedAt?: string;
  verificationNote?: string | null;
  priorityOutdatedByNewInfo?: boolean;
}

export interface DispatchSuggestedSupply {
  supplyId: string;
  name: string;
  category?: string;
  quantity: number;
  unit: string;
  availableStock?: number;
  fromTeamInventory?: boolean;
}

export interface DispatchTeamCandidate {
  teamId: string;
  teamName: string;
  teamType: string;
  areaId?: string | null;
  areaName?: string | null;
  isCrossArea: boolean;
  isBusy: boolean;
  dispatchEligible?: boolean;
  hasCompleteCapabilityMatch?: boolean;
  matchedCapabilities?: string[];
  busyMission?: {
    assignmentId: string;
    status: string;
    sosCode?: string | null;
  } | null;
  distanceKm: number | null;
  etaMinutes: number | null;
  etaText: string;
  locationSource: string;
  gpsAgeMinutes: number | null;
  teamSkills: string[];
  memberCount: number;
  primaryVehicle?: {
    id: string;
    type: string;
    plateNumber: string;
    capacity: number;
    status: string;
    terrainCapabilities?: string[];
  } | null;
  availableVehicles?: Array<{
    id: string;
    type: string;
    plateNumber?: string;
    capacity: number;
    terrainCapabilities?: string[];
  }>;
  totalCapacity: number;
  capacityShortfall: number;
  nearbyHazards: Array<{
    title: string;
    hazardType: string;
    severity: string;
    distanceToIncidentMeters: number;
  }>;
  matchReasons: string[];
  warnings: string[];
  suggestedSupplies: DispatchSuggestedSupply[];
}

export interface DispatchConflict {
  type: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  competingSosCodes: string[];
}

export interface AiDispatchAdvisor {
  model: string;
  generatedAt: string;
  summary: string;
  recommendedPlanType: 'SINGLE_TEAM' | 'MULTI_TEAM' | 'CROSS_AREA_BACKUP';
  recommendedTeamIds: string[];
  rankedTeamIds?: string[];
  teamEvaluations?: Array<{
    teamId: string;
    matchReasons?: string[];
    warnings?: string[];
  }>;
  recommendedSupplies?: DispatchSuggestedSupply[];
  tacticalReasons: string[];
  routeWarnings: string[];
  validationIssues?: string[];
  suggestedSupplyNote?: string | null;
  suggestedDispatchNote?: string | null;
}

export interface DispatchRecommendationsData {
  sosId: string;
  sosCode: string;
  priority: EmergencyPriority;
  operationalNeeds: SosOperationalNeeds;
  candidates: DispatchTeamCandidate[];
  conflicts: DispatchConflict[];
  aiAdvisor: AiDispatchAdvisor | null;
  aiAdvisorStatus: 'COMPLETED' | 'FAILED' | 'UNAVAILABLE' | 'NOT_REQUESTED' | 'TRIAGE_PENDING' | 'NEEDS_HUMAN_REVIEW' | 'NO_ELIGIBLE_TEAMS';
  generatedAt: string;
}

export interface SosRequest {
  id: string;
  sosCode: string; // e.g. #8921
  timeAgo: string;
  createdAt: string;
  emergencyType: EmergencyType;
  emergencyTypes?: string[];
  priority: EmergencyPriority;
  priorityLockedByAuthority?: boolean;
  riskScore?: number | null;
  effectiveRiskScore?: number | null;
  waitEscalationBonus?: number;
  riskBreakdown?: SosRiskBreakdown | null;
  riskAssessment?: SosRiskAssessment | null;
  aiAssessment?: SosAiAssessment | null;
  title: string;
  description: string;
  locationName: string;
  wardId: string;
  wardName: string;
  districtId?: string;
  districtName: string;
  citizenId?: string;
  citizenName: string;
  citizenPhone: string;
  affectedPeople: number;
  status: SosRequestStatus;
  coordinates: {
    lat: number;
    lng: number;
    svgX?: number;
    svgY?: number;
  };
  assignmentId?: string | null;
  images?: string[];
  imageUrl?: string;
  priorityGroups?: string[];
  senderRole?: 'CITIZEN' | 'RESCUER' | string;
  repeatCount?: number;
  isSecondaryRequest?: boolean;
  primarySosId?: string;
  shoreHandoff?: ShoreHandoffRequest;
  shoreHandoffAssignment?: {
    _id?: string;
    id?: string;
    status?: string;
    missionType?: string;
    rescueTeamId?: any;
    vehicleId?: any;
    acceptedAt?: string;
    startedAt?: string;
    completedAt?: string;
    updatedAt?: string;
  } | null;
  requestedSupplies?: {
    name: string;
    quantity: number;
    unit?: string;
    urgency?: string;
    note?: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    requestedAt?: string;
    respondedAt?: string;
    responseNote?: string;
  }[];
}

export interface ShoreHandoffRequest {
  status: 'NONE' | 'REQUESTED' | 'ASSIGNED' | 'COMPLETED' | 'CANCELLED';
  requestedAt?: string;
  requestedByRescuerName?: string;
  rescueTeamName?: string;
  rescueTeamId?: string;
  landingPoint: {
    name: string;
    address?: string;
    coordinates?: [number, number]; // [lng, lat]
    lat?: number;
    lng?: number;
  };
  vehicleTypeNeeded: 'AMBULANCE' | 'TRUCK' | 'ANY';
  peopleCount: number;
  notes?: string;
  assignedVehicleId?: string;
  assignedVehicleName?: string;
  assignedVehiclePlate?: string;
  assignedRoadTeamName?: string;
  assignedDriverName?: string;
  assignedDriverPhone?: string;
  assignedAt?: string;
  completedAt?: string;
}

export interface RescueTeam {
  id: string;
  name: string;
  code?: string;
  teamType?: string;
  teamStatus?: string;
  operationalStatus?: string;
  leaderId?: string;
  description?: string;
  authorityOrganizationId: string;
  authorityName?: string;
  status: 'Available' | 'Busy' | 'Off-duty';
  availableRescuersCount: number;
  rescuers: RescuerProfile[];
  vehicles?: Vehicle[];
  districtId?: string;
  wardId?: string;
  wardName?: string;
  districtName?: string;
  skills?: string[];
  equipments?: Array<{ _id: string; name: string; category: string; quantity: number; unit?: string; status: string }>;
  baseCoordinates?: { lat: number; lng: number } | null;
}

export interface RescuerProfile {
  id: string;
  name: string;
  role: 'Team Leader' | 'Medic' | 'Field Specialist' | 'Boat Operator' | string;
  status: 'Online' | 'In Mission' | 'Offline';
  teamId: string;
  phone: string;
  email?: string;
  specialty?: string;
  skills?: string[];
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  type: 'Inflatable Boat' | 'Tactical Truck' | 'Ambulance' | 'Amphibious Vehicle';
  rawType?: string;
  status: 'Available' | 'In Mission' | 'Maintenance';
  capacity: string;
  numericCapacity?: number;
  terrainCapabilities?: string[];
  teamId: string;
  teamName?: string;
  districtId?: string;
  wardId?: string;
  areaId?: string;
}

export type AssignmentStatus =
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'ON_THE_WAY'
  | 'ARRIVED'
  | 'RESCUING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REASSIGNED';

export interface SosAssignment {
  id: string;
  sosRequestId: string;
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
  status: AssignmentStatus;
  priority: EmergencyPriority;
  assignedAt: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  note?: string;
  rescuerLocation?: {
    lat: number;
    lng: number;
    svgX: number;
    svgY: number;
  };
  distanceRemainingKm?: number;
  etaMinutes?: number;
  supplies?: AssignedSupplyItem[];
  requestedSupplies?: {
    name: string;
    quantity: number;
    unit?: string;
    urgency?: string;
    note?: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    requestedAt?: string;
    respondedAt?: string;
    responseNote?: string;
  }[];
}

export interface AssignedSupplyItem {
  supplyId: string;
  name: string;
  quantity: number;
  unit: string;
}

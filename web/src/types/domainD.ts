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

export type EmergencyPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type EmergencyType =
  | 'MEDICAL'          // 🚑 Y tế (Mặc định)
  | 'FIRE'             // 🔥 Cháy
  | 'POLICE'           // 🚓 An ninh
  | 'RESCUE'           // 🛟 Cứu hộ
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

export interface SosRequest {
  id: string;
  sosCode: string; // e.g. #8921
  timeAgo: string;
  createdAt: string;
  emergencyType: EmergencyType;
  priority: EmergencyPriority;
  title: string;
  description: string;
  locationName: string;
  wardId: string;
  wardName: string;
  districtId?: string;
  districtName: string;
  citizenName: string;
  citizenPhone: string;
  affectedPeople: number;
  status: SosRequestStatus;
  coordinates: {
    lat: number;
    lng: number;
    svgX: number; // for interactive SVG map
    svgY: number;
  };
  assignmentId?: string | null;
  images?: string[];
  imageUrl?: string;
}

export interface RescueTeam {
  id: string;
  name: string;
  authorityOrganizationId: string;
  status: 'Available' | 'Busy' | 'Off-duty';
  availableRescuersCount: number;
  rescuers: RescuerProfile[];
  districtId?: string;
  wardId?: string;
}

export interface RescuerProfile {
  id: string;
  name: string;
  role: 'Team Leader' | 'Medic' | 'Field Specialist' | 'Boat Operator' | string;
  status: 'Online' | 'In Mission' | 'Offline';
  teamId: string;
  phone: string;
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  type: 'Inflatable Boat' | 'Tactical Truck' | 'Ambulance' | 'Amphibious Vehicle';
  status: 'Available' | 'In Mission' | 'Maintenance';
  capacity: string;
  teamId: string;
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
}

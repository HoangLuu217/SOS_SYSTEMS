export interface SosRequestItem {
  _id: string;
  sosCode: string;
  citizenId?: {
    _id: string;
    fullName: string;
    phone?: string;
    email?: string;
    avatarUrl?: string;
    address?: string;
    citizenProfile?: {
      emergencyContact?: {
        name?: string;
        phone?: string;
        relation?: string;
      };
    };
    roles?: string[];
  } | string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  areaId?: {
    _id: string;
    name: string;
    code: string;
  } | string;
  address: string;
  emergencyType: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  people: number;
  description?: string;
  contactPhone?: string;
  priorityGroups?: string[];
  images?: string[];
  imageUrl?: string;
  status:
    | 'PENDING'
    | 'VERIFIED'
    | 'ASSIGNED'
    | 'ACCEPTED'
    | 'ON_THE_WAY'
    | 'ARRIVED'
    | 'RESCUING'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'REJECTED';
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOverviewStats {
  overview: {
    totalUsers: number;
    totalCitizens: number;
    totalRescuers: number;
    totalTeams: number;
    totalVehicles: number;
    totalSos: number;
    completedMissions: number;
    activeAlerts: number;
  };
  sosByStatus?: Array<{ status: string; count: number }>;
  sosByPriority?: Array<{ priority: string; count: number }>;
  sosByEmergencyType?: Array<{ emergencyType: string; count: number }>;
  generatedAt?: string;
}

export interface VehicleItem {
  _id: string;
  teamId?: {
    _id: string;
    name: string;
  } | string;
  type: 'BOAT' | 'AMBULANCE' | 'TRUCK' | 'MOTORBIKE' | 'OTHER';
  plateNumber: string;
  capacity: number;
  status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE';
  description?: string;
  createdAt?: string;
}

export interface RescueTeamItem {
  _id: string;
  name: string;
  type: string;
  leaderId?: {
    _id: string;
    fullName: string;
    phone?: string;
  } | string;
  authorityId?: {
    _id: string;
    name: string;
  } | string;
  areaId?: {
    _id: string;
    name: string;
  } | string;
  members?: Array<{
    rescuerId: {
      _id: string;
      fullName: string;
      phone?: string;
    } | string;
    role: string;
  }>;
  description?: string;
  status: string;
}

export interface AlertItem {
  _id: string;
  title: string;
  content: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  areaId?: {
    _id: string;
    name: string;
  } | string;
  startTime: string;
  endTime?: string;
  isActive: boolean;
  createdAt?: string;
}

export interface AuditLogItem {
  _id: string;
  actorId?: {
    _id: string;
    fullName: string;
    email?: string;
  } | string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AdministrativeAreaItem {
  _id: string;
  name: string;
  code: string;
  type: 'COUNTRY' | 'PROVINCE' | 'DISTRICT' | 'WARD';
  parentId?: {
    _id: string;
    name: string;
  } | string;
  status: string;
}

export interface AuthorityOrgItem {
  _id: string;
  name: string;
  code: string;
  type: string;
  phone?: string;
  email?: string;
  address?: string;
  status: string;
}

export interface HazardReportItem {
  _id: string;
  title: string;
  description: string;
  hazardType:
    | 'FLOOD'
    | 'LANDSLIDE'
    | 'FALLEN_TREE'
    | 'EROSION'
    | 'OBSTACLE'
    | 'ELECTRICAL'
    | 'ROAD_DAMAGE'
    | 'OTHER';
  customHazardType?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  address: string;
  areaId?: {
    _id: string;
    name: string;
    code?: string;
  } | string;
  reportedBy?: {
    _id: string;
    fullName: string;
    phone?: string;
    email?: string;
    roles?: string[];
  } | string;
  reporterRole?: 'CITIZEN' | 'RESCUER' | 'LOCAL_AUTHORITY' | 'ADMIN' | string;
  images?: string[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
  reviewedBy?: {
    _id: string;
    fullName: string;
  } | string;
  reviewedAt?: string;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SafeLocationItem {
  _id: string;
  name: string;
  type: 'EVACUATION_CENTER' | 'HOSPITAL' | 'RESCUE_STATION' | 'SHELTER' | 'MEETING_POINT';
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  address: string;
  areaId?: {
    _id: string;
    name: string;
    code?: string;
  } | string;
  capacity: number;
  currentOccupancy: number;
  status: 'ACTIVE' | 'INACTIVE' | 'FULL' | 'MAINTENANCE';
  createdBy?: {
    _id: string;
    fullName: string;
  } | string;
  createdAt?: string;
}


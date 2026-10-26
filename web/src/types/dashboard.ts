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
  secondaryPhone?: string;
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
  repeatCount?: number;
  lastRepeatedAt?: string;
  isSecondaryRequest?: boolean;
  primarySosId?: string;
  assignmentId?: string;
  assignment?: any;
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
    type?: string;
    leaderId?: {
      _id?: string;
      fullName?: string;
      phone?: string;
      email?: string;
    };
    areaId?: {
      _id?: string;
      name?: string;
      code?: string;
    };
    status?: string;
  } | string;
  type: 'BOAT' | 'AMBULANCE' | 'TRUCK' | 'MOTORBIKE' | 'OTHER';
  plateNumber: string;
  capacity: number;
  status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE';
  description?: string;
  createdAt?: string;
  assignedTeam?: RescueTeamItem;
}

export interface RescueTeamMemberItem {
  _id?: string;
  role: 'LEADER' | 'MEMBER' | string;
  joinedAt?: string;
  rescuerId: {
    _id: string;
    fullName: string;
    phone?: string;
    email?: string;
    status?: string;
    isVerified?: boolean;
    rescuer?: {
      skills?: string[];
      experience?: string;
      vehicleType?: string;
      verificationStatus?: string;
      availabilityStatus?: string;
    };
  } | string;
}

export interface RescueTeamItem {
  _id: string;
  name: string;
  type: string;
  leaderId?: {
    _id: string;
    fullName: string;
    phone?: string;
    email?: string;
    status?: string;
    rescuer?: {
      skills?: string[];
      experience?: string;
      vehicleType?: string;
      verificationStatus?: string;
      availabilityStatus?: string;
    };
  } | string;
  authorityId?: {
    _id: string;
    name: string;
    code?: string;
    phone?: string;
    type?: string;
  } | string;
  areaId?: {
    _id: string;
    name: string;
    code?: string;
    type?: string;
  } | string;
  members?: RescueTeamMemberItem[];
  vehicles?: VehicleItem[];
  description?: string;
  status: string;
  createdAt?: string;
}


export interface AuditLogItem {
  _id: string;
  actorId?: {
    _id: string;
    fullName: string;
    email?: string;
    phone?: string;
    authority?: {
      organizationName?: string;
      position?: string;
      department?: string;
      areaName?: string;
    };
  } | string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  areaId?: {
    _id: string;
    name: string;
    code?: string;
    type?: string;
  } | string;
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

export interface WeatherNotificationItem {
  _id: string;
  title: string;
  content: string;
  weatherType:
    | 'GENERAL'
    | 'HEAVY_RAIN'
    | 'STORM'
    | 'TYPHOON'
    | 'THUNDERSTORM'
    | 'FLASH_FLOOD'
    | 'HEATWAVE'
    | 'COLD_SURGE'
    | 'HIGH_TIDE'
    | string;
  severity: 'LOW' | 'NORMAL' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  imageUrl?: string;
  articleUrl?: string;
  sourceName?: string;
  areaId?: any;
  areaName?: string;
  affectedAreas?: any[];
  temperature?: {
    min?: number;
    max?: number;
    unit?: string;
  };
  rainfall?: {
    min?: number;
    max?: number;
    unit?: string;
  };
  windLevel?: string;
  humidity?: number;
  startTime?: string;
  endTime?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  createdBy?: {
    _id: string;
    fullName: string;
    roles?: string[];
  };
  broadcastId?: string;
  isBroadcasted?: boolean;
  data?: any;
  createdAt: string;
  updatedAt?: string;
}


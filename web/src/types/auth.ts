export interface User {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  roles: string[];
  status: string;
  isVerified?: boolean;
  isPhoneVerified?: boolean;
  avatarUrl?: string;
  authority?: {
    organizationId?: string;
    organizationName?: string;
    areaId?: string;
    areaName?: string;
    position?: string;
    department?: string;
    provinceCode?: number;
    wardCode?: number;
    mapUrl?: string;
    latitude?: number;
    longitude?: number;
    officeAddress?: string;
  };
  lastLoginAt?: string;
  createdAt?: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  data?: {
    user: User;
    accessToken: string;
    refreshToken?: string;
  };
}

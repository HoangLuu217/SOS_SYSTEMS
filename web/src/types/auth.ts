export interface User {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  roles: string[];
  status: string;
  isVerified?: boolean;
  avatarUrl?: string;
  authority?: {
    organizationId?: string;
    areaId?: string;
    position?: string;
    department?: string;
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

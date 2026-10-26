/**
 * Kiểu dữ liệu Người liên hệ khẩn cấp
 */
export interface EmergencyContact {
  id?: string;
  name: string;
  phone: string;
  relation: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Thông tin người dùng (User Profile)
 */
export interface UserProfile {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  isPhoneVerified?: boolean;
  googleId?: string;
  avatarUrl?: string;
  roles: string[];
  status: string;
  isVerified: boolean;
  dateOfBirth?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | string;
  address?: string;
  citizen?: {
    emergencyContact?: EmergencyContact;
    emergencyContacts?: EmergencyContact[];
  };
  rescuer?: {
    idNumber?: string | null;
    skills: string[];
    experience?: string | null;
    vehicleType?: string | null;
    verificationStatus: 'NOT_REGISTERED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
    availabilityStatus: 'OFFLINE' | 'AVAILABLE' | 'BUSY' | 'ON_MISSION' | 'SUSPENDED';
  };
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Phản hồi khi xác thực đăng nhập/đăng ký thành công
 */
export interface AuthResponseData {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
}

/**
 * Chế độ xác thực
 */
export type AuthMode = 'backend' | 'supabase' | 'hybrid';

/**
 * Phản hồi gửi mã OTP số điện thoại
 */
export interface SendOtpResponse {
  success: boolean;
  sessionInfo?: string;
  message?: string;
}

/**
 * Phản hồi xác thực OTP số điện thoại
 */
export interface VerifyOtpResponse {
  success: boolean;
  phoneNumber?: string;
  idToken?: string;
  message?: string;
}

import { apiClient } from './client';
import { authApi } from './auth.api';
import { userApi } from './user.api';
import { alertApi } from './alert.api';
import { mapApi } from './map.api';
import { notificationApi } from './notification.api';
import type {
  EmergencyContact,
  UserProfile,
  AuthResponseData,
  ApiResponse,
  NotificationItem,
  SafeLocation,
  AlertItem,
} from '../types';


export type {
  EmergencyContact,
  UserProfile,
  AuthResponseData,
  ApiResponse,
  NotificationItem,
  SafeLocationType,
  SafeLocationStatus,
  SafeLocation,
  AlertType,
  AlertSeverity,
  AlertItem,
} from '../types';

/**
 * BackendApiService: Facade dùng chung tương thích ngược 100% với toàn bộ app cũ,
 * đồng thời ủy quyền logic cho các domain API chuyên biệt trong src/api/
 */
class BackendApiService {
  // HTTP Client core
  getBaseUrl = () => apiClient.getBaseUrl();
  setBaseUrl = (url: string) => apiClient.setBaseUrl(url);
  clearCustomBaseUrl = () => apiClient.clearCustomBaseUrl();
  request = <T = any>(endpoint: string, options: RequestInit = {}) =>
    apiClient.request<T>(endpoint, options);
  get = <T = any>(endpoint: string, options: RequestInit = {}) =>
    apiClient.get<T>(endpoint, options);
  post = <T = any>(endpoint: string, body: any, options: RequestInit = {}) =>
    apiClient.post<T>(endpoint, body, options);
  postFormData = <T = any>(endpoint: string, formData: FormData, options: RequestInit = {}) =>
    apiClient.postFormData<T>(endpoint, formData, options);
  put = <T = any>(endpoint: string, body: any, options: RequestInit = {}) =>
    apiClient.put<T>(endpoint, body, options);
  patch = <T = any>(endpoint: string, body: any, options: RequestInit = {}) =>
    apiClient.patch<T>(endpoint, body, options);
  delete = <T = any>(endpoint: string, options: RequestInit = {}) =>
    apiClient.delete<T>(endpoint, options);

  // Auth API
  register = (data: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    address?: string;
    otp?: string;
  }) => authApi.register(data);

  login = (credentials: { identifier: string; password: string }) =>
    authApi.login(credentials);

  loginWithGoogle = (data: {
    idToken?: string;
    credential?: string;
    googleId?: string;
    email?: string;
    fullName?: string;
    avatarUrl?: string;
  }) => authApi.loginWithGoogle(data);

  sendOtp = (target: string) => authApi.sendOtp(target);

  verifyOtp = (target: string, otp: string, verifyOnly: boolean = false) =>
    authApi.verifyOtp(target, otp, verifyOnly);

  forgotPassword = (email: string) => authApi.forgotPassword(email);

  verifyResetOtp = (email: string, otp: string) => authApi.verifyResetOtp(email, otp);

  resetPassword = (
    param1: string | { email?: string; token: string; newPassword: string },
    param2?: string,
    param3?: string
  ) => authApi.resetPassword(param1, param2, param3);

  logout = () => authApi.logout();

  // User & Rescuer API
  updateProfile = (data: {
    fullName?: string;
    dateOfBirth?: string;
    gender?: string;
    address?: string;
    phone?: string;
  }) => userApi.updateProfile(data);

  updateAvatar = (avatarUrl: string) => userApi.updateAvatar(avatarUrl);

  changePassword = (oldPassword: string, newPassword: string) =>
    userApi.changePassword(oldPassword, newPassword);

  getCitizenProfile = () => userApi.getCitizenProfile();

  updateEmergencyContact = (contact: EmergencyContact) =>
    userApi.updateEmergencyContact(contact);

  getRescuerProfile = () => userApi.getRescuerProfile();

  updateRescuerAvailability = (availabilityStatus: string) =>
    userApi.updateRescuerAvailability(availabilityStatus);

  // Notifications API
  getNotifications = (query?: {
    type?: string;
    isRead?: boolean | string;
    page?: number;
    limit?: number;
  }) => notificationApi.getNotifications(query);

  registerPushToken = (pushToken: string) =>
    notificationApi.registerPushToken(pushToken);

  markAllNotificationsAsRead = () => notificationApi.markAllNotificationsAsRead();

  markNotificationAsRead = (id: string) => notificationApi.markNotificationAsRead(id);

  deleteNotification = (id: string) => notificationApi.deleteNotification(id);

  // Map & Safe Locations API
  getSafeLocations = (params: {
    type?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}) => mapApi.getSafeLocations(params);

  getNearbySafeLocations = (
    lng: number,
    lat: number,
    maxDistance: number = 20000,
    limit: number = 50
  ) => mapApi.getNearbySafeLocations(lng, lat, maxDistance, limit);

  // Alerts API
  getActiveAlerts = (params: {
    type?: string;
    severity?: string;
    limit?: number;
  } = {}) => alertApi.getActiveAlerts(params);

  getAlerts = (params: {
    type?: string;
    severity?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  } = {}) => alertApi.getAlerts(params);

  // Storage helpers
  saveTokens = (accessToken: string, refreshToken?: string) =>
    apiClient.saveTokens(accessToken, refreshToken);

  saveUser = (user: UserProfile) => apiClient.saveUser(user);

  getStoredUser = () => apiClient.getStoredUser();

  clearStorage = () => apiClient.clearStorage();
}

export const backendApi = new BackendApiService();

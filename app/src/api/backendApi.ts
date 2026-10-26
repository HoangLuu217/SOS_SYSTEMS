import { apiClient } from './client';
import { authApi } from './auth.api';
import { userApi } from './user.api';
import { alertApi } from './alert.api';
import { mapApi } from './map.api';
import { notificationApi } from './notification.api';
import { chatApi } from './chat.api';
import { rescuerApi } from './rescuer.api';
import { rescueTeamApi } from './rescueTeam.api';
import { vehicleApi } from './vehicle.api';
import { assignmentApi, RescuerAssignmentItem } from './assignment.api';
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
    email?: string;
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

  forgotPassword = (target: string) => authApi.forgotPassword(target);

  verifyResetOtp = (target: string, otp: string) => authApi.verifyResetOtp(target, otp);

  resetPassword = (
    param1: string | { email?: string; phone?: string; account?: string; token: string; newPassword: string },
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

  sendUserPhoneOtp = (phone: string) => userApi.sendPhoneOtp(phone);
  verifyUserPhoneOtp = (phone: string, otp: string) => userApi.verifyPhoneOtp(phone, otp);

  changePassword = (oldPassword: string, newPassword: string) =>
    userApi.changePassword(oldPassword, newPassword);

  getCitizenProfile = () => userApi.getCitizenProfile();

  updateEmergencyContact = (contact: EmergencyContact | EmergencyContact[]) =>
    userApi.updateEmergencyContact(contact);

  deleteEmergencyContact = (contactId?: string) => userApi.deleteEmergencyContact(contactId);

  getRescuerProfile = () => rescuerApi.getProfile();

  updateRescuerProfile = (data: any) => rescuerApi.updateProfile(data);

  applyRescuer = (data: any) => rescuerApi.apply(data);

  updateRescuerSkills = (skills: string[]) => rescuerApi.updateSkills(skills);

  updateRescuerExperience = (experience: string) => rescuerApi.updateExperience(experience);

  updateRescuerAvailability = (availabilityStatus: string) =>
    rescuerApi.updateAvailability(availabilityStatus);

  // Rescue Team & Vehicle API
  getRescueTeams = (params?: any) => rescueTeamApi.getTeams(params);

  getRescueTeamById = (id: string) => rescueTeamApi.getTeamById(id);

  joinRescueTeam = (teamId: string, rescuerId: string, role: string = 'MEMBER') =>
    rescueTeamApi.addMember(teamId, rescuerId, role);

  leaveRescueTeam = (teamId: string, rescuerId: string) =>
    rescueTeamApi.removeMember(teamId, rescuerId);

  changeRescueTeamLeader = (teamId: string, newLeaderId: string) =>
    rescueTeamApi.changeLeader(teamId, newLeaderId);

  updateRescueTeamMemberStatus = (teamId: string, rescuerId: string, status: 'APPROVED' | 'REJECTED') =>
    rescueTeamApi.updateMemberStatus(teamId, rescuerId, status);

  getVehicles = (params?: any) => vehicleApi.getVehicles(params);

  getVehicleById = (id: string) => vehicleApi.getVehicleById(id);

  updateVehicleStatus = (id: string, status: any) => vehicleApi.updateStatus(id, status);

  // Administrative Area API
  getAdministrativeAreas = (query?: { type?: string; parentId?: string; search?: string }) => {
    let endpoint = '/administrative-areas';
    if (query) {
      const q = new URLSearchParams();
      if (query.type) q.append('type', query.type);
      if (query.parentId) q.append('parentId', query.parentId);
      if (query.search) q.append('search', query.search);
      const str = q.toString();
      if (str) endpoint += `?${str}`;
    }
    return apiClient.get<any[]>(endpoint);
  };

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

  // Chat with Local Authority API
  getLocalAuthority = (params: Parameters<typeof chatApi.getLocalAuthority>[0]) =>
    chatApi.getLocalAuthority(params);

  getChatMessages = (params: Parameters<typeof chatApi.getMessages>[0]) =>
    chatApi.getMessages(params);

  sendChatMessage = (data: Parameters<typeof chatApi.sendMessage>[0]) =>
    chatApi.sendMessage(data);

  markChatAsRead = (params: Parameters<typeof chatApi.markAsRead>[0]) =>
    chatApi.markAsRead(params);

  // Sos Assignment / Mission API for Rescuers
  getMyAssignments = () =>
    assignmentApi.getMyAssignments() as Promise<ApiResponse<import('../types').SosAssignmentData[]>>;

  getAssignmentById = (id: string) =>
    apiClient.get<import('../types').SosAssignmentData>(`/assignments/${id}`);

  acceptAssignment = (id: string) => assignmentApi.acceptAssignment(id);

  updateAssignmentStatus = (id: string, status: string, note?: string) =>
    assignmentApi.updateAssignmentStatus(id, status, note);

  updateSosMissionStatus = (sosId: string, status: string, note?: string) =>
    assignmentApi.updateSosMissionStatus(sosId, status, note);

  cancelAssignment = (id: string, cancelReason?: string) =>
    apiClient.patch<import('../types').SosAssignmentData>(`/assignments/${id}/cancel`, {
      cancelReason,
    });

  getAvailableSosRequests = () => assignmentApi.getAvailableSosRequests();

  // Storage helpers
  saveTokens = (accessToken: string, refreshToken?: string) =>
    apiClient.saveTokens(accessToken, refreshToken);

  saveUser = (user: UserProfile) => apiClient.saveUser(user);

  getStoredUser = () => apiClient.getStoredUser();

  clearStorage = () => apiClient.clearStorage();
}

export const backendApi = new BackendApiService();

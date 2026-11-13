import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Image,
  Modal,
  TouchableWithoutFeedback,
  Alert,
  ActivityIndicator,
  Switch,
  Platform,
  TextInput,
  Linking,
  RefreshControl,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { PROFILE_THEME } from './theme';
import { useAuth } from '@/context/AuthContext';
import { LogoSOS } from '@/components';
import { backendApi } from '@/api';
import type { RescueTeamData, VehicleData, RescuerVerificationStatus } from '@/types';
import { RESCUE_SKILLS } from './ProfessionalProfileScreen';

const APPLICANT_SKILL_LABELS: Record<string, string> = {
  ...Object.fromEntries(RESCUE_SKILLS.map((s) => [s.id, s.label])),
  relief_logistics: 'Tiếp tế lương thực',
  technical_rescue: 'Cứu hộ kỹ thuật cao',
};

export type RescuerAvailability =
  | 'OFFLINE'      // Ngoại tuyến
  | 'READY'        // Sẵn sàng
  | 'BUSY'         // Đang bận
  | 'ON_MISSION'   // Đang làm nhiệm vụ
  | 'SUSPENDED';   // Tạm đình chỉ

export interface RescuerProfileOverviewScreenProps {
  onNavigateToEditProfile: () => void;
  onNavigateToProfessional: () => void;
  onNavigateToSosHistory: () => void;
  onNavigateToSecurity: () => void;
  onNavigateToNotificationSettings: () => void;
  onNavigateToNotifications: () => void;
  unreadNotificationsCount?: number;
  refreshTrigger?: number;
  onNavigateToTab?: (tab: any, options?: any) => void;
}

const FALLBACK_RESCUE_TEAMS: RescueTeamData[] = [];


export const RescuerProfileOverviewScreen: React.FC<RescuerProfileOverviewScreenProps> = ({
  onNavigateToEditProfile,
  onNavigateToProfessional,
  onNavigateToSosHistory,
  onNavigateToSecurity,
  onNavigateToNotificationSettings,
  onNavigateToNotifications,
  unreadNotificationsCount = 3,
  refreshTrigger,
}) => {
  const { user, logout, updateUserAvatar } = useAuth();
  const insets = useSafeAreaInsets();
  const topSafeInset = Math.max(
    insets.top + 8,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 52
  );

  // Avatar state
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(null);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  // Logout modal state
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);

  // Rescuer Availability & Team states (Đồng bộ Backend Domain B)
  const [availability, setAvailability] = useState<RescuerAvailability>('OFFLINE');
  const [verificationStatus, setVerificationStatus] =
    useState<RescuerVerificationStatus>('PENDING');
  const [myTeam, setMyTeam] = useState<RescueTeamData | null>(null);
  const [pendingTeam, setPendingTeam] = useState<RescueTeamData | null>(null);
  const [teamVehicles, setTeamVehicles] = useState<VehicleData[]>([]);
  const [isUpdatingAvailability, setIsUpdatingAvailability] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  // Team Selection & Area states
  const [allTeams, setAllTeams] = useState<RescueTeamData[]>([]);
  const [userAreaName, setUserAreaName] = useState<string>('');
  const [isJoiningTeam, setIsJoiningTeam] = useState<string | null>(null);
  const [isProcessingMember, setIsProcessingMember] = useState<string | null>(null);
  const [showTeamPickerModal, setShowTeamPickerModal] = useState<boolean>(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState<string>('');
  const [showTeamDetailModal, setShowTeamDetailModal] = useState<boolean>(false);
  const [selectedTeamForDetail, setSelectedTeamForDetail] = useState<RescueTeamData | null>(null);
  const [isLeavingTeam, setIsLeavingTeam] = useState<boolean>(false);
  const [showTransferLeaderModal, setShowTransferLeaderModal] = useState<boolean>(false);
  const [transferLeaderTeam, setTransferLeaderTeam] = useState<RescueTeamData | null>(null);
  const [isTransferringLeader, setIsTransferringLeader] = useState<boolean>(false);
  const [localRefreshTrigger, setLocalRefreshTrigger] = useState<number>(0);

  const selectedTeamIdRef = useRef<string | null>(null);
  const showTeamDetailRef = useRef<boolean>(false);
  useEffect(() => {
    selectedTeamIdRef.current = selectedTeamForDetail?._id || null;
    showTeamDetailRef.current = showTeamDetailModal;
  }, [selectedTeamForDetail?._id, showTeamDetailModal]);

  const handleCallLeader = (phone?: string) => {
    if (!phone) {
      Alert.alert('Thông báo', 'Đội trưởng chưa cập nhật số điện thoại.');
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Lỗi', 'Không thể khởi động ứng dụng gọi điện thoại.');
    });
  };

  const isUserLeaderOfTeam = (team?: RescueTeamData | null) => {
    if (!team || !user) return false;
    const currentUserId = (user._id || (user as any)?.id)?.toString();
    const currentUserPhone = user.phone;
    const currentUserEmail = user.email?.toLowerCase();
    const leaderIdStr = (team.leaderId?._id || team.leaderId)?.toString();
    const leaderPhone = team.leaderId?.phone;
    const leaderEmail = team.leaderId?.email?.toLowerCase();
    return (
      (!!currentUserId && currentUserId === leaderIdStr) ||
      (!!currentUserPhone && currentUserPhone === leaderPhone) ||
      (!!currentUserEmail && currentUserEmail === leaderEmail)
    );
  };

  const isUserPendingInTeam = (team?: RescueTeamData | null) => {
    if (!team || !user || !Array.isArray(team.members)) return false;
    const currentUserId = (user._id || (user as any)?.id)?.toString();
    const currentUserPhone = user.phone;
    const currentUserEmail = user.email?.toLowerCase();
    return team.members.some((m: any) => {
      const r = m.rescuerId;
      const rId = (r?._id || r)?.toString();
      const rPhone = r?.phone;
      const rEmail = r?.email?.toLowerCase();
      const matchesUser =
        (currentUserId && rId === currentUserId) ||
        (currentUserPhone && rPhone === currentUserPhone) ||
        (currentUserEmail && rEmail === currentUserEmail);
      return matchesUser && m.status === 'PENDING';
    });
  };

  const getNameInitials = (name: string) => {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return (name || 'TV').slice(0, 2).toUpperCase();
  };

  const isSameAccountAsCurrentUser = (accountObj: any) => {
    if (!user || !accountObj) return false;
    const currentUserId = (user._id || (user as any)?.id)?.toString();
    const currentUserPhone = user.phone;
    const currentUserEmail = user.email?.toLowerCase();
    const targetId = (accountObj?._id || accountObj)?.toString();
    const targetPhone = accountObj?.phone;
    const targetEmail = accountObj?.email?.toLowerCase();
    return Boolean(
      (currentUserId && targetId === currentUserId) ||
        (currentUserPhone && targetPhone === currentUserPhone) ||
        (currentUserEmail && targetEmail === currentUserEmail)
    );
  };

  const getApprovedMembers = (team?: RescueTeamData | null) => {
    if (!team || !Array.isArray(team.members)) return [];
    return team.members.filter((m: any) => m.status === 'APPROVED' || !m.status);
  };

  const getRosterMembers = (team?: RescueTeamData | null) => {
    if (!team) return [];
    const approved = getApprovedMembers(team);
    const leaderObj = typeof team.leaderId === 'object' ? team.leaderId : null;
    const leaderIdStr = (team.leaderId?._id || team.leaderId)?.toString();

    const list = [...approved];
    const hasLeaderInList =
      leaderIdStr &&
      list.some((m: any) => ((m.rescuerId?._id || m.rescuerId)?.toString() === leaderIdStr));

    if (!hasLeaderInList && leaderObj) {
      list.unshift({
        _id: `leader-${leaderIdStr}`,
        rescuerId: leaderObj,
        role: 'LEADER',
        status: 'APPROVED',
        joinedAt: (team as any).createdAt || new Date().toISOString(),
      });
    }

    return list.sort((a: any, b: any) => {
      const aId = (a.rescuerId?._id || a.rescuerId)?.toString();
      const bId = (b.rescuerId?._id || b.rescuerId)?.toString();
      const aIsLeader = a.role === 'LEADER' || (leaderIdStr && aId === leaderIdStr);
      const bIsLeader = b.role === 'LEADER' || (leaderIdStr && bId === leaderIdStr);
      if (aIsLeader && !bIsLeader) return -1;
      if (!aIsLeader && bIsLeader) return 1;
      return 0;
    });
  };

  const getOtherTeamMembers = (team?: RescueTeamData | null) => {
    if (!team || !Array.isArray(team.members)) return [];
    return team.members.filter((m: any) => {
      const isApproved = m.status === 'APPROVED' || !m.status;
      return !isSameAccountAsCurrentUser(m.rescuerId) && isApproved;
    });
  };

  const handleOpenTeamDetail = async (team: RescueTeamData) => {
    setSelectedTeamForDetail(team);
    setShowTeamDetailModal(true);
    try {
      const [teamRes, vehRes] = await Promise.all([
        backendApi.getRescueTeamById(team._id),
        backendApi.getVehicles({ teamId: team._id }),
      ]);

      const rawVehicles = Array.isArray(vehRes?.data)
        ? vehRes.data
        : (vehRes?.data as any)?.vehicles || [];

      let mergedTeam: RescueTeamData = {
        ...team,
        ...(teamRes.success && teamRes.data ? teamRes.data : {}),
      };

      if (rawVehicles.length > 0) {
        mergedTeam.vehicles = rawVehicles;
      } else if (!mergedTeam.vehicles || mergedTeam.vehicles.length === 0) {
        if (teamRes.success && teamRes.data?.vehicles && teamRes.data.vehicles.length > 0) {
          mergedTeam.vehicles = teamRes.data.vehicles;
        } else if (team.vehicles && team.vehicles.length > 0) {
          mergedTeam.vehicles = team.vehicles;
        }
      }

      setSelectedTeamForDetail(mergedTeam);

      if (team._id === myTeam?._id && mergedTeam.vehicles) {
        setTeamVehicles(mergedTeam.vehicles);
      }
    } catch {
      // Giữ nguyên dữ liệu đội ban đầu nếu lỗi mạng
    }
  };

  const openTransferLeaderModal = async (team: RescueTeamData) => {
    setTransferLeaderTeam(team);
    setShowTransferLeaderModal(true);
    try {
      const res = await backendApi.getRescueTeamById(team._id);
      if (res.success && res.data) {
        setTransferLeaderTeam(res.data);
        setSelectedTeamForDetail(res.data);
      }
    } catch {
      // Giữ nguyên dữ liệu đội ban đầu nếu lỗi mạng
    }
  };

  const executeLeaveTeam = async (team: RescueTeamData, isSoleLeader: boolean) => {
    try {
      setIsLeavingTeam(true);
      const res = await backendApi.leaveRescueTeam(team._id, user!._id);
      if (res && res.success === false && res.message) {
        Alert.alert('Không thể rời đội', res.message);
        return;
      }
      setMyTeam(null);
      setTeamVehicles([]);
      setShowTeamDetailModal(false);
      setLocalRefreshTrigger((c) => c + 1);

      if (isSoleLeader) {
        Alert.alert(
          'Đã rời đội',
          `Bạn đã rời khỏi "${team.name}". Do không còn thành viên nào khác, trạng thái của đội đã được chuyển sang Tạm dừng hoạt động (INACTIVE).`
        );
      } else {
        Alert.alert(
          'Đã rời đội',
          `Bạn đã rời khỏi "${team.name}". Bạn có thể xem danh sách và ứng tuyển vào các đội khác trong khu vực.`
        );
      }
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.message || err?.message || 'Có lỗi xảy ra khi rời đội.';
      Alert.alert('Không thể rời đội', errMsg);
    } finally {
      setIsLeavingTeam(false);
    }
  };

  const handleLeaveTeam = (team: RescueTeamData) => {
    if (!user?._id) {
      Alert.alert('Lỗi', 'Không tìm thấy thông tin tài khoản người dùng.');
      return;
    }

    const isLeader = isUserLeaderOfTeam(team);
    const otherMembers = getOtherTeamMembers(team);

    // KỊCH BẢN 1: Leader và đội còn các thành viên khác -> Hiển thị trực tiếp popup chọn thành viên kế nhiệm
    if (isLeader && otherMembers.length > 0) {
      openTransferLeaderModal(team);
      return;
    }

    // KỊCH BẢN 2: Leader và đội CHỈ CÓ DUY NHẤT Đội trưởng -> Chuyển INACTIVE rồi rời
    if (isLeader && otherMembers.length === 0) {
      Alert.alert(
        'Tạm dừng hoạt động đội',
        `Đội "${team.name}" hiện chỉ có bạn là thành viên duy nhất. Khi bạn rời đi, đội sẽ tự động chuyển sang trạng thái TẠM DỪNG (INACTIVE).\n\nBạn có chắc chắn muốn tiếp tục rời đội?`,
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Tạm dừng & Rời đội',
            style: 'destructive',
            onPress: async () => {
              await executeLeaveTeam(team, true);
            },
          },
        ]
      );
      return;
    }

    // KỊCH BẢN 3: Thành viên bình thường (không phải Đội trưởng)
    Alert.alert(
      'Xác nhận rời đội cứu hộ',
      `Bạn có chắc chắn muốn rời khỏi "${team.name}" không? Sau khi rời đội, bạn sẽ chuyển về trạng thái Chưa gia nhập đội và có thể ứng tuyển vào các đội cứu hộ khác.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Rời đội',
          style: 'destructive',
          onPress: async () => {
            await executeLeaveTeam(team, false);
          },
        },
      ]
    );
  };

  const handleConfirmTransferLeader = (targetMember: any) => {
    if (!transferLeaderTeam || !user?._id) return;

    const targetUserId = (targetMember.rescuerId?._id || targetMember.rescuerId)?.toString();
    const targetName =
      targetMember.rescuerId?.fullName ||
      (typeof targetMember.rescuerId === 'string'
        ? `Thành viên #${targetUserId.slice(-4)}`
        : 'thành viên được chọn');

    Alert.alert(
      'Xác nhận chuyển giao chỉ huy',
      `Bạn có chắc chắn muốn chuyển giao chức vụ Đội trưởng của "${transferLeaderTeam.name}" cho ${targetName} và rời khỏi đội không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xác nhận & Rời đội',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsTransferringLeader(true);
              // Bước 1: Chuyển giao chức vụ Đội trưởng
              const changeRes = await backendApi.changeRescueTeamLeader(
                transferLeaderTeam._id,
                targetUserId
              );
              if (changeRes && changeRes.success === false && changeRes.message) {
                Alert.alert('Lỗi chuyển giao Đội trưởng', changeRes.message);
                return;
              }

              // Bước 2: Rời khỏi đội
              const leaveRes = await backendApi.leaveRescueTeam(
                transferLeaderTeam._id,
                user._id
              );
              if (leaveRes && leaveRes.success === false && leaveRes.message) {
                Alert.alert('Lỗi khi rời đội', leaveRes.message);
                return;
              }

              setMyTeam(null);
              setTeamVehicles([]);
              setShowTransferLeaderModal(false);
              setShowTeamDetailModal(false);
              setTransferLeaderTeam(null);
              setLocalRefreshTrigger((c) => c + 1);

              Alert.alert(
                'Chuyển giao thành công! 🎖️',
                `Bạn đã chuyển giao chức vụ Đội trưởng cho ${targetName} và rời khỏi đội "${transferLeaderTeam.name}".`
              );
            } catch (err: any) {
              const errMsg =
                err?.response?.data?.message ||
                err?.message ||
                'Có lỗi xảy ra khi chuyển giao quyền Đội trưởng và rời đội.';
              Alert.alert('Lỗi chuyển giao', errMsg);
            } finally {
              setIsTransferringLeader(false);
            }
          },
        },
      ]
    );
  };

  const handleApproveApplicant = (applicantMember: any) => {
    if (!selectedTeamForDetail || !user?._id) return;
    const rescuerId = (applicantMember.rescuerId?._id || applicantMember.rescuerId)?.toString();
    const rescuerName =
      applicantMember.rescuerId?.fullName ||
      (typeof applicantMember.rescuerId === 'string'
        ? `Cứu hộ viên #${rescuerId.slice(-4)}`
        : 'Cứu hộ viên');

    Alert.alert(
      'Phê duyệt ứng tuyển',
      `Bạn có đồng ý phê duyệt cho "${rescuerName}" chính thức gia nhập đội "${selectedTeamForDetail.name}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Phê duyệt',
          style: 'default',
          onPress: async () => {
            try {
              setIsProcessingMember(rescuerId);
              const res = await backendApi.updateRescueTeamMemberStatus(
                selectedTeamForDetail._id,
                rescuerId,
                'APPROVED'
              );
              if (res.success) {
                Alert.alert('Thành công! 🎉', `Đã duyệt "${rescuerName}" vào đội cứu hộ.`);
                const teamRes = await backendApi.getRescueTeamById(selectedTeamForDetail._id);
                if (teamRes.success && teamRes.data) {
                  setSelectedTeamForDetail(teamRes.data);
                  if (myTeam?._id === selectedTeamForDetail._id) {
                    setMyTeam(teamRes.data);
                  }
                }
                setLocalRefreshTrigger((c) => c + 1);
              } else {
                Alert.alert('Lỗi', res.message || 'Không thể phê duyệt thành viên này.');
              }
            } catch (err: any) {
              const msg =
                err?.response?.data?.message || err?.message || 'Có lỗi xảy ra khi phê duyệt.';
              Alert.alert('Lỗi phê duyệt', msg);
            } finally {
              setIsProcessingMember(null);
            }
          },
        },
      ]
    );
  };

  const handleRejectApplicant = (applicantMember: any) => {
    if (!selectedTeamForDetail || !user?._id) return;
    const rescuerId = (applicantMember.rescuerId?._id || applicantMember.rescuerId)?.toString();
    const rescuerName =
      applicantMember.rescuerId?.fullName ||
      (typeof applicantMember.rescuerId === 'string'
        ? `Cứu hộ viên #${rescuerId.slice(-4)}`
        : 'Cứu hộ viên');

    Alert.alert(
      'Từ chối ứng tuyển',
      `Bạn có chắc chắn muốn từ chối đơn ứng tuyển của "${rescuerName}" không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Từ chối',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsProcessingMember(rescuerId);
              const res = await backendApi.updateRescueTeamMemberStatus(
                selectedTeamForDetail._id,
                rescuerId,
                'REJECTED'
              );
              if (res.success) {
                Alert.alert('Đã từ chối', `Đã từ chối đơn ứng tuyển của "${rescuerName}".`);
                const teamRes = await backendApi.getRescueTeamById(selectedTeamForDetail._id);
                if (teamRes.success && teamRes.data) {
                  setSelectedTeamForDetail(teamRes.data);
                  if (myTeam?._id === selectedTeamForDetail._id) {
                    setMyTeam(teamRes.data);
                  }
                }
                setLocalRefreshTrigger((c) => c + 1);
              } else {
                Alert.alert('Lỗi', res.message || 'Không thể từ chối thành viên này.');
              }
            } catch (err: any) {
              const msg =
                err?.response?.data?.message || err?.message || 'Có lỗi xảy ra khi từ chối.';
              Alert.alert('Lỗi từ chối', msg);
            } finally {
              setIsProcessingMember(null);
            }
          },
        },
      ]
    );
  };

  const handleCancelApplication = (team: RescueTeamData) => {
    if (!user?._id) return;
    Alert.alert(
      'Rút đơn ứng tuyển',
      `Bạn có chắc chắn muốn rút đơn ứng tuyển tham gia "${team.name}" không?`,
      [
        { text: 'Không', style: 'cancel' },
        {
          text: 'Rút đơn',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsJoiningTeam(team._id);
              const res = await backendApi.leaveRescueTeam(team._id, user._id);
              if (res.success) {
                setPendingTeam(null);
                setShowTeamDetailModal(false);
                setLocalRefreshTrigger((c) => c + 1);
                Alert.alert('Đã rút đơn', `Bạn đã rút đơn ứng tuyển vào "${team.name}".`);
              } else {
                Alert.alert('Lỗi', res.message || 'Không thể rút đơn ứng tuyển.');
              }
            } catch (err: any) {
              const msg =
                err?.response?.data?.message || err?.message || 'Có lỗi xảy ra khi rút đơn.';
              Alert.alert('Lỗi', msg);
            } finally {
              setIsJoiningTeam(null);
            }
          },
        },
      ]
    );
  };

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Đồng bộ hồ sơ cứu hộ và Đội trực thuộc từ Backend (Real-time & on-demand)
  const fetchRescuerData = React.useCallback(async () => {
    try {
      const res = await backendApi.getRescuerProfile();
      if (res.success && res.data) {
        const rescuer: any = res.data.rescuer || {};
        if (rescuer.availabilityStatus) {
          setAvailability(
            rescuer.availabilityStatus === 'AVAILABLE' ? 'READY' : rescuer.availabilityStatus
          );
        }

        if (rescuer.verificationStatus) {
          setVerificationStatus(rescuer.verificationStatus);
        }
        if (rescuer.areaName) {
          setUserAreaName(rescuer.areaName);
        } else if (res.data?.citizen?.areaName) {
          setUserAreaName(res.data.citizen.areaName);
        } else if (res.data?.address) {
          setUserAreaName(res.data.address);

        }
      }

      // Tải danh sách Đội cứu hộ
      const teamsRes = await backendApi.getRescueTeams({ limit: 50 });
      if (teamsRes.success) {
        const rawTeams = Array.isArray(teamsRes.data)
          ? teamsRes.data
          : (teamsRes.data as any)?.teams || [];
        const combinedTeams = rawTeams.length > 0 ? rawTeams : FALLBACK_RESCUE_TEAMS;
        setAllTeams(combinedTeams);

        const currentUserId = user?._id?.toString();
        // Đội đã tham gia chính thức (Leader hoặc Member đã được Approved)
        const foundTeam = combinedTeams.find((t: any) => {
          if (t.status === 'INACTIVE') return false;
          const isLead = (t.leaderId?._id || t.leaderId)?.toString() === currentUserId;
          const isMem =
            Array.isArray(t.members) &&
            t.members.some((m: any) => {
              const rId = (m.rescuerId?._id || m.rescuerId)?.toString();
              return rId === currentUserId && (m.status === 'APPROVED' || !m.status);
            });
          return isLead || isMem;
        });

        // Kiểm tra xem người dùng có đơn ứng tuyển đang chờ phê duyệt ở đội nào không
        const foundPendingTeam = combinedTeams.find((t: any) => {
          if (t.status === 'INACTIVE') return false;
          return (
            Array.isArray(t.members) &&
            t.members.some((m: any) => {
              const rId = (m.rescuerId?._id || m.rescuerId)?.toString();
              return rId === currentUserId && m.status === 'PENDING';
            })
          );
        });

        if (foundTeam) {
          setMyTeam(foundTeam);
          setPendingTeam(null);
          // Tải phương tiện của đội
          try {
            const vehRes = await backendApi.getVehicles({ teamId: foundTeam._id });
            const rawVehicles = Array.isArray(vehRes?.data)
              ? vehRes.data
              : (vehRes?.data as any)?.vehicles || [];

            if (vehRes.success && rawVehicles.length > 0) {
              setTeamVehicles(rawVehicles);
            } else if (Array.isArray(foundTeam.vehicles) && foundTeam.vehicles.length > 0) {
              setTeamVehicles(foundTeam.vehicles);
            }
          } catch {
            if (Array.isArray(foundTeam.vehicles)) {
              setTeamVehicles(foundTeam.vehicles);
            }
          }
        } else {
          setMyTeam(null);
          setTeamVehicles([]);
          setPendingTeam(foundPendingTeam || null);
        }

        // Nếu đang mở màn Hồ sơ Đội cứu hộ, đồng bộ luôn danh sách đơn ứng tuyển & thành viên mới nhất
        if (showTeamDetailRef.current && selectedTeamIdRef.current) {
          try {
            const detailRes = await backendApi.getRescueTeamById(selectedTeamIdRef.current);
            if (detailRes.success && detailRes.data) {
              const freshTeam = detailRes.data;
              setSelectedTeamForDetail((prev) => ({
                ...(prev || {}),
                ...freshTeam,
                vehicles:
                  freshTeam.vehicles && freshTeam.vehicles.length > 0
                    ? freshTeam.vehicles
                    : prev?.vehicles || [],
              }));
            }
          } catch {
            const matched = combinedTeams.find(
              (t: any) => t._id === selectedTeamIdRef.current
            );
            if (matched) setSelectedTeamForDetail(matched);
          }
        }
      }
    } catch (err) {
      console.warn('Lỗi tải dữ liệu cứu hộ viên:', err);
    }
  }, [user?._id]);

  const onPullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    await fetchRescuerData();
    setIsRefreshing(false);
  }, [fetchRescuerData]);

  // Lắng nghe sự kiện SSE / Socket Realtime thay đổi trạng thái đội cứu hộ
  useEffect(() => {
    const subTeam = DeviceEventEmitter.addListener('team:membership_updated', (payload) => {
      console.log('⚡ [RescuerProfileOverviewScreen] Nhận sự kiện cập nhật Đội cứu hộ realtime:', payload);
      fetchRescuerData();
    });

    const subProfile = DeviceEventEmitter.addListener('user:profile_updated', () => {
      fetchRescuerData();
    });

    const subVerification = DeviceEventEmitter.addListener('rescuer:verification_status_changed', () => {
      fetchRescuerData();
    });

    return () => {
      subTeam.remove();
      subProfile.remove();
      subVerification.remove();
    };
  }, [fetchRescuerData]);

  useEffect(() => {
    fetchRescuerData();
  }, [refreshTrigger, localRefreshTrigger, fetchRescuerData]);

  // Dữ liệu thực tế từ User Profile
  const displayName = user?.fullName || 'Nhân viên cứu hộ';
  const displayPhone = user?.phone || 'Chưa cập nhật SĐT';
  const displayEmail = user?.email || 'Chưa có email';

  // Chụp ảnh bằng camera
  const handleTakePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Quyền truy cập', 'Vui lòng cấp quyền máy ảnh để chụp ảnh đại diện.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        const avatarUri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        setSelectedAvatarUrl(avatarUri);
        setAvatarSheetVisible(false);
        setAvatarPreviewVisible(true);
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể khởi động máy ảnh.');
    }
  };

  // Chọn ảnh từ thư viện
  const handleSelectFromLibrary = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Quyền truy cập', 'Vui lòng cấp quyền thư viện ảnh để đổi ảnh đại diện.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        const avatarUri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        setSelectedAvatarUrl(avatarUri);
        setAvatarSheetVisible(false);
        setAvatarPreviewVisible(true);
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể mở thư viện ảnh.');
    }
  };

  // Lưu avatar
  const handleSaveAvatar = async () => {
    if (!selectedAvatarUrl) return;
    setIsSavingAvatar(true);
    try {
      const res = await updateUserAvatar(selectedAvatarUrl);
      if (res.success) {
        setAvatarPreviewVisible(false);
        Alert.alert('Thành công', 'Đã cập nhật ảnh đại diện mới!');
      } else {
        Alert.alert('Không thể lưu', res.message || 'Lỗi lưu ảnh.');
      }
    } catch (e: any) {
      Alert.alert('Lỗi', e.message || 'Đã có lỗi xảy ra.');
    } finally {
      setIsSavingAvatar(false);
    }
  };

  // Xử lý chuyển đổi nhanh trạng thái: Ngoại tuyến <-> Sẵn sàng
  const handleToggleAvailability = async (newVal: boolean) => {
    if (availability === 'BUSY' || availability === 'ON_MISSION') {
      Alert.alert(
        'Không thể đổi trạng thái',
        'Bạn đang trong phiên làm nhiệm vụ điều động cứu hộ khẩn cấp. Vui lòng hoàn thành hoặc báo cáo chỉ huy để đổi trạng thái.'
      );
      return;
    }
    if (availability === 'SUSPENDED') {
      Alert.alert(
        'Tài khoản bị tạm đình chỉ',
        'Tài khoản của bạn đang trong trạng thái tạm đình chỉ nghiệp vụ. Vui lòng liên hệ ban quản trị để được hỗ trợ.'
      );
      return;
    }

    // Nghiệp vụ Backend Domain B: Chỉ tài khoản đã được duyệt (VERIFIED) mới được bật AVAILABLE
    if (newVal && verificationStatus !== 'VERIFIED') {
      Alert.alert(
        'Chưa được phê duyệt',
        'Hồ sơ cứu hộ viên của bạn đang trong quá trình thẩm duyệt (PENDING) bởi cơ quan chức năng. Chỉ hồ sơ đã được duyệt (VERIFIED) mới có thể chuyển sang trạng thái sẵn sàng nhận lệnh.'
      );
      return;
    }

    const targetStatus = newVal ? 'AVAILABLE' : 'OFFLINE';
    try {
      setIsUpdatingAvailability(true);
      const res = await backendApi.updateRescuerAvailability(targetStatus);
      if (res.success) {
        setAvailability(newVal ? 'READY' : 'OFFLINE');
      } else {
        Alert.alert('Không thể đổi trạng thái', res.message || 'Lỗi cập nhật trạng thái.');
      }
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể kết nối đến máy chủ.');
    } finally {
      setIsUpdatingAvailability(false);
    }
  };

  // Lấy thông tin hiển thị trạng thái tác chiến
  const getAvailabilityConfig = (status: RescuerAvailability) => {
    switch (status) {
      case 'READY':
        return {
          label: 'Sẵn sàng',
          badgeColor: '#10B981',
          bgColor: '#ECFDF5',
          borderColor: '#A7F3D0',
          desc: 'Sẵn sàng tiếp nhận lệnh điều phối cứu nạn khẩn cấp từ trung tâm chỉ huy.',
          icon: 'radio',
        };
      case 'OFFLINE':
        return {
          label: 'Ngoại tuyến',
          badgeColor: '#64748B',
          bgColor: '#F1F5F9',
          borderColor: '#CBD5E1',
          desc: 'Tạm nghỉ hoặc không trong ca trực. Hệ thống sẽ không phân công nhiệm vụ mới.',
          icon: 'moon',
        };
      case 'BUSY':
        return {
          label: 'Đang bận',
          badgeColor: '#F59E0B',
          bgColor: '#FFFBEB',
          borderColor: '#FDE68A',
          desc: 'Đang chuẩn bị trang thiết bị hoặc kiểm tra cứu hộ. Không thể tự thay đổi trạng thái.',
          icon: 'clock',
        };
      case 'ON_MISSION':
        return {
          label: 'Đang làm nhiệm vụ',
          badgeColor: '#0284C7',
          bgColor: '#F0F9FF',
          borderColor: '#BAE6FD',
          desc: 'Đang tác chiến cứu hộ tại thực địa. Trạng thái được khóa tự động bởi hệ thống tác chiến.',
          icon: 'navigation',
        };
      case 'SUSPENDED':
        return {
          label: 'Tạm đình chỉ',
          badgeColor: '#DC2626',
          bgColor: '#FEF2F2',
          borderColor: '#FECACA',
          desc: 'Tài khoản đang bị tạm đình chỉ nghiệp vụ bởi ban chỉ huy. Không thể thay đổi trạng thái.',
          icon: 'slash',
        };
    }
  };

  // Helper phân loại đội cứu hộ
  const getTeamTypeInfo = (type?: string) => {
    switch (type) {
      case 'FLOOD_RESCUE':
        return { label: 'Thủy bộ vượt lũ', color: '#0284C7', bg: '#E0F2FE', icon: 'sail-boat' };
      case 'MEDICAL_RESCUE':
        return { label: 'Y tế dã chiến', color: '#059669', bg: '#D1FAE5', icon: 'medical-bag' };
      case 'SEARCH_RESCUE':
        return { label: 'Tìm kiếm cứu nạn', color: '#D97706', bg: '#FEF3C7', icon: 'compass' };
      default:
        return { label: 'Cứu hộ vượt lũ', color: '#0284C7', bg: '#E0F2FE', icon: 'shield-account' };
    }
  };

  const isTeamInUserArea = (team: RescueTeamData) => {
    if (!userAreaName) return false;
    const userAreaLower = userAreaName.toLowerCase();
    const teamAreaLower = (team.areaId?.name || '').toLowerCase();
    const teamAuthLower = (team.authorityId?.name || '').toLowerCase();
    return (
      teamAreaLower.includes(userAreaLower) ||
      userAreaLower.includes(teamAreaLower) ||
      (teamAuthLower.length > 0 && userAreaLower.includes(teamAuthLower))
    );
  };

  const sortedTeams = useMemo(() => {
    const teams = [...allTeams];
    return teams.sort((a, b) => {
      const aInArea = isTeamInUserArea(a) ? 1 : 0;
      const bInArea = isTeamInUserArea(b) ? 1 : 0;
      return bInArea - aInArea;
    });
  }, [allTeams, userAreaName]);

  const filteredModalTeams = useMemo(() => {
    if (!teamSearchQuery.trim()) {
      return sortedTeams;
    }
    const q = teamSearchQuery.toLowerCase().trim();
    return sortedTeams.filter((team) => {
      const nameMatch = team.name.toLowerCase().includes(q);
      const areaMatch = (team.areaId?.name || '').toLowerCase().includes(q);
      const authMatch = (team.authorityId?.name || '').toLowerCase().includes(q);
      const descMatch = (team.description || '').toLowerCase().includes(q);
      return nameMatch || areaMatch || authMatch || descMatch;
    });
  }, [sortedTeams, teamSearchQuery]);

  const handleJoinTeam = (team: RescueTeamData) => {
    if (!user?._id) {
      Alert.alert('Lỗi', 'Không tìm thấy thông tin tài khoản người dùng.');
      return;
    }

    const performJoin = async () => {
      try {
        setIsJoiningTeam(team._id);
        if (myTeam && myTeam._id !== team._id) {
          if (isUserLeaderOfTeam(myTeam) && getOtherTeamMembers(myTeam).length > 0) {
            Alert.alert(
              'Yêu cầu chuyển giao Đội trưởng',
              `Bạn hiện đang là Đội trưởng của "${myTeam.name}". Bạn cần chuyển giao vai trò Đội trưởng trước khi ứng tuyển đội khác.`
            );
            return;
          }
          try {
            await backendApi.leaveRescueTeam(myTeam._id, user._id);
          } catch (e) {
            console.warn('Lỗi khi rời đội cũ:', e);
          }
        }

        const res = await backendApi.joinRescueTeam(team._id, user._id, 'MEMBER');
        setShowTeamPickerModal(false);
        setShowTeamDetailModal(false);
        setLocalRefreshTrigger((c) => c + 1);

        if (res.success) {
          Alert.alert(
            'Đã nộp đơn ứng tuyển! ⏳',
            `Đơn tham gia "${team.name}" của bạn đã được gửi thành công. Vui lòng chờ Đội trưởng hoặc Ban chỉ huy xem xét phê duyệt.`
          );
        } else {
          Alert.alert(
            'Thông báo',
            res.message || `Đơn ứng tuyển tham gia "${team.name}" đã được gửi đi.`
          );
        }
      } catch (err: any) {
        setShowTeamPickerModal(false);
        setShowTeamDetailModal(false);
        setLocalRefreshTrigger((c) => c + 1);
        const errMsg =
          err?.response?.data?.message ||
          err?.message ||
          'Có lỗi xảy ra khi nộp đơn ứng tuyển.';
        Alert.alert('Thông báo', errMsg);
      } finally {
        setIsJoiningTeam(null);
      }
    };

    if (myTeam && myTeam._id !== team._id) {
      Alert.alert(
        'Xác nhận nộp đơn đội mới',
        `Bạn hiện đang thuộc "${myTeam.name}". Nếu nộp đơn ứng tuyển vào "${team.name}", bạn sẽ rời khỏi đội hiện tại.\n\nĐơn sẽ cần sự phê duyệt của Đội trưởng đội mới hoặc Ban chỉ huy. Tiếp tục?`,
        [
          { text: 'Hủy', style: 'cancel' },
          { text: 'Nộp đơn', style: 'default', onPress: performJoin },
        ]
      );
    } else {
      Alert.alert(
        'Xác nhận ứng tuyển',
        `Bạn có muốn nộp đơn ứng tuyển tham gia "${team.name}" không?\n\nSau khi gửi, đơn sẽ cần sự xác nhận và phê duyệt của Đội trưởng hoặc Ban chỉ huy địa phương.`,
        [
          { text: 'Để sau', style: 'cancel' },
          { text: 'Nộp đơn ngay', style: 'default', onPress: performJoin },
        ]
      );
    }
  };

  const statusConfig = getAvailabilityConfig(availability);
  const isToggleDisabled =
    availability === 'BUSY' || availability === 'ON_MISSION' || availability === 'SUSPENDED';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      {/* 1. Header: RescueSOS Branding + Notification Bell */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <LogoSOS
              style={styles.brandLogo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brandTitle}>HỖ TRỢ CỨU NẠN</Text>
        </View>

        <View style={styles.headerRightRow}>
          <TouchableOpacity
            style={styles.bellButton}
            onPress={onNavigateToNotifications}
            activeOpacity={0.7}
          >
            <Feather name="bell" size={20} color="#0F172A" />
            {unreadNotificationsCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onPullToRefresh}
            colors={['#0284C7']}
            tintColor="#0284C7"
          />
        }
      >
        {/* 2. Main Profile Card (Layout nằm ngang đồng bộ với CitizenProfileOverviewScreen) */}
        <View style={styles.profileCard}>
          {/* Cột trái: Tên, SĐT, Email */}
          <View style={styles.profileInfoCol}>
            <Text style={styles.rescuerName} numberOfLines={1}>
              {displayName}
            </Text>

            <View style={styles.contactItem}>
              <Feather name="phone" size={15} color="#64748B" style={styles.contactIcon} />
              <Text style={styles.contactText} numberOfLines={1}>
                {displayPhone}
              </Text>
            </View>

            <View style={styles.contactItem}>
              <Feather name="mail" size={15} color="#64748B" style={styles.contactIcon} />
              <Text style={styles.contactText} numberOfLines={1}>
                {displayEmail}
              </Text>
            </View>
          </View>

          {/* Cột phải: Avatar đại diện tròn + nút máy ảnh */}
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={() => setAvatarSheetVisible(true)}
            activeOpacity={0.85}
          >
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitials}>
                  {displayName.slice(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.cameraBtn}>
              <Feather name="camera" size={12} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Banner nhắc nhở xác thực số điện thoại cho tài khoản Google */}
        {!user?.phone && (
          <TouchableOpacity
            style={styles.unverifiedPhoneCard}
            onPress={onNavigateToSecurity}
            activeOpacity={0.8}
          >
            <View style={styles.unverifiedPhoneIconBox}>
              <Feather name="alert-triangle" size={18} color="#D97706" />
            </View>
            <View style={styles.unverifiedPhoneTextBox}>
              <Text style={styles.unverifiedPhoneTitle}>Chưa xác thực số điện thoại</Text>
              <Text style={styles.unverifiedPhoneDesc}>
                Nhấn vào đây để xác thực SĐT qua SMS phục vụ điều phối cứu hộ
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color="#D97706" />
          </TouchableOpacity>
        )}


        {/* 3.5. Tactical Command Dashboard (Unified Operational Readiness & Rescue Team) */}
        <View style={styles.tacticalCard}>
          {/* Readiness Switch Row */}
          <View style={styles.tacticalReadinessRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.tacticalReadinessTitle}>
                {availability === 'READY' ? 'Sẵn sàng nhận lệnh cứu hộ' : 'Đang tạm dừng nhận lệnh'}
              </Text>
              <Text style={styles.tacticalReadinessDesc}>
                {availability === 'READY'
                  ? 'Hệ thống tự động điều phối các điểm báo nạn lũ lụt xung quanh bạn'
                  : 'Bật công tắc khi bạn đã sẵn sàng xuất kích thực địa'}
              </Text>
            </View>

            <Switch
              value={availability === 'READY'}
              onValueChange={handleToggleAvailability}
              disabled={isToggleDisabled || isUpdatingAvailability}
              trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
              thumbColor={availability === 'READY' ? '#10B981' : '#F1F5F9'}
              ios_backgroundColor="#CBD5E1"
            />
          </View>

          {/* Tactical Divider */}
          <View style={styles.tacticalDivider} />

          {/* Deployment Grid (2 Columns: Đơn vị tác chiến | Địa bàn hoạt động) - Tappable for details */}
          <TouchableOpacity
            style={styles.tacticalGrid}
            activeOpacity={0.75}
            onPress={() => {
              if (myTeam) {
                handleOpenTeamDetail(myTeam);
              } else if (pendingTeam) {
                handleOpenTeamDetail(pendingTeam);
              } else if (verificationStatus === 'VERIFIED') {
                setShowTeamPickerModal(true);
              }
            }}
          >
            <View style={styles.tacticalGridCol}>
              <Text style={styles.tacticalGridLabel}>
                {pendingTeam ? 'ĐƠN VỊ ỨNG TUYỂN' : 'ĐƠN VỊ TÁC CHIẾN'}
              </Text>
              <Text
                style={[
                  styles.tacticalGridValue,
                  !myTeam && !pendingTeam && { color: '#0284C7' },
                  !myTeam && pendingTeam && { color: '#D97706' },
                ]}
                numberOfLines={1}
              >
                {myTeam ? myTeam.name : pendingTeam ? pendingTeam.name : 'Chưa gia nhập đội'}
              </Text>
              <Text style={styles.tacticalGridSub} numberOfLines={1}>
                {myTeam
                  ? `Quân số: ${getApprovedMembers(myTeam).length || 1} chiến sĩ`
                  : pendingTeam
                  ? '⏳ Đang chờ Đội trưởng duyệt'
                  : 'Lực lượng xung kích lũ lụt'}
              </Text>
            </View>

            <View style={styles.tacticalGridDivider} />

            <View style={styles.tacticalGridCol}>
              <Text style={styles.tacticalGridLabel}>ĐỊA BÀN HOẠT ĐỘNG</Text>
              <Text style={styles.tacticalGridValue} numberOfLines={1}>
                {myTeam?.areaId?.name || pendingTeam?.areaId?.name || userAreaName || 'Đà Nẵng'}
              </Text>
              <Text style={styles.tacticalGridSub} numberOfLines={1}>
                {myTeam
                  ? `Đội trưởng: ${myTeam.leaderId?.fullName || 'Chưa cập nhật'}`
                  : pendingTeam
                  ? `Đội trưởng: ${pendingTeam.leaderId?.fullName || 'Chưa cập nhật'}`
                  : `${allTeams.length} đội sẵn sàng`}
              </Text>
            </View>

            <View style={styles.tacticalGridChevron}>
              <Feather name="chevron-right" size={16} color="#0284C7" />
            </View>
          </TouchableOpacity>


          {/* Alert row only shown to Team Leader when there are pending applicants */}
          {myTeam && (() => {
            const leaderPendingCount = isUserLeaderOfTeam(myTeam)
              ? (myTeam.members || []).filter((m: any) => m.status === 'PENDING').length
              : 0;
            if (leaderPendingCount <= 0) return null;
            return (
              <TouchableOpacity
                style={[
                  styles.tacticalDetailHintRow,
                  {
                    backgroundColor: '#FFFBEB',
                    borderColor: '#FDE68A',
                  },
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  handleOpenTeamDetail(myTeam);
                }}
              >
                <Feather name="user-plus" size={12} color="#D97706" />
                <Text
                  style={[
                    styles.tacticalDetailHintText,
                    { color: '#B45309', fontWeight: '700' },
                  ]}
                >
                  {`Có ${leaderPendingCount} đơn ứng tuyển chờ duyệt — Nhấn để xem & duyệt`}
                </Text>
                <Feather name="chevron-right" size={12} color="#D97706" />
              </TouchableOpacity>
            );
          })()}

          {/* Button: Chờ duyệt (khi đang có đơn ứng tuyển chờ xử lý) */}
          {!myTeam && pendingTeam ? (
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => handleOpenTeamDetail(pendingTeam)}
              style={{ marginTop: 12 }}
            >
              <LinearGradient
                colors={['#F59E0B', '#D97706']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.tacticalPrimaryBtn, { shadowColor: '#D97706' }]}
              >
                <Feather name="clock" size={15} color="#FFFFFF" />
                <Text style={styles.tacticalPrimaryBtnText}>Chờ duyệt</Text>
                <Feather name="chevron-right" size={15} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          ) : null}

          {/* Action Button: Apply Team if not yet joined and not pending */}
          {!myTeam && !pendingTeam && verificationStatus === 'VERIFIED' ? (
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setShowTeamPickerModal(true)}
              style={{ marginTop: 12 }}
            >
              <LinearGradient
                colors={['#0066FF', '#1D4ED8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.tacticalPrimaryBtn}
              >
                <Feather name="user-plus" size={15} color="#FFFFFF" />
                <Text style={styles.tacticalPrimaryBtnText}>
                  Ứng tuyển gia nhập Đội tác chiến ({allTeams.length})
                </Text>
                <Feather name="arrow-right" size={15} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          ) : !myTeam && !pendingTeam && verificationStatus !== 'VERIFIED' ? (
            <View style={styles.tacticalPendingBox}>
              <MaterialCommunityIcons name="timer-sand" size={15} color="#D97706" />
              <Text style={styles.tacticalPendingText}>
                Hồ sơ đang chờ cơ quan địa phương thẩm định để mở ứng tuyển đội
              </Text>
            </View>
          ) : null}
        </View>

        {/* 4. Menu Items */}
        <View style={styles.menuCard}>

          {/* Item 1: Lịch sử báo nạn (SOS History) */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={onNavigateToSosHistory}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconBox, { backgroundColor: '#FEF2F2' }]}>
              <Feather name="clock" size={18} color="#DC2626" />
            </View>
            <View style={styles.menuTextBox}>
              <Text style={styles.menuTitle}>Lịch sử báo nạn</Text>
              <Text style={styles.menuDesc}>Xem các yêu cầu SOS cá nhân bạn đã gửi</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          {/* Item 1: Thông tin cá nhân */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={onNavigateToEditProfile}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconBox, { backgroundColor: '#F0F9FF' }]}>
              <Feather name="user" size={18} color="#0284C7" />
            </View>
            <View style={styles.menuTextBox}>
              <Text style={styles.menuTitle}>Thông tin cá nhân</Text>
              <Text style={styles.menuDesc}>Họ tên, ngày sinh, địa chỉ thường trú</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          {/* Item 2: Hồ sơ chuyên môn */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={onNavigateToProfessional}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconBox, { backgroundColor: '#ECFDF5' }]}>
              <Feather name="award" size={18} color="#059669" />
            </View>
            <View style={styles.menuTextBox}>
              <Text style={styles.menuTitle}>Hồ sơ chuyên môn</Text>
              <Text style={styles.menuDesc}>Kỹ năng, phương tiện, địa bàn tác chiến</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          {/* Item 3: Bảo mật tài khoản */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={onNavigateToSecurity}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconBox, { backgroundColor: '#F8FAFC' }]}>
              <Feather name="shield" size={18} color="#475569" />
            </View>
            <View style={styles.menuTextBox}>
              <Text style={styles.menuTitle}>Bảo mật tài khoản</Text>
              <Text style={styles.menuDesc}>Mật khẩu đăng nhập & phiên làm việc</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          {/* Item 4: Cài đặt thông báo */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={onNavigateToNotificationSettings}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconBox, { backgroundColor: '#FFFBEB' }]}>
              <Feather name="bell" size={18} color="#D97706" />
            </View>
            <View style={styles.menuTextBox}>
              <Text style={styles.menuTitle}>Cài đặt thông báo</Text>
              <Text style={styles.menuDesc}>Cảnh báo SOS, vị trí an toàn, tin tức</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* 5. Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => setLogoutDialogVisible(true)}
          activeOpacity={0.8}
        >
          <Feather name="log-out" size={16} color="#0066FF" />
          <Text style={styles.logoutButtonText}>Đăng xuất tài khoản</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal: Chọn nhanh 5 trạng thái tác chiến */}
      <Modal
        visible={showStatusPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusPicker(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowStatusPicker(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.statusPickerCard}>
                <View style={styles.statusPickerHeader}>
                  <Text style={styles.statusPickerTitle}>Chọn trạng thái tác chiến</Text>
                  <TouchableOpacity
                    onPress={() => setShowStatusPicker(false)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {(['READY', 'OFFLINE', 'BUSY', 'ON_MISSION', 'SUSPENDED'] as RescuerAvailability[]).map(
                  (st) => {
                    const cfg = getAvailabilityConfig(st);
                    const isSelected = availability === st;
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[
                          styles.statusPickerItem,
                          isSelected && {
                            backgroundColor: cfg.bgColor,
                            borderColor: cfg.borderColor,
                            borderWidth: 1.5,
                          },
                        ]}
                        onPress={() => {
                          setAvailability(st);
                          setShowStatusPicker(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.statusPickerItemLeft}>
                          <View
                            style={[
                              styles.statusPickerItemDot,
                              { backgroundColor: cfg.badgeColor },
                            ]}
                          />
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.statusPickerItemLabel,
                                isSelected && { color: cfg.badgeColor, fontWeight: '800' },
                              ]}
                            >
                              {cfg.label}
                            </Text>
                            <Text style={styles.statusPickerItemDesc} numberOfLines={2}>
                              {cfg.desc}
                            </Text>
                          </View>
                        </View>
                        {isSelected && (
                          <Feather name="check" size={18} color={cfg.badgeColor} />
                        )}
                      </TouchableOpacity>
                    );
                  }
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Sheet: Chọn cách đổi ảnh đại diện */}
      <Modal
        visible={avatarSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarSheetVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setAvatarSheetVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.bottomSheetCard}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>Ảnh đại diện</Text>
                <Text style={styles.sheetSubtitle}>Chọn phương thức tải ảnh mới</Text>

                <TouchableOpacity
                  style={styles.sheetOption}
                  onPress={handleTakePhoto}
                  activeOpacity={0.7}
                >
                  <View style={[styles.sheetOptionIcon, { backgroundColor: '#F0FDF4' }]}>
                    <Feather name="camera" size={18} color="#16A34A" />
                  </View>
                  <View style={styles.sheetOptionTextCol}>
                    <Text style={styles.sheetOptionLabel}>Chụp ảnh mới</Text>
                    <Text style={styles.sheetOptionDesc}>Sử dụng máy ảnh của thiết bị</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetOption}
                  onPress={handleSelectFromLibrary}
                  activeOpacity={0.7}
                >
                  <View style={[styles.sheetOptionIcon, { backgroundColor: '#EFF6FF' }]}>
                    <Feather name="image" size={18} color="#2563EB" />
                  </View>
                  <View style={styles.sheetOptionTextCol}>
                    <Text style={styles.sheetOptionLabel}>Chọn từ thư viện</Text>
                    <Text style={styles.sheetOptionDesc}>Tải ảnh sẵn có từ thiết bị</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetCancelBtn}
                  onPress={() => setAvatarSheetVisible(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sheetCancelText}>Hủy</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Modal: Xem trước & Xác nhận lưu ảnh đại diện */}
      <Modal
        visible={avatarPreviewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarPreviewVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.previewDialogCard}>
            <Text style={styles.previewDialogTitle}>Xem trước ảnh đại diện</Text>
            <Text style={styles.previewDialogSubtitle}>
              Ảnh này sẽ hiển thị trên hệ thống điều phối cứu hộ
            </Text>

            {selectedAvatarUrl && (
              <Image source={{ uri: selectedAvatarUrl }} style={styles.previewDialogImage} />
            )}

            <View style={styles.dialogActionsRow}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                onPress={() => setAvatarPreviewVisible(false)}
                disabled={isSavingAvatar}
                activeOpacity={0.8}
              >
                <Text style={styles.dialogCancelText}>Hủy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dialogConfirmBtn, isSavingAvatar && { opacity: 0.7 }]}
                onPress={handleSaveAvatar}
                disabled={isSavingAvatar}
                activeOpacity={0.85}
              >
                {isSavingAvatar ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.dialogConfirmText}>Lưu ảnh</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Xác nhận Đăng xuất */}
      <Modal
        visible={logoutDialogVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutDialogVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmDialogCard}>
            <View style={styles.alertIconWrap}>
              <Feather name="log-out" size={24} color="#0066FF" />
            </View>
            <Text style={styles.confirmDialogTitle}>Đăng xuất khỏi tài khoản?</Text>
            <Text style={styles.confirmDialogSubtitle}>
              Bạn sẽ tạm ngưng tiếp nhận lệnh điều động trực tiếp từ trung tâm chỉ huy SOS cho đến khi đăng nhập lại.
            </Text>

            <View style={styles.dialogActionsRow}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                onPress={() => setLogoutDialogVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.dialogCancelText}>Ở lại</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.logoutConfirmBtn}
                onPress={async () => {
                  setLogoutDialogVisible(false);
                  await logout();
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.logoutConfirmText}>Đăng xuất</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal gộp: Danh sách & Chi tiết Đội cứu hộ (1 Modal duy nhất để tránh lỗi iOS kẹt Modal chồng nhau) */}
      <Modal
        visible={showTeamPickerModal || (showTeamDetailModal && !!selectedTeamForDetail)}
        transparent={false}
        animationType="slide"
        onRequestClose={() => {
          if (showTeamDetailModal) {
            setShowTeamDetailModal(false);
          } else {
            setShowTeamPickerModal(false);
          }
        }}
        statusBarTranslucent={true}
      >
        <View style={{ flex: 1 }}>
          {showTeamPickerModal && (
            <View style={styles.teamModalContainer}>
          <StatusBar barStyle="dark-content" />

          {/* Header Modal */}
          <View style={[styles.teamModalHeader, { paddingTop: topSafeInset }]}>
            <TouchableOpacity
              style={styles.teamModalCloseBtn}
              onPress={() => setShowTeamPickerModal(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <Feather name="arrow-left" size={22} color="#0F172A" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.teamModalTitle}>Danh sách Đội cứu hộ & Ứng tuyển</Text>
              <Text style={styles.teamModalSubtitle} numberOfLines={1}>
                Xem chi tiết và ứng tuyển các Đội tại địa bàn {userAreaName || 'của bạn'}
              </Text>
            </View>
          </View>

          {/* Search Bar */}
          <View style={styles.teamSearchBox}>
            <Feather name="search" size={16} color="#64748B" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.teamSearchInput}
              placeholder="Tìm theo tên đội, phường/xã, cơ quan..."
              placeholderTextColor="#94A3B8"
              value={teamSearchQuery}
              onChangeText={setTeamSearchQuery}
              clearButtonMode="while-editing"
            />
            {teamSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setTeamSearchQuery('')}>
                <Feather name="x-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Teams List */}
          <ScrollView
            style={styles.teamModalList}
            contentContainerStyle={styles.teamModalListContent}
            showsVerticalScrollIndicator={false}
          >
            {filteredModalTeams.length === 0 ? (
              <View style={styles.emptyTeamsBox}>
                <MaterialCommunityIcons name="account-search-outline" size={40} color="#94A3B8" />
                <Text style={styles.emptyTeamsTitle}>Không tìm thấy Đội cứu hộ phù hợp</Text>
                <Text style={styles.emptyTeamsDesc}>
                  Thử tìm kiếm với tên đội hoặc địa bàn khác.
                </Text>
              </View>
            ) : (
              filteredModalTeams.map((team) => {
                const typeInfo = getTeamTypeInfo(team.type);
                const isNearby = isTeamInUserArea(team);
                const isCurrentTeam = myTeam?._id === team._id;
                const isPendingThisTeam = isUserPendingInTeam(team);
                const isLoadingThis = isJoiningTeam === team._id;

                return (
                  <TouchableOpacity
                    key={team._id}
                    style={[
                      styles.modalTeamCard,
                      isCurrentTeam && styles.modalTeamCardCurrent,
                      isPendingThisTeam && styles.modalTeamCardPending,
                    ]}
                    activeOpacity={0.88}
                    onPress={() => {
                      handleOpenTeamDetail(team);
                    }}
                  >
                    {/* Header: Icon + Name + Type Tag */}
                    <View style={styles.matrixCardHeader}>
                      <View style={[styles.matrixTypeIconBox, { backgroundColor: typeInfo.bg }]}>
                        <MaterialCommunityIcons
                          name={typeInfo.icon as any}
                          size={18}
                          color={typeInfo.color}
                        />
                      </View>

                      <View style={{ flex: 1, marginRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={styles.modalTeamName}>{team.name}</Text>
                          {isCurrentTeam && (
                            <View style={styles.currentTeamBadge}>
                              <Text style={styles.currentTeamBadgeText}>Đang tham gia</Text>
                            </View>
                          )}
                          {isPendingThisTeam && (
                            <View style={styles.pendingTeamBadge}>
                              <Text style={styles.pendingTeamBadgeText}>⏳ Đang chờ duyệt</Text>
                            </View>
                          )}
                          {isNearby && !isCurrentTeam && !isPendingThisTeam && (
                            <View style={styles.nearbyBadge}>
                              <Text style={styles.nearbyBadgeText}>⭐ Địa bàn của bạn</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.modalTeamArea} numberOfLines={1}>
                          Cơ quan: {team.authorityId?.name || 'Ban Chỉ huy PCTT địa phương'}
                        </Text>
                      </View>

                      <View style={[styles.teamItemTypeTag, { backgroundColor: typeInfo.bg }]}>
                        <Text style={[styles.teamItemTypeTagText, { color: typeInfo.color }]}>
                          {typeInfo.label}
                        </Text>
                      </View>
                    </View>

                    {/* Squad Matrix 3-Column Grid */}
                    <View style={styles.matrixGridContainer}>
                      <View style={styles.matrixGridCol}>
                        <View style={styles.matrixGridLabelRow}>
                          <Feather name="map-pin" size={10} color="#0284C7" />
                          <Text style={styles.matrixGridLabel}>ĐỊA BÀN</Text>
                        </View>
                        <Text style={styles.matrixGridVal} numberOfLines={1}>
                          {team.areaId?.name || 'Toàn thành phố'}
                        </Text>
                      </View>

                      <View style={[styles.matrixGridCol, { flex: 1.15 }]}>
                        <View style={styles.matrixGridLabelRow}>
                          <Feather name="user-check" size={10} color="#059669" />
                          <Text style={styles.matrixGridLabel}>CHỈ HUY</Text>
                        </View>
                        <Text style={styles.matrixGridVal} numberOfLines={1}>
                          {team.leaderId?.fullName || 'Chưa cập nhật'}
                        </Text>
                      </View>

                      <View style={[styles.matrixGridCol, { borderRightWidth: 0, flex: 0.95 }]}>
                        <View style={styles.matrixGridLabelRow}>
                          <Feather name="users" size={10} color="#7C3AED" />
                          <Text style={styles.matrixGridLabel}>QUÂN SỐ</Text>
                        </View>
                        <Text style={styles.matrixGridVal} numberOfLines={1}>
                          {getApprovedMembers(team).length || 1} chiến sĩ
                        </Text>
                      </View>
                    </View>

                    {/* Description Briefing */}
                    {team.description ? (
                      <View style={styles.matrixDescBox}>
                        <Feather name="info" size={11} color="#64748B" style={{ marginTop: 2 }} />
                        <Text style={styles.matrixDescText} numberOfLines={2}>
                          {team.description}
                        </Text>
                      </View>
                    ) : null}

                    {/* Footer: Detail Hint & Action Button */}
                    <View style={styles.modalTeamFooter}>
                      <View style={styles.matrixDetailHint}>
                        <Text style={styles.matrixDetailHintText}>Xem hồ sơ đội</Text>
                        <Feather name="chevron-right" size={13} color="#0066FF" />
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.modalJoinBtn,
                          isCurrentTeam && styles.modalJoinBtnDisabled,
                          isPendingThisTeam && styles.modalJoinBtnPending,
                          isLoadingThis && { opacity: 0.7 },
                        ]}
                        onPress={() => {
                          if (isCurrentTeam) return;
                          if (isPendingThisTeam) {
                            handleCancelApplication(team);
                          } else {
                            handleJoinTeam(team);
                          }
                        }}
                        disabled={isCurrentTeam || isLoadingThis}
                        activeOpacity={0.8}
                      >
                        {isLoadingThis ? (
                          <ActivityIndicator size="small" color={isPendingThisTeam ? '#B45309' : '#FFFFFF'} />
                        ) : isCurrentTeam ? (
                          <>
                            <Feather name="check" size={13} color="#059669" />
                            <Text style={styles.modalJoinBtnTextCurrent}>Đang trực thuộc</Text>
                          </>
                        ) : isPendingThisTeam ? (
                          <>
                            <Feather name="clock" size={13} color="#B45309" />
                            <Text style={styles.modalJoinBtnTextPending}>Chờ duyệt</Text>
                          </>
                        ) : (
                          <>
                            <Feather name="plus" size={13} color="#FFFFFF" />
                            <Text style={styles.modalJoinBtnText}>Ứng tuyển</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
            </ScrollView>
          </View>
          )}

          {/* Chi tiết Đội cứu hộ tác chiến (hiển thị ngay trong cùng Modal) */}
          {showTeamDetailModal && selectedTeamForDetail && (
            <View
              style={[
                styles.teamModalContainer,
                styles.teamDetailCanvas,
                showTeamPickerModal && StyleSheet.absoluteFill,
                { zIndex: 20 },
              ]}
            >
            <StatusBar barStyle="dark-content" />

            {/* Header Modal */}
            <View style={[styles.teamModalHeader, { paddingTop: topSafeInset }]}>
              <TouchableOpacity
                style={styles.teamModalCloseBtn}
                onPress={() => setShowTeamDetailModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
              >
                <Feather name="arrow-left" size={22} color="#0F172A" />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.teamModalTitle}>Hồ sơ Đội cứu hộ</Text>
                <Text style={styles.teamModalSubtitle} numberOfLines={1}>
                  {isUserLeaderOfTeam(selectedTeamForDetail)
                    ? 'Quản lý đơn vị & phê duyệt thành viên'
                    : 'Thông tin chi tiết đơn vị tác chiến'}
                </Text>
              </View>
              {selectedTeamForDetail._id === myTeam?._id && (
                <TouchableOpacity
                  style={styles.teamHeaderLeaveBtn}
                  onPress={() => handleLeaveTeam(selectedTeamForDetail)}
                  activeOpacity={0.7}
                >
                  <Feather name="log-out" size={14} color="#DC2626" />
                  <Text style={styles.teamHeaderLeaveBtnText}>
                    {isUserLeaderOfTeam(selectedTeamForDetail) ? 'Bàn giao / Rời' : 'Rời đội'}
                  </Text>
                </TouchableOpacity>
              )}
              {isUserPendingInTeam(selectedTeamForDetail) && (
                <TouchableOpacity
                  style={styles.teamHeaderCancelBtn}
                  onPress={() => handleCancelApplication(selectedTeamForDetail)}
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={14} color="#DC2626" />
                  <Text style={styles.teamHeaderCancelBtnText}>Rút đơn</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              {(() => {
                const isLeader = isUserLeaderOfTeam(selectedTeamForDetail);
                const isPendingSelf = isUserPendingInTeam(selectedTeamForDetail);
                const typeInfo = getTeamTypeInfo(selectedTeamForDetail.type);
                const pendingApplicants = (selectedTeamForDetail.members || []).filter(
                  (m: any) => m.status === 'PENDING'
                );
                const rosterMembers = getRosterMembers(selectedTeamForDetail);
                const leaderIdStr = (
                  selectedTeamForDetail.leaderId?._id || selectedTeamForDetail.leaderId
                )?.toString();
                const vehiclesList =
                  Array.isArray(selectedTeamForDetail.vehicles) &&
                  selectedTeamForDetail.vehicles.length > 0
                    ? selectedTeamForDetail.vehicles
                    : selectedTeamForDetail._id === myTeam?._id &&
                      Array.isArray(teamVehicles) &&
                      teamVehicles.length > 0
                    ? teamVehicles
                    : [];

                return (
                  <>
                    {/* Banner: Đang chờ duyệt nếu người dùng đang có đơn chờ */}
                    {isPendingSelf && (
                      <View style={styles.teamDetailPendingBanner}>
                        <Feather name="clock" size={18} color="#D97706" />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.teamDetailPendingBannerTitle}>
                            ĐƠN ỨNG TUYỂN ĐANG CHỜ PHÊ DUYỆT
                          </Text>
                          <Text style={styles.teamDetailPendingBannerText}>
                            Đơn tham gia của bạn đã được chuyển tới Đội trưởng. Vui lòng chờ xem xét duyệt vào danh sách thành viên.
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Compact Hero Inset Card */}
                    <View style={styles.teamDetailHeroCard}>
                      <View style={[styles.teamDetailHeroIcon, { backgroundColor: typeInfo.bg }]}>
                        <MaterialCommunityIcons
                          name={typeInfo.icon as any}
                          size={24}
                          color={typeInfo.color}
                        />
                      </View>
                      <View style={styles.teamDetailHeroContent}>
                        <Text style={styles.teamDetailHeroName} numberOfLines={2}>
                          {selectedTeamForDetail.name}
                        </Text>
                        <View style={styles.teamDetailBadgeRow}>
                          <View style={styles.teamDetailTypeBadge}>
                            <Text style={styles.teamDetailTypeBadgeText}>{typeInfo.label}</Text>
                          </View>
                          <View style={styles.teamDetailStatusInline}>
                            <View
                              style={[
                                styles.teamDetailStatusDot,
                                {
                                  backgroundColor:
                                    selectedTeamForDetail.status === 'ACTIVE' ? '#10B981' : '#F59E0B',
                                },
                              ]}
                            />
                            <Text
                              style={[
                                styles.teamDetailStatusText,
                                {
                                  color:
                                    selectedTeamForDetail.status === 'ACTIVE' ? '#059669' : '#B45309',
                                },
                              ]}
                            >
                              {selectedTeamForDetail.status === 'ACTIVE' ? 'Đang hoạt động' : 'Tạm dừng'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Ưu tiên trên cùng cho Đội trưởng khi có đơn ứng tuyển chờ duyệt */}
                    {isLeader && pendingApplicants.length > 0 && (
                      <View style={styles.teamDetailSection}>
                        <View style={styles.teamDetailSectionTitleRow}>
                          <Text style={[styles.teamDetailSectionTitle, { marginBottom: 0 }]}>
                            ĐƠN ỨNG TUYỂN CHỜ DUYỆT ({pendingApplicants.length})
                          </Text>
                          <View style={styles.pendingCountBadge}>
                            <Text style={styles.pendingCountBadgeText}>
                              {pendingApplicants.length} mới
                            </Text>
                          </View>
                        </View>

                        <View style={styles.pendingApplicantsList}>
                          {pendingApplicants.map((applicant: any, idx: number) => {
                            const rescuerObj =
                              typeof applicant.rescuerId === 'object' ? applicant.rescuerId : null;
                            const rescuerIdStr = (rescuerObj?._id || applicant.rescuerId)?.toString();
                            const isThisProcessing = isProcessingMember === rescuerIdStr;
                            const applicantName =
                              rescuerObj?.fullName || `Cứu hộ viên #${rescuerIdStr?.slice(-4)}`;
                            const applicantPhone = rescuerObj?.phone || 'Chưa cập nhật SĐT';
                            const applicantAvatar = rescuerObj?.avatarUrl;
                            const initials = getNameInitials(applicantName);
                            const rawApplicantSkills: string[] = Array.isArray(
                              rescuerObj?.rescuer?.skills
                            )
                              ? rescuerObj.rescuer.skills
                              : [];
                            const skillSummary = rawApplicantSkills
                              .map((s) => APPLICANT_SKILL_LABELS[s] || s)
                              .join(', ');
                            const submittedDate = applicant.joinedAt
                              ? new Date(applicant.joinedAt).toLocaleDateString('vi-VN', {
                                  day: '2-digit',
                                  month: '2-digit',
                                })
                              : '';

                            return (
                              <React.Fragment key={applicant._id || rescuerIdStr || idx}>
                                {idx > 0 && <View style={styles.teamDetailRowDivider} />}
                                <View style={styles.applicantCard}>
                                  <View style={styles.applicantAvatarBox}>
                                    {applicantAvatar ? (
                                      <Image
                                        source={{ uri: applicantAvatar }}
                                        style={styles.applicantAvatarImg}
                                      />
                                    ) : (
                                      <Text style={styles.applicantAvatarInitials}>{initials}</Text>
                                    )}
                                  </View>

                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.applicantName} numberOfLines={1}>
                                      {applicantName}
                                    </Text>
                                    <Text style={styles.applicantMetaText} numberOfLines={1}>
                                      {applicantPhone}
                                      {submittedDate ? ` • ${submittedDate}` : ''}
                                    </Text>
                                    {skillSummary ? (
                                      <Text style={styles.applicantSkillsText} numberOfLines={1}>
                                        {skillSummary}
                                      </Text>
                                    ) : null}
                                  </View>

                                  <View style={styles.applicantActionRow}>
                                    <TouchableOpacity
                                      style={[
                                        styles.applicantRejectCircleBtn,
                                        isThisProcessing && { opacity: 0.5 },
                                      ]}
                                      onPress={() =>
                                        !isThisProcessing && handleRejectApplicant(applicant)
                                      }
                                      disabled={isThisProcessing}
                                      activeOpacity={0.75}
                                      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                                      accessibilityLabel={`Từ chối ${applicantName}`}
                                    >
                                      <Feather name="x" size={17} color="#DC2626" />
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                      style={[
                                        styles.applicantApproveCircleBtn,
                                        isThisProcessing && { opacity: 0.6 },
                                      ]}
                                      onPress={() =>
                                        !isThisProcessing && handleApproveApplicant(applicant)
                                      }
                                      disabled={isThisProcessing}
                                      activeOpacity={0.8}
                                      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                                      accessibilityLabel={`Duyệt ${applicantName}`}
                                    >
                                      {isThisProcessing ? (
                                        <ActivityIndicator size="small" color="#FFFFFF" />
                                      ) : (
                                        <Feather name="check" size={17} color="#FFFFFF" />
                                      )}
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              </React.Fragment>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {/* Section 1: Thông tin đơn vị hợp nhất (Inset Grouped) */}
                    <View style={styles.teamDetailSection}>
                      <Text style={styles.teamDetailSectionTitle}>THÔNG TIN ĐƠN VỊ</Text>
                      <View style={styles.teamDetailInfoCard}>
                        {/* Row: Chỉ huy trưởng */}
                        <View style={styles.teamDetailInfoItem}>
                          <View style={styles.teamDetailInfoIconBox}>
                            <Feather name="user-check" size={15} color="#475569" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.teamDetailInfoLabel}>Chỉ huy trưởng</Text>
                            <Text style={styles.teamDetailInfoValue}>
                              {selectedTeamForDetail.leaderId?.fullName || 'Chưa cập nhật chỉ huy'}
                            </Text>
                            {selectedTeamForDetail.leaderId?.phone ? (
                              <Text style={styles.teamDetailInfoSubValue}>
                                SĐT: {selectedTeamForDetail.leaderId.phone}
                              </Text>
                            ) : null}
                          </View>
                          {isLeader ? (
                            <View style={styles.teamSelfBadge}>
                              <Text style={styles.teamSelfBadgeText}>Bạn</Text>
                            </View>
                          ) : selectedTeamForDetail.leaderId?.phone ? (
                            <TouchableOpacity
                              style={styles.teamDetailCallBtn}
                              onPress={() => handleCallLeader(selectedTeamForDetail.leaderId?.phone)}
                              activeOpacity={0.8}
                            >
                              <Feather name="phone-call" size={13} color="#FFFFFF" />
                              <Text style={styles.teamDetailCallBtnText}>Gọi</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>

                        <View style={styles.teamDetailInfoDivider} />

                        {/* Row: Địa bàn phụ trách */}
                        <View style={styles.teamDetailInfoItem}>
                          <View style={styles.teamDetailInfoIconBox}>
                            <Feather name="map-pin" size={15} color="#475569" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.teamDetailInfoLabel}>Địa bàn phụ trách</Text>
                            <Text style={styles.teamDetailInfoValue}>
                              {selectedTeamForDetail.areaId?.name || userAreaName || 'Đà Nẵng'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.teamDetailInfoDivider} />

                        {/* Row: Cơ quan quản lý */}
                        <View style={styles.teamDetailInfoItem}>
                          <View style={styles.teamDetailInfoIconBox}>
                            <Feather name="shield" size={15} color="#475569" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.teamDetailInfoLabel}>Cơ quan chỉ đạo trực tiếp</Text>
                            <Text style={styles.teamDetailInfoValue}>
                              {selectedTeamForDetail.authorityId?.name ||
                                'Ban Chỉ huy PCTT & TKCN địa phương'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.teamDetailInfoDivider} />

                        {/* Row: Nhiệm vụ tác chiến */}
                        <View style={[styles.teamDetailInfoItem, { alignItems: 'flex-start' }]}>
                          <View style={[styles.teamDetailInfoIconBox, { marginTop: 2 }]}>
                            <Feather name="file-text" size={15} color="#475569" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.teamDetailInfoLabel}>Nhiệm vụ tác chiến</Text>
                            <Text style={styles.teamDetailDescText}>
                              {selectedTeamForDetail.description ||
                                'Đơn vị cơ động xung kích chuyên trách tìm kiếm, cứu hộ, di dời người dân khỏi vùng ngập lũ sâu, cô lập và vận chuyển nhu yếu phẩm y tế khẩn cấp.'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Section 2: Thành viên đội */}
                    <View style={styles.teamDetailSection}>
                      <Text style={styles.teamDetailSectionTitle}>
                        THÀNH VIÊN ĐỘI ({rosterMembers.length})
                      </Text>
                      <View style={styles.teamDetailInfoCard}>
                        {rosterMembers.length === 0 ? (
                          <Text style={styles.teamDetailMutedEmptyText}>
                            Chưa có danh sách thành viên chính thức.
                          </Text>
                        ) : (
                          rosterMembers.map((member: any, idx: number) => {
                            const rObj =
                              typeof member.rescuerId === 'object' ? member.rescuerId : null;
                            const rIdStr = (rObj?._id || member.rescuerId)?.toString();
                            const isRowLeader =
                              member.role === 'LEADER' ||
                              (!!leaderIdStr && !!rIdStr && rIdStr === leaderIdStr);
                            const isSelf = isSameAccountAsCurrentUser(rObj || rIdStr);
                            const memberName =
                              rObj?.fullName ||
                              (isRowLeader && selectedTeamForDetail.leaderId?.fullName) ||
                              `Thành viên #${rIdStr?.slice(-4) || idx + 1}`;
                            const memberPhone =
                              rObj?.phone ||
                              (isRowLeader ? selectedTeamForDetail.leaderId?.phone : undefined);
                            const memberAvatar = rObj?.avatarUrl;

                            return (
                              <React.Fragment key={member._id || rIdStr || idx}>
                                {idx > 0 && <View style={styles.teamDetailRowDivider} />}
                                <View style={styles.memberRow}>
                                  <View
                                    style={[
                                      styles.memberAvatarCircle,
                                      isRowLeader && styles.memberAvatarCircleLeader,
                                    ]}
                                  >
                                    {memberAvatar ? (
                                      <Image
                                        source={{ uri: memberAvatar }}
                                        style={styles.memberAvatarImg}
                                      />
                                    ) : (
                                      <Text
                                        style={[
                                          styles.memberAvatarInitials,
                                          isRowLeader && { color: '#1D4ED8' },
                                        ]}
                                      >
                                        {getNameInitials(memberName)}
                                      </Text>
                                    )}
                                  </View>

                                  <View style={{ flex: 1 }}>
                                    <View style={styles.memberNameRow}>
                                      <Text style={styles.memberName} numberOfLines={1}>
                                        {memberName}
                                      </Text>
                                      {isSelf && (
                                        <View style={styles.teamSelfBadge}>
                                          <Text style={styles.teamSelfBadgeText}>Bạn</Text>
                                        </View>
                                      )}
                                    </View>
                                    <Text style={styles.memberSubText} numberOfLines={1}>
                                      {memberPhone || 'Chưa cập nhật SĐT'}
                                    </Text>
                                  </View>

                                  <View style={styles.memberRightGroup}>
                                    <View
                                      style={[
                                        styles.memberRoleBadge,
                                        isRowLeader
                                          ? styles.memberRoleBadgeLeader
                                          : styles.memberRoleBadgeDefault,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.memberRoleText,
                                          isRowLeader
                                            ? styles.memberRoleTextLeader
                                            : styles.memberRoleTextDefault,
                                        ]}
                                      >
                                        {isRowLeader ? 'Đội trưởng' : 'Thành viên'}
                                      </Text>
                                    </View>

                                    {!isSelf && memberPhone ? (
                                      <TouchableOpacity
                                        style={styles.memberCallCircleBtn}
                                        onPress={() => handleCallLeader(memberPhone)}
                                        activeOpacity={0.75}
                                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                                      >
                                        <Feather name="phone" size={14} color="#059669" />
                                      </TouchableOpacity>
                                    ) : null}
                                  </View>
                                </View>
                              </React.Fragment>
                            );
                          })
                        )}
                      </View>
                    </View>

                    {/* Section 3: Phương tiện trang bị */}
                    <View style={styles.teamDetailSection}>
                      <Text style={styles.teamDetailSectionTitle}>
                        PHƯƠNG TIỆN TRANG BỊ ({vehiclesList.length})
                      </Text>

                      {vehiclesList.length > 0 ? (
                        <View style={styles.teamDetailInfoCard}>
                          {vehiclesList.map((v, idx) => (
                            <React.Fragment key={v._id || idx}>
                              {idx > 0 && <View style={styles.teamDetailRowDivider} />}
                              <View style={styles.teamDetailVehicleRow}>
                                <View style={styles.teamDetailVehicleIcon}>
                                  <MaterialCommunityIcons
                                    name={
                                      v.type === 'BOAT'
                                        ? 'ferry'
                                        : v.type === 'AMBULANCE'
                                        ? 'ambulance'
                                        : 'car'
                                    }
                                    size={18}
                                    color="#475569"
                                  />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.teamDetailVehicleName}>
                                    {v.type === 'BOAT'
                                      ? 'Ca-nô / Xuồng máy vượt lũ'
                                      : v.type === 'AMBULANCE'
                                      ? 'Xe cứu thương dã chiến'
                                      : 'Xe tải lội nước chuyên dụng'}
                                  </Text>
                                  <Text style={styles.teamDetailVehiclePlate}>
                                    Biển số:{' '}
                                    <Text style={{ fontWeight: '700', color: '#0F172A' }}>
                                      {v.plateNumber}
                                    </Text>
                                  </Text>
                                  {v.description ? (
                                    <Text style={styles.teamDetailVehicleDesc} numberOfLines={2}>
                                      {v.description}
                                    </Text>
                                  ) : null}
                                </View>
                                <View
                                  style={[
                                    styles.teamDetailVehicleStatus,
                                    {
                                      backgroundColor:
                                        v.status === 'AVAILABLE' ? '#ECFDF5' : '#FEF3C7',
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.teamDetailVehicleStatusText,
                                      { color: v.status === 'AVAILABLE' ? '#059669' : '#D97706' },
                                    ]}
                                  >
                                    {v.status === 'AVAILABLE' ? 'Sẵn sàng' : 'Bảo dưỡng'}
                                  </Text>
                                </View>
                              </View>
                            </React.Fragment>
                          ))}
                        </View>
                      ) : (
                        <View style={styles.teamDetailNoVehicles}>
                          <Feather name="info" size={15} color="#64748B" />
                          <Text style={styles.teamDetailNoVehiclesText}>
                            Phương tiện được cơ động điều động theo tình hình thực địa của Ban chỉ huy trung tâm.
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Trạng thái gọn khi Đội trưởng không có đơn chờ */}
                    {isLeader && pendingApplicants.length === 0 && (
                      <View style={styles.teamDetailSection}>
                        <Text style={styles.teamDetailSectionTitle}>ĐƠN ỨNG TUYỂN CHỜ DUYỆT (0)</Text>
                        <View style={styles.pendingEmptyCard}>
                          <Feather name="check-circle" size={16} color="#059669" />
                          <Text style={styles.pendingEmptyText}>
                            Hiện không có đơn ứng tuyển nào đang chờ phê duyệt.
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Action Button: Rút đơn nếu đang chờ duyệt */}
                    {selectedTeamForDetail._id !== myTeam?._id && isPendingSelf && (
                      <TouchableOpacity
                        style={[
                          styles.teamDetailCancelApplyBtn,
                          isJoiningTeam === selectedTeamForDetail._id && { opacity: 0.7 },
                        ]}
                        onPress={() => handleCancelApplication(selectedTeamForDetail)}
                        disabled={isJoiningTeam === selectedTeamForDetail._id}
                        activeOpacity={0.85}
                      >
                        {isJoiningTeam === selectedTeamForDetail._id ? (
                          <ActivityIndicator size="small" color="#DC2626" />
                        ) : (
                          <>
                            <Feather name="x-circle" size={16} color="#DC2626" />
                            <Text style={styles.teamDetailCancelApplyBtnText}>
                              Rút đơn ứng tuyển vào đội này
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}

                    {/* Action Button if looking from picker and not yet member and not pending */}
                    {selectedTeamForDetail._id !== myTeam?._id &&
                      !isPendingSelf &&
                      verificationStatus === 'VERIFIED' && (
                        <TouchableOpacity
                          style={[
                            styles.teamDetailApplyBtn,
                            isJoiningTeam === selectedTeamForDetail._id && { opacity: 0.7 },
                          ]}
                          onPress={() => {
                            handleJoinTeam(selectedTeamForDetail);
                          }}
                          disabled={isJoiningTeam === selectedTeamForDetail._id}
                          activeOpacity={0.88}
                        >
                          <Feather name="user-plus" size={16} color="#FFFFFF" />
                          <Text style={styles.teamDetailApplyBtnText}>
                            Nộp đơn ứng tuyển gia nhập đội này
                          </Text>
                          <Feather name="arrow-right" size={16} color="#FFFFFF" />
                        </TouchableOpacity>
                      )}

                    {/* Action Button: Rời đội nếu đang là thành viên */}
                    {selectedTeamForDetail._id === myTeam?._id && (
                      <TouchableOpacity
                        style={[styles.teamDetailLeaveBtn, isLeavingTeam && { opacity: 0.7 }]}
                        onPress={() => handleLeaveTeam(selectedTeamForDetail)}
                        disabled={isLeavingTeam}
                        activeOpacity={0.85}
                      >
                        {isLeavingTeam ? (
                          <ActivityIndicator size="small" color="#DC2626" />
                        ) : (
                          <>
                            <Feather name="log-out" size={16} color="#DC2626" />
                            <Text style={styles.teamDetailLeaveBtnText}>
                              {isLeader
                                ? getOtherTeamMembers(selectedTeamForDetail).length > 0
                                  ? 'Chuyển giao quyền Đội trưởng & Rời đội'
                                  : 'Tạm dừng hoạt động & Rời đội'
                                : 'Rời khỏi Đội cứu hộ này'}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </>
                );
              })()}
            </ScrollView>

            {/* Popup Dialog: Chọn thành viên làm Đội trưởng mới */}
            {showTransferLeaderModal && (
              <View style={styles.transferPopupOverlay}>
                <TouchableWithoutFeedback
                  onPress={() => {
                    if (!isTransferringLeader) setShowTransferLeaderModal(false);
                  }}
                >
                  <View style={styles.transferPopupBackdrop} />
                </TouchableWithoutFeedback>

                <View style={styles.transferPopupContainer}>
                  {/* Header */}
                  <View style={styles.transferPopupHeader}>
                    <View style={styles.transferPopupIconCircle}>
                      <Feather name="shield" size={20} color="#0066FF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.transferPopupTitle}>Chọn Đội trưởng mới</Text>
                      <Text style={styles.transferPopupSubtitle} numberOfLines={1}>
                        {transferLeaderTeam?.name || selectedTeamForDetail.name}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.transferPopupCloseBtn}
                      onPress={() => {
                        if (!isTransferringLeader) setShowTransferLeaderModal(false);
                      }}
                      disabled={isTransferringLeader}
                      activeOpacity={0.7}
                    >
                      <Feather name="x" size={18} color="#64748B" />
                    </TouchableOpacity>
                  </View>

                  {/* Banner giải thích nghiệp vụ */}
                  <View style={styles.transferPopupBanner}>
                    <Feather name="alert-circle" size={16} color="#D97706" style={{ marginTop: 2 }} />
                    <Text style={styles.transferPopupBannerText}>
                      Bạn hiện đang là Đội trưởng của đội. Để rời đội, bạn cần chuyển giao chức vụ Đội trưởng cho một thành viên khác.
                    </Text>
                  </View>

                  <Text style={styles.transferPopupListLabel}>
                    DANH SÁCH THÀNH VIÊN KẾ NHIỆM ({(transferLeaderTeam ? getOtherTeamMembers(transferLeaderTeam) : getOtherTeamMembers(selectedTeamForDetail)).length})
                  </Text>

                  {/* Danh sách thành viên */}
                  <ScrollView
                    style={styles.transferPopupScroll}
                    contentContainerStyle={{ gap: 10, paddingBottom: 10 }}
                    showsVerticalScrollIndicator={true}
                  >
                    {(transferLeaderTeam ? getOtherTeamMembers(transferLeaderTeam) : getOtherTeamMembers(selectedTeamForDetail)).length > 0 ? (
                      (transferLeaderTeam ? getOtherTeamMembers(transferLeaderTeam) : getOtherTeamMembers(selectedTeamForDetail)).map((m: any, idx: number) => {
                        const rescuerObj = typeof m.rescuerId === 'object' ? m.rescuerId : null;
                        const mIdStr = (rescuerObj?._id || m.rescuerId || '').toString();
                        const mName = rescuerObj?.fullName || `Thành viên #${mIdStr.slice(-4)}`;
                        const mPhone = rescuerObj?.phone;
                        const mEmail = rescuerObj?.email;

                        return (
                          <View key={idx} style={styles.transferPopupMemberCard}>
                            <View style={styles.transferPopupAvatar}>
                              <Text style={styles.transferPopupAvatarText}>
                                {mName.charAt(0).toUpperCase()}
                              </Text>
                            </View>

                            <View style={{ flex: 1 }}>
                              <Text style={styles.transferPopupMemberName} numberOfLines={1}>
                                {mName}
                              </Text>
                              {mPhone ? (
                                <Text style={styles.transferPopupMemberPhone}>📞 {mPhone}</Text>
                              ) : mEmail ? (
                                <Text style={styles.transferPopupMemberPhone}>✉️ {mEmail}</Text>
                              ) : (
                                <Text style={styles.transferPopupMemberPhone}>Chiến sĩ cứu hộ trực thuộc</Text>
                              )}
                              <View style={styles.transferPopupRoleBadge}>
                                <Feather name="shield" size={10} color="#0284C7" />
                                <Text style={styles.transferPopupRoleText}>Thành viên</Text>
                              </View>
                            </View>

                            <TouchableOpacity
                              style={styles.transferPopupSelectBtn}
                              onPress={() => handleConfirmTransferLeader(m)}
                              disabled={isTransferringLeader}
                              activeOpacity={0.8}
                            >
                              <Feather name="award" size={14} color="#FFFFFF" />
                              <Text style={styles.transferPopupSelectBtnText}>Bàn giao</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })
                    ) : (
                      <View style={styles.transferPopupEmptyBox}>
                        <Feather name="users" size={32} color="#94A3B8" />
                        <Text style={styles.transferPopupEmptyText}>
                          Không tìm thấy thành viên nào khác trong danh sách đội.
                        </Text>
                      </View>
                    )}
                  </ScrollView>

                  {/* Nút Đóng */}
                  <TouchableOpacity
                    style={styles.transferPopupCancelBtn}
                    onPress={() => setShowTransferLeaderModal(false)}
                    disabled={isTransferringLeader}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.transferPopupCancelText}>Hủy / Đóng</Text>
                  </TouchableOpacity>

                  {isTransferringLeader && (
                    <View style={styles.transferLoadingOverlay}>
                      <ActivityIndicator size="large" color="#0066FF" />
                      <Text style={styles.transferLoadingText}>
                        Đang chuyển giao quyền Đội trưởng và hoàn tất rời đội...
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0066FF',
    overflow: 'hidden',
  },
  brandLogo: {
    width: 32,
    height: 32,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  brandSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleToggleChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  roleToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  unreadBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#0066FF',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  unreadBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 110,
    backgroundColor: PROFILE_THEME.colors.background,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  profileInfoCol: {
    flex: 1,
    paddingRight: 16,
    justifyContent: 'center',
  },
  avatarWrap: {
    width: 82,
    height: 82,
    position: 'relative',
  },
  avatarImage: {
    width: 82,
    height: 82,
    borderRadius: 41,
    resizeMode: 'cover',
  },
  avatarPlaceholder: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  avatarInitials: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0066FF',
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  rescuerName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  contactIcon: {
    marginRight: 8,
    width: 16,
  },
  contactText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    flexShrink: 1,
  },
  availabilityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: PROFILE_THEME.radius.card,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  availHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  availTitleCol: {
    flex: 1,
  },
  availCardTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  availCardSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
  },
  switchWrapper: {
    transform: Platform.OS === 'ios' ? [{ scaleX: 0.85 }, { scaleY: 0.85 }] : [],
  },
  statusDisplayBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  statusDisplayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statusIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabelText: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  statusDescText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },
  statusSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusSelectorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: PROFILE_THEME.radius.card,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
    minHeight: 64,
  },
  menuIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTextBox: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  menuDesc: {
    fontSize: 12,
    color: '#64748B',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 70,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: PROFILE_THEME.radius.button,
    paddingVertical: 14,
    minHeight: 48,
  },
  logoutButtonText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0066FF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: PROFILE_THEME.colors.overlay,
    justifyContent: 'flex-end',
  },
  statusPickerCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: PROFILE_THEME.radius.sheet,
    borderTopRightRadius: PROFILE_THEME.radius.sheet,
    padding: 20,
    paddingBottom: 36,
  },
  statusPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statusPickerTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  statusPickerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  statusPickerItemDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusPickerItemLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  statusPickerItemDesc: {
    fontSize: 11.5,
    color: '#64748B',
  },
  bottomSheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: PROFILE_THEME.radius.sheet,
    borderTopRightRadius: PROFILE_THEME.radius.sheet,
    padding: 20,
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    marginBottom: 10,
    minHeight: 52,
  },
  sheetOptionIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetOptionTextCol: {
    flex: 1,
  },
  sheetOptionLabel: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  sheetOptionDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  sheetCancelBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    marginTop: 6,
  },
  sheetCancelText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#475569',
  },
  previewDialogCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 24,
    marginBottom: 'auto',
    marginTop: 'auto',
    alignItems: 'center',
  },
  previewDialogTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  previewDialogSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 16,
  },
  previewDialogImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#2563EB',
  },
  dialogActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  dialogCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  dialogCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  dialogConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
  },
  dialogConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  confirmDialogCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 24,
    marginBottom: 'auto',
    marginTop: 'auto',
    alignItems: 'center',
  },
  alertIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmDialogTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  confirmDialogSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  logoutConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#0066FF',
    alignItems: 'center',
  },
  logoutConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  unverifiedPhoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    gap: 12,
  },
  unverifiedPhoneIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unverifiedPhoneTextBox: {
    flex: 1,
  },
  unverifiedPhoneTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  unverifiedPhoneDesc: {
    fontSize: 12,
    color: '#B45309',
    lineHeight: 16,
  },
  tacticalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 14,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  tacticalReadinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  tacticalReadinessTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  tacticalReadinessDesc: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
  },
  tacticalDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 12,
  },
  tacticalGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tacticalGridCol: {
    flex: 1,
  },
  tacticalGridDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 10,
  },
  tacticalGridLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  tacticalGridValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  tacticalGridSub: {
    fontSize: 11,
    color: '#64748B',
  },
  tacticalPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 10,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  tacticalPrimaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tacticalPendingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  tacticalPendingText: {
    fontSize: 11.5,
    color: '#B45309',
    flex: 1,
    lineHeight: 16,
  },
  tacticalGridChevron: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 4,
  },
  tacticalDetailHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0F2FE',
  },
  tacticalDetailHintText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0284C7',
    flex: 1,
  },
  teamDetailCanvas: {
    backgroundColor: '#F2F4F7',
  },
  teamDetailHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 18,
  },
  teamDetailHeroIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamDetailHeroContent: {
    flex: 1,
  },
  teamDetailHeroName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 22,
    marginBottom: 6,
  },
  teamDetailBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  teamDetailTypeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
  },
  teamDetailTypeBadgeText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  teamDetailStatusInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  teamDetailStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  teamDetailStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  teamDetailSection: {
    marginBottom: 18,
  },
  teamDetailSectionTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  teamDetailInfoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  teamDetailInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  teamDetailInfoIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamDetailInfoLabel: {
    fontSize: 11.5,
    color: '#64748B',
  },
  teamDetailInfoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  teamDetailInfoSubValue: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  teamDetailInfoDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 11,
    marginLeft: 44,
  },
  teamDetailRowDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  teamSelfBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  teamSelfBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  teamDetailCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#059669',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
  },
  teamDetailCallBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  teamDetailDescText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
    marginTop: 2,
  },
  teamDetailMutedEmptyText: {
    fontSize: 13,
    color: '#64748B',
    paddingVertical: 4,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 2,
  },
  memberAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  memberAvatarCircleLeader: {
    backgroundColor: '#EFF6FF',
  },
  memberAvatarImg: {
    width: 38,
    height: 38,
  },
  memberAvatarInitials: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  memberSubText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  memberRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  memberRoleBadgeLeader: {
    backgroundColor: '#EFF6FF',
  },
  memberRoleBadgeDefault: {
    backgroundColor: '#F1F5F9',
  },
  memberRoleText: {
    fontSize: 11,
    fontWeight: '600',
  },
  memberRoleTextLeader: {
    color: '#1D4ED8',
  },
  memberRoleTextDefault: {
    color: '#475569',
  },
  memberCallCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamDetailVehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 2,
  },
  teamDetailVehicleIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamDetailVehicleName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  teamDetailVehiclePlate: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  teamDetailVehicleStatus: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  teamDetailVehicleStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  teamDetailNoVehicles: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  teamDetailNoVehiclesText: {
    flex: 1,
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 18,
  },
  teamDetailApplyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0066FF',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 10,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  teamDetailApplyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  teamHeaderLeaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  teamHeaderLeaveBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  teamDetailLeaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 14,
  },
  teamDetailLeaveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },
  nearbyBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  nearbyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  teamItemTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  teamItemTypeTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  teamModalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  teamModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  teamModalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  teamModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  teamSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  teamSearchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    padding: 0,
  },
  teamModalList: {
    flex: 1,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  teamModalListContent: {
    paddingBottom: 40,
    gap: 12,
  },
  emptyTeamsBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTeamsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  emptyTeamsDesc: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  modalTeamCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  modalTeamCardCurrent: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  matrixCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  matrixTypeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  modalTeamName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 20,
  },
  currentTeamBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  currentTeamBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  modalTeamArea: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  matrixGridContainer: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    overflow: 'hidden',
  },
  matrixGridCol: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  matrixGridLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  matrixGridLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  matrixGridVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  matrixDescBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 10,
  },
  matrixDescText: {
    flex: 1,
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16,
    fontStyle: 'italic',
  },
  modalTeamFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  matrixDetailHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  matrixDetailHintText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066FF',
  },
  modalJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0066FF',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    minHeight: 34,
  },
  modalJoinBtnDisabled: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  modalJoinBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalJoinBtnTextCurrent: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#15803D',
  },
  transferPopupOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  transferPopupBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },
  transferPopupContainer: {
    width: '100%',
    maxHeight: '82%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 25,
    overflow: 'hidden',
  },
  transferPopupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  transferPopupIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferPopupTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  transferPopupSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  transferPopupCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferPopupBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFBEB',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginVertical: 12,
  },
  transferPopupBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
    fontWeight: '600',
  },
  transferPopupListLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  transferPopupScroll: {
    maxHeight: 260,
  },
  transferPopupMemberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  transferPopupAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferPopupAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  transferPopupMemberName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  transferPopupMemberPhone: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  transferPopupRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0F9FF',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  transferPopupRoleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284C7',
  },
  transferPopupSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0066FF',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  transferPopupSelectBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  transferPopupEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
    gap: 8,
  },
  transferPopupEmptyText: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  transferPopupCancelBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferPopupCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  transferLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  transferLoadingText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
  },
  tacticalTeamPendingCard: {
    marginTop: 12,
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 14,
  },
  tacticalTeamPendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tacticalTeamPendingIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tacticalTeamPendingTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  tacticalTeamPendingName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#78350F',
    marginTop: 2,
  },
  tacticalTeamPendingCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  tacticalTeamPendingCancelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  tacticalTeamPendingDesc: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
    marginTop: 8,
  },
  tacticalTeamPendingViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
  },
  tacticalTeamPendingViewBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
  },
  modalTeamCardPending: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFCF5',
  },
  pendingTeamBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  pendingTeamBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#B45309',
  },
  modalJoinBtnPending: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  modalJoinBtnTextPending: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  teamHeaderCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  teamHeaderCancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  teamDetailPendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 14,
    marginBottom: 16,
  },
  teamDetailPendingBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.4,
  },
  teamDetailPendingBannerText: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
    marginTop: 3,
  },
  teamDetailCancelApplyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 12,
  },
  teamDetailCancelApplyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },
  teamDetailSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pendingCountBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  pendingCountBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  pendingEmptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pendingEmptyText: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '500',
  },
  pendingApplicantsList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  applicantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 2,
  },
  applicantAvatarBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  applicantAvatarImg: {
    width: 40,
    height: 40,
  },
  applicantAvatarInitials: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#475569',
  },
  applicantName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  applicantMetaText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  applicantSkillsText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '500',
    marginTop: 2,
  },
  applicantActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  applicantRejectCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applicantApproveCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamDetailVehicleDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
});

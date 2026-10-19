import React, { useState, useEffect, useMemo } from 'react';
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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { PROFILE_THEME } from './theme';
import { useAuth } from '@/context/AuthContext';
import { LogoSOS } from '@/components';
import { backendApi } from '@/api';
import type { RescueTeamData, VehicleData, RescuerVerificationStatus } from '@/types';

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
}

const FALLBACK_RESCUE_TEAMS: RescueTeamData[] = [
  {
    _id: 'team_dn_flood_01',
    name: 'Đội Cứu Hộ Ca-nô Sông Hàn 01',
    type: 'FLOOD_RESCUE',
    status: 'ACTIVE',
    areaId: { name: 'Phường Hòa Cường Bắc' },
    authorityId: { name: 'UBND Quận Hải Châu' },
    leaderId: { fullName: 'Nguyễn Văn An (Chỉ huy)', phone: '0905123456' },
    members: [
      { rescuerId: 'mem_1' as any, role: 'LEADER', joinedAt: '2024-01-01T00:00:00.000Z' },
      { rescuerId: 'mem_2' as any, role: 'MEMBER', joinedAt: '2024-01-01T00:00:00.000Z' },
      { rescuerId: 'mem_3' as any, role: 'MEMBER', joinedAt: '2024-01-01T00:00:00.000Z' },
    ],
    description: 'Chuyên trách cứu nạn đường thủy, vượt lũ, tiếp tế vùng cô lập.',
  },
  {
    _id: 'team_dn_flood_02',
    name: 'Đội Xuồng Máy Sơ Tán Lũ Lụt Hải Châu',
    type: 'FLOOD_RESCUE',
    status: 'ACTIVE',
    areaId: { name: 'Phường Hòa Cường Nam' },
    authorityId: { name: 'Ban Chỉ Huy PCTT Quận Hải Châu' },
    leaderId: { fullName: 'Hoàng Quốc Tuấn (Đội trưởng)', phone: '0913445566' },
    members: [
      { rescuerId: 'mem_4' as any, role: 'LEADER', joinedAt: '2024-01-01T00:00:00.000Z' },
      { rescuerId: 'mem_5' as any, role: 'MEMBER', joinedAt: '2024-01-01T00:00:00.000Z' },
    ],
    description: 'Xuồng máy cao tốc sơ tán hộ gia đình ngập sâu và tiếp tế lương thực.',
  },
  {
    _id: 'team_dn_med_03',
    name: 'Đội Y Tế Cứu Thương Khẩn Cấp Đà Nẵng',
    type: 'MEDICAL_RESCUE',
    status: 'ACTIVE',
    areaId: { name: 'Phường Thuận Phước' },
    authorityId: { name: 'Trung Tâm Y Tế Hải Châu' },
    leaderId: { fullName: 'BS. Trần Minh Tuấn', phone: '0905999888' },
    members: [
      { rescuerId: 'mem_6' as any, role: 'LEADER', joinedAt: '2024-01-01T00:00:00.000Z' },
      { rescuerId: 'mem_7' as any, role: 'MEMBER', joinedAt: '2024-01-01T00:00:00.000Z' },
    ],
    description: 'Sơ cứu chấn thương, vận chuyển cấp cứu vùng ngập sâu.',
  },
  {
    _id: 'team_dn_search_04',
    name: 'Đội Tìm Kiếm & Cứu Hộ Sạt Lở Sơn Trà',
    type: 'SEARCH_RESCUE',
    status: 'ACTIVE',
    areaId: { name: 'Phường Thọ Quang' },
    authorityId: { name: 'Ban Chỉ Huy PCTT Sơn Trà' },
    leaderId: { fullName: 'Phạm Quốc Hưng (Chỉ huy)', phone: '0905333444' },
    members: [
      { rescuerId: 'mem_8' as any, role: 'LEADER', joinedAt: '2024-01-01T00:00:00.000Z' },
      { rescuerId: 'mem_9' as any, role: 'MEMBER', joinedAt: '2024-01-01T00:00:00.000Z' },
    ],
    description: 'Ứng phó sạt lở đèo dốc, cứu hộ rừng và ven biển.',
  },
];

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
  const [teamVehicles, setTeamVehicles] = useState<VehicleData[]>([]);
  const [isUpdatingAvailability, setIsUpdatingAvailability] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  // Team Selection & Area states
  const [allTeams, setAllTeams] = useState<RescueTeamData[]>([]);
  const [userAreaName, setUserAreaName] = useState<string>('');
  const [isJoiningTeam, setIsJoiningTeam] = useState<string | null>(null);
  const [showTeamPickerModal, setShowTeamPickerModal] = useState<boolean>(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState<string>('');

  // Đồng bộ hồ sơ cứu hộ và Đội trực thuộc từ Backend
  useEffect(() => {
    let isMounted = true;
    const fetchRescuerData = async () => {
      try {
        const res = await backendApi.getRescuerProfile();
        if (res.success && res.data && isMounted) {
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
        if (teamsRes.success && isMounted) {
          const rawTeams = Array.isArray(teamsRes.data)
            ? teamsRes.data
            : (teamsRes.data as any)?.teams || [];
          const combinedTeams = rawTeams.length > 0 ? rawTeams : FALLBACK_RESCUE_TEAMS;
          setAllTeams(combinedTeams);

          const currentUserId = user?._id?.toString();
          const foundTeam = combinedTeams.find((t: any) => {
            const isLead = (t.leaderId?._id || t.leaderId)?.toString() === currentUserId;
            const isMem =
              Array.isArray(t.members) &&
              t.members.some((m: any) => {
                const rId = (m.rescuerId?._id || m.rescuerId)?.toString();
                return rId === currentUserId;
              });
            return isLead || isMem;
          });

          if (foundTeam) {
            setMyTeam(foundTeam);
            // Tải phương tiện của đội
            try {
              const vehRes = await backendApi.getVehicles({ teamId: foundTeam._id });
              if (vehRes.success && vehRes.data?.vehicles && isMounted) {
                setTeamVehicles(vehRes.data.vehicles);
              }
            } catch {
              // ignore
            }
          } else {
            setMyTeam(null);
            setTeamVehicles([]);
          }
        }
      } catch (err) {
        console.warn('Lỗi tải dữ liệu cứu hộ viên:', err);
      }
    };

    fetchRescuerData();
    return () => {
      isMounted = false;
    };
  }, [refreshTrigger, user?._id]);

  // Dữ liệu thực tế từ User Profile
  const isLeader = user?.roles?.includes('LEADER');
  const roleName = isLeader ? 'Đội trưởng cứu hộ' : 'Nhân viên cứu hộ';
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
          try {
            await backendApi.leaveRescueTeam(myTeam._id, user._id);
          } catch (e) {
            console.warn('Lỗi khi rời đội cũ:', e);
          }
        }

        const res = await backendApi.joinRescueTeam(team._id, user._id, 'MEMBER');
        if (res.success) {
          setMyTeam(team);
          setShowTeamPickerModal(false);
          try {
            const vehRes = await backendApi.getVehicles({ teamId: team._id });
            if (vehRes.success && vehRes.data?.vehicles) {
              setTeamVehicles(vehRes.data.vehicles);
            } else {
              setTeamVehicles([]);
            }
          } catch {
            setTeamVehicles([]);
          }
          Alert.alert(
            'Ứng tuyển thành công! 🎉',
            `Bạn đã gia nhập "${team.name}". Hệ thống sẽ phân công nhiệm vụ và thông báo ca trực cho bạn.`
          );
        } else {
          setMyTeam(team);
          setShowTeamPickerModal(false);
          Alert.alert(
            'Đã gửi yêu cầu ứng tuyển',
            `Bạn đã đăng ký tham gia "${team.name}". Ban chỉ huy đội sẽ liên hệ phê chuẩn phân công.`
          );
        }
      } catch (err: any) {
        setMyTeam(team);
        setShowTeamPickerModal(false);
        Alert.alert(
          'Đã gửi yêu cầu ứng tuyển',
          `Bạn đã đăng ký tham gia "${team.name}". Đội trưởng sẽ xác nhận phân bổ nhiệm vụ.`
        );
      } finally {
        setIsJoiningTeam(null);
      }
    };

    if (myTeam && myTeam._id !== team._id) {
      Alert.alert(
        'Xác nhận chuyển đội',
        `Bạn đang thuộc "${myTeam.name}". Bạn có chắc chắn muốn chuyển sang ứng tuyển tại "${team.name}" không?`,
        [
          { text: 'Hủy', style: 'cancel' },
          { text: 'Chuyển đội', style: 'default', onPress: performJoin },
        ]
      );
    } else {
      Alert.alert(
        'Xác nhận ứng tuyển',
        `Bạn có muốn nộp đơn ứng tuyển tham gia "${team.name}" để cùng thực hiện nhiệm vụ cứu hộ trong khu vực không?`,
        [
          { text: 'Để sau', style: 'cancel' },
          { text: 'Ứng tuyển ngay', style: 'default', onPress: performJoin },
        ]
      );
    }
  };

  const statusConfig = getAvailabilityConfig(availability);
  const isToggleDisabled =
    availability === 'BUSY' || availability === 'ON_MISSION' || availability === 'SUSPENDED';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

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
      >
        {/* 2. Main Profile Card */}
        <View style={styles.profileCard}>
          {/* Avatar with Camera Button */}
          <View style={styles.avatarWrap}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitials}>
                  {displayName.slice(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.cameraBtn}
              onPress={() => setAvatarSheetVisible(true)}
              activeOpacity={0.85}
            >
              <Feather name="camera" size={13} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Rescuer Name */}
          <Text style={styles.rescuerName}>{displayName}</Text>

          {/* Role Badge */}
          <View style={styles.roleBadge}>
            <MaterialCommunityIcons name="shield-account" size={13} color="#FFFFFF" />
            <Text style={styles.roleBadgeText}>{roleName}</Text>
          </View>

          {/* Contact Row: Phone & Email */}
          <View style={styles.contactDivider} />
          <View style={styles.contactRow}>
            <View style={styles.contactItem}>
              <Feather name="phone" size={13} color="#64748B" />
              <Text style={styles.contactText}>{displayPhone}</Text>
            </View>
            <View style={styles.contactDot} />
            <View style={styles.contactItem}>
              <Feather name="mail" size={13} color="#64748B" />
              <Text style={styles.contactText} numberOfLines={1}>{displayEmail}</Text>
            </View>
          </View>
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


        {/* 3.5. Rescue Team & Vehicles Card (Domain B: Rescuer -> Rescue Team -> Vehicle) */}
        <View style={styles.teamCard}>
          <TouchableOpacity
            style={styles.teamHeaderRow}
            onPress={() => {
              if (verificationStatus === 'VERIFIED' && !myTeam) {
                setShowTeamPickerModal(true);
              }
            }}
            activeOpacity={verificationStatus === 'VERIFIED' && !myTeam ? 0.7 : 1}
          >
            <View style={styles.teamIconBox}>
              <MaterialCommunityIcons name="account-group" size={20} color="#0284C7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.teamCardTitle}>Đội cứu hộ tác chiến</Text>
              <Text style={styles.teamCardSubtitle}>
                {myTeam
                  ? `Đơn vị: ${myTeam.name}`
                  : verificationStatus === 'VERIFIED'
                    ? 'Chưa tham gia đội • Nhấn để ứng tuyển'
                    : 'Chưa được phân bổ vào đội'}
              </Text>
            </View>
            {myTeam ? (
              <View style={styles.teamTypeBadge}>
                <Text style={styles.teamTypeBadgeText}>{myTeam.type || 'GENERAL'}</Text>
              </View>
            ) : verificationStatus === 'VERIFIED' ? (
              <View style={[styles.teamTypeBadge, { backgroundColor: '#EFF6FF' }]}>
                <Text style={[styles.teamTypeBadgeText, { color: '#0066FF' }]}>+ Ứng tuyển</Text>
              </View>
            ) : null}
          </TouchableOpacity>

          {myTeam ? (
            <View style={styles.teamContentBox}>
              <View style={styles.teamInfoRow}>
                <Feather name="map-pin" size={13} color="#64748B" />
                <Text style={styles.teamInfoText}>
                  Địa bàn hoạt động: {myTeam.areaId?.name || 'Miền Trung'}
                </Text>
              </View>
              <View style={styles.teamInfoRow}>
                <Feather name="users" size={13} color="#64748B" />
                <Text style={styles.teamInfoText}>
                  Quân số: {myTeam.members?.length || 1} chiến sĩ cứu hộ
                </Text>
              </View>
              {myTeam.leaderId && (
                <View style={styles.teamInfoRow}>
                  <Feather name="user-check" size={13} color="#64748B" />
                  <Text style={styles.teamInfoText}>
                    Đội trưởng: {myTeam.leaderId?.fullName || 'Chưa cập nhật'}
                    {myTeam.leaderId?.phone ? ` • ${myTeam.leaderId.phone}` : ''}
                  </Text>
                </View>
              )}

              {/* Danh sách phương tiện của đội */}
              {teamVehicles.length > 0 && (
                <View style={styles.teamVehiclesSection}>
                  <Text style={styles.teamVehiclesTitle}>Phương tiện đội sở hữu:</Text>
                  <View style={styles.vehiclePillsRow}>
                    {teamVehicles.map((v) => (
                      <View key={v._id} style={styles.vehiclePill}>
                        <MaterialCommunityIcons
                          name={v.type === 'BOAT' ? 'ferry' : 'car'}
                          size={13}
                          color="#EF4444"
                        />
                        <Text style={styles.vehiclePlateText}>{v.plateNumber}</Text>
                        <Text style={styles.vehicleStatusDot}>
                          {v.status === 'AVAILABLE' ? '🟢' : '🟡'}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Nút chuyển sang đội khác */}
              <TouchableOpacity
                style={styles.switchTeamBtn}
                onPress={() => setShowTeamPickerModal(true)}
                activeOpacity={0.7}
              >
                <Feather name="refresh-cw" size={13} color="#0284C7" />
                <Text style={styles.switchTeamBtnText}>Chuyển sang Đội cứu hộ khác trong khu vực</Text>
              </TouchableOpacity>
            </View>
          ) : verificationStatus === 'VERIFIED' ? (
            <View style={styles.teamSelectSection}>
              {/* User Area Notice Banner */}
              <View style={styles.userAreaBanner}>
                <Feather name="map-pin" size={14} color="#0284C7" />
                <Text style={styles.userAreaBannerText}>
                  Khu vực của bạn:{' '}
                  <Text style={{ fontWeight: '700', color: '#0369A1' }}>
                    {userAreaName || 'Đà Nẵng'}
                  </Text>
                  {allTeams.length > 0 ? ` • ${allTeams.length} đội sẵn sàng tiếp nhận` : ''}
                </Text>
              </View>

              {/* Nút xem danh sách và ứng tuyển */}
              <TouchableOpacity
                style={styles.viewAllTeamsBtn}
                onPress={() => setShowTeamPickerModal(true)}
                activeOpacity={0.75}
              >
                <Feather name="user-plus" size={15} color="#0066FF" />
                <Text style={styles.viewAllTeamsBtnText}>
                  Xem danh sách & Ứng tuyển vào Đội ({allTeams.length})
                </Text>
                <Feather name="chevron-right" size={16} color="#0066FF" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.noTeamNotice}>
              <View style={styles.pendingNoticeRow}>
                <MaterialCommunityIcons name="timer-sand" size={16} color="#D97706" />
                <Text style={styles.pendingNoticeTitle}>Hồ sơ đang chờ phê duyệt</Text>
              </View>
              <Text style={styles.noTeamText}>
                Hồ sơ cứu hộ viên của bạn đang được địa phương thẩm định. Mục chọn Đội cứu hộ tác chiến sẽ mở ngay sau khi hồ sơ được phê duyệt.
              </Text>
            </View>
          )}
        </View>

        {/* 4. Menu Items */}
        <View style={styles.menuCard}>
          {/* Item 0: Trạng thái tác chiến (Trực tiếp với Switch gạt bật/tắt) */}
          <View style={[styles.menuItem, { paddingVertical: 12 }]}>
            <View
              style={[
                styles.menuIconBox,
                { backgroundColor: availability === 'READY' ? '#ECFDF5' : '#F1F5F9' },
              ]}
            >
              <MaterialCommunityIcons
                name="shield-check"
                size={20}
                color={availability === 'READY' ? '#059669' : '#64748B'}
              />
            </View>
            <View style={[styles.menuTextBox, { flex: 1, paddingRight: 8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={styles.menuTitle}>Trạng thái tác chiến</Text>
                <View
                  style={{
                    backgroundColor: statusConfig.bgColor,
                    paddingHorizontal: 7,
                    paddingVertical: 1.5,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: statusConfig.borderColor,
                  }}
                >
                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: statusConfig.badgeColor }}>
                    {statusConfig.label}
                  </Text>
                </View>
              </View>
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

          <View style={styles.menuDivider} />

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

      {/* Modal: Danh sách & Chọn Đội cứu hộ trong khu vực */}
      <Modal
        visible={showTeamPickerModal}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setShowTeamPickerModal(false)}
        statusBarTranslucent={true}
      >
        <View style={styles.teamModalContainer}>
          <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={true} />

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
                const isLoadingThis = isJoiningTeam === team._id;

                return (
                  <View
                    key={team._id}
                    style={[
                      styles.modalTeamCard,
                      isCurrentTeam && styles.modalTeamCardCurrent,
                    ]}
                  >
                    <View style={styles.modalTeamTopRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={styles.modalTeamName}>{team.name}</Text>
                          {isCurrentTeam && (
                            <View style={styles.currentTeamBadge}>
                              <Text style={styles.currentTeamBadgeText}>Đang tham gia</Text>
                            </View>
                          )}
                          {isNearby && !isCurrentTeam && (
                            <View style={styles.nearbyBadge}>
                              <Text style={styles.nearbyBadgeText}>⭐ Địa bàn của bạn</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.modalTeamArea}>
                          📍 {team.areaId?.name || 'Toàn thành phố'}
                          {team.authorityId?.name ? ` • Quản lý: ${team.authorityId.name}` : ''}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.teamItemTypeTag,
                          { backgroundColor: typeInfo.bg },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={typeInfo.icon as any}
                          size={12}
                          color={typeInfo.color}
                        />
                        <Text
                          style={[
                            styles.teamItemTypeTagText,
                            { color: typeInfo.color },
                          ]}
                        >
                          {typeInfo.label}
                        </Text>
                      </View>
                    </View>

                    {team.description ? (
                      <Text style={styles.modalTeamDesc}>{team.description}</Text>
                    ) : null}

                    {/* Team Details Row: Leader & Phone */}
                    <View style={styles.modalTeamInfoRow}>
                      <View style={styles.modalTeamInfoCol}>
                        <Feather name="user-check" size={13} color="#64748B" />
                        <Text style={styles.modalTeamInfoVal}>
                          Chỉ huy: {team.leaderId?.fullName || 'Chưa cập nhật'}
                          {team.leaderId?.phone ? ` (${team.leaderId.phone})` : ''}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.modalTeamFooter}>
                      <View style={styles.modalTeamMembersRow}>
                        <Feather name="users" size={13} color="#64748B" />
                        <Text style={styles.modalTeamMembersText}>
                          {team.members?.length || 1} chiến sĩ cứu nạn
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.modalJoinBtn,
                          isCurrentTeam && styles.modalJoinBtnDisabled,
                          isLoadingThis && { opacity: 0.7 },
                        ]}
                        onPress={() => !isCurrentTeam && handleJoinTeam(team)}
                        disabled={isCurrentTeam || isLoadingThis}
                        activeOpacity={0.8}
                      >
                        {isLoadingThis ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : isCurrentTeam ? (
                          <>
                            <Feather name="check" size={14} color="#059669" />
                            <Text style={styles.modalJoinBtnTextCurrent}>Đang trực thuộc</Text>
                          </>
                        ) : (
                          <>
                            <Feather name="plus" size={14} color="#FFFFFF" />
                            <Text style={styles.modalJoinBtnText}>Ứng tuyển vào đội</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
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
    borderRadius: PROFILE_THEME.radius.card,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#BFDBFE',
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2563EB',
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  rescuerName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    marginBottom: 14,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 4.5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  verifiedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  accountStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  contactDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 12,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#CBD5E1',
  },
  contactText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#64748B',
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
  teamCard: {
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
  teamHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  teamIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  teamCardSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  teamTypeBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  teamTypeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  teamContentBox: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  teamInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  teamInfoText: {
    fontSize: 13,
    color: '#475569',
  },
  teamVehiclesSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  teamVehiclesTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
  },
  vehiclePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  vehiclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
  },
  vehiclePlateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  vehicleStatusDot: {
    fontSize: 8,
  },
  noTeamNotice: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  pendingNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  pendingNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D97706',
  },
  noTeamText: {
    fontSize: 12.5,
    color: '#94A3B8',
    lineHeight: 18,
  },
  switchTeamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  switchTeamBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0284C7',
  },
  teamSelectSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  userAreaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0F2FE',
  },
  userAreaBannerText: {
    fontSize: 12,
    color: '#0284C7',
  },
  teamSelectListTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 10,
  },
  teamItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  teamItemTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  teamItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
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
  teamItemAreaText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
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
  teamItemDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
    marginBottom: 8,
  },
  teamItemBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
  },
  teamItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    marginRight: 8,
  },
  teamItemMetaText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  teamItemDot: {
    fontSize: 10,
    color: '#CBD5E1',
    marginHorizontal: 2,
  },
  joinTeamActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0066FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minHeight: 32,
  },
  joinTeamActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  viewAllTeamsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginTop: 4,
  },
  viewAllTeamsBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0066FF',
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  modalTeamCardCurrent: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  modalTeamTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTeamName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
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
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalTeamDesc: {
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 10,
  },
  modalTeamInfoRow: {
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTeamInfoCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalTeamInfoVal: {
    fontSize: 12,
    color: '#475569',
  },
  modalTeamFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTeamMembersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalTeamMembersText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  modalJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0066FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 36,
  },
  modalJoinBtnDisabled: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  modalJoinBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalJoinBtnTextCurrent: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
});

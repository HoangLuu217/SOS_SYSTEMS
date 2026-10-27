import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Modal,
  TextInput,
  Alert,
  StatusBar,
  Platform,
  DeviceEventEmitter,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { backendApi } from '@/api';
import { useAuth } from '@/context/AuthContext';
import { SosAssignmentData, SosAssignmentStatus, TabName } from '@/types';
import { SosScreen, RescuerMissionWorkspaceModal } from '@/features/sos';

interface RescuerMissionScreenProps {
  onNavigateToTab?: (tab: TabName, options?: any) => void;
  onNavigateToHome?: () => void;
  onMissionsCountChange?: (count: number) => void;
}

export const RescuerMissionScreen: React.FC<RescuerMissionScreenProps> = ({
  onNavigateToTab,
  onNavigateToHome,
  onMissionsCountChange,
}) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [activeSegment, setActiveSegment] = useState<'active' | 'history'>('active');
  const [missions, setMissions] = useState<SosAssignmentData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Modal hoàn thành nhiệm vụ & Minh bạch bàn giao
  const [completeModalVisible, setCompleteModalVisible] = useState(false);
  const [selectedMission, setSelectedMission] = useState<SosAssignmentData | null>(null);
  const [completeNote, setCompleteNote] = useState('');
  const [actualRecipient, setActualRecipient] = useState('');
  const [proofPhotos, setProofPhotos] = useState<Array<{ uri: string; base64?: string }>>([]);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);

  // Thông tin Đội cứu hộ & Phương tiện tác chiến
  const [unitInfo, setUnitInfo] = useState<{
    teamName: string;
    vehiclePlate: string;
    vehicleType: string;
  }>({
    teamName: 'Đội Y Tế Cứu Thương Dã Chiến',
    vehiclePlate: '43B-115.88',
    vehicleType: 'AMBULANCE',
  });

  // Modal SOS khẩn cấp dành cho cứu hộ viên
  const [sosModalVisible, setSosModalVisible] = useState(false);

  // Modal Điều hướng Tác chiến Thực địa GrabDriver
  const [workspaceVisible, setWorkspaceVisible] = useState(false);
  const [activeWorkspaceMission, setActiveWorkspaceMission] = useState<SosAssignmentData | null>(null);

  const isFetchingRef = useRef(false);
  const prevCountRef = useRef<number>(-1);
  const hasLoadedRef = useRef(false);

  // Tải danh sách nhiệm vụ từ backend
  // isUserPull: Khi người dùng kéo RefreshControl hoặc nhấn nút làm mới trên header (hiển thị spinner)
  // isSilent: Khi đồng bộ ngầm định kỳ hoặc nhận tín hiệu realtime sos:sync (đồng bộ tĩnh 100% không làm rung/nháy màn hình)
  const fetchMissions = useCallback(
    async (options?: { isUserPull?: boolean; isSilent?: boolean }) => {
      const isUserPull = options?.isUserPull ?? false;
      const isSilent = options?.isSilent ?? false;

      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (isUserPull) {
        setRefreshing(true);
      } else if (!isSilent && !hasLoadedRef.current) {
        setLoading(true);
      }

      try {
        const res = await backendApi.getMyAssignments();
        if (res.success && Array.isArray(res.data)) {
          hasLoadedRef.current = true;
          setMissions(res.data);
          const activeCount = res.data.filter(
            (m) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(m.status)
          ).length;
          if (prevCountRef.current !== activeCount) {
            prevCountRef.current = activeCount;
            onMissionsCountChange?.(activeCount);
          }
        } else {
          setMissions([]);
          if (prevCountRef.current !== 0) {
            prevCountRef.current = 0;
            onMissionsCountChange?.(0);
          }
        }
      } catch {
        // Giữ nguyên danh sách cũ nếu lỗi kết nối
      } finally {
        isFetchingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [onMissionsCountChange]
  );

  useEffect(() => {
    // Tải lần đầu tiên khi mở màn hình (chỉ hiện loading nếu chưa có dữ liệu)
    fetchMissions({ isSilent: false });

    // Lắng nghe realtime tín hiệu điều phối và cập nhật nhiệm vụ (Đồng bộ ngầm hoàn toàn yên lặng)
    const sub = DeviceEventEmitter.addListener('sos:sync', () => {
      fetchMissions({ isSilent: true });
    });
    // Polling dự phòng mỗi 30s (Đồng bộ ngầm yên lặng, không giật màn hình)
    const interval = setInterval(() => {
      fetchMissions({ isSilent: true });
    }, 30000);

    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [fetchMissions]);

  // Tải thông tin Đội cứu hộ và Phương tiện cơ động của Cứu hộ viên
  useEffect(() => {
    let isMounted = true;
    const fetchTeamInfo = async () => {
      try {
        const teamsRes = await backendApi.getRescueTeams();
        const teams = Array.isArray(teamsRes.data) ? teamsRes.data : [];
        const currentUserId = user?._id?.toString();

        const myTeam = teams.find((t: any) => {
          const isLeader = (t.leaderId?._id || t.leaderId)?.toString() === currentUserId;
          const isMember =
            Array.isArray(t.members) &&
            t.members.some((m: any) => {
              const rId = (m.rescuerId?._id || m.rescuerId)?.toString();
              return rId === currentUserId && m.status !== 'REJECTED';
            });
          return isLeader || isMember;
        });

        if (myTeam && isMounted) {
          let vehiclePlate = 'Chưa phân bổ';
          let vehicleType = 'AMBULANCE';

          if (Array.isArray(myTeam.vehicles) && myTeam.vehicles.length > 0) {
            vehiclePlate = myTeam.vehicles[0].plateNumber;
            vehicleType = myTeam.vehicles[0].type;
          } else {
            try {
              const vehRes = await backendApi.getVehicles({ teamId: myTeam._id });
              const vList = Array.isArray(vehRes.data) ? vehRes.data : [];
              if (vList.length > 0 && isMounted) {
                vehiclePlate = vList[0].plateNumber;
                vehicleType = vList[0].type;
              }
            } catch {
              // ignore
            }
          }

          setUnitInfo({
            teamName: myTeam.name,
            vehiclePlate,
            vehicleType,
          });
        }
      } catch {
        // Giữ fallback mặc định
      }
    };

    fetchTeamInfo();
    return () => {
      isMounted = false;
    };
  }, [user?._id]);

  // Lọc nhiệm vụ theo Tab
  const activeMissions = missions.filter(
    (m) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(m.status)
  );
  const historyMissions = missions.filter((m) =>
    ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(m.status)
  );
  const displayedMissions = activeSegment === 'active' ? activeMissions : historyMissions;

  // Xử lý gọi điện thoại cho nạn nhân
  const handleCallVictim = (phone?: string) => {
    if (!phone) {
      Alert.alert('Thông báo', 'Nạn nhân chưa cung cấp số điện thoại liên lạc');
      return;
    }
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      Alert.alert('Lỗi', 'Không thể mở trình quay số điện thoại');
    });
  };

  // Xem vị trí nạn nhân & Mở Màn hình Điều Hướng Tác Chiến
  const handleViewOnMap = (mission: SosAssignmentData) => {
    setActiveWorkspaceMission(mission);
    setWorkspaceVisible(true);
  };

  // Cập nhật trạng thái nhiệm vụ (Tiếp nhận, Xuất phát, Tiếp cận, Hoàn thành)
  const handleUpdateStatus = async (
    missionId: string,
    targetStatus: SosAssignmentStatus,
    note?: string,
    extraData?: { proofImages?: string[]; actualRecipient?: string }
  ) => {
    try {
      setIsSubmitting(true);
      let res;
      if (targetStatus === 'ACCEPTED') {
        res = await backendApi.acceptAssignment(missionId);
      } else {
        res = await backendApi.updateAssignmentStatus(missionId, targetStatus, note, extraData);
      }

      if (res.success) {
        Alert.alert(
          'Thành công',
          targetStatus === 'COMPLETED'
            ? 'Đã cập nhật tiến trình và lưu vết bàn giao minh bạch thành công!'
            : 'Đã cập nhật trạng thái nhiệm vụ tác chiến'
        );
        fetchMissions({ isSilent: true });
      } else {
        Alert.alert('Thất bại', res.message || 'Không thể cập nhật trạng thái');
      }
    } catch (err: any) {
      Alert.alert('Lỗi kết nối', err.message || 'Có lỗi xảy ra khi cập nhật');
    } finally {
      setIsSubmitting(false);
      setIsUploadingProof(false);
      setCompleteModalVisible(false);
      setSelectedMission(null);
      setCompleteNote('');
      setProofPhotos([]);
      setActualRecipient('');
    }
  };

  // Chụp ảnh bằng chứng bàn giao vật tư trực tiếp qua camera
  const takeProofPhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Quyền máy ảnh', 'Vui lòng cấp quyền truy cập máy ảnh để chụp bằng chứng bàn giao hàng.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.35,
        base64: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setProofPhotos((prev) => [
          ...prev,
          { uri: res.assets[0].uri, base64: res.assets[0].base64 || undefined },
        ]);
      }
    } catch (err) {
      Alert.alert('Lỗi chụp ảnh', 'Không thể khởi động máy ảnh.');
    }
  };

  // Chọn ảnh bằng chứng từ thư viện máy
  const pickProofFromLibrary = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Quyền thư viện', 'Vui lòng cấp quyền truy cập thư viện để chọn ảnh bằng chứng.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        selectionLimit: 5,
        quality: 0.35,
        base64: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const newImgs = res.assets.map((asset) => ({
          uri: asset.uri,
          base64: asset.base64 || undefined,
        }));
        setProofPhotos((prev) => [...prev, ...newImgs].slice(0, 10));
      }
    } catch (err) {
      Alert.alert('Lỗi chọn ảnh', 'Không thể mở thư viện ảnh.');
    }
  };

  // Xóa ảnh đã chụp
  const removeProofPhoto = (index: number) => {
    setProofPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Xác nhận hoàn thành và upload ảnh bằng chứng minh bạch
  const handleConfirmComplete = async () => {
    if (!selectedMission) return;

    const isSelectedRelief =
      selectedMission.missionType === 'RELIEF_DISPATCH' ||
      selectedMission.sosRequestId?.emergencyType === 'RELIEF' ||
      (Array.isArray(selectedMission.supplies) && selectedMission.supplies.length > 0) ||
      (typeof selectedMission.sosRequestId?.description === 'string' &&
        selectedMission.sosRequestId.description.includes('xuất cấp cứu trợ')) ||
      (typeof selectedMission.note === 'string' &&
        selectedMission.note.includes('xuất cấp cứu trợ'));

    // Ràng buộc minh bạch: Bắt buộc phải có ít nhất 1 ảnh bằng chứng bàn giao
    if (isSelectedRelief && proofPhotos.length === 0) {
      Alert.alert(
        'Bắt buộc cung cấp bằng chứng',
        'Theo quy định minh bạch cứu trợ, bạn BẮT BUỘC phải chụp hoặc tải lên ít nhất 1 ảnh bằng chứng bàn giao (ảnh trao hàng tận tay, ảnh kiện hàng hoặc biên bản ký nhận) trước khi xác nhận hoàn tất!',
        [
          { text: 'Chụp ảnh ngay', onPress: takeProofPhoto },
          { text: 'Chọn từ máy', onPress: pickProofFromLibrary },
          { text: 'Đóng', style: 'cancel' },
        ]
      );
      return;
    }

    // Ràng buộc họ tên người nhận thực tế
    if (isSelectedRelief && !actualRecipient.trim()) {
      Alert.alert(
        'Thiếu người tiếp nhận',
        'Vui lòng nhập họ tên người nhận hoặc đại diện tiếp nhận hàng cứu trợ thực tế tại hiện trường!'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      let uploadedUrls: string[] = [];
      const base64List = proofPhotos
        .map((p) => p.base64)
        .filter(Boolean) as string[];

      if (base64List.length > 0) {
        setIsUploadingProof(true);
        try {
          const fileRes = await backendApi.post('/files', {
            base64Files: base64List,
            sosId: selectedMission.sosRequestId?._id,
          });
          if (fileRes.success) {
            uploadedUrls = fileRes.urls || (fileRes.data || []).map((f: any) => f.url);
          }
        } catch (uploadErr) {
          console.warn('Lỗi tải ảnh lên máy chủ, tiếp tục hoàn thành biên bản:', uploadErr);
        } finally {
          setIsUploadingProof(false);
        }
      }

      await handleUpdateStatus(
        selectedMission._id,
        'COMPLETED',
        completeNote,
        {
          proofImages: uploadedUrls,
          actualRecipient: actualRecipient.trim() || undefined,
        }
      );
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Có lỗi xảy ra khi hoàn tất');
      setIsSubmitting(false);
      setIsUploadingProof(false);
    }
  };

  // Render nhãn mức độ ưu tiên
  const renderPriorityBadge = (priority?: string) => {
    const p = (priority || 'MEDIUM').toUpperCase();
    if (p === 'CRITICAL') {
      return (
        <View style={[styles.priorityBadge, styles.priorityCritical]}>
          <Text style={styles.priorityTextCritical}>🔴 CỰC KỲ KHẨN CẤP</Text>
        </View>
      );
    }
    if (p === 'HIGH') {
      return (
        <View style={[styles.priorityBadge, styles.priorityHigh]}>
          <Text style={styles.priorityTextHigh}>🟠 KHẨN CẤP</Text>
        </View>
      );
    }
    return (
      <View style={[styles.priorityBadge, styles.priorityMedium]}>
        <Text style={styles.priorityTextMedium}>🟡 ƯU TIÊN VỪA</Text>
      </View>
    );
  };

  // Render tên loại sự cố khẩn cấp
  const getEmergencyLabel = (type?: string) => {
    switch (type) {
      case 'RELIEF':
        return { label: 'Xuất cấp & Tiếp tế cứu trợ', icon: 'package-variant-closed', color: '#059669' };
      case 'FLOOD':
      case 'RESCUE':
        return { label: 'Cứu nạn ngập lụt lũ quét', icon: 'waves', color: '#0284C7' };
      case 'MEDICAL':
        return { label: 'Cấp cứu y tế khẩn cấp', icon: 'medical-bag', color: '#DC2626' };
      case 'LANDSLIDE':
        return { label: 'Sạt lở đất đá cô lập', icon: 'image-filter-hdr', color: '#D97706' };
      case 'FIRE':
        return { label: 'Cháy nổ / Hỏa hoạn', icon: 'fire', color: '#EA580C' };
      case 'STORM':
        return { label: 'Bão lốc / Cây đổ', icon: 'weather-windy', color: '#0284C7' };
      default:
        return { label: 'Cần cứu hộ khẩn cấp', icon: 'alert-circle', color: '#EF4444' };
    }
  };

  // Render trạng thái tiến trình (hỗ trợ phân biệt nhiệm vụ Cứu nạn và Tiếp tế cứu trợ)
  const renderProgressStep = (currentStatus: SosAssignmentStatus, isRelief = false) => {
    const steps: { key: SosAssignmentStatus; label: string }[] = isRelief
      ? [
          { key: 'PENDING', label: 'Lệnh điều phối' },
          { key: 'ACCEPTED', label: 'Đã nhận lệnh' },
          { key: 'EN_ROUTE', label: 'Vận chuyển' },
          { key: 'IN_PROGRESS', label: 'Bàn giao' },
          { key: 'COMPLETED', label: 'Hoàn thành' },
        ]
      : [
          { key: 'PENDING', label: 'Lệnh điều phối' },
          { key: 'ACCEPTED', label: 'Đã nhận' },
          { key: 'EN_ROUTE', label: 'Xuất phát' },
          { key: 'IN_PROGRESS', label: 'Đang cứu hộ' },
          { key: 'COMPLETED', label: 'Hoàn thành' },
        ];

    const getStepIndex = (st: SosAssignmentStatus) => {
      if (['PENDING', 'ASSIGNED'].includes(st)) return 0;
      if (st === 'ACCEPTED') return 1;
      if (['DISPATCHED', 'EN_ROUTE', 'ON_THE_WAY'].includes(st)) return 2;
      if (['ARRIVED', 'IN_PROGRESS', 'RESCUING'].includes(st)) return 3;
      if (st === 'COMPLETED') return 4;
      return 0;
    };

    const currentIdx = getStepIndex(currentStatus);

    return (
      <View style={styles.stepProgressContainer}>
        {steps.map((step, idx) => {
          const isDone = idx <= currentIdx;
          const isCurrent = idx === currentIdx;
          return (
            <React.Fragment key={step.key}>
              <View style={styles.stepCol}>
                <View
                  style={[
                    styles.stepCircle,
                    isDone && styles.stepCircleDone,
                    isCurrent && styles.stepCircleCurrent,
                  ]}
                >
                  {isDone ? (
                    <Feather name="check" size={11} color="#FFFFFF" />
                  ) : (
                    <Text style={styles.stepNumber}>{idx + 1}</Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    isDone && styles.stepLabelDone,
                    isCurrent && styles.stepLabelCurrent,
                  ]}
                  numberOfLines={1}
                >
                  {step.label}
                </Text>
              </View>
              {idx < steps.length - 1 && (
                <View
                  style={[
                    styles.stepLine,
                    idx < currentIdx && styles.stepLineDone,
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* 1. Header tác chiến chuyên nghiệp */}
      <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 14) }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleBox}>
            <View style={styles.badgeLiveRow}>
              <View style={styles.livePulseDot} />
              <Text style={styles.headerOverline}>TRỰC BAN 24/7 • SẴN SÀNG ỨNG CỨU</Text>
            </View>
            <Text style={styles.headerTitle}>Nhiệm vụ tác chiến</Text>
          </View>

          {/* Action buttons: Làm mới & Nút Báo nguy cấp SOS */}
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => fetchMissions({ isUserPull: true })}
              activeOpacity={0.7}
            >
              <Feather name="refresh-cw" size={17} color="#E2E8F0" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headerIconBtn, styles.headerSosBtn]}
              onPress={() => setSosModalVisible(true)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="alert-octagon" size={16} color="#FFFFFF" />
              <Text style={styles.headerSosText}>SOS</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. Thẻ Đơn vị & Phương tiện Tác chiến (Thay cho thanh cũ) */}
        <View style={styles.tacticalUnitCard}>
          {/* Cột 1: Đơn vị cứu hộ */}
          <View style={styles.unitCol}>
            <View style={styles.unitHeaderRow}>
              <MaterialCommunityIcons name="shield-account" size={14} color="#38BDF8" />
              <Text style={styles.unitColLabel}>ĐƠN VỊ TÁC CHIẾN</Text>
            </View>
            <Text style={styles.unitColValue} numberOfLines={1}>
              {unitInfo.teamName}
            </Text>
          </View>

          <View style={styles.unitDivider} />

          {/* Cột 2: Phương tiện cơ động */}
          <View style={styles.unitColRight}>
            <View style={styles.unitHeaderRow}>
              <MaterialCommunityIcons
                name={unitInfo.vehicleType === 'BOAT' ? 'ferry' : 'ambulance'}
                size={14}
                color="#34D399"
              />
              <Text style={styles.unitColLabel}>PHƯƠNG TIỆN</Text>
            </View>
            <Text style={styles.unitColValuePlate} numberOfLines={1}>
              {unitInfo.vehiclePlate}
            </Text>
          </View>
        </View>

        {/* 3. Segments: Cần xử lý | Lịch sử */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              activeSegment === 'active' && styles.segmentBtnActive,
            ]}
            onPress={() => setActiveSegment('active')}
            activeOpacity={0.8}
          >
            <Feather
              name="zap"
              size={14}
              color={activeSegment === 'active' ? '#0066FF' : '#94A3B8'}
            />
            <Text
              style={[
                styles.segmentText,
                activeSegment === 'active' && styles.segmentTextActive,
              ]}
            >
              Cần xử lý ({activeMissions.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentBtn,
              activeSegment === 'history' && styles.segmentBtnActive,
            ]}
            onPress={() => setActiveSegment('history')}
            activeOpacity={0.8}
          >
            <Feather
              name="check-circle"
              size={14}
              color={activeSegment === 'history' ? '#0066FF' : '#94A3B8'}
            />
            <Text
              style={[
                styles.segmentText,
                activeSegment === 'history' && styles.segmentTextActive,
              ]}
            >
              Lịch sử ({historyMissions.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Danh sách nhiệm vụ */}
      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchMissions({ isUserPull: true })}
            colors={['#0066FF']}
            tintColor="#0066FF"
          />
        }
      >
        {loading && !refreshing ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#0066FF" />
            <Text style={styles.loadingText}>Đang đồng bộ dữ liệu nhiệm vụ...</Text>
          </View>
        ) : displayedMissions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <MaterialCommunityIcons name="radar" size={48} color="#0066FF" />
            </View>
            <Text style={styles.emptyTitle}>
              {activeSegment === 'active'
                ? 'Không có nhiệm vụ khẩn cấp nào'
                : 'Chưa có lịch sử hoàn thành'}
            </Text>
            <Text style={styles.emptyDesc}>
              {activeSegment === 'active'
                ? 'Hiện tại khu vực phụ trách chưa có lệnh điều phối mới. Hãy luôn duy trì trạng thái kết nối mạng và sẵn sàng nhận lệnh từ Ban chỉ huy!'
                : 'Các nhiệm vụ cứu nạn bạn đã hoàn tất sẽ được lưu trữ và tổng hợp tại đây.'}
            </Text>
            {activeSegment === 'active' && (
              <TouchableOpacity
                style={styles.emptyRefreshBtn}
                onPress={() => fetchMissions({ isSilent: false })}
                activeOpacity={0.8}
              >
                <Feather name="refresh-cw" size={16} color="#0066FF" />
                <Text style={styles.emptyRefreshText}>Quét lại nhiệm vụ</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          displayedMissions.map((item) => {
            const sos = item.sosRequestId;
            const isReliefMission =
              item.missionType === 'RELIEF_DISPATCH' ||
              sos?.emergencyType === 'RELIEF' ||
              (typeof sos?.description === 'string' && sos.description.includes('xuất cấp cứu trợ')) ||
              (typeof item.note === 'string' && item.note.includes('xuất cấp cứu trợ'));

            const emergencyInfo = isReliefMission
              ? { label: 'Xuất cấp & Tiếp tế cứu trợ', icon: 'package-variant-closed', color: '#059669' }
              : getEmergencyLabel(sos?.emergencyType);

            const contactPhone = sos?.contactPhone || sos?.secondaryPhone || item.assignedBy?.phone;
            const victimName = sos?.citizenId?.fullName || 'Người dân báo nạn';
            const recipientName =
              item.recipientName ||
              (typeof item.note === 'string' && item.note.match(/Người nhận:\s*([^.)\]]+)/)?.[1]?.trim()) ||
              (typeof sos?.description === 'string' && sos.description.match(/Người nhận:\s*([^.)\]]+)/)?.[1]?.trim()) ||
              victimName;

            const vehicle = item.vehicleId;

            const missionSupplies =
              item.supplies ||
              (item as any).reliefItems ||
              sos?.supplies ||
              (isReliefMission
                ? []
                : [
                    { name: 'Áo phao cứu sinh', quantity: Math.max(1, sos?.people || 2), unit: 'Chiếc' },
                    { name: 'Túi sơ cứu y tế', quantity: 1, unit: 'Bộ' },
                    { name: 'Nước uống tiệt trùng', quantity: Math.ceil(Math.max(1, sos?.people || 2) / 2), unit: 'Thùng' },
                  ]);

            const totalSuppliesCount = missionSupplies.reduce(
              (acc: number, s: any) => acc + (Number(s.quantity) || 0),
              0
            );

            return (
              <View key={item._id} style={styles.missionCard}>
                {/* Top Card: SOS Code & Priority */}
                <View style={styles.cardHeaderRow}>
                  <View style={styles.codeRow}>
                    <Text style={styles.codePrefix}>MÃ SOS:</Text>
                    <Text style={styles.codeText}>{sos?.sosCode || 'SOS-KHẨN'}</Text>
                  </View>
                  {renderPriorityBadge(item.priority || sos?.priority)}
                </View>

                {/* Emergency Category Tag */}
                <View style={styles.categoryRow}>
                  <View
                    style={[
                      styles.categoryBadge,
                      { backgroundColor: `${emergencyInfo.color}15` },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={emergencyInfo.icon as any}
                      size={16}
                      color={emergencyInfo.color}
                    />
                    <Text
                      style={[styles.categoryText, { color: emergencyInfo.color }]}
                    >
                      {emergencyInfo.label}
                    </Text>
                  </View>

                  <View style={[styles.victimCountBadge, isReliefMission && { backgroundColor: '#ECFDF5' }]}>
                    {isReliefMission ? (
                      <MaterialCommunityIcons name="cube-send" size={13} color="#059669" />
                    ) : (
                      <Feather name="users" size={13} color="#0F172A" />
                    )}
                    <Text style={[styles.victimCountText, isReliefMission && { color: '#059669', fontWeight: '800' }]}>
                      {isReliefMission
                        ? totalSuppliesCount > 0
                          ? `${totalSuppliesCount} kiện/thùng hàng`
                          : 'Tiếp tế nhu yếu phẩm'
                        : `${sos?.people || 1} người`}
                    </Text>
                  </View>
                </View>

                {/* Stepper tiến trình nhiệm vụ */}
                {renderProgressStep(item.status, isReliefMission)}

                {/* Chi tiết tiếp tế / cứu hộ & Hiện trường */}
                <View style={styles.detailsBox}>
                  {/* Địa chỉ / Điểm giao */}
                  <View style={styles.detailRow}>
                    <Feather
                      name={isReliefMission ? 'navigation' : 'map-pin'}
                      size={15}
                      color={isReliefMission ? '#059669' : '#EF4444'}
                      style={styles.detailIcon}
                    />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>
                        {isReliefMission ? 'Điểm tiếp nhận cứu trợ:' : 'Địa điểm cứu hộ:'}
                      </Text>
                      <Text style={styles.detailValueAddress}>
                        {item.destination || sos?.address || 'Chưa cập nhật địa chỉ'}
                      </Text>
                    </View>
                  </View>

                  {/* Thông tin người nhận / Nạn nhân */}
                  <View style={styles.detailRow}>
                    <Feather
                      name={isReliefMission ? 'user-check' : 'user'}
                      size={15}
                      color={isReliefMission ? '#059669' : '#0284C7'}
                      style={styles.detailIcon}
                    />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>
                        {isReliefMission ? 'Người nhận / Cán bộ đầu mối:' : 'Nạn nhân / Người liên hệ:'}
                      </Text>
                      <Text style={styles.detailValue}>
                        {isReliefMission ? recipientName : victimName}{' '}
                        {contactPhone ? `• ${contactPhone}` : ''}
                      </Text>
                    </View>
                    {contactPhone && (
                      <TouchableOpacity
                        style={[styles.callNowBtn, isReliefMission && { backgroundColor: '#059669' }]}
                        onPress={() => handleCallVictim(contactPhone)}
                        activeOpacity={0.8}
                      >
                        <Feather name="phone-call" size={13} color="#FFFFFF" />
                        <Text style={styles.callNowText}>Gọi</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Lời nhắn / Ghi chú lệnh xuất cấp */}
                  {(item.note || sos?.description) && (
                    <View style={styles.detailRow}>
                      <Feather
                        name={isReliefMission ? 'file-text' : 'message-square'}
                        size={15}
                        color={isReliefMission ? '#0284C7' : '#D97706'}
                        style={styles.detailIcon}
                      />
                      <View style={styles.detailContent}>
                        <Text style={styles.detailLabel}>
                          {isReliefMission ? 'Lệnh xuất cấp & Ghi chú:' : 'Hiện trường ghi nhận:'}
                        </Text>
                        <Text style={styles.detailValueDesc}>
                          "{item.note || sos?.description}"
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Phương tiện cơ động được giao */}
                  {vehicle && (
                    <View style={styles.vehicleRow}>
                      <MaterialCommunityIcons
                        name={vehicle.type === 'BOAT' ? 'ferry' : 'car'}
                        size={16}
                        color="#0066FF"
                      />
                      <Text style={styles.vehicleText}>
                        Phương tiện phân bổ: <Text style={{ fontWeight: '700' }}>{vehicle.plateNumber}</Text> ({vehicle.type === 'BOAT' ? 'Xuồng cứu hộ' : 'Xe cơ động'})
                      </Text>
                    </View>
                  )}

                  {/* Vật tư & Trang thiết bị cấp phát theo lệnh phân công */}
                  {missionSupplies.length > 0 && (
                    <View style={styles.suppliesCardBox}>
                      <View style={styles.suppliesHeaderRow}>
                        <MaterialCommunityIcons name="package-variant-closed" size={15} color="#15803D" />
                        <Text style={styles.suppliesHeaderTitle}>
                          {isReliefMission
                            ? 'DANH MỤC NHU YẾU PHẨM XUẤT CẤP:'
                            : 'VẬT TƯ CẤP THEO PHÂN CÔNG:'}
                        </Text>
                      </View>
                      <View style={styles.suppliesTagsWrap}>
                        {missionSupplies.map((sup: any, sIdx: number) => (
                          <View key={sIdx} style={styles.supplyItemChip}>
                            <Text style={styles.supplyItemChipText}>
                              {sup.name}{' '}
                              <Text style={{ fontWeight: '800', color: '#166534' }}>
                                ({sup.quantity} {sup.unit || 'món'})
                              </Text>
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  {/* Bằng chứng hình ảnh bàn giao thực tế (Minh bạch PCTT) */}
                  {((item.proofImages && item.proofImages.length > 0) ||
                    (item.status === 'COMPLETED' && (sos as any)?.images && (sos as any).images.length > 0)) && (
                    <View style={styles.cardProofBox}>
                      <View style={styles.cardProofHeader}>
                        <Feather name="shield" size={13} color="#059669" />
                        <Text style={styles.cardProofTitle}>
                          BẰNG CHỨNG BÀN GIAO THỰC TẾ (MINH BẠCH):
                        </Text>
                      </View>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.cardProofScroll}
                      >
                        {(item.proofImages && item.proofImages.length > 0
                          ? item.proofImages
                          : (sos as any)?.images || []
                        ).map((imgUrl: string, imgIdx: number) => (
                          <TouchableOpacity
                            key={imgIdx}
                            onPress={() => setPreviewImageUri(imgUrl)}
                            activeOpacity={0.8}
                            style={styles.cardProofThumbWrap}
                          >
                            <Image source={{ uri: imgUrl }} style={styles.cardProofThumb} />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      {item.actualRecipient && (
                        <Text style={styles.cardProofRecipientText}>
                          👤 Người nhận thực tế: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{item.actualRecipient}</Text>
                        </Text>
                      )}
                    </View>
                  )}
                </View>

                {/* Các nút hành động: Đầy đủ các bước tiến trình & Điều hướng bản đồ */}
                <View style={styles.actionRow}>
                  {item.status !== 'COMPLETED' ? (
                    <>
                      {/* Nút chính chuyển đổi trạng thái tác chiến */}
                      {['PENDING', 'ASSIGNED'].includes(item.status) && (
                        <TouchableOpacity
                          style={[styles.primaryActionBtn, { flex: 1.3 }]}
                          onPress={() => handleUpdateStatus(item._id, 'ACCEPTED')}
                          activeOpacity={0.85}
                          disabled={isSubmitting}
                        >
                          <LinearGradient
                            colors={isReliefMission ? ['#059669', '#047857'] : ['#0066FF', '#0052CC']}
                            style={styles.gradientBtn}
                          >
                            <Feather name="check-circle" size={15} color="#FFFFFF" />
                            <Text style={styles.primaryActionText}>
                              {isReliefMission ? 'Nhận Lệnh Tiếp Tế' : 'Tiếp Nhận Nhiệm Vụ'}
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      )}

                      {item.status === 'ACCEPTED' && (
                        <TouchableOpacity
                          style={[styles.primaryActionBtn, { flex: 1.3 }]}
                          onPress={() => handleUpdateStatus(item._id, 'EN_ROUTE')}
                          activeOpacity={0.85}
                          disabled={isSubmitting}
                        >
                          <LinearGradient
                            colors={['#F59E0B', '#D97706']}
                            style={styles.gradientBtn}
                          >
                            <MaterialCommunityIcons name="truck-fast" size={16} color="#FFFFFF" />
                            <Text style={styles.primaryActionText}>
                              {isReliefMission ? 'Xuất Kho Vận Chuyển' : 'Xuất Phát Ứng Cứu'}
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      )}

                      {['EN_ROUTE', 'DISPATCHED', 'ON_THE_WAY'].includes(item.status) && (
                        <TouchableOpacity
                          style={[styles.primaryActionBtn, { flex: 1.3 }]}
                          onPress={() => handleUpdateStatus(item._id, 'ARRIVED')}
                          activeOpacity={0.85}
                          disabled={isSubmitting}
                        >
                          <LinearGradient
                            colors={['#8B5CF6', '#7C3AED']}
                            style={styles.gradientBtn}
                          >
                            <Ionicons name="location" size={16} color="#FFFFFF" />
                            <Text style={styles.primaryActionText}>
                              {isReliefMission ? 'Đã Đến Điểm Giao' : 'Đã Đến Hiện Trường'}
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      )}

                      {['IN_PROGRESS', 'ARRIVED', 'RESCUING'].includes(item.status) && (
                        <TouchableOpacity
                          style={[styles.primaryActionBtn, { flex: 1.3 }]}
                          onPress={() => {
                            setSelectedMission(item);
                            const initialRecipient =
                              item.actualRecipient ||
                              item.recipientName ||
                              (typeof item.note === 'string' &&
                                item.note.match(/Người nhận:\s*([^.)\]]+)/)?.[1]?.trim()) ||
                              (typeof item.sosRequestId?.description === 'string' &&
                                item.sosRequestId.description.match(/Người nhận:\s*([^.)\]]+)/)?.[1]?.trim()) ||
                              item.sosRequestId?.citizenId?.fullName ||
                              '';
                            setActualRecipient(initialRecipient);
                            setProofPhotos([]);
                            setCompleteNote('');
                            setCompleteModalVisible(true);
                          }}
                          activeOpacity={0.85}
                          disabled={isSubmitting}
                        >
                          <LinearGradient
                            colors={['#10B981', '#059669']}
                            style={styles.gradientBtn}
                          >
                            <Feather name="award" size={15} color="#FFFFFF" />
                            <Text style={styles.primaryActionText}>
                              {isReliefMission ? 'Bàn Giao & Hoàn Tất' : 'Báo Cáo Hoàn Thành'}
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      )}

                      {/* Nút Chỉ đường mở Workspace bản đồ */}
                      <TouchableOpacity
                        style={[styles.mapActionBtn, { flex: 0.9 }]}
                        onPress={() => handleViewOnMap(item)}
                        activeOpacity={0.8}
                      >
                        <Feather name="navigation" size={14} color="#0066FF" />
                        <Text style={styles.mapActionText}>Chỉ đường</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={styles.completedBadge}>
                      <Feather name="check-circle" size={16} color="#059669" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.completedBadgeText}>
                          {isReliefMission ? 'Đã bàn giao cứu trợ thành công' : 'Đã cứu nạn thành công'}
                        </Text>
                        {item.actualRecipient ? (
                          <Text style={styles.completedSubText}>
                            Đại diện tiếp nhận: {item.actualRecipient}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* 3. Modal Hoàn thành nhiệm vụ cứu nạn / bàn giao cứu trợ */}
      <Modal
        visible={completeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCompleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
              {(() => {
                const isSelectedRelief =
                  selectedMission?.missionType === 'RELIEF_DISPATCH' ||
                  selectedMission?.sosRequestId?.emergencyType === 'RELIEF' ||
                  (typeof selectedMission?.sosRequestId?.description === 'string' &&
                    selectedMission.sosRequestId.description.includes('xuất cấp cứu trợ')) ||
                  (typeof selectedMission?.note === 'string' &&
                    selectedMission.note.includes('xuất cấp cứu trợ'));

                const missionSupplies =
                  selectedMission?.supplies ||
                  (selectedMission as any)?.reliefItems ||
                  selectedMission?.sosRequestId?.supplies ||
                  [];

                return (
                  <>
                    <View style={styles.modalHeader}>
                      <View style={[styles.modalIconWrap, isSelectedRelief && { backgroundColor: '#ECFDF5' }]}>
                        <Feather
                          name={isSelectedRelief ? 'package' : 'award'}
                          size={24}
                          color="#059669"
                        />
                      </View>
                      <Text style={styles.modalTitle}>
                        {isSelectedRelief ? 'Xác Nhận Bàn Giao Cứu Trợ' : 'Báo Cáo Hoàn Thành'}
                      </Text>
                      <Text style={styles.modalSubtitle}>
                        {isSelectedRelief
                          ? 'Xác nhận và lưu vết minh bạch bàn giao hàng cho ca '
                          : 'Xác nhận đã hoàn tất cứu hộ cho ca '}
                        <Text style={{ fontWeight: '700' }}>
                          {selectedMission?.sosRequestId?.sosCode}
                        </Text>
                      </Text>
                    </View>

                    {/* Danh mục vật tư xuất cấp cần bàn giao */}
                    {isSelectedRelief && missionSupplies.length > 0 && (
                      <View style={styles.suppliesConfirmBox}>
                        <View style={styles.suppliesConfirmHeader}>
                          <MaterialCommunityIcons name="clipboard-check-outline" size={15} color="#15803D" />
                          <Text style={styles.suppliesConfirmTitle}>DANH MỤC VẬT TƯ CẦN BÀN GIAO</Text>
                        </View>
                        <View style={styles.suppliesConfirmList}>
                          {missionSupplies.map((s: any, idx: number) => (
                            <View key={idx} style={styles.suppliesConfirmItem}>
                              <Text style={styles.suppliesConfirmName} numberOfLines={1}>
                                • {s.name}
                              </Text>
                              <Text style={styles.suppliesConfirmQty}>
                                x{s.quantity} {s.unit || 'món'}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Người tiếp nhận thực tế */}
                    <View style={styles.modalInputBox}>
                      <Text style={styles.inputLabel}>
                        {isSelectedRelief ? 'Họ tên người nhận / Đại diện bàn giao (*Bắt buộc):' : 'Người tiếp nhận / Nạn nhân:'}
                      </Text>
                      <TextInput
                        style={[styles.textInput, { minHeight: 44, height: 44, paddingVertical: 8 }]}
                        placeholder="Ví dụ: Ông Nguyễn Văn A (Trưởng thôn)..."
                        placeholderTextColor="#94A3B8"
                        value={actualRecipient}
                        onChangeText={setActualRecipient}
                      />
                    </View>

                    {/* Khu vực chụp ảnh bằng chứng minh bạch */}
                    <View style={styles.modalInputBox}>
                      <View style={styles.proofHeaderRow}>
                        <Text style={styles.inputLabel}>
                          📸 Ảnh bằng chứng bàn giao {isSelectedRelief ? '(*Bắt buộc minh bạch)' : ''} ({proofPhotos.length}/10):
                        </Text>
                        <Text
                          style={[
                            styles.proofBadge,
                            isSelectedRelief && {
                              backgroundColor: proofPhotos.length === 0 ? '#FEE2E2' : '#DCFCE7',
                              color: proofPhotos.length === 0 ? '#DC2626' : '#059669',
                            },
                          ]}
                        >
                          {isSelectedRelief
                            ? proofPhotos.length === 0
                              ? '⚠️ Cần tối thiểu 1 ảnh'
                              : '✓ Đã có ảnh'
                            : 'Minh bạch PCTT'}
                        </Text>
                      </View>
                      <Text style={styles.proofDesc}>
                        Chụp ảnh trao hàng tận tay, kiện hàng tại điểm giao hoặc biên bản ký nhận để lưu vết minh bạch vào hệ thống.
                      </Text>

                      {isSelectedRelief && proofPhotos.length === 0 && (
                        <View style={styles.proofRequiredWarning}>
                          <Ionicons name="alert-circle" size={15} color="#DC2626" />
                          <Text style={styles.proofRequiredText}>
                            Bắt buộc minh bạch: Bạn phải chụp ít nhất 1 ảnh bằng chứng để có thể xác nhận bàn giao.
                          </Text>
                        </View>
                      )}

                      {/* 2 nút Chụp ảnh & Chọn từ thư viện */}
                      <View style={styles.proofActionButtonsRow}>
                        <TouchableOpacity
                          style={styles.proofBtnCamera}
                          onPress={takeProofPhoto}
                          disabled={isSubmitting || proofPhotos.length >= 10}
                          activeOpacity={0.8}
                        >
                          <Feather name="camera" size={15} color="#FFFFFF" />
                          <Text style={styles.proofBtnCameraText}>Chụp ảnh ngay</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.proofBtnGallery}
                          onPress={pickProofFromLibrary}
                          disabled={isSubmitting || proofPhotos.length >= 10}
                          activeOpacity={0.8}
                        >
                          <Feather name="image" size={15} color="#059669" />
                          <Text style={styles.proofBtnGalleryText}>Chọn từ máy</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Preview ảnh thumbnail */}
                      {proofPhotos.length > 0 && (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.proofThumbList}
                        >
                          {proofPhotos.map((photo, pIdx) => (
                            <View key={pIdx} style={styles.proofThumbWrap}>
                              <TouchableOpacity onPress={() => setPreviewImageUri(photo.uri)}>
                                <Image source={{ uri: photo.uri }} style={styles.proofThumbImg} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.proofThumbRemoveBtn}
                                onPress={() => removeProofPhoto(pIdx)}
                              >
                                <Feather name="x" size={11} color="#FFFFFF" />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </ScrollView>
                      )}
                    </View>

                    {/* Ghi chú / Biên bản bàn giao */}
                    <View style={styles.modalInputBox}>
                      <Text style={styles.inputLabel}>
                        {isSelectedRelief ? 'Biên bản & Ghi chú bàn giao:' : 'Ghi chú kết quả cứu hộ:'}
                      </Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder={
                          isSelectedRelief
                            ? 'Ví dụ: Đã bàn giao đủ số lượng hàng theo phiếu xuất cho người nhận, hàng nguyên vẹn...'
                            : 'Ví dụ: Đã đưa 3 người dân về điểm sơ tán an toàn, sức khỏe ổn định...'
                        }
                        placeholderTextColor="#94A3B8"
                        multiline
                        numberOfLines={3}
                        value={completeNote}
                        onChangeText={setCompleteNote}
                      />
                    </View>

                    <View style={styles.modalActionRow}>
                      <TouchableOpacity
                        style={styles.modalCancelBtn}
                        onPress={() => {
                          setCompleteModalVisible(false);
                          setSelectedMission(null);
                          setProofPhotos([]);
                          setActualRecipient('');
                        }}
                        disabled={isSubmitting}
                      >
                        <Text style={styles.modalCancelText}>Hủy bỏ</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.modalConfirmBtn,
                          isSelectedRelief && { backgroundColor: '#059669' },
                        ]}
                        onPress={handleConfirmComplete}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <ActivityIndicator size="small" color="#FFFFFF" />
                            <Text style={styles.modalConfirmText}>
                              {isUploadingProof ? 'Đang tải ảnh...' : 'Đang xử lý...'}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.modalConfirmText}>
                            {isSelectedRelief ? 'Xác nhận bàn giao' : 'Xác nhận hoàn thành'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal phóng to xem ảnh bằng chứng bàn giao */}
      <Modal
        visible={Boolean(previewImageUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUri(null)}
      >
        <View style={styles.imagePreviewOverlay}>
          <TouchableOpacity
            style={styles.imagePreviewCloseBtn}
            onPress={() => setPreviewImageUri(null)}
          >
            <Feather name="x" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {previewImageUri && (
            <Image
              source={{ uri: previewImageUri }}
              style={styles.imagePreviewFull}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* 4. Modal SOS khẩn cấp dành cho Cứu hộ viên khi gặp sự cố */}
      <Modal
        visible={sosModalVisible}
        animationType="slide"
        onRequestClose={() => setSosModalVisible(false)}
      >
        <View style={{ flex: 1 }}>
          <View style={[styles.sosModalHeader, { paddingTop: Math.max(insets.top, 16) }]}>
            <Text style={styles.sosModalTitle}>🚨 Báo nạn khẩn cấp Cứu hộ viên</Text>
            <TouchableOpacity
              onPress={() => setSosModalVisible(false)}
              style={styles.sosModalCloseBtn}
            >
              <Feather name="x" size={22} color="#0F172A" />
            </TouchableOpacity>
          </View>
          <SosScreen onNavigateToHome={() => setSosModalVisible(false)} />
        </View>
      </Modal>

      {/* 5. Modal Tác chiến Thực địa GrabDriver */}
      <RescuerMissionWorkspaceModal
        visible={workspaceVisible}
        assignmentId={activeWorkspaceMission?._id}
        initialSosData={activeWorkspaceMission?.sosRequestId || (activeWorkspaceMission as any)?.sosId}
        initialAssignmentData={activeWorkspaceMission}
        onClose={() => {
          setWorkspaceVisible(false);
          setActiveWorkspaceMission(null);
          fetchMissions({ isSilent: true });
        }}
        onMissionCompleted={() => {
          setWorkspaceVisible(false);
          setActiveWorkspaceMission(null);
          fetchMissions({ isSilent: true });
        }}
        onMissionUpdated={(updatedStatus, missionId) => {
          if (missionId) {
            setMissions((prev) =>
              prev.map((m) =>
                m._id === missionId ? { ...m, status: updatedStatus as SosAssignmentStatus } : m
              )
            );
          }
          fetchMissions({ isSilent: true });
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerContainer: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitleBox: {
    flex: 1,
  },
  badgeLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  headerOverline: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    width: 'auto',
  },
  headerSosText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  tacticalUnitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  unitCol: {
    flex: 1.3,
  },
  unitColRight: {
    flex: 1,
    paddingLeft: 10,
  },
  unitHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  unitColLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  unitColValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  unitColValuePlate: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 0.3,
  },
  unitDivider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
  segmentTextActive: {
    color: '#0066FF',
    fontWeight: '700',
  },
  contentScroll: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingWrap: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  emptyRefreshText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0066FF',
  },
  missionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  codePrefix: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  codeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priorityCritical: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  priorityTextCritical: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#DC2626',
  },
  priorityHigh: {
    backgroundColor: '#FFEDD5',
    borderWidth: 1,
    borderColor: '#F97316',
  },
  priorityTextHigh: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#EA580C',
  },
  priorityMedium: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  priorityTextMedium: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#B45309',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  victimCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  victimCountText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  stepProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  stepCol: {
    alignItems: 'center',
    width: 58,
  },
  stepCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepCircleDone: {
    backgroundColor: '#10B981',
  },
  stepCircleCurrent: {
    backgroundColor: '#0066FF',
  },
  stepNumber: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  stepLabel: {
    fontSize: 9.5,
    color: '#94A3B8',
    fontWeight: '600',
    textAlign: 'center',
  },
  stepLabelDone: {
    color: '#0F172A',
  },
  stepLabelCurrent: {
    color: '#0066FF',
    fontWeight: '700',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E2E8F0',
    marginTop: -16,
  },
  stepLineDone: {
    backgroundColor: '#10B981',
  },
  detailsBox: {
    gap: 8,
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  detailIcon: {
    marginTop: 2,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  detailValueAddress: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  detailValue: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
    marginTop: 1,
  },
  detailValueDesc: {
    fontSize: 12,
    color: '#334155',
    fontStyle: 'italic',
    marginTop: 1,
  },
  callNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10B981',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },
  callNowText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    padding: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  vehicleText: {
    fontSize: 11.5,
    color: '#1E293B',
  },
  suppliesCardBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  suppliesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  suppliesHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
    letterSpacing: 0.3,
  },
  suppliesTagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  supplyItemChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
  },
  supplyItemChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  mapActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#93C5FD',
  },
  mapActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0066FF',
  },
  primaryActionBtn: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  gradientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  primaryActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  completedBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingVertical: 11,
    borderRadius: 10,
  },
  completedBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
  },
  modalInputBox: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    textAlignVertical: 'top',
    minHeight: 70,
  },
  modalActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#64748B',
  },
  modalConfirmBtn: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#059669',
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sosModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  sosModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#EF4444',
  },
  sosModalCloseBtn: {
    padding: 6,
  },
  openWorkspaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0F9FF',
    borderWidth: 1.5,
    borderColor: '#0284C7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  openWorkspaceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  openWorkspacePulse: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  openWorkspaceTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0369A1',
    letterSpacing: 0.3,
  },
  openWorkspaceSubtitle: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },

  // Supplies Confirm Checklist in Modal
  suppliesConfirmBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  suppliesConfirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  suppliesConfirmTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.5,
  },
  suppliesConfirmList: {
    gap: 4,
  },
  suppliesConfirmItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suppliesConfirmName: {
    fontSize: 12,
    color: '#1E293B',
    fontWeight: '600',
    flex: 1,
  },
  suppliesConfirmQty: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },

  // Proof Images in Modal
  proofHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  proofBadge: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#059669',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  proofRequiredWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
  },
  proofRequiredText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '600',
    flex: 1,
  },
  proofDesc: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 8,
    lineHeight: 15,
  },
  proofActionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  proofBtnCamera: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingVertical: 8,
    borderRadius: 8,
  },
  proofBtnCameraText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  proofBtnGallery: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 8,
    borderRadius: 8,
  },
  proofBtnGalleryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  proofThumbList: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  proofThumbWrap: {
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  proofThumbImg: {
    width: '100%',
    height: '100%',
  },
  proofThumbRemoveBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Proof Images in Mission Card
  cardProofBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cardProofHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  cardProofTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.3,
  },
  cardProofScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  cardProofThumbWrap: {
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cardProofThumb: {
    width: '100%',
    height: '100%',
  },
  cardProofRecipientText: {
    fontSize: 11.5,
    color: '#475569',
    marginTop: 4,
  },
  completedSubText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    marginTop: 2,
  },

  // Full Image Lightbox Preview Modal
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreviewCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 99,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  imagePreviewFull: {
    width: '92%',
    height: '75%',
  },
});

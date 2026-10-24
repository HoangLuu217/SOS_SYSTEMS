import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
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

  // Modal hoàn thành nhiệm vụ
  const [completeModalVisible, setCompleteModalVisible] = useState(false);
  const [selectedMission, setSelectedMission] = useState<SosAssignmentData | null>(null);
  const [completeNote, setCompleteNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Tải danh sách nhiệm vụ từ backend
  const fetchMissions = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await backendApi.getMyAssignments();
      if (res.success && Array.isArray(res.data)) {
        setMissions(res.data);
        const activeCount = res.data.filter(
          (m) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(m.status)
        ).length;
        onMissionsCountChange?.(activeCount);
      } else {
        setMissions([]);
        onMissionsCountChange?.(0);
      }
    } catch {
      // Giữ nguyên danh sách cũ nếu lỗi kết nối
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onMissionsCountChange]);

  useEffect(() => {
    fetchMissions();

    // Lắng nghe realtime tín hiệu điều phối và cập nhật nhiệm vụ
    const sub = DeviceEventEmitter.addListener('sos:sync', () => {
      fetchMissions(true);
    });
    const interval = setInterval(() => {
      fetchMissions(true);
    }, 15000);

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
    note?: string
  ) => {
    try {
      setIsSubmitting(true);
      let res;
      if (targetStatus === 'ACCEPTED') {
        res = await backendApi.acceptAssignment(missionId);
      } else {
        res = await backendApi.updateAssignmentStatus(missionId, targetStatus, note);
      }

      if (res.success) {
        Alert.alert('Thành công', 'Đã cập nhật trạng thái nhiệm vụ tác chiến');
        fetchMissions(true);
      } else {
        Alert.alert('Thất bại', res.message || 'Không thể cập nhật trạng thái');
      }
    } catch (err: any) {
      Alert.alert('Lỗi kết nối', err.message || 'Có lỗi xảy ra khi cập nhật');
    } finally {
      setIsSubmitting(false);
      setCompleteModalVisible(false);
      setSelectedMission(null);
      setCompleteNote('');
    }
  };

  // Xác nhận hoàn thành
  const handleConfirmComplete = () => {
    if (!selectedMission) return;
    handleUpdateStatus(selectedMission._id, 'COMPLETED', completeNote);
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

  // Render trạng thái tiến trình
  const renderProgressStep = (currentStatus: SosAssignmentStatus) => {
    const steps: { key: SosAssignmentStatus; label: string }[] = [
      { key: 'PENDING', label: 'Lệnh điều phối' },
      { key: 'ACCEPTED', label: 'Đã nhận' },
      { key: 'EN_ROUTE', label: 'Xuất phát' },
      { key: 'IN_PROGRESS', label: 'Đang cứu hộ' },
      { key: 'COMPLETED', label: 'Hoàn thành' },
    ];

    const getStepIndex = (st: SosAssignmentStatus) => {
      if (st === 'PENDING') return 0;
      if (st === 'ACCEPTED') return 1;
      if (['DISPATCHED', 'EN_ROUTE'].includes(st)) return 2;
      if (['ARRIVED', 'IN_PROGRESS'].includes(st)) return 3;
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
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

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
              onPress={() => fetchMissions(true)}
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
            onRefresh={() => fetchMissions(true)}
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
                onPress={() => fetchMissions(true)}
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
            const emergencyInfo = getEmergencyLabel(sos?.emergencyType);
            const contactPhone = sos?.contactPhone || sos?.secondaryPhone;
            const victimName = sos?.citizenId?.fullName || 'Người dân báo nạn';
            const vehicle = item.vehicleId;

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

                  <View style={styles.victimCountBadge}>
                    <Feather name="users" size={13} color="#0F172A" />
                    <Text style={styles.victimCountText}>
                      {sos?.people || 1} người
                    </Text>
                  </View>
                </View>

                {/* Stepper tiến trình nhiệm vụ */}
                {renderProgressStep(item.status)}

                {/* Chi tiết nạn nhân & Hiện trường */}
                <View style={styles.detailsBox}>
                  {/* Địa chỉ */}
                  <View style={styles.detailRow}>
                    <Feather name="map-pin" size={15} color="#EF4444" style={styles.detailIcon} />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Địa điểm cứu hộ:</Text>
                      <Text style={styles.detailValueAddress}>
                        {sos?.address || 'Chưa cập nhật địa chỉ'}
                      </Text>
                    </View>
                  </View>

                  {/* Thông tin liên hệ người báo */}
                  <View style={styles.detailRow}>
                    <Feather name="user" size={15} color="#0284C7" style={styles.detailIcon} />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Nạn nhân / Người liên hệ:</Text>
                      <Text style={styles.detailValue}>
                        {victimName} {contactPhone ? `• ${contactPhone}` : ''}
                      </Text>
                    </View>
                    {contactPhone && (
                      <TouchableOpacity
                        style={styles.callNowBtn}
                        onPress={() => handleCallVictim(contactPhone)}
                        activeOpacity={0.8}
                      >
                        <Feather name="phone-call" size={13} color="#FFFFFF" />
                        <Text style={styles.callNowText}>Gọi</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Lời nhắn / Mô tả hiện trường */}
                  {sos?.description && (
                    <View style={styles.detailRow}>
                      <Feather name="message-square" size={15} color="#D97706" style={styles.detailIcon} />
                      <View style={styles.detailContent}>
                        <Text style={styles.detailLabel}>Hiện trường ghi nhận:</Text>
                        <Text style={styles.detailValueDesc}>"{sos.description}"</Text>
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
                  {(() => {
                    const missionSupplies =
                      item.supplies ||
                      (item as any).reliefItems ||
                      sos?.supplies ||
                      [
                        { name: 'Áo phao cứu sinh', quantity: Math.max(1, sos?.people || 2), unit: 'Chiếc' },
                        { name: 'Túi sơ cứu y tế', quantity: 1, unit: 'Bộ' },
                        { name: 'Nước uống tiệt trùng', quantity: Math.ceil(Math.max(1, sos?.people || 2) / 2), unit: 'Thùng' },
                      ];

                    if (!missionSupplies || missionSupplies.length === 0) return null;

                    return (
                      <View style={styles.suppliesCardBox}>
                        <View style={styles.suppliesHeaderRow}>
                          <MaterialCommunityIcons name="package-variant-closed" size={15} color="#15803D" />
                          <Text style={styles.suppliesHeaderTitle}>VẬT TƯ CẤP THEO PHÂN CÔNG:</Text>
                        </View>
                        <View style={styles.suppliesTagsWrap}>
                          {missionSupplies.map((sup: any, sIdx: number) => (
                            <View key={sIdx} style={styles.supplyItemChip}>
                              <Text style={styles.supplyItemChipText}>
                                {sup.name} <Text style={{ fontWeight: '800', color: '#166534' }}>({sup.quantity} {sup.unit || 'món'})</Text>
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    );
                  })()}
                </View>

                {/* Các nút hành động: Bên ngoài chỉ xem & điều hướng tác chiến */}
                <View style={styles.actionRow}>
                  {item.status !== 'COMPLETED' ? (
                    <TouchableOpacity
                      style={styles.mapActionBtn}
                      onPress={() => handleViewOnMap(item)}
                      activeOpacity={0.8}
                    >
                      <Feather name="navigation" size={16} color="#0066FF" />
                      <Text style={styles.mapActionText}>Chỉ đường</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.completedBadge}>
                      <Feather name="check-circle" size={16} color="#059669" />
                      <Text style={styles.completedBadgeText}>Đã cứu nạn thành công</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* 3. Modal Hoàn thành nhiệm vụ cứu nạn */}
      <Modal
        visible={completeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCompleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrap}>
                <Feather name="award" size={24} color="#059669" />
              </View>
              <Text style={styles.modalTitle}>Báo cáo Hoàn thành</Text>
              <Text style={styles.modalSubtitle}>
                Xác nhận đã hoàn tất cứu hộ cho ca{' '}
                <Text style={{ fontWeight: '700' }}>
                  {selectedMission?.sosRequestId?.sosCode}
                </Text>
              </Text>
            </View>

            <View style={styles.modalInputBox}>
              <Text style={styles.inputLabel}>Ghi chú kết quả cứu hộ:</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ví dụ: Đã đưa 3 người dân về điểm sơ tán an toàn, sức khỏe ổn định..."
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
                }}
                disabled={isSubmitting}
              >
                <Text style={styles.modalCancelText}>Hủy bỏ</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleConfirmComplete}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Xác nhận hoàn thành</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
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
          fetchMissions(true);
        }}
        onMissionCompleted={() => {
          setWorkspaceVisible(false);
          setActiveWorkspaceMission(null);
          fetchMissions(true);
        }}
        onMissionUpdated={(updatedStatus, missionId) => {
          if (missionId) {
            setMissions((prev) =>
              prev.map((m) =>
                m._id === missionId ? { ...m, status: updatedStatus as SosAssignmentStatus } : m
              )
            );
          }
          fetchMissions(true);
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
});

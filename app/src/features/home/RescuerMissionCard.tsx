import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  DeviceEventEmitter,
} from 'react-native';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { backendApi, RescuerAssignmentItem } from '@/api';
import { RescuerMissionWorkspaceModal } from '../sos/RescuerMissionWorkspaceModal';

export interface RescuerMissionCardProps {
  onMissionUpdated?: () => void;
}

export const RescuerMissionCard: React.FC<RescuerMissionCardProps> = ({ onMissionUpdated }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [activeAssignment, setActiveAssignment] = useState<RescuerAssignmentItem | null>(null);
  const [availableSosList, setAvailableSosList] = useState<any[]>([]);
  const [workspaceVisible, setWorkspaceVisible] = useState<boolean>(false);

  // Tải danh sách nhiệm vụ của cứu hộ viên
  const loadMissionData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await backendApi.getMyAssignments();
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        // Tìm nhiệm vụ chưa hoàn thành hoặc chưa hủy
        const active = res.data.find(
          (a: RescuerAssignmentItem) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(a.status)
        );
        setActiveAssignment(active || res.data[0]);
      } else {
        setActiveAssignment(null);
        // Nếu chưa có phân công, tải các ca SOS đang cần cứu nạn để cứu hộ viên có thể nhận
        const sosRes = await backendApi.getAvailableSosRequests();
        if (sosRes.success && Array.isArray(sosRes.data)) {
          setAvailableSosList(
            sosRes.data.filter((s: any) => ['VERIFIED', 'ASSIGNED'].includes(s.status)).slice(0, 3)
          );
        }
      }
    } catch (err) {
      console.log('Lỗi khi tải nhiệm vụ cứu hộ:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMissionData();

    // Lắng nghe tín hiệu Realtime qua Event Emitter
    const sub = DeviceEventEmitter.addListener('sos:sync', () => {
      loadMissionData();
    });

    const interval = setInterval(loadMissionData, 20000);

    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [loadMissionData]);

  // Tự động mở Workspace GrabDriver khi có lệnh điều phối mới (nổ nhiệm vụ)
  useEffect(() => {
    if (activeAssignment && activeAssignment.status === 'PENDING') {
      setWorkspaceVisible(true);
    }
  }, [activeAssignment?._id, activeAssignment?.status]);

  // Xử lý chuyển bước trạng thái nhiệm vụ tác chiến
  const handleAdvanceStatus = async (nextStatus: string, confirmMsg?: string) => {
    if (!activeAssignment) return;

    if (confirmMsg) {
      Alert.alert('Xác nhận tiến trình', confirmMsg, [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xác nhận', onPress: () => executeAdvanceStatus(nextStatus) },
      ]);
    } else {
      await executeAdvanceStatus(nextStatus);
    }
  };

  const executeAdvanceStatus = async (nextStatus: string) => {
    if (!activeAssignment) return;

    try {
      setActionLoading(true);
      let res;

      if (nextStatus === 'ACCEPTED' && activeAssignment.status === 'PENDING') {
        res = await backendApi.acceptAssignment(activeAssignment._id);
      } else {
        res = await backendApi.updateAssignmentStatus(activeAssignment._id, nextStatus);
      }

      if (res.success) {
        setActiveAssignment((prev) => (prev ? { ...prev, status: nextStatus as any } : null));
        Alert.alert('Thành công', 'Đã cập nhật tiến trình tác chiến lên hệ thống realtime!');
        if (onMissionUpdated) onMissionUpdated();
        loadMissionData();
      } else {
        // Thử fallback trực tiếp qua mã SOS
        const sosId =
          activeAssignment.sosRequestId?._id ||
          activeAssignment.sosRequestId ||
          activeAssignment.sosId;
        if (sosId) {
          const sosRes = await backendApi.updateSosMissionStatus(sosId, nextStatus);
          if (sosRes.success) {
            setActiveAssignment((prev) => (prev ? { ...prev, status: nextStatus as any } : null));
            Alert.alert('Thành công', 'Đã cập nhật tiến trình tác chiến lên hệ thống realtime!');
            if (onMissionUpdated) onMissionUpdated();
            loadMissionData();
            return;
          }
        }
        Alert.alert('Lỗi cập nhật', res.message || 'Không thể đổi trạng thái nhiệm vụ');
      }
    } catch (err: any) {
      Alert.alert('Lỗi', err?.message || 'Có lỗi khi cập nhật tiến trình');
    } finally {
      setActionLoading(false);
    }
  };

  // Cứu hộ viên chủ động tiếp nhận một ca SOS chờ điều phối
  const handleClaimSos = async (sosItem: any) => {
    try {
      setActionLoading(true);
      const res = await backendApi.updateSosMissionStatus(
        sosItem._id,
        'ACCEPTED',
        'Cứu hộ viên chủ động tiếp nhận nhiệm vụ từ ứng dụng di động'
      );
      if (res.success) {
        Alert.alert('Tiếp nhận thành công', `Bạn đã nhận lệnh ứng cứu cho ca ${sosItem.sosCode}!`);
        loadMissionData();
      } else {
        Alert.alert('Không thể nhận', res.message || 'Lỗi khi nhận nhiệm vụ');
      }
    } catch (err: any) {
      Alert.alert('Lỗi', err?.message || 'Không thể nhận nhiệm vụ');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !activeAssignment) {
    return (
      <View style={styles.cardContainer}>
        <ActivityIndicator size="small" color="#0284C7" />
        <Text style={styles.loadingText}>Đang nạp dữ liệu điều phối cứu nạn...</Text>
      </View>
    );
  }

  // TRƯỜNG HỢP 1: CÓ NHIỆM VỤ ĐANG TÁC CHIẾN
  if (activeAssignment && activeAssignment.status !== 'COMPLETED') {
    const sos = activeAssignment.sosRequestId || activeAssignment.sosId || {};
    const citizen = sos.citizenId || {};
    const citizenName = citizen.fullName || 'Người dân gặp nạn';
    const citizenPhone = citizen.phone || sos.contactPhone || '';
    const address = sos.address || 'Hiện trường cứu hộ';
    const description = sos.description || 'Cần hỗ trợ khẩn cấp tại hiện trường';
    const peopleCount = sos.people || 1;
    const sosCode = sos.sosCode || 'SOS';
    const currentStatus = activeAssignment.status;

    // Helper render thanh tiến trình
    const isAccepted = ['ACCEPTED', 'DISPATCHED', 'EN_ROUTE', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'RESCUING', 'COMPLETED'].includes(currentStatus);
    const isEnRoute = ['DISPATCHED', 'EN_ROUTE', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'RESCUING', 'COMPLETED'].includes(currentStatus);
    const isOnScene = ['ARRIVED', 'IN_PROGRESS', 'RESCUING', 'COMPLETED'].includes(currentStatus);

    return (
      <View style={styles.cardContainer}>
        {/* Header nhiệm vụ */}
        <View style={styles.cardHeader}>
          <View style={styles.badgeRow}>
            <View style={styles.sosCodeBadge}>
              <MaterialCommunityIcons name="shield-alert" size={14} color="#DC2626" />
              <Text style={styles.sosCodeText}>{sosCode}</Text>
            </View>
            <View style={styles.priorityBadge}>
              <Text style={styles.priorityBadgeText}>
                {sos.priority === 'CRITICAL' ? 'NGUY CẤP' : 'KHẨN CẤP'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={loadMissionData}
            activeOpacity={0.7}
          >
            <Feather name="refresh-cw" size={14} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Thanh tiến trình tác chiến */}
        <View style={styles.stepTrackWrap}>
          <View style={styles.stepItem}>
            <View style={[styles.stepDot, isAccepted && styles.stepDotCompleted]}>
              <Feather name={isAccepted ? 'check' : 'clock'} size={10} color="#FFFFFF" />
            </View>
            <Text style={[styles.stepLabel, isAccepted && styles.stepLabelActive]}>Xuất kích</Text>
          </View>

          <View style={[styles.stepLine, isEnRoute && styles.stepLineActive]} />

          <View style={styles.stepItem}>
            <View style={[styles.stepDot, isEnRoute && styles.stepDotCompleted]}>
              <Feather name="navigation" size={10} color="#FFFFFF" />
            </View>
            <Text style={[styles.stepLabel, isEnRoute && styles.stepLabelActive]}>Di chuyển</Text>
          </View>

          <View style={[styles.stepLine, isOnScene && styles.stepLineActive]} />

          <View style={styles.stepItem}>
            <View style={[styles.stepDot, isOnScene && styles.stepDotCompleted]}>
              <Feather name="map-pin" size={10} color="#FFFFFF" />
            </View>
            <Text style={[styles.stepLabel, isOnScene && styles.stepLabelActive]}>Hiện trường</Text>
          </View>
        </View>

        {/* Thông tin hiện trường & người dân */}
        <View style={styles.detailBox}>
          <View style={styles.detailRow}>
            <Feather name="map-pin" size={15} color="#0284C7" style={styles.detailIcon} />
            <Text style={styles.addressText} numberOfLines={2}>
              {address}
            </Text>
          </View>

          <View style={styles.detailDivider} />

          <View style={styles.peopleRow}>
            <View style={styles.citizenCol}>
              <Text style={styles.citizenLabel}>Người gặp nạn:</Text>
              <Text style={styles.citizenName}>{citizenName}</Text>
              {citizenPhone ? (
                <Text style={styles.citizenPhone}>{citizenPhone}</Text>
              ) : null}
            </View>

            {citizenPhone ? (
              <TouchableOpacity
                style={styles.callBtn}
                onPress={() => Linking.openURL(`tel:${citizenPhone}`)}
                activeOpacity={0.8}
              >
                <Feather name="phone-call" size={14} color="#FFFFFF" />
                <Text style={styles.callBtnText}>Gọi điện</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.infoPillsRow}>
            <View style={styles.infoPill}>
              <Feather name="users" size={12} color="#DC2626" />
              <Text style={styles.infoPillText}>{peopleCount} người cần trợ giúp</Text>
            </View>

            {description ? (
              <View style={[styles.infoPill, { backgroundColor: '#F1F5F9' }]}>
                <Feather name="info" size={12} color="#475569" />
                <Text style={[styles.infoPillText, { color: '#475569' }]} numberOfLines={1}>
                  {description}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* CÁC NÚT HÀNH ĐỘNG TIẾN TRÌNH TÁC CHIẾN */}
        <View style={styles.actionBtnContainer}>
          {actionLoading ? (
            <View style={styles.actionLoadingWrap}>
              <ActivityIndicator size="small" color="#0284C7" />
              <Text style={styles.actionLoadingText}>Đang cập nhật realtime lên máy chủ...</Text>
            </View>
          ) : (
            <>
              {currentStatus === 'PENDING' && (
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: '#0284C7' }]}
                  onPress={() => handleAdvanceStatus('ACCEPTED')}
                  activeOpacity={0.85}
                >
                  <Feather name="check-circle" size={17} color="#FFFFFF" />
                  <Text style={styles.primaryActionBtnText}>Tiếp Nhận Nhiệm Vụ Này</Text>
                </TouchableOpacity>
              )}

              {currentStatus === 'ACCEPTED' && (
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: '#F59E0B' }]}
                  onPress={() => handleAdvanceStatus('EN_ROUTE')}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons name="truck-fast" size={19} color="#FFFFFF" />
                  <Text style={styles.primaryActionBtnText}>Xuất Phát / Đang Di Chuyển</Text>
                </TouchableOpacity>
              )}

              {['EN_ROUTE', 'DISPATCHED', 'ON_THE_WAY'].includes(currentStatus) && (
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: '#7C3AED' }]}
                  onPress={() => handleAdvanceStatus('ARRIVED')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="location" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryActionBtnText}>Đã Tới Hiện Trường Cứu Trợ</Text>
                </TouchableOpacity>
              )}

              {currentStatus === 'ARRIVED' && (
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: '#EA580C' }]}
                  onPress={() => handleAdvanceStatus('IN_PROGRESS')}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons name="lifebuoy" size={19} color="#FFFFFF" />
                  <Text style={styles.primaryActionBtnText}>Bắt Đầu Tác Chiến Cứu Nạn</Text>
                </TouchableOpacity>
              )}

              {['IN_PROGRESS', 'RESCUING'].includes(currentStatus) && (
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: '#10B981' }]}
                  onPress={() =>
                    handleAdvanceStatus(
                      'COMPLETED',
                      'Xác nhận bạn đã hoàn thành xuất sắc ca cứu nạn này?'
                    )
                  }
                  activeOpacity={0.85}
                >
                  <Feather name="check-circle" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryActionBtnText}>Xác Nhận Hoàn Thành Nhiệm Vụ</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* GrabDriver Live HUD & Navigation Button */}
          <TouchableOpacity
            style={styles.openWorkspaceBtn}
            onPress={() => setWorkspaceVisible(true)}
            activeOpacity={0.88}
          >
            <View style={styles.openWorkspaceLeft}>
              <View style={styles.openWorkspacePulse}>
                <MaterialCommunityIcons name="navigation-variant" size={18} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.openWorkspaceTitle}>MÀN HÌNH ĐIỀU HƯỚNG TÁC CHIẾN</Text>
                <Text style={styles.openWorkspaceSubtitle}>Chế độ GrabDriver • Bản đồ OSRM & Cứu nạn</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color="#0284C7" />
          </TouchableOpacity>
        </View>

        {/* Modal Tác chiến Thực địa GrabDriver */}
        <RescuerMissionWorkspaceModal
          visible={workspaceVisible}
          assignmentId={activeAssignment?._id}
          initialSosData={activeAssignment?.sosRequestId || activeAssignment?.sosId}
          initialAssignmentData={activeAssignment}
          onClose={() => setWorkspaceVisible(false)}
          onMissionCompleted={() => {
            loadMissionData();
            if (onMissionUpdated) onMissionUpdated();
          }}
        />
      </View>
    );
  }

  // TRƯỜNG HỢP 2: CHƯA CÓ NHIỆM VỤ ĐƯỢC CHỈ ĐỊNH
  return (
    <View style={styles.cardContainer}>
      <View style={styles.emptyHeaderRow}>
        <View style={styles.statusDotGreen} />
        <Text style={styles.readyTitle}>Đội Cứu Hộ: Sẵn Sàng Tác Chiến</Text>
        <TouchableOpacity onPress={loadMissionData} style={styles.refreshIconBtn}>
          <Feather name="refresh-cw" size={14} color="#64748B" />
        </TouchableOpacity>
      </View>

      <Text style={styles.readyDesc}>
        Hệ thống đang kết nối trực tuyến với trung tâm chỉ huy điều phối. Khi có yêu cầu khẩn cấp được phân công, nhiệm vụ sẽ hiện ngay tại đây.
      </Text>

      {/* Danh sách các ca SOS đang chờ nhận nếu có */}
      {availableSosList.length > 0 && (
        <View style={styles.availableSection}>
          <Text style={styles.availableTitle}>Ca cứu nạn đang cần hỗ trợ gần đây:</Text>
          {availableSosList.map((item) => (
            <View key={item._id} style={styles.availableItemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.availableItemCode}>{item.sosCode}</Text>
                <Text style={styles.availableItemAddress} numberOfLines={1}>
                  {item.address}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.claimBtn}
                onPress={() => handleClaimSos(item)}
                disabled={actionLoading}
                activeOpacity={0.8}
              >
                <Text style={styles.claimBtnText}>Tiếp nhận</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sosCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  sosCodeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  priorityBadge: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  priorityBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  refreshBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  stepTrackWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepItem: {
    alignItems: 'center',
    gap: 3,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotCompleted: {
    backgroundColor: '#0284C7',
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  },
  stepLabelActive: {
    color: '#0284C7',
    fontWeight: '700',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
    marginBottom: 14,
  },
  stepLineActive: {
    backgroundColor: '#0284C7',
  },
  detailBox: {
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E0F2FE',
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  detailIcon: {
    marginTop: 2,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 18,
  },
  detailDivider: {
    height: 1,
    backgroundColor: '#BAE6FD',
    marginVertical: 10,
    opacity: 0.6,
  },
  peopleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  citizenCol: {
    flex: 1,
  },
  citizenLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  citizenName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  citizenPhone: {
    fontSize: 12,
    color: '#0284C7',
    fontWeight: '600',
    marginTop: 1,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  callBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  infoPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  infoPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
  },
  actionBtnContainer: {
    marginTop: 2,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 10,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryActionBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
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
  actionLoadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  actionLoadingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
  },
  emptyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  readyTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  refreshIconBtn: {
    padding: 4,
  },
  readyDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 17,
  },
  availableSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  availableTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  availableItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6,
  },
  availableItemCode: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  availableItemAddress: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
  claimBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  claimBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

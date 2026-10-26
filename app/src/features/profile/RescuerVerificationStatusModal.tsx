import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  SafeAreaView,
  StatusBar,
  DeviceEventEmitter,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

export interface RescuerVerificationStatusModalProps {
  visible: boolean;
  onClose: () => void;
  onUpdateProfile: () => void;
  onSelectTeam?: () => void;
  rescuerData?: any;
}

const SKILL_NAMES: Record<string, string> = {
  first_aid: 'Sơ cứu y tế',
  water_rescue: 'Cứu hộ đường thủy',
  evacuation: 'Sơ tán người dân',
  firefighting: 'Phòng cháy chữa cháy',
  relief_logistics: 'Tiếp tế lương thực',
  communication: 'Thông tin liên lạc',
  search_rescue: 'Tìm kiếm cứu nạn',
  technical_rescue: 'Cứu hộ kỹ thuật cao',
};

const VEHICLE_NAMES: Record<string, string> = {
  BOAT: 'Thuyền / Ca-nô',
  AMBULANCE: 'Xe cứu thương',
  TRUCK: 'Xe bán tải / Tải',
  MOTORBIKE: 'Xe máy cơ động',
  OTHER: 'Phương tiện khác',
};

export const RescuerVerificationStatusModal: React.FC<RescuerVerificationStatusModalProps> = ({
  visible,
  onClose,
  onUpdateProfile,
  onSelectTeam,
  rescuerData,
}) => {
  const [data, setData] = useState(rescuerData);

  useEffect(() => {
    setData(rescuerData);
  }, [rescuerData]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('rescuer:verification_status_changed', (payload) => {
      console.log('⚡ [RescuerModal] Realtime status change detected:', payload);
      if (payload) {
        setData((prev: any) => ({
          ...prev,
          ...(payload.user || {}),
          rescuer: {
            ...(prev?.rescuer || {}),
            verificationStatus: payload.verificationStatus,
            ...(payload.rescuer || {}),
          },
        }));
      }
    });

    return () => sub.remove();
  }, []);

  if (!visible) return null;

  const rescuer = data?.rescuer || data || {};
  const verificationStatus =
    rescuer.verificationStatus || data?.verificationStatus || 'PENDING';
  const isVerified = verificationStatus === 'VERIFIED';
  const rawIdNumber = rescuer.idNumber || '';
  const maskedIdNumber =
    rawIdNumber.length >= 8
      ? `${rawIdNumber.slice(0, 4)}${rawIdNumber.slice(4, 8).replace(/\d/g, '*')}${rawIdNumber.slice(8)}`
      : rawIdNumber
      ? `${rawIdNumber.slice(0, 4)}****`
      : '04809900****';

  const rawSkills: string[] = Array.isArray(rescuer.skills) && rescuer.skills.length > 0
    ? rescuer.skills
    : ['first_aid', 'water_rescue', 'evacuation'];

  const vehicleKey = rescuer.vehicleType || 'BOAT';
  const vehicleLabel = VEHICLE_NAMES[vehicleKey] || rescuer.vehicleType || 'Thuyền / Ca-nô';
  const areaName = rescuer.areaName || rescuer.areaId?.name || data?.citizen?.areaName || 'UBND Phường sở tại';

  // Format hồ sơ ID và ngày nộp
  const profileId = data?._id
    ? `RC-${new Date().getFullYear()}-${data._id.slice(-4).toUpperCase()}`
    : 'RC-2024-8892';

  const submitDate = rescuer.updatedAt || data?.updatedAt || new Date().toISOString();
  const dateObj = new Date(submitDate);
  const timeFormatted = `${String(dateObj.getHours()).padStart(2, '0')}:${String(
    dateObj.getMinutes()
  ).padStart(2, '0')}`;
  const dateFormatted = `${String(dateObj.getDate()).padStart(2, '0')}/${String(
    dateObj.getMonth() + 1
  ).padStart(2, '0')}/${dateObj.getFullYear()}`;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />

        {/* Top Header */}
        <View style={styles.topHeader}>
          <TouchableOpacity style={styles.closeHeaderBtn} onPress={onClose} activeOpacity={0.7}>
            <Feather name="arrow-left" size={20} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.topHeaderTitle}>Trạng thái hồ sơ cứu hộ</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 1. STATUS CARD (Đồng hồ cát hoặc Khiên xanh) */}
          <View style={styles.card}>
            <View style={styles.statusHeaderRow}>
              <View style={[styles.hourglassBox, isVerified && { backgroundColor: '#ECFDF5' }]}>
                <MaterialCommunityIcons
                  name={isVerified ? 'check-decagram' : 'timer-sand'}
                  size={24}
                  color={isVerified ? '#059669' : '#D97706'}
                />
              </View>
              <View
                style={[
                  styles.pendingBadge,
                  isVerified && { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
                ]}
              >
                <Text
                  style={[
                    styles.pendingBadgeText,
                    isVerified && { color: '#059669' },
                  ]}
                >
                  {isVerified ? 'Đã được phê duyệt' : 'Đang chờ xác minh'}
                </Text>
              </View>
            </View>

            <Text style={styles.statusTitle}>
              {isVerified ? 'Hồ sơ đã được phê duyệt chính thức' : 'Hồ sơ đang được xem xét'}
            </Text>
            <Text style={styles.statusDesc}>
              {isVerified
                ? 'Ban chỉ huy PCTT & TKCN địa phương đã thẩm định đạt yêu cầu. Bạn đã được công nhận là Cứu hộ viên chính thức và đủ điều kiện tham gia Đội cứu hộ thực địa.'
                : 'Local Authority (UBND / Ban chỉ huy PCTT & TKCN địa phương) đang kiểm tra thông tin nhân thân và năng lực kỹ thuật của bạn.'}
            </Text>

            <View style={styles.metaBox}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}># Mã hồ sơ: </Text>
                <Text style={styles.metaValue}>{profileId}</Text>
              </View>
              <View style={styles.metaRow}>
                <Feather name="clock" size={13} color="#64748B" style={{ marginRight: 4 }} />
                <Text style={styles.metaLabel}>{isVerified ? 'Cập nhật: ' : 'Nộp lúc: '}</Text>
                <Text style={styles.metaValue}>
                  {timeFormatted}, {dateFormatted}
                </Text>
              </View>
            </View>
          </View>

          {/* 2. TIẾN TRÌNH XÁC MINH (Timeline 3 bước) */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardSectionTitle}>Tiến trình xác minh</Text>
              <View
                style={[
                  styles.stepBadge,
                  isVerified && { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
                ]}
              >
                <Text
                  style={[
                    styles.stepBadgeText,
                    isVerified && { color: '#059669' },
                  ]}
                >
                  {isVerified ? '3 / 3 Hoàn tất' : 'Bước 2 / 3'}
                </Text>
              </View>
            </View>

            <View style={styles.timelineContainer}>
              {/* Bước 1 */}
              <View style={styles.timelineRow}>
                <View style={styles.timelineColLeft}>
                  <View style={[styles.timelineIconBox, styles.timelineIconActive]}>
                    <Feather name="check" size={13} color="#FFFFFF" />
                  </View>
                  <View style={[styles.timelineLine, styles.timelineLineActive]} />
                </View>
                <View style={styles.timelineColRight}>
                  <Text style={styles.timelineStepTitle}>Đã gửi hồ sơ cứu hộ</Text>
                  <Text style={styles.timelineStepSubtitle}>
                    Xác thực OTP & biên nhận dữ liệu hoàn tất
                  </Text>
                  <Text style={styles.timelineStepTime}>
                    {dateFormatted} - {timeFormatted}
                  </Text>
                </View>
              </View>

              {/* Bước 2 */}
              <View style={styles.timelineRow}>
                <View style={styles.timelineColLeft}>
                  <View
                    style={[
                      styles.timelineIconBox,
                      isVerified ? styles.timelineIconActive : styles.timelineIconProcessing,
                    ]}
                  >
                    {isVerified ? (
                      <Feather name="check" size={13} color="#FFFFFF" />
                    ) : (
                      <MaterialCommunityIcons name="autorenew" size={14} color="#D97706" />
                    )}
                  </View>
                  <View style={[styles.timelineLine, isVerified && styles.timelineLineActive]} />
                </View>
                <View style={styles.timelineColRight}>
                  <Text
                    style={[
                      styles.timelineStepTitle,
                      { color: isVerified ? '#059669' : '#D97706' },
                    ]}
                  >
                    Local Authority thẩm định
                  </Text>
                  <Text style={styles.timelineStepSubtitle}>
                    {isVerified
                      ? 'Đã đối soát đạt yêu cầu chuyên môn & khu vực đăng ký'
                      : 'Đang đối chiếu dữ liệu hiện trường và năng lực thiết bị cứu hộ'}
                  </Text>
                  <Text
                    style={[
                      styles.timelineStepEstimate,
                      isVerified && { color: '#059669', fontWeight: '700' },
                    ]}
                  >
                    {isVerified ? '✓ Đã phê chuẩn' : 'Ước tính: trong vòng 24 giờ'}
                  </Text>
                </View>
              </View>

              {/* Bước 3 */}
              <View style={[styles.timelineRow, { marginBottom: 0 }]}>
                <View style={styles.timelineColLeft}>
                  <View
                    style={[
                      styles.timelineIconBox,
                      isVerified ? styles.timelineIconActive : styles.timelineIconPending,
                    ]}
                  >
                    {isVerified ? (
                      <Feather name="check" size={13} color="#FFFFFF" />
                    ) : (
                      <Feather name="shield" size={13} color="#94A3B8" />
                    )}
                  </View>
                </View>
                <View style={styles.timelineColRight}>
                  <Text
                    style={[
                      styles.timelineStepTitle,
                      { color: isVerified ? '#059669' : '#94A3B8' },
                    ]}
                  >
                    Cấp chứng nhận Rescuer
                  </Text>
                  <Text
                    style={[
                      styles.timelineStepSubtitle,
                      { color: isVerified ? '#334155' : '#94A3B8' },
                    ]}
                  >
                    {isVerified
                      ? 'Đã kích hoạt huy hiệu cứu nạn & phân quyền điều phối thực địa'
                      : 'Kích hoạt huy hiệu cứu nạn, phân quyền bản đồ khẩn cấp'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* 3. CHI TIẾT ĐÃ KHAI BÁO */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardSectionTitle}>Chi tiết đã khai báo</Text>
              <View style={styles.securityTag}>
                <MaterialCommunityIcons name="lock-outline" size={13} color="#0066FF" />
                <Text style={styles.securityTagText}>Bảo mật AES</Text>
              </View>
            </View>

            {/* Field: Số CCCD */}
            <View style={styles.declaredItem}>
              <View style={styles.declaredItemLeft}>
                <MaterialCommunityIcons
                  name="card-account-details-outline"
                  size={19}
                  color="#0066FF"
                />
                <Text style={styles.declaredLabel}>Số định danh công dân</Text>
              </View>
              <View style={styles.declaredItemRight}>
                <Text style={styles.declaredValueBold}>{maskedIdNumber}</Text>
                <MaterialCommunityIcons
                  name="check-decagram"
                  size={16}
                  color="#0066FF"
                  style={{ marginLeft: 5 }}
                />
              </View>
            </View>

            {/* Field: Kỹ năng khai báo */}
            <View style={[styles.declaredItem, { flexDirection: 'column', alignItems: 'flex-start' }]}>
              <View style={[styles.declaredItemLeft, { marginBottom: 8 }]}>
                <MaterialCommunityIcons name="briefcase-outline" size={19} color="#0066FF" />
                <Text style={styles.declaredLabel}>Kỹ năng khai báo</Text>
              </View>
              <View style={styles.skillsWrap}>
                {rawSkills.map((s, idx) => (
                  <View key={idx} style={styles.skillChip}>
                    <Text style={styles.skillChipText}>{SKILL_NAMES[s] || s}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Field: Phương tiện sẵn sàng */}
            <View style={styles.declaredItem}>
              <View style={styles.declaredItemLeft}>
                <MaterialCommunityIcons name="sail-boat" size={19} color="#0066FF" />
                <Text style={styles.declaredLabel}>Phương tiện sẵn sàng</Text>
              </View>
              <Text style={styles.declaredValueBold}>{vehicleLabel}</Text>
            </View>

            {/* Field: Địa bàn đăng ký */}
            <View style={[styles.declaredItem, { marginBottom: 0 }]}>
              <View style={styles.declaredItemLeft}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={19} color="#0066FF" />
                <Text style={styles.declaredLabel}>Địa bàn tác chiến</Text>
              </View>
              <Text style={[styles.declaredValueBold, { color: '#0066FF', maxWidth: '50%' }]} numberOfLines={1}>
                {areaName}
              </Text>
            </View>
          </View>

          {/* 4. LƯU Ý QUAN TRỌNG / HƯỚNG DẪN TIẾP THEO */}
          <View
            style={[
              styles.alertNoteBox,
              isVerified && { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
            ]}
          >
            <MaterialCommunityIcons
              name={isVerified ? 'check-circle' : 'information'}
              size={19}
              color={isVerified ? '#059669' : '#0066FF'}
              style={{ marginTop: 1, marginRight: 8 }}
            />
            <Text
              style={[
                styles.alertNoteText,
                isVerified && { color: '#065F46' },
              ]}
            >
              <Text style={{ fontWeight: '700', color: isVerified ? '#047857' : '#1E40AF' }}>
                {isVerified ? 'Bước tiếp theo: ' : 'Lưu ý quan trọng: '}
              </Text>
              {isVerified
                ? 'Hồ sơ đã hoàn tất! Hãy chọn Đội cứu hộ trong khu vực của bạn để tiếp nhận ca trực và trang bị phương tiện cứu hộ.'
                : 'Trong thời gian chờ duyệt, bạn chưa thể tiếp nhận điều phối hoặc gửi yêu cầu gia nhập các đội cứu hộ phản ứng nhanh chính thức.'}
            </Text>
          </View>

          {/* 5. NÚT HÀNH ĐỘNG */}
          {isVerified && (
            <TouchableOpacity
              style={styles.chooseTeamPrimaryBtn}
              onPress={() => {
                onClose();
                onSelectTeam?.();
              }}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="account-group" size={18} color="#FFFFFF" />
              <Text style={styles.chooseTeamPrimaryBtnText}>Chọn Đội cứu hộ trong khu vực ngay</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.returnBtn} onPress={onClose} activeOpacity={0.85}>
            <Feather name="arrow-left" size={16} color="#0066FF" />
            <Text style={styles.returnBtnText}>Quay về trang cá nhân</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  closeHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  hourglassBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBadge: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pendingBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#B45309',
  },
  statusTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  statusDesc: {
    fontSize: 13,
    lineHeight: 19,
    color: '#475569',
    marginBottom: 12,
  },
  metaBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  metaValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  stepBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  timelineContainer: {
    paddingLeft: 4,
  },
  timelineRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineColLeft: {
    alignItems: 'center',
    width: 28,
    marginRight: 10,
  },
  timelineIconBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineIconActive: {
    backgroundColor: '#0066FF',
  },
  timelineIconProcessing: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#D97706',
  },
  timelineIconPending: {
    backgroundColor: '#F1F5F9',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  timelineLineActive: {
    backgroundColor: '#0066FF',
  },
  timelineColRight: {
    flex: 1,
    paddingTop: 1,
  },
  timelineStepTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  timelineStepSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: '#64748B',
  },
  timelineStepTime: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  timelineStepEstimate: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#D97706',
    marginTop: 3,
  },
  securityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  securityTagText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0066FF',
  },
  declaredItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  declaredItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  declaredLabel: {
    fontSize: 12.5,
    color: '#475569',
    fontWeight: '500',
  },
  declaredItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  declaredValueBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  skillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  skillChip: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  skillChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0066FF',
  },
  alertNoteBox: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  alertNoteText: {
    flex: 1,
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 18,
  },
  chooseTeamPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0066FF',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  chooseTeamPrimaryBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  returnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    paddingVertical: 13,
    gap: 8,
    marginTop: 4,
    marginBottom: 16,
  },
  returnBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0066FF',
  },
});

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
  water_rescue: 'Cứu hộ vùng nước',
  search_rescue: 'Tìm kiếm cứu nạn',
  boat_driver: 'Lái xuồng cứu sinh',
  rope_climb: 'Leo dây & Độ cao',
  diving: 'Lặn cứu hộ',
  firefighting: 'PCCC & Cứu sập',
  evacuation: 'Sơ tán người dân',
  communication: 'Thông tin liên lạc',
  logistics: 'Hậu cần & Cấp dưỡng',
  // Tương thích ngược với các mã cũ
  relief_logistics: 'Tiếp tế lương thực',
  technical_rescue: 'Cứu hộ kỹ thuật cao',
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
  const isRejected = verificationStatus === 'REJECTED';
  const rawIdNumber = rescuer.idNumber || data?.idNumber || '';
  const maskedIdNumber =
    rawIdNumber.length >= 8
      ? `${rawIdNumber.slice(0, 4)}${rawIdNumber.slice(4, 8).replace(/\d/g, '*')}${rawIdNumber.slice(8)}`
      : rawIdNumber
      ? `${rawIdNumber.slice(0, 4)}****`
      : 'Chưa cập nhật';

  const rawSkills: string[] = Array.isArray(rescuer.skills) ? rescuer.skills : [];
  const experienceText: string =
    typeof rescuer.experience === 'string' ? rescuer.experience.trim() : '';
  const rejectionReason: string =
    typeof rescuer.rejectionReason === 'string' ? rescuer.rejectionReason.trim() : '';
  const areaName =
    rescuer.areaName ||
    rescuer.areaId?.name ||
    data?.citizen?.areaName ||
    'Chưa cập nhật địa bàn';

  // Format hồ sơ ID và ngày nộp
  const currentYear = new Date().getFullYear();
  const profileId = data?._id
    ? `RC-${currentYear}-${data._id.slice(-4).toUpperCase()}`
    : `RC-${currentYear}-0000`;

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
          {/* 1. STATUS CARD */}
          <View style={styles.card}>
            <View style={styles.statusHeaderRow}>
              <View
                style={[
                  styles.hourglassBox,
                  isVerified && { backgroundColor: '#ECFDF5' },
                  isRejected && { backgroundColor: '#FEF2F2' },
                ]}
              >
                <MaterialCommunityIcons
                  name={
                    isVerified
                      ? 'check-decagram'
                      : isRejected
                      ? 'alert-circle-outline'
                      : 'timer-sand'
                  }
                  size={24}
                  color={isVerified ? '#059669' : isRejected ? '#DC2626' : '#D97706'}
                />
              </View>
              <View
                style={[
                  styles.pendingBadge,
                  isVerified && { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
                  isRejected && { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
                ]}
              >
                <Text
                  style={[
                    styles.pendingBadgeText,
                    isVerified && { color: '#059669' },
                    isRejected && { color: '#DC2626' },
                  ]}
                >
                  {isVerified
                    ? 'Đã được phê duyệt'
                    : isRejected
                    ? 'Cần bổ sung thông tin'
                    : 'Đang chờ thẩm định'}
                </Text>
              </View>
            </View>

            <Text style={styles.statusTitle}>
              {isVerified
                ? 'Hồ sơ đã được phê duyệt chính thức'
                : isRejected
                ? 'Hồ sơ chưa đạt yêu cầu thẩm định'
                : 'Hồ sơ đang được xem xét'}
            </Text>
            <Text style={styles.statusDesc}>
              {isVerified
                ? 'Ban Chỉ huy PCTT & TKCN địa phương đã thẩm định đạt yêu cầu. Bạn đã là Cứu hộ viên chính thức và đủ điều kiện tham gia Đội cứu hộ thực địa.'
                : isRejected
                ? rejectionReason ||
                  'Vui lòng kiểm tra lại thông tin CCCD, kỹ năng chuyên môn hoặc kinh nghiệm thực địa và nộp lại hồ sơ.'
                : 'UBND / Ban Chỉ huy PCTT & TKCN địa phương đang đối soát định danh CCCD, địa bàn đăng ký và kỹ năng chuyên môn của bạn.'}
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
              <Text style={styles.cardSectionTitle}>Tiến trình thẩm định</Text>
              <View
                style={[
                  styles.stepBadge,
                  isVerified && { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
                  isRejected && { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
                ]}
              >
                <Text
                  style={[
                    styles.stepBadgeText,
                    isVerified && { color: '#059669' },
                    isRejected && { color: '#DC2626' },
                  ]}
                >
                  {isVerified ? '3 / 3 Hoàn tất' : isRejected ? 'Cần cập nhật' : 'Bước 2 / 3'}
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
                  <Text style={styles.timelineStepTitle}>Đã nộp hồ sơ cứu hộ</Text>
                  <Text style={styles.timelineStepSubtitle}>
                    Quét mã QR CCCD gắn chip & tiếp nhận thông tin hoàn tất
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
                      isVerified
                        ? styles.timelineIconActive
                        : isRejected
                        ? styles.timelineIconRejected
                        : styles.timelineIconProcessing,
                    ]}
                  >
                    {isVerified ? (
                      <Feather name="check" size={13} color="#FFFFFF" />
                    ) : isRejected ? (
                      <Feather name="alert-circle" size={13} color="#DC2626" />
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
                      { color: isVerified ? '#059669' : isRejected ? '#DC2626' : '#D97706' },
                    ]}
                  >
                    Ban Chỉ huy địa phương thẩm định
                  </Text>
                  <Text style={styles.timelineStepSubtitle}>
                    {isVerified
                      ? 'Đã đối soát đạt yêu cầu về định danh, kỹ năng & khu vực đăng ký'
                      : isRejected
                      ? 'Hồ sơ cần chỉnh sửa hoặc bổ sung thông tin trước khi duyệt lại'
                      : 'Đang đối soát định danh CCCD, kỹ năng và địa bàn tác chiến'}
                  </Text>
                  <Text
                    style={[
                      styles.timelineStepEstimate,
                      isVerified && { color: '#059669', fontWeight: '700' },
                      isRejected && { color: '#DC2626', fontWeight: '700' },
                    ]}
                  >
                    {isVerified
                      ? '✓ Đã phê chuẩn'
                      : isRejected
                      ? 'Vui lòng cập nhật lại hồ sơ'
                      : 'Ước tính: trong vòng 24 giờ'}
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
                    Kích hoạt quyền Cứu hộ viên
                  </Text>
                  <Text
                    style={[
                      styles.timelineStepSubtitle,
                      { color: isVerified ? '#334155' : '#94A3B8' },
                    ]}
                  >
                    {isVerified
                      ? 'Đã kích hoạt huy hiệu cứu nạn & mở quyền tham gia Đội cứu hộ'
                      : 'Cấp huy hiệu cứu nạn và quyền tiếp nhận điều phối thực địa'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* 3. CHI TIẾT ĐÃ KHAI BÁO */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardSectionTitle}>Thông tin đã khai báo</Text>
              <View style={styles.securityTag}>
                <MaterialCommunityIcons name="lock-outline" size={13} color="#0066FF" />
                <Text style={styles.securityTagText}>Đã định danh QR</Text>
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
                <Text style={styles.declaredLabel}>Số CCCD định danh</Text>
              </View>
              <View style={styles.declaredItemRight}>
                <Text style={styles.declaredValueBold}>{maskedIdNumber}</Text>
                {rawIdNumber ? (
                  <MaterialCommunityIcons
                    name="check-decagram"
                    size={16}
                    color="#059669"
                    style={{ marginLeft: 5 }}
                  />
                ) : null}
              </View>
            </View>

            {/* Field: Địa bàn đăng ký */}
            <View style={styles.declaredItem}>
              <View style={styles.declaredItemLeft}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={19} color="#0066FF" />
                <Text style={styles.declaredLabel}>Địa bàn tác chiến</Text>
              </View>
              <Text style={[styles.declaredValueBold, { color: '#0066FF', maxWidth: '52%', textAlign: 'right' }]} numberOfLines={1}>
                {areaName}
              </Text>
            </View>

            {/* Field: Kỹ năng khai báo */}
            <View style={[styles.declaredItem, { flexDirection: 'column', alignItems: 'flex-start' }]}>
              <View style={[styles.declaredItemLeft, { marginBottom: 8 }]}>
                <MaterialCommunityIcons name="shield-star-outline" size={19} color="#0066FF" />
                <Text style={styles.declaredLabel}>Kỹ năng cứu hộ</Text>
              </View>
              {rawSkills.length > 0 ? (
                <View style={styles.skillsWrap}>
                  {rawSkills.map((s, idx) => (
                    <View key={idx} style={styles.skillChip}>
                      <Text style={styles.skillChipText}>{SKILL_NAMES[s] || s}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.declaredEmptyText}>Chưa cập nhật kỹ năng</Text>
              )}
            </View>

            {/* Field: Kinh nghiệm & Chứng chỉ */}
            <View style={[styles.declaredItem, { flexDirection: 'column', alignItems: 'flex-start', marginBottom: 0 }]}>
              <View style={[styles.declaredItemLeft, { marginBottom: 6 }]}>
                <MaterialCommunityIcons name="certificate-outline" size={19} color="#0066FF" />
                <Text style={styles.declaredLabel}>Kinh nghiệm & Chứng chỉ</Text>
              </View>
              <Text style={experienceText ? styles.declaredDescValue : styles.declaredEmptyText}>
                {experienceText || 'Chưa cập nhật mô tả kinh nghiệm'}
              </Text>
            </View>
          </View>

          {/* 4. LƯU Ý QUAN TRỌNG / HƯỚNG DẪN TIẾP THEO */}
          <View
            style={[
              styles.alertNoteBox,
              isVerified && { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
              isRejected && { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
            ]}
          >
            <MaterialCommunityIcons
              name={isVerified ? 'check-circle' : isRejected ? 'alert-circle' : 'information'}
              size={19}
              color={isVerified ? '#059669' : isRejected ? '#DC2626' : '#0066FF'}
              style={{ marginTop: 1, marginRight: 8 }}
            />
            <Text
              style={[
                styles.alertNoteText,
                isVerified && { color: '#065F46' },
                isRejected && { color: '#991B1B' },
              ]}
            >
              <Text
                style={{
                  fontWeight: '700',
                  color: isVerified ? '#047857' : isRejected ? '#DC2626' : '#1E40AF',
                }}
              >
                {isVerified ? 'Bước tiếp theo: ' : isRejected ? 'Cần thực hiện: ' : 'Lưu ý: '}
              </Text>
              {isVerified
                ? 'Hồ sơ đã hoàn tất! Hãy chọn Đội cứu hộ trong khu vực để nhận ca trực và điều phối phương tiện từ đội.'
                : isRejected
                ? 'Hãy bấm "Chỉnh sửa & Nộp lại hồ sơ" bên dưới để bổ sung thông tin và gửi lại cho Ban Chỉ huy duyệt.'
                : 'Trong thời gian chờ thẩm định, bạn chưa thể tiếp nhận lệnh điều phối nhưng vẫn có thể chỉnh sửa lại hồ sơ nếu cần.'}
            </Text>
          </View>

          {/* 5. NÚT HÀNH ĐỘNG */}
          {isVerified ? (
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
          ) : (
            <TouchableOpacity
              style={[
                styles.chooseTeamPrimaryBtn,
                isRejected && { backgroundColor: '#DC2626' },
              ]}
              onPress={() => {
                onClose();
                onUpdateProfile();
              }}
              activeOpacity={0.85}
            >
              <Feather name="edit-2" size={16} color="#FFFFFF" />
              <Text style={styles.chooseTeamPrimaryBtnText}>
                {isRejected ? 'Chỉnh sửa & Nộp lại hồ sơ' : 'Cập nhật lại thông tin hồ sơ'}
              </Text>
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
  timelineIconRejected: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#DC2626',
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
  declaredDescValue: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 18,
  },
  declaredEmptyText: {
    fontSize: 12.5,
    color: '#94A3B8',
    fontStyle: 'italic',
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

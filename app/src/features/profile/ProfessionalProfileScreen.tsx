import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  Modal,
  TouchableWithoutFeedback,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { PROFILE_THEME } from './theme';

export type ProfessionalVerificationStatus = 'VERIFIED' | 'PENDING' | 'REJECTED';

const RESCUE_SKILLS = [
  { id: 'first_aid', label: 'Sơ cứu y tế' },
  { id: 'water_rescue', label: 'Cứu hộ nước' },
  { id: 'search_rescue', label: 'Tìm kiếm cứu nạn' },
  { id: 'boat_driver', label: 'Lái xuồng cứu sinh' },
  { id: 'rope_climb', label: 'Leo dây & Độ cao' },
  { id: 'diving', label: 'Lặn cứu hộ' },
  { id: 'logistics', label: 'Hậu cần & Cấp dưỡng' },
];

const VEHICLE_OPTIONS = [
  { id: 'boat', label: 'Xuồng/Thuyền', icon: 'ferry' },
  { id: 'ambulance', label: 'Xe cứu thương', icon: 'ambulance' },
  { id: 'truck', label: 'Xe tải cứu trợ', icon: 'truck' },
  { id: 'motorbike', label: 'Xe máy cơ động', icon: 'motorbike' },
  { id: 'other', label: 'Khác', icon: 'car' },
];

const OPERATING_AREAS = [
  'Đà Nẵng - Quận Liên Chiểu & Cẩm Lệ',
  'Đà Nẵng - Huyện Hòa Vang',
  'Quảng Nam - Huyện Đại Lộc & Duy Xuyên',
  'Thừa Thiên Huế - Huyện Phú Vang & Hương Trà',
  'Quảng Bình - Huyện Lệ Thủy',
  'Khu vực khác (Toàn vùng duyên hải Miền Trung)',
];

interface ProfessionalProfileScreenProps {
  onBack: () => void;
}

export const ProfessionalProfileScreen: React.FC<ProfessionalProfileScreenProps> = ({ onBack }) => {
  // Form states
  const [selectedSkills, setSelectedSkills] = useState<string[]>([
    'first_aid',
    'water_rescue',
    'search_rescue',
  ]);
  const [experience, setExperience] = useState(
    '4 năm tham gia đội cứu hộ tình nguyện bão lũ miền Trung. Có chứng chỉ Sơ cấp cứu Chữ Thập Đỏ và kỹ năng điều khiển xuồng máy vượt dòng nước xiết.'
  );
  const [selectedVehicle, setSelectedVehicle] = useState('Xuồng/Thuyền');
  const [selectedArea, setSelectedArea] = useState('Đà Nẵng - Quận Liên Chiểu & Cẩm Lệ');

  // Professional Verification Status (Default: VERIFIED, read-only to user)
  const [verificationStatus, setVerificationStatus] = useState<ProfessionalVerificationStatus>('VERIFIED');
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  // Dropdown pickers
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const [showAreaPicker, setShowAreaPicker] = useState(false);

  // Saving states
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Toggle skill
  const handleToggleSkill = (skillId: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]
    );
  };

  // Save profile
  const handleSave = async () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setShowSuccessModal(true);
    }, 600);
  };

  // Get verification config
  const getVerificationConfig = (status: ProfessionalVerificationStatus) => {
    switch (status) {
      case 'VERIFIED':
        return {
          title: 'Đã xác minh',
          desc: 'Hồ sơ chuyên môn và chứng chỉ nghiệp vụ cứu hộ đã được cơ quan điều phối SOS phê duyệt và cấp phép tác chiến thực địa.',
          color: '#059669',
          bgColor: '#ECFDF5',
          borderColor: '#A7F3D0',
          icon: 'check-circle',
        };
      case 'PENDING':
        return {
          title: 'Chờ xác minh',
          desc: 'Hồ sơ và chứng chỉ kỹ năng đang trong quá trình thẩm định bởi hội đồng điều phối tác chiến cứu nạn.',
          color: '#D97706',
          bgColor: '#FFFBEB',
          borderColor: '#FDE68A',
          icon: 'clock',
        };
      case 'REJECTED':
        return {
          title: 'Không được phê duyệt',
          desc: 'Hồ sơ chưa đạt tiêu chuẩn kỹ thuật hoặc thiếu chứng nhận nghiệp vụ hợp lệ. Vui lòng liên hệ ban điều phối để được hướng dẫn bổ sung.',
          color: '#DC2626',
          bgColor: '#FEF2F2',
          borderColor: '#FECACA',
          icon: 'alert-circle',
        };
    }
  };

  const verConfig = getVerificationConfig(verificationStatus);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hồ sơ chuyên môn</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. Identity Document Card (Read-only after verification) */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#F0F9FF' }]}>
              <Feather name="credit-card" size={17} color="#0284C7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Số Căn cước công dân (CCCD)</Text>
              <Text style={styles.cardSubtitle}>Định danh cứu hộ quốc gia</Text>
            </View>
            <View style={styles.lockedPill}>
              <Feather name="lock" size={11} color="#64748B" />
              <Text style={styles.lockedPillText}>Đã khóa</Text>
            </View>
          </View>

          <View style={styles.maskedNumberBox}>
            <Text style={styles.maskedNumberText}>079201******</Text>
            <View style={styles.verifiedTag}>
              <Feather name="check" size={12} color="#059669" />
              <Text style={styles.verifiedTagText}>Đã đối soát</Text>
            </View>
          </View>
          <Text style={styles.lockNote}>
            Số định danh đã được cơ quan điều phối cứu nạn xác minh. Không thể tự thay đổi.
          </Text>
        </View>

        {/* 2. Selectable Rescue Skills Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Kỹ năng cứu hộ chuyên môn</Text>
          <Text style={styles.cardSubtitle}>Chọn các kỹ năng bạn có thể đảm nhận khi nhận lệnh</Text>

          <View style={styles.skillsWrap}>
            {RESCUE_SKILLS.map((skill) => {
              const isSelected = selectedSkills.includes(skill.id);
              return (
                <TouchableOpacity
                  key={skill.id}
                  style={[styles.skillPill, isSelected && styles.skillPillActive]}
                  onPress={() => handleToggleSkill(skill.id)}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.skillCheckCircle,
                      isSelected && styles.skillCheckCircleActive,
                    ]}
                  >
                    {isSelected && <Feather name="check" size={12} color="#FFFFFF" />}
                  </View>
                  <Text style={[styles.skillText, isSelected && styles.skillTextActive]}>
                    {skill.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 3. Experience Field Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Kinh nghiệm tác chiến cứu nạn</Text>
          <Text style={styles.cardSubtitle}>Mô tả các đợt cứu trợ hoặc chứng chỉ kỹ thuật đã tham gia</Text>

          <View style={styles.textAreaBox}>
            <TextInput
              style={styles.textArea}
              value={experience}
              onChangeText={setExperience}
              multiline
              numberOfLines={4}
              placeholder="Nhập mô tả kinh nghiệm cứu hộ của bạn..."
              placeholderTextColor="#94A3B8"
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* 4. Vehicle Type Selector Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Phương tiện cứu hộ sử dụng</Text>
          <Text style={styles.cardSubtitle}>Phương tiện sẵn sàng huy động khi tác chiến</Text>

          <TouchableOpacity
            style={styles.selectorDropdown}
            onPress={() => setShowVehiclePicker(true)}
            activeOpacity={0.75}
          >
            <View style={styles.selectorLeft}>
              <MaterialCommunityIcons name="ferry" size={18} color="#EF4444" />
              <Text style={styles.selectorValueText}>{selectedVehicle}</Text>
            </View>
            <Feather name="chevron-down" size={18} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* 5. Operating Area Selector Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Địa bàn tác chiến ưu tiên</Text>
          <Text style={styles.cardSubtitle}>Khu vực phân công trực tiếp lệnh ứng cứu khẩn cấp</Text>

          <TouchableOpacity
            style={styles.selectorDropdown}
            onPress={() => setShowAreaPicker(true)}
            activeOpacity={0.75}
          >
            <View style={styles.selectorLeft}>
              <Feather name="map-pin" size={17} color="#EF4444" />
              <Text style={styles.selectorValueText} numberOfLines={1}>
                {selectedArea}
              </Text>
            </View>
            <Feather name="chevron-down" size={18} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* 6. Read-Only Professional Verification Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Thẩm định chuyên môn</Text>
            <View
              style={[
                styles.verBadgePill,
                { backgroundColor: verConfig.bgColor, borderColor: verConfig.borderColor },
              ]}
            >
              <Feather name={verConfig.icon as any} size={12} color={verConfig.color} />
              <Text style={[styles.verBadgeText, { color: verConfig.color }]}>
                {verConfig.title}
              </Text>
            </View>
          </View>
          <Text style={styles.cardSubtitle}>
            Trạng thái phê duyệt nghiệp vụ bởi cơ quan điều phối (Chỉ đọc)
          </Text>

          <View
            style={[
              styles.verDisplayBox,
              { backgroundColor: verConfig.bgColor, borderColor: verConfig.borderColor },
            ]}
          >
            <Text style={[styles.verBoxTitle, { color: verConfig.color }]}>
              {verConfig.title}
            </Text>
            <Text style={styles.verBoxDesc}>{verConfig.desc}</Text>
          </View>

          {/* Test switcher for evaluator/reviewer */}
          <TouchableOpacity
            style={styles.testSwitcherBtn}
            onPress={() => setShowStatusPicker(true)}
            activeOpacity={0.7}
          >
            <Feather name="eye" size={13} color="#64748B" />
            <Text style={styles.testSwitcherText}>
              Kiểm tra 3 biến thể: Đã xác minh / Chờ / Từ chối
            </Text>
            <Feather name="chevron-down" size={14} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* Primary Save Button */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={[styles.saveButton, isSaving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.85}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Feather name="check" size={18} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Lưu thông tin</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* MODAL: Vehicle Picker */}
      <Modal visible={showVehiclePicker} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowVehiclePicker(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.pickerCard}>
                <Text style={styles.pickerTitle}>Chọn phương tiện cứu hộ</Text>
                <Text style={styles.pickerSubtitle}>Phương tiện sẵn sàng xuất kích khi nhận lệnh</Text>

                {VEHICLE_OPTIONS.map((item) => {
                  const isSelected = selectedVehicle === item.label;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                      onPress={() => {
                        setSelectedVehicle(item.label);
                        setShowVehiclePicker(false);
                      }}
                    >
                      <MaterialCommunityIcons
                        name={item.icon as any}
                        size={20}
                        color={isSelected ? '#EF4444' : '#64748B'}
                      />
                      <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextActive]}>
                        {item.label}
                      </Text>
                      {isSelected && <Feather name="check" size={16} color="#EF4444" />}
                    </TouchableOpacity>
                  );
                })}

                <TouchableOpacity
                  style={styles.pickerCloseBtn}
                  onPress={() => setShowVehiclePicker(false)}
                >
                  <Text style={styles.pickerCloseText}>Đóng</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL: Area Picker */}
      <Modal visible={showAreaPicker} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowAreaPicker(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.pickerCard}>
                <Text style={styles.pickerTitle}>Chọn địa bàn tác chiến</Text>
                <Text style={styles.pickerSubtitle}>Khu vực phân công trực tiếp</Text>

                {OPERATING_AREAS.map((area) => {
                  const isSelected = selectedArea === area;
                  return (
                    <TouchableOpacity
                      key={area}
                      style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                      onPress={() => {
                        setSelectedArea(area);
                        setShowAreaPicker(false);
                      }}
                    >
                      <Feather
                        name="map-pin"
                        size={16}
                        color={isSelected ? '#EF4444' : '#64748B'}
                      />
                      <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextActive]}>
                        {area}
                      </Text>
                      {isSelected && <Feather name="check" size={16} color="#EF4444" />}
                    </TouchableOpacity>
                  );
                })}

                <TouchableOpacity
                  style={styles.pickerCloseBtn}
                  onPress={() => setShowAreaPicker(false)}
                >
                  <Text style={styles.pickerCloseText}>Đóng</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL: Verification Status Test Switcher */}
      <Modal visible={showStatusPicker} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowStatusPicker(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.pickerCard}>
                <Text style={styles.pickerTitle}>Kiểm tra biến thể thẩm định</Text>
                <Text style={styles.pickerSubtitle}>
                  Chọn để xem giao diện ứng với từng trường hợp thẩm định:
                </Text>

                {(['VERIFIED', 'PENDING', 'REJECTED'] as ProfessionalVerificationStatus[]).map(
                  (st) => {
                    const cfg = getVerificationConfig(st);
                    const isSelected = verificationStatus === st;
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[
                          styles.pickerItem,
                          isSelected && { borderColor: cfg.color, backgroundColor: cfg.bgColor },
                        ]}
                        onPress={() => {
                          setVerificationStatus(st);
                          setShowStatusPicker(false);
                        }}
                      >
                        <Feather name={cfg.icon as any} size={18} color={cfg.color} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={[styles.pickerItemText, { color: isSelected ? cfg.color : '#0F172A' }]}>
                            {cfg.title}
                          </Text>
                        </View>
                        {isSelected && <Feather name="check" size={16} color={cfg.color} />}
                      </TouchableOpacity>
                    );
                  }
                )}

                <TouchableOpacity
                  style={styles.pickerCloseBtn}
                  onPress={() => setShowStatusPicker(false)}
                >
                  <Text style={styles.pickerCloseText}>Đóng</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL: Success Feedback */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.feedbackCard}>
            <View style={styles.feedbackIconBox}>
              <Feather name="check" size={26} color="#10B981" />
            </View>
            <Text style={styles.feedbackTitle}>Đã lưu hồ sơ chuyên môn</Text>
            <Text style={styles.feedbackDesc}>
              Thông tin kỹ năng, phương tiện và địa bàn tác chiến đã được cập nhật thành công.
            </Text>
            <TouchableOpacity
              style={styles.feedbackBtn}
              onPress={() => {
                setShowSuccessModal(false);
                onBack();
              }}
            >
              <Text style={styles.feedbackBtnText}>Xác nhận</Text>
            </TouchableOpacity>
          </View>
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
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 36,
    backgroundColor: '#F8FAFC',
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 14,
  },
  lockedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  lockedPillText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  maskedNumberBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    height: 48,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  maskedNumberText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 2,
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  verifiedTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  lockNote: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
  },

  // Skills
  skillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
  },
  skillPillActive: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  skillCheckCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  skillCheckCircleActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  skillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  skillTextActive: {
    color: '#DC2626',
    fontWeight: '700',
  },

  // Textarea
  textAreaBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 12,
    minHeight: 100,
  },
  textArea: {
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 20,
    fontWeight: '500',
  },

  // Dropdown Selectors
  selectorDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    height: 50,
    paddingHorizontal: 14,
  },
  selectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  selectorValueText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },

  // Verification Display
  verBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  verBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  verDisplayBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  verBoxTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    marginBottom: 4,
  },
  verBoxDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },
  testSwitcherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  testSwitcherText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },

  // Primary Save Button
  actionContainer: {
    marginTop: 6,
    marginBottom: 10,
  },
  saveButton: {
    height: 50,
    borderRadius: 16,
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  pickerCard: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: 350,
    borderRadius: 20,
    padding: 20,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  pickerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 14,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    gap: 10,
  },
  pickerItemActive: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  pickerItemText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  pickerItemTextActive: {
    color: '#DC2626',
    fontWeight: '700',
  },
  pickerCloseBtn: {
    marginTop: 8,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerCloseText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },

  // Feedback Card
  feedbackCard: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
  },
  feedbackIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  feedbackTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  feedbackDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  feedbackBtn: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedbackBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

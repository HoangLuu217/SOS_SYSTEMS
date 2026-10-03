import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  ActivityIndicator,
  Linking,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { PROFILE_THEME } from './theme';
import { backendApi, EmergencyContact } from '../../services/backendApi';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface EmergencyContactScreenProps {
  onBack: () => void;
  onContactSaved?: (contact: EmergencyContact) => void;
}

export const EmergencyContactScreen: React.FC<EmergencyContactScreenProps> = ({
  onBack,
  onContactSaved,
}) => {
  // Suggested relationship chips
  const relationshipSuggestions = ['Cha', 'Mẹ', 'Vợ/Chồng', 'Anh/Chị/Em', 'Bạn bè', 'Khác'];

  // Không dùng dữ liệu mẫu - khởi tạo với dữ liệu thực tế của người dùng
  const [savedContact, setSavedContact] = useState<EmergencyContact | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRelation, setSelectedRelation] = useState('Cha');
  const [customRelation, setCustomRelation] = useState('');

  const [errors, setErrors] = useState<{ name?: string; phone?: string; relation?: string }>({});
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load from local or backend
  useEffect(() => {
    const loadContact = async () => {
      try {
        const stored = await AsyncStorage.getItem('@sos_emergency_contact');
        if (stored) {
          const parsed = JSON.parse(stored);
          setSavedContact(parsed);
          setName(parsed.name || '');
          setPhone(parsed.phone || '');
          if (relationshipSuggestions.includes(parsed.relation)) {
            setSelectedRelation(parsed.relation);
          } else {
            setSelectedRelation('Khác');
            setCustomRelation(parsed.relation || '');
          }
          return;
        }

        // Thử lấy từ backend profile
        const profileRes = await backendApi.getCitizenProfile();
        if (profileRes.success && profileRes.data?.citizen?.emergencyContact) {
          const ec = profileRes.data.citizen.emergencyContact;
          setSavedContact(ec);
          setName(ec.name || '');
          setPhone(ec.phone || '');
          if (relationshipSuggestions.includes(ec.relation)) {
            setSelectedRelation(ec.relation);
          } else {
            setSelectedRelation('Khác');
            setCustomRelation(ec.relation || '');
          }
          await AsyncStorage.setItem('@sos_emergency_contact', JSON.stringify(ec));
        }
      } catch {}
    };
    loadContact();
  }, []);

  const validate = () => {
    const newErrors: { name?: string; phone?: string; relation?: string } = {};

    if (!name.trim() || name.trim().length < 2) {
      newErrors.name = 'Vui lòng nhập họ và tên người liên hệ.';
    }

    const phoneRegex = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$|^\+?[1-9]\d{8,14}$/;
    const cleanPhone = phone.replace(/\s+/g, '');
    if (!cleanPhone || !phoneRegex.test(cleanPhone)) {
      newErrors.phone = 'Số điện thoại không hợp lệ (hỗ trợ định dạng 10 số VN).';
    }

    if (selectedRelation === 'Khác' && !customRelation.trim()) {
      newErrors.relation = 'Vui lòng nhập mối quan hệ cụ thể.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveContact = async () => {
    if (!validate()) return;

    const relationFinal = selectedRelation === 'Khác' ? customRelation.trim() : selectedRelation;
    const cleanPhone = phone.replace(/\s+/g, '');
    const contactData: EmergencyContact = {
      name: name.trim(),
      phone: cleanPhone,
      relation: relationFinal,
    };

    setSaving(true);
    try {
      await backendApi.updateEmergencyContact(contactData);
      await AsyncStorage.setItem('@sos_emergency_contact', JSON.stringify(contactData));
      setSavedContact(contactData);

      if (onContactSaved) {
        onContactSaved(contactData);
      }

      setToastMessage('Lưu thông tin người liên hệ khẩn cấp thành công');
      setTimeout(() => setToastMessage(null), 2500);
    } catch (err: any) {
      setErrors(prev => ({ ...prev, phone: err.message || 'Không thể lưu liên hệ.' }));
    } finally {
      setSaving(false);
    }
  };

  const handleCall = (phoneNumber: string) => {
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanNumber}`).catch(() => {});
  };

  const handleClearContact = async () => {
    setSavedContact(null);
    setName('');
    setPhone('');
    setSelectedRelation('Cha');
    setCustomRelation('');
    await AsyncStorage.removeItem('@sos_emergency_contact');
    setToastMessage('Đã gỡ người liên hệ khẩn cấp');
    setTimeout(() => setToastMessage(null), 2000);
  };

  const getInitials = (contactName?: string) => {
    if (!contactName) return 'LH';
    const parts = contactName.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return contactName.substring(0, 2).toUpperCase();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={PROFILE_THEME.colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={22} color={PROFILE_THEME.colors.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Liên hệ khẩn cấp</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Toast Banner */}
      {toastMessage && (
        <View style={styles.successToast}>
          <Feather name="check-circle" size={16} color="#FFFFFF" />
          <Text style={styles.successToastText}>{toastMessage}</Text>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Soft Coral Information Card */}
          <View style={styles.infoCard}>
            <View style={styles.infoIconBox}>
              <Feather name="shield" size={20} color={PROFILE_THEME.colors.primary} />
            </View>
            <View style={styles.infoTextBox}>
              <Text style={styles.infoTitle}>Người bảo hộ khẩn cấp</Text>
              <Text style={styles.infoDescription}>
                Thông tin người có thể liên hệ khi bạn gặp tình huống khẩn cấp. Hệ thống RescueSOS sẽ tự động gửi thông báo hoặc gọi khẩn cấp tới số điện thoại này khi phát tín hiệu SOS.
              </Text>
            </View>
          </View>

          {/* Saved Contact Preview Card or Empty State */}
          <View style={styles.previewSection}>
            <Text style={styles.sectionHeader}>Người liên hệ hiện tại</Text>

            {savedContact && savedContact.name ? (
              <View style={styles.savedCard}>
                <View style={styles.savedAvatar}>
                  <Text style={styles.savedAvatarText}>{getInitials(savedContact.name)}</Text>
                </View>

                <View style={styles.savedInfo}>
                  <View style={styles.savedNameRow}>
                    <Text style={styles.savedName}>{savedContact.name}</Text>
                    <View style={styles.relationBadge}>
                      <Text style={styles.relationBadgeText}>{savedContact.relation}</Text>
                    </View>
                  </View>
                  <Text style={styles.savedPhone}>{savedContact.phone}</Text>
                </View>

                <TouchableOpacity
                  style={styles.callButton}
                  onPress={() => handleCall(savedContact.phone)}
                  activeOpacity={0.8}
                >
                  <Feather name="phone-call" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="user-x" size={24} color={PROFILE_THEME.colors.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>Bạn chưa thêm người liên hệ khẩn cấp</Text>
                <Text style={styles.emptySubtitle}>
                  Điền biểu mẫu bên dưới để thiết lập người thân nhận thông báo cứu nạn.
                </Text>
              </View>
            )}
          </View>

          {/* Form Fields Card */}
          <View style={styles.formCard}>
            <Text style={styles.sectionHeader}>
              {savedContact ? 'Chỉnh sửa thông tin liên hệ' : 'Thêm người liên hệ mới'}
            </Text>

            {/* Field: Họ và tên */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                Họ và tên người liên hệ <Text style={styles.requiredStar}>*</Text>
              </Text>
              <View style={[styles.inputBox, errors.name ? styles.inputBoxError : null]}>
                <Feather name="user" size={18} color={PROFILE_THEME.colors.textSecondary} style={styles.fieldIcon} />
                <TextInput
                  style={styles.textInput}
                  value={name}
                  onChangeText={text => {
                    setName(text);
                    if (errors.name) setErrors(prev => ({ ...prev, name: undefined }));
                  }}
                  placeholder="Ví dụ: Nguyễn Thị Lan"
                  placeholderTextColor={PROFILE_THEME.colors.textMuted}
                />
              </View>
              {errors.name ? <Text style={styles.fieldErrorText}>{errors.name}</Text> : null}
            </View>

            {/* Field: Số điện thoại */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                Số điện thoại <Text style={styles.requiredStar}>*</Text>
              </Text>
              <View style={[styles.inputBox, errors.phone ? styles.inputBoxError : null]}>
                <Feather name="phone" size={18} color={PROFILE_THEME.colors.textSecondary} style={styles.fieldIcon} />
                <TextInput
                  style={styles.textInput}
                  value={phone}
                  onChangeText={text => {
                    setPhone(text);
                    if (errors.phone) setErrors(prev => ({ ...prev, phone: undefined }));
                  }}
                  placeholder="Ví dụ: 0909 888 777"
                  placeholderTextColor={PROFILE_THEME.colors.textMuted}
                  keyboardType="phone-pad"
                />
              </View>
              {errors.phone ? <Text style={styles.fieldErrorText}>{errors.phone}</Text> : null}
            </View>

            {/* Field: Mối quan hệ */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Mối quan hệ</Text>
              <View style={styles.chipsRow}>
                {relationshipSuggestions.map(item => {
                  const isSelected = selectedRelation === item;
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[styles.chipItem, isSelected && styles.chipItemSelected]}
                      onPress={() => {
                        setSelectedRelation(item);
                        if (errors.relation) setErrors(prev => ({ ...prev, relation: undefined }));
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Custom relationship input if 'Khác' */}
              {selectedRelation === 'Khác' && (
                <View style={[styles.inputBox, { marginTop: 10 }, errors.relation ? styles.inputBoxError : null]}>
                  <TextInput
                    style={styles.textInput}
                    value={customRelation}
                    onChangeText={text => {
                      setCustomRelation(text);
                      if (errors.relation) setErrors(prev => ({ ...prev, relation: undefined }));
                    }}
                    placeholder="Nhập mối quan hệ (ví dụ: Chú, Bác, Đồng nghiệp...)"
                    placeholderTextColor={PROFILE_THEME.colors.textMuted}
                  />
                </View>
              )}
              {errors.relation ? <Text style={styles.fieldErrorText}>{errors.relation}</Text> : null}
            </View>

            {savedContact && (
              <TouchableOpacity
                style={styles.clearContactButton}
                onPress={handleClearContact}
                activeOpacity={0.7}
              >
                <Feather name="trash-2" size={14} color="#EF4444" />
                <Text style={styles.clearContactText}>Gỡ người liên hệ này</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Primary Button: Lưu liên hệ */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSaveContact}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Lưu liên hệ</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PROFILE_THEME.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: PROFILE_THEME.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: PROFILE_THEME.colors.borderLight,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: PROFILE_THEME.colors.textPrimary,
  },
  successToast: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    zIndex: 99,
    backgroundColor: PROFILE_THEME.colors.success,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  successToastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 16,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: PROFILE_THEME.colors.primaryLight,
    borderRadius: PROFILE_THEME.radius.card,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: PROFILE_THEME.colors.primaryBorder,
  },
  infoIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoTextBox: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: PROFILE_THEME.colors.primary,
    marginBottom: 4,
  },
  infoDescription: {
    fontSize: 12.5,
    color: '#7F1D1D',
    lineHeight: 18,
  },
  previewSection: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: PROFILE_THEME.colors.textPrimary,
    marginBottom: 4,
  },
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PROFILE_THEME.colors.card,
    borderRadius: PROFILE_THEME.radius.card,
    padding: 16,
    borderWidth: 1,
    borderColor: PROFILE_THEME.colors.borderLight,
    shadowColor: PROFILE_THEME.colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },
  savedAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PROFILE_THEME.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: PROFILE_THEME.colors.primaryBorder,
  },
  savedAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: PROFILE_THEME.colors.primary,
  },
  savedInfo: {
    flex: 1,
  },
  savedNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  savedName: {
    fontSize: 15,
    fontWeight: '800',
    color: PROFILE_THEME.colors.textPrimary,
  },
  relationBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  relationBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0066FF',
  },
  savedPhone: {
    fontSize: 13.5,
    color: PROFILE_THEME.colors.textSecondary,
    fontWeight: '600',
  },
  callButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: PROFILE_THEME.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: PROFILE_THEME.colors.card,
    borderRadius: PROFILE_THEME.radius.card,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PROFILE_THEME.colors.borderLight,
    borderStyle: 'dashed',
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: PROFILE_THEME.colors.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: PROFILE_THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  formCard: {
    backgroundColor: PROFILE_THEME.colors.card,
    borderRadius: PROFILE_THEME.radius.card,
    padding: 20,
    borderWidth: 1,
    borderColor: PROFILE_THEME.colors.borderLight,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: PROFILE_THEME.colors.textPrimary,
    marginBottom: 6,
  },
  requiredStar: {
    color: PROFILE_THEME.colors.primary,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: PROFILE_THEME.radius.input,
    borderWidth: 1,
    borderColor: PROFILE_THEME.colors.border,
    paddingHorizontal: 14,
    height: 48,
  },
  inputBoxError: {
    borderColor: PROFILE_THEME.colors.primary,
    backgroundColor: PROFILE_THEME.colors.primaryLight,
  },
  fieldIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14.5,
    color: PROFILE_THEME.colors.textPrimary,
  },
  fieldErrorText: {
    color: PROFILE_THEME.colors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    marginLeft: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  chipItem: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: PROFILE_THEME.colors.border,
  },
  chipItemSelected: {
    backgroundColor: PROFILE_THEME.colors.primaryLight,
    borderColor: PROFILE_THEME.colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: PROFILE_THEME.colors.textSecondary,
  },
  chipTextSelected: {
    color: PROFILE_THEME.colors.primary,
    fontWeight: '800',
  },
  clearContactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  clearContactText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: PROFILE_THEME.colors.card,
    borderTopWidth: 1,
    borderTopColor: PROFILE_THEME.colors.borderLight,
  },
  saveButton: {
    backgroundColor: PROFILE_THEME.colors.primary,
    height: 50,
    borderRadius: PROFILE_THEME.radius.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

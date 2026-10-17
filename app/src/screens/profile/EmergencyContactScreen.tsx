import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Alert,
  Animated,
  PanResponder,
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
  const relationshipSuggestions = ['Cha', 'Mẹ', 'Vợ/Chồng', 'Anh/Chị/Em', 'Bạn bè', 'Khác'];

  // Dữ liệu người liên hệ hiện tại
  const [savedContact, setSavedContact] = useState<EmergencyContact | null>(null);

  // Trạng thái đang mở form chỉnh sửa
  const [isEditing, setIsEditing] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRelation, setSelectedRelation] = useState('Cha');
  const [customRelation, setCustomRelation] = useState('');

  const [errors, setErrors] = useState<{ name?: string; phone?: string; relation?: string }>({});
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Điều khiển ScrollView khi đang vuốt ngang
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Refs input
  const nameInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Animation kéo thẻ từ trái sang phải
  const translateX = useRef(new Animated.Value(0)).current;
  const isSwipeRevealed = useRef(false);

  // Cử chỉ vuốt kéo sang phải để lộ nút xoá (Swipe Left-to-Right)
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          // Bắt cử chỉ khi kéo sang phải (dx > 8) và chuyển động ngang lớn hơn dọc
          return gestureState.dx > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        },
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
          // Chiếm quyền điều khiển cử chỉ để ScrollView không nuốt mất vuốt ngang
          return gestureState.dx > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        },
        onPanResponderGrant: () => {
          setScrollEnabled(false);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, gestureState) => {
          const baseOffset = isSwipeRevealed.current ? 86 : 0;
          // Kéo sang phải (chỉ nhận giá trị dương)
          const newX = Math.max(0, Math.min(105, baseOffset + gestureState.dx));
          translateX.setValue(newX);
        },
        onPanResponderRelease: (_, gestureState) => {
          setScrollEnabled(true);
          if (gestureState.dx > 30 || (isSwipeRevealed.current && gestureState.dx > -25)) {
            // Mở nút xoá
            Animated.spring(translateX, {
              toValue: 86,
              useNativeDriver: true,
              friction: 8,
              tension: 50,
            }).start();
            isSwipeRevealed.current = true;
          } else {
            // Đóng lại
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              friction: 8,
              tension: 50,
            }).start();
            isSwipeRevealed.current = false;
          }
        },
        onPanResponderTerminate: () => {
          setScrollEnabled(true);
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          isSwipeRevealed.current = false;
        },
      }),
    [translateX]
  );

  const closeSwipe = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
    isSwipeRevealed.current = false;
  };

  // Tải thông tin người liên hệ
  useEffect(() => {
    let isMounted = true;
    const loadContact = async () => {
      try {
        const stored = await AsyncStorage.getItem('@sos_emergency_contact');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.name && isMounted) {
            setSavedContact(parsed);
            setName(parsed.name || '');
            setPhone(parsed.phone || '');
            if (relationshipSuggestions.includes(parsed.relation)) {
              setSelectedRelation(parsed.relation);
            } else {
              setSelectedRelation('Khác');
              setCustomRelation(parsed.relation || '');
            }
          }
        }

        // Tải từ backend
        const profileRes = await backendApi.getCitizenProfile();
        if (profileRes.success && profileRes.data?.citizen?.emergencyContact?.name && isMounted) {
          const ec = profileRes.data.citizen.emergencyContact;
          setSavedContact(ec);
          setName(ec.name || '');
          setPhone(ec.phone || '');
          if (relationshipSuggestions.includes(ec.relation || '')) {
            setSelectedRelation(ec.relation || 'Cha');
          } else {
            setSelectedRelation('Khác');
            setCustomRelation(ec.relation || '');
          }
          await AsyncStorage.setItem('@sos_emergency_contact', JSON.stringify(ec));
        } else if (profileRes.success && !profileRes.data?.citizen?.emergencyContact?.name && !stored && isMounted) {
          setSavedContact(null);
        }
      } catch {
      }
    };
    loadContact();
    return () => {
      isMounted = false;
    };
  }, []);

  // Mở form chỉnh sửa người liên hệ khi bấm vào thẻ
  const handleStartEditing = () => {
    if (savedContact) {
      setName(savedContact.name || '');
      setPhone(savedContact.phone || '');
      if (relationshipSuggestions.includes(savedContact.relation)) {
        setSelectedRelation(savedContact.relation);
        setCustomRelation('');
      } else {
        setSelectedRelation('Khác');
        setCustomRelation(savedContact.relation || '');
      }
    }
    setErrors({});
    setIsEditing(true);
    closeSwipe();
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  // Mở form thêm liên hệ mới khi bấm dấu cộng tròn trên Navbar
  const handlePressNavbarAdd = () => {
    if (savedContact) {
      setName(savedContact.name || '');
      setPhone(savedContact.phone || '');
      if (relationshipSuggestions.includes(savedContact.relation)) {
        setSelectedRelation(savedContact.relation);
        setCustomRelation('');
      } else {
        setSelectedRelation('Khác');
        setCustomRelation(savedContact.relation || '');
      }
    } else {
      setName('');
      setPhone('');
      setSelectedRelation('Cha');
      setCustomRelation('');
    }
    setErrors({});
    setIsEditing(true);
    closeSwipe();
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
      nameInputRef.current?.focus();
    }, 150);
  };

  // Huỷ chỉnh sửa
  const handleCancelEditing = () => {
    setIsEditing(false);
    setErrors({});
  };

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
      setIsEditing(false);
      closeSwipe();

      if (onContactSaved) {
        onContactSaved(contactData);
      }

      setToastMessage('Lưu thông tin người liên hệ khẩn cấp thành công');
      setTimeout(() => setToastMessage(null), 2500);
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, phone: err.message || 'Không thể lưu liên hệ.' }));
    } finally {
      setSaving(false);
    }
  };

  const handleCall = (phoneNumber: string) => {
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanNumber}`).catch(() => {});
  };

  // Xác nhận và xoá người liên hệ
  const handleConfirmDelete = () => {
    Alert.alert(
      'Xoá người liên hệ khẩn cấp',
      `Bạn có chắc chắn muốn xoá người liên hệ "${savedContact?.name || ''}" không?`,
      [
        {
          text: 'Huỷ',
          style: 'cancel',
          onPress: closeSwipe,
        },
        {
          text: 'Xoá liên hệ',
          style: 'destructive',
          onPress: executeDeleteContact,
        },
      ]
    );
  };

  // Thực hiện xoá cả ở backend lẫn AsyncStorage
  const executeDeleteContact = async () => {
    setSaving(true);
    try {
      await backendApi.deleteEmergencyContact();
      await AsyncStorage.removeItem('@sos_emergency_contact');
      setSavedContact(null);
      setName('');
      setPhone('');
      setSelectedRelation('Cha');
      setCustomRelation('');
      setErrors({});
      setIsEditing(false);
      closeSwipe();

      if (onContactSaved) {
        onContactSaved({ name: '', phone: '', relation: '' });
      }

      setToastMessage('Đã xoá người liên hệ khẩn cấp thành công');
      setTimeout(() => setToastMessage(null), 2500);
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể xoá người liên hệ khẩn cấp.');
    } finally {
      setSaving(false);
    }
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

        {/* Nút cộng tròn nổi góc phải navbar */}
        <TouchableOpacity
          style={styles.navbarPlusBtn}
          onPress={handlePressNavbarAdd}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="plus" size={20} color="#FFFFFF" />
        </TouchableOpacity>
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          scrollEnabled={scrollEnabled}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          {/* Thông tin giải thích */}
          <View style={styles.infoCard}>
            <View style={styles.infoIconBox}>
              <Feather name="shield" size={20} color={PROFILE_THEME.colors.primary} />
            </View>
            <View style={styles.infoTextBox}>
              <Text style={styles.infoTitle}>Người bảo hộ khẩn cấp</Text>
              <Text style={styles.infoDescription}>
                Hệ thống RescueSOS sẽ tự động gửi thông báo hoặc gọi khẩn cấp tới số điện thoại này khi bạn phát tín hiệu SOS khẩn cấp.
              </Text>
            </View>
          </View>

          {/* Mục người liên hệ hiện tại */}
          <View style={styles.previewSection}>
            <Text style={styles.sectionHeader}>Người liên hệ hiện tại</Text>

            {savedContact && savedContact.name ? (
              <View>
                {/* Khung vuốt từ trái sang phải */}
                <View style={styles.swipeContainer}>
                  {/* Nút xoá màu đỏ nằm ở lớp dưới (Underlying Layer) */}
                  <TouchableOpacity
                    style={styles.swipeDeleteAction}
                    onPress={handleConfirmDelete}
                    activeOpacity={0.8}
                  >
                    <Feather name="trash-2" size={20} color="#FFFFFF" />
                    <Text style={styles.swipeDeleteText}>Xoá</Text>
                  </TouchableOpacity>

                  {/* Thẻ liên hệ nằm ở lớp trên (Foreground Layer: zIndex 10, che hoàn toàn nút xoá khi chưa vuốt) */}
                  <Animated.View
                    {...panResponder.panHandlers}
                    style={[
                      styles.savedCard,
                      {
                        transform: [{ translateX }],
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.cardContentTouch}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (isSwipeRevealed.current) {
                          closeSwipe();
                        } else {
                          handleStartEditing();
                        }
                      }}
                    >
                      <View style={styles.savedAvatar}>
                        <Text style={styles.savedAvatarText}>{getInitials(savedContact.name)}</Text>
                      </View>

                      <View style={styles.savedInfo}>
                        <View style={styles.savedNameRow}>
                          <Text style={styles.savedName} numberOfLines={1}>
                            {savedContact.name}
                          </Text>
                          <View style={styles.relationBadge}>
                            <Text style={styles.relationBadgeText}>{savedContact.relation}</Text>
                          </View>
                        </View>
                        <Text style={styles.savedPhone}>{savedContact.phone}</Text>
                      </View>
                    </TouchableOpacity>

                    {/* Nút gọi điện */}
                    <TouchableOpacity
                      style={styles.callButton}
                      onPress={() => handleCall(savedContact.phone)}
                      activeOpacity={0.8}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="phone-call" size={17} color="#FFFFFF" />
                    </TouchableOpacity>
                  </Animated.View>
                </View>

                {/* Hướng dẫn thao tác kéo sang phải & chạm để sửa */}
                <View style={styles.swipeHintRow}>
                  <Feather name="arrow-right" size={13} color="#64748B" />
                  <Text style={styles.swipeHintText}>Kéo thẻ sang phải để xoá · Chạm vào thẻ để sửa</Text>
                </View>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="user-x" size={24} color={PROFILE_THEME.colors.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>Bạn chưa thêm người liên hệ khẩn cấp</Text>
                <Text style={styles.emptySubtitle}>
                  Bấm dấu cộng (+) ở góc trên hoặc điền biểu mẫu bên dưới để thêm người liên hệ.
                </Text>
              </View>
            )}
          </View>

          {/* Form nhập liệu: Chỉ hiện khi CHƯA có liên hệ HOẶC đang bấm sửa/thêm */}
          {(!savedContact || isEditing) && (
            <View style={styles.formCard}>
              <View style={styles.formHeaderRow}>
                <Text style={styles.formHeaderTitle}>
                  {savedContact ? 'Chỉnh sửa thông tin liên hệ' : 'Thêm người liên hệ mới'}
                </Text>
                {savedContact && (
                  <TouchableOpacity
                    style={styles.closeFormBtn}
                    onPress={handleCancelEditing}
                    activeOpacity={0.7}
                  >
                    <Feather name="x" size={18} color="#64748B" />
                    <Text style={styles.closeFormText}>Đóng</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Field: Họ và tên */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Họ và tên người liên hệ <Text style={styles.requiredStar}>*</Text>
                </Text>
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => nameInputRef.current?.focus()}
                  style={[styles.inputBox, errors.name ? styles.inputBoxError : null]}
                >
                  <Feather name="user" size={18} color={PROFILE_THEME.colors.textSecondary} style={styles.fieldIcon} />
                  <TextInput
                    ref={nameInputRef}
                    style={styles.textInput}
                    value={name}
                    onChangeText={(text) => {
                      setName(text);
                      if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    placeholder="Ví dụ: Nguyễn Thị Lan"
                    placeholderTextColor={PROFILE_THEME.colors.textMuted}
                    autoCapitalize="words"
                    autoCorrect={false}
                    editable={true}
                    returnKeyType="next"
                    onSubmitEditing={() => phoneInputRef.current?.focus()}
                  />
                </TouchableOpacity>
                {errors.name ? <Text style={styles.fieldErrorText}>{errors.name}</Text> : null}
              </View>

              {/* Field: Số điện thoại */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Số điện thoại <Text style={styles.requiredStar}>*</Text>
                </Text>
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => phoneInputRef.current?.focus()}
                  style={[styles.inputBox, errors.phone ? styles.inputBoxError : null]}
                >
                  <Feather name="phone" size={18} color={PROFILE_THEME.colors.textSecondary} style={styles.fieldIcon} />
                  <TextInput
                    ref={phoneInputRef}
                    style={styles.textInput}
                    value={phone}
                    onChangeText={(text) => {
                      setPhone(text);
                      if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                    }}
                    placeholder="Ví dụ: 0909 888 777"
                    placeholderTextColor={PROFILE_THEME.colors.textMuted}
                    keyboardType="phone-pad"
                    editable={true}
                    returnKeyType="done"
                  />
                </TouchableOpacity>
                {errors.phone ? <Text style={styles.fieldErrorText}>{errors.phone}</Text> : null}
              </View>

              {/* Field: Mối quan hệ */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Mối quan hệ</Text>
                <View style={styles.chipsRow}>
                  {relationshipSuggestions.map((item) => {
                    const isSelected = selectedRelation === item;
                    return (
                      <TouchableOpacity
                        key={item}
                        style={[styles.chipItem, isSelected && styles.chipItemSelected]}
                        onPress={() => {
                          setSelectedRelation(item);
                          if (errors.relation) setErrors((prev) => ({ ...prev, relation: undefined }));
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

                {selectedRelation === 'Khác' && (
                  <View style={[styles.inputBox, { marginTop: 10 }, errors.relation ? styles.inputBoxError : null]}>
                    <TextInput
                      style={styles.textInput}
                      value={customRelation}
                      onChangeText={(text) => {
                        setCustomRelation(text);
                        if (errors.relation) setErrors((prev) => ({ ...prev, relation: undefined }));
                      }}
                      placeholder="Nhập mối quan hệ (ví dụ: Chú, Bác, Đồng nghiệp...)"
                      placeholderTextColor={PROFILE_THEME.colors.textMuted}
                      autoCapitalize="words"
                      editable={true}
                    />
                  </View>
                )}
                {errors.relation ? <Text style={styles.fieldErrorText}>{errors.relation}</Text> : null}
              </View>

              {/* Nút lưu liên hệ */}
              <TouchableOpacity
                style={[styles.saveButtonInCard, saving && styles.saveButtonDisabled]}
                onPress={handleSaveContact}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {savedContact ? 'Cập nhật liên hệ' : 'Lưu liên hệ'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  navbarPlusBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: PROFILE_THEME.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: PROFILE_THEME.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
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
    paddingBottom: 40,
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
    color: '#1E3A8A',
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

  // Swipe Container
  swipeContainer: {
    position: 'relative',
    borderRadius: PROFILE_THEME.radius.card,
    overflow: 'hidden',
    backgroundColor: '#EF4444',
  },
  swipeDeleteAction: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 86,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    zIndex: 1,
  },
  swipeDeleteText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  savedCard: {
    zIndex: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: PROFILE_THEME.radius.card,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: PROFILE_THEME.colors.borderLight,
    shadowColor: PROFILE_THEME.colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
    gap: 10,
  },
  cardContentTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  savedAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: PROFILE_THEME.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: PROFILE_THEME.colors.primaryBorder,
  },
  savedAvatarText: {
    fontSize: 17,
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
    flexShrink: 1,
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
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: PROFILE_THEME.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  swipeHintText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
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

  // Form Card
  formCard: {
    backgroundColor: PROFILE_THEME.colors.card,
    borderRadius: PROFILE_THEME.radius.card,
    padding: 18,
    borderWidth: 1,
    borderColor: PROFILE_THEME.colors.borderLight,
    gap: 14,
  },
  formHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: PROFILE_THEME.colors.textPrimary,
  },
  closeFormBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  closeFormText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: PROFILE_THEME.colors.textPrimary,
  },
  requiredStar: {
    color: '#EF4444',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: PROFILE_THEME.radius.input,
    borderWidth: 1.2,
    borderColor: PROFILE_THEME.colors.border,
    paddingHorizontal: 14,
    height: 50,
  },
  inputBoxError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  fieldIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    height: '100%',
    fontSize: 14.5,
    color: PROFILE_THEME.colors.textPrimary,
    paddingVertical: 0,
  },
  fieldErrorText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    marginLeft: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
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
  saveButtonInCard: {
    backgroundColor: PROFILE_THEME.colors.primary,
    height: 48,
    borderRadius: PROFILE_THEME.radius.button,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

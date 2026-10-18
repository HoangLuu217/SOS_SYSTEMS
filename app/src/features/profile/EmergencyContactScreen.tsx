import React, { useState, useEffect, useRef } from 'react';
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
  Animated,
  PanResponder,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { PROFILE_THEME } from './theme';
import { backendApi, EmergencyContact } from '@/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface EmergencyContactScreenProps {
  onBack: () => void;
  onContactSaved?: (contact: EmergencyContact) => void;
}

// Helper lấy ký tự viết tắt đại diện
const getInitials = (contactName?: string) => {
  if (!contactName) return 'LH';
  const parts = contactName.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return contactName.substring(0, 2).toUpperCase();
};

/**
 * Component từng dòng người liên hệ - Hỗ trợ vuốt sang TRÁI để xoá
 */
interface ContactSwipeableRowProps {
  contact: EmergencyContact;
  onEdit: (contact: EmergencyContact) => void;
  onDelete: (contact: EmergencyContact) => void;
  onCall: (phone: string) => void;
  onSwipeActive: (active: boolean) => void;
}

const ContactSwipeableRow: React.FC<ContactSwipeableRowProps> = ({
  contact,
  onEdit,
  onDelete,
  onCall,
  onSwipeActive,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const isSwipedOpen = useRef(false);

  const resetSwipe = () => {
    isSwipedOpen.current = false;
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        // Bắt cử chỉ vuốt ngang sang TRÁI (gestureState.dx < -8)
        return gestureState.dx < -8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderGrant: () => {
        onSwipeActive(true);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          // Vuốt sang trái: kéo card về bên trái, tối đa -120px
          const newX = Math.max(gestureState.dx, -120);
          translateX.setValue(newX);
        } else if (isSwipedOpen.current && gestureState.dx > 0) {
          // Kéo ngược lại về phải khi đang mở nút xoá
          const newX = Math.min(0, -90 + gestureState.dx);
          translateX.setValue(newX);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        onSwipeActive(false);
        if (gestureState.dx < -110) {
          // Vuốt mạnh sang trái: mở sẵn và kích hoạt xác nhận xoá
          Animated.timing(translateX, {
            toValue: -90,
            duration: 150,
            useNativeDriver: true,
          }).start(() => {
            isSwipedOpen.current = true;
            onDelete(contact);
          });
        } else if (gestureState.dx < -45) {
          // Vuốt vừa phải: giữ mở nút Xoá màu đỏ ở bên phải
          Animated.spring(translateX, {
            toValue: -90,
            useNativeDriver: true,
            bounciness: 4,
          }).start(() => {
            isSwipedOpen.current = true;
          });
        } else {
          resetSwipe();
        }
      },
      onPanResponderTerminate: () => {
        onSwipeActive(false);
        resetSwipe();
      },
    })
  ).current;

  return (
    <View style={styles.swipeContainer}>
      {/* Nút Xoá nền đỏ nằm ở bên PHẢI, lộ ra khi vuốt thẻ sang TRÁI */}
      <TouchableOpacity
        style={styles.deleteRightBtn}
        onPress={() => {
          resetSwipe();
          onDelete(contact);
        }}
        activeOpacity={0.85}
      >
        <Feather name="trash-2" size={20} color="#FFFFFF" />
        <Text style={styles.deleteRightText}>Xoá</Text>
      </TouchableOpacity>

      {/* Thẻ liên hệ chính: Chạm vào để sửa, vuốt sang TRÁI để xoá */}
      <Animated.View
        style={[
          styles.savedCard,
          {
            transform: [{ translateX }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.cardContentPressable}
          onPress={() => {
            if (isSwipedOpen.current) {
              resetSwipe();
            } else {
              onEdit(contact);
            }
          }}
          activeOpacity={0.85}
        >
          <View style={styles.savedAvatar}>
            <Text style={styles.savedAvatarText}>{getInitials(contact.name)}</Text>
          </View>

          <View style={styles.savedInfo}>
            <View style={styles.savedNameRow}>
              <Text style={styles.savedName} numberOfLines={1}>
                {contact.name}
              </Text>
              <View style={styles.relationBadge}>
                <Text style={styles.relationBadgeText}>{contact.relation || 'Người thân'}</Text>
              </View>
            </View>
            <Text style={styles.savedPhone}>{contact.phone}</Text>
          </View>
        </TouchableOpacity>

        {/* Nút gọi nhanh */}
        <TouchableOpacity
          style={styles.callButton}
          onPress={() => onCall(contact.phone)}
          activeOpacity={0.8}
        >
          <Feather name="phone-call" size={17} color="#FFFFFF" />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

export const EmergencyContactScreen: React.FC<EmergencyContactScreenProps> = ({
  onBack,
  onContactSaved,
}) => {
  // Suggested relationship chips
  const relationshipSuggestions = ['Cha', 'Mẹ', 'Vợ/Chồng', 'Anh/Chị/Em', 'Bạn bè', 'Khác'];

  // Danh sách các người liên hệ khẩn cấp
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRelation, setSelectedRelation] = useState('Cha');
  const [customRelation, setCustomRelation] = useState('');

  const [errors, setErrors] = useState<{ name?: string; phone?: string; relation?: string }>({});
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Điều khiển ScrollView khi đang vuốt ngang (tránh xung đột cử chỉ vuốt)
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Tải danh sách người liên hệ từ local hoặc backend
  useEffect(() => {
    const loadContacts = async () => {
      try {
        // 1. Kiểm tra cache danh sách contacts
        const storedList = await AsyncStorage.getItem('@sos_emergency_contacts');
        if (storedList) {
          const parsed = JSON.parse(storedList);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setContacts(parsed);
            return;
          }
        }

        // 2. Kiểm tra cache liên hệ đơn cũ
        const storedSingle = await AsyncStorage.getItem('@sos_emergency_contact');
        if (storedSingle) {
          const parsedSingle = JSON.parse(storedSingle);
          if (parsedSingle && parsedSingle.name) {
            const initialList = [{ ...parsedSingle, id: parsedSingle.id || Date.now().toString() }];
            setContacts(initialList);
            await AsyncStorage.setItem('@sos_emergency_contacts', JSON.stringify(initialList));
            return;
          }
        }

        // 3. Tải từ backend profile
        const profileRes = await backendApi.getCitizenProfile();
        if (profileRes.success && profileRes.data?.citizen) {
          const citizen = profileRes.data.citizen;
          let loadedList: EmergencyContact[] = [];

          if (Array.isArray(citizen.emergencyContacts) && citizen.emergencyContacts.length > 0) {
            loadedList = citizen.emergencyContacts;
          } else if (citizen.emergencyContact && citizen.emergencyContact.name) {
            loadedList = [{ ...citizen.emergencyContact, id: Date.now().toString() }];
          }

          if (loadedList.length > 0) {
            setContacts(loadedList);
            await AsyncStorage.setItem('@sos_emergency_contacts', JSON.stringify(loadedList));
            await AsyncStorage.setItem('@sos_emergency_contact', JSON.stringify(loadedList[0]));
          }
        }
      } catch {}
    };
    loadContacts();
  }, []);

  // Mở form thêm người liên hệ MỚI
  const handleOpenAdd = () => {
    setName('');
    setPhone('');
    setSelectedRelation('Cha');
    setCustomRelation('');
    setErrors({});
    setEditingContactId(null);
    setIsFormOpen(true);
  };

  // Mở form chỉnh sửa người liên hệ ĐÃ CÓ
  const handleStartEditing = (contact: EmergencyContact) => {
    setName(contact.name || '');
    setPhone(contact.phone || '');
    if (relationshipSuggestions.includes(contact.relation)) {
      setSelectedRelation(contact.relation);
      setCustomRelation('');
    } else {
      setSelectedRelation('Khác');
      setCustomRelation(contact.relation || '');
    }
    setErrors({});
    setEditingContactId(contact.id || null);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingContactId(null);
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

  // Lưu liên hệ: Cập nhật UI & local storage NGAY TỨC THÌ (Optimistic Update)
  const handleSaveContact = () => {
    if (!validate()) return;

    const relationFinal = selectedRelation === 'Khác' ? customRelation.trim() : selectedRelation;
    const cleanPhone = phone.replace(/\s+/g, '');

    let updatedContacts: EmergencyContact[] = [];

    if (editingContactId) {
      // Cập nhật người liên hệ hiện tại
      updatedContacts = contacts.map((c) =>
        c.id === editingContactId
          ? { ...c, name: name.trim(), phone: cleanPhone, relation: relationFinal }
          : c
      );
    } else {
      // Thêm mới một người liên hệ vào danh sách
      const newContact: EmergencyContact = {
        id: Date.now().toString(),
        name: name.trim(),
        phone: cleanPhone,
        relation: relationFinal,
      };
      updatedContacts = [...contacts, newContact];
    }

    // 1. CẬP NHẬT GIAO DIỆN NGAY LẬP TỨC (0ms)
    const wasEditing = Boolean(editingContactId);
    setContacts(updatedContacts);
    setIsFormOpen(false);
    setEditingContactId(null);
    setToastMessage(
      wasEditing
        ? 'Đã cập nhật thông tin liên hệ thành công'
        : 'Đã thêm người liên hệ khẩn cấp mới'
    );
    setTimeout(() => setToastMessage(null), 2500);

    // 2. Lưu local storage không chặn giao diện
    AsyncStorage.setItem('@sos_emergency_contacts', JSON.stringify(updatedContacts)).catch(() => {});
    if (updatedContacts.length > 0) {
      AsyncStorage.setItem('@sos_emergency_contact', JSON.stringify(updatedContacts[0])).catch(() => {});
    }

    if (onContactSaved && updatedContacts.length > 0) {
      onContactSaved(updatedContacts[0]);
    }

    // 3. Đồng bộ lên máy chủ ngầm (background sync)
    backendApi.updateEmergencyContact(updatedContacts).catch((err: any) => {
      console.warn('[Sync Contact Error]:', err);
    });
  };

  // Xác nhận xoá người liên hệ
  const handleDeleteContact = (contact: EmergencyContact) => {
    Alert.alert(
      'Xoá người liên hệ?',
      `Bạn có chắc chắn muốn xoá "${contact.name}" khỏi danh bạ khẩn cấp không?`,
      [
        {
          text: 'Huỷ bỏ',
          style: 'cancel',
        },
        {
          text: 'Xoá ngay',
          style: 'destructive',
          onPress: () => executeDeleteContact(contact),
        },
      ]
    );
  };

  // Thực hiện xoá: Cập nhật biến mất trên UI NGAY LẬP TỨC
  const executeDeleteContact = (contact: EmergencyContact) => {
    const previousContacts = contacts;
    const updatedContacts = contacts.filter((c) => c.id !== contact.id);

    // 1. Biến mất khỏi màn hình ngay tức thì (0ms)
    setContacts(updatedContacts);

    if (editingContactId === contact.id) {
      setIsFormOpen(false);
      setEditingContactId(null);
    }

    setToastMessage(`Đã xoá "${contact.name}"`);
    setTimeout(() => setToastMessage(null), 2500);

    // 2. Lưu local storage
    AsyncStorage.setItem('@sos_emergency_contacts', JSON.stringify(updatedContacts)).catch(() => {});
    if (updatedContacts.length > 0) {
      AsyncStorage.setItem(
        '@sos_emergency_contact',
        JSON.stringify(updatedContacts[0])
      ).catch(() => {});
    } else {
      AsyncStorage.removeItem('@sos_emergency_contact').catch(() => {});
    }

    // 3. Gọi xoá ngầm trên backend
    if (updatedContacts.length === 0) {
      // Khi đã xoá sạch, gọi endpoint xoá toàn bộ để đồng bộ triệt để
      backendApi.deleteEmergencyContact().catch(() => {});
    } else {
      backendApi.deleteEmergencyContact(contact.id).catch((err: any) => {
        console.warn('[Delete Contact Error]:', err);
        // Rollback nếu có lỗi mạng
        setContacts(previousContacts);
        Alert.alert('Lỗi', 'Không thể xoá người liên hệ trên máy chủ.');
      });
    }
  };

  const handleCall = (phoneNumber: string) => {
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanNumber}`).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header Navbar */}
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

        {/* Dấu cộng tròn nổi góc phải trên navbar */}
        <TouchableOpacity
          style={[styles.navbarPlusBtn, isFormOpen && !editingContactId && styles.navbarPlusBtnActive]}
          onPress={isFormOpen ? handleCloseForm : handleOpenAdd}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather
            name={isFormOpen ? 'x' : 'plus'}
            size={20}
            color={isFormOpen ? '#64748B' : '#0066FF'}
          />
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
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={scrollEnabled}
        >
          {/* Thông tin mô tả người bảo hộ */}
          <View style={styles.infoCard}>
            <View style={styles.infoIconBox}>
              <Feather name="shield" size={20} color="#0066FF" />
            </View>
            <View style={styles.infoTextBox}>
              <Text style={styles.infoTitle}>Người bảo hộ khẩn cấp</Text>
              <Text style={styles.infoDescription}>
                Khi bạn bấm nút cứu hộ SOS, hệ thống sẽ tự động gửi thông báo cứu nạn và định vị tới số điện thoại của người thân này.
              </Text>
            </View>
          </View>

          {/* TIÊU ĐỀ KHU VỰC DANH SÁCH */}
          <View style={styles.sectionHeaderWrap}>
            <View style={styles.sectionHeaderTitleRow}>
              <Text style={styles.sectionHeader}>Danh sách người liên hệ</Text>
              {contacts.length > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{contacts.length}</Text>
                </View>
              )}
            </View>
            {contacts.length > 0 && (
              <Text style={styles.sectionSubHeader}>
                💡 Chạm vào để sửa • Vuốt sang trái để xoá
              </Text>
            )}
          </View>

          {/* DANH SÁCH CÁC NGƯỜI LIÊN HỆ */}
          {contacts.length > 0 ? (
            <View style={{ gap: 12 }}>
              {contacts.map((contact) => (
                <ContactSwipeableRow
                  key={contact.id || contact.phone}
                  contact={contact}
                  onEdit={handleStartEditing}
                  onDelete={handleDeleteContact}
                  onCall={handleCall}
                  onSwipeActive={(active) => setScrollEnabled(!active)}
                />
              ))}
            </View>
          ) : (
            !isFormOpen && (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="user-plus" size={26} color="#0066FF" />
                </View>
                <Text style={styles.emptyTitle}>Chưa có người liên hệ khẩn cấp</Text>
                <Text style={styles.emptySubtitle}>
                  Nhấn nút dấu cộng (+) ở góc trên bên phải hoặc nút bên dưới để thêm người thân bảo hộ khi phát tín hiệu cứu hộ.
                </Text>
                <TouchableOpacity
                  style={styles.emptyAddBtn}
                  onPress={handleOpenAdd}
                  activeOpacity={0.8}
                >
                  <Feather name="plus" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.emptyAddBtnText}>Thêm người liên hệ</Text>
                </TouchableOpacity>
              </View>
            )
          )}

          {/* FORM THÊM MỚI HOẶC CHỈNH SỬA */}
          {isFormOpen && (
            <View style={styles.formCard}>
              <View style={styles.formHeaderRow}>
                <View style={styles.formHeaderLeft}>
                  <View style={styles.formIconDot} />
                  <Text style={styles.formTitle}>
                    {editingContactId ? 'Chỉnh sửa liên hệ' : 'Thêm liên hệ khẩn cấp'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleCloseForm}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.formCancelText}>Huỷ</Text>
                </TouchableOpacity>
              </View>

              {/* Field: Họ và tên */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Họ và tên người liên hệ <Text style={styles.requiredStar}>*</Text>
                </Text>
                <View style={[styles.inputBox, errors.name ? styles.inputBoxError : null]}>
                  <Feather name="user" size={18} color="#64748B" style={styles.fieldIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={name}
                    onChangeText={(text) => {
                      setName(text);
                      if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    placeholder="Ví dụ: Nguyễn Văn An"
                    placeholderTextColor="#94A3B8"
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
                  <Feather name="phone" size={18} color="#64748B" style={styles.fieldIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={phone}
                    onChangeText={(text) => {
                      setPhone(text);
                      if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                    }}
                    placeholder="Ví dụ: 0912 345 678"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                  />
                </View>
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
                          if (errors.relation)
                            setErrors((prev) => ({ ...prev, relation: undefined }));
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

                {/* Ô nhập quan hệ khác nếu chọn 'Khác' */}
                {selectedRelation === 'Khác' && (
                  <View
                    style={[
                      styles.inputBox,
                      { marginTop: 10 },
                      errors.relation ? styles.inputBoxError : null,
                    ]}
                  >
                    <TextInput
                      style={styles.textInput}
                      value={customRelation}
                      onChangeText={(text) => {
                        setCustomRelation(text);
                        if (errors.relation)
                          setErrors((prev) => ({ ...prev, relation: undefined }));
                      }}
                      placeholder="Nhập mối quan hệ (ví dụ: Chú, Bác, Đồng nghiệp...)"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                )}
                {errors.relation ? <Text style={styles.fieldErrorText}>{errors.relation}</Text> : null}
              </View>

              {/* Nhóm nút trong form */}
              <View style={styles.formActionRow}>
                <TouchableOpacity
                  style={styles.formCancelBtn}
                  onPress={handleCloseForm}
                  activeOpacity={0.8}
                >
                  <Text style={styles.formCancelBtnText}>Huỷ bỏ</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.formSaveBtn, saving && styles.saveButtonDisabled]}
                  onPress={handleSaveContact}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <View style={styles.btnRow}>
                      <Feather name="check" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.formSaveBtnText}>
                        {editingContactId ? 'Cập nhật' : 'Lưu liên hệ'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  navbarPlusBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  navbarPlusBtnActive: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  successToast: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    zIndex: 99,
    backgroundColor: '#10B981',
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
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
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
    fontSize: 14,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 4,
  },
  infoDescription: {
    fontSize: 12.5,
    color: '#3B82F6',
    lineHeight: 18,
  },
  // Tiêu đề khu vực danh sách
  sectionHeaderWrap: {
    marginTop: 4,
    gap: 4,
  },
  sectionHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  countBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066FF',
  },
  sectionSubHeader: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '500',
  },
  // Container vuốt sang TRÁI để xoá
  swipeContainer: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#EF4444',
  },
  deleteRightBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 90,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    zIndex: 1,
  },
  deleteRightText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
    zIndex: 10,
  },
  cardContentPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  savedAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  savedAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0066FF',
  },
  savedInfo: {
    flex: 1,
    gap: 3,
  },
  savedNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  savedName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  relationBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  relationBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  savedPhone: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  callButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  // Empty State
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    gap: 10,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0066FF',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 6,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  // Form Card
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  formHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
  },
  formHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  formIconDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0066FF',
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  formCancelText: {
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
    color: '#334155',
  },
  requiredStar: {
    color: '#EF4444',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    backgroundColor: '#F8FAFC',
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
    fontSize: 14,
    color: '#0F172A',
    height: '100%',
  },
  fieldErrorText: {
    fontSize: 11.5,
    color: '#EF4444',
    marginTop: 2,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipItem: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipItemSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
  },
  chipText: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#0066FF',
    fontWeight: '700',
  },
  formActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  formCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  formCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  formSaveBtn: {
    flex: 2,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  formSaveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

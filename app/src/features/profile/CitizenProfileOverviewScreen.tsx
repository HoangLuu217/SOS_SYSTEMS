import React, { useState, useEffect } from 'react';
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
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROFILE_THEME } from './theme';
import { useAuth } from '@/context/AuthContext';
import { backendApi, EmergencyContact } from '@/api';
import { LogoSOS } from '@/components';
import { RescuerVerificationStatusModal } from './RescuerVerificationStatusModal';

export interface CitizenProfileOverviewScreenProps {
  onNavigateToEditProfile: () => void;
  onNavigateToEmergencyContact: () => void;
  onNavigateToProfessional?: () => void;
  onNavigateToSosHistory: () => void;
  onNavigateToSecurity: () => void;
  onNavigateToNotificationSettings: () => void;
  onNavigateToNotifications: () => void;
  unreadNotificationsCount?: number;
  refreshTrigger?: number;
}

export const CitizenProfileOverviewScreen: React.FC<CitizenProfileOverviewScreenProps> = ({
  onNavigateToEditProfile,
  onNavigateToEmergencyContact,
  onNavigateToProfessional,
  onNavigateToSosHistory,
  onNavigateToSecurity,
  onNavigateToNotificationSettings,
  onNavigateToNotifications,
  unreadNotificationsCount = 3,
  refreshTrigger,
}) => {
  const { user, logout, updateUserAvatar } = useAuth();

  // Avatar state
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(null);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  // Logout modal state
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);

  // Emergency contact preview state
  const [emergencyContact, setEmergencyContact] = useState<EmergencyContact | null>(null);

  // Trạng thái đăng ký Cứu hộ viên (Rescuer)
  const [rescuerStatus, setRescuerStatus] = useState<string>('NOT_REGISTERED');
  const [rescuerData, setRescuerData] = useState<any>(null);
  const [statusModalVisible, setStatusModalVisible] = useState<boolean>(false);

  // Dữ liệu người dùng thực tế từ User Profile (không dùng mock)
  const displayName = user?.fullName || 'Người dân';
  const displayPhone = user?.phone || 'Chưa cập nhật SĐT';
  const displayEmail = user?.email || 'Chưa có email';

  // Tải thông tin người liên hệ khẩn cấp (đồng bộ real-time khi quay lại màn hình)
  useEffect(() => {
    let isMounted = true;
    const loadEmergencyContact = async () => {
      try {
        const stored = await AsyncStorage.getItem('@sos_emergency_contact');
        if (stored && isMounted) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.name && String(parsed.name).trim()) {
              setEmergencyContact(parsed);
            } else {
              setEmergencyContact(null);
            }
          } catch {
            setEmergencyContact(null);
          }
        } else if (isMounted) {
          setEmergencyContact(null);
        }

        const res = await backendApi.getCitizenProfile();
        if (res.success && isMounted) {
          const contactsList = res.data?.citizen?.emergencyContacts;
          const single = res.data?.citizen?.emergencyContact;

          if (Array.isArray(contactsList) && contactsList.length > 0) {
            const first = contactsList[0];
            setEmergencyContact(first);
            await AsyncStorage.setItem('@sos_emergency_contact', JSON.stringify(first));
            await AsyncStorage.setItem('@sos_emergency_contacts', JSON.stringify(contactsList));
          } else if (single && single.name && String(single.name).trim()) {
            setEmergencyContact(single);
            await AsyncStorage.setItem('@sos_emergency_contact', JSON.stringify(single));
          } else {
            // Khi không còn liên hệ nào, gỡ sạch khỏi state & bộ nhớ đệm
            setEmergencyContact(null);
            await AsyncStorage.removeItem('@sos_emergency_contact');
            await AsyncStorage.setItem('@sos_emergency_contacts', '[]');
          }
        }
      } catch {
        // Giữ fallback đã lưu
      }
    };

    const loadRescuerStatus = async () => {
      try {
        const res = await backendApi.getRescuerProfile();
        if (res.success && res.data && isMounted) {
          setRescuerData(res.data);
          const status = res.data.rescuer?.verificationStatus || 'NOT_REGISTERED';
          setRescuerStatus(status);

          // Tự động mở Modal chi tiết hồ sơ thẩm định nếu người dùng vừa mới nộp đơn
          try {
            const justApplied = await AsyncStorage.getItem('@sos_just_applied_rescuer');
            if (justApplied === 'true' && isMounted) {
              await AsyncStorage.removeItem('@sos_just_applied_rescuer');
              setStatusModalVisible(true);
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // Mặc định Chưa đăng ký
      }
    };

    loadEmergencyContact();
    loadRescuerStatus();
    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  // Lắng nghe sự kiện duyệt hồ sơ Cứu hộ viên theo thời gian thực (Realtime)
  useEffect(() => {
    const handleVerificationRealtime = async (payload: any) => {
      console.log('⚡ [CitizenProfile] Nhận tín hiệu duyệt cứu hộ viên realtime:', payload);
      if (payload?.verificationStatus) {
        setRescuerStatus(payload.verificationStatus);
      }
      try {
        const res = await backendApi.getRescuerProfile();
        if (res.success && res.data) {
          setRescuerData(res.data);
          const st = res.data.rescuer?.verificationStatus || payload?.verificationStatus || 'NOT_REGISTERED';
          setRescuerStatus(st);
        }
      } catch (e) {
        if (payload?.rescuer) {
          setRescuerData((prev: any) => ({
            ...prev,
            rescuer: { ...(prev?.rescuer || {}), ...payload.rescuer },
          }));
        }
      }
    };

    const sub1 = DeviceEventEmitter.addListener('rescuer:verification_status_changed', handleVerificationRealtime);
    const sub2 = DeviceEventEmitter.addListener('user:profile_updated', handleVerificationRealtime);

    return () => {
      sub1.remove();
      sub2.remove();
    };
  }, []);

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

  const emergencyContactText = emergencyContact?.name
    ? `${emergencyContact.name} · ${emergencyContact.relation || 'Người thân'}`
    : 'Chưa thiết lập (Chạm để cài đặt)';

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
        {/* 2. Main Citizen Profile Card */}
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

          {/* Citizen Name */}
          <Text style={styles.profileName}>{displayName}</Text>

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
                Nhấn vào đây để xác thực SĐT qua SMS phục vụ cứu hộ khẩn cấp
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color="#D97706" />
          </TouchableOpacity>
        )}

        {/* Card Đăng ký Rescuer */}
        {onNavigateToProfessional && (
          <LinearGradient
            colors={
              rescuerStatus === 'PENDING'
                ? ['#FFFBEB', '#FEF3C7', '#FFFFFF']
                : ['#F0F7FF', '#F8FAFF', '#FFFFFF']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.rescuerCard,
              rescuerStatus === 'PENDING' && { borderColor: '#FDE68A' },
            ]}
          >
            {/* Header: Icon & Titles */}
            <View style={styles.rescuerCardHeader}>
              <View style={styles.rescuerHeaderLeft}>
                <View
                  style={[
                    styles.rescuerIconBox,
                    rescuerStatus === 'PENDING' && { backgroundColor: '#D97706' },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={rescuerStatus === 'PENDING' ? 'timer-sand' : 'hand-heart'}
                    size={26}
                    color="#FFFFFF"
                  />
                </View>
                <View style={styles.rescuerTitleCol}>
                  <View style={styles.rescuerTitleRow}>
                    <Text style={styles.rescuerTitle}>Đăng ký Cứu hộ viên</Text>
                    <MaterialCommunityIcons
                      name={
                        rescuerStatus === 'PENDING'
                          ? 'shield-sync-outline'
                          : 'shield-check-outline'
                      }
                      size={18}
                      color={rescuerStatus === 'PENDING' ? '#D97706' : '#0066FF'}
                      style={styles.rescuerVerifiedIcon}
                    />
                  </View>
                  <Text
                    style={[
                      styles.rescuerSubtitle,
                      rescuerStatus === 'PENDING' && { color: '#D97706' },
                    ]}
                  >
                    {rescuerStatus === 'PENDING' ? 'HỒ SƠ ĐANG CHỜ XÉT DUYỆT' : 'LỰC LƯỢNG TÌNH NGUYỆN'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Description Text */}
            <Text style={styles.rescuerDesc}>
              {rescuerStatus === 'PENDING'
                ? 'Hồ sơ chuyên môn của bạn đang được Ban Chỉ huy PCTT & TKCN địa phương thẩm định năng lực và đối soát thực địa.'
                : 'Tham gia đội ngũ hỗ trợ cứu hộ và ứng phó thiên tai, lũ lụt tại địa phương. Giúp đỡ đồng bào trong những thời điểm khẩn cấp nhất.'}
            </Text>

            {/* Action Button */}
            <TouchableOpacity
              style={[
                styles.rescuerActionBtn,
                rescuerStatus === 'PENDING' && styles.rescuerActionBtnPending,
              ]}
              onPress={() => {
                if (rescuerStatus === 'PENDING') {
                  setStatusModalVisible(true);
                } else {
                  onNavigateToProfessional();
                }
              }}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons
                name={rescuerStatus === 'PENDING' ? 'timer-sand' : 'account-plus'}
                size={19}
                color={rescuerStatus === 'PENDING' ? '#B45309' : '#FFFFFF'}
              />
              <Text
                style={[
                  styles.rescuerActionBtnText,
                  rescuerStatus === 'PENDING' && styles.rescuerActionBtnTextPending,
                ]}
              >
                {rescuerStatus === 'PENDING' ? 'Chờ duyệt - Xem chi tiết hồ sơ' : 'Đăng ký Cứu hộ viên ngay'}
              </Text>
            </TouchableOpacity>
          </LinearGradient>
        )}

        {/* 3. Menu Items for Citizen */}
        <View style={styles.menuCard}>
          {/* Item: Hồ sơ Cứu hộ viên chuyên môn */}
          {onNavigateToProfessional && (
            <>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  if (rescuerStatus === 'PENDING') {
                    setStatusModalVisible(true);
                  } else {
                    onNavigateToProfessional();
                  }
                }}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.menuIconBox,
                    { backgroundColor: rescuerStatus === 'PENDING' ? '#FEF3C7' : '#EFF6FF' },
                  ]}
                >
                  <Feather
                    name={rescuerStatus === 'PENDING' ? 'clock' : 'award'}
                    size={18}
                    color={rescuerStatus === 'PENDING' ? '#D97706' : '#0066FF'}
                  />
                </View>
                <View style={styles.menuTextBox}>
                  <Text style={styles.menuTitle}>Hồ sơ chuyên môn Cứu hộ</Text>
                  <Text style={styles.menuDesc}>
                    {rescuerStatus === 'PENDING'
                      ? 'Đang chờ thẩm định hồ sơ - Bấm để xem hoặc cập nhật'
                      : 'Kỹ năng tác chiến, CCCD, phương tiện'}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color="#94A3B8" />
              </TouchableOpacity>
              <View style={styles.menuDivider} />
            </>
          )}

          {/* Item 1.5: Lịch sử báo nạn (SOS History) */}
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
              <Text style={styles.menuDesc}>Theo dõi trạng thái các SOS đã gửi</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          {/* Item 1: Thông tin cá nhân (Edit Profile with Vietnam Provinces API) */}
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
              <Text style={styles.menuDesc}>Họ tên, ngày sinh, địa chỉ cư trú</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          {/* Item 2: Liên hệ khẩn cấp (Emergency Contacts for Citizen) */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={onNavigateToEmergencyContact}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconBox, { backgroundColor: '#EFF6FF' }]}>
              <Feather name="heart" size={18} color={PROFILE_THEME.colors.primary} />
            </View>
            <View style={styles.menuTextBox}>
              <Text style={styles.menuTitle}>Người liên hệ khẩn cấp</Text>
              <Text
                style={[
                  styles.menuDesc,
                  emergencyContact?.name ? { color: PROFILE_THEME.colors.primary, fontWeight: '600' } : null,
                ]}
                numberOfLines={1}
              >
                {emergencyContactText}
              </Text>
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
              <Text style={styles.menuDesc}>Mật khẩu đăng nhập & xác thực</Text>
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

        {/* 4. Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => setLogoutDialogVisible(true)}
          activeOpacity={0.8}
        >
          <Feather name="log-out" size={16} color="#0066FF" />
          <Text style={styles.logoutButtonText}>Đăng xuất tài khoản</Text>
        </TouchableOpacity>
      </ScrollView>

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
              Ảnh này sẽ hiển thị trên thông tin hồ sơ cứu hộ của bạn
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
              Bạn sẽ cần đăng nhập lại bằng số điện thoại hoặc email để tiếp tục sử dụng ứng dụng.
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

      {/* Modal: Tiến trình & Trạng thái xác minh Cứu hộ viên */}
      <RescuerVerificationStatusModal
        visible={statusModalVisible}
        onClose={() => setStatusModalVisible(false)}
        onUpdateProfile={() => {
          setStatusModalVisible(false);
          onNavigateToProfessional?.();
        }}
        rescuerData={rescuerData}
      />
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
    backgroundColor: PROFILE_THEME.colors.primary,
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
    backgroundColor: PROFILE_THEME.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: PROFILE_THEME.colors.primaryBorder,
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '800',
    color: PROFILE_THEME.colors.primary,
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: PROFILE_THEME.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  profileName: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
    textAlign: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0066FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: PROFILE_THEME.radius.badge,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: PROFILE_THEME.radius.badge,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  verifiedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  accountStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
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
    borderColor: PROFILE_THEME.colors.primary,
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
    backgroundColor: PROFILE_THEME.colors.primary,
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
  rescuerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    padding: 16,
    marginBottom: 14,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  rescuerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rescuerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  rescuerIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rescuerTitleCol: {
    flex: 1,
  },
  rescuerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rescuerTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  rescuerVerifiedIcon: {
    marginLeft: 2,
  },
  rescuerSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0066FF',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  rescuerDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#334155',
    marginTop: 14,
    marginBottom: 16,
  },
  rescuerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0066FF',
    borderRadius: 12,
    paddingVertical: 13,
    gap: 8,
    minHeight: 48,
  },
  rescuerActionBtnPending: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
  },
  rescuerActionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rescuerActionBtnTextPending: {
    color: '#B45309',
  },
});


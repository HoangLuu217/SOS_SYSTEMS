import React, { useState } from 'react';
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
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { PROFILE_THEME } from './theme';
import { useAuth } from '../../context/AuthContext';
import { LogoSOS } from '../../components/LogoSOS';

export type RescuerAvailability =
  | 'OFFLINE'      // Ngoại tuyến
  | 'READY'        // Sẵn sàng
  | 'BUSY'         // Đang bận
  | 'ON_MISSION'   // Đang làm nhiệm vụ
  | 'SUSPENDED';   // Tạm đình chỉ

export interface RescuerProfileOverviewScreenProps {
  onNavigateToEditProfile: () => void;
  onNavigateToProfessional: () => void;
  onNavigateToSecurity: () => void;
  onNavigateToNotificationSettings: () => void;
  onNavigateToNotifications: () => void;
  unreadNotificationsCount?: number;
}

export const RescuerProfileOverviewScreen: React.FC<RescuerProfileOverviewScreenProps> = ({
  onNavigateToEditProfile,
  onNavigateToProfessional,
  onNavigateToSecurity,
  onNavigateToNotificationSettings,
  onNavigateToNotifications,
  unreadNotificationsCount = 3,
}) => {
  const { user, logout, updateUserAvatar } = useAuth();

  // Avatar state
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(null);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  // Logout modal state
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);

  // Rescuer Availability State (Mặc định 'READY' - Sẵn sàng tác chiến)
  const [availability, setAvailability] = useState<RescuerAvailability>('READY');
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  // Dữ liệu thực tế từ User Profile
  const isLeader = user?.roles?.includes('LEADER');
  const roleName = isLeader ? 'Đội trưởng cứu hộ' : 'Nhân viên cứu hộ';
  const displayName = user?.fullName || 'Nhân viên cứu hộ';
  const displayPhone = user?.phone || 'Chưa cập nhật SĐT';
  const displayEmail = user?.email || 'Chưa có email';

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

  // Xử lý chuyển đổi nhanh trạng thái: Ngoại tuyến <-> Sẵn sàng
  const handleToggleAvailability = (newVal: boolean) => {
    if (availability === 'BUSY' || availability === 'ON_MISSION') {
      Alert.alert(
        'Không thể đổi trạng thái',
        'Bạn đang trong phiên làm nhiệm vụ điều động cứu hộ khẩn cấp. Vui lòng hoàn thành hoặc báo cáo chỉ huy để đổi trạng thái.'
      );
      return;
    }
    if (availability === 'SUSPENDED') {
      Alert.alert(
        'Tài khoản bị tạm đình chỉ',
        'Tài khoản của bạn đang trong trạng thái tạm đình chỉ nghiệp vụ. Vui lòng liên hệ ban quản trị để được hỗ trợ.'
      );
      return;
    }
    setAvailability(newVal ? 'READY' : 'OFFLINE');
  };

  // Lấy thông tin hiển thị trạng thái tác chiến
  const getAvailabilityConfig = (status: RescuerAvailability) => {
    switch (status) {
      case 'READY':
        return {
          label: 'Sẵn sàng',
          badgeColor: '#10B981',
          bgColor: '#ECFDF5',
          borderColor: '#A7F3D0',
          desc: 'Sẵn sàng tiếp nhận lệnh điều phối cứu nạn khẩn cấp từ trung tâm chỉ huy.',
          icon: 'radio',
        };
      case 'OFFLINE':
        return {
          label: 'Ngoại tuyến',
          badgeColor: '#64748B',
          bgColor: '#F1F5F9',
          borderColor: '#CBD5E1',
          desc: 'Tạm nghỉ hoặc không trong ca trực. Hệ thống sẽ không phân công nhiệm vụ mới.',
          icon: 'moon',
        };
      case 'BUSY':
        return {
          label: 'Đang bận',
          badgeColor: '#F59E0B',
          bgColor: '#FFFBEB',
          borderColor: '#FDE68A',
          desc: 'Đang chuẩn bị trang thiết bị hoặc kiểm tra cứu hộ. Không thể tự thay đổi trạng thái.',
          icon: 'clock',
        };
      case 'ON_MISSION':
        return {
          label: 'Đang làm nhiệm vụ',
          badgeColor: '#0284C7',
          bgColor: '#F0F9FF',
          borderColor: '#BAE6FD',
          desc: 'Đang tác chiến cứu hộ tại thực địa. Trạng thái được khóa tự động bởi hệ thống tác chiến.',
          icon: 'navigation',
        };
      case 'SUSPENDED':
        return {
          label: 'Tạm đình chỉ',
          badgeColor: '#DC2626',
          bgColor: '#FEF2F2',
          borderColor: '#FECACA',
          desc: 'Tài khoản đang bị tạm đình chỉ nghiệp vụ bởi ban chỉ huy. Không thể thay đổi trạng thái.',
          icon: 'slash',
        };
    }
  };

  const statusConfig = getAvailabilityConfig(availability);
  const isToggleDisabled =
    availability === 'BUSY' || availability === 'ON_MISSION' || availability === 'SUSPENDED';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* 1. Header: RescueSOS Branding + Notification Bell */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <LogoSOS
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.brandTitle}>RescueSOS</Text>
            <Text style={styles.brandSubtitle}>Hệ thống Điều phối Cứu hộ</Text>
          </View>
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
        {/* 2. Main Profile Card */}
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

          {/* Rescuer Name */}
          <Text style={styles.rescuerName}>{displayName}</Text>

          {/* Badges Row: Role & Professional Verification */}
          <View style={styles.badgesRow}>
            {/* Role Badge */}
            <View style={styles.roleBadge}>
              <MaterialCommunityIcons name="shield-account" size={13} color="#FFFFFF" />
              <Text style={styles.roleBadgeText}>{roleName}</Text>
            </View>

            {/* Professional Verification Badge */}
            <View style={styles.verifiedBadge}>
              <Feather name="check-circle" size={13} color="#059669" />
              <Text style={styles.verifiedBadgeText}>Hồ sơ cứu hộ đã xác minh</Text>
            </View>
          </View>

          {/* Separate Account Status */}
          <View style={styles.accountStatusRow}>
            <View style={styles.activeDot} />
            <Text style={styles.accountStatusText}>Tài khoản đang hoạt động</Text>
          </View>

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
                Nhấn vào đây để xác thực SĐT qua SMS phục vụ điều phối cứu hộ
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color="#D97706" />
          </TouchableOpacity>
        )}

        {/* 3. Availability Card (Trạng thái sẵn sàng tác chiến) */}
        <View style={styles.availabilityCard}>
          <View style={styles.availHeader}>
            <View style={styles.availTitleCol}>
              <Text style={styles.availCardTitle}>Trạng thái tác chiến</Text>
              <Text style={styles.availCardSubtitle}>Khả năng tiếp nhận lệnh điều phối</Text>
            </View>

            {/* Toggle switch between Ngoại tuyến & Sẵn sàng */}
            <View style={styles.switchWrapper}>
              <Switch
                value={availability === 'READY'}
                onValueChange={handleToggleAvailability}
                disabled={isToggleDisabled}
                trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                thumbColor={availability === 'READY' ? '#10B981' : '#F1F5F9'}
                ios_backgroundColor="#CBD5E1"
              />
            </View>
          </View>

          {/* Active Status Display Box */}
          <View
            style={[
              styles.statusDisplayBox,
              { backgroundColor: statusConfig.bgColor, borderColor: statusConfig.borderColor },
            ]}
          >
            <View style={styles.statusDisplayHeader}>
              <View
                style={[styles.statusIndicatorDot, { backgroundColor: statusConfig.badgeColor }]}
              />
              <Text style={[styles.statusLabelText, { color: statusConfig.badgeColor }]}>
                {statusConfig.label}
              </Text>
            </View>
            <Text style={styles.statusDescText}>{statusConfig.desc}</Text>
          </View>

          {/* Test Status Variant Picker Trigger */}
          <TouchableOpacity
            style={styles.statusSelectorBtn}
            onPress={() => setShowStatusPicker(true)}
            activeOpacity={0.7}
          >
            <Feather name="sliders" size={13} color="#64748B" />
            <Text style={styles.statusSelectorText}>Thử nghiệm 5 trạng thái tác chiến</Text>
            <Feather name="chevron-down" size={14} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* 4. Menu Items */}
        <View style={styles.menuCard}>
          {/* Item 1: Thông tin cá nhân */}
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
              <Text style={styles.menuDesc}>Họ tên, ngày sinh, địa chỉ thường trú</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          {/* Item 2: Hồ sơ chuyên môn */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={onNavigateToProfessional}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconBox, { backgroundColor: '#ECFDF5' }]}>
              <Feather name="award" size={18} color="#059669" />
            </View>
            <View style={styles.menuTextBox}>
              <Text style={styles.menuTitle}>Hồ sơ chuyên môn</Text>
              <Text style={styles.menuDesc}>Kỹ năng, phương tiện, địa bàn tác chiến</Text>
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
              <Text style={styles.menuDesc}>Mật khẩu đăng nhập & phiên làm việc</Text>
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

        {/* 5. Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => setLogoutDialogVisible(true)}
          activeOpacity={0.8}
        >
          <Feather name="log-out" size={16} color="#0066FF" />
          <Text style={styles.logoutButtonText}>Đăng xuất tài khoản</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal: Chọn nhanh 5 trạng thái tác chiến */}
      <Modal
        visible={showStatusPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusPicker(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowStatusPicker(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.statusPickerCard}>
                <View style={styles.statusPickerHeader}>
                  <Text style={styles.statusPickerTitle}>Chọn trạng thái tác chiến</Text>
                  <TouchableOpacity
                    onPress={() => setShowStatusPicker(false)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {(['READY', 'OFFLINE', 'BUSY', 'ON_MISSION', 'SUSPENDED'] as RescuerAvailability[]).map(
                  (st) => {
                    const cfg = getAvailabilityConfig(st);
                    const isSelected = availability === st;
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[
                          styles.statusPickerItem,
                          isSelected && {
                            backgroundColor: cfg.bgColor,
                            borderColor: cfg.borderColor,
                            borderWidth: 1.5,
                          },
                        ]}
                        onPress={() => {
                          setAvailability(st);
                          setShowStatusPicker(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.statusPickerItemLeft}>
                          <View
                            style={[
                              styles.statusPickerItemDot,
                              { backgroundColor: cfg.badgeColor },
                            ]}
                          />
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.statusPickerItemLabel,
                                isSelected && { color: cfg.badgeColor, fontWeight: '800' },
                              ]}
                            >
                              {cfg.label}
                            </Text>
                            <Text style={styles.statusPickerItemDesc} numberOfLines={2}>
                              {cfg.desc}
                            </Text>
                          </View>
                        </View>
                        {isSelected && (
                          <Feather name="check" size={18} color={cfg.badgeColor} />
                        )}
                      </TouchableOpacity>
                    );
                  }
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

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
              Ảnh này sẽ hiển thị trên hệ thống điều phối cứu hộ
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
              Bạn sẽ tạm ngưng tiếp nhận lệnh điều động trực tiếp từ trung tâm chỉ huy SOS cho đến khi đăng nhập lại.
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
  brandLogo: {
    width: 38,
    height: 38,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
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
    backgroundColor: '#0066FF',
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
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#BFDBFE',
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2563EB',
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  rescuerName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
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
    backgroundColor: '#2563EB',
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
  availabilityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: PROFILE_THEME.radius.card,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  availHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  availTitleCol: {
    flex: 1,
  },
  availCardTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  availCardSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
  },
  switchWrapper: {
    transform: Platform.OS === 'ios' ? [{ scaleX: 0.85 }, { scaleY: 0.85 }] : [],
  },
  statusDisplayBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  statusDisplayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statusIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabelText: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  statusDescText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },
  statusSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusSelectorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
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
  statusPickerCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: PROFILE_THEME.radius.sheet,
    borderTopRightRadius: PROFILE_THEME.radius.sheet,
    padding: 20,
    paddingBottom: 36,
  },
  statusPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statusPickerTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  statusPickerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  statusPickerItemDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusPickerItemLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  statusPickerItemDesc: {
    fontSize: 11.5,
    color: '#64748B',
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
    borderColor: '#2563EB',
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
    backgroundColor: '#2563EB',
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
});

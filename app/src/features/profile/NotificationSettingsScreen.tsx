import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Switch,
  Alert,
  Vibration,
  AppState,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { PROFILE_THEME } from './theme';
import { useNotifications } from '@/context/NotificationContext';
import { NotificationSettings, NotificationCategoryKey } from '@/utils';
import { playNormalNotificationSound, registerForPushNotificationsAsync } from '@/services';

interface NotificationSettingsScreenProps {
  onBack: () => void;
}

interface CategoryRowConfig {
  key: NotificationCategoryKey;
  title: string;
  desc: string;
  badge?: string;
  iconLibrary: 'feather' | 'mci';
  iconName: string;
  color: string;
  iconBg: string;
}

const MASTER_BLUE = '#0066FF';
const MASTER_TRACK_ON = '#BFDBFE';

const CATEGORY_ITEMS: CategoryRowConfig[] = [
  {
    key: 'alert',
    title: 'Cảnh báo khẩn cấp',
    desc: 'SOS, lũ quét, sạt lở, hiến máu',
    badge: 'Ưu tiên cao',
    iconLibrary: 'feather',
    iconName: 'alert-triangle',
    color: '#DC2626',
    iconBg: '#FEF2F2',
  },
  {
    key: 'safeLocation',
    title: 'Vị trí an toàn',
    desc: 'Điểm sơ tán, trạm y tế, nơi trú ẩn',
    iconLibrary: 'mci',
    iconName: 'shield-home',
    color: '#0066FF',
    iconBg: '#EFF6FF',
  },
  {
    key: 'chat',
    title: 'Nhắn tin',
    desc: 'Tin nhắn trao đổi với cán bộ & người dân',
    iconLibrary: 'feather',
    iconName: 'message-circle',
    color: '#7C3AED',
    iconBg: '#F5F3FF',
  },
  {
    key: 'systemNotification',
    title: 'Thông báo hệ thống',
    desc: 'Điều phối cứu hộ, hồ sơ & tài khoản',
    iconLibrary: 'feather',
    iconName: 'bell',
    color: '#0066FF',
    iconBg: '#EFF6FF',
  },
  {
    key: 'news',
    title: 'Tin tức & Thời tiết',
    desc: 'Dự báo thời tiết và bản tin cảnh báo',
    iconLibrary: 'feather',
    iconName: 'file-text',
    color: '#D97706',
    iconBg: '#FFFBEB',
  },
];

export const NotificationSettingsScreen: React.FC<NotificationSettingsScreenProps> = ({ onBack }) => {
  const {
    settings,
    updateSetting: contextUpdateSetting,
    resetSettings: contextResetSettings,
  } = useNotifications();

  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const [osPermissionDenied, setOsPermissionDenied] = useState(false);

  const isAppEnabled = settings.appEnabled !== false;

  const checkOsPermission = useCallback(async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setOsPermissionDenied(status !== 'granted');
    } catch {
      // ignore on unsupported environments
    }
  }, []);

  useEffect(() => {
    checkOsPermission();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkOsPermission();
        registerForPushNotificationsAsync().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [checkOsPermission]);

  const handleRequestOrOpenOsSettings = useCallback(async () => {
    try {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== 'granted' && canAskAgain) {
        const res = await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
        });
        setOsPermissionDenied(res.status !== 'granted');
        if (res.status === 'granted') {
          registerForPushNotificationsAsync().catch(() => {});
          return;
        }
      }
    } catch {
      // ignore
    }
    Linking.openSettings().catch(() => {});
  }, []);

  const flashSavedFeedback = () => {
    setShowSavedFeedback(true);
    setTimeout(() => setShowSavedFeedback(false), 1800);
  };

  // Lưu cài đặt vào AsyncStorage; khóa mọi tùy chọn con nếu công tắc tổng appEnabled đang TẮT
  const updateSetting = async (key: keyof NotificationSettings, value: boolean) => {
    if (key !== 'appEnabled' && !isAppEnabled) {
      return;
    }

    if (key === 'vibration' && value) {
      try {
        Vibration.vibrate(80);
      } catch (_) {}
    }
    if (key === 'sound' && value && Platform.OS === 'web') {
      playNormalNotificationSound().catch(() => {});
    }

    await contextUpdateSetting(key, value);
    if (
      value &&
      ['appEnabled', 'alert', 'safeLocation', 'chat', 'systemNotification', 'news'].includes(key)
    ) {
      await checkOsPermission();
    }
    flashSavedFeedback();
  };

  const handleResetDefaults = () => {
    Alert.alert(
      'Khôi phục mặc định?',
      'Đặt lại toàn bộ tùy chọn thông báo về mặc định?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đặt lại',
          style: 'default',
          onPress: async () => {
            await contextResetSettings();
            flashSavedFeedback();
          },
        },
      ]
    );
  };

  const renderCategoryIcon = (item: CategoryRowConfig, active: boolean) => {
    const iconColor = active ? item.color : '#94A3B8';
    if (item.iconLibrary === 'mci') {
      return <MaterialCommunityIcons name={item.iconName as any} size={18} color={iconColor} />;
    }
    return <Feather name={item.iconName as any} size={18} color={iconColor} />;
  };

  const renderToggleSwitch = (
    key: keyof NotificationSettings,
    checked: boolean,
    disabled = false,
    testID?: string
  ) => (
    <Switch
      style={styles.switchControl}
      value={checked}
      disabled={disabled}
      onValueChange={(val) => updateSetting(key, val)}
      trackColor={{ false: '#CBD5E1', true: disabled ? '#E2E8F0' : MASTER_TRACK_ON }}
      thumbColor={disabled ? '#E2E8F0' : checked ? MASTER_BLUE : '#F1F5F9'}
      ios_backgroundColor="#CBD5E1"
      testID={testID}
    />
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          testID="btn-back-notification-settings"
        >
          <Feather name="arrow-left" size={22} color={PROFILE_THEME.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cài đặt thông báo</Text>
        <TouchableOpacity
          style={styles.headerRightBtn}
          onPress={handleResetDefaults}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="rotate-ccw" size={17} color="#64748B" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {osPermissionDenied && (
          <View style={styles.osPermBanner}>
            <Feather name="alert-circle" size={16} color="#B45309" />
            <Text style={styles.osPermText} numberOfLines={2}>
              Quyền thông báo trên máy đang tắt.
            </Text>
            <TouchableOpacity
              style={styles.osPermBtn}
              onPress={handleRequestOrOpenOsSettings}
              activeOpacity={0.8}
            >
              <Text style={styles.osPermBtnText}>Bật quyền</Text>
            </TouchableOpacity>
          </View>
        )}

        {showSavedFeedback && (
          <View style={styles.savedBanner}>
            <Feather name="check-circle" size={15} color="#059669" />
            <Text style={styles.savedBannerText}>Đã lưu cài đặt thông báo</Text>
          </View>
        )}

        {/* Section 1: Công tắc tổng Thông báo ứng dụng */}
        <Text style={styles.sectionHeader}>TỔNG QUAN</Text>
        <View style={[styles.cardGroup, !isAppEnabled && styles.masterCardMuted]}>
          <View style={styles.settingItem}>
            <View
              style={[
                styles.settingIconBox,
                { backgroundColor: isAppEnabled ? '#EFF6FF' : '#F1F5F9' },
              ]}
            >
              <Feather
                name={isAppEnabled ? 'bell' : 'bell-off'}
                size={18}
                color={isAppEnabled ? MASTER_BLUE : '#64748B'}
              />
            </View>
            <View style={styles.settingTextBox}>
              <View style={styles.settingTitleRow}>
                <Text style={styles.settingTitle}>Thông báo ứng dụng</Text>
                <View style={[styles.statusBadge, isAppEnabled ? styles.statusBadgeOn : styles.statusBadgeOff]}>
                  <Text style={[styles.statusBadgeText, isAppEnabled ? styles.statusBadgeTextOn : styles.statusBadgeTextOff]}>
                    {isAppEnabled ? 'Đang bật' : 'Đang tắt'}
                  </Text>
                </View>
              </View>
              <Text style={styles.settingDesc}>
                {isAppEnabled
                  ? 'Cho phép nhận và tùy chỉnh các loại thông báo'
                  : 'Bật công tắc này để bật/tắt các mục bên dưới'}
              </Text>
            </View>
            {renderToggleSwitch('appEnabled', isAppEnabled, false, 'switch-app-notifications')}
          </View>
        </View>

        {/* Section 2: Các thông báo con (chỉ mở khi appEnabled = true) */}
        <Text style={styles.sectionHeader}>LOẠI THÔNG BÁO</Text>
        <View style={styles.cardGroup}>
          {CATEGORY_ITEMS.map((item, idx) => {
            const checked = Boolean(settings[item.key]);
            return (
              <React.Fragment key={item.key}>
                {idx > 0 && <View style={styles.itemDivider} />}
                <View style={[styles.settingItem, !isAppEnabled && styles.settingItemDisabled]}>
                  <View
                    style={[
                      styles.settingIconBox,
                      { backgroundColor: isAppEnabled ? item.iconBg : '#F1F5F9' },
                    ]}
                  >
                    {renderCategoryIcon(item, isAppEnabled)}
                  </View>
                  <View style={styles.settingTextBox}>
                    <View style={styles.settingTitleRow}>
                      <Text style={styles.settingTitle}>{item.title}</Text>
                      {item.badge && (
                        <View style={styles.urgentBadge}>
                          <Text style={styles.urgentBadgeText}>{item.badge}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.settingDesc}>{item.desc}</Text>
                  </View>
                  {renderToggleSwitch(item.key, checked, !isAppEnabled)}
                </View>
              </React.Fragment>
            );
          })}
        </View>

        {/* Section 3: Âm thanh & Rung */}
        <Text style={styles.sectionHeader}>ÂM THANH & RUNG</Text>
        <View style={styles.cardGroup}>
          <View style={[styles.settingItem, !isAppEnabled && styles.settingItemDisabled]}>
            <View
              style={[
                styles.settingIconBox,
                { backgroundColor: isAppEnabled && settings.sound ? '#EFF6FF' : '#F1F5F9' },
              ]}
            >
              <Feather
                name="volume-2"
                size={18}
                color={isAppEnabled && settings.sound ? MASTER_BLUE : '#94A3B8'}
              />
            </View>
            <View style={styles.settingTextBox}>
              <Text style={styles.settingTitle}>Âm thanh thông báo</Text>
              <Text style={styles.settingDesc}>Nhạc chuông mặc định của thiết bị</Text>
            </View>
            {renderToggleSwitch('sound', settings.sound, !isAppEnabled)}
          </View>

          <View style={styles.itemDivider} />

          <View style={[styles.settingItem, !isAppEnabled && styles.settingItemDisabled]}>
            <View
              style={[
                styles.settingIconBox,
                { backgroundColor: isAppEnabled && settings.vibration ? '#EFF6FF' : '#F1F5F9' },
              ]}
            >
              <Feather
                name="smartphone"
                size={18}
                color={isAppEnabled && settings.vibration ? MASTER_BLUE : '#94A3B8'}
              />
            </View>
            <View style={styles.settingTextBox}>
              <Text style={styles.settingTitle}>Rung thiết bị</Text>
              <Text style={styles.settingDesc}>Rung nhẹ khi có thông báo mới</Text>
            </View>
            {renderToggleSwitch('vibration', settings.vibration, !isAppEnabled)}
          </View>
        </View>

        <TouchableOpacity
          style={styles.resetDefaultsButton}
          onPress={handleResetDefaults}
          activeOpacity={0.7}
        >
          <Feather name="refresh-cw" size={14} color="#64748B" />
          <Text style={styles.resetDefaultsButtonText}>Khôi phục mặc định</Text>
        </TouchableOpacity>
      </ScrollView>
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PROFILE_THEME.colors.textPrimary,
  },
  headerRightBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: PROFILE_THEME.colors.background,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 92,
  },
  osPermBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  osPermText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },
  osPermBtn: {
    backgroundColor: '#D97706',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexShrink: 0,
  },
  osPermBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  savedBannerText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#059669',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginLeft: 4,
  },
  cardGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: PROFILE_THEME.radius.card,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    overflow: 'hidden',
  },
  masterCardMuted: {
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
  },
  settingItemDisabled: {
    opacity: 0.45,
  },
  settingIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingTextBox: {
    flex: 1,
    paddingRight: 6,
  },
  settingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 2,
  },
  settingTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  switchControl: {
    flexShrink: 0,
  },
  settingDesc: {
    fontSize: 11.5,
    lineHeight: 15,
    color: '#64748B',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  statusBadgeOn: {
    backgroundColor: '#DBEAFE',
  },
  statusBadgeOff: {
    backgroundColor: '#E2E8F0',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusBadgeTextOn: {
    color: MASTER_BLUE,
  },
  statusBadgeTextOff: {
    color: '#475569',
  },
  urgentBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  urgentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
  },
  itemDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 60,
  },
  resetDefaultsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  resetDefaultsButtonText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
});

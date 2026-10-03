import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Switch,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROFILE_THEME } from './theme';

export interface NotificationSettings {
  alert: boolean; // Cảnh báo khẩn cấp (SOS Alert)
  safeLocation: boolean; // Vị trí an toàn (Safe location)
  systemNotification: boolean; // Thông báo hệ thống (Notification)
  news: boolean; // Tin tức & cảnh báo thời tiết (Tin tức)
  sound: boolean; // Âm thanh thông báo
  vibration: boolean; // Rung thiết bị
}

const STORAGE_KEY = '@sos_notification_settings';

const DEFAULT_SETTINGS: NotificationSettings = {
  alert: true,
  safeLocation: true,
  systemNotification: true,
  news: true,
  sound: true,
  vibration: true,
};

interface NotificationSettingsScreenProps {
  onBack: () => void;
}

export const NotificationSettingsScreen: React.FC<NotificationSettingsScreenProps> = ({ onBack }) => {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);

  // Tải cài đặt từ AsyncStorage khi mở màn hình
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
        }
      } catch (err) {
        console.warn('Lỗi khi tải cài đặt thông báo:', err);
      }
    };

    loadSettings();
  }, []);

  // Lưu cài đặt và hiển thị phản hồi nhẹ
  const updateSetting = async (key: keyof NotificationSettings, value: boolean) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setShowSavedFeedback(true);
      setTimeout(() => setShowSavedFeedback(false), 2500);
    } catch (err) {
      console.warn('Lỗi khi lưu cài đặt thông báo:', err);
    }
  };

  // Khôi phục cài đặt mặc định
  const handleResetDefaults = () => {
    Alert.alert(
      'Khôi phục mặc định?',
      'Bạn có muốn đặt lại toàn bộ tùy chọn thông báo về trạng thái an toàn khuyến nghị?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đặt lại',
          style: 'default',
          onPress: async () => {
            setSettings(DEFAULT_SETTINGS);
            try {
              await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
              setShowSavedFeedback(true);
              setTimeout(() => setShowSavedFeedback(false), 2500);
            } catch (err) {
              console.warn('Lỗi khi lưu cài đặt thông báo:', err);
            }
          },
        },
      ]
    );
  };

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
          <Feather name="arrow-left" size={24} color={PROFILE_THEME.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cài đặt thông báo</Text>
        <TouchableOpacity
          style={styles.headerRightBtn}
          onPress={handleResetDefaults}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="rotate-ccw" size={18} color="#64748B" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner giới thiệu */}
        <View style={styles.bannerCard}>
          <View style={styles.bannerIconBox}>
            <Feather name="bell" size={22} color="#D97706" />
          </View>
          <View style={styles.bannerTextBox}>
            <Text style={styles.bannerTitle}>Tùy chỉnh nhận thông báo</Text>
            <Text style={styles.bannerDesc}>
              Quản lý các loại thông báo và cảnh báo khẩn cấp từ RescueSOS để đảm bảo bạn luôn nhận
              được sự hỗ trợ kịp thời nhất.
            </Text>
          </View>
        </View>

        {/* Thông báo đã lưu cài đặt */}
        {showSavedFeedback && (
          <View style={styles.savedBanner}>
            <Feather name="check-circle" size={16} color="#059669" />
            <Text style={styles.savedBannerText}>Đã cập nhật tùy chọn thông báo</Text>
          </View>
        )}

        {/* Section 1: 4 Tùy chọn thông báo chính */}
        <Text style={styles.sectionHeader}>CÁC LOẠI THÔNG BÁO</Text>
        <View style={styles.cardGroup}>
          {/* 1. Alert (Cảnh báo khẩn cấp) */}
          <View style={styles.settingItem}>
            <View style={[styles.settingIconBox, { backgroundColor: '#EFF6FF' }]}>
              <Feather name="alert-triangle" size={20} color="#0066FF" />
            </View>
            <View style={styles.settingTextBox}>
              <View style={styles.settingTitleRow}>
                <Text style={styles.settingTitle}>Cảnh báo khẩn cấp</Text>
                <View style={styles.urgentBadge}>
                  <Text style={styles.urgentBadgeText}>Ưu tiên cao</Text>
                </View>
              </View>
              <Text style={styles.settingDesc}>
                Nhận tín hiệu báo động SOS từ người xung quanh, cảnh báo nguy cơ lũ quét, vỡ đê, sạt
                lở đất đặc biệt nguy hiểm.
              </Text>
            </View>
            <Switch
              value={settings.alert}
              onValueChange={(val) => updateSetting('alert', val)}
              trackColor={{ false: '#CBD5E1', true: '#BFDBFE' }}
              thumbColor={settings.alert ? '#0066FF' : '#F1F5F9'}
              ios_backgroundColor="#CBD5E1"
            />
          </View>

          <View style={styles.itemDivider} />

          {/* 2. Safe Location (Vị trí an toàn) */}
          <View style={styles.settingItem}>
            <View style={[styles.settingIconBox, { backgroundColor: '#ECFDF5' }]}>
              <MaterialCommunityIcons name="shield-home" size={20} color="#10B981" />
            </View>
            <View style={styles.settingTextBox}>
              <View style={styles.settingTitleRow}>
                <Text style={styles.settingTitle}>Vị trí an toàn</Text>
                <View style={styles.recBadge}>
                  <Text style={styles.recBadgeText}>Khuyến nghị</Text>
                </View>
              </View>
              <Text style={styles.settingDesc}>
                Thông báo gợi ý trạm y tế dã chiến, khu vực sơ tán cao ráo và các điểm tập kết an
                toàn gần bạn khi đi vào vùng ngập sâu.
              </Text>
            </View>
            <Switch
              value={settings.safeLocation}
              onValueChange={(val) => updateSetting('safeLocation', val)}
              trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
              thumbColor={settings.safeLocation ? '#10B981' : '#F1F5F9'}
              ios_backgroundColor="#CBD5E1"
            />
          </View>

          <View style={styles.itemDivider} />

          {/* 3. Notification (Thông báo hệ thống) */}
          <View style={styles.settingItem}>
            <View style={[styles.settingIconBox, { backgroundColor: '#F0F9FF' }]}>
              <Feather name="bell" size={20} color="#0284C7" />
            </View>
            <View style={styles.settingTextBox}>
              <Text style={styles.settingTitle}>Thông báo hệ thống</Text>
              <Text style={styles.settingDesc}>
                Cập nhật tiến độ xử lý yêu cầu cứu nạn, kết quả điều phối đội cứu hộ, phản hồi từ
                tổng đài và thông tin tài khoản.
              </Text>
            </View>
            <Switch
              value={settings.systemNotification}
              onValueChange={(val) => updateSetting('systemNotification', val)}
              trackColor={{ false: '#CBD5E1', true: '#BAE6FD' }}
              thumbColor={settings.systemNotification ? '#0284C7' : '#F1F5F9'}
              ios_backgroundColor="#CBD5E1"
            />
          </View>

          <View style={styles.itemDivider} />

          {/* 4. Tin tức (Bản tin thiên tai & thời tiết) */}
          <View style={styles.settingItem}>
            <View style={[styles.settingIconBox, { backgroundColor: '#F5F3FF' }]}>
              <Feather name="file-text" size={20} color="#7C3AED" />
            </View>
            <View style={styles.settingTextBox}>
              <Text style={styles.settingTitle}>Tin tức & Thời tiết</Text>
              <Text style={styles.settingDesc}>
                Dự báo thời tiết thủy văn, lượng mưa lớn, cảnh báo lũ lụt hàng ngày và cẩm nang kỹ
                năng sinh tồn, ứng phó bão lũ.
              </Text>
            </View>
            <Switch
              value={settings.news}
              onValueChange={(val) => updateSetting('news', val)}
              trackColor={{ false: '#CBD5E1', true: '#DDD6FE' }}
              thumbColor={settings.news ? '#7C3AED' : '#F1F5F9'}
              ios_backgroundColor="#CBD5E1"
            />
          </View>
        </View>

        {/* Section 2: Tùy chọn âm thanh & rung */}
        <Text style={styles.sectionHeader}>PHẢN HỒI THIẾT BỊ</Text>
        <View style={styles.cardGroup}>
          {/* Âm thanh */}
          <View style={styles.settingItem}>
            <View style={[styles.settingIconBox, { backgroundColor: '#F8FAFC' }]}>
              <Feather name="volume-2" size={20} color="#475569" />
            </View>
            <View style={styles.settingTextBox}>
              <Text style={styles.settingTitle}>Âm thanh chuông báo</Text>
              <Text style={styles.settingDesc}>
                Phát âm thanh chuông khi có thông báo mới (Cảnh báo SOS vẫn phát khi máy im lặng).
              </Text>
            </View>
            <Switch
              value={settings.sound}
              onValueChange={(val) => updateSetting('sound', val)}
              trackColor={{ false: '#CBD5E1', true: '#94A3B8' }}
              thumbColor={settings.sound ? '#334155' : '#F1F5F9'}
              ios_backgroundColor="#CBD5E1"
            />
          </View>

          <View style={styles.itemDivider} />

          {/* Rung */}
          <View style={styles.settingItem}>
            <View style={[styles.settingIconBox, { backgroundColor: '#F8FAFC' }]}>
              <Feather name="smartphone" size={20} color="#475569" />
            </View>
            <View style={styles.settingTextBox}>
              <Text style={styles.settingTitle}>Rung thiết bị</Text>
              <Text style={styles.settingDesc}>
                Rung khi nhận được cảnh báo cứu nạn hoặc thông báo hệ thống.
              </Text>
            </View>
            <Switch
              value={settings.vibration}
              onValueChange={(val) => updateSetting('vibration', val)}
              trackColor={{ false: '#CBD5E1', true: '#94A3B8' }}
              thumbColor={settings.vibration ? '#334155' : '#F1F5F9'}
              ios_backgroundColor="#CBD5E1"
            />
          </View>
        </View>

        {/* Thẻ lưu ý an toàn */}
        <View style={styles.safetyNoticeBox}>
          <Feather name="info" size={16} color="#64748B" style={{ marginTop: 2 }} />
          <Text style={styles.safetyNoticeText}>
            Lưu ý: Để nhận được thông báo cứu hộ kịp thời trong mọi điều kiện mất sóng hoặc màn hình
            khóa, vui lòng đảm bảo ứng dụng RescueSOS được cấp quyền Thông báo trong Cài đặt hệ thống
            của thiết bị.
          </Text>
        </View>

        {/* Nút đặt lại */}
        <TouchableOpacity
          style={styles.resetDefaultsButton}
          onPress={handleResetDefaults}
          activeOpacity={0.7}
        >
          <Feather name="refresh-cw" size={15} color="#64748B" />
          <Text style={styles.resetDefaultsButtonText}>Khôi phục cài đặt mặc định</Text>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerRightBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    padding: 16,
    paddingBottom: 40,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderRadius: PROFILE_THEME.radius.card,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 16,
    gap: 12,
  },
  bannerIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerTextBox: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  bannerDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#B45309',
  },
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  savedBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#059669',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 4,
  },
  cardGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: PROFILE_THEME.radius.card,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  settingIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingTextBox: {
    flex: 1,
  },
  settingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  settingTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  settingDesc: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748B',
  },
  urgentBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  urgentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0066FF',
  },
  recBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  itemDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 66,
  },
  safetyNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    gap: 10,
  },
  safetyNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#64748B',
  },
  resetDefaultsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  resetDefaultsButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
});

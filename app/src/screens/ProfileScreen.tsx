import React, { useState, useEffect } from 'react';
import { View, StyleSheet, BackHandler } from 'react-native';
import { ProfileOverviewScreen } from './profile/ProfileOverviewScreen';
import { EditProfileScreen } from './profile/EditProfileScreen';
import { EmergencyContactScreen } from './profile/EmergencyContactScreen';
import { ProfessionalProfileScreen } from './profile/ProfessionalProfileScreen';
import { AccountSecurityScreen } from './profile/AccountSecurityScreen';
import { NotificationSettingsScreen } from './profile/NotificationSettingsScreen';
import { NotificationsScreen } from './profile/NotificationsScreen';
import { backendApi } from '../services/backendApi';

export type ProfileSubScreen =
  | 'overview'
  | 'edit_profile'
  | 'emergency_contact'
  | 'professional_profile'
  | 'security'
  | 'notification_settings'
  | 'notifications';

interface ProfileScreenProps {
  initialScreen?: ProfileSubScreen;
  onNavigateToTab?: (tab: string) => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  initialScreen = 'overview',
  onNavigateToTab,
}) => {
  const [currentScreen, setCurrentScreen] = useState<ProfileSubScreen>(initialScreen);
  const [unreadCount, setUnreadCount] = useState<number>(3);

  // Tự động đồng bộ khi initialScreen từ bên ngoài thay đổi (ví dụ: chuyển tab)
  useEffect(() => {
    if (initialScreen) {
      setCurrentScreen(initialScreen);
    }
  }, [initialScreen]);

  // Tải số lượng thông báo chưa đọc
  useEffect(() => {
    const fetchData = async () => {
      try {
        const notifRes = await backendApi.getNotifications();
        if (notifRes.success && Array.isArray(notifRes.data)) {
          const unread = notifRes.data.filter((n) => !n.isRead).length;
          setUnreadCount(unread > 0 ? unread : 3);
        }
      } catch {
        // Fallback giữ nguyên 3 thông báo mẫu
      }
    };

    fetchData();
  }, [currentScreen]);

  // Xử lý nút Back phần cứng của Android
  useEffect(() => {
    const onBackPress = () => {
      if (currentScreen !== 'overview') {
        setCurrentScreen('overview');
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [currentScreen]);

  // Điều hướng màn hình
  const handleBackToOverview = () => {
    setCurrentScreen('overview');
  };

  return (
    <View style={styles.container}>
      {/* Giữ ProfileOverviewScreen luôn trong bộ nhớ để logo và thông tin không bị load lại */}
      <View
        style={[
          styles.screenWrapper,
          currentScreen !== 'overview' && styles.hiddenScreen,
        ]}
      >
        <ProfileOverviewScreen
          onNavigateToEditProfile={() => setCurrentScreen('edit_profile')}
          onNavigateToEmergencyContact={() => setCurrentScreen('emergency_contact')}
          onNavigateToProfessional={() => setCurrentScreen('professional_profile')}
          onNavigateToSecurity={() => setCurrentScreen('security')}
          onNavigateToNotificationSettings={() => setCurrentScreen('notification_settings')}
          onNavigateToNotifications={() => setCurrentScreen('notifications')}
          unreadNotificationsCount={unreadCount}
        />
      </View>

      {currentScreen === 'edit_profile' && (
        <EditProfileScreen onBack={handleBackToOverview} />
      )}

      {currentScreen === 'emergency_contact' && (
        <EmergencyContactScreen onBack={handleBackToOverview} />
      )}

      {currentScreen === 'professional_profile' && (
        <ProfessionalProfileScreen onBack={handleBackToOverview} />
      )}

      {currentScreen === 'security' && (
        <AccountSecurityScreen onBack={handleBackToOverview} />
      )}

      {currentScreen === 'notification_settings' && (
        <NotificationSettingsScreen onBack={handleBackToOverview} />
      )}

      {currentScreen === 'notifications' && (
        <NotificationsScreen
          onBack={handleBackToOverview}
          onNavigateToTab={onNavigateToTab}
          onNavigateToProfile={handleBackToOverview}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },
  screenWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  hiddenScreen: {
    display: 'none',
  },
});

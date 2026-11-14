import React, { useState, useEffect } from 'react';
import { View, StyleSheet, BackHandler } from 'react-native';
import { ProfileOverviewScreen } from './ProfileOverviewScreen';
import { EditProfileScreen } from './EditProfileScreen';
import { EmergencyContactScreen } from './EmergencyContactScreen';
import { SosHistoryScreen } from './SosHistoryScreen';
import { ProfessionalProfileScreen } from './ProfessionalProfileScreen';
import { AccountSecurityScreen } from './AccountSecurityScreen';
import { NotificationSettingsScreen } from './NotificationSettingsScreen';
import { NotificationsScreen } from './NotificationsScreen';
import { useNotifications } from '@/context/NotificationContext';

export type ProfileSubScreen =
  | 'overview'
  | 'edit_profile'
  | 'emergency_contact'
  | 'sos_history'
  | 'professional_profile'
  | 'security'
  | 'notification_settings'
  | 'notifications';

interface ProfileScreenProps {
  initialScreen?: ProfileSubScreen;
  onNavigateToTab?: (tab: string) => void;
  onOpenNotifications?: () => void;
  isActive?: boolean;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  initialScreen = 'overview',
  onNavigateToTab,
  onOpenNotifications,
  isActive = true,
}) => {
  const [currentScreen, setCurrentScreen] = useState<ProfileSubScreen>(initialScreen);
  const { unreadCount } = useNotifications();

  // Tự động đồng bộ khi initialScreen từ bên ngoài thay đổi (ví dụ: chuyển tab)
  useEffect(() => {
    if (initialScreen) {
      setCurrentScreen(initialScreen);
    }
  }, [initialScreen]);

  // Xử lý nút Back phần cứng của Android
  useEffect(() => {
    if (!isActive) return;
    const onBackPress = () => {
      if (currentScreen !== 'overview') {
        setCurrentScreen('overview');
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [currentScreen, isActive]);

  const [overviewRefreshKey, setOverviewRefreshKey] = useState<number>(0);

  // Điều hướng màn hình
  const handleBackToOverview = () => {
    setCurrentScreen('overview');
    setOverviewRefreshKey((prev) => prev + 1);
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
          onNavigateToSosHistory={() => setCurrentScreen('sos_history')}
          onNavigateToSecurity={() => setCurrentScreen('security')}
          onNavigateToNotificationSettings={() => setCurrentScreen('notification_settings')}
          onNavigateToNotifications={() => {
            if (onOpenNotifications) {
              onOpenNotifications();
            } else {
              setCurrentScreen('notifications');
            }
          }}
          unreadNotificationsCount={unreadCount}
          refreshTrigger={overviewRefreshKey}
        />
      </View>

      {currentScreen === 'edit_profile' && (
        <EditProfileScreen onBack={handleBackToOverview} />
      )}

      {currentScreen === 'emergency_contact' && (
        <EmergencyContactScreen onBack={handleBackToOverview} />
      )}

      {currentScreen === 'sos_history' && (
        <SosHistoryScreen
          onBack={handleBackToOverview}
          onNavigateToSos={() => onNavigateToTab?.('sos')}
        />
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

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { CitizenProfileOverviewScreen } from './CitizenProfileOverviewScreen';
import { RescuerProfileOverviewScreen } from './RescuerProfileOverviewScreen';

export interface ProfileOverviewScreenProps {
  onNavigateToEditProfile: () => void;
  onNavigateToEmergencyContact: () => void;
  onNavigateToProfessional: () => void;
  onNavigateToSosHistory: () => void;
  onNavigateToSecurity: () => void;
  onNavigateToNotificationSettings: () => void;
  onNavigateToNotifications: () => void;
  unreadNotificationsCount?: number;
  refreshTrigger?: number;
}

export const ProfileOverviewScreen: React.FC<ProfileOverviewScreenProps> = ({
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
  const { user } = useAuth();

  // Xác định chính xác vai trò tài khoản dựa trên roles trong database
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const isRescuer = roles.includes('RESCUER') || roles.includes('LEADER');

  // Đăng nhập tài khoản nào sẽ vào đúng 100% trang hồ sơ của vai trò đó
  if (isRescuer) {
    return (
      <RescuerProfileOverviewScreen
        onNavigateToEditProfile={onNavigateToEditProfile}
        onNavigateToProfessional={onNavigateToProfessional}
        onNavigateToSosHistory={onNavigateToSosHistory}
        onNavigateToSecurity={onNavigateToSecurity}
        onNavigateToNotificationSettings={onNavigateToNotificationSettings}
        onNavigateToNotifications={onNavigateToNotifications}
        unreadNotificationsCount={unreadNotificationsCount}
        refreshTrigger={refreshTrigger}
      />
    );
  }

  return (
    <CitizenProfileOverviewScreen
      onNavigateToEditProfile={onNavigateToEditProfile}
      onNavigateToEmergencyContact={onNavigateToEmergencyContact}
      onNavigateToProfessional={onNavigateToProfessional}
      onNavigateToSosHistory={onNavigateToSosHistory}
      onNavigateToSecurity={onNavigateToSecurity}
      onNavigateToNotificationSettings={onNavigateToNotificationSettings}
      onNavigateToNotifications={onNavigateToNotifications}
      unreadNotificationsCount={unreadNotificationsCount}
      refreshTrigger={refreshTrigger}
    />
  );
};

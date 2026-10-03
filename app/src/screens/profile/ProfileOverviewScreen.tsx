import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { CitizenProfileOverviewScreen } from './CitizenProfileOverviewScreen';
import { RescuerProfileOverviewScreen } from './RescuerProfileOverviewScreen';

export interface ProfileOverviewScreenProps {
  onNavigateToEditProfile: () => void;
  onNavigateToEmergencyContact: () => void;
  onNavigateToProfessional: () => void;
  onNavigateToSecurity: () => void;
  onNavigateToNotifications: () => void;
  unreadNotificationsCount?: number;
}

export const ProfileOverviewScreen: React.FC<ProfileOverviewScreenProps> = ({
  onNavigateToEditProfile,
  onNavigateToEmergencyContact,
  onNavigateToProfessional,
  onNavigateToSecurity,
  onNavigateToNotifications,
  unreadNotificationsCount = 3,
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
        onNavigateToSecurity={onNavigateToSecurity}
        onNavigateToNotifications={onNavigateToNotifications}
        unreadNotificationsCount={unreadNotificationsCount}
      />
    );
  }

  return (
    <CitizenProfileOverviewScreen
      onNavigateToEditProfile={onNavigateToEditProfile}
      onNavigateToEmergencyContact={onNavigateToEmergencyContact}
      onNavigateToSecurity={onNavigateToSecurity}
      onNavigateToNotifications={onNavigateToNotifications}
      unreadNotificationsCount={unreadNotificationsCount}
    />
  );
};

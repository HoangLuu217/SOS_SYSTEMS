import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  ImageBackground,
  Keyboard,
  LogBox,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { LoginScreen, SignupScreen, ForgotPasswordModal } from '@/features/auth';
import { HomeScreen, ConfigModal } from '@/features/home';
import { MapScreen } from '@/features/map';
import { SosScreen } from '@/features/sos';
import { NewsScreen } from '@/features/news';
import { ProfileScreen, MandatoryOnboardingModal } from '@/features/profile';
import { RescuerMissionScreen } from '@/features/mission';
import { backendApi } from '@/api';
import { AlertModal, BottomNav, LogoSOS, InAppNotificationBanner } from '@/components';
import { MapFilterType, TabName } from '@/types';
import { BACKGROUND_APP_SOURCE } from '@/constants/backgroundBase64';

// Bỏ qua cảnh báo kết nối qua tunnel trên điện thoại
LogBox.ignoreLogs([
  'Cannot connect to Expo CLI',
  'Setting a timer for a long period of time',
]);

/**
 * Lớp giao diện chính khi người dùng đã đăng nhập (Tab Navigation Layer)
 */
export function AuthenticatedApp() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabName>('home');
  const [configVisible, setConfigVisible] = useState(false);
  const [mapFilter, setMapFilter] = useState<MapFilterType>('ALL');
  const [mapNavKey, setMapNavKey] = useState(0);
  const [activeMissionsCount, setActiveMissionsCount] = useState<number>(0);

  // Xác định người dùng có phải là Cứu hộ viên chính thức
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const isRescuer =
    roles.includes('LEADER') ||
    (roles.includes('RESCUER') && user?.rescuer?.verificationStatus !== 'PENDING');

  const { unreadCount, setNavigateHandler } = useNotifications();

  // Tải số lượng nhiệm vụ đang xử lý cho Cứu hộ viên
  React.useEffect(() => {
    if (!isRescuer) return;
    const loadMissionsCount = async () => {
      try {
        const res = await backendApi.getMyAssignments();
        if (res.success && Array.isArray(res.data)) {
          const active = res.data.filter(
            (m) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(m.status)
          ).length;
          setActiveMissionsCount(active);
        }
      } catch {
        // ignore
      }
    };
    loadMissionsCount();
  }, [isRescuer]);

  const handleNavigateToTab = React.useCallback((tab: TabName, options?: { filter?: MapFilterType; areaId?: string }) => {
    setActiveTab(tab);
    if (tab === 'map') {
      if (options?.filter) {
        setMapFilter(options.filter);
      }
      setMapNavKey(prev => prev + 1);
    }
  }, []);

  React.useEffect(() => {
    setNavigateHandler((tab) => handleNavigateToTab(tab as TabName));
  }, [setNavigateHandler, handleNavigateToTab]);

  return (
    <View style={styles.container}>
      {/* Banner thông báo khẩn cấp nổi góc trên (Heads-up alert banner) */}
      <InAppNotificationBanner onNavigateToNews={() => handleNavigateToTab('news')} />

      {/* Các màn hình Tab luôn được giữ trong bộ nhớ (Pre-warmed Tab Layer) */}
      <View style={styles.screenContainer}>
        {/* Tab Trang chủ */}
        <View style={[styles.tabScreenWrap, activeTab !== 'home' && styles.hiddenTabScreen]}>
          <HomeScreen
            onOpenSettings={() => setConfigVisible(true)}
            onNavigateToTab={handleNavigateToTab}
            onNavigateToSos={() => setActiveTab('sos')}
          />
        </View>

        {/* Tab Bản đồ */}
        <View style={[styles.tabScreenWrap, activeTab !== 'map' && styles.hiddenTabScreen]}>
          <MapScreen
            initialFilter={mapFilter}
            navigationKey={mapNavKey}
            onFilterChange={setMapFilter}
          />
        </View>

        {/* Tab Cứu hộ SOS (cho Người dân) hoặc Nhiệm vụ Tác chiến (cho Cứu hộ viên) */}
        <View style={[styles.tabScreenWrap, activeTab !== 'sos' && styles.hiddenTabScreen]}>
          {isRescuer ? (
            <RescuerMissionScreen
              onNavigateToTab={handleNavigateToTab}
              onNavigateToHome={() => setActiveTab('home')}
              onMissionsCountChange={setActiveMissionsCount}
            />
          ) : (
            <SosScreen onNavigateToHome={() => setActiveTab('home')} />
          )}
        </View>

        {/* Tab Tin tức & Thông báo */}
        <View style={[styles.tabScreenWrap, activeTab !== 'news' && styles.hiddenTabScreen]}>
          <NewsScreen
            onNavigateToTab={(tab) => handleNavigateToTab(tab as TabName)}
            onOpenSettings={() => setActiveTab('profile')}
          />
        </View>

        {/* Tab Hồ sơ người dùng */}
        <View style={[styles.tabScreenWrap, activeTab !== 'profile' && styles.hiddenTabScreen]}>
          <ProfileScreen
            onNavigateToTab={(tab) => setActiveTab(tab as TabName)}
          />
        </View>
      </View>

      <View style={styles.bottomNavWrapper}>
        <BottomNav
          activeTab={activeTab}
          onTabPress={setActiveTab}
          unreadNewsCount={unreadCount}
          isRescuer={isRescuer}
          activeMissionsCount={activeMissionsCount}
        />
      </View>

      <ConfigModal
        visible={configVisible}
        onClose={() => setConfigVisible(false)}
      />
    </View>
  );
}

/**
 * Điều hướng chính toàn ứng dụng: Phân quyền giữa Auth Stack và Authenticated App
 */
export function AppNavigator() {
  const { user, isInitializing } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<'login' | 'signup'>('login');
  const [forgotPasswordVisible, setForgotPasswordVisible] = useState(false);
  const [configVisible, setConfigVisible] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  // Tự động chuyển về màn hình đăng nhập khi đăng xuất
  React.useEffect(() => {
    if (!user) {
      setCurrentScreen('login');
    }
  }, [user]);

  if (isInitializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066FF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />

      {/* Lớp Authentication: Giữ trong bộ nhớ (pre-warmed), nền và logo không bị unmount */}
      <View
        style={[
          styles.authContainer,
          user ? styles.hiddenAuthContainer : styles.visibleAuthContainer,
        ]}
        pointerEvents={user ? 'none' : 'auto'}
      >
        <ImageBackground
          source={BACKGROUND_APP_SOURCE}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          fadeDuration={0}
        />

        {/* Màn hình Đăng nhập */}
        <View
          style={[
            styles.authScreenWrap,
            currentScreen === 'login' ? styles.visibleAuthLayer : styles.hiddenAuthLayer,
          ]}
          pointerEvents={currentScreen === 'login' ? 'auto' : 'none'}
        >
          <LoginScreen
            onNavigateToSignup={() => {
              Keyboard.dismiss();
              setCurrentScreen('signup');
            }}
            onNavigateToForgotPassword={() => setForgotPasswordVisible(true)}
            onOpenSettings={() => setConfigVisible(true)}
          />
        </View>

        {/* Màn hình Đăng ký */}
        <View
          style={[
            styles.authScreenWrap,
            currentScreen === 'signup' ? styles.visibleAuthLayer : styles.hiddenAuthLayer,
          ]}
          pointerEvents={currentScreen === 'signup' ? 'auto' : 'none'}
        >
          <SignupScreen
            onNavigateToLogin={() => {
              Keyboard.dismiss();
              setCurrentScreen('login');
            }}
            onOpenSettings={() => setConfigVisible(true)}
          />
        </View>
      </View>

      {/* Lớp Ứng dụng đã đăng nhập */}
      {user && (
        <View style={styles.authenticatedAppLayer}>
          <AuthenticatedApp />
          <MandatoryOnboardingModal />
        </View>
      )}

      {/* Pre-warm logoSOS ngay từ gốc app */}
      <View style={styles.prewarmLayer} pointerEvents="none">
        <LogoSOS style={styles.prewarmImage} />
      </View>

      {/* Modal Quên mật khẩu */}
      <ForgotPasswordModal
        visible={forgotPasswordVisible}
        onClose={() => setForgotPasswordVisible(false)}
        onSuccess={msg => {
          setToast({
            visible: true,
            type: 'success',
            title: 'Khôi phục mật khẩu',
            message: msg,
          });
        }}
      />

      {/* Modal Cấu hình IP Backend & Supabase */}
      <ConfigModal
        visible={configVisible}
        onClose={() => setConfigVisible(false)}
      />

      {/* Toast thông báo chung */}
      <AlertModal
        visible={toast.visible}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onClose={() => setToast(prev => ({ ...prev, visible: false }))}
      />

      {/* Banner thông báo khẩn cấp khi người dùng chưa đăng nhập */}
      {!user && <InAppNotificationBanner onNavigateToNews={() => {}} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  screenContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  authContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0F172A',
  },
  authenticatedAppLayer: {
    ...StyleSheet.absoluteFill,
  },
  authScreenWrap: {
    ...StyleSheet.absoluteFill,
  },
  visibleAuthLayer: {
    opacity: 1,
    zIndex: 2,
  },
  hiddenAuthLayer: {
    opacity: 0,
    zIndex: 1,
  },
  visibleAuthContainer: {
    opacity: 1,
    zIndex: 2,
  },
  hiddenAuthContainer: {
    opacity: 0,
    zIndex: 0,
  },
  tabScreenWrap: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  hiddenTabScreen: {
    display: 'none',
  },
  bottomNavWrapper: {
    zIndex: 100,
    elevation: 20,
  },
  prewarmLayer: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.001,
    zIndex: -9999,
  },
  prewarmImage: {
    width: 1,
    height: 1,
  },
});

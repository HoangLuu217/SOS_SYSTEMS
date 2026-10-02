import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { SignupScreen } from './src/screens/SignupScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { MapScreen } from './src/screens/MapScreen';
import { SosScreen } from './src/screens/SosScreen';
import { NewsScreen } from './src/screens/NewsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ForgotPasswordModal } from './src/screens/ForgotPasswordModal';
import { ConfigModal } from './src/screens/ConfigModal';
import { AlertModal } from './src/components/AlertModal';
import { BottomNav, TabName } from './src/components/BottomNav';

function AuthenticatedApp() {
  const [activeTab, setActiveTab] = useState<TabName>('home');
  const [configVisible, setConfigVisible] = useState(false);

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':
        return <HomeScreen onOpenSettings={() => setConfigVisible(true)} />;
      case 'map':
        return <MapScreen />;
      case 'sos':
        return <SosScreen />;
      case 'news':
        return <NewsScreen />;
      case 'profile':
        return <ProfileScreen />;
      default:
        return <HomeScreen onOpenSettings={() => setConfigVisible(true)} />;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.screenContainer}>
        {renderScreen()}
      </View>
      <BottomNav activeTab={activeTab} onTabPress={setActiveTab} />

      <ConfigModal
        visible={configVisible}
        onClose={() => setConfigVisible(false)}
      />
    </View>
  );
}

function MainNavigator() {
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

      {user ? (
        <AuthenticatedApp />
      ) : currentScreen === 'login' ? (
        <LoginScreen
          onNavigateToSignup={() => setCurrentScreen('signup')}
          onNavigateToForgotPassword={() => setForgotPasswordVisible(true)}
          onOpenSettings={() => setConfigVisible(true)}
        />
      ) : (
        <SignupScreen
          onNavigateToLogin={() => setCurrentScreen('login')}
          onOpenSettings={() => setConfigVisible(true)}
        />
      )}

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
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <MainNavigator />
      </AuthProvider>
    </SafeAreaProvider>
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
});

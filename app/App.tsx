import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { AuthProvider } from '@/context/AuthContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { AppNavigator } from '@/navigation';

WebBrowser.maybeCompleteAuthSession();


/**
 * Điểm khởi chạy gốc của ứng dụng di động SOS SYSTEMS
 * Cung cấp các Global Context Providers và khởi động AppNavigator
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationProvider>
          <AppNavigator />
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

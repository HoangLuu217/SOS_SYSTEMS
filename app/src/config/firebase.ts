import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, Auth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const firebaseConfig = {
  apiKey: "AIzaSyDa2PYcfXGjj8tm6NQO1LIR9sMnoLX-IFY",
  authDomain: "rescuesos-8f204.firebaseapp.com",
  projectId: "rescuesos-8f204",
  storageBucket: "rescuesos-8f204.firebasestorage.app",
  messagingSenderId: "21470436300",
  appId: "1:21470436300:web:bcee6041bbdf98c3c09b69",
  measurementId: "G-6BYFH1N462",
};

// Khởi tạo Firebase App (tránh khởi tạo lại khi Fast Refresh trong Expo)
export const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Khởi tạo Firebase Auth với AsyncStorage để lưu trạng thái đăng nhập
let authInstance: Auth;
try {
  // getReactNativePersistence được Metro phân giải cho nền tảng React Native
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { getReactNativePersistence } = require('firebase/auth') as any;
  authInstance = initializeAuth(firebaseApp, {
    persistence: getReactNativePersistence ? getReactNativePersistence(AsyncStorage) : undefined,
  });
} catch {
  // Khi app reload trong môi trường dev
  authInstance = getAuth(firebaseApp);
}

export const firebaseAuth = authInstance;

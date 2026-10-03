import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, Auth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from './env';

export const firebaseConfig = {
  apiKey: ENV.FIREBASE.apiKey || process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: ENV.FIREBASE.authDomain || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: ENV.FIREBASE.projectId || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: ENV.FIREBASE.storageBucket || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: ENV.FIREBASE.messagingSenderId || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: ENV.FIREBASE.appId || process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
  measurementId: ENV.FIREBASE.measurementId || process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || '',
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

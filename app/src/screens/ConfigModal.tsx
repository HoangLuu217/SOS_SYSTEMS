import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CustomInput } from '../components/CustomInput';
import { backendApi } from '../services/backendApi';
import { ENV } from '../config/env';
import { useAuth, AuthMode } from '../context/AuthContext';
import { isSupabaseConfigured } from '../config/supabase';

interface ConfigModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({ visible, onClose }) => {
  const { authMode, setAuthMode } = useAuth();
  const [apiUrl, setApiUrl] = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState(ENV.SUPABASE_URL);
  const [supabaseKey, setSupabaseKey] = useState(ENV.SUPABASE_ANON_KEY);
  const [testStatus, setTestStatus] = useState<{
    testing: boolean;
    success?: boolean;
    message?: string;
  }>({ testing: false });

  useEffect(() => {
    if (visible) {
      backendApi.getBaseUrl().then(url => setApiUrl(url));
    }
  }, [visible]);

  const handleTestBackend = async () => {
    setTestStatus({ testing: true });
    try {
      const url = apiUrl.replace(/\/api\/?$/, '');
      const healthUrl = `${url}/health`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        setTestStatus({
          testing: false,
          success: true,
          message: 'Kết nối Backend SOS thành công! (HTTP 200 OK)',
        });
      } else {
        setTestStatus({
          testing: false,
          success: false,
          message: `Backend phản hồi mã lỗi: ${res.status}`,
        });
      }
    } catch (err: any) {
      setTestStatus({
        testing: false,
        success: false,
        message: `Không thể kết nối (${err.message}). Hãy kiểm tra xem server backend đã chạy chưa.`,
      });
    }
  };

  const handleSave = async () => {
    if (apiUrl.trim()) {
      await backendApi.setBaseUrl(apiUrl.trim());
    }
    if (supabaseUrl.trim()) {
      ENV.SUPABASE_URL = supabaseUrl.trim();
    }
    if (supabaseKey.trim()) {
      ENV.SUPABASE_ANON_KEY = supabaseKey.trim();
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              <View style={styles.header}>
                <View style={styles.headerTitleRow}>
                  <Feather name="sliders" size={20} color="#0066FF" />
                  <Text style={styles.headerTitle}>Cấu hình kết nối</Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Feather name="x" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
                {/* 1. Backend Server API */}
                <Text style={styles.sectionTitle}>1. Địa chỉ Backend SOS (Express/Node.js)</Text>
                <Text style={styles.sectionDesc}>
                  - Android Emulator: http://10.0.2.2:5000/api{'\n'}
                  - iOS Simulator/Web: http://localhost:5000/api{'\n'}
                  - Điện thoại thật: Thay bằng IP WiFi máy tính (VD: http://192.168.1.15:5000/api)
                </Text>

                <CustomInput
                  iconName="server"
                  placeholder="http://localhost:5000/api"
                  value={apiUrl}
                  onChangeText={setApiUrl}
                  autoCapitalize="none"
                />

                <TouchableOpacity
                  style={styles.testButton}
                  onPress={handleTestBackend}
                  disabled={testStatus.testing}
                  activeOpacity={0.8}
                >
                  {testStatus.testing ? (
                    <ActivityIndicator size="small" color="#0066FF" />
                  ) : (
                    <>
                      <Feather name="activity" size={16} color="#0066FF" />
                      <Text style={styles.testButtonText}>Kiểm tra kết nối Backend</Text>
                    </>
                  )}
                </TouchableOpacity>

                {testStatus.message ? (
                  <View
                    style={[
                      styles.testResult,
                      testStatus.success ? styles.testResultSuccess : styles.testResultError,
                    ]}
                  >
                    <Feather
                      name={testStatus.success ? 'check-circle' : 'alert-circle'}
                      size={16}
                      color={testStatus.success ? '#10B981' : '#EF4444'}
                    />
                    <Text
                      style={[
                        styles.testResultText,
                        testStatus.success ? styles.textSuccess : styles.textError,
                      ]}
                    >
                      {testStatus.message}
                    </Text>
                  </View>
                ) : null}

                {/* 2. Supabase Configuration */}
                <Text style={styles.sectionTitle}>2. Cấu hình Supabase</Text>
                <Text style={styles.sectionDesc}>
                  Trạng thái: {isSupabaseConfigured() ? '✅ Đã cấu hình' : '⚠️ Đang dùng cấu hình mẫu'}
                </Text>

                <CustomInput
                  iconName="globe"
                  placeholder="https://your-project.supabase.co"
                  value={supabaseUrl}
                  onChangeText={setSupabaseUrl}
                  autoCapitalize="none"
                />

                <CustomInput
                  iconName="key"
                  placeholder="Supabase Public Anon Key"
                  value={supabaseKey}
                  onChangeText={setSupabaseKey}
                  autoCapitalize="none"
                />

                {/* 3. Auth Mode Selection */}
                <Text style={styles.sectionTitle}>3. Chế độ xác thực (Auth Mode)</Text>
                <View style={styles.modeContainer}>
                  {(['hybrid', 'backend', 'supabase'] as AuthMode[]).map(mode => (
                    <TouchableOpacity
                      key={mode}
                      style={[
                        styles.modeOption,
                        authMode === mode && styles.modeOptionActive,
                      ]}
                      onPress={() => setAuthMode(mode)}
                    >
                      <Text
                        style={[
                          styles.modeOptionText,
                          authMode === mode && styles.modeOptionTextActive,
                        ]}
                      >
                        {mode === 'hybrid'
                          ? 'Hybrid (Khuyên dùng)'
                          : mode === 'backend'
                          ? 'Chỉ SOS Backend'
                          : 'Chỉ Supabase'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Nút lưu */}
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSave}
                  activeOpacity={0.85}
                >
                  <Text style={styles.saveButtonText}>Lưu và áp dụng</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 22,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  body: {
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
    marginTop: 8,
  },
  sectionDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 10,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  testButtonText: {
    color: '#0066FF',
    fontSize: 13,
    fontWeight: '600',
  },
  testResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  testResultSuccess: {
    backgroundColor: '#ECFDF5',
  },
  testResultError: {
    backgroundColor: '#FEF2F2',
  },
  testResultText: {
    fontSize: 12,
    flex: 1,
  },
  textSuccess: {
    color: '#065F46',
  },
  textError: {
    color: '#991B1B',
  },
  modeContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
    marginTop: 6,
  },
  modeOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modeOptionActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
  },
  modeOptionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  modeOptionTextActive: {
    color: '#0066FF',
  },
  saveButton: {
    backgroundColor: '#0066FF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

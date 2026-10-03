import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Image,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { CustomInput } from '../components/CustomInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { GoogleButton } from '../components/GoogleButton';
import { AlertModal } from '../components/AlertModal';
import { useAuth } from '../context/AuthContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface LoginScreenProps {
  onNavigateToSignup: () => void;
  onNavigateToForgotPassword: () => void;
  onOpenSettings: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onNavigateToSignup,
  onNavigateToForgotPassword,
  onOpenSettings,
}) => {
  const { login, loginWithGoogle, isLoading } = useAuth();
  const insets = useSafeAreaInsets();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [alertInfo, setAlertInfo] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'info' | 'warning';
    title?: string;
    message: string;
  }>({
    visible: false,
    type: 'info',
    message: '',
  });

  const handleLogin = async () => {
    if (!identifier.trim()) {
      setAlertInfo({
        visible: true,
        type: 'warning',
        title: 'Thiếu thông tin',
        message: 'Vui lòng nhập số điện thoại hoặc email.',
      });
      return;
    }

    if (!password) {
      setAlertInfo({
        visible: true,
        type: 'warning',
        title: 'Thiếu thông tin',
        message: 'Vui lòng nhập mật khẩu.',
      });
      return;
    }

    const res = await login(identifier.trim(), password);
    if (!res.success) {
      setAlertInfo({
        visible: true,
        type: 'error',
        title: 'Đăng nhập không thành công',
        message: res.message,
      });
    }
  };

  const handleGoogleLogin = async () => {
    const res = await loginWithGoogle();
    if (!res.success && res.message) {
      setAlertInfo({
        visible: true,
        type: res.message.includes('src/config/env.ts') ? 'info' : 'error',
        title: res.message.includes('src/config/env.ts') ? 'Cấu hình Supabase' : 'Lỗi đăng nhập Google',
        message: res.message,
      });
    }
  };

  // Mép trên bắt đầu khoảng 32% chiều cao màn hình từ đỉnh máy
  const topPadding = Math.max(16, SCREEN_HEIGHT * 0.32);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Ảnh nền trực thăng cứu hộ & bầu trời mưa bão */}
      <ImageBackground
        source={require('../../assets/backgroudApp.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardView}
          >
            <ScrollView
              contentContainerStyle={[
                styles.scrollContent,
                {
                  paddingTop: topPadding,
                  paddingBottom: Math.max(20, insets.bottom + 12),
                },
              ]}
              bounces={false}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.centerContainer}>
                {/* Khung đăng nhập kính mờ xanh xám (Frosted Glass Card) */}
                <View style={styles.cardShadow}>
                  <View style={styles.cardInner}>
                    {/* Hiệu ứng làm mờ nền mạnh mẽ */}
                    <BlurView
                      intensity={Platform.OS === 'ios' ? 85 : 75}
                      tint="light"
                      style={StyleSheet.absoluteFill}
                    />

                    {/* Lớp phủ màu xanh xám rgba(210, 225, 240, 0.65) */}
                    <View style={styles.cardContent}>
                      {/* Logo RescueSOS - Bấm giữ 2s mở cấu hình IP */}
                      <TouchableOpacity
                        style={styles.logoWrapper}
                        onLongPress={onOpenSettings}
                        activeOpacity={0.9}
                        delayLongPress={1500}
                      >
                        <Image
                          source={require('../../assets/logoSOS.png')}
                          style={styles.logoImage}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>

                      {/* Tiêu đề: Đăng nhập */}
                      <Text style={styles.title}>Đăng nhập</Text>

                      {/* Phụ đề: Giữ trên một dòng với kích cỡ phù hợp */}
                      <Text
                        style={styles.subtitle}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        Cùng nhau chủ động – An toàn hơn trước thiên tai
                      </Text>

                      {/* Form fields */}
                      <View style={styles.form}>
                        {/* Ô nhập số điện thoại hoặc email */}
                        <CustomInput
                          iconName="user"
                          placeholder="Số điện thoại hoặc email"
                          value={identifier}
                          onChangeText={setIdentifier}
                          autoCapitalize="none"
                          keyboardType="email-address"
                          returnKeyType="next"
                        />

                        {/* Ô nhập mật khẩu */}
                        <CustomInput
                          iconName="lock"
                          placeholder="Mật khẩu"
                          value={password}
                          onChangeText={setPassword}
                          isPassword
                          returnKeyType="done"
                          onSubmitEditing={handleLogin}
                        />

                        {/* Nút Đăng nhập màu xanh với mũi tên */}
                        <PrimaryButton
                          title="Đăng nhập"
                          onPress={handleLogin}
                          loading={isLoading}
                        />

                        {/* Divider Hoặc */}
                        <View style={styles.dividerRow}>
                          <View style={styles.dividerLine} />
                          <Text style={styles.dividerText}>Hoặc</Text>
                          <View style={styles.dividerLine} />
                        </View>

                        {/* Nút trắng: Đăng nhập với Google */}
                        <GoogleButton
                          title="Đăng nhập với Google"
                          onPress={handleGoogleLogin}
                          disabled={isLoading}
                        />
                      </View>
                    </View>
                  </View>
                </View>

                {/* Các liên kết bên ngoài card: 2 dòng riêng biệt căn giữa */}
                <View style={styles.outsideLinksContainer}>
                  {/* Dòng 1: Quên mật khẩu? */}
                  <TouchableOpacity
                    onPress={onNavigateToForgotPassword}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
                  >
                    <Text style={styles.outsideForgotPasswordText}>Quên mật khẩu?</Text>
                  </TouchableOpacity>

                  {/* Dòng 2: Chưa có tài khoản? Đăng ký */}
                  <TouchableOpacity
                    onPress={onNavigateToSignup}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 10, left: 16, right: 16 }}
                    style={styles.outsideSignupRow}
                  >
                    <Text style={styles.outsideSignupPrompt}>Chưa có tài khoản? </Text>
                    <Text style={styles.outsideSignupLink}>Đăng ký</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ImageBackground>

      {/* Modal thông báo */}
      <AlertModal
        visible={alertInfo.visible}
        type={alertInfo.type}
        title={alertInfo.title}
        message={alertInfo.message}
        onClose={() => setAlertInfo(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  centerContainer: {
    width: '100%',
    maxWidth: 390,
    alignItems: 'center',
  },
  /* Bóng đổ mềm cho khung */
  cardShadow: {
    width: '100%',
    borderRadius: 30,
    ...Platform.select({
      ios: {
        shadowColor: '#0B192C',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.16,
        shadowRadius: 20,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  /* Viền trắng mảnh và góc bo tròn 30px */
  cardInner: {
    width: '100%',
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.75)',
  },
  /* Lớp phủ kính mờ xanh xám theo yêu cầu: rgba(210, 225, 240, 0.65) */
  cardContent: {
    backgroundColor: 'rgba(210, 225, 240, 0.65)',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    alignItems: 'center',
  },
  logoWrapper: {
    alignItems: 'center',
    marginBottom: 4,
  },
  logoImage: {
    width: 76,
    height: 50,
  },
  title: {
    fontSize: 23,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12.5,
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    paddingHorizontal: 2,
  },
  form: {
    width: '100%',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.20)',
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#334155',
    fontWeight: '700',
  },
  /* Liên kết ngoài card: 2 dòng tách biệt căn giữa */
  outsideLinksContainer: {
    marginTop: 18,
    alignItems: 'center',
    width: '100%',
  },
  outsideForgotPasswordText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
    textDecorationLine: 'underline',
    textAlign: 'center',
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
      android: {
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
    }),
  },
  outsideSignupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  outsideSignupPrompt: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
      android: {
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
    }),
  },
  outsideSignupLink: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textDecorationLine: 'underline',
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
      android: {
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
    }),
  },
});

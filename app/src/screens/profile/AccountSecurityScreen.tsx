import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { PROFILE_THEME } from './theme';
import { useAuth } from '../../context/AuthContext';
import { backendApi } from '../../services/backendApi';
import { ForgotPasswordModal } from '../ForgotPasswordModal';

interface AccountSecurityScreenProps {
  onBack: () => void;
  onOpenForgotPassword?: () => void;
}

export type SecurityAccountMode = 'password' | 'google';

export const AccountSecurityScreen: React.FC<AccountSecurityScreenProps> = ({
  onBack,
  onOpenForgotPassword,
}) => {
  const { user, supabaseUser } = useAuth();

  // Xác định tài khoản Google mặc định
  const isDefaultGoogle = Boolean(
    (user?.googleId && !user?.phone) ||
    (supabaseUser?.app_metadata?.provider === 'google' && !user?.phone)
  );

  // Cho phép chuyển đổi linh hoạt giữa 2 trạng thái màn hình
  const [accountMode, setAccountMode] = useState<SecurityAccountMode>(
    isDefaultGoogle ? 'google' : 'password'
  );

  // Form states cho tài khoản có mật khẩu
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Ẩn / hiện mật khẩu
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Lỗi & thông báo
  const [errors, setErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
    general?: string;
  }>({});
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal quên mật khẩu
  const [forgotPasswordVisible, setForgotPasswordVisible] = useState(false);

  const handleResetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrors({});
  };

  const validate = () => {
    const newErrors: {
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    } = {};

    if (!currentPassword.trim()) {
      newErrors.currentPassword = 'Vui lòng nhập mật khẩu hiện tại';
    }

    if (!newPassword.trim()) {
      newErrors.newPassword = 'Vui lòng nhập mật khẩu mới';
    } else if (newPassword.length < 8) {
      newErrors.newPassword = 'Mật khẩu mới phải có ít nhất 8 ký tự';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      newErrors.newPassword = 'Mật khẩu cần gồm chữ hoa, chữ thường và chữ số';
    }

    if (!confirmPassword.trim()) {
      newErrors.confirmPassword = 'Vui lòng xác nhận mật khẩu mới';
    } else if (confirmPassword !== newPassword) {
      newErrors.confirmPassword = 'Mật khẩu xác nhận không trùng khớp';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    setErrors({});
    setSuccessMessage(null);

    try {
      const res = await backendApi.changePassword(currentPassword, newPassword);
      if (res.success) {
        setSuccessMessage('Đổi mật khẩu thành công! Hãy ghi nhớ mật khẩu mới.');
        handleResetForm();
      } else {
        const errorMsg = res.message || 'Không thể đổi mật khẩu';
        if (
          errorMsg.toLowerCase().includes('mật khẩu hiện tại') ||
          errorMsg.toLowerCase().includes('incorrect') ||
          errorMsg.toLowerCase().includes('current password')
        ) {
          setErrors({ currentPassword: 'Mật khẩu hiện tại không chính xác' });
        } else {
          setErrors({ general: errorMsg });
        }
      }
    } catch (err: any) {
      setErrors({
        general: err?.message || 'Có lỗi xảy ra khi kết nối máy chủ. Vui lòng thử lại.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForgot = () => {
    if (onOpenForgotPassword) {
      onOpenForgotPassword();
    } else {
      setForgotPasswordVisible(true);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={PROFILE_THEME.colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          testID="btn-back-security"
        >
          <Feather name="arrow-left" size={24} color={PROFILE_THEME.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bảo mật tài khoản</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Trình chọn trạng thái mẫu: Có mật khẩu vs Tài khoản Google */}
          <View style={styles.stateSelectorCard}>
            <View style={styles.stateSelectorHeader}>
              <Feather name="sliders" size={14} color={PROFILE_THEME.colors.primary} />
              <Text style={styles.stateSelectorTitle}>Kiểu tài khoản đăng nhập:</Text>
            </View>
            <View style={styles.statePillsRow}>
              <TouchableOpacity
                style={[
                  styles.statePill,
                  accountMode === 'password' && styles.statePillActive,
                ]}
                onPress={() => {
                  setAccountMode('password');
                  setErrors({});
                  setSuccessMessage(null);
                }}
                activeOpacity={0.7}
              >
                <Feather
                  name="lock"
                  size={13}
                  color={accountMode === 'password' ? '#FFFFFF' : PROFILE_THEME.colors.textSecondary}
                />
                <Text
                  style={[
                    styles.statePillText,
                    accountMode === 'password' && styles.statePillTextActive,
                  ]}
                >
                  Có mật khẩu
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.statePill,
                  accountMode === 'google' && styles.statePillActive,
                ]}
                onPress={() => {
                  setAccountMode('google');
                  setErrors({});
                  setSuccessMessage(null);
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="logo-google"
                  size={13}
                  color={accountMode === 'google' ? '#FFFFFF' : '#4285F4'}
                />
                <Text
                  style={[
                    styles.statePillText,
                    accountMode === 'google' && styles.statePillTextActive,
                  ]}
                >
                  Tài khoản Google
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Security Banner with Shield Icon */}
          <View style={styles.securityBanner}>
            <View style={styles.securityBannerIconContainer}>
              <Feather name="shield" size={22} color={PROFILE_THEME.colors.primary} />
            </View>
            <View style={styles.securityBannerTextContainer}>
              <Text style={styles.securityBannerTitle}>Bảo mật hệ thống cứu nạn</Text>
              <Text style={styles.securityBannerDesc}>
                Bảo vệ tài khoản cứu hộ của bạn bằng thông tin đăng nhập an toàn, ngăn chặn truy cập trái phép.
              </Text>
            </View>
          </View>

          {/* Success Toast / Feedback */}
          {successMessage && (
            <View style={styles.successBanner}>
              <View style={styles.successIconCircle}>
                <Feather name="check" size={16} color={PROFILE_THEME.colors.card} />
              </View>
              <Text style={styles.successText}>{successMessage}</Text>
              <TouchableOpacity
                onPress={() => setSuccessMessage(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={18} color={PROFILE_THEME.colors.success} />
              </TouchableOpacity>
            </View>
          )}

          {/* General Error Banner */}
          {errors.general && (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={18} color={PROFILE_THEME.colors.primary} />
              <Text style={styles.errorBannerText}>{errors.general}</Text>
            </View>
          )}

          {/* ========================================================
              TRẠNG THÁI 1: TÀI KHOẢN GOOGLE (Không có mật khẩu)
             ======================================================== */}
          {accountMode === 'google' ? (
            <View style={styles.card}>
              <View style={styles.googleAccountHeader}>
                <View style={styles.googleIconBox}>
                  <Ionicons name="logo-google" size={26} color="#4285F4" />
                </View>
                <View style={styles.googleHeaderTextWrap}>
                  <Text style={styles.googleHeaderTitle}>Tài khoản liên kết Google</Text>
                  <Text style={styles.googleEmailText}>
                    {user?.email || 'nguyenminhan.rescuer@gmail.com'}
                  </Text>
                </View>
              </View>

              <View style={styles.googleDivider} />

              {/* Lời giải thích bắt buộc theo yêu cầu */}
              <View style={styles.googleExplanationBox}>
                <View style={styles.googleNoticeIconWrap}>
                  <Feather name="info" size={18} color="#0284C7" />
                </View>
                <Text style={styles.googleExplanationText}>
                  Bạn đang đăng nhập bằng Google. Quản lý mật khẩu trong tài khoản Google của bạn.
                </Text>
              </View>

              {/* Thông tin phụ trợ bảo mật của Google */}
              <View style={styles.googleFeaturesList}>
                <View style={styles.googleFeatureRow}>
                  <Feather name="check-circle" size={16} color={PROFILE_THEME.colors.success} />
                  <Text style={styles.googleFeatureText}>
                    Đăng nhập an toàn một chạm qua OAuth2
                  </Text>
                </View>
                <View style={styles.googleFeatureRow}>
                  <Feather name="shield" size={16} color={PROFILE_THEME.colors.success} />
                  <Text style={styles.googleFeatureText}>
                    Bảo vệ bởi hệ thống chống xâm nhập Google Guard
                  </Text>
                </View>
                <View style={styles.googleFeatureRow}>
                  <Feather name="lock" size={16} color="#64748B" />
                  <Text style={styles.googleFeatureTextMuted}>
                    Không lưu trữ mật khẩu trực tiếp trên hệ thống RescueSOS
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            /* ========================================================
                TRẠNG THÁI 2: TÀI KHOẢN CÓ MẬT KHẨU
               ======================================================== */
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionIconWrap}>
                  <Feather name="lock" size={18} color={PROFILE_THEME.colors.primary} />
                </View>
                <Text style={styles.sectionTitle}>Đổi mật khẩu</Text>
              </View>

              {/* 1. Mật khẩu hiện tại */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Mật khẩu hiện tại <Text style={styles.requiredStar}>*</Text>
                </Text>
                <View
                  style={[
                    styles.inputContainer,
                    errors.currentPassword && styles.inputContainerError,
                  ]}
                >
                  <TextInput
                    style={styles.textInput}
                    placeholder="Nhập mật khẩu hiện tại"
                    placeholderTextColor={PROFILE_THEME.colors.textMuted}
                    secureTextEntry={!showCurrentPassword}
                    value={currentPassword}
                    onChangeText={(val) => {
                      setCurrentPassword(val);
                      if (errors.currentPassword) {
                        setErrors((prev) => ({ ...prev, currentPassword: undefined }));
                      }
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    testID="toggle-current-password"
                  >
                    <Feather
                      name={showCurrentPassword ? 'eye-off' : 'eye'}
                      size={18}
                      color={PROFILE_THEME.colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
                {errors.currentPassword ? (
                  <View style={styles.errorRow}>
                    <Feather name="alert-circle" size={13} color={PROFILE_THEME.colors.primary} />
                    <Text style={styles.errorText}>{errors.currentPassword}</Text>
                  </View>
                ) : null}
              </View>

              {/* 2. Mật khẩu mới */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Mật khẩu mới <Text style={styles.requiredStar}>*</Text>
                </Text>
                <View
                  style={[
                    styles.inputContainer,
                    errors.newPassword && styles.inputContainerError,
                  ]}
                >
                  <TextInput
                    style={styles.textInput}
                    placeholder="Tối thiểu 8 ký tự"
                    placeholderTextColor={PROFILE_THEME.colors.textMuted}
                    secureTextEntry={!showNewPassword}
                    value={newPassword}
                    onChangeText={(val) => {
                      setNewPassword(val);
                      if (errors.newPassword) {
                        setErrors((prev) => ({ ...prev, newPassword: undefined }));
                      }
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowNewPassword(!showNewPassword)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    testID="toggle-new-password"
                  >
                    <Feather
                      name={showNewPassword ? 'eye-off' : 'eye'}
                      size={18}
                      color={PROFILE_THEME.colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                {/* Hướng dẫn ngắn về mật khẩu */}
                <View style={styles.guidanceBox}>
                  <Feather name="info" size={13} color={PROFILE_THEME.colors.textMuted} />
                  <Text style={styles.guidanceText}>
                    Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường và chữ số.
                  </Text>
                </View>

                {errors.newPassword ? (
                  <View style={styles.errorRow}>
                    <Feather name="alert-circle" size={13} color={PROFILE_THEME.colors.primary} />
                    <Text style={styles.errorText}>{errors.newPassword}</Text>
                  </View>
                ) : null}
              </View>

              {/* 3. Xác nhận mật khẩu mới */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Xác nhận mật khẩu mới <Text style={styles.requiredStar}>*</Text>
                </Text>
                <View
                  style={[
                    styles.inputContainer,
                    errors.confirmPassword && styles.inputContainerError,
                  ]}
                >
                  <TextInput
                    style={styles.textInput}
                    placeholder="Nhập lại mật khẩu mới"
                    placeholderTextColor={PROFILE_THEME.colors.textMuted}
                    secureTextEntry={!showConfirmPassword}
                    value={confirmPassword}
                    onChangeText={(val) => {
                      setConfirmPassword(val);
                      if (errors.confirmPassword) {
                        setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                      }
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    testID="toggle-confirm-password"
                  >
                    <Feather
                      name={showConfirmPassword ? 'eye-off' : 'eye'}
                      size={18}
                      color={PROFILE_THEME.colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
                {errors.confirmPassword ? (
                  <View style={styles.errorRow}>
                    <Feather name="alert-circle" size={13} color={PROFILE_THEME.colors.primary} />
                    <Text style={styles.errorText}>{errors.confirmPassword}</Text>
                  </View>
                ) : null}
              </View>

              {/* Nút hành động chính: Đổi mật khẩu (Màu đỏ san hô coral-red) */}
              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.8}
                testID="btn-change-password"
              >
                {loading ? (
                  <View style={styles.buttonInner}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>Đang cập nhật...</Text>
                  </View>
                ) : (
                  <View style={styles.buttonInner}>
                    <Feather name="check-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.primaryButtonText}>Đổi mật khẩu</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Liên kết phụ: Quên mật khẩu? */}
              <View style={styles.forgotPasswordContainer}>
                <TouchableOpacity
                  onPress={handleOpenForgot}
                  activeOpacity={0.7}
                  style={styles.forgotPasswordButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.forgotPasswordText}>Quên mật khẩu?</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Khoảng cách đáy an toàn tránh đè lên Bottom Navbar */}
          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal Quên mật khẩu */}
      <ForgotPasswordModal
        visible={forgotPasswordVisible}
        onClose={() => setForgotPasswordVisible(false)}
        onSuccess={(msg) => {
          setForgotPasswordVisible(false);
          setSuccessMessage(msg || 'Mật khẩu đã được đặt lại thành công.');
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: PROFILE_THEME.colors.background,
  },
  flexOne: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: PROFILE_THEME.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: PROFILE_THEME.colors.borderLight,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PROFILE_THEME.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: PROFILE_THEME.colors.textPrimary,
  },
  headerRightSpacer: {
    width: 44,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
  },

  /* State Selector Pill Card */
  stateSelectorCard: {
    backgroundColor: PROFILE_THEME.colors.card,
    borderRadius: PROFILE_THEME.radius.card,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: PROFILE_THEME.colors.borderLight,
  },
  stateSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  stateSelectorTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: PROFILE_THEME.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statePillsRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  statePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  statePillActive: {
    backgroundColor: PROFILE_THEME.colors.primary,
    shadowColor: PROFILE_THEME.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  statePillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: PROFILE_THEME.colors.textSecondary,
  },
  statePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  /* Security Banner */
  securityBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: PROFILE_THEME.colors.card,
    borderRadius: PROFILE_THEME.radius.card,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: PROFILE_THEME.colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  securityBannerIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: PROFILE_THEME.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  securityBannerTextContainer: {
    flex: 1,
  },
  securityBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PROFILE_THEME.colors.textPrimary,
    marginBottom: 3,
  },
  securityBannerDesc: {
    fontSize: 13,
    color: PROFILE_THEME.colors.textSecondary,
    lineHeight: 18,
  },

  /* Success & Error Banners */
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PROFILE_THEME.colors.successLight,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: PROFILE_THEME.radius.card,
    padding: 14,
    marginBottom: 16,
  },
  successIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: PROFILE_THEME.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  successText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#065F46',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PROFILE_THEME.colors.primaryLight,
    borderWidth: 1,
    borderColor: PROFILE_THEME.colors.primaryBorder,
    borderRadius: PROFILE_THEME.radius.card,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: PROFILE_THEME.colors.primaryDark,
    fontWeight: '500',
  },

  /* Card Container */
  card: {
    backgroundColor: PROFILE_THEME.colors.card,
    borderRadius: PROFILE_THEME.radius.card,
    padding: 20,
    borderWidth: 1,
    borderColor: PROFILE_THEME.colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 10,
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: PROFILE_THEME.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: PROFILE_THEME.colors.textPrimary,
  },

  /* Form Fields */
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '600',
    color: PROFILE_THEME.colors.textPrimary,
    marginBottom: 8,
  },
  requiredStar: {
    color: PROFILE_THEME.colors.primary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PROFILE_THEME.colors.inputBg,
    borderWidth: 1.2,
    borderColor: PROFILE_THEME.colors.inputBorder,
    borderRadius: PROFILE_THEME.radius.input,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  inputContainerError: {
    borderColor: PROFILE_THEME.colors.primary,
    backgroundColor: '#FFF8F8',
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: PROFILE_THEME.colors.textPrimary,
    paddingVertical: 12,
  },
  eyeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guidanceBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
    gap: 6,
    paddingHorizontal: 4,
  },
  guidanceText: {
    flex: 1,
    fontSize: 12,
    color: PROFILE_THEME.colors.textSecondary,
    lineHeight: 16,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 12.5,
    color: PROFILE_THEME.colors.primary,
    fontWeight: '500',
  },

  /* Primary Button (Coral Red) */
  primaryButton: {
    backgroundColor: PROFILE_THEME.colors.primary,
    borderRadius: PROFILE_THEME.radius.button,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: PROFILE_THEME.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  /* Forgot Password Link */
  forgotPasswordContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  forgotPasswordButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '600',
    color: PROFILE_THEME.colors.primary,
  },

  /* Google Account Card */
  googleAccountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  googleIconBox: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleHeaderTextWrap: {
    flex: 1,
  },
  googleHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PROFILE_THEME.colors.textPrimary,
    marginBottom: 4,
  },
  googleEmailText: {
    fontSize: 14,
    color: PROFILE_THEME.colors.textSecondary,
    fontWeight: '500',
  },
  googleDivider: {
    height: 1,
    backgroundColor: PROFILE_THEME.colors.borderLight,
    marginVertical: 18,
  },
  googleExplanationBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 18,
  },
  googleNoticeIconWrap: {
    marginTop: 2,
  },
  googleExplanationText: {
    flex: 1,
    fontSize: 13.5,
    color: '#0369A1',
    lineHeight: 20,
    fontWeight: '500',
  },
  googleFeaturesList: {
    gap: 12,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: PROFILE_THEME.colors.borderLight,
  },
  googleFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  googleFeatureText: {
    fontSize: 13,
    color: PROFILE_THEME.colors.textPrimary,
    fontWeight: '500',
    flex: 1,
  },
  googleFeatureTextMuted: {
    fontSize: 12.5,
    color: PROFILE_THEME.colors.textMuted,
    flex: 1,
  },
});

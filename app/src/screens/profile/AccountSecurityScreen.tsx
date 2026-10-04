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
import { sendPhoneOtpFirebase, verifyPhoneOtpFirebase } from '../../services/phoneAuthService';

interface AccountSecurityScreenProps {
  onBack: () => void;
  onOpenForgotPassword?: () => void;
}

export const AccountSecurityScreen: React.FC<AccountSecurityScreenProps> = ({
  onBack,
  onOpenForgotPassword,
}) => {
  const { user, supabaseUser, updateUserProfile } = useAuth();

  // Xác định người dùng đăng nhập qua Google OAuth hay tài khoản mật khẩu (SĐT / Email)
  const isGoogleUser = Boolean(
    user?.googleId ||
    supabaseUser?.app_metadata?.provider === 'google' ||
    supabaseUser?.identities?.some((id: any) => id.provider === 'google')
  );

  // States cho tính năng xác thực Số điện thoại (Firebase)
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [phoneSessionInfo, setPhoneSessionInfo] = useState('');
  const [isSendingPhoneOtp, setIsSendingPhoneOtp] = useState(false);
  const [isVerifyingPhoneOtp, setIsVerifyingPhoneOtp] = useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneCountdown, setPhoneCountdown] = useState(0);
  const [phoneSuccessMsg, setPhoneSuccessMsg] = useState<string | null>(null);
  const [phoneErrorMsg, setPhoneErrorMsg] = useState<string | null>(null);
  const [isEditingPhone, setIsEditingPhone] = useState(!user?.phone);

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

  // Effect đếm ngược thời gian chờ gửi lại mã OTP (60s)
  React.useEffect(() => {
    if (phoneCountdown <= 0) return;
    const timer = setInterval(() => {
      setPhoneCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phoneCountdown]);

  // Cập nhật phoneInput khi user.phone thay đổi từ backend
  React.useEffect(() => {
    if (user?.phone && !isEditingPhone) {
      setPhoneInput(user.phone);
    }
  }, [user?.phone, isEditingPhone]);

  // Xử lý gửi mã xác thực SMS OTP qua Firebase
  const handleSendPhoneOtp = async () => {
    setPhoneErrorMsg(null);
    setPhoneSuccessMsg(null);
    const cleanPhone = phoneInput.trim().replace(/\s+/g, '');
    if (!cleanPhone) {
      setPhoneErrorMsg('Vui lòng nhập số điện thoại');
      return;
    }

    const phoneRegex = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$|^\+?[1-9]\d{8,14}$/;
    if (!phoneRegex.test(cleanPhone)) {
      setPhoneErrorMsg('Số điện thoại không hợp lệ (hỗ trợ 10 số VN 03x, 05x, 07x, 08x, 09x hoặc +84...)');
      return;
    }

    setIsSendingPhoneOtp(true);
    try {
      const res = await sendPhoneOtpFirebase(cleanPhone);
      if (res.success && res.sessionInfo) {
        setPhoneSessionInfo(res.sessionInfo);
        setPhoneOtpSent(true);
        setPhoneCountdown(60);
        setPhoneSuccessMsg(`Mã OTP 6 số đã được gửi qua SMS đến ${cleanPhone}`);
      } else {
        setPhoneErrorMsg(res.message || 'Không thể gửi mã OTP qua SMS. Vui lòng kiểm tra lại số điện thoại.');
      }
    } catch (err: any) {
      setPhoneErrorMsg(err?.message || 'Có lỗi xảy ra khi gửi mã OTP qua SMS.');
    } finally {
      setIsSendingPhoneOtp(false);
    }
  };

  // Xử lý xác minh mã OTP và cập nhật số điện thoại vào hồ sơ người dùng
  const handleVerifyPhoneOtp = async () => {
    setPhoneErrorMsg(null);
    setPhoneSuccessMsg(null);
    const cleanCode = phoneOtpCode.trim();
    if (!cleanCode || cleanCode.length < 6) {
      setPhoneErrorMsg('Vui lòng nhập đủ 6 chữ số mã OTP');
      return;
    }

    setIsVerifyingPhoneOtp(true);
    try {
      const verifyRes = await verifyPhoneOtpFirebase(phoneSessionInfo, cleanCode);
      if (!verifyRes.success) {
        setPhoneErrorMsg(verifyRes.message || 'Mã OTP không chính xác hoặc đã hết hạn.');
        setIsVerifyingPhoneOtp(false);
        return;
      }

      // Xác thực SMS thành công -> Cập nhật số điện thoại vào tài khoản Backend
      const cleanPhone = phoneInput.trim().replace(/\s+/g, '');
      const updateRes = await updateUserProfile({ phone: cleanPhone });
      if (updateRes.success) {
        setPhoneSuccessMsg('Xác thực số điện thoại thành công và đã lưu vào hồ sơ cứu nạn!');
        setPhoneOtpSent(false);
        setPhoneOtpCode('');
        setIsEditingPhone(false);
      } else {
        setPhoneErrorMsg(updateRes.message || 'Xác thực OTP thành công nhưng không thể cập nhật SĐT vào hồ sơ.');
      }
    } catch (err: any) {
      setPhoneErrorMsg(err?.message || 'Lỗi khi xác thực mã OTP.');
    } finally {
      setIsVerifyingPhoneOtp(false);
    }
  };

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
          {/* Security Banner with Shield Icon */}
          <View style={styles.securityBanner}>
            <View style={styles.securityBannerIconContainer}>
              <Feather name="shield" size={22} color={PROFILE_THEME.colors.primary} />
            </View>
            <View style={styles.securityBannerTextContainer}>
              <Text style={styles.securityBannerTitle}>
                {isGoogleUser ? 'Bảo mật tài khoản Google' : 'Bảo mật hệ thống cứu nạn'}
              </Text>
              <Text style={styles.securityBannerDesc}>
                {isGoogleUser
                  ? 'Tài khoản của bạn được bảo vệ bởi cơ chế đăng nhập OAuth2 an toàn của Google.'
                  : 'Bảo vệ tài khoản cứu hộ của bạn bằng thông tin đăng nhập an toàn, ngăn chặn truy cập trái phép.'}
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
              TRƯỜNG HỢP 1: TÀI KHOẢN GOOGLE
              - Không có phần đổi mật khẩu
              - Có card thông tin Google & Xác thực số điện thoại
             ======================================================== */}
          {isGoogleUser ? (
            <>
              {/* Card 1: Thông tin tài khoản Google (Không có phần đổi mật khẩu) */}
              <View style={styles.card}>
                <View style={styles.googleAccountHeader}>
                  <View style={styles.googleIconBox}>
                    <Ionicons name="logo-google" size={26} color="#4285F4" />
                  </View>
                  <View style={styles.googleHeaderTextWrap}>
                    <Text style={styles.googleHeaderTitle}>Tài khoản liên kết Google</Text>
                    <Text style={styles.googleEmailText}>
                      {user?.email || supabaseUser?.email || ''}
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

              {/* Card 2: Xác thực số điện thoại (Bổ sung cho tài khoản Google) */}
              <View style={[styles.card, { marginTop: 16 }]}>
                <View style={styles.sectionHeaderRow}>
                  <View style={[styles.sectionIconWrap, { backgroundColor: '#F0F9FF' }]}>
                    <Feather name="phone-call" size={18} color="#0284C7" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Xác thực số điện thoại</Text>
                    <Text style={styles.sectionSubtitle}>
                      Liên lạc khẩn cấp khi gửi tín hiệu SOS & bảo mật tài khoản
                    </Text>
                  </View>
                </View>

                {/* Thông báo thành công nếu có */}
                {phoneSuccessMsg && (
                  <View style={styles.phoneSuccessBanner}>
                    <Feather name="check-circle" size={16} color="#059669" />
                    <Text style={styles.phoneSuccessText}>{phoneSuccessMsg}</Text>
                  </View>
                )}

                {/* Thông báo lỗi nếu có */}
                {phoneErrorMsg && (
                  <View style={styles.phoneErrorBanner}>
                    <Feather name="alert-circle" size={16} color="#DC2626" />
                    <Text style={styles.phoneErrorText}>{phoneErrorMsg}</Text>
                  </View>
                )}

                {/* Trường hợp 1: Đã có SĐT và không trong chế độ sửa */}
                {user?.phone && !isEditingPhone ? (
                  <View style={styles.verifiedPhoneContainer}>
                    <View style={styles.verifiedPhoneHeader}>
                      <View style={styles.verifiedBadge}>
                        <Feather name="check" size={12} color="#059669" />
                        <Text style={styles.verifiedBadgeText}>Đã xác thực qua SMS</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.editPhoneBtn}
                        onPress={() => {
                          setIsEditingPhone(true);
                          setPhoneInput(user.phone || '');
                          setPhoneOtpSent(false);
                          setPhoneOtpCode('');
                          setPhoneErrorMsg(null);
                          setPhoneSuccessMsg(null);
                        }}
                        activeOpacity={0.7}
                      >
                        <Feather name="edit-2" size={13} color="#0284C7" />
                        <Text style={styles.editPhoneBtnText}>Thay đổi SĐT</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.phoneDisplayBox}>
                      <Feather name="smartphone" size={20} color="#0284C7" />
                      <Text style={styles.phoneDisplayText}>{user.phone}</Text>
                    </View>

                    <Text style={styles.phoneHintMuted}>
                      Số điện thoại này được dùng để đội cứu hộ gọi xác nhận vị trí khi bạn bấm gửi SOS khẩn cấp.
                    </Text>
                  </View>
                ) : (
                  /* Trường hợp 2: Chưa có SĐT hoặc đang bấm thay đổi */
                  <View style={styles.phoneInputSection}>
                    {!user?.phone && (
                      <View style={styles.phoneWarningBox}>
                        <Feather name="alert-triangle" size={16} color="#D97706" style={{ marginTop: 2 }} />
                        <Text style={styles.phoneWarningText}>
                          Tài khoản Google của bạn chưa liên kết số điện thoại. Hãy xác thực ngay để sẵn sàng liên lạc khi gặp sự cố thiên tai.
                        </Text>
                      </View>
                    )}

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>
                        Số điện thoại liên hệ <Text style={styles.requiredStar}>*</Text>
                      </Text>
                      <View style={styles.inputContainer}>
                        <Feather name="phone" size={18} color="#64748B" style={{ marginRight: 10 }} />
                        <TextInput
                          style={styles.textInput}
                          placeholder="VD: 0912345678 hoặc +84..."
                          placeholderTextColor={PROFILE_THEME.colors.textMuted}
                          value={phoneInput}
                          onChangeText={(val) => {
                            setPhoneInput(val);
                            if (phoneErrorMsg) setPhoneErrorMsg(null);
                          }}
                          keyboardType="phone-pad"
                          editable={!phoneOtpSent || phoneCountdown <= 0}
                        />
                        {phoneInput.length > 0 && !phoneOtpSent && (
                          <TouchableOpacity
                            onPress={() => setPhoneInput('')}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Feather name="x-circle" size={16} color="#94A3B8" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {/* Nút gửi mã OTP */}
                    {!phoneOtpSent ? (
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        {user?.phone && (
                          <TouchableOpacity
                            style={styles.cancelEditBtn}
                            onPress={() => {
                              setIsEditingPhone(false);
                              setPhoneErrorMsg(null);
                              setPhoneSuccessMsg(null);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.cancelEditBtnText}>Hủy</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[
                            styles.sendOtpButton,
                            isSendingPhoneOtp && styles.buttonDisabled,
                            user?.phone ? { flex: 1 } : { width: '100%' },
                          ]}
                          onPress={handleSendPhoneOtp}
                          disabled={isSendingPhoneOtp}
                          activeOpacity={0.8}
                        >
                          {isSendingPhoneOtp ? (
                            <View style={styles.buttonInner}>
                              <ActivityIndicator size="small" color="#FFFFFF" />
                              <Text style={styles.sendOtpButtonText}>Đang gửi OTP...</Text>
                            </View>
                          ) : (
                            <View style={styles.buttonInner}>
                              <Feather name="send" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                              <Text style={styles.sendOtpButtonText}>Gửi mã OTP (SMS)</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      </View>
                    ) : (
                      /* Khi đã gửi OTP -> Hiện ô nhập mã OTP & nút Xác nhận */
                      <View style={styles.otpVerifyWrap}>
                        <View style={styles.inputGroup}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <Text style={styles.label}>
                              Nhập mã OTP 6 số <Text style={styles.requiredStar}>*</Text>
                            </Text>
                            <TouchableOpacity
                              onPress={handleSendPhoneOtp}
                              disabled={phoneCountdown > 0 || isSendingPhoneOtp}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Text
                                style={[
                                  styles.resendCodeText,
                                  phoneCountdown > 0 && { color: '#94A3B8' },
                                ]}
                              >
                                {phoneCountdown > 0 ? `Gửi lại sau (${phoneCountdown}s)` : 'Gửi lại mã'}
                              </Text>
                            </TouchableOpacity>
                          </View>

                          <View style={styles.inputContainer}>
                            <Feather name="key" size={18} color="#64748B" style={{ marginRight: 10 }} />
                            <TextInput
                              style={[styles.textInput, { letterSpacing: 4, fontWeight: '700' }]}
                              placeholder="••••••"
                              placeholderTextColor={PROFILE_THEME.colors.textMuted}
                              value={phoneOtpCode}
                              onChangeText={(val) => {
                                setPhoneOtpCode(val);
                                if (phoneErrorMsg) setPhoneErrorMsg(null);
                              }}
                              keyboardType="number-pad"
                              maxLength={6}
                            />
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                          <TouchableOpacity
                            style={styles.cancelEditBtn}
                            onPress={() => {
                              setPhoneOtpSent(false);
                              setPhoneOtpCode('');
                              if (user?.phone) setIsEditingPhone(false);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.cancelEditBtnText}>Hủy</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.verifySubmitBtn,
                              (isVerifyingPhoneOtp || phoneOtpCode.length < 6) && styles.buttonDisabled,
                            ]}
                            onPress={handleVerifyPhoneOtp}
                            disabled={isVerifyingPhoneOtp || phoneOtpCode.length < 6}
                            activeOpacity={0.8}
                          >
                            {isVerifyingPhoneOtp ? (
                              <View style={styles.buttonInner}>
                                <ActivityIndicator size="small" color="#FFFFFF" />
                                <Text style={styles.primaryButtonText}>Đang xác thực...</Text>
                              </View>
                            ) : (
                              <View style={styles.buttonInner}>
                                <Feather name="check" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                                <Text style={styles.primaryButtonText}>Xác nhận & Lưu SĐT</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </>
          ) : (
            /* ========================================================
                TRƯỜNG HỢP 2: TÀI KHOẢN CÓ MẬT KHẨU (Đăng nhập SĐT hoặc Gmail)
                Chỉ có duy nhất 1 tab là Đổi mật khẩu
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

  /* Phone Verification Card Styles */
  sectionSubtitle: {
    fontSize: 12.5,
    color: PROFILE_THEME.colors.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },
  phoneSuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  phoneSuccessText: {
    flex: 1,
    fontSize: 13,
    color: '#065F46',
    fontWeight: '600',
  },
  phoneErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  phoneErrorText: {
    flex: 1,
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '500',
  },
  verifiedPhoneContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  verifiedPhoneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  verifiedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  editPhoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  editPhoneBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0284C7',
  },
  phoneDisplayBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  phoneDisplayText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  phoneHintMuted: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  phoneInputSection: {
    marginTop: 4,
  },
  phoneWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginBottom: 14,
  },
  phoneWarningText: {
    flex: 1,
    fontSize: 12.5,
    color: '#B45309',
    lineHeight: 18,
    fontWeight: '500',
  },
  sendOtpButton: {
    backgroundColor: '#0284C7',
    borderRadius: PROFILE_THEME.radius.button,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  sendOtpButtonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  cancelEditBtn: {
    width: 80,
    minHeight: 46,
    borderRadius: PROFILE_THEME.radius.button,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelEditBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  otpVerifyWrap: {
    marginTop: 4,
  },
  resendCodeText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0284C7',
  },
  verifySubmitBtn: {
    flex: 1,
    backgroundColor: '#0284C7',
    borderRadius: PROFILE_THEME.radius.button,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
});

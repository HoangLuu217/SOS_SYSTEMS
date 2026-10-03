import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  Image,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CustomInput } from '../components/CustomInput';
import { useAuth } from '../context/AuthContext';

interface ForgotPasswordModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const { forgotPassword, verifyResetOtp, resetPassword } = useAuth();

  const [step, setStep] = useState<'email' | 'otp' | 'new_password'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(60);

  const otpInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setStep('email');
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setLoading(false);
      setCountdown(60);
    }
  }, [visible]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (step === 'otp' && countdown > 0) {
      timer = setInterval(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [step, countdown]);

  // 1. Gửi mã OTP khôi phục mật khẩu
  const handleSendOtp = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }

    setError('');
    setLoading(true);

    const res = await forgotPassword(cleanEmail);
    setLoading(false);

    if (res.success) {
      setStep('otp');
      setCountdown(60);
      setOtp('');
      setTimeout(() => {
        otpInputRef.current?.focus();
      }, 350);
    } else {
      setError(res.message);
    }
  };

  // 2. Xác thực mã OTP trước khi qua bước nhập mật khẩu mới
  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = (codeToVerify || otp).trim();
    if (code.length < 6) {
      setError('Vui lòng nhập đủ 6 chữ số mã OTP.');
      return;
    }

    setError('');
    setLoading(true);

    const res = await verifyResetOtp(email.trim().toLowerCase(), code);
    setLoading(false);

    if (res.success) {
      setStep('new_password');
      setError('');
    } else {
      setError(res.message || 'Mã OTP không chính xác hoặc đã hết hạn.');
    }
  };

  // Gửi lại mã OTP
  const handleResendOtp = async () => {
    if (countdown > 0 || loading) return;
    setError('');
    setLoading(true);

    const res = await forgotPassword(email.trim().toLowerCase());
    setLoading(false);

    if (res.success) {
      setCountdown(60);
      setOtp('');
      setTimeout(() => {
        otpInputRef.current?.focus();
      }, 200);
    } else {
      setError(res.message);
    }
  };

  // 3. Đặt lại mật khẩu mới
  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp với mật khẩu mới.');
      return;
    }

    setError('');
    setLoading(true);

    const res = await resetPassword(email.trim().toLowerCase(), otp.trim(), newPassword);
    setLoading(false);

    if (res.success) {
      onClose();
      onSuccess(res.message || 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập lại.');
    } else {
      setError(res.message);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardContainer}
          >
            <TouchableWithoutFeedback>
              <View style={styles.card}>
                {/* Header Row: Logo SOS & Close Button */}
                <View style={styles.headerRow}>
                  <View style={styles.logoBadge}>
                    <Image
                      source={require('../../assets/logoSOS.png')}
                      style={styles.logoImage}
                      resizeMode="contain"
                    />
                  </View>
                  <TouchableOpacity
                    onPress={onClose}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Feather name="x" size={20} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                {/* BƯỚC 1: NHẬP EMAIL */}
                {step === 'email' && (
                  <View>
                    <Text style={styles.title}>Quên mật khẩu?</Text>
                    <Text style={styles.subtitle}>
                      Nhập email đăng ký của bạn. Hệ thống SOS sẽ gửi mã OTP 6 số để bạn đặt lại mật khẩu mới.
                    </Text>

                    {error ? <Text style={styles.errorText}>{error}</Text> : null}

                    <CustomInput
                      iconName="mail"
                      placeholder="Nhập địa chỉ email của bạn"
                      value={email}
                      onChangeText={text => {
                        setEmail(text);
                        setError('');
                      }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      returnKeyType="go"
                      onSubmitEditing={handleSendOtp}
                    />

                    <TouchableOpacity
                      style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                      onPress={handleSendOtp}
                      disabled={loading}
                      activeOpacity={0.85}
                    >
                      {loading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <View style={styles.buttonInner}>
                          <Text style={styles.submitText}>Gửi mã OTP khôi phục</Text>
                          <Feather name="arrow-right" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                        </View>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        if (!email.trim()) {
                          setError('Vui lòng nhập email trước.');
                          return;
                        }
                        setError('');
                        setStep('otp');
                      }}
                      style={styles.switchStepLinkWrapper}
                    >
                      <Text style={styles.switchStepLinkText}>
                        Đã có mã xác nhận?{' '}
                        <Text style={styles.switchStepLinkHighlight}>Nhập mã ngay ➔</Text>
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* BƯỚC 2: CHỈ NHẬP VÀ XÁC THỰC MÃ OTP */}
                {step === 'otp' && (
                  <View>
                    <Text style={styles.title}>Xác thực mã OTP</Text>
                    <Text style={styles.subtitle}>
                      Mã OTP 6 số đã được gửi đến:{' '}
                      <Text style={styles.highlightEmail}>{email}</Text>
                      {'\n'}Vui lòng nhập mã để tiếp tục thiết lập mật khẩu mới.
                    </Text>

                    {error ? <Text style={styles.errorText}>{error}</Text> : null}

                    {/* 6 ô hiển thị mã OTP */}
                    <Text style={styles.inputLabel}>Mã xác thực OTP (6 chữ số):</Text>
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => otpInputRef.current?.focus()}
                      style={styles.otpBoxesContainer}
                    >
                      {[0, 1, 2, 3, 4, 5].map(index => {
                        const digit = otp[index] || '';
                        const isCurrent = otp.length === index;
                        return (
                          <View
                            key={index}
                            style={[
                              styles.otpBox,
                              digit ? styles.otpBoxFilled : null,
                              isCurrent ? styles.otpBoxActive : null,
                            ]}
                          >
                            <Text style={styles.otpDigit}>{digit}</Text>
                          </View>
                        );
                      })}
                    </TouchableOpacity>

                    {/* Input ẩn hứng bàn phím */}
                    <TextInput
                      ref={otpInputRef}
                      value={otp}
                      onChangeText={text => {
                        const clean = text.replace(/[^0-9]/g, '').slice(0, 6);
                        setOtp(clean);
                        setError('');
                        if (clean.length === 6) {
                          handleVerifyOtp(clean);
                        }
                      }}
                      keyboardType="number-pad"
                      maxLength={6}
                      style={styles.hiddenInput}
                    />

                    {/* Nút xác thực mã OTP */}
                    <TouchableOpacity
                      style={[
                        styles.submitButton,
                        (loading || otp.length < 6) && styles.submitButtonDisabled,
                      ]}
                      onPress={() => handleVerifyOtp()}
                      disabled={loading || otp.length < 6}
                      activeOpacity={0.85}
                    >
                      {loading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <View style={styles.buttonInner}>
                          <Text style={styles.submitText}>Xác thực mã OTP</Text>
                          <Feather name="check" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Hàng đếm ngược gửi lại & đổi email */}
                    <View style={styles.resendRow}>
                      {countdown > 0 ? (
                        <Text style={styles.countdownText}>
                          Gửi lại mã sau <Text style={{ fontWeight: '700' }}>{countdown}s</Text>
                        </Text>
                      ) : (
                        <TouchableOpacity
                          onPress={handleResendOtp}
                          disabled={loading}
                          activeOpacity={0.7}
                          style={styles.resendButton}
                        >
                          <Feather name="refresh-cw" size={13} color="#0066FF" style={{ marginRight: 4 }} />
                          <Text style={styles.resendText}>Gửi lại mã OTP</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        onPress={() => {
                          setStep('email');
                          setOtp('');
                          setError('');
                        }}
                      >
                        <Text style={styles.changeEmailText}>Đổi email</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* BƯỚC 3: NHẬP MẬT KHẨU MỚI (CHỈ XUẤT HIỆN SAU KHI OTP HỢP LỆ) */}
                {step === 'new_password' && (
                  <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                    <Text style={styles.title}>Thiết lập mật khẩu mới</Text>
                    <Text style={styles.subtitle}>
                      Mã OTP hợp lệ! Hãy tạo mật khẩu mới an toàn cho tài khoản{' '}
                      <Text style={styles.highlightEmail}>{email}</Text>.
                    </Text>

                    {error ? <Text style={styles.errorText}>{error}</Text> : null}

                    {/* Mật khẩu mới */}
                    <CustomInput
                      iconName="lock"
                      placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                      value={newPassword}
                      onChangeText={text => {
                        setNewPassword(text);
                        setError('');
                      }}
                      isPassword
                      returnKeyType="next"
                    />

                    {/* Xác nhận mật khẩu mới */}
                    <CustomInput
                      iconName="shield"
                      placeholder="Xác nhận lại mật khẩu mới"
                      value={confirmPassword}
                      onChangeText={text => {
                        setConfirmPassword(text);
                        setError('');
                      }}
                      isPassword
                      returnKeyType="done"
                      onSubmitEditing={handleResetPassword}
                    />

                    <TouchableOpacity
                      style={[
                        styles.submitButton,
                        styles.submitButtonGreen,
                        loading && styles.submitButtonDisabled,
                      ]}
                      onPress={handleResetPassword}
                      disabled={loading}
                      activeOpacity={0.85}
                    >
                      {loading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <View style={styles.buttonInner}>
                          <Text style={styles.submitText}>Cập nhật mật khẩu mới</Text>
                          <Feather name="check-circle" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                        </View>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        setStep('otp');
                        setError('');
                      }}
                      style={styles.switchStepLinkWrapper}
                    >
                      <Text style={styles.switchStepLinkText}>
                        Quay lại{' '}
                        <Text style={styles.switchStepLinkHighlight}>Bước xác thực mã OTP</Text>
                      </Text>
                    </TouchableOpacity>
                  </ScrollView>
                )}
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  keyboardContainer: {
    width: '100%',
    maxWidth: 420,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 24,
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.25,
        shadowRadius: 18,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  logoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoImage: {
    width: 60,
    height: 42,
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13.5,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 18,
  },
  highlightEmail: {
    fontWeight: '700',
    color: '#0066FF',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    marginBottom: 12,
    fontWeight: '500',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  otpBoxesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  otpBox: {
    width: 44,
    height: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpBoxFilled: {
    borderColor: '#0066FF',
    backgroundColor: '#EFF6FF',
  },
  otpBoxActive: {
    borderColor: '#0066FF',
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  otpDigit: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.01,
  },
  submitButton: {
    backgroundColor: '#0066FF',
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonGreen: {
    backgroundColor: '#10B981',
  },
  submitButtonDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.7,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '700',
  },
  switchStepLinkWrapper: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 4,
  },
  switchStepLinkText: {
    fontSize: 13,
    color: '#64748B',
  },
  switchStepLinkHighlight: {
    color: '#0066FF',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    paddingHorizontal: 4,
  },
  countdownText: {
    fontSize: 13,
    color: '#64748B',
  },
  resendButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resendText: {
    fontSize: 13.5,
    color: '#0066FF',
    fontWeight: '700',
  },
  changeEmailText: {
    fontSize: 13,
    color: '#64748B',
    textDecorationLine: 'underline',
  },
});

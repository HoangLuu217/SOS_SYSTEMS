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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

interface OtpModalProps {
  visible: boolean;
  email: string;
  onClose: () => void;
  onSuccess?: () => void;
  onVerify?: (otpCode: string) => Promise<{ success: boolean; message?: string }>;
}

export const OtpModal: React.FC<OtpModalProps> = ({
  visible,
  email,
  onClose,
  onSuccess,
  onVerify,
}) => {
  const { verifyOtp, sendOtp } = useAuth();

  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(60);

  const otpInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setOtpCode('');
      setError('');
      setLoading(false);
      setCountdown(60);
      setTimeout(() => {
        otpInputRef.current?.focus();
      }, 350);
    }
  }, [visible]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (visible && countdown > 0) {
      timer = setInterval(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [visible, countdown]);

  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = (codeToVerify || otpCode).trim();
    if (code.length < 6) {
      setError('Vui lòng nhập đủ 6 chữ số mã OTP.');
      return;
    }

    setError('');
    setLoading(true);

    if (onVerify) {
      const res = await onVerify(code);
      setLoading(false);

      if (res.success) {
        onClose();
        if (onSuccess) onSuccess();
      } else {
        setError(res.message || 'Mã OTP không chính xác. Vui lòng thử lại.');
      }
      return;
    }

    const res = await verifyOtp(email, code);
    setLoading(false);

    if (res.success) {
      onClose();
      if (onSuccess) onSuccess();
    } else {
      setError(res.message);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || loading) return;
    setError('');
    setLoading(true);

    const res = await sendOtp(email);
    setLoading(false);

    if (res.success) {
      setCountdown(60);
      setOtpCode('');
      setTimeout(() => {
        otpInputRef.current?.focus();
      }, 200);
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

                {/* Tiêu đề & Phụ đề */}
                <Text style={styles.title}>Xác thực Email đăng ký</Text>
                <Text style={styles.subtitle}>
                  Mã OTP 6 số đã được gửi đến:{' '}
                  <Text style={styles.highlightEmail}>{email}</Text>
                  {'\n'}Vui lòng nhập mã để hoàn tất đăng ký tài khoản SOS.
                </Text>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {/* Khung 6 ô hiển thị mã OTP */}
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => otpInputRef.current?.focus()}
                  style={styles.otpBoxesContainer}
                >
                  {[0, 1, 2, 3, 4, 5].map(index => {
                    const digit = otpCode[index] || '';
                    const isCurrent = otpCode.length === index;
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
                  value={otpCode}
                  onChangeText={text => {
                    const clean = text.replace(/[^0-9]/g, '').slice(0, 6);
                    setOtpCode(clean);
                    setError('');
                    if (clean.length === 6) {
                      handleVerifyOtp(clean);
                    }
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={styles.hiddenInput}
                />

                {/* Nút Xác nhận */}
                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    (loading || otpCode.length < 6) && styles.submitButtonDisabled,
                  ]}
                  onPress={() => handleVerifyOtp()}
                  disabled={loading || otpCode.length < 6}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.submitText}>Xác nhận & Hoàn tất</Text>
                  )}
                </TouchableOpacity>

                {/* Đếm ngược gửi lại */}
                <View style={styles.resendRow}>
                  {countdown > 0 ? (
                    <Text style={styles.countdownText}>
                      Gửi lại mã sau <Text style={{ fontWeight: '700' }}>{countdown}s</Text>
                    </Text>
                  ) : (
                    <TouchableOpacity
                      onPress={handleResend}
                      disabled={loading}
                      activeOpacity={0.7}
                      style={styles.resendButton}
                    >
                      <Feather name="refresh-cw" size={13} color="#0066FF" style={{ marginRight: 4 }} />
                      <Text style={styles.resendText}>Gửi lại mã OTP</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
                    <Text style={styles.cancelText}>Hủy bỏ</Text>
                  </TouchableOpacity>
                </View>
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
  otpBoxesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 14,
  },
  otpBox: {
    width: 44,
    height: 52,
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
    marginTop: 10,
  },
  submitButtonDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.7,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '700',
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
  cancelText: {
    fontSize: 13,
    color: '#64748B',
    textDecorationLine: 'underline',
  },
});

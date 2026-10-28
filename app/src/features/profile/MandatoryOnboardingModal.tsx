import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Alert,
  FlatList,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAuth } from '@/context/AuthContext';
import { provinceApi, Province, Ward, FALLBACK_PROVINCES } from '@/api';
import { LogoSOS } from '@/components';
import { useCountdown } from '@/hooks';
import type { UserProfile } from '@/types';

/**
 * Kiểm tra xem người dùng đã có số điện thoại được xác minh hay chưa
 */
export const checkIsPhoneVerified = (user: UserProfile | null): boolean => {
  if (!user) return false;
  // Đã có phone và cờ isPhoneVerified = true
  if (user.phone && user.isPhoneVerified) return true;
  // Đăng ký thông thường bằng số điện thoại (không có googleId, có SĐT hợp lệ >= 10 số)
  if (user.phone && !user.googleId && user.phone.trim().length >= 10) return true;
  return false;
};

/**
 * Kiểm tra xem người dùng đã điền đầy đủ thông tin cá nhân bắt buộc hay chưa:
 * Họ tên, Ngày sinh, Giới tính, Địa chỉ (Tỉnh/Thành phố, Phường/Xã)
 */
export const checkIsProfileComplete = (user: UserProfile | null): boolean => {
  if (!user) return false;

  // 1. Họ và tên hợp lệ (không rỗng, không phải 'Google User')
  const name = user.fullName?.trim() || '';
  if (!name || name.length < 2 || name.toLowerCase() === 'google user') {
    return false;
  }

  // 2. Ngày sinh hợp lệ
  if (!user.dateOfBirth) {
    return false;
  }
  const dobDate = new Date(user.dateOfBirth);
  if (isNaN(dobDate.getTime())) {
    return false;
  }

  // 3. Giới tính hợp lệ (MALE | FEMALE | OTHER)
  if (!user.gender || !['MALE', 'FEMALE', 'OTHER'].includes(user.gender)) {
    return false;
  }

  // 4. Địa chỉ hợp lệ (ít nhất 5 ký tự bao gồm tỉnh/thành, xã/phường)
  const address = user.address?.trim() || '';
  if (!address || address.length < 5) {
    return false;
  }

  return true;
};

// Định dạng ngày hiển thị DD/MM/YYYY
const formatDateDisplay = (val?: any): string => {
  if (!val) return '';
  const str = String(val).trim();
  if (str.includes('/')) return str;
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    }
  } catch { }
  return str.split('T')[0] || str;
};

// Parse chuỗi ngày sinh thành Date cho DatePicker
const parseDateString = (str?: string): Date => {
  if (!str) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 20);
    return d;
  }
  const clean = String(str).trim();
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) return d;
      }
    }
  }
  try {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) return d;
  } catch { }

  const fallback = new Date();
  fallback.setFullYear(fallback.getFullYear() - 20);
  return fallback;
};

// Phân tách địa chỉ nếu đã có
const parseAddressComponents = (addrStr?: string | null) => {
  if (!addrStr || typeof addrStr !== 'string') {
    return { street: '', ward: '', province: '' };
  }
  const parts = addrStr.split(',').map((s) => s.trim());
  if (parts.length >= 3) {
    return {
      street: parts.slice(0, parts.length - 2).join(', '),
      ward: parts[parts.length - 2],
      province: parts[parts.length - 1],
    };
  }
  if (parts.length === 2) {
    return { street: parts[0], ward: '', province: parts[1] };
  }
  return { street: parts[0] || '', ward: '', province: '' };
};

export const MandatoryOnboardingModal: React.FC = () => {
  const { user, sendUserPhoneOtp, verifyUserPhone, updateUserProfile, logout } = useAuth();

  const isPhoneOk = checkIsPhoneVerified(user);
  const isProfileOk = checkIsProfileComplete(user);

  // Chỉ hiển thị modal nếu user đã đăng nhập VÀ (chưa xác minh SĐT HOẶC chưa hoàn tất thông tin cá nhân)
  const isVisible = Boolean(user && (!isPhoneOk || !isProfileOk));

  // Bước hiện tại: 1 = 'PHONE' (xác thực số điện thoại), 2 = 'PROFILE' (thông tin cá nhân)
  const [step, setStep] = useState<'PHONE' | 'PROFILE'>('PHONE');

  useEffect(() => {
    if (!isPhoneOk) {
      setStep('PHONE');
    } else if (!isProfileOk) {
      setStep('PROFILE');
    }
  }, [isPhoneOk, isProfileOk]);

  // ===================== STATE: XÁC THỰC SỐ ĐIỆN THOẠI =====================
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneSuccess, setPhoneSuccess] = useState<string | null>(null);
  const { seconds: countdown, start: startCountdown } = useCountdown({ initialSeconds: 60 });
  const otpInputRef = useRef<any>(null);

  // ===================== STATE: HOÀN THIỆN THÔNG TIN CÁ NHÂN =====================
  const initialAddr = useMemo(() => parseAddressComponents(user?.address), [user?.address]);

  const [fullName, setFullName] = useState(
    user?.fullName && user.fullName !== 'Google User' ? user.fullName : ''
  );
  const [dateOfBirth, setDateOfBirth] = useState(formatDateDisplay(user?.dateOfBirth));
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>(
    (user?.gender as any) || 'MALE'
  );
  const [street, setStreet] = useState(initialAddr.street);
  const [province, setProvince] = useState(initialAddr.province);
  const [ward, setWard] = useState(initialAddr.ward);
  const [selectedProvinceCode, setSelectedProvinceCode] = useState<number | null>(null);

  // Danh sách Tỉnh / Phường
  const [provinceList, setProvinceList] = useState<Province[]>(FALLBACK_PROVINCES);
  const [wardList, setWardList] = useState<Ward[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);
  const [showProvincePicker, setShowProvincePicker] = useState(false);
  const [showWardPicker, setShowWardPicker] = useState(false);
  const [provinceSearch, setProvinceSearch] = useState('');
  const [wardSearch, setWardSearch] = useState('');

  // DatePicker
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(() => parseDateString(dateOfBirth));

  // Form errors
  const [nameError, setNameError] = useState<string | null>(null);
  const [dobError, setDobError] = useState<string | null>(null);
  const [provinceError, setProvinceError] = useState<string | null>(null);
  const [wardError, setWardError] = useState<string | null>(null);
  const [streetError, setStreetError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Tải danh sách tỉnh thành
  useEffect(() => {
    let isMounted = true;
    const loadProvinces = async () => {
      setLoadingProvinces(true);
      try {
        const list = await provinceApi.getProvinces();
        if (isMounted && Array.isArray(list) && list.length > 0) {
          setProvinceList(list);
          const matched = list.find(
            (p) =>
              p.name.toLowerCase().includes(initialAddr.province.toLowerCase()) ||
              initialAddr.province.toLowerCase().includes(p.name.toLowerCase())
          );
          if (matched) {
            setSelectedProvinceCode(matched.code);
          }
        }
      } catch {
      } finally {
        if (isMounted) setLoadingProvinces(false);
      }
    };
    loadProvinces();
    return () => {
      isMounted = false;
    };
  }, [initialAddr.province]);

  // Tải danh sách phường xã khi đã có tỉnh
  useEffect(() => {
    let isMounted = true;
    if (!selectedProvinceCode) {
      setWardList([]);
      return;
    }
    const loadWards = async () => {
      setLoadingWards(true);
      try {
        const wards = await provinceApi.getWards(selectedProvinceCode);
        if (isMounted) setWardList(wards);
      } catch {
      } finally {
        if (isMounted) setLoadingWards(false);
      }
    };
    loadWards();
    return () => {
      isMounted = false;
    };
  }, [selectedProvinceCode]);

  const filteredProvinces = useMemo(() => {
    if (!provinceSearch.trim()) return provinceList;
    const q = provinceSearch.trim().toLowerCase();
    return provinceList.filter((p) => p.name.toLowerCase().includes(q));
  }, [provinceList, provinceSearch]);

  const filteredWards = useMemo(() => {
    if (!wardSearch.trim()) return wardList;
    const q = wardSearch.trim().toLowerCase();
    return wardList.filter((w) => w.name.toLowerCase().includes(q));
  }, [wardList, wardSearch]);

  // ===================== XỬ LÝ: GỬI VÀ XÁC THỰC OTP =====================
  const handleSendPhoneOtp = async () => {
    setPhoneError(null);
    setPhoneSuccess(null);

    const clean = phoneInput.trim().replace(/\s+/g, '');
    const phoneRegex = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$|^\+?[1-9]\d{8,14}$/;

    if (!clean) {
      setPhoneError('Vui lòng nhập số điện thoại của bạn.');
      return;
    }
    if (!phoneRegex.test(clean)) {
      setPhoneError('Số điện thoại không hợp lệ (10 chữ số, ví dụ 0912345678).');
      return;
    }

    setIsSendingOtp(true);
    try {
      const res = await sendUserPhoneOtp(clean);
      if (res.success) {
        setOtpSent(true);
        startCountdown(60);
        setPhoneSuccess(`Mã xác thực OTP đã gửi đến ${clean}.`);
        setTimeout(() => {
          otpInputRef.current?.focus();
        }, 300);
      } else {
        setPhoneError(res.message || 'Không thể gửi mã OTP. Vui lòng kiểm tra lại số điện thoại.');
      }
    } catch (err: any) {
      setPhoneError(err.message || 'Lỗi kết nối khi gửi mã OTP.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyPhoneOtp = async (codeToVerify?: string) => {
    setPhoneError(null);
    setPhoneSuccess(null);

    const cleanPhone = phoneInput.trim().replace(/\s+/g, '');
    const cleanOtp = (codeToVerify || phoneOtpCode).trim();

    if (!cleanOtp || cleanOtp.length < 6) {
      setPhoneError('Vui lòng nhập đủ 6 chữ số mã OTP.');
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const res = await verifyUserPhone(cleanPhone, cleanOtp);
      if (res.success) {
        setPhoneSuccess('Xác thực số điện thoại thành công!');
        // Chuyển sang bước 2: Hoàn thiện hồ sơ cá nhân
        setTimeout(() => {
          setStep('PROFILE');
        }, 500);
      } else {
        setPhoneError(res.message || 'Mã OTP không chính xác hoặc đã hết hạn.');
      }
    } catch (err: any) {
      setPhoneError(err.message || 'Lỗi khi xác thực mã OTP.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // ===================== XỬ LÝ: DATE PICKER =====================
  const handleOpenDatePicker = () => {
    setTempDate(parseDateString(dateOfBirth));
    setShowDatePicker(true);
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'set' && selectedDate) {
        setDateOfBirth(formatDateDisplay(selectedDate));
        setDobError(null);
      }
    } else {
      if (selectedDate) {
        setTempDate(selectedDate);
      }
    }
  };

  const handleConfirmIosDate = () => {
    setDateOfBirth(formatDateDisplay(tempDate));
    setDobError(null);
    setShowDatePicker(false);
  };

  // ===================== XỬ LÝ: LƯU THÔNG TIN CÁ NHÂN =====================
  const handleSaveProfile = async () => {
    let hasError = false;

    // Validate Họ tên
    if (!fullName.trim() || fullName.trim().length < 2) {
      setNameError('Họ và tên phải có ít nhất 2 ký tự.');
      hasError = true;
    } else {
      setNameError(null);
    }

    // Validate Ngày sinh
    if (!dateOfBirth.trim()) {
      setDobError('Vui lòng chọn ngày sinh.');
      hasError = true;
    } else {
      setDobError(null);
    }

    // Validate Tỉnh thành
    if (!province.trim()) {
      setProvinceError('Vui lòng chọn Tỉnh/Thành phố cư trú.');
      hasError = true;
    } else {
      setProvinceError(null);
    }

    // Validate Phường xã
    if (!ward.trim()) {
      setWardError('Vui lòng chọn Phường/Xã.');
      hasError = true;
    } else {
      setWardError(null);
    }

    // Validate Số nhà, tên đường
    if (!street.trim()) {
      setStreetError('Vui lòng nhập địa chỉ cụ thể (số nhà, tên đường/thôn xóm).');
      hasError = true;
    } else {
      setStreetError(null);
    }

    if (hasError) return;

    setIsSavingProfile(true);
    try {
      const addressParts = [street.trim(), ward.trim(), province.trim()].filter(Boolean);
      const formattedAddress = addressParts.join(', ');

      let dobToSend: string | undefined = undefined;
      const cleanDob = dateOfBirth.trim();
      if (cleanDob.includes('/')) {
        const parts = cleanDob.split('/');
        if (parts.length === 3) {
          dobToSend = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      } else {
        dobToSend = cleanDob;
      }

      const res = await updateUserProfile({
        fullName: fullName.trim(),
        dateOfBirth: dobToSend,
        gender,
        address: formattedAddress,
      });

      if (res.success) {
        Alert.alert(
          'Hoàn tất thành công',
          'Thông tin cá nhân của bạn đã được cập nhật đầy đủ. Chào mừng bạn đến với SOS Systems!'
        );
      } else {
        Alert.alert('Lỗi lưu thông tin', res.message || 'Không thể cập nhật hồ sơ vào lúc này.');
      }
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Có lỗi xảy ra khi lưu thông tin.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Đăng xuất nếu người dùng muốn thoát
  const handleLogout = () => {
    Alert.alert(
      'Đăng xuất tài khoản',
      'Bạn có chắc chắn muốn đăng xuất và hoàn tất thông tin sau?',
      [
        { text: 'Tiếp tục điền', style: 'cancel' },
        {
          text: 'Đăng xuất',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  if (!isVisible) return null;

  return (
    <Modal visible={isVisible} animationType="slide" transparent={false} statusBarTranslucent>
      <View style={styles.container}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEnabled={step !== 'PHONE'}
            bounces={false}
            overScrollMode="never"
          >
            {/* Logo SOS thương hiệu nổi bật */}
            <View style={styles.topLogoWrap}>
              <LogoSOS style={styles.logoImage} />
              <Text style={styles.appBrandText}>SOS SYSTEMS</Text>
            </View>

            {/* Thanh tiến trình (Step Progress) */}
            <View style={styles.progressContainer}>
              <View style={[styles.progressStep, step === 'PHONE' && styles.progressStepActive]}>
                <View style={[styles.stepDot, step === 'PHONE' && styles.stepDotActive]}>
                  {isPhoneOk ? (
                    <Feather name="check" size={12} color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.stepDotNum, step === 'PHONE' && styles.stepDotNumActive]}>1</Text>
                  )}
                </View>
                <Text style={[styles.stepLabel, step === 'PHONE' && styles.stepLabelActive]}>
                  Xác thực SĐT
                </Text>
              </View>

              <View style={styles.progressLine} />

              <View style={[styles.progressStep, step === 'PROFILE' && styles.progressStepActive]}>
                <View style={[styles.stepDot, step === 'PROFILE' && styles.stepDotActive]}>
                  <Text style={[styles.stepDotNum, step === 'PROFILE' && styles.stepDotNumActive]}>2</Text>
                </View>
                <Text style={[styles.stepLabel, step === 'PROFILE' && styles.stepLabelActive]}>
                  Thông tin cá nhân
                </Text>
              </View>
            </View>

            {/* ========================================================
                BƯỚC 1: XÁC THỰC SỐ ĐIỆN THOẠI (DÀNH CHO GOOGLE / CHƯA XÁC THỰC SĐT)
               ======================================================== */}
            {step === 'PHONE' && (
              <View style={styles.cardContainer}>
                {!otpSent ? (
                  <>
                    {/* GIAO DIỆN HÌNH 2: NHẬP SỐ ĐIỆN THOẠI */}
                    <View style={styles.cardHeader}>
                      <View style={styles.headerIconWrap}>
                        <Feather name="phone-call" size={24} color="#0066FF" />
                      </View>
                      <Text style={styles.cardTitle}>Xác thực số điện thoại</Text>
                      <Text style={styles.cardSubtitle}>
                        Để bảo vệ an toàn của bạn và lực lượng cứu hộ có thể liên lạc khẩn cấp khi xảy ra thiên tai, vui lòng xác minh số điện thoại cá nhân.
                      </Text>
                    </View>

                    {/* Nhập số điện thoại */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>
                        Số điện thoại <Text style={styles.requiredStar}>*</Text>
                      </Text>
                      <View style={[styles.inputBox, phoneError ? styles.inputBoxError : null]}>
                        <Feather name="phone" size={18} color="#0066FF" style={styles.inputIcon} />
                        <TextInput
                          style={styles.textInput}
                          placeholder="Ví dụ: 0912 345 678"
                          placeholderTextColor="#94A3B8"
                          keyboardType="phone-pad"
                          value={phoneInput}
                          onChangeText={(t) => {
                            setPhoneInput(t);
                            if (phoneError) setPhoneError(null);
                          }}
                          editable={!isSendingOtp}
                        />
                      </View>
                    </View>

                    {phoneError && (
                      <Text style={[styles.errorMessage, { marginBottom: 10 }]}>{phoneError}</Text>
                    )}

                    {/* Nút gửi mã OTP */}
                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        isSendingOtp && styles.disabledButton,
                      ]}
                      onPress={handleSendPhoneOtp}
                      disabled={isSendingOtp}
                      activeOpacity={0.8}
                    >
                      {isSendingOtp ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Gửi mã OTP qua SMS</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {/* CỬA SỔ THAY THẾ: NHẬP MÃ XÁC THỰC OTP 6 SỐ */}
                    <View style={styles.cardHeader}>
                      <View style={[styles.headerIconWrap, { backgroundColor: '#EFF6FF' }]}>
                        <MaterialCommunityIcons name="shield-check-outline" size={26} color="#0066FF" />
                      </View>
                      <Text style={styles.cardTitle}>Xác thực mã OTP</Text>
                      <Text style={styles.cardSubtitle}>
                        Vui lòng nhập mã OTP vừa gửi đến số điện thoại{' '}
                        <Text style={{ fontWeight: '700', color: '#0F172A' }}>{phoneInput.trim()}</Text>
                      </Text>
                    </View>

                    {/* Khung 6 ô hiển thị mã OTP */}
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => otpInputRef.current?.focus()}
                      style={styles.otpBoxesContainer}
                    >
                      {[0, 1, 2, 3, 4, 5].map((index) => {
                        const digit = phoneOtpCode[index] || '';
                        const isCurrent = phoneOtpCode.length === index;
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
                      value={phoneOtpCode}
                      onChangeText={(t) => {
                        const clean = t.replace(/[^0-9]/g, '').slice(0, 6);
                        setPhoneOtpCode(clean);
                        if (phoneError) setPhoneError(null);
                        if (clean.length === 6) {
                          handleVerifyPhoneOtp(clean);
                        }
                      }}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoFocus={true}
                      style={styles.hiddenInput}
                    />

                    {phoneSuccess && <Text style={styles.successMessage}>{phoneSuccess}</Text>}
                    {phoneError && <Text style={styles.errorMessage}>{phoneError}</Text>}

                    {/* Nút xác nhận mã OTP */}
                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        { backgroundColor: '#0066FF', marginTop: 12 },
                        (phoneOtpCode.trim().length !== 6 || isVerifyingOtp) && styles.disabledButton,
                      ]}
                      onPress={() => handleVerifyPhoneOtp()}
                      disabled={phoneOtpCode.trim().length !== 6 || isVerifyingOtp}
                      activeOpacity={0.8}
                    >
                      {isVerifyingOtp ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Xác nhận & Tiếp tục</Text>
                      )}
                    </TouchableOpacity>

                    {/* Row chức năng: Gửi lại mã & Đổi SĐT */}
                    <View style={styles.otpActionRow}>
                      <TouchableOpacity
                        onPress={handleSendPhoneOtp}
                        disabled={countdown > 0 || isSendingOtp}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.resendOtpText,
                            countdown > 0 && styles.resendOtpTextDisabled,
                          ]}
                        >
                          {isSendingOtp
                            ? 'Đang gửi...'
                            : countdown > 0
                            ? `Gửi lại mã (${countdown}s)`
                            : 'Gửi lại mã OTP'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          setOtpSent(false);
                          setPhoneOtpCode('');
                          setPhoneError(null);
                          setPhoneSuccess(null);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.changePhoneText}>Đổi số điện thoại</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* ========================================================
                BƯỚC 2: HOÀN TẤT THÔNG TIN CÁ NHÂN (BẮT BUỘC)
               ======================================================== */}
            {step === 'PROFILE' && (
              <View style={styles.cardContainer}>
                <View style={styles.cardHeader}>
                  <View style={[styles.headerIconWrap, { backgroundColor: '#F0FDF4' }]}>
                    <Feather name="user-check" size={24} color="#16A34A" />
                  </View>
                  <Text style={styles.cardTitle}>Hoàn tất thông tin cá nhân</Text>
                  <Text style={styles.cardSubtitle}>
                    Vui lòng cung cấp đầy đủ thông tin để hoàn thiện hồ sơ ứng cứu khẩn cấp. Mọi thông tin đều bắt buộc.
                  </Text>
                </View>

                {/* 1. Họ và tên */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    Họ và tên <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  <View style={[styles.inputBox, nameError ? styles.inputBoxError : null]}>
                    <Feather name="user" size={18} color="#0066FF" style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Nhập họ và tên đầy đủ..."
                      placeholderTextColor="#94A3B8"
                      value={fullName}
                      onChangeText={(t) => {
                        setFullName(t);
                        if (nameError) setNameError(null);
                      }}
                    />
                  </View>
                  {nameError && <Text style={styles.errorMessage}>{nameError}</Text>}
                </View>

                {/* 2. Ngày sinh */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    Ngày sinh (DD/MM/YYYY) <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={[styles.inputBox, dobError ? styles.inputBoxError : null]}
                    onPress={handleOpenDatePicker}
                    activeOpacity={0.7}
                  >
                    <Feather name="calendar" size={18} color="#0066FF" style={styles.inputIcon} />
                    <Text
                      style={[
                        styles.textInput,
                        styles.selectValueText,
                        !dateOfBirth && styles.placeholderText,
                      ]}
                    >
                      {dateOfBirth || 'Chọn ngày sinh...'}
                    </Text>
                    <Feather name="chevron-down" size={18} color="#64748B" />
                  </TouchableOpacity>
                  {dobError && <Text style={styles.errorMessage}>{dobError}</Text>}
                </View>

                {/* 3. Giới tính */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    Giới tính <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  <View style={styles.genderRow}>
                    {(['MALE', 'FEMALE', 'OTHER'] as const).map((g) => {
                      const isSelected = gender === g;
                      const label = g === 'MALE' ? 'Nam' : g === 'FEMALE' ? 'Nữ' : 'Khác';
                      return (
                        <TouchableOpacity
                          key={g}
                          style={[styles.genderChip, isSelected && styles.genderChipSelected]}
                          onPress={() => setGender(g)}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                            {isSelected && <View style={styles.radioDot} />}
                          </View>
                          <Text style={[styles.genderLabel, isSelected && styles.genderLabelActive]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 4. Tỉnh / Thành phố */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    Tỉnh / Thành phố <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={[styles.inputBox, provinceError ? styles.inputBoxError : null]}
                    onPress={() => setShowProvincePicker(true)}
                    activeOpacity={0.7}
                  >
                    <Feather name="map" size={18} color="#0066FF" style={styles.inputIcon} />
                    <Text
                      style={[
                        styles.textInput,
                        styles.selectValueText,
                        !province && styles.placeholderText,
                      ]}
                    >
                      {province || 'Chọn Tỉnh / Thành phố...'}
                    </Text>
                    <Feather name="chevron-down" size={18} color="#64748B" />
                  </TouchableOpacity>
                  {provinceError && <Text style={styles.errorMessage}>{provinceError}</Text>}
                </View>

                {/* 5. Phường / Xã */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    Phường / Xã <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.inputBox,
                      wardError ? styles.inputBoxError : null,
                      !selectedProvinceCode && styles.disabledInputBox,
                    ]}
                    onPress={() => {
                      if (!selectedProvinceCode) {
                        Alert.alert('Thông báo', 'Vui lòng chọn Tỉnh/Thành phố trước.');
                        return;
                      }
                      setShowWardPicker(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name="compass" size={18} color="#0066FF" style={styles.inputIcon} />
                    <Text
                      style={[
                        styles.textInput,
                        styles.selectValueText,
                        !ward && styles.placeholderText,
                      ]}
                    >
                      {ward || 'Chọn Phường / Xã...'}
                    </Text>
                    <Feather name="chevron-down" size={18} color="#64748B" />
                  </TouchableOpacity>
                  {wardError && <Text style={styles.errorMessage}>{wardError}</Text>}
                </View>

                {/* 6. Địa chỉ cụ thể / Số nhà, tên đường */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    Số nhà, tên đường / Thôn xóm <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  <View style={[styles.inputBox, streetError ? styles.inputBoxError : null]}>
                    <Feather name="map-pin" size={18} color="#0066FF" style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Ví dụ: 120 Hoàng Hoa Thám..."
                      placeholderTextColor="#94A3B8"
                      value={street}
                      onChangeText={(t) => {
                        setStreet(t);
                        if (streetError) setStreetError(null);
                      }}
                    />
                  </View>
                  {streetError && <Text style={styles.errorMessage}>{streetError}</Text>}
                </View>

                {/* Nút Hoàn tất */}
                <TouchableOpacity
                  style={[styles.saveButton, isSavingProfile && styles.disabledButton]}
                  onPress={handleSaveProfile}
                  disabled={isSavingProfile}
                  activeOpacity={0.8}
                >
                  {isSavingProfile ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Feather name="check-circle" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={styles.saveButtonText}>Lưu & Bắt đầu sử dụng</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Thoát / Đăng xuất tài khoản */}
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
              <Feather name="log-out" size={15} color="#EF4444" style={{ marginRight: 6 }} />
              <Text style={styles.logoutBtnText}>Đăng xuất khỏi tài khoản này</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* ===================== MODAL CHỌN TỈNH/THÀNH PHỐ ===================== */}
        <Modal visible={showProvincePicker} animationType="slide" transparent>
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableOpacity
              style={styles.modalDismissArea}
              activeOpacity={1}
              onPress={() => setShowProvincePicker(false)}
            />
            <View style={styles.pickerModalBox}>
              <View style={styles.pickerModalHeader}>
                <Text style={styles.pickerModalTitle}>Chọn Tỉnh / Thành phố</Text>
                <TouchableOpacity onPress={() => setShowProvincePicker(false)}>
                  <Feather name="x" size={22} color="#0F172A" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalSearchBox}>
                <Feather name="search" size={16} color="#64748B" />
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Tìm kiếm tỉnh/thành..."
                  placeholderTextColor="#94A3B8"
                  value={provinceSearch}
                  onChangeText={setProvinceSearch}
                  autoCapitalize="none"
                />
                {provinceSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setProvinceSearch('')}>
                    <Feather name="x-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              <FlatList
                data={filteredProvinces}
                keyExtractor={(item) => String(item.code)}
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.pickerItem,
                      item.name === province && styles.pickerItemSelected,
                    ]}
                    onPress={() => {
                      setProvince(item.name);
                      setSelectedProvinceCode(item.code);
                      setProvinceError(null);
                      setShowProvincePicker(false);
                      setProvinceSearch('');
                      if (item.code !== selectedProvinceCode) {
                        setWard('');
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.pickerItemText,
                        item.name === province && styles.pickerItemTextSelected,
                      ]}
                    >
                      {item.name}
                    </Text>
                    {item.name === province && <Feather name="check" size={18} color="#0066FF" />}
                  </TouchableOpacity>
                )}
              />
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ===================== MODAL CHỌN PHƯỜNG/XÃ ===================== */}
        <Modal visible={showWardPicker} animationType="slide" transparent>
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableOpacity
              style={styles.modalDismissArea}
              activeOpacity={1}
              onPress={() => setShowWardPicker(false)}
            />
            <View style={styles.pickerModalBox}>
              <View style={styles.pickerModalHeader}>
                <Text style={styles.pickerModalTitle}>Chọn Phường / Xã</Text>
                <TouchableOpacity onPress={() => setShowWardPicker(false)}>
                  <Feather name="x" size={22} color="#0F172A" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalSearchBox}>
                <Feather name="search" size={16} color="#64748B" />
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Tìm kiếm phường/xã..."
                  placeholderTextColor="#94A3B8"
                  value={wardSearch}
                  onChangeText={setWardSearch}
                  autoCapitalize="none"
                />
                {wardSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setWardSearch('')}>
                    <Feather name="x-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              {loadingWards ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#0066FF" />
                  <Text style={{ marginTop: 10, color: '#64748B', fontSize: 13 }}>
                    Đang tải danh sách xã/phường...
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredWards}
                  keyExtractor={(item) => String(item.code)}
                  style={{ flex: 1 }}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.pickerItem,
                        item.name === ward && styles.pickerItemSelected,
                      ]}
                      onPress={() => {
                        setWard(item.name);
                        setWardError(null);
                        setShowWardPicker(false);
                        setWardSearch('');
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerItemText,
                          item.name === ward && styles.pickerItemTextSelected,
                        ]}
                      >
                        {item.name}
                      </Text>
                      {item.name === ward && <Feather name="check" size={18} color="#0066FF" />}
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ===================== DATE PICKER NATIVE / MODAL ===================== */}
        {showDatePicker && (
          Platform.OS === 'ios' ? (
            <Modal visible={showDatePicker} transparent animationType="fade">
              <View style={styles.datePickerOverlay}>
                <View style={styles.datePickerSheet}>
                  <View style={styles.datePickerHeader}>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Text style={styles.datePickerCancelText}>Huỷ</Text>
                    </TouchableOpacity>
                    <Text style={styles.datePickerTitle}>Chọn ngày sinh</Text>
                    <TouchableOpacity onPress={handleConfirmIosDate}>
                      <Text style={styles.datePickerDoneText}>Xong</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={tempDate}
                    mode="date"
                    display="spinner"
                    onChange={handleDateChange}
                    maximumDate={new Date()}
                    locale="vi"
                    textColor="#0F172A"
                  />
                </View>
              </View>
            </Modal>
          ) : (
            <DateTimePicker
              value={tempDate}
              mode="date"
              display="default"
              onChange={handleDateChange}
              maximumDate={new Date()}
            />
          )
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 40,
    paddingHorizontal: 18,
  },
  topLogoWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoImage: {
    width: 68,
    height: 68,
  },
  appBrandText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 6,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  progressStep: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    opacity: 0.5,
  },
  progressStepActive: {
    opacity: 1,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: '#0066FF',
  },
  stepDotNum: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  stepDotNumActive: {
    color: '#FFFFFF',
  },
  stepLabel: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  stepLabelActive: {
    color: '#FFFFFF',
  },
  progressLine: {
    width: 36,
    height: 2,
    backgroundColor: '#334155',
    marginHorizontal: 12,
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  cardHeader: {
    alignItems: 'center',
    marginBottom: 22,
  },
  headerIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  requiredStar: {
    color: '#EF4444',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  inputBoxError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  disabledInputBox: {
    backgroundColor: '#F1F5F9',
    opacity: 0.7,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14.5,
    color: '#0F172A',
    paddingVertical: 10,
  },
  selectValueText: {
    paddingVertical: 14,
  },
  placeholderText: {
    color: '#94A3B8',
  },
  primaryButton: {
    backgroundColor: '#0066FF',
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
  otpBoxesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 16,
  },
  otpBox: {
    width: 44,
    height: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
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
  verifyButton: {
    backgroundColor: '#16A34A',
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  successMessage: {
    color: '#16A34A',
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 8,
  },
  errorMessage: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  otpActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingHorizontal: 4,
  },
  resendOtpText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0066FF',
  },
  resendOtpTextDisabled: {
    color: '#94A3B8',
    fontWeight: '500',
  },
  changePhoneText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textDecorationLine: 'underline',
  },
  genderRow: {
    flexDirection: 'row',
    gap: 10,
  },
  genderChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 12,
  },
  genderChipSelected: {
    borderColor: '#0066FF',
    backgroundColor: '#EFF6FF',
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#0066FF',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0066FF',
  },
  genderLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  genderLabelActive: {
    color: '#0066FF',
    fontWeight: '700',
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#0066FF',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '700',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    marginTop: 10,
  },
  logoutBtnText: {
    color: '#F87171',
    fontSize: 13.5,
    fontWeight: '600',
  },
  // Modal chọn địa chỉ
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  pickerModalBox: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: Platform.OS === 'ios' ? 460 : 480,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickerModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  pickerItemSelected: {
    backgroundColor: '#F0F9FF',
  },
  pickerItemText: {
    fontSize: 14.5,
    color: '#334155',
  },
  pickerItemTextSelected: {
    color: '#0066FF',
    fontWeight: '700',
  },
  // Date Picker iOS modal
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  datePickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  datePickerCancelText: {
    fontSize: 15,
    color: '#64748B',
  },
  datePickerDoneText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0066FF',
  },
});

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  Image,
  ActivityIndicator,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Alert,
  TouchableWithoutFeedback,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { PROFILE_THEME } from './theme';
import { useAuth } from '@/context/AuthContext';
import { provinceApi, Province, Ward, FALLBACK_PROVINCES } from '@/api';

interface EditProfileScreenProps {
  onBack: () => void;
}

// Hàm format ngày sinh đẹp mắt dạng DD/MM/YYYY
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
  } catch {}
  return str.split('T')[0] || str;
};

// Hàm parse chuỗi ngày sinh (DD/MM/YYYY hoặc ISO) thành Date object cho DatePicker
const parseDateString = (str?: string): Date => {
  if (!str) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 20); // Mặc định 20 tuổi
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
  } catch {}

  const fallback = new Date();
  fallback.setFullYear(fallback.getFullYear() - 20);
  return fallback;
};

// Hàm phân tách chuỗi địa chỉ
const parseAddressComponents = (addrStr?: string | any) => {
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

export const EditProfileScreen: React.FC<EditProfileScreenProps> = ({ onBack }) => {
  const { user, updateUserProfile, updateUserAvatar } = useAuth();

  // Chế độ màn hình: false = Xem thông tin (Mặc định khi vào), true = Chỉnh sửa
  const [isEditing, setIsEditing] = useState(false);

  // Vai trò hệ thống
  const isRescuer =
    Boolean(user?.roles?.includes('RESCUER')) ||
    Boolean(user?.roles?.includes('LEADER'));
  const roleName = isRescuer
    ? (user?.roles?.includes('LEADER') ? 'Đội trưởng cứu hộ' : 'Nhân viên cứu hộ')
    : 'Người dân';

  // Lấy dữ liệu địa chỉ ban đầu
  const initialAddr = useMemo(() => parseAddressComponents(user?.address), [user?.address]);

  // Form states
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [dateOfBirth, setDateOfBirth] = useState(formatDateDisplay(user?.dateOfBirth));
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>((user?.gender as any) || 'MALE');
  const [street, setStreet] = useState(initialAddr.street);
  const [province, setProvince] = useState(initialAddr.province);
  const [ward, setWard] = useState(initialAddr.ward);
  const [selectedProvinceCode, setSelectedProvinceCode] = useState<number | null>(null);

  // Đồng bộ lại khi user thay đổi
  useEffect(() => {
    if (user) {
      setFullName(user.fullName || '');
      setDateOfBirth(formatDateDisplay(user.dateOfBirth));
      setGender((user.gender as any) || 'MALE');
      const addr = parseAddressComponents(user.address);
      setStreet(addr.street);
      setProvince(addr.province);
      setWard(addr.ward);
    }
  }, [user]);

  // Danh sách API Tỉnh / Phường
  const [provinceList, setProvinceList] = useState<Province[]>(FALLBACK_PROVINCES);
  const [wardList, setWardList] = useState<Ward[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);

  // Modal chọn địa chỉ
  const [showProvincePicker, setShowProvincePicker] = useState(false);
  const [showWardPicker, setShowWardPicker] = useState(false);
  const [provinceSearch, setProvinceSearch] = useState('');
  const [wardSearch, setWardSearch] = useState('');

  // DatePicker chọn ngày sinh
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(() => parseDateString(dateOfBirth));

  // Mở DatePicker
  const handleOpenDatePicker = () => {
    setTempDate(parseDateString(dateOfBirth));
    setShowDatePicker(true);
  };

  // Thay đổi ngày trong DatePicker
  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'set' && selectedDate) {
        setDateOfBirth(formatDateDisplay(selectedDate));
      }
    } else {
      if (selectedDate) {
        setTempDate(selectedDate);
      }
    }
  };

  // Xác nhận chọn ngày trên iOS modal
  const handleConfirmIosDate = () => {
    setDateOfBirth(formatDateDisplay(tempDate));
    setShowDatePicker(false);
  };

  // Lỗi xác thực
  const [nameError, setNameError] = useState<string | null>(null);
  const [provinceError, setProvinceError] = useState<string | null>(null);
  const [wardError, setWardError] = useState<string | null>(null);
  const [streetError, setStreetError] = useState<string | null>(null);

  // Lưu & Phản hồi
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Avatar states
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(user?.avatarUrl || null);
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  // Tải danh sách tỉnh thành
  useEffect(() => {
    let isMounted = true;
    const fetchProvinces = async () => {
      setLoadingProvinces(true);
      try {
        const list = await provinceApi.getProvinces();
        if (isMounted && Array.isArray(list) && list.length > 0) {
          setProvinceList(list);
          const matched = list.find((p) =>
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
    fetchProvinces();
    return () => {
      isMounted = false;
    };
  }, [initialAddr.province]);

  // Tải danh sách phường xã khi đã có mã tỉnh
  useEffect(() => {
    let isMounted = true;
    if (!selectedProvinceCode) {
      setWardList([]);
      return;
    }
    const fetchWards = async () => {
      setLoadingWards(true);
      try {
        const wards = await provinceApi.getWards(selectedProvinceCode);
        if (isMounted) setWardList(wards);
      } catch {
      } finally {
        if (isMounted) setLoadingWards(false);
      }
    };
    fetchWards();
    return () => {
      isMounted = false;
    };
  }, [selectedProvinceCode]);

  // Lọc tìm kiếm
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

  // Kiểm tra có thay đổi chưa lưu
  const hasUnsavedChanges =
    fullName !== (user?.fullName || '') ||
    dateOfBirth !== formatDateDisplay(user?.dateOfBirth) ||
    gender !== (user?.gender || 'MALE') ||
    province !== initialAddr.province ||
    ward !== initialAddr.ward ||
    street !== initialAddr.street;

  // Xử lý nút Back
  const handlePressBack = () => {
    if (isEditing) {
      handleCancelEdit();
    } else {
      onBack();
    }
  };

  // Huỷ chỉnh sửa
  const handleCancelEdit = () => {
    if (hasUnsavedChanges) {
      Alert.alert(
        'Huỷ thay đổi?',
        'Các thông tin bạn vừa chỉnh sửa chưa được lưu sẽ bị huỷ bỏ.',
        [
          { text: 'Tiếp tục sửa', style: 'cancel' },
          {
            text: 'Huỷ bỏ',
            style: 'destructive',
            onPress: () => {
              setFullName(user?.fullName || '');
              setDateOfBirth(formatDateDisplay(user?.dateOfBirth));
              setGender((user?.gender as any) || 'MALE');
              setStreet(initialAddr.street);
              setProvince(initialAddr.province);
              setWard(initialAddr.ward);
              setNameError(null);
              setProvinceError(null);
              setWardError(null);
              setStreetError(null);
              setIsEditing(false);
            },
          },
        ]
      );
    } else {
      setIsEditing(false);
    }
  };

  // Chọn Tỉnh
  const handleSelectProvince = (item: Province) => {
    setProvince(item.name);
    setSelectedProvinceCode(item.code);
    setProvinceError(null);
    setShowProvincePicker(false);
    setProvinceSearch('');
    if (item.code !== selectedProvinceCode) {
      setWard('');
    }
  };

  // Chọn Phường
  const handleSelectWard = (item: Ward) => {
    setWard(item.name);
    setWardError(null);
    setShowWardPicker(false);
    setWardSearch('');
  };

  // Avatar từ thư viện ảnh
  const handlePickAvatar = async () => {
    setAvatarSheetVisible(false);
    setTimeout(async () => {
      try {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Quyền truy cập', 'Vui lòng cấp quyền thư viện ảnh.');
          return;
        }
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.5,
          base64: true,
        });

        if (!res.canceled && res.assets && res.assets[0]?.uri) {
          const asset = res.assets[0];
          setSelectedAvatarUrl(asset.uri);
          setIsSavingAvatar(true);
          const avatarPayload = asset.base64
            ? `data:image/jpeg;base64,${asset.base64}`
            : asset.uri;
          const result = await updateUserAvatar(avatarPayload);
          setIsSavingAvatar(false);
          if (result && !result.success) {
            Alert.alert('Thông báo', result.message || 'Chưa thể tải ảnh lên máy chủ.');
          } else if (result && result.success) {
            Alert.alert('Thành công', 'Đã cập nhật ảnh đại diện mới!');
          }
        }
      } catch {
        setIsSavingAvatar(false);
        Alert.alert('Lỗi', 'Không thể chọn ảnh từ thiết bị.');
      }
    }, 350);
  };

  // Avatar từ máy ảnh
  const handleTakeAvatar = async () => {
    setAvatarSheetVisible(false);
    setTimeout(async () => {
      try {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Quyền truy cập', 'Vui lòng cấp quyền máy ảnh.');
          return;
        }
        const res = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.5,
          base64: true,
        });

        if (!res.canceled && res.assets && res.assets[0]?.uri) {
          const asset = res.assets[0];
          setSelectedAvatarUrl(asset.uri);
          setIsSavingAvatar(true);
          const avatarPayload = asset.base64
            ? `data:image/jpeg;base64,${asset.base64}`
            : asset.uri;
          const result = await updateUserAvatar(avatarPayload);
          setIsSavingAvatar(false);
          if (result && !result.success) {
            Alert.alert('Thông báo', result.message || 'Chưa thể tải ảnh lên máy chủ.');
          } else if (result && result.success) {
            Alert.alert('Thành công', 'Đã cập nhật ảnh đại diện mới!');
          }
        }
      } catch {
        setIsSavingAvatar(false);
        Alert.alert('Lỗi', 'Không thể chụp ảnh mới.');
      }
    }, 350);
  };

  // Lưu thông tin người dùng
  const handleSave = async () => {
    let isValid = true;

    if (!fullName.trim() || fullName.trim().length < 2) {
      setNameError('Họ và tên phải có ít nhất 2 ký tự');
      isValid = false;
    } else {
      setNameError(null);
    }

    // Địa chỉ là tuỳ chọn - không bắt buộc phải nhập đủ 3 cấp để tránh chặn lưu hồ sơ
    setProvinceError(null);
    setWardError(null);
    setStreetError(null);

    if (!isValid) return;

    setIsSaving(true);
    try {
      // Định dạng địa chỉ linh hoạt từ các phần đã chọn/nhập
      const addressParts = [street.trim(), ward.trim(), province.trim()].filter(Boolean);
      const formattedAddress = addressParts.length > 0 
        ? addressParts.join(', ') 
        : (user?.address || undefined);

      // Định dạng ngày sinh gửi lên backend
      let dobToSend: string | undefined = undefined;
      const cleanDob = dateOfBirth.trim();
      if (cleanDob) {
        if (cleanDob.includes('/')) {
          const parts = cleanDob.split('/');
          if (parts.length === 3) {
            dobToSend = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          } else {
            dobToSend = cleanDob;
          }
        } else {
          dobToSend = cleanDob;
        }
      }

      const res = await updateUserProfile({
        fullName: fullName.trim(),
        gender,
        dateOfBirth: dobToSend,
        address: formattedAddress,
      });

      setIsSaving(false);

      if (res && res.success) {
        setShowSuccessModal(true);
        setIsEditing(false); // Trở về chế độ xem thông tin
      } else {
        Alert.alert('Thất bại', res?.message || 'Không thể lưu thay đổi vào lúc này.');
      }
    } catch (err: any) {
      setIsSaving(false);
      Alert.alert('Lỗi', err.message || 'Không thể lưu thay đổi vào lúc này.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top App Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handlePressBack}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name={isEditing ? 'x' : 'arrow-left'} size={22} color="#0F172A" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {isEditing ? 'Chỉnh sửa thông tin' : 'Thông tin cá nhân'}
        </Text>

        {isEditing ? (
          <TouchableOpacity
            style={styles.headerTextBtn}
            onPress={handleCancelEdit}
            activeOpacity={0.7}
          >
            <Text style={styles.headerCancelText}>Huỷ</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.headerEditBtn}
            onPress={() => setIsEditing(true)}
            activeOpacity={0.7}
          >
            <Feather name="edit-2" size={16} color="#0066FF" />
            <Text style={styles.headerEditText}>Sửa</Text>
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ========================================================
              CHẾ ĐỘ 1: XEM THÔNG TIN CÁ NHÂN (VIEW MODE - MẶC ĐỊNH)
             ======================================================== */}
          {!isEditing ? (
            <View style={{ gap: 14 }}>
              {/* Card Avatar & Header xem */}
              <View style={styles.viewAvatarCard}>
                <View style={styles.avatarWrap}>
                  {selectedAvatarUrl ? (
                    <Image source={{ uri: selectedAvatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarInitial}>
                        {fullName.trim().charAt(fullName.trim().lastIndexOf(' ') + 1) || 'A'}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.viewFullName}>{fullName || user?.fullName || 'Người dùng'}</Text>
                <View style={styles.badgeRow}>
                  <View style={styles.activePill}>
                    <View style={styles.activeDot} />
                    <Text style={styles.activePillText}>Đang hoạt động</Text>
                  </View>
                  <View style={styles.rolePill}>
                    <Text style={styles.rolePillText}>{roleName}</Text>
                  </View>
                </View>
              </View>

              {/* Card: Thông tin cơ bản */}
              <View style={styles.card}>
                <View style={styles.cardTitleRow}>
                  <Feather name="user" size={17} color="#0066FF" />
                  <Text style={styles.cardTitle}>Thông tin cơ bản</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Họ và tên</Text>
                  <Text style={styles.infoValue}>{user?.fullName || 'Chưa cập nhật'}</Text>
                </View>

                <View style={styles.infoDivider} />

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Ngày sinh</Text>
                  <Text style={styles.infoValue}>
                    {formatDateDisplay(user?.dateOfBirth) || 'Chưa cập nhật'}
                  </Text>
                </View>

                <View style={styles.infoDivider} />

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Giới tính</Text>
                  <Text style={styles.infoValue}>
                    {user?.gender === 'MALE'
                      ? 'Nam'
                      : user?.gender === 'FEMALE'
                      ? 'Nữ'
                      : user?.gender === 'OTHER'
                      ? 'Khác'
                      : 'Chưa cập nhật'}
                  </Text>
                </View>

                <View style={styles.infoDivider} />

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Số điện thoại</Text>
                  <Text style={styles.infoValue}>{user?.phone || 'Chưa cập nhật SĐT'}</Text>
                </View>

                <View style={styles.infoDivider} />

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>{user?.email || 'Chưa có email'}</Text>
                </View>
              </View>

              {/* Card: Địa chỉ thường trú */}
              <View style={styles.card}>
                <View style={styles.cardTitleRow}>
                  <Feather name="map-pin" size={17} color="#0066FF" />
                  <Text style={styles.cardTitle}>Địa chỉ thường trú</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Tỉnh / Thành phố</Text>
                  <Text style={styles.infoValue}>{initialAddr.province || 'Chưa chọn'}</Text>
                </View>

                <View style={styles.infoDivider} />

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Phường / Xã</Text>
                  <Text style={styles.infoValue}>{initialAddr.ward || 'Chưa chọn'}</Text>
                </View>

                <View style={styles.infoDivider} />

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Địa chỉ chi tiết</Text>
                  <Text style={styles.infoValue}>{initialAddr.street || 'Chưa nhập'}</Text>
                </View>

                {user?.address ? (
                  <>
                    <View style={styles.infoDivider} />
                    <View style={styles.addressSummaryCard}>
                      <Feather name="check-circle" size={14} color="#059669" />
                      <Text style={styles.addressSummaryText}>
                        Địa chỉ đầy đủ: <Text style={styles.addressSummaryBold}>{user.address}</Text>
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>

              {/* Nút lớn: Chỉnh sửa thông tin */}
              <TouchableOpacity
                style={styles.editButtonBig}
                onPress={() => setIsEditing(true)}
                activeOpacity={0.85}
              >
                <Feather name="edit-3" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.editButtonBigText}>Chỉnh sửa thông tin</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ========================================================
               CHẾ ĐỘ 2: BIỂU MẪU CHỈNH SỬA THÔNG TIN (EDIT MODE)
               ======================================================== */
            <View style={{ gap: 14 }}>
              {/* Card Avatar Editing */}
              <View style={styles.avatarCard}>
                <View style={styles.avatarWrap}>
                  {selectedAvatarUrl ? (
                    <Image source={{ uri: selectedAvatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarInitial}>
                        {fullName.trim().charAt(fullName.trim().lastIndexOf(' ') + 1) || 'A'}
                      </Text>
                    </View>
                  )}

                  {isSavingAvatar && (
                    <View style={styles.avatarSavingOverlay}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.cameraBadge}
                    onPress={() => setAvatarSheetVisible(true)}
                    activeOpacity={0.8}
                  >
                    <Feather name="camera" size={15} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.avatarNameText}>{fullName || 'Nguyễn Minh An'}</Text>
                <Text style={styles.avatarSubText}>Chạm vào máy ảnh để đổi ảnh đại diện</Text>
              </View>

              {/* Card: Thông tin cơ bản */}
              <View style={styles.card}>
                <View style={styles.cardTitleRow}>
                  <Feather name="user" size={17} color="#0066FF" />
                  <Text style={styles.cardTitle}>Thông tin cơ bản</Text>
                </View>

                {/* Họ và tên */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    Họ và tên <Text style={styles.requiredMark}>*</Text>
                  </Text>
                  <View style={[styles.inputBox, nameError ? styles.inputBoxError : null]}>
                    <Feather name="user-check" size={17} color="#64748B" style={styles.fieldIcon} />
                    <TextInput
                      style={styles.textInput}
                      value={fullName}
                      onChangeText={(t) => {
                        setFullName(t);
                        if (nameError) setNameError(null);
                      }}
                      placeholder="Nhập họ và tên..."
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                  {nameError && <Text style={styles.errorText}>{nameError}</Text>}
                </View>

                {/* Ngày sinh */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Ngày sinh (DD/MM/YYYY)</Text>
                  <TouchableOpacity
                    style={styles.selectBox}
                    onPress={handleOpenDatePicker}
                    activeOpacity={0.7}
                  >
                    <View style={styles.selectContentLeft}>
                      <Feather name="calendar" size={17} color="#0066FF" style={styles.fieldIcon} />
                      <Text
                        style={[
                          styles.selectText,
                          !dateOfBirth && styles.selectTextPlaceholder,
                        ]}
                      >
                        {dateOfBirth || 'Chọn ngày sinh...'}
                      </Text>
                    </View>
                    <Feather name="chevron-down" size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* Giới tính */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Giới tính</Text>
                  <View style={styles.genderRow}>
                    {(['MALE', 'FEMALE', 'OTHER'] as const).map((g) => {
                      const isSelected = gender === g;
                      const label = g === 'MALE' ? 'Nam' : g === 'FEMALE' ? 'Nữ' : 'Khác';
                      return (
                        <TouchableOpacity
                          key={g}
                          style={[styles.genderOption, isSelected && styles.genderOptionActive]}
                          onPress={() => setGender(g)}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                            {isSelected && <View style={styles.radioDot} />}
                          </View>
                          <Text style={[styles.genderText, isSelected && styles.genderTextActive]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* Card: Địa chỉ thường trú */}
              <View style={styles.card}>
                <View style={styles.cardTitleRow}>
                  <Feather name="map-pin" size={17} color="#0066FF" />
                  <Text style={styles.cardTitle}>Địa chỉ thường trú</Text>
                </View>

                {/* 1. Tỉnh / Thành phố */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    Tỉnh / Thành phố <Text style={styles.requiredMark}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={[styles.selectBox, provinceError ? styles.inputBoxError : null]}
                    onPress={() => setShowProvincePicker(true)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.selectContentLeft}>
                      <Feather name="map-pin" size={17} color="#0066FF" style={styles.fieldIcon} />
                      <Text style={[styles.selectText, !province && styles.selectTextPlaceholder]}>
                        {province || 'Chọn Tỉnh / Thành phố...'}
                      </Text>
                    </View>
                    <Feather name="chevron-down" size={18} color="#64748B" />
                  </TouchableOpacity>
                  {provinceError && <Text style={styles.errorText}>{provinceError}</Text>}
                </View>

                {/* 2. Phường / Xã */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Phường / Xã</Text>
                  <TouchableOpacity
                    style={[styles.selectBox, wardError ? styles.inputBoxError : null]}
                    onPress={() => {
                      if (!selectedProvinceCode) {
                        setProvinceError('Vui lòng chọn Tỉnh / Thành phố trước');
                        return;
                      }
                      setShowWardPicker(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.selectContentLeft}>
                      <Feather name="navigation" size={17} color="#2563EB" style={styles.fieldIcon} />
                      <Text style={[styles.selectText, !ward && styles.selectTextPlaceholder]}>
                        {ward || (selectedProvinceCode ? 'Chọn Phường / Xã...' : 'Vui lòng chọn Tỉnh / TP trước')}
                      </Text>
                    </View>
                    <Feather name="chevron-down" size={18} color="#64748B" />
                  </TouchableOpacity>
                  {wardError && <Text style={styles.errorText}>{wardError}</Text>}
                </View>

                {/* 3. Địa chỉ cụ thể */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Địa chỉ chi tiết (Số nhà, tên đường)</Text>
                  <View style={[styles.inputBox, streetError ? styles.inputBoxError : null]}>
                    <Feather name="home" size={17} color="#64748B" style={styles.fieldIcon} />
                    <TextInput
                      style={styles.textInput}
                      value={street}
                      onChangeText={(t) => {
                        setStreet(t);
                        if (streetError) setStreetError(null);
                      }}
                      placeholder="VD: 128 Nguyễn Du"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                  {streetError && <Text style={styles.errorText}>{streetError}</Text>}
                </View>

                {province && ward && street ? (
                  <View style={styles.addressSummaryCard}>
                    <Feather name="check-circle" size={14} color="#059669" />
                    <Text style={styles.addressSummaryText}>
                      Địa chỉ lưu: <Text style={styles.addressSummaryBold}>{`${street}, ${ward}, ${province}`}</Text>
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Nhóm nút hành động: Huỷ & Lưu */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={handleCancelEdit}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText}>Huỷ bỏ</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveBtn, isSaving && { opacity: 0.7 }]}
                  onPress={handleSave}
                  disabled={isSaving}
                  activeOpacity={0.8}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <View style={styles.btnRow}>
                      <Feather name="check" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.saveBtnText}>Lưu thay đổi</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ========================================================
          MODAL: CHỌN NGÀY SINH (DATE PICKER)
         ======================================================== */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <View style={styles.datePickerBackdrop}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setShowDatePicker(false)}
            />
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerHeader}>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(false)}
                  style={styles.datePickerHeaderBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.datePickerCancelText}>Huỷ</Text>
                </TouchableOpacity>
                <Text style={styles.datePickerTitle}>Chọn ngày sinh</Text>
                <TouchableOpacity
                  onPress={handleConfirmIosDate}
                  style={styles.datePickerHeaderBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.datePickerDoneText}>Xong</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.datePickerWheelWrap}>
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  minimumDate={new Date(1920, 0, 1)}
                  onChange={handleDateChange}
                  locale="vi-VN"
                  textColor="#0F172A"
                  themeVariant="light"
                />
              </View>
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display="default"
          maximumDate={new Date()}
          minimumDate={new Date(1920, 0, 1)}
          onChange={handleDateChange}
        />
      )}

      {/* ========================================================
          MODAL 1: CHỌN TỈNH / THÀNH PHỐ
         ======================================================== */}
      {/* ========================================================
          MODAL 1: CHỌN TỈNH / THÀNH PHỐ
         ======================================================== */}
      <Modal
        visible={showProvincePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProvincePicker(false)}
      >
        <KeyboardAvoidingView
          style={styles.pickerModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={styles.modalDismissArea}
            activeOpacity={1}
            onPress={() => setShowProvincePicker(false)}
          />
          <View style={styles.pickerModalCard}>
            <View style={styles.sheetHandle} />

            <View style={styles.pickerHeaderRow}>
              <View>
                <Text style={styles.pickerTitle}>Chọn Tỉnh / Thành phố</Text>
                <Text style={styles.pickerSubtitle}>Dữ liệu chuẩn hành chính Việt Nam</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowProvincePicker(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.pickerCloseBtn}
              >
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Search Bar */}
            <View style={styles.searchBar}>
              <Feather name="search" size={16} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Tìm tên tỉnh, thành phố..."
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

            {loadingProvinces ? (
              <View style={styles.pickerLoadingWrap}>
                <ActivityIndicator size="small" color="#0066FF" />
                <Text style={styles.pickerLoadingText}>Đang tải danh sách tỉnh thành...</Text>
              </View>
            ) : (
              <FlatList
                data={filteredProvinces}
                keyExtractor={(item) => item.code.toString()}
                style={styles.pickerList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                renderItem={({ item }) => {
                  const isSelected = item.name === province;
                  return (
                    <TouchableOpacity
                      style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                      onPress={() => handleSelectProvince(item)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.pickerItemText,
                          isSelected && styles.pickerItemTextActive,
                        ]}
                      >
                        {item.name}
                      </Text>
                      {isSelected && <Feather name="check" size={18} color="#0066FF" />}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ========================================================
          MODAL 2: CHỌN PHƯỜNG / XÃ
         ======================================================== */}
      <Modal
        visible={showWardPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWardPicker(false)}
      >
        <KeyboardAvoidingView
          style={styles.pickerModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={styles.modalDismissArea}
            activeOpacity={1}
            onPress={() => setShowWardPicker(false)}
          />
          <View style={styles.pickerModalCard}>
            <View style={styles.sheetHandle} />

            <View style={styles.pickerHeaderRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.pickerTitle}>Chọn Phường / Xã</Text>
                <Text style={styles.pickerSubtitle} numberOfLines={1}>
                  Trực thuộc: {province}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowWardPicker(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.pickerCloseBtn}
              >
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Search Bar */}
            <View style={styles.searchBar}>
              <Feather name="search" size={16} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Tìm tên phường, xã..."
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
              <View style={styles.pickerLoadingWrap}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={styles.pickerLoadingText}>Đang tải danh sách phường xã...</Text>
              </View>
            ) : filteredWards.length === 0 ? (
              <View style={styles.pickerEmptyWrap}>
                <Feather name="inbox" size={32} color="#94A3B8" style={{ marginBottom: 6 }} />
                <Text style={styles.pickerEmptyText}>Không tìm thấy phường / xã phù hợp</Text>
              </View>
            ) : (
              <FlatList
                data={filteredWards}
                keyExtractor={(item) => item.code.toString()}
                style={styles.pickerList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                renderItem={({ item }) => {
                  const isSelected = item.name === ward;
                  return (
                    <TouchableOpacity
                      style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                      onPress={() => handleSelectWard(item)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.pickerItemText,
                          isSelected && styles.pickerItemTextActive,
                        ]}
                      >
                        {item.name}
                      </Text>
                      {isSelected && <Feather name="check" size={18} color="#2563EB" />}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ========================================================
          MODAL 3: THÔNG BÁO LƯU THÀNH CÔNG
         ======================================================== */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogBox}>
            <View style={styles.successIconCircle}>
              <Feather name="check" size={28} color="#10B981" />
            </View>
            <Text style={styles.dialogTitle}>Cập nhật thành công!</Text>
            <Text style={styles.dialogMessage}>
              Hồ sơ thông tin cá nhân của bạn đã được cập nhật thành công lên hệ thống hỗ trợ cứu nạn.
            </Text>
            <TouchableOpacity
              style={styles.dialogButton}
              onPress={() => setShowSuccessModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.dialogButtonText}>Xác nhận</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL 4: Chọn ảnh Avatar */}
      <Modal visible={avatarSheetVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setAvatarSheetVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.sheetCard}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>Ảnh đại diện</Text>

                <TouchableOpacity style={styles.sheetItem} onPress={handleTakeAvatar}>
                  <View style={[styles.sheetIconCircle, { backgroundColor: '#EFF6FF' }]}>
                    <Feather name="camera" size={18} color="#0066FF" />
                  </View>
                  <Text style={styles.sheetItemText}>Chụp ảnh mới</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetItem} onPress={handlePickAvatar}>
                  <View style={[styles.sheetIconCircle, { backgroundColor: '#F0F9FF' }]}>
                    <Feather name="image" size={18} color="#0284C7" />
                  </View>
                  <Text style={styles.sheetItemText}>Chọn từ thư viện</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetCancelBtn}
                  onPress={() => setAvatarSheetVisible(false)}
                >
                  <Text style={styles.sheetCancelText}>Hủy</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
  },
  headerEditText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0066FF',
  },
  headerTextBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 36,
    backgroundColor: '#F8FAFC',
  },

  // View Mode Avatar Card
  viewAvatarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  viewFullName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 8,
    marginBottom: 6,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  activePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  rolePill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },

  // Info Row for View Mode
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 13.5,
    color: '#64748B',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    maxWidth: '68%',
    textAlign: 'right',
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },

  // Big Edit Button
  editButtonBig: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0066FF',
    borderRadius: 16,
    height: 52,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
    marginTop: 6,
  },
  editButtonBigText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Edit Mode Avatar Card
  avatarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 8,
  },
  avatarImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: '#0066FF',
  },
  avatarPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#0066FF',
  },
  avatarInitial: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  avatarSavingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 42,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#0066FF',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
    textAlign: 'center',
  },
  avatarSubText: {
    fontSize: 12,
    color: '#64748B',
  },

  // Card chung
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },

  // Form Fields
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  requiredMark: {
    color: '#EF4444',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  inputBoxError: {
    borderColor: '#EF4444',
    backgroundColor: '#FFF8F8',
  },
  fieldIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 10,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 2,
  },

  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  selectContentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  selectText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
  selectTextPlaceholder: {
    color: '#94A3B8',
    fontWeight: '400',
  },
  addressSummaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    marginTop: 2,
  },
  addressSummaryText: {
    flex: 1,
    fontSize: 12.5,
    color: '#065F46',
    lineHeight: 18,
  },
  addressSummaryBold: {
    fontWeight: '700',
    color: '#047857',
  },

  // Gender
  genderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  genderOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 10,
    gap: 6,
  },
  genderOptionActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    justifyContent: 'center',
    alignItems: 'center',
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
  genderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  genderTextActive: {
    color: '#0066FF',
  },

  // Action Row
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
  },
  saveBtn: {
    flex: 1.6,
    height: 50,
    borderRadius: 16,
    backgroundColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Pickers
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  pickerModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: Platform.OS === 'ios' ? 460 : 480,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  pickerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  pickerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  pickerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    marginHorizontal: 20,
    marginVertical: 12,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 8,
  },
  pickerList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickerItemActive: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  pickerItemText: {
    fontSize: 14.5,
    color: '#0F172A',
    fontWeight: '500',
    flex: 1,
  },
  pickerItemTextActive: {
    color: '#0066FF',
    fontWeight: '700',
  },
  pickerLoadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  pickerLoadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  pickerEmptyWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  pickerEmptyText: {
    fontSize: 13.5,
    color: '#94A3B8',
  },

  // Dialog Overlay
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 8,
  },
  successIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  dialogTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  dialogMessage: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
  },
  dialogButton: {
    backgroundColor: '#0066FF',
    borderRadius: 12,
    width: '100%',
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogButtonText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Modal Avatar Sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 10,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    gap: 12,
  },
  sheetIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetItemText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  sheetCancelBtn: {
    marginTop: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  sheetCancelText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#64748B',
  },

  // Date Picker Modal Styles
  datePickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  datePickerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  datePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  datePickerHeaderBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  datePickerCancelText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },
  datePickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  datePickerDoneText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0066FF',
  },
  datePickerWheelWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
});

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
import { PROFILE_THEME } from './theme';
import { useAuth } from '../../context/AuthContext';
import { provinceApi, Province, Ward, FALLBACK_PROVINCES } from '../../services/provinceApi';

interface EditProfileScreenProps {
  onBack: () => void;
}

export const EditProfileScreen: React.FC<EditProfileScreenProps> = ({ onBack }) => {
  const { user, updateUserProfile, updateUserAvatar } = useAuth();

  // Dữ liệu người dùng thực tế và vai trò hệ thống
  const isRescuer =
    Boolean(user?.roles?.includes('RESCUER')) ||
    Boolean(user?.roles?.includes('LEADER'));
  const roleName = isRescuer
    ? (user?.roles?.includes('LEADER') ? 'Đội trưởng cứu hộ' : 'Nhân viên cứu hộ')
    : 'Người dân';
  const roleColor = isRescuer ? '#2563EB' : '#0066FF';
  const roleIcon = isRescuer ? ('shield-account' as const) : ('account' as const);

  const initialName = user?.fullName || '';
  const initialDob = user?.dateOfBirth ? String(user.dateOfBirth).split('T')[0] : '';
  const initialGender = (user?.gender as 'MALE' | 'FEMALE' | 'OTHER') || 'MALE';

  // Parse address fields
  const userAddress: any = (user as any)?.address;
  const initialProvince =
    typeof userAddress === 'object' && userAddress?.province
      ? userAddress.province
      : typeof userAddress === 'string' && userAddress.includes(',')
      ? userAddress.split(',').pop()?.trim() || ''
      : '';
  const initialWard =
    typeof userAddress === 'object' && userAddress?.ward
      ? userAddress.ward
      : '';
  const initialStreet =
    typeof userAddress === 'object' && userAddress?.street
      ? userAddress.street
      : typeof userAddress === 'string' && userAddress
      ? userAddress.split(',')[0].trim()
      : '';

  // Form states
  const [fullName, setFullName] = useState(initialName);
  const [dateOfBirth, setDateOfBirth] = useState(initialDob);
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>(initialGender);
  const [street, setStreet] = useState(initialStreet);

  // Province & Ward states from Vietnam Provinces online API (2025)
  const [province, setProvince] = useState(initialProvince);
  const [selectedProvinceCode, setSelectedProvinceCode] = useState<number | null>(null);
  const [ward, setWard] = useState(initialWard);

  // API Lists & Loading
  const [provinceList, setProvinceList] = useState<Province[]>(FALLBACK_PROVINCES);
  const [wardList, setWardList] = useState<Ward[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);

  // Modals & Search
  const [showProvincePicker, setShowProvincePicker] = useState(false);
  const [showWardPicker, setShowWardPicker] = useState(false);
  const [provinceSearch, setProvinceSearch] = useState('');
  const [wardSearch, setWardSearch] = useState('');

  // Validation errors
  const [nameError, setNameError] = useState<string | null>(null);
  const [provinceError, setProvinceError] = useState<string | null>(null);
  const [wardError, setWardError] = useState<string | null>(null);
  const [streetError, setStreetError] = useState<string | null>(null);

  // Saving & Feedback
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Unsaved changes confirmation dialog
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Avatar picking states
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(user?.avatarUrl || null);
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  // Tải danh sách Tỉnh/Thành phố từ API online khi mở màn hình
  useEffect(() => {
    let isMounted = true;
    const fetchProvinces = async () => {
      setLoadingProvinces(true);
      try {
        const list = await provinceApi.getProvinces();
        if (isMounted && Array.isArray(list) && list.length > 0) {
          setProvinceList(list);

          // Khớp mã tỉnh với tên tỉnh ban đầu nếu có
          const matched = list.find((p) =>
            p.name.toLowerCase().includes(initialProvince.toLowerCase())
          );
          if (matched) {
            setSelectedProvinceCode(matched.code);
          }
        }
      } catch {
        // Sử dụng danh sách dự phòng đã nạp
      } finally {
        if (isMounted) setLoadingProvinces(false);
      }
    };

    fetchProvinces();
    return () => {
      isMounted = false;
    };
  }, []);

  // Tải danh sách Phường/Xã khi đã có selectedProvinceCode
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
        if (isMounted) {
          setWardList(wards);
        }
      } catch {
        // Fallback
      } finally {
        if (isMounted) setLoadingWards(false);
      }
    };

    fetchWards();
    return () => {
      isMounted = false;
    };
  }, [selectedProvinceCode]);

  // Lọc danh sách Tỉnh/Thành theo từ khóa tìm kiếm
  const filteredProvinces = useMemo(() => {
    if (!provinceSearch.trim()) return provinceList;
    const query = provinceSearch.trim().toLowerCase();
    return provinceList.filter((p) => p.name.toLowerCase().includes(query));
  }, [provinceList, provinceSearch]);

  // Lọc danh sách Phường/Xã theo từ khóa tìm kiếm
  const filteredWards = useMemo(() => {
    if (!wardSearch.trim()) return wardList;
    const query = wardSearch.trim().toLowerCase();
    return wardList.filter((w) => w.name.toLowerCase().includes(query));
  }, [wardList, wardSearch]);

  // Detect if any field has changed
  const hasUnsavedChanges =
    fullName !== initialName ||
    dateOfBirth !== initialDob ||
    gender !== initialGender ||
    province !== initialProvince ||
    ward !== initialWard ||
    street !== initialStreet;

  // Handle Back press
  const handlePressBack = () => {
    if (hasUnsavedChanges) {
      setShowExitConfirm(true);
    } else {
      onBack();
    }
  };

  // Chọn Tỉnh / Thành phố
  const handleSelectProvince = (item: Province) => {
    setProvince(item.name);
    setSelectedProvinceCode(item.code);
    setProvinceError(null);
    setShowProvincePicker(false);
    setProvinceSearch('');

    // Reset phường/xã để người dùng chọn lại đúng với tỉnh mới
    if (item.code !== selectedProvinceCode) {
      setWard('');
    }
  };

  // Chọn Phường / Xã
  const handleSelectWard = (item: Ward) => {
    setWard(item.name);
    setWardError(null);
    setShowWardPicker(false);
    setWardSearch('');
  };

  // Avatar from library
  const handlePickAvatar = async () => {
    setAvatarSheetVisible(false);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Quyền truy cập', 'Vui lòng cấp quyền thư viện ảnh.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const pickedUri = res.assets[0].uri;
        setSelectedAvatarUrl(pickedUri);
        setIsSavingAvatar(true);
        await updateUserAvatar(pickedUri);
        setIsSavingAvatar(false);
      }
    } catch {
      setIsSavingAvatar(false);
      Alert.alert('Lỗi', 'Không thể chọn ảnh từ thiết bị.');
    }
  };

  // Avatar from camera
  const handleTakeAvatar = async () => {
    setAvatarSheetVisible(false);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Quyền truy cập', 'Vui lòng cấp quyền máy ảnh.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const takenUri = res.assets[0].uri;
        setSelectedAvatarUrl(takenUri);
        setIsSavingAvatar(true);
        await updateUserAvatar(takenUri);
        setIsSavingAvatar(false);
      }
    } catch {
      setIsSavingAvatar(false);
      Alert.alert('Lỗi', 'Không thể chụp ảnh mới.');
    }
  };

  // Save changes
  const handleSave = async () => {
    let isValid = true;

    if (!fullName.trim()) {
      setNameError('Vui lòng nhập họ và tên');
      isValid = false;
    } else {
      setNameError(null);
    }

    if (!province.trim()) {
      setProvinceError('Vui lòng chọn Tỉnh / Thành phố');
      isValid = false;
    } else {
      setProvinceError(null);
    }

    if (!ward.trim()) {
      setWardError('Vui lòng chọn Phường / Xã');
      isValid = false;
    } else {
      setWardError(null);
    }

    if (!street.trim()) {
      setStreetError('Vui lòng nhập số nhà, tên đường');
      isValid = false;
    } else {
      setStreetError(null);
    }

    if (!isValid) return;

    setIsSaving(true);
    try {
      await updateUserProfile({
        fullName: fullName.trim(),
        gender,
        dateOfBirth: dateOfBirth.trim(),
        address: `${street.trim()}, ${ward.trim()}, ${province.trim()}`,
      });

      setIsSaving(false);
      setShowSuccessModal(true);
    } catch {
      setIsSaving(false);
      Alert.alert('Thất bại', 'Không thể lưu thay đổi vào lúc này.');
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
          testID="btn-back-edit-profile"
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Thông tin cá nhân</Text>
        <View style={{ width: 40 }} />
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
          {/* Card: Avatar Editing */}
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
                testID="btn-edit-avatar"
              >
                <Feather name="camera" size={15} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.avatarNameText}>{fullName || 'Nguyễn Minh An'}</Text>
            <Text style={styles.avatarSubText}>Chạm vào máy ảnh để đổi ảnh đại diện</Text>
          </View>

          {/* Card: Editable Personal Information */}
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
              <View style={styles.inputBox}>
                <Feather name="calendar" size={17} color="#64748B" style={styles.fieldIcon} />
                <TextInput
                  style={styles.textInput}
                  value={dateOfBirth}
                  onChangeText={setDateOfBirth}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
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

            <View style={styles.formDivider} />

            {/* ========================================================
                ĐỊA CHỈ THƯỜNG TRÚ - CHỌN TỪ VIETNAM PROVINCES API (2025)
               ======================================================== */}
            <Text style={styles.sectionHeading}>Địa chỉ thường trú</Text>
            <View style={styles.noteBox}>
              <Feather name="info" size={14} color="#0284C7" />
              <Text style={styles.noteText}>
                {isRescuer
                  ? 'Địa chỉ thường trú được giữ tách biệt hoàn toàn với địa bàn tác chiến cứu hộ.'
                  : 'Địa chỉ thường trú hỗ trợ định vị khu vực dân cư của bạn trong hệ thống cứu hộ SOS.'}
              </Text>
            </View>

            {/* 1. Tỉnh / Thành phố (CHỌN TỪ DANH SÁCH API ONLINE) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                Tỉnh / Thành phố <Text style={styles.requiredMark}>*</Text>
              </Text>
              <TouchableOpacity
                style={[styles.selectBox, provinceError ? styles.inputBoxError : null]}
                onPress={() => setShowProvincePicker(true)}
                activeOpacity={0.7}
                testID="btn-select-province"
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

            {/* 2. Phường / Xã (CHỌN TỪ DANH SÁCH API THEO TỈNH ĐÃ CHỌN) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                Phường / Xã <Text style={styles.requiredMark}>*</Text>
              </Text>
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
                testID="btn-select-ward"
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

            {/* 3. Địa chỉ cụ thể: Số nhà, tên đường (NHẬP CHI TIẾT) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                Địa chỉ chi tiết (Số nhà, tên đường) <Text style={styles.requiredMark}>*</Text>
              </Text>
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

            {/* Hiển thị tóm tắt địa chỉ hoàn chỉnh */}
            {province && ward && street ? (
              <View style={styles.addressSummaryCard}>
                <Feather name="check-circle" size={14} color="#059669" />
                <Text style={styles.addressSummaryText}>
                  Địa chỉ lưu: <Text style={styles.addressSummaryBold}>{`${street}, ${ward}, ${province}`}</Text>
                </Text>
              </View>
            ) : null}
          </View>

          {/* Card: Read-only Account Information */}
          <View style={styles.card}>
            <View style={styles.readOnlyHeader}>
              <Feather name="shield" size={16} color="#0F172A" />
              <Text style={styles.readOnlyTitle}>Thông tin tài khoản hệ thống (Chỉ đọc)</Text>
            </View>

            <View style={styles.readOnlyRow}>
              <Text style={styles.readOnlyLabel}>Số điện thoại</Text>
              <View style={styles.readOnlyValueWrap}>
                <Text style={styles.readOnlyValue}>{user?.phone || 'Chưa cập nhật SĐT'}</Text>
                <Feather name="lock" size={12} color="#94A3B8" />
              </View>
            </View>

            <View style={styles.readOnlyDivider} />

            <View style={styles.readOnlyRow}>
              <Text style={styles.readOnlyLabel}>Email xác thực</Text>
              <View style={styles.readOnlyValueWrap}>
                <Text style={styles.readOnlyValue}>
                  {user?.email || 'Chưa có email'}
                </Text>
                <Feather name="lock" size={12} color="#94A3B8" />
              </View>
            </View>

            <View style={styles.readOnlyDivider} />

            <View style={styles.readOnlyRow}>
              <Text style={styles.readOnlyLabel}>Vai trò tài khoản</Text>
              <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
                <MaterialCommunityIcons name={roleIcon} size={13} color="#FFFFFF" />
                <Text style={[styles.roleBadgeText, { color: '#FFFFFF' }]}>{roleName}</Text>
              </View>
            </View>

            <View style={styles.readOnlyDivider} />

            <View style={styles.readOnlyRow}>
              <Text style={styles.readOnlyLabel}>Trạng thái tài khoản</Text>
              <View style={styles.activeBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeBadgeText}>Đang hoạt động</Text>
              </View>
            </View>
          </View>

          {/* Primary Button: Lưu thay đổi (Màu đỏ san hô coral-red) */}
          <TouchableOpacity
            style={[styles.saveButton, isSaving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.8}
            testID="btn-save-edit-profile"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <View style={styles.btnRow}>
                <Feather name="save" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.saveButtonText}>Lưu thay đổi</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Khoảng cách đáy an toàn tránh che BottomNav */}
          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ========================================================
          MODAL 1: CHỌN TỈNH / THÀNH PHỐ (VIETNAM PROVINCES API)
         ======================================================== */}
      <Modal
        visible={showProvincePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProvincePicker(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowProvincePicker(false)}>
          <View style={styles.pickerModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.pickerModalCard}>
                <View style={styles.sheetHandle} />

                <View style={styles.pickerHeaderRow}>
                  <View>
                    <Text style={styles.pickerTitle}>Chọn Tỉnh / Thành phố</Text>
                    <Text style={styles.pickerSubtitle}>Dữ liệu chuẩn hành chính Việt Nam (2025)</Text>
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
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ========================================================
          MODAL 2: CHỌN PHƯỜNG / XÃ (VIETNAM PROVINCES API)
         ======================================================== */}
      <Modal
        visible={showWardPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWardPicker(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowWardPicker(false)}>
          <View style={styles.pickerModalOverlay}>
            <TouchableWithoutFeedback>
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
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL: Success Feedback */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogBox}>
            <View style={styles.successIconCircle}>
              <Feather name="check" size={28} color="#059669" />
            </View>
            <Text style={styles.dialogTitle}>Cập nhật thành công</Text>
            <Text style={styles.dialogMessage}>
              Hồ sơ cứu hộ cá nhân của bạn đã được cập nhật an toàn trên hệ thống RescueSOS.
            </Text>
            <TouchableOpacity
              style={styles.dialogButton}
              onPress={() => {
                setShowSuccessModal(false);
                onBack();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.dialogButtonText}>Xác nhận</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: Unsaved Changes Exit Confirmation */}
      <Modal visible={showExitConfirm} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogBox}>
            <View style={styles.warningIconCircle}>
              <Feather name="alert-triangle" size={26} color="#D97706" />
            </View>
            <Text style={styles.dialogTitle}>Hủy thay đổi?</Text>
            <Text style={styles.dialogMessage}>
              Bạn có các thay đổi chưa được lưu. Nếu thoát ngay bây giờ, các thay đổi sẽ bị mất.
            </Text>
            <View style={styles.dialogActionsRow}>
              <TouchableOpacity
                style={styles.cancelLeaveBtn}
                onPress={() => setShowExitConfirm(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelLeaveText}>Tiếp tục sửa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmLeaveBtn}
                onPress={() => {
                  setShowExitConfirm(false);
                  onBack();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmLeaveText}>Rời đi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: Avatar Options */}
      <Modal visible={avatarSheetVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setAvatarSheetVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.sheetCard}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>Ảnh đại diện cứu hộ</Text>

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
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 36,
    backgroundColor: '#F8FAFC',
    gap: 14,
  },

  // Avatar Card
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
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  avatarSubText: {
    fontSize: 12,
    color: '#64748B',
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 14,
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
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 4,
  },
  formDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    color: '#0369A1',
    lineHeight: 16,
  },

  // Field Inputs & Selects
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

  // Select Box for Province & Ward
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

  // Gender Radio Row
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

  // Read-only Account Card
  readOnlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  readOnlyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  readOnlyLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  readOnlyValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  readOnlyValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  readOnlyDivider: {
    height: 1,
    backgroundColor: '#F8FAFC',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  activeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },

  // Save Button
  saveButton: {
    backgroundColor: '#0066FF',
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
    marginTop: 4,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Modal Picker Styles
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  pickerModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
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

  // Dialog Overlay & Box
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
  warningIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEF3C7',
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
  dialogActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  cancelLeaveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelLeaveText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  confirmLeaveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmLeaveText: {
    fontSize: 14,
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
});

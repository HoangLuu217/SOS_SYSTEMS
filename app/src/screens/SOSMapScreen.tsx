import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Modal,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Feather, MaterialCommunityIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { backendApi } from '../services/backendApi';

// Danh sách các loại yêu cầu cứu trợ
const REQUEST_TYPES = [
  { id: 'FLOOD', label: 'Cứu hộ ngập lụt / Mắc kẹt', emoji: '🌊' },
  { id: 'MEDICAL', label: 'Cấp cứu y tế / Bị thương', emoji: '🏥' },
  { id: 'FOOD', label: 'Tiếp tế lương thực & Nước uống', emoji: '🍞' },
  { id: 'EVACUATION', label: 'Sơ tán khẩn cấp (Người già, Trẻ em)', emoji: '👵' },
  { id: 'LANDSLIDE', label: 'Sạt lở đất / Đổ sập', emoji: '⚠️' },
  { id: 'OTHER', label: 'Yêu cầu cứu hộ khác', emoji: '❓' },
];

// Danh sách đối tượng ưu tiên
const PRIORITY_TARGETS = [
  { id: 'PREGNANT', label: 'Phụ nữ có thai', icon: 'female', color: '#EF4444' },
  { id: 'CHILD_UNDER_5', label: 'Trẻ em dưới 5 tuổi', icon: 'child', color: '#0284C7' },
  { id: 'ELDERLY', label: 'Người cao tuổi (>65t)', icon: 'blind', color: '#D97706' },
  { id: 'DISABILITY_SICK', label: 'Người bệnh / Khuyết tật', icon: 'wheelchair', color: '#8B5CF6' },
];

interface SOSMapScreenProps {
  onClose?: () => void;
  initialEmergencyType?: string;
  isTab?: boolean;
}

export const SOSMapScreen: React.FC<SOSMapScreenProps> = ({ onClose, isTab = false }) => {
  // Loại yêu cầu
  const [requestType, setRequestType] = useState<string>('FLOOD');
  const [showTypeModal, setShowTypeModal] = useState<boolean>(false);

  // Số người cần cứu
  const [peopleCount, setPeopleCount] = useState<number>(1);

  // Số điện thoại chính & số điện thoại phụ
  const [phone, setPhone] = useState<string>('');
  const [secondaryPhone, setSecondaryPhone] = useState<string>('');
  const [showSecondaryPhone, setShowSecondaryPhone] = useState<boolean>(false);

  // Nội dung mô tả (0/500 ký tự)
  const [description, setDescription] = useState<string>('');

  // GPS & Địa điểm
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [gpsAddress, setGpsAddress] = useState<string>('Đang định vị...');
  const [locating, setLocating] = useState<boolean>(true);
  const [detailedAddress, setDetailedAddress] = useState<string>('');

  // Đối tượng ưu tiên
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);

  // Ảnh hiện trường (Không bắt buộc)
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  // Trạng thái gửi
  const [sending, setSending] = useState<boolean>(false);

  // Popup xác thực
  const [validationModalVisible, setValidationModalVisible] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string>('');

  // Trạng thái tiếp nhận thành công
  const [successData, setSuccessData] = useState<{
    sosCode: string;
    requestTypeLabel: string;
    people: number;
    address: string;
    phone: string;
    description: string;
  } | null>(null);

  // Lấy vị trí GPS thực tế
  const fetchLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsAddress('Chưa cấp quyền GPS');
        setLocating(false);
        return;
      }

      const currentLoc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation(currentLoc);

      try {
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: currentLoc.coords.latitude,
          longitude: currentLoc.coords.longitude,
        });
        if (geo) {
          const parts = [
            geo.streetNumber,
            geo.street,
            geo.subregion,
            geo.district,
            geo.city || geo.region,
          ].filter(Boolean);
          setGpsAddress(parts.length > 0 ? parts.join(', ') : `${currentLoc.coords.latitude.toFixed(5)}, ${currentLoc.coords.longitude.toFixed(5)}`);
        }
      } catch {
        setGpsAddress(`${currentLoc.coords.latitude.toFixed(4)}, ${currentLoc.coords.longitude.toFixed(4)}`);
      }
    } catch {
      setGpsAddress('Không thể lấy GPS, vui lòng nhập địa chỉ');
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  // Tăng giảm số người
  const handleAdjustPeople = (delta: number) => {
    setPeopleCount((prev) => Math.max(1, prev + delta));
  };

  // Toggle đối tượng ưu tiên
  const togglePriority = (id: string) => {
    setSelectedPriorities((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Chụp ảnh hiện trường
  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền Camera', 'Vui lòng cấp quyền Camera để chụp ảnh hiện trường.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.25,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
        setImageBase64(result.assets[0].base64 || null);
      }
    } catch (err: any) {
      Alert.alert('Lỗi', 'Không thể mở Camera: ' + err.message);
    }
  };

  // Chọn ảnh từ máy
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền Thư viện', 'Vui lòng cấp quyền Thư viện ảnh.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.25,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
        setImageBase64(result.assets[0].base64 || null);
      }
    } catch (err: any) {
      Alert.alert('Lỗi', 'Không thể chọn ảnh: ' + err.message);
    }
  };

  const removeImage = () => {
    setImageUri(null);
    setImageBase64(null);
  };

  // Gửi thông tin cứu trợ
  const handleSubmit = async () => {
    // 1. Kiểm tra số điện thoại
    if (!phone.trim()) {
      setValidationMessage('Vui lòng nhập số điện thoại liên hệ để Đội cứu hộ gọi lại!');
      setValidationModalVisible(true);
      return;
    }

    // 2. Kiểm tra nội dung
    if (!description.trim()) {
      setValidationMessage('Vui lòng nhập nội dung mô tả tình hình và nhu cầu hỗ trợ!');
      setValidationModalVisible(true);
      return;
    }

    // 3. Kiểm tra địa điểm
    const hasAddress = detailedAddress.trim() || (gpsAddress && !gpsAddress.includes('Đang định vị') && !gpsAddress.includes('Chưa cấp quyền'));
    if (!hasAddress) {
      setValidationMessage('Vui lòng nhập số nhà, tên đường hoặc bật định vị GPS để xác định nơi cần cứu!');
      setValidationModalVisible(true);
      return;
    }

    setSending(true);
    try {
      const selectedTypeObj = REQUEST_TYPES.find((t) => t.id === requestType);
      const priorityLabels = selectedPriorities.map(
        (id) => PRIORITY_TARGETS.find((p) => p.id === id)?.label || id
      );

      // Địa chỉ tổng hợp
      let finalAddress = detailedAddress.trim();
      if (!finalAddress) {
        finalAddress = gpsAddress;
      } else if (gpsAddress && !gpsAddress.includes('Không thể') && !gpsAddress.includes('Chưa')) {
        finalAddress = `${finalAddress} (${gpsAddress})`;
      }

      // Mô tả đầy đủ kèm thông tin phụ
      const extraNotes: string[] = [];
      extraNotes.push(`[Loại yêu cầu: ${selectedTypeObj?.label || requestType}]`);
      if (phone.trim()) extraNotes.push(`[SĐT: ${phone.trim()}]`);
      if (secondaryPhone.trim()) extraNotes.push(`[SĐT phụ: ${secondaryPhone.trim()}]`);
      if (priorityLabels.length > 0) extraNotes.push(`[Đối tượng ưu tiên: ${priorityLabels.join(', ')}]`);

      const fullDescription = `${extraNotes.join(' ')}\n${description.trim()}`;

      // Đánh giá mức độ khẩn cấp
      const isCritical =
        selectedPriorities.length > 0 ||
        requestType === 'MEDICAL' ||
        fullDescription.toLowerCase().includes('mái nhà') ||
        fullDescription.toLowerCase().includes('nóc nhà') ||
        fullDescription.toLowerCase().includes('chảy xiết') ||
        fullDescription.toLowerCase().includes('nguy kịch') ||
        fullDescription.toLowerCase().includes('ngang ngực');

      const payload = {
        location: {
          type: 'Point',
          coordinates: location
            ? [location.coords.longitude, location.coords.latitude]
            : [108.26054, 15.96836],
        },
        address: finalAddress,
        priority: isCritical ? 'CRITICAL' : 'HIGH',
        emergencyType: requestType === 'MEDICAL' ? 'MEDICAL' : 'FLOOD',
        description: fullDescription,
        people: peopleCount,
        contactPhone: phone.trim(),
        priorityGroups: priorityLabels,
        images: imageBase64 ? [`data:image/jpeg;base64,${imageBase64}`] : [],
      };

      const response = await backendApi.post('/sos', payload);

      if (response.success && response.data?._id) {
        const sosId = response.data._id;
        const code = response.data.sosCode || 'SOS-' + sosId.slice(-6).toUpperCase();

        if (imageBase64) {
          try {
            await backendApi.post('/files', { sosId, base64File: imageBase64 });
          } catch (uploadErr) {
            console.warn('Lỗi tải ảnh:', uploadErr);
          }
        }

        setSuccessData({
          sosCode: code,
          requestTypeLabel: selectedTypeObj?.label || 'Cứu hộ khẩn cấp',
          people: peopleCount,
          address: finalAddress,
          phone: phone.trim(),
          description: description.trim(),
        });
      } else {
        Alert.alert('Không thể gửi', response.message || 'Chưa gửi được thông tin. Vui lòng thử lại!');
      }
    } catch (err: any) {
      Alert.alert('Lỗi kết nối', 'Không thể kết nối máy chủ cứu nạn. Vui lòng kiểm tra mạng!\n' + (err.message || ''));
    } finally {
      setSending(false);
    }
  };

  const selectedTypeObj = REQUEST_TYPES.find((t) => t.id === requestType);

  // MÀN HÌNH BÁO THÀNH CÔNG
  if (successData) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successCard}>
          <View style={styles.successIconOuter}>
            <Ionicons name="checkmark-circle" size={70} color="#EF4444" />
          </View>

          <Text style={styles.successTitle}>ĐÃ ĐĂNG TIN THÀNH CÔNG!</Text>
          <Text style={styles.successSub}>
            Thông tin của bạn đã được chuyển tới Đội cứu nạn và Chính quyền địa phương để kịp thời hỗ trợ.
          </Text>

          <View style={styles.successDetailsBox}>
            <View style={styles.successDetailRow}>
              <Text style={styles.successDetailLabel}>Mã cứu trợ:</Text>
              <Text style={styles.successDetailCode}>{successData.sosCode}</Text>
            </View>
            <View style={styles.successDetailRow}>
              <Text style={styles.successDetailLabel}>Loại yêu cầu:</Text>
              <Text style={styles.successDetailValue}>{successData.requestTypeLabel}</Text>
            </View>
            <View style={styles.successDetailRow}>
              <Text style={styles.successDetailLabel}>Số người:</Text>
              <Text style={styles.successDetailValue}>{successData.people} người</Text>
            </View>
            <View style={styles.successDetailRow}>
              <Text style={styles.successDetailLabel}>Số điện thoại:</Text>
              <Text style={[styles.successDetailValue, { color: '#0284C7', fontWeight: '800' }]}>
                {successData.phone}
              </Text>
            </View>
            <View style={styles.successDetailRow}>
              <Text style={styles.successDetailLabel}>Địa điểm:</Text>
              <Text style={styles.successDetailValue} numberOfLines={2}>
                {successData.address}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 18 }}>
            <TouchableOpacity
              style={[styles.doneBtn, { flex: 1, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1' }]}
              onPress={() => {
                setSuccessData(null);
                setDescription('');
                setDetailedAddress('');
                setPhone('');
                setSecondaryPhone('');
                setShowSecondaryPhone(false);
                setSelectedPriorities([]);
                setImageUri(null);
                setImageBase64(null);
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.doneBtnText, { color: '#0F172A' }]}>ĐĂNG TIN KHÁC</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.doneBtn, { flex: 1, backgroundColor: '#EF4444' }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.doneBtnText}>{isTab ? 'VỀ TRANG CHỦ' : 'HOÀN TẤT'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER THEO PHONG CÁCH MẪU */}
      <View style={styles.header}>
        {onClose ? (
          <TouchableOpacity style={styles.backButton} onPress={onClose} activeOpacity={0.7}>
            <Feather name={isTab ? 'home' : 'chevron-left'} size={24} color="#1E293B" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Đăng tin cần cứu trợ</Text>
          <Text style={styles.headerSubTitle}>Gửi thông tin để được hỗ trợ</Text>
        </View>

        <View style={{ width: 36 }} />
      </View>
      {/* Đường viền phân cách mỏng */}
      <View style={styles.headerAccentLine} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 1. LOẠI YÊU CẦU * */}
          <View style={styles.formSection}>
            <View style={styles.fieldHeaderRow}>
              <View style={styles.fieldBadgeIcon}>
                <Ionicons name="alert-circle" size={16} color="#EF4444" />
              </View>
              <Text style={styles.fieldTitle}>
                Loại yêu cầu <Text style={styles.requiredStar}>*</Text>
              </Text>
            </View>

            <TouchableOpacity
              style={styles.dropdownBox}
              onPress={() => setShowTypeModal(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.dropdownSelectedText}>
                {selectedTypeObj ? `${selectedTypeObj.emoji}  ${selectedTypeObj.label}` : 'Vui lòng chọn'}
              </Text>
              <Feather name="chevron-down" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* 2. SỐ NGƯỜI * (CÙNG 1 HÀNG VỚI NÚT STEPPER BÊN PHẢI) */}
          <View style={styles.formSection}>
            <View style={styles.betweenHeaderRow}>
              <View style={styles.fieldHeaderRow}>
                <View style={styles.fieldBadgeIcon}>
                  <MaterialCommunityIcons name="account-group" size={16} color="#EF4444" />
                </View>
                <Text style={styles.fieldTitle}>
                  Số người <Text style={styles.requiredStar}>*</Text>
                </Text>
              </View>

              {/* Stepper nhỏ gọn tỉ lệ chuẩn */}
              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  style={styles.stepperActionBtn}
                  onPress={() => handleAdjustPeople(-1)}
                  activeOpacity={0.7}
                >
                  <Feather name="minus" size={16} color="#475569" />
                </TouchableOpacity>

                <View style={styles.stepperValueBox}>
                  <Text style={styles.stepperValueText}>{peopleCount}</Text>
                </View>

                <TouchableOpacity
                  style={styles.stepperActionBtn}
                  onPress={() => handleAdjustPeople(1)}
                  activeOpacity={0.7}
                >
                  <Feather name="plus" size={16} color="#475569" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* 3. SỐ ĐIỆN THOẠI * (KÈM NÚT + THÊM SỐ BÊN PHẢI) */}
          <View style={styles.formSection}>
            <View style={styles.betweenHeaderRow}>
              <View style={styles.fieldHeaderRow}>
                <View style={styles.fieldBadgeIcon}>
                  <Ionicons name="call" size={14} color="#EF4444" />
                </View>
                <Text style={styles.fieldTitle}>
                  Số điện thoại <Text style={styles.requiredStar}>*</Text>
                </Text>
              </View>

              {!showSecondaryPhone && (
                <TouchableOpacity
                  style={styles.addPhoneBtn}
                  onPress={() => setShowSecondaryPhone(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add-circle" size={16} color="#0284C7" />
                  <Text style={styles.addPhoneBtnText}>Thêm số</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Ô nhập SĐT chính */}
            <View style={styles.inputWrapWithIcon}>
              <Feather name="phone" size={16} color="#94A3B8" style={styles.inputLeadingIcon} />
              <TextInput
                style={styles.textInputInside}
                placeholder="Số điện thoại chính"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                maxLength={15}
              />
            </View>

            {/* Ô nhập SĐT phụ (khi bấm + Thêm số) */}
            {showSecondaryPhone && (
              <View style={[styles.inputWrapWithIcon, { marginTop: 8 }]}>
                <Feather name="phone-forwarded" size={16} color="#0284C7" style={styles.inputLeadingIcon} />
                <TextInput
                  style={styles.textInputInside}
                  placeholder="Số điện thoại phụ / người thân"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  value={secondaryPhone}
                  onChangeText={setSecondaryPhone}
                  maxLength={15}
                />
                <TouchableOpacity
                  onPress={() => {
                    setSecondaryPhone('');
                    setShowSecondaryPhone(false);
                  }}
                  style={{ padding: 4 }}
                >
                  <Feather name="x" size={16} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* 4. NỘI DUNG * (KÈM BỘ ĐẾM 0/500) */}
          <View style={styles.formSection}>
            <View style={styles.fieldHeaderRow}>
              <View style={styles.fieldBadgeIcon}>
                <MaterialCommunityIcons name="square-edit-outline" size={16} color="#EF4444" />
              </View>
              <Text style={styles.fieldTitle}>
                Nội dung <Text style={styles.requiredStar}>*</Text>
              </Text>
            </View>

            <View style={styles.textareaContainer}>
              <TextInput
                style={styles.textareaInside}
                placeholder="Mô tả tình hình, nhu cầu hỗ trợ..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={4}
                value={description}
                onChangeText={setDescription}
                maxLength={500}
              />
              <Text style={styles.charCounterText}>{description.length}/500</Text>
            </View>
          </View>

          {/* 5. ĐỊA ĐIỂM * (CHỌN VỊ TRÍ & NHẬP SỐ NHÀ, TÊN ĐƯỜNG) */}
          <View style={styles.formSection}>
            <View style={styles.fieldHeaderRow}>
              <View style={styles.fieldBadgeIcon}>
                <Ionicons name="location" size={16} color="#EF4444" />
              </View>
              <Text style={styles.fieldTitle}>
                Địa điểm <Text style={styles.requiredStar}>*</Text>
              </Text>
              <Feather name="info" size={14} color="#94A3B8" style={{ marginLeft: 4 }} />
            </View>

            {/* Nút chọn vị trí / GPS */}
            <TouchableOpacity
              style={styles.locationSelectorCard}
              onPress={fetchLocation}
              activeOpacity={0.8}
            >
              <View style={styles.locationSelectorLeft}>
                <Ionicons name="location-sharp" size={17} color="#EF4444" />
                <Text style={styles.locationSelectorText} numberOfLines={1}>
                  {locating ? 'Đang xác định vị trí...' : gpsAddress ? `Vị trí: ${gpsAddress}` : 'Chọn vị trí'}
                </Text>
              </View>
              {locating ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Feather name="chevron-right" size={18} color="#EF4444" />
              )}
            </TouchableOpacity>

            {/* Ô nhập số nhà, tên đường, thôn ấp */}
            <View style={[styles.inputWrapWithIcon, { marginTop: 8 }]}>
              <Feather name="home" size={16} color="#94A3B8" style={styles.inputLeadingIcon} />
              <TextInput
                style={styles.textInputInside}
                placeholder="Nhập số nhà, tên đường, thôn ấp..."
                placeholderTextColor="#94A3B8"
                value={detailedAddress}
                onChangeText={setDetailedAddress}
              />
            </View>
          </View>

          {/* 6. ĐỐI TƯỢNG CẦN ƯU TIÊN ⓘ (GRID 2 CỘT) */}
          <View style={styles.formSection}>
            <View style={styles.fieldHeaderRow}>
              <View style={styles.fieldBadgeIcon}>
                <Ionicons name="heart" size={15} color="#EF4444" />
              </View>
              <Text style={styles.fieldTitle}>Đối tượng cần ưu tiên</Text>
              <Feather name="info" size={14} color="#94A3B8" style={{ marginLeft: 4 }} />
            </View>

            <View style={styles.priorityGrid}>
              {PRIORITY_TARGETS.map((target) => {
                const isSelected = selectedPriorities.includes(target.id);
                return (
                  <TouchableOpacity
                    key={target.id}
                    style={[
                      styles.priorityGridCard,
                      isSelected && styles.priorityGridCardSelected,
                    ]}
                    onPress={() => togglePriority(target.id)}
                    activeOpacity={0.75}
                  >
                    <FontAwesome5
                      name={target.icon}
                      size={15}
                      color={target.color}
                      style={{ marginRight: 8 }}
                    />
                    <Text
                      style={[
                        styles.priorityGridCardText,
                        isSelected && styles.priorityGridCardTextSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {target.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 7. ĐÍNH KÈM ẢNH HIỆN TRƯỜNG (KHÔNG BẮT BUỘC) */}
          <View style={styles.formSection}>
            <View style={styles.fieldHeaderRow}>
              <View style={styles.fieldBadgeIcon}>
                <Ionicons name="camera" size={15} color="#EF4444" />
              </View>
              <Text style={styles.fieldTitle}>Ảnh hiện trường (Không bắt buộc)</Text>
            </View>

            <View style={styles.photoActionsRow}>
              <TouchableOpacity style={styles.photoBtn} onPress={takePhoto} activeOpacity={0.75}>
                <Feather name="camera" size={15} color="#0284C7" />
                <Text style={styles.photoBtnText}>Chụp ảnh</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.photoBtn} onPress={pickImage} activeOpacity={0.75}>
                <Feather name="image" size={15} color="#0284C7" />
                <Text style={styles.photoBtnText}>Chọn từ thư viện</Text>
              </TouchableOpacity>
            </View>

            {imageUri && (
              <View style={styles.imagePreviewWrap}>
                <Image source={{ uri: imageUri }} style={styles.previewImage} />
                <TouchableOpacity style={styles.removeImgBtn} onPress={removeImage} activeOpacity={0.8}>
                  <Ionicons name="close-circle" size={24} color="#DC2626" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* 8. NÚT ĐĂNG TIN BO TRÒN ĐỎ NỔI BẬT */}
          <TouchableOpacity
            style={styles.submitPillBtn}
            onPress={handleSubmit}
            disabled={sending}
            activeOpacity={0.85}
          >
            {sending ? (
              <View style={styles.submitBtnContent}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.submitPillBtnText}>ĐANG GỬI THÔNG TIN...</Text>
              </View>
            ) : (
              <View style={styles.submitBtnContent}>
                <Ionicons name="navigate" size={18} color="#FFFFFF" style={{ transform: [{ rotate: '45deg' }] }} />
                <Text style={styles.submitPillBtnText}>Đăng tin</Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODAL CHỌN LOẠI YÊU CẦU */}
      <Modal
        visible={showTypeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTypeModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheetCard}>
            <View style={styles.modalSheetHeader}>
              <Text style={styles.modalSheetTitle}>Chọn loại yêu cầu cứu trợ</Text>
              <TouchableOpacity onPress={() => setShowTypeModal(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 360 }}>
              {REQUEST_TYPES.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.typeOptionItem,
                    requestType === item.id && styles.typeOptionItemSelected,
                  ]}
                  onPress={() => {
                    setRequestType(item.id);
                    setShowTypeModal(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.typeOptionEmoji}>{item.emoji}</Text>
                  <Text
                    style={[
                      styles.typeOptionLabel,
                      requestType === item.id && styles.typeOptionLabelSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {requestType === item.id && (
                    <Ionicons name="checkmark-circle" size={20} color="#EF4444" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL THÔNG BÁO XÁC THỰC THIẾU THÔNG TIN */}
      <Modal
        visible={validationModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setValidationModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.valAlertCard}>
            <View style={styles.valAlertBadge}>
              <Ionicons name="alert-circle" size={32} color="#EF4444" />
            </View>
            <Text style={styles.valAlertTitle}>Thiếu thông tin</Text>
            <Text style={styles.valAlertMessage}>{validationMessage}</Text>
            <TouchableOpacity
              style={styles.valAlertBtn}
              onPress={() => setValidationModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.valAlertBtnText}>Đã hiểu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 42 : 52,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.1,
  },
  headerSubTitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  headerAccentLine: {
    height: 1.5,
    backgroundColor: '#FEE2E2',
    width: '100%',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 120, // Chừa khoảng trống phía dưới cho Bottom Nav
  },

  // TỪNG PHẦN FIELD
  formSection: {
    marginBottom: 18,
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  betweenHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  fieldBadgeIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  fieldTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  requiredStar: {
    color: '#EF4444',
    fontWeight: '800',
  },

  // 1. DROPDOWN BOX
  dropdownBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
  },
  dropdownSelectedText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },

  // 2. STEPPER SỐ NGƯỜI
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  stepperActionBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  stepperValueBox: {
    minWidth: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  stepperValueText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },

  // 3. SỐ ĐIỆN THOẠI
  addPhoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addPhoneBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284C7',
  },
  inputWrapWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    height: 48,
  },
  inputLeadingIcon: {
    marginRight: 8,
  },
  textInputInside: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },

  // 4. TEXTAREA NỘI DUNG
  textareaContainer: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#FFFFFF',
    minHeight: 105,
    justifyContent: 'space-between',
  },
  textareaInside: {
    fontSize: 14,
    color: '#0F172A',
    minHeight: 70,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  charCounterText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'right',
    marginTop: 4,
  },

  // 5. ĐỊA ĐIỂM
  locationSelectorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  locationSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  locationSelectorText: {
    fontSize: 13.5,
    color: '#DC2626',
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },

  // 6. GRID ĐỐI TƯỢNG ƯU TIÊN (2 CỘT)
  priorityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  priorityGridCard: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
  },
  priorityGridCardSelected: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
  },
  priorityGridCardText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  priorityGridCardTextSelected: {
    color: '#DC2626',
    fontWeight: '700',
  },

  // 7. ĐÍNH KÈM ẢNH
  photoActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  photoBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0284C7',
  },
  imagePreviewWrap: {
    position: 'relative',
    marginTop: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 160,
    borderRadius: 10,
  },
  removeImgBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },

  // 8. NÚT ĐĂNG TIN BO TRÒN ĐỎ
  submitPillBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitPillBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // MODAL BOTTOM SHEET CHO LOẠI YÊU CẦU
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalSheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  modalSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalSheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  typeOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  typeOptionItemSelected: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  typeOptionEmoji: {
    fontSize: 18,
    marginRight: 10,
  },
  typeOptionLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  typeOptionLabelSelected: {
    color: '#DC2626',
    fontWeight: '700',
  },

  // MODAL XÁC THỰC
  valAlertCard: {
    margin: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    alignSelf: 'center',
    width: '88%',
    maxWidth: 340,
  },
  valAlertBadge: {
    marginBottom: 8,
  },
  valAlertTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  valAlertMessage: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  valAlertBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  valAlertBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // THÀNH CÔNG
  successContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  successCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  successIconOuter: {
    marginBottom: 10,
  },
  successTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  successSub: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  successDetailsBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  successDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  successDetailLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  successDetailCode: {
    fontSize: 13,
    fontWeight: '800',
    color: '#EF4444',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  successDetailValue: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
    textAlign: 'right',
  },
  doneBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});

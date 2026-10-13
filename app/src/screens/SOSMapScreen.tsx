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
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { backendApi } from '../services/backendApi';

// Danh sách đối tượng ưu tiên đặc biệt trong cứu hộ
const PRIORITY_OPTIONS = [
  { id: 'TRE_NHO', label: 'Trẻ sơ sinh / Trẻ nhỏ', emoji: '👶' },
  { id: 'NGUOI_GIA', label: 'Người cao tuổi (>65t)', emoji: '👵' },
  { id: 'PHU_NU_MANG_THAI', label: 'Phụ nữ mang thai', emoji: '🤰' },
  { id: 'NGUOI_BENH', label: 'Người bệnh / Khuyết tật', emoji: '♿' },
  { id: 'BI_THUONG', label: 'Đang bị thương tích', emoji: '🩹' },
];

interface SOSMapScreenProps {
  onClose?: () => void;
  initialEmergencyType?: string;
  isTab?: boolean;
}

export const SOSMapScreen: React.FC<SOSMapScreenProps> = ({ onClose, isTab = false }) => {
  // GPS & Vị trí thực tế từ điện thoại
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [address, setAddress] = useState<string>('Đang định vị GPS...');
  const [loadingMsg, setLoadingMsg] = useState('Đang lấy vị trí GPS từ điện thoại...');
  const [locating, setLocating] = useState(true);
  const [sending, setSending] = useState(false);

  // Chế độ vị trí cứu hộ: GPS hiện tại của tôi HOẶC Báo hộ người thân / Nơi khác
  const [locationMode, setLocationMode] = useState<'current_gps' | 'custom_location'>('current_gps');
  const [customAddress, setCustomAddress] = useState<string>('');

  // SĐT liên hệ tại hiện trường điểm ngập
  const [contactPhone, setContactPhone] = useState<string>('');

  // Đối tượng ưu tiên đặc biệt
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);

  // Ảnh chụp thực địa
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  // Dữ liệu người dân nhập: số người, mô tả tình trạng
  const [peopleText, setPeopleText] = useState<string>('1');
  const [description, setDescription] = useState<string>('');

  // Ref cho ô nhập
  const descInputRef = useRef<TextInput>(null);
  const customAddressInputRef = useRef<TextInput>(null);

  // Popup xác thực form
  const [validationModalVisible, setValidationModalVisible] = useState(false);
  const [validationType, setValidationType] = useState<'desc' | 'people' | 'gps' | 'address'>('desc');

  // Trạng thái tiếp nhận thành công
  const [successData, setSuccessData] = useState<{
    sosCode: string;
    people: number;
    address: string;
    isQuickDispatch: boolean;
    description: string;
    hasImage: boolean;
    contactPhone?: string;
    priorities?: string[];
  } | null>(null);

  // Lấy vị trí GPS thực tế của thiết bị
  const fetchLocation = async () => {
    setLocating(true);
    setLoadingMsg('Đang lấy vị trí GPS chính xác từ điện thoại...');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền GPS', 'Vui lòng cấp quyền vị trí trong Cài đặt để gửi tọa độ cứu nạn chính xác.');
        setLoadingMsg('Bị từ chối quyền GPS');
        setAddress('Không thể truy cập GPS');
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
          if (parts.length > 0) {
            setAddress(parts.join(', '));
          } else {
            setAddress(`Tọa độ: ${currentLoc.coords.latitude.toFixed(5)}, ${currentLoc.coords.longitude.toFixed(5)}`);
          }
        }
      } catch {
        setAddress(`Tọa độ: ${currentLoc.coords.latitude.toFixed(4)}, ${currentLoc.coords.longitude.toFixed(4)}`);
      }
    } catch {
      setLoadingMsg('Không thể lấy được GPS. Vui lòng bật vị trí.');
      setAddress('Chưa có GPS - Vui lòng thử lại');
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  // Bật/tắt đối tượng ưu tiên
  const togglePriority = (id: string) => {
    setSelectedPriorities((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Tăng giảm số người
  const handleAdjustPeople = (delta: number) => {
    const current = parseInt(peopleText, 10) || 1;
    const nextVal = Math.max(1, current + delta);
    setPeopleText(nextVal.toString());
  };

  // Chụp ảnh hiện trường
  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền Camera', 'Vui lòng cấp quyền Camera để chụp ảnh hiện trường ngập.');
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

  // Chọn ảnh từ thư viện
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

  // Gửi yêu cầu cứu hộ lên Backend
  const submitSOS = async () => {
    if (locationMode === 'current_gps' && !location) {
      setValidationType('gps');
      setValidationModalVisible(true);
      fetchLocation();
      return;
    }

    if (locationMode === 'custom_location' && !customAddress.trim()) {
      setValidationType('address');
      setValidationModalVisible(true);
      return;
    }

    const peopleNumber = parseInt(peopleText, 10);
    if (isNaN(peopleNumber) || peopleNumber < 1) {
      setValidationType('people');
      setValidationModalVisible(true);
      return;
    }

    // Bắt buộc người dân phải điền mô tả tình trạng thực tế vào form
    if (!description.trim()) {
      setValidationType('desc');
      setValidationModalVisible(true);
      return;
    }

    setSending(true);
    try {
      const finalAddress =
        locationMode === 'custom_location'
          ? `${customAddress.trim()} (Báo hộ người thân)`
          : address && address !== 'Đang định vị GPS...' && address !== 'Không thể truy cập GPS'
          ? address
          : location
          ? `Tọa độ GPS [${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}]`
          : 'Khu vực cứu nạn khẩn cấp';

      const priorityLabels = selectedPriorities.map(
        (id) => PRIORITY_OPTIONS.find((opt) => opt.id === id)?.label || id
      );

      // Ghép thông tin bổ sung vào mô tả để các màn hình luôn hiển thị trọn vẹn
      const prefixParts: string[] = [];
      if (contactPhone.trim()) {
        prefixParts.push(`[SĐT liên hệ: ${contactPhone.trim()}]`);
      }
      if (priorityLabels.length > 0) {
        prefixParts.push(`[Ưu tiên: ${priorityLabels.join(', ')}]`);
      }
      if (locationMode === 'custom_location') {
        prefixParts.push(`[Báo hộ người thân tại: ${customAddress.trim()}]`);
      }

      const fullDescription =
        prefixParts.length > 0
          ? `${prefixParts.join(' ')}\n${description.trim()}`
          : description.trim();

      // Tự động phân loại mức độ nguy cấp
      const isCritical =
        selectedPriorities.length > 0 ||
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
        emergencyType: 'FLOOD',
        description: fullDescription,
        people: peopleNumber,
        contactPhone: contactPhone.trim() || undefined,
        priorityGroups: priorityLabels,
        images: imageBase64 ? [`data:image/jpeg;base64,${imageBase64}`] : [],
      };

      const response = await backendApi.post('/sos', payload);

      if (response.success && response.data?._id) {
        const sosId = response.data._id;
        const code = response.data.sosCode || 'SOS-' + sosId.slice(-6).toUpperCase();

        if (imageBase64) {
          try {
            await backendApi.post('/files', {
              sosId,
              base64File: imageBase64,
            });
          } catch (uploadErr) {
            console.warn('Lỗi tải ảnh đính kèm:', uploadErr);
          }
        }

        setSuccessData({
          sosCode: code,
          people: payload.people,
          address: finalAddress,
          isQuickDispatch: false,
          description: description.trim(),
          hasImage: Boolean(imageBase64),
          contactPhone: contactPhone.trim(),
          priorities: priorityLabels,
        });
      } else {
        Alert.alert('Không thể gửi', response.message || 'Chưa gửi được tín hiệu. Vui lòng thử lại!');
      }
    } catch (err: any) {
      Alert.alert(
        'Lỗi kết nối',
        'Không thể kết nối máy chủ cứu nạn. Vui lòng kiểm tra mạng hoặc thử lại!\n' + (err.message || '')
      );
    } finally {
      setSending(false);
    }
  };

  // MÀN HÌNH BÁO THÀNH CÔNG
  if (successData) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successCard}>
          <View style={styles.successIconOuter}>
            <Ionicons name="checkmark-circle" size={72} color="#0284C7" />
          </View>

          <Text style={styles.successTitle}>
            📋 ĐÃ TIẾP NHẬN YÊU CẦU CỨU HỘ!
          </Text>
          <Text style={styles.successSub}>
            Thông tin khai báo và địa điểm cứu nạn đã được chuyển tới Đội ca-nô & Trung tâm điều phối khẩn cấp.
          </Text>

          <View style={styles.successDetailsBox}>
            <View style={styles.successDetailRow}>
              <Text style={styles.successDetailLabel}>Mã cứu hộ:</Text>
              <Text style={styles.successDetailCode}>{successData.sosCode}</Text>
            </View>

            <View style={styles.successDetailRow}>
              <Text style={styles.successDetailLabel}>Vị trí cứu nạn:</Text>
              <Text style={styles.successDetailValue} numberOfLines={2}>
                {successData.address}
              </Text>
            </View>

            {successData.contactPhone ? (
              <View style={styles.successDetailRow}>
                <Text style={styles.successDetailLabel}>SĐT liên hệ hiện trường:</Text>
                <Text style={[styles.successDetailValue, { color: '#0284C7', fontWeight: '800' }]}>
                  {successData.contactPhone}
                </Text>
              </View>
            ) : null}

            <View style={styles.successDetailRow}>
              <Text style={styles.successDetailLabel}>Số người cần cứu:</Text>
              <Text style={[styles.successDetailValue, { fontWeight: '700' }]}>
                {successData.people} người
              </Text>
            </View>

            {successData.priorities && successData.priorities.length > 0 ? (
              <View style={styles.successDetailRow}>
                <Text style={styles.successDetailLabel}>Đối tượng ưu tiên:</Text>
                <Text style={[styles.successDetailValue, { color: '#DC2626', fontWeight: '700' }]}>
                  {successData.priorities.join(', ')}
                </Text>
              </View>
            ) : null}

            <View style={styles.successDetailRow}>
              <Text style={styles.successDetailLabel}>Tình trạng khai báo:</Text>
              <Text style={styles.successDetailValue} numberOfLines={2}>
                {successData.description}
              </Text>
            </View>

            <View style={styles.successDetailRow}>
              <Text style={styles.successDetailLabel}>Ảnh hiện trường:</Text>
              <Text style={[styles.successDetailValue, { color: successData.hasImage ? '#10B981' : '#64748B' }]}>
                {successData.hasImage ? '✓ Đã đính kèm ảnh' : 'Không có ảnh'}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 18 }}>
            <TouchableOpacity
              style={[styles.doneBtn, { flex: 1, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1' }]}
              onPress={() => {
                setSuccessData(null);
                setDescription('');
                setImageUri(null);
                setImageBase64(null);
                setContactPhone('');
                setSelectedPriorities([]);
                setCustomAddress('');
                setLocationMode('current_gps');
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.doneBtnText, { color: '#0F172A' }]}>GỬI YÊU CẦU MỚI</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.doneBtn, { flex: 1 }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.doneBtnText}>{isTab ? 'VỀ TRANG CHỦ' : 'HOÀN TẤT & ĐÓNG'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {onClose ? (
          <TouchableOpacity style={styles.backButton} onPress={onClose} activeOpacity={0.7}>
            <Feather name={isTab ? 'home' : 'x'} size={22} color="#0F172A" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>CỨU HỘ NGẬP LỤT KHẨN CẤP</Text>
          <Text style={styles.headerSubTitle}>Gửi trực tiếp tới Đội cứu hộ & Ca-nô/Xuồng</Text>
        </View>
        <TouchableOpacity style={styles.reloadGpsBtn} onPress={fetchLocation} activeOpacity={0.7} accessibilityLabel="Lấy lại GPS">
          <Feather name="refresh-cw" size={18} color="#0284C7" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* MỤC: CHỌN VỊ TRÍ CỨU HỘ (GPS HIỆN TẠI HOẶC BÁO HỘ NGƯỜI THÂN) */}
          <View style={styles.gpsCard}>
            <View style={styles.locationSwitcherWrap}>
              <TouchableOpacity
                style={[
                  styles.switcherTabBtn,
                  locationMode === 'current_gps' && styles.switcherTabBtnActive,
                ]}
                onPress={() => setLocationMode('current_gps')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="navigate"
                  size={14}
                  color={locationMode === 'current_gps' ? '#0284C7' : '#64748B'}
                />
                <Text
                  style={[
                    styles.switcherTabText,
                    locationMode === 'current_gps' && styles.switcherTabTextActive,
                  ]}
                >
                  Vị trí của tôi (GPS)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.switcherTabBtn,
                  locationMode === 'custom_location' && styles.switcherTabBtnActive,
                ]}
                onPress={() => {
                  setLocationMode('custom_location');
                  setTimeout(() => customAddressInputRef.current?.focus(), 200);
                }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="people"
                  size={14}
                  color={locationMode === 'custom_location' ? '#0284C7' : '#64748B'}
                />
                <Text
                  style={[
                    styles.switcherTabText,
                    locationMode === 'custom_location' && styles.switcherTabTextActive,
                  ]}
                >
                  Báo hộ người thân / Nơi khác
                </Text>
              </TouchableOpacity>
            </View>

            {locationMode === 'current_gps' ? (
              <View style={styles.gpsDetailsBlock}>
                <View style={styles.gpsHeader}>
                  <View style={styles.gpsTitleRow}>
                    <Ionicons name="location" size={17} color="#EF4444" />
                    <Text style={styles.gpsSectionTitle}>Vị trí GPS của bạn (Tự động)</Text>
                  </View>
                  {locating ? (
                    <ActivityIndicator size="small" color="#0284C7" />
                  ) : (
                    <View style={styles.gpsBadge}>
                      <View style={styles.gpsDot} />
                      <Text style={styles.gpsBadgeText}>Đã định vị</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.gpsAddressText}>{address}</Text>

                {location && (
                  <Text style={styles.gpsCoordsText}>
                    Tọa độ: {location.coords.latitude.toFixed(5)}, {location.coords.longitude.toFixed(5)} (±{Math.round(location.coords.accuracy || 10)}m)
                  </Text>
                )}
              </View>
            ) : (
              <View style={styles.customAddressBlock}>
                <View style={styles.customAddressHeader}>
                  <Ionicons name="home-outline" size={16} color="#0284C7" />
                  <Text style={styles.customAddressLabel}>
                    Địa chỉ nơi người thân/bạn bè đang gặp nạn:
                  </Text>
                </View>
                <TextInput
                  ref={customAddressInputRef}
                  style={styles.customAddressInput}
                  multiline
                  numberOfLines={2}
                  placeholder="Ví dụ: Số 45 Hoàng Diệu, P. Hòa Thuận Tây, Q. Hải Châu, Đà Nẵng..."
                  placeholderTextColor="#94A3B8"
                  value={customAddress}
                  onChangeText={setCustomAddress}
                />
                <Text style={styles.customAddressHint}>
                  💡 Dùng khi bạn đang ở nơi an toàn nhưng cần báo cứu nạn khẩn cấp cho người thân tại điểm ngập.
                </Text>
              </View>
            )}
          </View>

          {/* MỤC: SỐ ĐIỆN THOẠI LIÊN HỆ TẠI ĐIỂM NGẬP */}
          <View style={styles.formCard}>
            <View style={styles.cardHeaderRow}>
              <Feather name="phone-call" size={17} color="#0284C7" />
              <Text style={styles.cardHeading}>Số điện thoại liên hệ người gặp nạn</Text>
            </View>
            <Text style={styles.cardSubText}>
              Nhập SĐT người gặp nạn hoặc người thân tại hiện trường để Chính quyền & Đội cứu hộ gọi lại trực tiếp:
            </Text>

            <View style={styles.phoneInputWrap}>
              <Feather name="phone" size={16} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.phoneInput}
                keyboardType="phone-pad"
                placeholder="Ví dụ: 0912 345 678"
                placeholderTextColor="#94A3B8"
                value={contactPhone}
                onChangeText={setContactPhone}
                maxLength={15}
              />
            </View>
          </View>

          {/* MỤC 1: SỐ LƯỢNG NGƯỜI CẦN CỨU (Thu nhỏ nút bấm tỉ lệ hài hòa) */}
          <View style={styles.formCard}>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons name="account-group" size={18} color="#0284C7" />
              <Text style={styles.cardHeading}>1. Số người cần cứu</Text>
            </View>
            <Text style={styles.cardSubText}>
              Nhập số lượng người cần ca-nô/xuồng ứng cứu:
            </Text>

            {/* Bộ đếm số người nhỏ gọn, cân đối */}
            <View style={styles.peopleInputRowCompact}>
              <TouchableOpacity
                style={styles.counterBtnCompact}
                onPress={() => handleAdjustPeople(-1)}
                activeOpacity={0.7}
              >
                <Feather name="minus" size={17} color="#0F172A" />
              </TouchableOpacity>

              <View style={styles.peopleBoxCompact}>
                <TextInput
                  style={styles.peopleInputCompact}
                  keyboardType="numeric"
                  value={peopleText}
                  onChangeText={setPeopleText}
                  selectTextOnFocus
                  maxLength={4}
                />
                <Text style={styles.peopleUnitCompact}>người</Text>
              </View>

              <TouchableOpacity
                style={styles.counterBtnCompact}
                onPress={() => handleAdjustPeople(1)}
                activeOpacity={0.7}
              >
                <Feather name="plus" size={17} color="#0F172A" />
              </TouchableOpacity>
            </View>
          </View>

          {/* MỤC 2: ĐỐI TƯỢNG CẦN ƯU TIÊN ĐẶC BIỆT */}
          <View style={styles.formCard}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#DC2626" />
              <Text style={styles.cardHeading}>2. Đối tượng cần ưu tiên (nếu có)</Text>
            </View>
            <Text style={styles.cardSubText}>
              Chọn các trường hợp dễ tổn thương để lực lượng cứu hộ ưu tiên điều phối trước:
            </Text>

            <View style={styles.priorityChipsWrap}>
              {PRIORITY_OPTIONS.map((opt) => {
                const isSelected = selectedPriorities.includes(opt.id);
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.priorityChip,
                      isSelected && styles.priorityChipSelected,
                    ]}
                    onPress={() => togglePriority(opt.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.priorityChipEmoji}>{opt.emoji}</Text>
                    <Text
                      style={[
                        styles.priorityChipText,
                        isSelected && styles.priorityChipTextSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={14}
                        color="#DC2626"
                        style={{ marginLeft: 4 }}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* MỤC 3: MÔ TẢ TÌNH TRẠNG CỤ THỂ CỦA BẠN */}
          <View style={styles.formCard}>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons name="comment-text-outline" size={18} color="#EF4444" />
              <Text style={styles.cardHeading}>3. Tình trạng ngập lụt thực tế</Text>
            </View>
            <Text style={styles.cardSubText}>
              Mô tả tình trạng cụ thể (mức nước ngập, vị trí đứng trú ẩn...):
            </Text>

            <TextInput
              ref={descInputRef}
              style={styles.descInput}
              multiline
              numberOfLines={4}
              placeholder="Ví dụ: Nước ngập tầng 1 cao 1m5, đang trèo lên mái nhà, cần xuồng cứu gấp..."
              placeholderTextColor="#94A3B8"
              value={description}
              onChangeText={setDescription}
            />
          </View>

          {/* MỤC 4: ẢNH HIỆN TRƯỜNG THỰC TẾ (Không bắt buộc) */}
          <View style={styles.formCard}>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons name="camera" size={18} color="#059669" />
              <Text style={styles.cardHeading}>4. Ảnh hiện trường (Không bắt buộc)</Text>
            </View>
            <Text style={styles.cardSubText}>
              Chụp ảnh mức nước ngập (bỏ qua nếu nước đang chảy xiết):
            </Text>

            <View style={styles.photoActionsRow}>
              <TouchableOpacity style={styles.photoBtn} onPress={takePhoto} activeOpacity={0.75}>
                <Feather name="camera" size={16} color="#0284C7" />
                <Text style={styles.photoBtnText}>Chụp ảnh nước ngập</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.photoBtn} onPress={pickImage} activeOpacity={0.75}>
                <Feather name="image" size={16} color="#0284C7" />
                <Text style={styles.photoBtnText}>Chọn ảnh từ máy</Text>
              </TouchableOpacity>
            </View>

            {imageUri && (
              <View style={styles.imagePreviewWrap}>
                <Image source={{ uri: imageUri }} style={styles.previewImage} />
                <TouchableOpacity style={styles.removeImgBtn} onPress={removeImage} activeOpacity={0.8}>
                  <Ionicons name="close-circle" size={26} color="#DC2626" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* NÚT GỬI CỨU HỘ TO RÕ RÀNG */}
          <TouchableOpacity
            style={styles.mainSendBtn}
            onPress={() => submitSOS()}
            disabled={sending}
            activeOpacity={0.85}
          >
            {sending ? (
              <View style={styles.sendingRow}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.mainSendBtnText}>ĐANG PHÁT TÍN HIỆU CỨU NẠN...</Text>
              </View>
            ) : (
              <View style={styles.sendingRow}>
                <MaterialCommunityIcons name="waves" size={22} color="#FFFFFF" />
                <Text style={styles.mainSendBtnText}>GỬI YÊU CẦU CỨU HỘ NGẬP LỤT</Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* POPUP XÁC THỰC NHẬP FORM */}
      <Modal
        visible={validationModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setValidationModalVisible(false)}
      >
        <View style={styles.valModalBackdrop}>
          <View style={styles.valModalCard}>
            <View
              style={[
                styles.valBadgeWrap,
                validationType === 'desc'
                  ? { backgroundColor: '#EFF6FF', borderColor: '#BAE6FD' }
                  : { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
              ]}
            >
              {validationType === 'desc' ? (
                <MaterialCommunityIcons name="comment-alert" size={36} color="#0284C7" />
              ) : validationType === 'people' ? (
                <MaterialCommunityIcons name="account-alert" size={36} color="#D97706" />
              ) : validationType === 'address' ? (
                <MaterialCommunityIcons name="home-alert" size={36} color="#D97706" />
              ) : (
                <MaterialCommunityIcons name="crosshairs-gps" size={36} color="#D97706" />
              )}
            </View>

            <Text style={styles.valTitle}>
              {validationType === 'desc'
                ? 'Chưa Nhập Tình Trạng Ngập'
                : validationType === 'people'
                ? 'Chưa Nhập Số Người Cần Cứu'
                : validationType === 'address'
                ? 'Chưa Nhập Địa Chỉ Người Thân'
                : 'Chưa Xác Định Tọa Độ GPS'}
            </Text>

            <Text style={styles.valDesc}>
              {validationType === 'desc'
                ? 'Vui lòng mô tả tình hình thực tế (mức nước ngập, vị trí đứng trú ẩn...) ở Mục 3 để Đội cứu nạn chuẩn bị đúng phương tiện ứng cứu chính xác.'
                : validationType === 'people'
                ? 'Vui lòng nhập số người đang gặp nạn (tối thiểu 1 người) để lực lượng cứu hộ bố trí xuồng hoặc ca-nô đủ chỗ đón.'
                : validationType === 'address'
                ? 'Vui lòng nhập rõ số nhà, ngõ, tên đường, phường/xã nơi người thân đang gặp nạn để lực lượng cứu hộ tiếp cận chính xác.'
                : 'Hệ thống đang dò GPS của bạn. Vui lòng bật vị trí để Đội cứu hộ định vị chính xác địa điểm ngập.'}
            </Text>

            {validationType === 'desc' ? (
              <View style={styles.valActionsCol}>
                <TouchableOpacity
                  style={styles.valActionPrimary}
                  activeOpacity={0.85}
                  onPress={() => {
                    setValidationModalVisible(false);
                    setTimeout(() => descInputRef.current?.focus(), 200);
                  }}
                >
                  <Feather name="edit-3" size={16} color="#FFFFFF" />
                  <Text style={styles.valActionPrimaryText}>Điền mô tả tình trạng ngay</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.valDismissBtn}
                  activeOpacity={0.7}
                  onPress={() => setValidationModalVisible(false)}
                >
                  <Text style={styles.valDismissText}>Đóng lại</Text>
                </TouchableOpacity>
              </View>
            ) : validationType === 'address' ? (
              <View style={styles.valActionsCol}>
                <TouchableOpacity
                  style={styles.valActionPrimary}
                  activeOpacity={0.85}
                  onPress={() => {
                    setValidationModalVisible(false);
                    setTimeout(() => customAddressInputRef.current?.focus(), 200);
                  }}
                >
                  <Feather name="map-pin" size={16} color="#FFFFFF" />
                  <Text style={styles.valActionPrimaryText}>Nhập địa chỉ cứu nạn ngay</Text>
                </TouchableOpacity>
              </View>
            ) : validationType === 'people' ? (
              <View style={styles.valActionsCol}>
                <TouchableOpacity
                  style={styles.valActionPrimary}
                  activeOpacity={0.85}
                  onPress={() => setValidationModalVisible(false)}
                >
                  <Text style={styles.valActionPrimaryText}>Đã hiểu, tôi sẽ nhập ngay</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.valActionsCol}>
                <TouchableOpacity
                  style={styles.valActionPrimary}
                  activeOpacity={0.85}
                  onPress={() => {
                    setValidationModalVisible(false);
                    fetchLocation();
                  }}
                >
                  <Feather name="refresh-cw" size={16} color="#FFFFFF" />
                  <Text style={styles.valActionPrimaryText}>Lấy lại tọa độ GPS</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 42 : 54,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  headerSubTitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  reloadGpsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 110, // Đảm bảo cuộn qua khỏi Bottom Navigation Bar
  },

  // THẺ VỊ TRÍ & BỘ CHUYỂN ĐỔI CHẾ ĐỘ
  gpsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  locationSwitcherWrap: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  switcherTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    gap: 5,
  },
  switcherTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  switcherTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  switcherTabTextActive: {
    color: '#0284C7',
    fontWeight: '700',
  },
  gpsDetailsBlock: {
    paddingTop: 2,
  },
  gpsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  gpsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gpsSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 6,
  },
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  gpsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  gpsBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  gpsAddressText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
    lineHeight: 19,
  },
  gpsCoordsText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },

  // KHỐI NHẬP ĐỊA CHỈ NGƯỜI THÂN
  customAddressBlock: {
    paddingTop: 2,
  },
  customAddressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  customAddressLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  customAddressInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    padding: 10,
    fontSize: 13.5,
    color: '#0F172A',
    minHeight: 65,
    textAlignVertical: 'top',
    lineHeight: 19,
  },
  customAddressHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 16,
  },

  // THẺ FORM CHUNG
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardHeading: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardSubText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 3,
    marginBottom: 10,
    lineHeight: 16,
  },

  // Ô NHẬP SĐT LIÊN HỆ
  phoneInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  phoneInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },

  // BỘ ĐẾM SỐ NGƯỜI NHỎ GỌN, HÀI HÒA
  peopleInputRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  counterBtnCompact: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  peopleBoxCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#0284C7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginHorizontal: 12,
    minWidth: 100,
  },
  peopleInputCompact: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0284C7',
    textAlign: 'center',
    minWidth: 40,
  },
  peopleUnitCompact: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284C7',
    marginLeft: 4,
  },

  // CHIPS ĐỐI TƯỢNG ƯU TIÊN
  priorityChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  priorityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  priorityChipSelected: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
    borderWidth: 1.5,
  },
  priorityChipEmoji: {
    fontSize: 14,
    marginRight: 6,
  },
  priorityChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  priorityChipTextSelected: {
    color: '#DC2626',
    fontWeight: '700',
  },

  // Ô NHẬP MÔ TẢ
  descInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 12,
    fontSize: 13.5,
    color: '#0F172A',
    minHeight: 80,
    textAlignVertical: 'top',
    lineHeight: 19,
  },

  // NÚT CHỤP / CHỌN ẢNH
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
    borderRadius: 14,
  },

  // NÚT GỬI CỨU HỘ
  mainSendBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  sendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mainSendBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // MÀN HÌNH THÀNH CÔNG
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
    color: '#0284C7',
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
    backgroundColor: '#0284C7',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  // POPUP VALIDATION
  valModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  valModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  valBadgeWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    marginBottom: 12,
  },
  valTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  valDesc: {
    fontSize: 12.5,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  valActionsCol: {
    width: '100%',
  },
  valActionPrimary: {
    backgroundColor: '#0284C7',
    borderRadius: 12,
    paddingVertical: 12,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  valActionPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  valDismissBtn: {
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  valDismissText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
});

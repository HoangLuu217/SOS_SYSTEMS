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
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Feather, MaterialCommunityIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { backendApi } from '../services/backendApi';
import { useAuth } from '../context/AuthContext';

// Danh sách các loại yêu cầu cứu trợ
const REQUEST_TYPES = [
  { id: 'FLOOD', label: 'Cứu hộ ngập lụt / Mắc kẹt', emoji: '🌊' },
  { id: 'MEDICAL', label: 'Cấp cứu y tế / Bị thương', emoji: '🏥' },
  { id: 'FOOD', label: 'Tiếp tế lương thực & Nước uống', emoji: '🍞' },
  { id: 'EVACUATION', label: 'Sơ tán khẩn cấp (Người già, Trẻ em)', emoji: '👵' },
  { id: 'LANDSLIDE', label: 'Sạt lở đất / Đổ sập', emoji: '⚠️' },
  { id: 'OTHER', label: 'Yêu cầu cứu hộ khác', emoji: '❓' },
];

// Danh sách đối tượng ưu tiên mẫu (hỗ trợ tìm kiếm theo từ khóa)
const PRIORITY_SUGGESTIONS = [
  { id: 'PREGNANT', label: 'Phụ nữ mang thai / Sắp sinh', icon: 'female', color: '#EF4444' },
  { id: 'CHILD_UNDER_5', label: 'Trẻ em dưới 5 tuổi', icon: 'child', color: '#0284C7' },
  { id: 'INFANT', label: 'Trẻ sơ sinh (< 1 tuổi)', icon: 'baby', color: '#EC4899' },
  { id: 'ELDERLY', label: 'Người cao tuổi (> 65 tuổi)', icon: 'blind', color: '#D97706' },
  { id: 'DISABILITY', label: 'Người khuyết tật / Đi lại khó khăn', icon: 'wheelchair', color: '#8B5CF6' },
  { id: 'SICK_SEVERE', label: 'Người bệnh nặng / Đang điều trị', icon: 'procedures', color: '#DC2626' },
  { id: 'KIDNEY_DIALYSIS', label: 'Bệnh nhân suy thận / Cần chạy thận', icon: 'heartbeat', color: '#059669' },
  { id: 'INJURED', label: 'Người bị thương / Chảy máu', icon: 'user-injured', color: '#EA580C' },
  { id: 'NON_SWIMMER', label: 'Người không biết bơi', icon: 'life-ring', color: '#2563EB' },
  { id: 'ISOLATED_ROOF', label: 'Mắc kẹt trên mái nhà / Nóc nhà', icon: 'home', color: '#7C3AED' },
];

// Các gợi ý nhanh phổ biến (1 chạm)
const QUICK_PRIORITY_TAGS = [
  { label: 'Phụ nữ có thai', icon: 'female', color: '#EF4444' },
  { label: 'Trẻ em dưới 5 tuổi', icon: 'child', color: '#0284C7' },
  { label: 'Người cao tuổi', icon: 'blind', color: '#D97706' },
  { label: 'Người bệnh / khuyết tật', icon: 'wheelchair', color: '#8B5CF6' },
];

interface SOSMapScreenProps {
  onClose?: () => void;
  initialEmergencyType?: string;
  isTab?: boolean;
}

export const SOSMapScreen: React.FC<SOSMapScreenProps> = ({ onClose, isTab = false }) => {
  const { user, updateUserProfile } = useAuth();
  const profilePhone = user?.phone || (user as any)?.phoneNumber || '';
  const hasProfilePhone = Boolean(profilePhone);

  // Loại yêu cầu
  const [requestType, setRequestType] = useState<string>('FLOOD');
  const [showTypeModal, setShowTypeModal] = useState<boolean>(false);

  // Số người cần cứu (người dùng có thể tự gõ số hoặc bấm nút +/-)
  const [peopleCount, setPeopleCount] = useState<number>(1);
  const [peopleInput, setPeopleInput] = useState<string>('1');

  // Số điện thoại chính & số điện thoại phụ (lấy mặc định từ profile)
  const [phone, setPhone] = useState<string>(profilePhone);
  const [secondaryPhone, setSecondaryPhone] = useState<string>('');
  const [showSecondaryPhone, setShowSecondaryPhone] = useState<boolean>(false);

  // Nội dung mô tả (0/500 ký tự)
  const [description, setDescription] = useState<string>('');

  // GPS & Địa điểm
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [gpsAddress, setGpsAddress] = useState<string>('Đang định vị...');
  const [locating, setLocating] = useState<boolean>(true);
  const [detailedAddress, setDetailedAddress] = useState<string>('');
  const [isCustomMapLocation, setIsCustomMapLocation] = useState<boolean>(false);

  // Modal Bản đồ chọn vị trí
  const [showMapPickerModal, setShowMapPickerModal] = useState<boolean>(false);
  const [pickerCoords, setPickerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickerAddress, setPickerAddress] = useState<string>('');
  const [isReverseGeocoding, setIsReverseGeocoding] = useState<boolean>(false);
  const mapPickerWebViewRef = useRef<WebView>(null);
  const peopleInputRef = useRef<TextInput>(null);

  // Đối tượng ưu tiên (Nhập tìm kiếm keyword + Gợi ý dropdown)
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [prioritySearchText, setPrioritySearchText] = useState<string>('');
  const [isPriorityDropdownOpen, setIsPriorityDropdownOpen] = useState<boolean>(false);

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

  // Lấy vị trí GPS thực tế của máy
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
      setIsCustomMapLocation(false);

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

  // Tự động điền số điện thoại từ hồ sơ cá nhân nếu chưa có
  useEffect(() => {
    const existing = user?.phone || (user as any)?.phoneNumber || '';
    if (existing && !phone) {
      setPhone(existing);
    }
  }, [user]);

  // Cập nhật số người (đồng bộ giữa số đếm và ô nhập liệu)
  const handleSetPeople = (num: number) => {
    const valid = Math.min(999, Math.max(1, num));
    setPeopleCount(valid);
    setPeopleInput(String(valid));
  };

  // Tăng giảm số người
  const handleAdjustPeople = (delta: number) => {
    handleSetPeople(peopleCount + delta);
  };

  // Mở modal bản đồ chọn vị trí
  const openMapPicker = () => {
    const currentLat = location?.coords?.latitude || 15.96836;
    const currentLng = location?.coords?.longitude || 108.26054;
    setPickerCoords({ lat: currentLat, lng: currentLng });
    setPickerAddress(gpsAddress.includes('Đang định vị') ? 'Chạm vào vị trí trên bản đồ để chọn' : gpsAddress);
    setShowMapPickerModal(true);
  };

  // Xử lý khi người dùng chạm vào vị trí bất kỳ trên bản đồ WebView
  const handleMapPickerMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'MAP_CLICK') {
        const { lat, lng } = data;
        setPickerCoords({ lat, lng });
        setIsReverseGeocoding(true);
        try {
          const [geo] = await Location.reverseGeocodeAsync({
            latitude: lat,
            longitude: lng,
          });
          if (geo) {
            const parts = [
              geo.streetNumber,
              geo.street,
              geo.subregion,
              geo.district,
              geo.city || geo.region,
            ].filter(Boolean);
            const addr = parts.length > 0 ? parts.join(', ') : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            setPickerAddress(addr);
          } else {
            setPickerAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
          }
        } catch {
          setPickerAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        } finally {
          setIsReverseGeocoding(false);
        }
      }
    } catch {
      // Bỏ qua lỗi parse
    }
  };

  // Quay lại vị trí GPS của máy trong Modal bản đồ
  const moveToMyGps = async () => {
    try {
      setIsReverseGeocoding(true);
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = current.coords.latitude;
      const lng = current.coords.longitude;
      setPickerCoords({ lat, lng });
      mapPickerWebViewRef.current?.injectJavaScript(`window.setMapLocation(${lat}, ${lng}); true;`);
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (geo) {
          const parts = [geo.streetNumber, geo.street, geo.subregion, geo.district, geo.city || geo.region].filter(Boolean);
          setPickerAddress(parts.join(', '));
        }
      } catch {
        setPickerAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
    } catch {
      Alert.alert('Không thể lấy GPS', 'Vui lòng kiểm tra quyền truy cập vị trí của ứng dụng.');
    } finally {
      setIsReverseGeocoding(false);
    }
  };

  // Xác nhận vị trí đã chọn trên bản đồ
  const handleConfirmMapLocation = () => {
    if (pickerCoords) {
      setLocation({
        coords: {
          latitude: pickerCoords.lat,
          longitude: pickerCoords.lng,
          altitude: null,
          accuracy: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      });
      setGpsAddress(pickerAddress || `${pickerCoords.lat.toFixed(5)}, ${pickerCoords.lng.toFixed(5)}`);
      setIsCustomMapLocation(true);
    }
    setShowMapPickerModal(false);
  };

  // HTML bản đồ chọn vị trí Leaflet
  const generatePickerMapHtml = (lat: number, lng: number) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; overflow: hidden; background-color: #f1f5f9; }
        @keyframes pulseWave {
          0% { transform: scale(0.6); opacity: 0.95; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .sos-picker-pin {
          position: relative;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sos-picker-wave {
          position: absolute;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background-color: rgba(2, 132, 199, 0.45);
          border: 2px solid #0284C7;
          animation: pulseWave 1.5s ease-out infinite;
        }
        .sos-picker-core {
          position: relative;
          width: 32px;
          height: 32px;
          background: #0284C7;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 0 10px rgba(2, 132, 199, 0.8), 0 3px 6px rgba(0,0,0,0.3);
          border: 2.5px solid white;
          z-index: 2;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([${lat}, ${lng}], 16);
        L.control.zoom({ position: 'topright' }).addTo(map);

        L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&apistyle=s.t:33|p.v:off%2Cs.t:21|s.e:l|p.v:off&x={x}&y={y}&z={z}', {
          subdomains: ['0', '1', '2', '3'],
          maxZoom: 20
        }).addTo(map);

        var pinIcon = L.divIcon({
          html: '<div class="sos-picker-pin"><div class="sos-picker-wave"></div><div class="sos-picker-core"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg></div></div>',
          className: 'custom-picker-pin',
          iconSize: [44, 44],
          iconAnchor: [22, 22]
        });

        var marker = L.marker([${lat}, ${lng}], { icon: pinIcon }).addTo(map);

        map.on('click', function(e) {
          marker.setLatLng(e.latlng);
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'MAP_CLICK',
              lat: e.latlng.lat,
              lng: e.latlng.lng
            }));
          }
        });

        window.setMapLocation = function(newLat, newLng) {
          map.setView([newLat, newLng], 16);
          marker.setLatLng([newLat, newLng]);
        };
      </script>
    </body>
    </html>
  `;

  // Xử lý đối tượng ưu tiên
  const handleAddCustomPriority = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!selectedPriorities.includes(trimmed)) {
      setSelectedPriorities((prev) => [...prev, trimmed]);
    }
    setPrioritySearchText('');
    setIsPriorityDropdownOpen(false);
  };

  const handleTogglePriority = (label: string) => {
    if (selectedPriorities.includes(label)) {
      setSelectedPriorities((prev) => prev.filter((p) => p !== label));
    } else {
      setSelectedPriorities((prev) => [...prev, label]);
    }
  };

  const handleRemovePriority = (label: string) => {
    setSelectedPriorities((prev) => prev.filter((p) => p !== label));
  };

  const filteredPrioritySuggestions = PRIORITY_SUGGESTIONS.filter((s) =>
    s.label.toLowerCase().includes(prioritySearchText.trim().toLowerCase())
  );

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
    // 1. Kiểm tra số điện thoại (bắt buộc - lấy từ hồ sơ hoặc người dùng nhập bổ sung)
    if (!phone.trim()) {
      setValidationMessage('Tài khoản chưa có số điện thoại. Vui lòng nhập số điện thoại để Đội cứu hộ có thể liên lạc khẩn cấp và cập nhật vào hồ sơ!');
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
      const priorityLabels = selectedPriorities;

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

        // Nếu tài khoản chưa có số điện thoại thì tự động lưu vào hồ sơ cá nhân
        if (!user?.phone && phone.trim()) {
          updateUserProfile({ phone: phone.trim() }).catch(() => {});
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
            <Ionicons name="checkmark-circle" size={70} color="#0284C7" />
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
                setPeopleCount(1);
                setPeopleInput('1');
                setPhone(user?.phone || '');
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
              style={[styles.doneBtn, { flex: 1, backgroundColor: '#0284C7' }]}
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
      {/* HEADER PHONG CÁCH XANH DƯƠNG THANH LỊCH */}
      <View style={styles.header}>
        {onClose ? (
          <TouchableOpacity style={styles.backButton} onPress={onClose} activeOpacity={0.7}>
            <Feather name={isTab ? 'home' : 'chevron-left'} size={22} color="#0F172A" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Đăng tin cần cứu trợ</Text>
          <Text style={styles.headerSubTitle}>Gửi thông tin để được hỗ trợ kịp thời</Text>
        </View>

        <TouchableOpacity
          style={styles.reloadGpsBtn}
          onPress={fetchLocation}
          activeOpacity={0.7}
        >
          <Feather name="refresh-cw" size={17} color="#0284C7" />
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
          {/* 1. LOẠI YÊU CẦU * */}
          <View style={styles.formCard}>
            <View style={styles.fieldHeaderRow}>
              <View style={styles.fieldBadgeIcon}>
                <Ionicons name="alert-circle" size={16} color="#0284C7" />
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

          {/* 2. SỐ NGƯỜI * (CÓ THỂ BẤM CHỌN NHANH 1, 2, 3... HOẶC TỰ GÕ SỐ TRỰC TIẾP) */}
          <View style={styles.formCard}>
            <View style={styles.betweenHeaderRow}>
              <View style={styles.fieldHeaderRow}>
                <View style={styles.fieldBadgeIcon}>
                  <MaterialCommunityIcons name="account-group" size={16} color="#0284C7" />
                </View>
                <Text style={styles.fieldTitle}>
                  Số người <Text style={styles.requiredStar}>*</Text>
                </Text>
              </View>

              {/* Stepper có thể tự gõ số hoặc bấm nút +/- */}
              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  style={styles.stepperActionBtn}
                  onPress={() => handleAdjustPeople(-1)}
                  activeOpacity={0.7}
                >
                  <Feather name="minus" size={16} color="#475569" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.stepperValueBox}
                  activeOpacity={0.8}
                  onPress={() => peopleInputRef.current?.focus()}
                >
                  <TextInput
                    ref={peopleInputRef}
                    style={styles.stepperInput}
                    keyboardType="number-pad"
                    value={peopleInput}
                    onChangeText={(txt) => {
                      const cleaned = txt.replace(/[^0-9]/g, '');
                      setPeopleInput(cleaned);
                      if (cleaned) {
                        const parsed = parseInt(cleaned, 10);
                        if (parsed > 0) setPeopleCount(Math.min(999, parsed));
                      }
                    }}
                    onBlur={() => {
                      if (!peopleInput || parseInt(peopleInput, 10) < 1) {
                        setPeopleInput('1');
                        setPeopleCount(1);
                      } else {
                        const parsed = Math.min(999, parseInt(peopleInput, 10));
                        setPeopleInput(String(parsed));
                        setPeopleCount(parsed);
                      }
                    }}
                    maxLength={3}
                    selectTextOnFocus
                  />
                  <Text style={styles.stepperUnitText}>người</Text>
                </TouchableOpacity>

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

          {/* 3. SỐ ĐIỆN THOẠI * (LẤY TỰ ĐỘNG TỪ HỒ SƠ, KÈM NÚT + THÊM SỐ BÊN PHẢI) */}
          <View style={styles.formCard}>
            <View style={styles.betweenHeaderRow}>
              <View style={styles.fieldHeaderRow}>
                <View style={styles.fieldBadgeIcon}>
                  <Ionicons name="call" size={14} color="#0284C7" />
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
                  <Ionicons name="add-circle" size={15} color="#0284C7" />
                  <Text style={styles.addPhoneBtnText}>Thêm số</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Thông báo tình trạng số điện thoại trong hồ sơ */}
            {!hasProfilePhone ? (
              <View style={styles.phoneMissingContainer}>
                <View style={styles.profilePhoneMissingTag}>
                  <Feather name="alert-circle" size={12} color="#DC2626" style={{ marginRight: 4 }} />
                  <Text style={styles.profilePhoneMissingTagText}>Chưa có trong hồ sơ</Text>
                </View>
              </View>
            ) : (
              <View style={styles.phoneProfileAutoFilledRow}>
                <Ionicons name="checkmark-circle" size={13} color="#0284C7" />
                <Text style={styles.phoneProfileAutoFilledText}>
                  Đã tự động điền từ hồ sơ cá nhân
                </Text>
              </View>
            )}

            {/* Ô nhập SĐT chính */}
            <View style={styles.inputWrapWithIcon}>
              <Feather name="phone" size={16} color="#94A3B8" style={styles.inputLeadingIcon} />
              <TextInput
                style={styles.textInputInside}
                placeholder="Vui lòng nhập số điện thoại để cứu hộ liên lạc"
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
          <View style={styles.formCard}>
            <View style={styles.fieldHeaderRow}>
              <View style={styles.fieldBadgeIcon}>
                <MaterialCommunityIcons name="square-edit-outline" size={16} color="#0284C7" />
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

          {/* 5. ĐỊA ĐIỂM * (CHỌN TRỰC TIẾP TRÊN BẢN ĐỒ & NHẬP SỐ NHÀ, TÊN ĐƯỜNG) */}
          <View style={styles.formCard}>
            <View style={styles.betweenHeaderRow}>
              <View style={styles.fieldHeaderRow}>
                <View style={styles.fieldBadgeIcon}>
                  <Ionicons name="location" size={16} color="#0284C7" />
                </View>
                <Text style={styles.fieldTitle}>
                  Địa điểm <Text style={styles.requiredStar}>*</Text>
                </Text>
              </View>

              {/* Nút mở bản đồ để ghim vị trí */}
              <TouchableOpacity
                style={styles.openMapBtnHeader}
                onPress={openMapPicker}
                activeOpacity={0.75}
              >
                <Feather name="map" size={13} color="#0284C7" />
                <Text style={styles.openMapBtnHeaderText}>Chọn trên bản đồ</Text>
              </TouchableOpacity>
            </View>

            {/* Thẻ hiển thị vị trí (chạm vào để mở bản đồ chọn vị trí mới) */}
            <TouchableOpacity
              style={[styles.locationSelectorCard, isCustomMapLocation && styles.locationSelectorCardCustom]}
              onPress={openMapPicker}
              activeOpacity={0.8}
            >
              <View style={styles.locationSelectorLeft}>
                <Ionicons
                  name={isCustomMapLocation ? "pin" : "location-sharp"}
                  size={19}
                  color="#0284C7"
                />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Text style={styles.locationModeBadge}>
                      {isCustomMapLocation ? 'ĐÃ GHIM TRÊN BẢN ĐỒ' : 'GPS THIẾT BỊ'}
                    </Text>
                    <Text style={styles.locationModeHint}>(Chạm để đổi vị trí)</Text>
                  </View>
                  <Text style={styles.locationSelectorText} numberOfLines={2}>
                    {locating ? 'Đang xác định vị trí...' : gpsAddress ? gpsAddress : 'Chạm để chọn vị trí trên bản đồ'}
                  </Text>
                </View>
              </View>

              <View style={styles.mapPinActionBtn}>
                <Feather name="map-pin" size={15} color="#0284C7" />
              </View>
            </TouchableOpacity>

            {/* Nút quay lại GPS của thiết bị nếu đang dùng vị trí ghim */}
            {isCustomMapLocation && (
              <TouchableOpacity
                style={styles.resetGpsBtn}
                onPress={fetchLocation}
                activeOpacity={0.7}
              >
                <Feather name="crosshair" size={14} color="#0284C7" />
                <Text style={styles.resetGpsText}>Quay lại vị trí GPS của máy tôi</Text>
              </TouchableOpacity>
            )}

            {/* Ô nhập số nhà, tên đường, thôn ấp chi tiết */}
            <View style={[styles.inputWrapWithIcon, { marginTop: 8 }]}>
              <Feather name="home" size={16} color="#94A3B8" style={styles.inputLeadingIcon} />
              <TextInput
                style={styles.textInputInside}
                placeholder="Nhập số nhà, tên đường, thôn ấp, vị trí cụ thể..."
                placeholderTextColor="#94A3B8"
                value={detailedAddress}
                onChangeText={setDetailedAddress}
              />
            </View>
          </View>

          {/* 6. ĐỐI TƯỢNG CẦN ƯU TIÊN ⓘ (TÌM KIẾM KEYWORD, GỢI Ý DROPDOWN & TỰ NHẬP) */}
          <View style={styles.formCard}>
            <View style={styles.fieldHeaderRow}>
              <View style={styles.fieldBadgeIcon}>
                <Ionicons name="heart" size={15} color="#0284C7" />
              </View>
              <Text style={styles.fieldTitle}>Đối tượng cần ưu tiên</Text>
              <Feather name="info" size={14} color="#94A3B8" style={{ marginLeft: 4 }} />
            </View>

            <Text style={styles.fieldSubHelp}>
              Nhập hoặc chọn đối tượng (người già, trẻ nhỏ, bệnh tật...) để lực lượng cứu hộ ưu tiên canô, thuốc men:
            </Text>

            {/* Ô input tìm kiếm & nhập tự do */}
            <View style={styles.priorityInputWrap}>
              <Feather name="search" size={16} color="#94A3B8" style={styles.inputLeadingIcon} />
              <TextInput
                style={styles.priorityTextInput}
                placeholder="Tìm hoặc gõ đối tượng ưu tiên..."
                placeholderTextColor="#94A3B8"
                value={prioritySearchText}
                onChangeText={(text) => {
                  setPrioritySearchText(text);
                  setIsPriorityDropdownOpen(true);
                }}
                onFocus={() => setIsPriorityDropdownOpen(true)}
              />
              {prioritySearchText.trim().length > 0 ? (
                <TouchableOpacity
                  style={styles.addPriorityBtnInline}
                  onPress={() => handleAddCustomPriority(prioritySearchText)}
                  activeOpacity={0.8}
                >
                  <Feather name="plus" size={14} color="#FFFFFF" />
                  <Text style={styles.addPriorityBtnInlineText}>Thêm</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => setIsPriorityDropdownOpen(!isPriorityDropdownOpen)}
                  style={{ padding: 4 }}
                >
                  <Feather name={isPriorityDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>

            {/* Menu Dropdown gợi ý sổ ra theo từ khóa */}
            {isPriorityDropdownOpen && (
              <View style={styles.priorityDropdownCard}>
                <View style={styles.priorityDropdownHeader}>
                  <Text style={styles.priorityDropdownTitle}>
                    {prioritySearchText ? `Kết quả tìm kiếm cho "${prioritySearchText}":` : 'Danh mục đối tượng ưu tiên gợi ý:'}
                  </Text>
                  <TouchableOpacity onPress={() => setIsPriorityDropdownOpen(false)} style={{ padding: 2 }}>
                    <Feather name="x" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {/* Nút thêm đối tượng tự do nếu không trùng mẫu */}
                  {prioritySearchText.trim().length > 0 && !PRIORITY_SUGGESTIONS.some(s => s.label.toLowerCase() === prioritySearchText.trim().toLowerCase()) && (
                    <TouchableOpacity
                      style={styles.customAddSuggestionRow}
                      onPress={() => handleAddCustomPriority(prioritySearchText)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.customAddIconWrap}>
                        <Feather name="plus" size={14} color="#0284C7" />
                      </View>
                      <Text style={styles.customAddText}>
                        Thêm: <Text style={{ fontWeight: '800', color: '#0284C7' }}>"{prioritySearchText.trim()}"</Text>
                      </Text>
                    </TouchableOpacity>
                  )}

                  {filteredPrioritySuggestions.length > 0 ? (
                    filteredPrioritySuggestions.map((item) => {
                      const isSelected = selectedPriorities.includes(item.label);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.prioritySuggestionRow, isSelected && styles.prioritySuggestionRowSelected]}
                          onPress={() => {
                            handleTogglePriority(item.label);
                            setPrioritySearchText('');
                          }}
                          activeOpacity={0.7}
                        >
                          <FontAwesome5 name={item.icon} size={14} color={isSelected ? '#0284C7' : item.color} style={{ width: 22 }} />
                          <Text style={[styles.prioritySuggestionText, isSelected && styles.prioritySuggestionTextSelected]}>
                            {item.label}
                          </Text>
                          {isSelected ? (
                            <Ionicons name="checkmark-circle" size={18} color="#0284C7" />
                          ) : (
                            <Feather name="plus" size={16} color="#94A3B8" />
                          )}
                        </TouchableOpacity>
                      );
                    })
                  ) : (
                    <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, color: '#64748B' }}>Bấm nút "Thêm" ở trên để lưu đối tượng này.</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            )}

            {/* Các tag đối tượng đã chọn */}
            {selectedPriorities.length > 0 && (
              <View style={styles.selectedPrioritiesContainer}>
                <Text style={styles.selectedPrioritiesTitle}>Đối tượng đã chọn ({selectedPriorities.length}):</Text>
                <View style={styles.selectedPrioritiesChipsWrap}>
                  {selectedPriorities.map((item, idx) => (
                    <View key={idx} style={styles.selectedPriorityChip}>
                      <Text style={styles.selectedPriorityChipText}>{item}</Text>
                      <TouchableOpacity onPress={() => handleRemovePriority(item)} style={styles.removePriorityChipBtn}>
                        <Feather name="x" size={13} color="#0284C7" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Các tag chọn nhanh phổ biến (1 chạm) */}
            <View style={styles.quickTagsSection}>
              <Text style={styles.quickTagsHeading}>Chọn nhanh phổ biến:</Text>
              <View style={styles.quickTagsRow}>
                {QUICK_PRIORITY_TAGS.map((item) => {
                  const isSelected = selectedPriorities.includes(item.label);
                  return (
                    <TouchableOpacity
                      key={item.label}
                      style={[styles.quickTagBtn, isSelected && styles.quickTagBtnSelected]}
                      onPress={() => handleTogglePriority(item.label)}
                      activeOpacity={0.75}
                    >
                      <FontAwesome5 name={item.icon} size={12} color={isSelected ? '#0284C7' : item.color} style={{ marginRight: 6 }} />
                      <Text style={[styles.quickTagBtnText, isSelected && styles.quickTagBtnTextSelected]}>
                        {item.label}
                      </Text>
                      {isSelected && <Ionicons name="checkmark-circle" size={13} color="#0284C7" style={{ marginLeft: 4 }} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* 7. ĐÍNH KÈM ẢNH HIỆN TRƯỜNG (KHÔNG BẮT BUỘC) */}
          <View style={styles.formCard}>
            <View style={styles.fieldHeaderRow}>
              <View style={styles.fieldBadgeIcon}>
                <Ionicons name="camera" size={15} color="#0284C7" />
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

          {/* 8. NÚT GỬI CỨU TRỢ XANH DƯƠNG CHỦ ĐẠO */}
          <TouchableOpacity
            style={styles.mainSendBtn}
            onPress={handleSubmit}
            disabled={sending}
            activeOpacity={0.85}
          >
            {sending ? (
              <View style={styles.sendingRow}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.mainSendBtnText}>ĐANG GỬI THÔNG TIN...</Text>
              </View>
            ) : (
              <View style={styles.sendingRow}>
                <Ionicons name="navigate" size={18} color="#FFFFFF" style={{ transform: [{ rotate: '45deg' }] }} />
                <Text style={styles.mainSendBtnText}>ĐĂNG TIN CẦN CỨU TRỢ</Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODAL 1: CHỌN LOẠI YÊU CẦU */}
      <Modal
        visible={showTypeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTypeModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowTypeModal(false)}
        >
          <View
            style={styles.modalSheetCard}
            onStartShouldSetResponder={() => true}
          >
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
                    <Ionicons name="checkmark-circle" size={20} color="#0284C7" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* MODAL 2: BẢN ĐỒ CHỌN VỊ TRÍ CỨU NẠN TRỰC TIẾP */}
      <Modal
        visible={showMapPickerModal}
        animationType="slide"
        onRequestClose={() => setShowMapPickerModal(false)}
      >
        <SafeAreaView style={styles.mapModalContainer} edges={['top', 'bottom']}>
          {/* Header Modal */}
          <View style={styles.mapModalHeader}>
            <TouchableOpacity
              style={styles.mapModalCloseBtn}
              onPress={() => setShowMapPickerModal(false)}
              activeOpacity={0.7}
            >
              <Feather name="arrow-left" size={22} color="#0F172A" />
            </TouchableOpacity>

            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <Text style={styles.mapModalTitle}>Chọn vị trí cần cứu hộ</Text>
              <Text style={styles.mapModalSubtitle}>Chạm vào bản đồ để di chuyển ghim</Text>
            </View>

            <TouchableOpacity
              style={styles.mapModalMyGpsBtn}
              onPress={moveToMyGps}
              activeOpacity={0.7}
            >
              <Ionicons name="locate" size={20} color="#0284C7" />
            </TouchableOpacity>
          </View>

          {/* Floating Address Bar */}
          <View style={styles.mapModalAddressBar}>
            <View style={styles.mapModalAddressIconWrap}>
              <Ionicons name="location-sharp" size={20} color="#0284C7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.mapModalAddressLabel}>Vị trí đang ghim trên bản đồ:</Text>
              <Text style={styles.mapModalAddressText} numberOfLines={2}>
                {isReverseGeocoding ? 'Đang xác định địa chỉ...' : pickerAddress || (pickerCoords ? `${pickerCoords.lat.toFixed(5)}, ${pickerCoords.lng.toFixed(5)}` : 'Chạm trên bản đồ')}
              </Text>
            </View>
            {isReverseGeocoding && <ActivityIndicator size="small" color="#0284C7" style={{ marginLeft: 6 }} />}
          </View>

          {/* Bản đồ WebView Leaflet */}
          <View style={styles.mapWebViewContainer}>
            {pickerCoords && (
              <WebView
                ref={mapPickerWebViewRef}
                source={{ html: generatePickerMapHtml(pickerCoords.lat, pickerCoords.lng) }}
                onMessage={handleMapPickerMessage}
                style={{ flex: 1 }}
                javaScriptEnabled
                domStorageEnabled
                startInLoadingState
                renderLoading={() => (
                  <View style={styles.mapLoadingOverlay}>
                    <ActivityIndicator size="large" color="#0284C7" />
                    <Text style={{ marginTop: 8, fontSize: 13, color: '#64748B' }}>Đang tải bản đồ...</Text>
                  </View>
                )}
              />
            )}
          </View>

          {/* Footer Xác nhận */}
          <View style={styles.mapModalFooter}>
            <TouchableOpacity
              style={styles.confirmMapLocationBtn}
              onPress={handleConfirmMapLocation}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.confirmMapLocationBtnText}>XÁC NHẬN VỊ TRÍ NÀY</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* MODAL 3: THÔNG BÁO XÁC THỰC THIẾU THÔNG TIN */}
      <Modal
        visible={validationModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setValidationModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setValidationModalVisible(false)}
        >
          <View
            style={styles.valAlertCard}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.valAlertBadge}>
              <Ionicons name="alert-circle" size={32} color="#0284C7" />
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
        </TouchableOpacity>
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
    width: 38,
    height: 38,
    borderRadius: 19,
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
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.1,
  },
  headerSubTitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  reloadGpsBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20, // Thu gọn khoảng trống thừa phía dưới cho vừa vặn sát thanh điều hướng
  },

  // THẺ FORM CHUNG
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  betweenHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  fieldBadgeIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  fieldTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  fieldSubHelp: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 8,
    lineHeight: 16,
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
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
  },
  dropdownSelectedText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },

  // 2. STEPPER SỐ NGƯỜI (CÓ THỂ GÕ SỐ BÀN PHÍM VÀ BẤM NÚT +/-)
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  stepperActionBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  stepperValueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: '#EFF6FF',
    minWidth: 84,
    height: 38,
  },
  stepperInput: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0284C7',
    textAlign: 'center',
    minWidth: 28,
    padding: 0,
  },
  stepperUnitText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284C7',
    marginLeft: 4,
  },

  // 3. SỐ ĐIỆN THOẠI
  phoneMissingContainer: {
    marginTop: 6,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  phoneProfileAutoFilledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    marginBottom: 8,
  },
  phoneProfileAutoFilledText: {
    fontSize: 12,
    color: '#0284C7',
    fontWeight: '600',
  },
  profilePhoneTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  profilePhoneTagText: {
    fontSize: 11,
    color: '#0284C7',
    fontWeight: '700',
  },
  profilePhoneMissingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  profilePhoneMissingTagText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '700',
  },
  addPhoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  addPhoneBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  inputWrapWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    height: 48,
  },
  inputLeadingIcon: {
    marginRight: 8,
  },
  textInputInside: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },

  // 4. TEXTAREA NỘI DUNG
  textareaContainer: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#F8FAFC',
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
  openMapBtnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  openMapBtnHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  locationSelectorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0F9FF',
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  locationSelectorCardCustom: {
    borderColor: '#0284C7',
    backgroundColor: '#F0F9FF',
    borderWidth: 1.5,
  },
  locationSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  locationModeBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284C7',
    backgroundColor: '#E0F2FE',
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  locationModeHint: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
  },
  locationSelectorText: {
    fontSize: 13,
    color: '#0369A1',
    fontWeight: '600',
    lineHeight: 18,
  },
  mapPinActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetGpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  resetGpsText: {
    fontSize: 11.5,
    color: '#0284C7',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // 6. ĐỐI TƯỢNG CẦN ƯU TIÊN (SEARCH KEYWORD & GỢI Ý)
  priorityInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    height: 48,
  },
  priorityTextInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  addPriorityBtnInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0284C7',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  addPriorityBtnInlineText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  priorityDropdownCard: {
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  priorityDropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 6,
  },
  priorityDropdownTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0284C7',
  },
  customAddSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    padding: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 6,
  },
  customAddIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  customAddText: {
    fontSize: 13,
    color: '#334155',
    flex: 1,
  },
  prioritySuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 3,
  },
  prioritySuggestionRowSelected: {
    backgroundColor: '#F0F9FF',
  },
  prioritySuggestionText: {
    fontSize: 13,
    color: '#334155',
    flex: 1,
    marginLeft: 8,
  },
  prioritySuggestionTextSelected: {
    color: '#0284C7',
    fontWeight: '700',
  },
  selectedPrioritiesContainer: {
    marginTop: 10,
  },
  selectedPrioritiesTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  selectedPrioritiesChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  selectedPriorityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 6,
  },
  selectedPriorityChipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0369A1',
  },
  removePriorityChipBtn: {
    padding: 2,
  },
  quickTagsSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  quickTagsHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
  },
  quickTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickTagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  quickTagBtnSelected: {
    backgroundColor: '#F0F9FF',
    borderColor: '#0284C7',
    borderWidth: 1.5,
  },
  quickTagBtnText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  quickTagBtnTextSelected: {
    color: '#0284C7',
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
    paddingVertical: 11,
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

  // 8. NÚT GỬI CỨU HỘ XANH DƯƠNG CHỦ ĐẠO
  mainSendBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 8,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
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
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
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
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
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
    color: '#0284C7',
    fontWeight: '700',
  },

  // MODAL BẢN ĐỒ CHỌN VỊ TRÍ
  mapModalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mapModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  mapModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  mapModalSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  mapModalMyGpsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapModalAddressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mapModalAddressIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  mapModalAddressLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  mapModalAddressText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  mapWebViewContainer: {
    flex: 1,
    position: 'relative',
  },
  mapLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapModalFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  confirmMapLocationBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmMapLocationBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
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
    backgroundColor: '#0284C7',
    borderRadius: 10,
    paddingVertical: 11,
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
    color: '#0284C7',
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

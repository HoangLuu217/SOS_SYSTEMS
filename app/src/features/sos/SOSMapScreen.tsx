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
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, MaterialCommunityIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { backendApi } from '@/api';
import { useAuth } from '@/context/AuthContext';
import { EmergencyContact } from '@/types';
import { CitizenSosTrackingModal } from '../profile/CitizenSosTrackingModal';
import { styles } from './SOSMapScreen.styles';

// Helper icon đại diện cho người thân
const getRelationEmoji = (relation?: string) => {
  if (!relation) return '👤';
  const r = relation.toLowerCase();
  if (r.includes('mẹ') || r.includes('me')) return '👩';
  if (r.includes('ba') || r.includes('bố') || r.includes('cha')) return '👨';
  if (r.includes('vợ') || r.includes('chồng')) return '💍';
  if (r.includes('yêu') || r.includes('bồ')) return '❤️';
  if (r.includes('bạn')) return '👥';
  if (r.includes('anh') || r.includes('em') || r.includes('chị')) return '🧑';
  if (r.includes('con')) return '👶';
  return '👤';
};

// Danh sách các loại yêu cầu cứu trợ
const REQUEST_TYPES = [
  { id: 'FLOOD', label: 'Cứu hộ ngập lụt', emoji: '🌊' },
  { id: 'MEDICAL', label: 'Cấp cứu y tế', emoji: '🏥' },
  { id: 'FOOD', label: 'Tiếp tế lương thực', emoji: '🍞' },
  { id: 'EVACUATION', label: 'Sơ tán khẩn cấp', emoji: '👵' },
  { id: 'LANDSLIDE', label: 'Sạt lở đất', emoji: '⚠️' },
  { id: 'OTHER', label: 'Yêu cầu khác', emoji: '❓' },
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

/**
 * Kiểm tra định dạng số điện thoại thực tế tại Việt Nam:
 * - 10 chữ số, bắt đầu bằng 03, 05, 07, 08, 09 (hoặc +84)
 * - Loại trừ các chuỗi số ảo, số rác phổ biến (012345678, 0987654321, 0000000000...)
 */
export const isValidVietnamesePhone = (phoneStr: string): boolean => {
  if (!phoneStr) return false;
  const clean = phoneStr.replace(/[\s\.\-]+/g, '');
  const vnPhoneRegex = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/;
  if (!vnPhoneRegex.test(clean)) return false;

  const junkNumbers = [
    '0123456789',
    '0987654321',
    '0000000000',
    '0999999999',
    '0888888888',
    '0777777777',
    '0333333333',
    '0555555555',
  ];
  if (junkNumbers.includes(clean)) return false;

  const last8 = clean.slice(-8);
  if (/^(\d)\1{7}$/.test(last8)) return false;

  return true;
};

export interface SOSMapScreenProps {
  onClose?: () => void;
  initialEmergencyType?: string;
  isTab?: boolean;
  editingSosId?: string | null;
  editingSosData?: any;
  onSosUpdated?: (updatedSos: any) => void;
}

export const SOSMapScreen: React.FC<SOSMapScreenProps> = ({
  onClose,
  initialEmergencyType,
  isTab = false,
  editingSosId,
  editingSosData,
  onSosUpdated,
}) => {
  const { user, updateUserProfile } = useAuth();
  const profilePhone = user?.phone || (user as any)?.phoneNumber || '';
  const hasProfilePhone = Boolean(profilePhone);

  // Loại yêu cầu (chọn được nhiều loại)
  const [requestTypes, setRequestTypes] = useState<string[]>([initialEmergencyType || 'FLOOD']);
  const requestType = requestTypes[0] || 'FLOOD';
  const [showTypeModal, setShowTypeModal] = useState<boolean>(false);

  // Số người cần cứu (người dùng có thể tự gõ số hoặc bấm nút +/-)
  const [peopleCount, setPeopleCount] = useState<number>(1);
  const [peopleInput, setPeopleInput] = useState<string>('1');

  // Số điện thoại chính & số điện thoại phụ (lấy mặc định từ profile)
  const [phone, setPhone] = useState<string>(profilePhone);
  const [secondaryPhone, setSecondaryPhone] = useState<string>('');
  const [showSecondaryPhone, setShowSecondaryPhone] = useState<boolean>(false);
  const [savedEmergencyContact, setSavedEmergencyContact] = useState<EmergencyContact | null>(null);
  const [savedEmergencyContacts, setSavedEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [showSavePinModal, setShowSavePinModal] = useState<boolean>(false);

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
  const peopleInputRef = useRef<any>(null);

  // Đối tượng ưu tiên (Popup Modal chọn nhanh)
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [prioritySearchText, setPrioritySearchText] = useState<string>('');
  const [showPriorityModal, setShowPriorityModal] = useState<boolean>(false);

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
    sosId: string;
    rawSosData: any;
    sosCode: string;
    requestTypeLabel: string;
    people: number;
    address: string;
    phone: string;
    description: string;
  } | null>(null);
  const [showTrackingModal, setShowTrackingModal] = useState<boolean>(false);
  const [trackingSosId, setTrackingSosId] = useState<string | null>(null);
  const [nearbyAlertData, setNearbyAlertData] = useState<{
    sosId: string;
    sosCode: string;
    message: string;
  } | null>(null);
  const [limitAlertData, setLimitAlertData] = useState<{
    message: string;
    activeCount?: number;
    maxLimit?: number;
    activeSosList?: Array<{ _id: string; sosCode: string; address?: string }>;
    existingSosId?: string;
  } | null>(null);
  const [updateSuccessData, setUpdateSuccessData] = useState<any | null>(null);

  const handleConfirmUpdateSuccess = () => {
    const updated = updateSuccessData;
    setUpdateSuccessData(null);
    if (updated) {
      onSosUpdated?.(updated);
    }
    onClose?.();
  };

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

  // Tải danh bạ người thân đã lưu (bao gồm cả địa chỉ/tọa độ)
  const loadSavedContacts = async () => {
    try {
      let foundList: EmergencyContact[] = [];

      // 1. Đọc từ danh sách nhiều người thân trong AsyncStorage
      const stored = await AsyncStorage.getItem('@sos_emergency_contacts');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            foundList = parsed;
          }
        } catch { }
      }

      // 2. Dự phòng: Đọc từ liên hệ đơn lẻ cũ nếu danh sách trống
      if (foundList.length === 0) {
        const single = await AsyncStorage.getItem('@sos_emergency_contact');
        if (single) {
          try {
            const parsedSingle = JSON.parse(single);
            if (parsedSingle && (parsedSingle.name || parsedSingle.phone)) {
              foundList = [{ ...parsedSingle, id: parsedSingle.id || Date.now().toString() }];
            }
          } catch { }
        }
      }

      // 3. Dự phòng từ user profile context nếu đã có
      if (foundList.length === 0 && user?.citizen) {
        const c = user.citizen as any;
        if (Array.isArray(c.emergencyContacts) && c.emergencyContacts.length > 0) {
          foundList = c.emergencyContacts;
        } else if (c.emergencyContact?.name) {
          foundList = [c.emergencyContact];
        }
      }

      // Cập nhật ngay vào State nếu tìm thấy
      if (foundList.length > 0) {
        setSavedEmergencyContacts(foundList);
        setSavedEmergencyContact(foundList[0]);
      }

      // 4. Đồng bộ từ backend ngầm
      try {
        const res: any = await backendApi.getCitizenProfile();
        if (res?.success && res?.data?.citizen) {
          const citizen = res.data.citizen;
          let list: EmergencyContact[] = [];
          if (Array.isArray(citizen.emergencyContacts) && citizen.emergencyContacts.length > 0) {
            list = citizen.emergencyContacts;
          } else if (citizen.emergencyContact?.name) {
            list = [citizen.emergencyContact];
          }
          if (list.length > 0) {
            setSavedEmergencyContacts(list);
            setSavedEmergencyContact(list[0]);
            AsyncStorage.setItem('@sos_emergency_contacts', JSON.stringify(list)).catch(() => { });
          }
        }
      } catch { }
    } catch { }
  };

  useEffect(() => {
    if (!editingSosData && !editingSosId) {
      fetchLocation();
    } else {
      setLocating(false);
    }
    loadSavedContacts();
  }, [editingSosData, editingSosId]);

  // Lắng nghe sự kiện cập nhật danh bạ khẩn cấp từ trang Liên hệ khẩn cấp
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('EMERGENCY_CONTACTS_UPDATED', () => {
      loadSavedContacts();
    });
    return () => {
      sub.remove();
    };
  }, []);

  // Tự động tải lại danh bạ khi mở Modal Bản đồ
  useEffect(() => {
    if (showMapPickerModal) {
      loadSavedContacts();
    }
  }, [showMapPickerModal]);

  // Tự động điền số điện thoại từ hồ sơ cá nhân nếu chưa có
  useEffect(() => {
    const existing = user?.phone || (user as any)?.phoneNumber || '';
    if (existing && !phone) {
      setPhone(existing);
    }
  }, [user]);

  // Tự động điền đầy đủ dữ liệu khi mở ở chế độ CẬP NHẬT
  useEffect(() => {
    if (editingSosData) {
      if (editingSosData.emergencyTypes && Array.isArray(editingSosData.emergencyTypes) && editingSosData.emergencyTypes.length > 0) {
        setRequestTypes(editingSosData.emergencyTypes);
      } else if (editingSosData.emergencyType) {
        setRequestTypes([editingSosData.emergencyType]);
      }
      if (editingSosData.people) {
        const count = Number(editingSosData.people);
        setPeopleCount(count);
        setPeopleInput(String(count));
      }
      if (editingSosData.contactPhone) setPhone(editingSosData.contactPhone);
      if (editingSosData.secondaryPhone) {
        setSecondaryPhone(editingSosData.secondaryPhone);
        setShowSecondaryPhone(true);
      }
      if (editingSosData.description) {
        const clean = editingSosData.description
          .replace(/\[[^\]]+\]/g, '')
          .replace(/⚡\s*/g, '')
          .replace(/^:\s*/gm, '')
          .trim();
        setDescription(clean);
      }
      if (editingSosData.address) {
        setGpsAddress(editingSosData.address);
      }
      if (Array.isArray(editingSosData.priorityGroups)) {
        setSelectedPriorities(editingSosData.priorityGroups);
      }
      if (editingSosData.location?.coordinates) {
        const [lng, lat] = editingSosData.location.coordinates;
        setLocation({ coords: { latitude: lat, longitude: lng } } as any);
        setIsCustomMapLocation(true);
      }
      if (editingSosData.images && Array.isArray(editingSosData.images) && editingSosData.images.length > 0) {
        setImageUri(editingSosData.images[0]);
      }
    }
  }, [editingSosData]);

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
    loadSavedContacts();
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

  // Ghim nhanh vị trí của người thân trên bản đồ
  const handleSelectRelativeLocation = async (contact: EmergencyContact) => {
    // 1. Nếu người thân đã có toạ độ latitude & longitude
    if (typeof contact.latitude === 'number' && typeof contact.longitude === 'number') {
      const lat = contact.latitude;
      const lng = contact.longitude;
      setPickerCoords({ lat, lng });
      const addr = contact.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      setPickerAddress(addr);
      mapPickerWebViewRef.current?.injectJavaScript(`window.setMapLocation(${lat}, ${lng}); true;`);
      if (contact.phone) {
        setSecondaryPhone(contact.phone);
        setShowSecondaryPhone(true);
      }
      return;
    }

    // 2. Nếu người thân có địa chỉ chữ nhưng chưa có toạ độ GPS
    if (contact.address && contact.address.trim()) {
      setIsReverseGeocoding(true);
      try {
        const geoResults = await Location.geocodeAsync(contact.address.trim());
        if (geoResults && geoResults.length > 0) {
          const lat = geoResults[0].latitude;
          const lng = geoResults[0].longitude;
          setPickerCoords({ lat, lng });
          setPickerAddress(contact.address.trim());
          mapPickerWebViewRef.current?.injectJavaScript(`window.setMapLocation(${lat}, ${lng}); true;`);
          if (contact.phone) {
            setSecondaryPhone(contact.phone);
            setShowSecondaryPhone(true);
          }
          // Tự động lưu lại toạ độ vào contact để các lần sau bay tới ngay lập tức
          const updated = savedEmergencyContacts.map((c) =>
            (c.id === contact.id || c.phone === contact.phone) ? { ...c, latitude: lat, longitude: lng } : c
          );
          setSavedEmergencyContacts(updated);
          AsyncStorage.setItem('@sos_emergency_contacts', JSON.stringify(updated)).catch(() => { });
          backendApi.updateEmergencyContact(updated).catch(() => { });
          return;
        }
      } catch (err) {
        console.warn('Geocoding error:', err);
      } finally {
        setIsReverseGeocoding(false);
      }
      // Nếu geocode không trả kết quả toạ độ, vẫn đặt địa chỉ chữ
      setPickerAddress(contact.address.trim());
      if (contact.phone) {
        setSecondaryPhone(contact.phone);
        setShowSecondaryPhone(true);
      }
      Alert.alert(
        'Đã nhận địa chỉ người thân',
        `Đã nhận địa chỉ "${contact.address}". Bạn có thể kéo thả ghim trên bản đồ để chỉ định vị trí chính xác nhất.`
      );
      return;
    }

    // 3. Nếu người thân chưa có địa chỉ đã lưu
    Alert.alert(
      'Chưa có địa chỉ người thân',
      `"${contact.name} (${contact.relation || 'Người thân'})" chưa có địa chỉ/vị trí được lưu. Bạn có thể cập nhật trong mục Hồ sơ ➔ Liên hệ khẩn cấp.`
    );
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
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          touch-action: none;
          user-select: none;
          -webkit-user-select: none;
          cursor: grab;
        }
        .sos-picker-pin * {
          pointer-events: none;
        }
        .sos-picker-wave {
          position: absolute;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background-color: rgba(2, 132, 199, 0.45);
          border: 2px solid #0284C7;
          animation: pulseWave 1.5s ease-out infinite;
        }
        .sos-picker-core {
          position: relative;
          width: 34px;
          height: 34px;
          background: #0284C7;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 0 10px rgba(2, 132, 199, 0.8), 0 3px 6px rgba(0,0,0,0.3);
          border: 2.5px solid white;
          z-index: 2;
          transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
        }
        .is-dragging .sos-picker-core {
          transform: scale(1.28) translateY(-8px);
          box-shadow: 0 12px 24px rgba(2, 132, 199, 0.6), 0 4px 8px rgba(0,0,0,0.3);
          background: #0369A1;
        }
        .is-dragging .sos-picker-wave {
          opacity: 0;
        }
        .leaflet-control-attribution {
          display: none !important;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { zoomControl: false, preferCanvas: true, attributionControl: false }).setView([${lat}, ${lng}], 16);
        L.control.zoom({ position: 'topright' }).addTo(map);

        L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&apistyle=s.t:33|p.v:off%2Cs.t:21|s.e:l|p.v:off&x={x}&y={y}&z={z}', {
          subdomains: ['0', '1', '2', '3'],
          maxZoom: 20
        }).addTo(map);

        var pinIcon = L.divIcon({
          html: '<div class="sos-picker-pin"><div class="sos-picker-wave"></div><div class="sos-picker-core"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg></div></div>',
          className: 'custom-picker-pin',
          iconSize: [48, 48],
          iconAnchor: [24, 24]
        });

        var marker = L.marker([${lat}, ${lng}], {
          icon: pinIcon,
          draggable: true,
          autoPan: true
        }).addTo(map);

        marker.on('dragstart', function() {
          var el = marker.getElement();
          if (el) el.classList.add('is-dragging');
        });

        marker.on('dragend', function(e) {
          var el = marker.getElement();
          if (el) el.classList.remove('is-dragging');
          var pos = marker.getLatLng();
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'MAP_CLICK',
              lat: pos.lat,
              lng: pos.lng
            }));
          }
        });

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

  // Xử lý bật/tắt chọn loại yêu cầu (chọn được nhiều loại)
  const handleToggleRequestType = (typeId: string) => {
    if (requestTypes.includes(typeId)) {
      if (requestTypes.length > 1) {
        setRequestTypes((prev) => prev.filter((t) => t !== typeId));
      } else {
        setValidationMessage('Vui lòng chọn ít nhất 1 loại yêu cầu cứu trợ');
        setValidationModalVisible(true);
      }
    } else {
      setRequestTypes((prev) => [...prev, typeId]);
    }
  };

  // Xử lý đối tượng ưu tiên
  const handleAddCustomPriority = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!selectedPriorities.includes(trimmed)) {
      setSelectedPriorities((prev) => [...prev, trimmed]);
    }
    setPrioritySearchText('');
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
    // 1. Kiểm tra số điện thoại chính (bắt buộc)
    if (!phone.trim()) {
      setValidationMessage('Tài khoản chưa có số điện thoại. Vui lòng nhập số điện thoại để Đội cứu hộ có thể liên lạc khẩn cấp và cập nhật vào hồ sơ!');
      setValidationModalVisible(true);
      return;
    }
    if (!isValidVietnamesePhone(phone.trim())) {
      setValidationMessage('Số điện thoại liên hệ không hợp lệ. Vui lòng nhập đúng 10 chữ số chuẩn mạng viễn thông Việt Nam (Ví dụ: 0905123456) để Đội cứu hộ có thể liên lạc!');
      setValidationModalVisible(true);
      return;
    }

    // 1b. Kiểm tra số điện thoại phụ (nếu có nhập)
    if (secondaryPhone.trim()) {
      if (!isValidVietnamesePhone(secondaryPhone.trim())) {
        setValidationMessage('Số điện thoại dự phòng không hợp lệ. Vui lòng nhập đúng số điện thoại thực tế gồm 10 chữ số (Ví dụ: 0905987654) của người thân hoặc người bên cạnh, hoặc để trống!');
        setValidationModalVisible(true);
        return;
      }
      const cleanPhone = phone.trim().replace(/[\s\.\-]+/g, '');
      const cleanSecPhone = secondaryPhone.trim().replace(/[\s\.\-]+/g, '');
      if (cleanPhone === cleanSecPhone) {
        setValidationMessage('Số điện thoại dự phòng không được trùng với số điện thoại liên hệ chính!');
        setValidationModalVisible(true);
        return;
      }
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

      // Đánh giá mức độ khẩn cấp
      const textForAnalysis = `${description} ${priorityLabels.join(' ')}`.toLowerCase();
      const isCritical =
        selectedPriorities.length > 0 ||
        requestType === 'MEDICAL' ||
        textForAnalysis.includes('mái nhà') ||
        textForAnalysis.includes('nóc nhà') ||
        textForAnalysis.includes('chảy xiết') ||
        textForAnalysis.includes('nguy kịch') ||
        textForAnalysis.includes('ngang ngực');

      const selectedTypeObjs = REQUEST_TYPES.filter((t) => requestTypes.includes(t.id));
      const requestTypeLabels = selectedTypeObjs.map((t) => t.label).join(', ');

      const payload = {
        location: {
          type: 'Point',
          coordinates: location
            ? [location.coords.longitude, location.coords.latitude]
            : [108.26054, 15.96836],
        },
        address: finalAddress,
        priority: isCritical ? 'CRITICAL' : 'HIGH',
        emergencyType: requestTypes[0] || 'FLOOD',
        emergencyTypes: requestTypes,
        description: description.trim() || null,
        people: peopleCount,
        contactPhone: phone.trim() || null,
        secondaryPhone: secondaryPhone.trim() || null,
        priorityGroups: priorityLabels,
        images: imageBase64 ? [`data:image/jpeg;base64,${imageBase64}`] : [],
      };

      // NẾU ĐANG Ở CHẾ ĐỘ CHỈNH SỬA / CẬP NHẬT: GỌI PATCH /sos/:id
      if (editingSosId) {
        const updatePayload: any = {
          emergencyType: requestTypes[0] || 'FLOOD',
          emergencyTypes: requestTypes,
          people: peopleCount,
          contactPhone: phone.trim() || undefined,
          secondaryPhone: secondaryPhone.trim() || undefined,
          description: description.trim() || undefined,
          address: finalAddress || undefined,
          priorityGroups: priorityLabels,
        };
        if (location?.coords) {
          updatePayload.location = {
            type: 'Point',
            coordinates: [location.coords.longitude, location.coords.latitude],
          };
        }
        if (imageBase64) {
          updatePayload.images = [`data:image/jpeg;base64,${imageBase64}`];
        }

        const updateRes = await backendApi.patch(`/sos/${editingSosId}`, updatePayload);
        if (updateRes.success && updateRes.data) {
          DeviceEventEmitter.emit('sos:sync', updateRes.data);
          setUpdateSuccessData(updateRes.data);
        } else {
          setValidationMessage(updateRes.message || 'Không thể cập nhật yêu cầu.');
          setValidationModalVisible(true);
        }
        return;
      }

      const response = await backendApi.post('/sos', payload);

      if (response.success && response.data?._id) {
        DeviceEventEmitter.emit('sos:sync', response.data);
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
          updateUserProfile({ phone: phone.trim() }).catch(() => { });
        }

        setSuccessData({
          sosId,
          rawSosData: response.data,
          sosCode: code,
          requestTypeLabel: requestTypeLabels || 'Cứu hộ khẩn cấp',
          people: peopleCount,
          address: finalAddress,
          phone: phone.trim(),
          description: description.trim(),
        });
      } else {
        const isNearbyDuplicate =
          response?.code === 'NEARBY_ACTIVE_SOS_EXISTS' ||
          (response?.message && (response.message.includes('ở gần vị trí này trước đó') || response.message.includes('Cập nhật')));

        if (isNearbyDuplicate) {
          const match = response?.message?.match(/\((SOS-[A-Z0-9\-]+)\)/);
          const detectedCode = response?.data?.existingSosCode || (match ? match[1] : 'SOS-MVD5V12V-P0AC');
          let targetSosId = response?.data?.existingSosId;

          // Nếu chưa có sẵn ID trong response thì tự động tra cứu danh sách SOS đang hoạt động của người dùng
          if (!targetSosId) {
            try {
              const sosListRes = await backendApi.get('/sos');
              if (sosListRes?.data && Array.isArray(sosListRes.data)) {
                const found = sosListRes.data.find(
                  (item: any) => item.sosCode === detectedCode || item._id === detectedCode
                );
                if (found) targetSosId = found._id;
                else if (sosListRes.data[0]) targetSosId = sosListRes.data[0]._id;
              }
            } catch (findErr) {
              console.warn('Lỗi tìm ID SOS:', findErr);
            }
          }

          setNearbyAlertData({
            sosId: String(targetSosId || ''),
            sosCode: detectedCode,
            message: response?.message || '',
          });
        } else if (
          response?.code === 'MAX_ACTIVE_SOS_LIMIT_REACHED' ||
          (response?.message && (response.message.includes('tối đa 3') || response.message.includes('tối đa')))
        ) {
          setLimitAlertData({
            message: response?.message || 'Mỗi tài khoản chỉ được phép gửi tối đa 3 yêu cầu cứu nạn đang hoạt động cùng lúc để đảm bảo nguồn lực điều phối. Vui lòng theo dõi hoặc hủy các ca trước đó nếu đã an toàn!',
            activeCount: response?.data?.activeCount || 3,
            maxLimit: response?.data?.maxLimit || 3,
            activeSosList: response?.data?.activeSosList || [],
            existingSosId: response?.data?.existingSosId,
          });
        } else {
          Alert.alert('Không thể gửi', response?.message || 'Chưa gửi được thông tin. Vui lòng thử lại!');
        }
      }
    } catch (err: any) {
      const isNearby =
        err?.code === 'NEARBY_ACTIVE_SOS_EXISTS' ||
        (err?.message && (err.message.includes('ở gần vị trí này trước đó') || err.message.includes('Cập nhật')));
      const isLimit =
        err?.code === 'MAX_ACTIVE_SOS_LIMIT_REACHED' ||
        (err?.message && (err.message.includes('tối đa 3') || err.message.includes('tối đa') || err.message.includes('Giới hạn')));

      if (isNearby) {
        const match = err?.message?.match(/\((SOS-[A-Z0-9\-]+)\)/);
        const detectedCode = err?.data?.existingSosCode || (match ? match[1] : 'SOS-MVD5V12V-P0AC');
        setNearbyAlertData({
          sosId: String(err?.data?.existingSosId || ''),
          sosCode: detectedCode,
          message: err?.message || '',
        });
      } else if (isLimit) {
        setLimitAlertData({
          message: err?.message || 'Mỗi tài khoản chỉ được phép gửi tối đa 3 yêu cầu cứu nạn đang hoạt động cùng lúc để đảm bảo nguồn lực điều phối. Vui lòng theo dõi hoặc hủy các ca trước đó nếu đã an toàn!',
          activeCount: err?.data?.activeCount || 3,
          maxLimit: err?.data?.maxLimit || 3,
          activeSosList: err?.data?.activeSosList || [],
          existingSosId: err?.data?.existingSosId,
        });
      } else {
        Alert.alert('Lỗi kết nối', 'Không thể kết nối máy chủ cứu nạn. Vui lòng kiểm tra mạng!\n' + (err.message || ''));
      }
    } finally {
      setSending(false);
    }
  };

  const selectedTypeObjs = REQUEST_TYPES.filter((t) => requestTypes.includes(t.id));
  const selectedTypeObj = selectedTypeObjs[0] || REQUEST_TYPES[0];
  const typeDisplayText = selectedTypeObjs.length === 0
    ? 'Vui lòng chọn'
    : selectedTypeObjs.length === 1
      ? `${selectedTypeObjs[0].emoji} ${selectedTypeObjs[0].label}`
      : `${selectedTypeObjs.map(t => t.emoji).join(' ')} ${selectedTypeObjs[0].label} (+${selectedTypeObjs.length - 1})`;

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
              style={[
                styles.doneBtn,
                {
                  flex: 1.25,
                  backgroundColor: '#0284C7',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
              onPress={() => {
                setShowTrackingModal(true);
              }}
              activeOpacity={0.85}
            >
              <Feather name="navigation" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.doneBtnText}>THEO DÕI CỨU HỘ</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.doneBtn,
                {
                  flex: 0.95,
                  backgroundColor: '#F1F5F9',
                  borderWidth: 1,
                  borderColor: '#CBD5E1',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
              onPress={() => {
                setSuccessData(null);
                onClose?.();
              }}
              activeOpacity={0.85}
            >
              <Feather name="home" size={15} color="#0F172A" style={{ marginRight: 6 }} />
              <Text style={[styles.doneBtnText, { color: '#0F172A' }]}>
                {isTab ? 'VỀ TRANG CHỦ' : 'HOÀN TẤT'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Modal Theo dõi hành trình cứu hộ trực tiếp cho ca vừa tạo */}
        {showTrackingModal && successData?.sosId ? (
          <CitizenSosTrackingModal
            visible={showTrackingModal}
            sosId={successData.sosId}
            initialSosData={successData.rawSosData}
            onClose={() => {
              setShowTrackingModal(false);
              setSuccessData(null);
              onClose?.();
            }}
          />
        ) : null}
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
          <Text style={styles.headerTitle}>
            {editingSosId ? 'Cập nhật tin cứu trợ' : 'Đăng tin cần cứu trợ'}
          </Text>
          <Text style={styles.headerSubTitle}>
            {editingSosId ? 'Cập nhật thông tin để được hỗ trợ kịp thời' : 'Gửi thông tin để được hỗ trợ kịp thời'}
          </Text>
        </View>

        <View style={{ width: 36 }} />
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
          {/* KHỐI 1: THÔNG TIN YÊU CẦU CỨU TRỢ (Gộp gọn gàng, loại bỏ kéo dài lê thê) */}
          <View style={styles.formCard}>
            {/* 1. LOẠI YÊU CẦU (Bên trái: Tiêu đề - Bên phải: Ô chọn cùng hàng tiết kiệm dòng) */}
            <View style={styles.inlineFieldRow}>
              <View style={styles.fieldHeaderRowCompact}>
                <View style={styles.fieldBadgeIcon}>
                  <Ionicons name="alert-circle" size={16} color="#0284C7" />
                </View>
                <Text style={styles.fieldTitle}>Loại yêu cầu:</Text>
              </View>

              <TouchableOpacity
                style={styles.dropdownBoxInline}
                onPress={() => setShowTypeModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.dropdownSelectedTextInline} numberOfLines={1}>
                  {typeDisplayText}
                </Text>
                <Feather name="chevron-down" size={16} color="#64748B" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>

            <View style={styles.formDivider} />

            {/* 2. SỐ NGƯỜI (Bên trái: Tiêu đề không dấu sao - Bên phải: Stepper cùng hàng) */}
            <View style={styles.inlineFieldRow}>
              <View style={styles.fieldHeaderRowCompact}>
                <View style={styles.fieldBadgeIcon}>
                  <MaterialCommunityIcons name="account-group" size={16} color="#0284C7" />
                </View>
                <Text style={styles.fieldTitle}>Số người:</Text>
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

            <View style={styles.formDivider} />

            {/* 3. SỐ ĐIỆN THOẠI (Không dấu sao *) */}
            <View style={styles.fieldSection}>
              <View style={styles.betweenHeaderRow}>
                <View style={styles.fieldHeaderRowCompact}>
                  <View style={styles.fieldBadgeIcon}>
                    <Ionicons name="call" size={14} color="#0284C7" />
                  </View>
                  <Text style={styles.fieldTitle}>Số điện thoại:</Text>
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

              {/* Ô nhập SĐT chính */}
              <View style={[
                styles.inputWrapWithIcon,
                phone.trim().length >= 4 && !isValidVietnamesePhone(phone) ? { borderColor: '#FCA5A5' } : null
              ]}>
                <Feather name="phone" size={16} color="#94A3B8" style={styles.inputLeadingIcon} />
                <TextInput
                  style={styles.textInputInside}
                  placeholder="Vui lòng nhập số điện thoại của bạn"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  maxLength={11}
                />
              </View>
              {phone.trim().length >= 4 && !isValidVietnamesePhone(phone) && (
                <Text style={{ color: '#DC2626', fontSize: 11, marginTop: 3, marginLeft: 4 }}>
                  * Cần 10 số di động chuẩn VN (bắt đầu bằng 03, 05, 07, 08, 09)
                </Text>
              )}

              {/* Ô nhập SĐT phụ (khi bấm + Thêm số) */}
              {showSecondaryPhone && (
                <View style={{ marginTop: 8 }}>
                  <View style={[
                    styles.inputWrapWithIcon,
                    secondaryPhone.trim().length >= 4 && !isValidVietnamesePhone(secondaryPhone) ? { borderColor: '#FCA5A5' } : null
                  ]}>
                    <Feather name="phone-forwarded" size={16} color="#0284C7" style={styles.inputLeadingIcon} />
                    <TextInput
                      style={styles.textInputInside}
                      placeholder="Số điện thoại phụ / người thân (10 số)"
                      placeholderTextColor="#94A3B8"
                      keyboardType="phone-pad"
                      value={secondaryPhone}
                      onChangeText={setSecondaryPhone}
                      maxLength={11}
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
                  {secondaryPhone.trim().length >= 4 && !isValidVietnamesePhone(secondaryPhone) && (
                    <Text style={{ color: '#DC2626', fontSize: 11, marginTop: 3, marginLeft: 4 }}>
                      * Cần 10 số di động chuẩn VN (bắt đầu bằng 03, 05, 07, 08, 09)
                    </Text>
                  )}

                  {/* Nút 1-chạm điền nhanh số người thân trong hồ sơ */}
                  {savedEmergencyContact?.phone && secondaryPhone !== savedEmergencyContact.phone && (
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#EFF6FF',
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: '#BAE6FD',
                        alignSelf: 'flex-start',
                        marginTop: 6,
                      }}
                      onPress={() => setSecondaryPhone(savedEmergencyContact.phone!)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="people" size={13} color="#0284C7" style={{ marginRight: 5 }} />
                      <Text style={{ fontSize: 11.5, color: '#0284C7', fontWeight: '600' }}>
                        Điền nhanh người thân: {savedEmergencyContact.name || 'Người thân'} ({savedEmergencyContact.phone})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            <View style={styles.formDivider} />

            {/* 4. NỘI DUNG (Không dấu sao *) */}
            <View style={styles.fieldSection}>
              <View style={styles.fieldHeaderRowCompact}>
                <View style={styles.fieldBadgeIcon}>
                  <MaterialCommunityIcons name="square-edit-outline" size={16} color="#0284C7" />
                </View>
                <Text style={styles.fieldTitle}>Nội dung:</Text>
              </View>

              <View style={[styles.textareaContainer, { marginTop: 8 }]}>
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

            <View style={styles.formDivider} />

            {/* 5. ĐỊA ĐIỂM HIỆN TRƯỜNG */}
            <View style={styles.fieldHeaderRowCompact}>
              <View style={styles.fieldBadgeIcon}>
                <Ionicons name="location" size={16} color="#0284C7" />
              </View>
              <Text style={styles.fieldTitle}>Địa điểm:</Text>
            </View>
            {/* Thẻ hiển thị địa chỉ đã định vị (chạm vào để đổi vị trí trên bản đồ) */}
            <TouchableOpacity
              style={[styles.locationAddressCard, isCustomMapLocation && styles.locationAddressCardCustom]}
              onPress={openMapPicker}
              activeOpacity={0.8}
            >
              <View style={[styles.mapPinActionBtn, { marginRight: 10 }]}>
                <Ionicons
                  name={isCustomMapLocation ? "pin" : "location-sharp"}
                  size={17}
                  color="#0284C7"
                />
              </View>
              <Text style={styles.locationAddressText} numberOfLines={2}>
                {locating ? 'Đang xác định vị trí...' : gpsAddress ? gpsAddress : 'Chạm để chọn vị trí trên bản đồ'}
              </Text>
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
                placeholder="Nhập số nhà, tên đường, thôn ấp, vị trí "
                placeholderTextColor="#94A3B8"
                value={detailedAddress}
                onChangeText={setDetailedAddress}
              />
            </View>

            <View style={styles.formDivider} />

            {/* 6. ĐỐI TƯỢNG CẦN ƯU TIÊN (Dạng chọn Dropdown mở Popup tiện lợi, không phải vuốt nhiều) */}
            <View style={styles.inlineFieldRow}>
              <View style={styles.fieldHeaderRowCompact}>
                <View style={styles.fieldBadgeIcon}>
                  <Ionicons name="heart" size={15} color="#0284C7" />
                </View>
                <Text style={styles.fieldTitle}>Đối tượng ưu tiên:</Text>
              </View>

              <TouchableOpacity
                style={styles.dropdownBoxInline}
                onPress={() => setShowPriorityModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.dropdownSelectedTextInline} numberOfLines={1}>
                  {selectedPriorities.length === 0
                    ? 'Chọn đối tượng'
                    : selectedPriorities.length === 1
                      ? selectedPriorities[0]
                      : `${selectedPriorities[0]} (+${selectedPriorities.length - 1})`}
                </Text>
                <Feather name="chevron-down" size={16} color="#64748B" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>

            {/* Các tag đối tượng đã chọn hiển thị gọn gàng bên dưới */}
            {selectedPriorities.length > 0 && (
              <View style={styles.selectedPrioritiesChipsWrapInline}>
                {selectedPriorities.map((item, idx) => (
                  <View key={idx} style={styles.selectedPriorityChip}>
                    <Text style={styles.selectedPriorityChipText}>{item}</Text>
                    <TouchableOpacity onPress={() => handleRemovePriority(item)} style={styles.removePriorityChipBtn}>
                      <Feather name="x" size={13} color="#0284C7" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.formDivider} />

            {/* 6. ĐÍNH KÈM ẢNH HIỆN TRƯỜNG (KHÔNG BẮT BUỘC) */}
            <View style={styles.fieldHeaderRow}>
              <View style={styles.fieldBadgeIcon}>
                <Ionicons name="camera" size={15} color="#0284C7" />
              </View>
              <Text style={styles.fieldTitle}>Ảnh hiện trường (Không bắt buộc):</Text>
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
                <Text style={styles.mainSendBtnText}>
                  {editingSosId ? 'ĐANG LƯU CẬP NHẬT...' : 'ĐANG GỬI THÔNG TIN...'}
                </Text>
              </View>
            ) : (
              <View style={styles.sendingRow}>
                <Ionicons
                  name={editingSosId ? "checkmark-circle" : "navigate"}
                  size={18}
                  color="#FFFFFF"
                  style={!editingSosId ? { transform: [{ rotate: '45deg' }] } : undefined}
                />
                <Text style={styles.mainSendBtnText}>
                  {editingSosId ? 'LƯU CẬP NHẬT TÍN HIỆU' : 'ĐĂNG TIN CẦN CỨU TRỢ'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODAL 1: CHỌN LOẠI YÊU CẦU (CHỌN ĐƯỢC NHIỀU LOẠI) */}
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
              <View style={{ flex: 1 }}>
                <Text style={styles.modalSheetTitle}>Chọn loại yêu cầu cứu trợ</Text>
                <Text style={styles.modalSheetSubtitle}>Có thể chọn nhiều loại khác nhau theo tình hình thực tế</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTypeModal(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {REQUEST_TYPES.map((item) => {
                const isSelected = requestTypes.includes(item.id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.typeOptionItem,
                      isSelected && styles.typeOptionItemSelected,
                    ]}
                    onPress={() => handleToggleRequestType(item.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.typeOptionEmoji}>{item.emoji}</Text>
                    <Text
                      style={[
                        styles.typeOptionLabel,
                        isSelected && styles.typeOptionLabelSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={22} color="#0284C7" />
                    ) : (
                      <Ionicons name="ellipse-outline" size={22} color="#CBD5E1" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => setShowTypeModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalDoneBtnText}>
                XÁC NHẬN ({requestTypes.length} LOẠI ĐÃ CHỌN)
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* MODAL MỚI: CHỌN ĐỐI TƯỢNG ƯU TIÊN (DẠNG POPUP TIỆN LỢI, KHÔNG CẦN VUỐT NHIỀU) */}
      <Modal
        visible={showPriorityModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPriorityModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowPriorityModal(false)}
        >
          <View
            style={[styles.modalSheetCard, { maxHeight: '82%' }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalSheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalSheetTitle}>Chọn đối tượng ưu tiên</Text>
                <Text style={styles.modalSheetSubtitle}>Chọn các đối tượng gặp nạn cần hỗ trợ khẩn cấp</Text>
              </View>
              <TouchableOpacity onPress={() => setShowPriorityModal(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Ô nhập thêm đối tượng tùy chỉnh nhanh */}
            <View style={styles.modalPriorityInputWrap}>
              <Feather name="plus-circle" size={16} color="#0284C7" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.modalPriorityTextInput}
                placeholder="Nhập đối tượng khác nếu không có trong danh sách..."
                placeholderTextColor="#94A3B8"
                value={prioritySearchText}
                onChangeText={setPrioritySearchText}
              />
              {prioritySearchText.trim().length > 0 && (
                <TouchableOpacity
                  style={styles.modalPriorityAddBtn}
                  onPress={() => {
                    handleAddCustomPriority(prioritySearchText);
                    setPrioritySearchText('');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalPriorityAddBtnText}>Thêm</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {PRIORITY_SUGGESTIONS.map((item) => {
                const isSelected = selectedPriorities.includes(item.label);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.typeOptionItem,
                      isSelected && styles.typeOptionItemSelected,
                    ]}
                    onPress={() => handleTogglePriority(item.label)}
                    activeOpacity={0.7}
                  >
                    <View style={{ width: 26, alignItems: 'center', marginRight: 10 }}>
                      <FontAwesome5 name={item.icon} size={15} color={isSelected ? '#0284C7' : item.color} />
                    </View>
                    <Text
                      style={[
                        styles.typeOptionLabel,
                        isSelected && styles.typeOptionLabelSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={22} color="#0284C7" />
                    ) : (
                      <Ionicons name="ellipse-outline" size={22} color="#CBD5E1" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => setShowPriorityModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalDoneBtnText}>
                {selectedPriorities.length > 0
                  ? `XÁC NHẬN (${selectedPriorities.length} ĐỐI TƯỢNG ĐÃ CHỌN)`
                  : 'XONG'}
              </Text>
            </TouchableOpacity>
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
              <Text style={styles.mapModalSubtitle}>Kéo thả ghim hoặc chạm bản đồ để chọn vị trí</Text>
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

          {/* Footer Xác nhận & Nút chọn vị trí người thân */}
          <View style={styles.mapModalFooter}>
            {savedEmergencyContacts.length > 0 && (
              <TouchableOpacity
                style={styles.savePinForRelativeBtn}
                onPress={() => setShowSavePinModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="location-outline" size={16} color="#0284C7" style={{ marginRight: 6 }} />
                <Text style={styles.savePinForRelativeBtnText}>Chọn vị trí người thân đã được ghim</Text>
              </TouchableOpacity>
            )}

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

      {/* MODAL CHỌN VỊ TRÍ NGƯỜI THÂN ĐÃ GHIM */}
      <Modal
        visible={showSavePinModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSavePinModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowSavePinModal(false)}
        >
          <View
            style={styles.modalSheetCard}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalSheetHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="people" size={19} color="#0284C7" style={{ marginRight: 8 }} />
                <Text style={styles.modalSheetTitle}>Vị trí người thân đã lưu</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSavePinModal(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 12 }}>
              Chạm vào người thân để tự động ghim vị trí cứu nạn:
            </Text>

            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {savedEmergencyContacts.map((contact, idx) => {
                const hasLocation = Boolean(contact.address || (typeof contact.latitude === 'number' && typeof contact.longitude === 'number'));
                return (
                  <TouchableOpacity
                    key={contact.id || idx}
                    style={styles.saveRelativeContactItem}
                    onPress={() => {
                      setShowSavePinModal(false);
                      handleSelectRelativeLocation(contact);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 22, marginRight: 10 }}>{getRelationEmoji(contact.relation)}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                        <Text style={styles.saveRelativeContactName}>{contact.name} ({contact.relation || 'Người thân'})</Text>
                        {hasLocation && (
                          <View style={styles.relativeLocationBadge}>
                            <Text style={styles.relativeLocationBadgeText}>Đã ghim 📍</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.saveRelativeContactSub} numberOfLines={1}>
                        {contact.address ? contact.address : 'Chưa có địa chỉ đã lưu'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
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

      {/* MODAL CẢNH BÁO YÊU CẦU SOS ĐÃ TỒN TẠI (GỌN GÀNG, CÂN ĐỐI) */}
      <Modal
        visible={!!nearbyAlertData}
        transparent
        animationType="fade"
        onRequestClose={() => setNearbyAlertData(null)}
      >
        <View style={styles.nearbyModalOverlay}>
          <View style={styles.nearbyModalCard}>
            <View style={styles.nearbyModalIconWrap}>
              <Ionicons name="alert-circle" size={32} color="#0284C7" />
            </View>

            <Text style={styles.nearbyModalTitle}>ĐÃ CÓ YÊU CẦU CỨU HỘ TẠI ĐÂY</Text>

            {nearbyAlertData?.sosCode ? (
              <View style={styles.nearbyCodeBadge}>
                <Text style={styles.nearbyCodeBadgeLabel}>Mã cứu nạn:</Text>
                <Text style={styles.nearbyCodeBadgeValue}>{nearbyAlertData.sosCode}</Text>
              </View>
            ) : null}

            <Text style={styles.nearbyModalDesc}>
              Bạn đã có một yêu cầu cứu nạn đang mở tại vị trí này. Vui lòng chuyển đến mục{' '}
              <Text style={{ fontWeight: '800', color: '#0284C7' }}>Cập nhật</Text> để bổ sung thông tin thay vì gửi mới!
            </Text>

            <View style={styles.nearbyModalButtons}>
              <TouchableOpacity
                style={styles.nearbyGoUpdateBtn}
                onPress={() => {
                  const targetId = nearbyAlertData?.sosId;
                  setNearbyAlertData(null);
                  if (targetId) {
                    setTrackingSosId(targetId);
                    setShowTrackingModal(true);
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.nearbyGoUpdateBtnText}>ĐẾN CẬP NHẬT TÍN HIỆU</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.nearbyBackBtn}
                onPress={() => setNearbyAlertData(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.nearbyBackBtnText}>TRỞ VỀ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL CẢNH BÁO GIỚI HẠN TỐI ĐA 3 YÊU CẦU CỨU NẠN (GIAO DIỆN ĐẸP MẮT, HIỆN ĐẠI) */}
      <Modal
        visible={!!limitAlertData}
        transparent
        animationType="fade"
        onRequestClose={() => setLimitAlertData(null)}
      >
        <View style={styles.limitModalOverlay}>
          <View style={styles.limitModalCard}>
            <View style={styles.limitModalIconWrap}>
              <Ionicons name="shield-outline" size={32} color="#0284C7" />
            </View>

            <Text style={styles.limitModalTitle}>GIỚI HẠN YÊU CẦU CỨU HỘ</Text>

            <Text style={styles.limitModalDesc}>
              Mỗi tài khoản chỉ được phép gửi tối đa{' '}
              <Text style={{ fontWeight: '800', color: '#0284C7' }}>
                {limitAlertData?.maxLimit || 3} yêu cầu cứu nạn
              </Text>{' '}
              đang hoạt động cùng lúc để đảm bảo nguồn lực điều phối kịp thời.
            </Text>

            {limitAlertData?.activeSosList && limitAlertData.activeSosList.length > 0 ? (
              <View style={styles.limitActiveListBox}>
                <Text style={styles.limitActiveListTitle}>
                  Các ca đang hoạt động của bạn ({limitAlertData.activeSosList.length}):
                </Text>
                {limitAlertData.activeSosList.map((item, idx) => (
                  <View key={item._id || String(idx)} style={styles.limitActiveItemRow}>
                    <Ionicons name="radio-button-on" size={11} color="#0284C7" style={{ marginRight: 6 }} />
                    <Text style={styles.limitActiveCodeText}>{item.sosCode}</Text>
                    {item.address ? (
                      <Text style={styles.limitActiveAddressText} numberOfLines={1}>
                        {' - '}{item.address}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={styles.limitModalSubDesc}>
              Vui lòng theo dõi tiến trình hoặc hủy / xác nhận an toàn ca trước đó nếu đã thoát hiểm!
            </Text>

            <View style={styles.limitModalButtons}>
              <TouchableOpacity
                style={styles.limitManageBtn}
                onPress={async () => {
                  let targetId = limitAlertData?.existingSosId;
                  setLimitAlertData(null);
                  if (!targetId) {
                    try {
                      const res = await backendApi.get('/sos');
                      if (res?.data && res.data[0]) targetId = res.data[0]._id;
                    } catch { }
                  }
                  if (targetId) {
                    setTrackingSosId(targetId);
                    setShowTrackingModal(true);
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.limitManageBtnText}>THEO DÕI & QUẢN LÝ CÁC CA NÀY</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.limitCloseBtn}
                onPress={() => setLimitAlertData(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.limitCloseBtnText}>ĐÃ HIỂU</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL THÔNG BÁO CẬP NHẬT THÀNH CÔNG (THAY THẾ ALERT MẶC ĐỊNH) */}
      <Modal
        visible={!!updateSuccessData}
        transparent
        animationType="fade"
        onRequestClose={handleConfirmUpdateSuccess}
      >
        <View style={styles.limitModalOverlay}>
          <View style={styles.updateSuccessModalCard}>
            <View style={styles.updateSuccessIconWrap}>
              <Ionicons name="checkmark-circle" size={48} color="#16A34A" />
            </View>

            <Text style={styles.updateSuccessTitle}>CẬP NHẬT THÀNH CÔNG!</Text>

            {updateSuccessData?.sosCode ? (
              <View style={styles.nearbyCodeBadge}>
                <Text style={styles.nearbyCodeBadgeLabel}>Mã cứu nạn:</Text>
                <Text style={styles.nearbyCodeBadgeValue}>{updateSuccessData.sosCode}</Text>
              </View>
            ) : null}

            <Text style={styles.updateSuccessDesc}>
              Thông tin yêu cầu cứu nạn của bạn đã được cập nhật thành công và chuyển ngay đến Đội cứu hộ.
            </Text>

            <TouchableOpacity
              style={styles.updateSuccessDoneBtn}
              onPress={handleConfirmUpdateSuccess}
              activeOpacity={0.85}
            >
              <Text style={styles.updateSuccessDoneBtnText}>QUAY LẠI MÀN HÌNH THEO DÕI</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL THEO DÕI & CẬP NHẬT CA SOS ĐANG HOẠT ĐỘNG */}
      {showTrackingModal && trackingSosId ? (
        <CitizenSosTrackingModal
          visible={showTrackingModal}
          sosId={trackingSosId}
          onClose={() => {
            setShowTrackingModal(false);
            setTrackingSosId(null);
          }}
        />
      ) : null}
    </View>
  );
};



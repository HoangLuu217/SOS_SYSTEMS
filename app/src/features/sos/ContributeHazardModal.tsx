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
  Modal,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { backendApi } from '@/api';
import { useAuth } from '@/context/AuthContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ContributeHazardModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialCoords?: { latitude: number; longitude: number };
}

interface LocalHazardImage {
  id: string;
  uri: string;
  base64?: string;
}

interface MyHazardReportItem {
  _id: string;
  title: string;
  description: string;
  hazardType: string;
  customHazardType?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  address: string;
  location: {
    type: string;
    coordinates: [number, number]; // [lng, lat]
  };
  images?: string[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
  reviewNote?: string;
  reviewedBy?: {
    fullName?: string;
  };
  reviewedAt?: string;
  createdAt: string;
}

const HAZARD_TYPES = [
  { key: 'FLOOD', label: 'Ngập lụt', icon: 'water-alert', iconLib: 'mci' },
  { key: 'LANDSLIDE', label: 'Sạt lở đất', icon: 'image-filter-hdr', iconLib: 'mci' },
  { key: 'FALLEN_TREE', label: 'Cây đổ / Cản trở', icon: 'tree', iconLib: 'mci' },
  { key: 'ELECTRICAL', label: 'Sự cố điện', icon: 'flash-alert', iconLib: 'mci' },
  { key: 'ROAD_DAMAGE', label: 'Hư hỏng đường', icon: 'road-variant', iconLib: 'mci' },
  { key: 'OTHER', label: 'Nguy hiểm khác', icon: 'alert-circle', iconLib: 'mci' },
];

const SEVERITIES = [
  { key: 'LOW', label: 'Thấp', color: '#10B981' },
  { key: 'MEDIUM', label: 'Trung bình', color: '#F59E0B' },
  { key: 'HIGH', label: 'Cao', color: '#F97316' },
  { key: 'CRITICAL', label: 'Nguy hiểm', color: '#EF4444' },
];

export const ContributeHazardModal: React.FC<ContributeHazardModalProps> = ({
  visible,
  onClose,
  onSuccess,
  initialCoords,
}) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Navigation Tab trong modal: 'CREATE' (Đóng góp mới) hoặc 'HISTORY' (Xem lại các đóng góp)
  const [modalTab, setModalTab] = useState<'CREATE' | 'HISTORY'>('CREATE');

  // Vị trí GPS & Form
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loadingGps, setLoadingGps] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState('');

  // Form Fields
  const [title, setTitle] = useState('');
  const [hazardType, setHazardType] = useState('FLOOD');
  const [customHazardType, setCustomHazardType] = useState('');
  const [severity, setSeverity] = useState('HIGH');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');

  // Danh sách nhiều ảnh hiện trường (Hỗ trợ upload lên Cloudinary)
  const [selectedImages, setSelectedImages] = useState<LocalHazardImage[]>([]);

  // Xem ảnh phóng to (Zoom Modal)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Lịch sử đóng góp của tôi
  const [myReports, setMyReports] = useState<MyHazardReportItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');

  // Map Picker State (Google Maps)
  const webViewRef = useRef<WebView>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [recenterLoading, setRecenterLoading] = useState(false);
  const [pickerCoords, setPickerCoords] = useState<{ latitude: number; longitude: number }>({
    latitude: 16.0544,
    longitude: 108.2022,
  });

  // Đưa ghim trên bản đồ về vị trí GPS hiện tại
  const recenterToMyLocation = async () => {
    setRecenterLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền GPS', 'Ứng dụng cần quyền GPS để lấy vị trí hiện tại.');
        setRecenterLoading(false);
        return;
      }
      const currentLoc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = {
        latitude: currentLoc.coords.latitude,
        longitude: currentLoc.coords.longitude,
      };
      setPickerCoords(coords);
      webViewRef.current?.injectJavaScript(`
        if (typeof map !== 'undefined' && typeof marker !== 'undefined') {
          map.setView([${coords.latitude}, ${coords.longitude}], 16);
          marker.setLatLng([${coords.latitude}, ${coords.longitude}]);
          notify(${coords.latitude}, ${coords.longitude});
        }
        true;
      `);
    } catch {
      Alert.alert('Lỗi GPS', 'Không thể lấy tọa độ hiện tại.');
    } finally {
      setRecenterLoading(false);
    }
  };

  // Lấy vị trí GPS hiện tại
  const fetchCurrentLocation = async () => {
    setLoadingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền GPS', 'Ứng dụng cần quyền GPS để ghi nhận chính xác vị trí nguy hiểm.');
        setLoadingGps(false);
        return;
      }

      const currentLoc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords = {
        latitude: currentLoc.coords.latitude,
        longitude: currentLoc.coords.longitude,
      };
      setLocation(coords);
      setPickerCoords(coords);

      try {
        const [geo] = await Location.reverseGeocodeAsync(coords);
        if (geo) {
          const formatted = [geo.streetNumber, geo.street, geo.district, geo.city]
            .filter(Boolean)
            .join(', ');
          if (formatted && !address) {
            setAddress(formatted);
          }
        }
      } catch {
        // Reverse geocoding optional
      }
    } catch (err) {
      Alert.alert('Lỗi GPS', 'Không thể lấy tọa độ hiện tại. Vui lòng thử lại.');
    } finally {
      setLoadingGps(false);
    }
  };

  // Tải danh sách đóng góp của người dùng hiện tại
  const fetchMyReports = async () => {
    setLoadingHistory(true);
    try {
      const res = await backendApi.get('/hazard-reports?myReports=true');
      if (res.success && res.data?.reports) {
        setMyReports(res.data.reports);
      } else if (res.success && Array.isArray(res.data)) {
        setMyReports(res.data);
      }
    } catch (err) {
      console.warn('Lỗi lấy lịch sử đóng góp:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (visible) {
      if (initialCoords) {
        setLocation(initialCoords);
        setPickerCoords(initialCoords);
      } else {
        fetchCurrentLocation();
      }
      fetchMyReports();
    }
  }, [visible, initialCoords]);

  // Tự động làm mới danh sách đóng góp theo thời gian thực khi ở tab Lịch sử
  useEffect(() => {
    if (visible && modalTab === 'HISTORY') {
      fetchMyReports();
      const historyTimer = setInterval(() => {
        fetchMyReports();
      }, 5000);
      return () => clearInterval(historyTimer);
    }
  }, [visible, modalTab]);

  // Xác nhận vị trí được chọn từ Map Picker
  const handleConfirmMapPicker = async () => {
    setLocation(pickerCoords);
    setShowMapPicker(false);

    try {
      const [geo] = await Location.reverseGeocodeAsync(pickerCoords);
      if (geo) {
        const formatted = [geo.streetNumber, geo.street, geo.district, geo.city]
          .filter(Boolean)
          .join(', ');
        if (formatted) {
          setAddress(formatted);
        }
      }
    } catch {
      // Optional
    }
  };

  // Chọn NHIỀU ẢNH từ thư viện
  const pickImages = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.35,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newImgs: LocalHazardImage[] = result.assets.map((asset, index) => ({
          id: `${Date.now()}_${index}`,
          uri: asset.uri,
          base64: asset.base64 || undefined,
        }));
        setSelectedImages((prev) => [...prev, ...newImgs].slice(0, 10));
      }
    } catch (err) {
      Alert.alert('Lỗi chọn ảnh', 'Không thể mở thư viện ảnh.');
    }
  };

  // Chụp ảnh từ Camera
  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền máy ảnh', 'Cần cấp quyền máy ảnh để chụp hiện trường.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.35,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newImg: LocalHazardImage = {
          id: `${Date.now()}`,
          uri: result.assets[0].uri,
          base64: result.assets[0].base64 || undefined,
        };
        setSelectedImages((prev) => [...prev, newImg].slice(0, 10));
      }
    } catch (err) {
      Alert.alert('Lỗi chụp ảnh', 'Không thể khởi động máy ảnh.');
    }
  };

  // Xóa bớt ảnh đã chọn
  const removeSelectedImage = (id: string) => {
    setSelectedImages((prev) => prev.filter((img) => img.id !== id));
  };

  // Xử lý gửi đóng góp & Upload Cloudinary
  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tiêu đề điểm nguy hiểm.');
      return;
    }

    if (hazardType === 'OTHER' && !customHazardType.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên loại nguy hiểm cụ thể.');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng mô tả chi tiết tình hình hiện trường.');
      return;
    }

    if (!address.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập địa chỉ cụ thể của điểm nguy hiểm.');
      return;
    }

    if (!location) {
      Alert.alert('Thiếu tọa độ', 'Đang thiếu tọa độ vị trí. Vui lòng lấy GPS hoặc chọn ghim trên bản đồ.');
      return;
    }

    if (selectedImages.length === 0) {
      Alert.alert('Thiếu hình ảnh', 'Hình ảnh hiện trường là bắt buộc. Vui lòng chọn hoặc chụp ít nhất 1 ảnh.');
      return;
    }

    setSending(true);
    setUploadStatusText('Đang nén và tải ảnh lên máy chủ...');

    try {
      // 1. Upload danh sách ảnh lên Cloudinary
      let uploadedImageUrls: string[] = [];
      const base64List = selectedImages
        .map((img) => img.base64)
        .filter(Boolean) as string[];

      if (base64List.length > 0) {
        try {
          const fileRes = await backendApi.post('/files', {
            base64Files: base64List,
          });

          if (fileRes.success) {
            if (Array.isArray(fileRes.urls)) {
              uploadedImageUrls = fileRes.urls;
            } else if (fileRes.data?.url) {
              uploadedImageUrls = [fileRes.data.url];
            } else if (Array.isArray(fileRes.data)) {
              uploadedImageUrls = fileRes.data.map((f: any) => f.url || f).filter(Boolean);
            }
          }
        } catch (uploadErr) {
          console.warn('Lỗi upload ảnh lên Cloudinary:', uploadErr);
        }
      }

      setUploadStatusText('Đang gửi thông tin đến Ban chỉ huy PCTT...');

      // 2. Gửi Hazard Report lên Backend với trạng thái PENDING
      const payload = {
        title: title.trim(),
        description: description.trim(),
        hazardType,
        customHazardType: hazardType === 'OTHER' ? customHazardType.trim() : undefined,
        severity,
        address: address.trim(),
        location: {
          type: 'Point',
          coordinates: [location.longitude, location.latitude],
        },
        images: uploadedImageUrls,
      };

      const response = await backendApi.post('/hazard-reports', payload);

      if (response.success) {
        // Tải lại danh sách lịch sử đóng góp ngay lập tức
        fetchMyReports();

        Alert.alert(
          '🎉 Đóng góp thành công!',
          `Điểm nguy hiểm "${title.trim()}" đã được lưu ở trạng thái Chờ duyệt.\n${
            uploadedImageUrls.length > 0
              ? `Đã tải lên thành công ${uploadedImageUrls.length} ảnh hiện trường.`
              : ''
          }\n\nCảm ơn bạn đã hỗ trợ cộng đồng!`,
          [
            {
              text: 'Xem đóng góp của tôi',
              onPress: () => {
                // Reset form và chuyển sang tab Lịch sử
                setTitle('');
                setCustomHazardType('');
                setDescription('');
                setSelectedImages([]);
                setModalTab('HISTORY');
                if (onSuccess) onSuccess();
              },
            },
            {
              text: 'Đóng',
              onPress: () => {
                setTitle('');
                setCustomHazardType('');
                setDescription('');
                setSelectedImages([]);
                onClose();
                if (onSuccess) onSuccess();
              },
            },
          ]
        );
      } else {
        Alert.alert('Lỗi', response.message || 'Không thể gửi đóng góp. Vui lòng thử lại sau.');
      }
    } catch (err: any) {
      Alert.alert('Lỗi kết nối', err.message || 'Không thể kết nối đến máy chủ.');
    } finally {
      setSending(false);
      setUploadStatusText('');
    }
  };

  // Lọc danh sách lịch sử đóng góp
  const filteredMyReports = myReports.filter((item) => {
    if (historyFilter === 'ALL') return true;
    return item.status === historyFilter;
  });

  // HTML cho Google Maps Picker (đồng bộ chuẩn Google Maps với MapScreen)
  const mapPickerHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { padding: 0; margin: 0; }
        html, body, #map {
          height: 100%;
          width: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
          background-color: #f1f5f9;
        }
        .leaflet-container {
          background-color: #f1f5f9;
        }
        .leaflet-tile {
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
        }
        .pin-instruction {
          position: absolute;
          top: 14px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 1000;
          background: rgba(15, 23, 42, 0.88);
          color: #ffffff;
          padding: 8px 18px;
          border-radius: 24px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          font-weight: 600;
          pointer-events: none;
          box-shadow: 0 4px 14px rgba(0,0,0,0.25);
          white-space: nowrap;
        }
      </style>
    </head>
    <body>
      <div class="pin-instruction">📍 Chạm hoặc kéo ghim để chọn vị trí</div>
      <div id="map"></div>
      <script>
        var lat = ${pickerCoords.latitude};
        var lng = ${pickerCoords.longitude};

        var map = L.map('map', {
          zoomControl: false,
          preferCanvas: true
        }).setView([lat, lng], 16);

        L.control.zoom({ position: 'topright' }).addTo(map);

        // 1. Chế độ thu nhỏ (Zoom <= 15):
        // Ẩn toàn bộ quán cà phê, quán ăn (s.t:33|p.v:off)
        // và ẩn toàn bộ tên đường / biển số quốc lộ QL1A... (s.t:21|s.e:l|p.v:off)
        var overviewLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&apistyle=s.t:33|p.v:off%2Cs.t:21|s.e:l|p.v:off&x={x}&y={y}&z={z}', {
          subdomains: ['0', '1', '2', '3'],
          attribution: '© Google Maps',
          minZoom: 1,
          maxZoom: 15,
          keepBuffer: 6,
          tileSize: 256,
          updateWhenIdle: false,
          updateWhenZooming: false
        }).addTo(map);

        // 2. Chế độ phóng to gần (Zoom >= 16):
        // Hiển thị đầy đủ tên các tuyến đường phố nội đô, ngõ hẻm để dễ chọn vị trí chính xác;
        // đồng thời vẫn ẩn quán cà phê (s.t:33|p.v:off) và ẩn biển quốc lộ QL1A (s.t:22|s.e:l|p.v:off)
        var detailLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&apistyle=s.t:33|p.v:off%2Cs.t:22|s.e:l|p.v:off&x={x}&y={y}&z={z}', {
          subdomains: ['0', '1', '2', '3'],
          attribution: '© Google Maps',
          minZoom: 16,
          maxZoom: 20,
          keepBuffer: 6,
          tileSize: 256,
          updateWhenIdle: false,
          updateWhenZooming: false
        }).addTo(map);

        // Ghim đỏ Google Maps chuyên nghiệp nhận diện điểm nguy hiểm
        var pinSvg = '<svg width="34" height="46" viewBox="0 0 34 46" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 8px rgba(0,0,0,0.38));"><path d="M17 0C7.61116 0 0 7.61116 0 17C0 29.75 17 46 17 46C17 46 34 29.75 34 17C34 7.61116 26.3888 0 17 0Z" fill="#DC2626"/><circle cx="17" cy="17" r="8" fill="#FFFFFF"/><path d="M17 11.5V18.5M17 22.5H17.01" stroke="#DC2626" stroke-width="2.5" stroke-linecap="round"/></svg>';

        var customPin = L.divIcon({
          html: '<div style="cursor: pointer; display: flex; align-items: center; justify-content: center;">' + pinSvg + '</div>',
          className: '',
          iconSize: [34, 46],
          iconAnchor: [17, 46],
          popupAnchor: [0, -46]
        });

        var marker = L.marker([lat, lng], { draggable: true, icon: customPin }).addTo(map);

        function notify(newLat, newLng) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PICKED_LOCATION',
              latitude: newLat,
              longitude: newLng
            }));
          }
        }

        map.on('click', function(e) {
          marker.setLatLng(e.latlng);
          notify(e.latlng.lat, e.latlng.lng);
        });

        marker.on('dragend', function(e) {
          var pos = marker.getLatLng();
          notify(pos.lat, pos.lng);
        });

        function fixMapSize() {
          if (map) {
            map.invalidateSize();
          }
        }
        window.addEventListener('load', function() {
          setTimeout(fixMapSize, 100);
          setTimeout(fixMapSize, 350);
          setTimeout(fixMapSize, 800);
        });
        window.addEventListener('resize', fixMapSize);
        setTimeout(fixMapSize, 150);
        setTimeout(fixMapSize, 500);
      </script>
    </body>
    </html>
  `;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ==================== MODAL HEADER ==================== */}
        <View
          style={[
            styles.header,
            {
              paddingTop: Math.max(
                insets.top + 8,
                Platform.OS === 'android' ? 44 : 54
              ),
            },
          ]}
        >
          <View style={styles.headerTitleWrap}>
            <View style={styles.headerIconCircle}>
              <Feather
                name={modalTab === 'CREATE' ? 'alert-triangle' : 'clock'}
                size={20}
                color="#EA580C"
              />
            </View>
            <View>
              <Text style={styles.headerTitle}>
                {modalTab === 'CREATE' ? 'Đóng Góp Điểm Nguy Hiểm' : 'Đóng Góp Của Tôi'}
              </Text>
              <Text style={styles.headerSubtitle}>
                {modalTab === 'CREATE'
                  ? 'Báo cáo sạt lở, ngập lụt đến Ban chỉ huy PCTT duyệt'
                  : `Đã gửi ${myReports.length} điểm nguy hiểm`}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
            <Feather name="x" size={22} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* ==================== TABS CHUYỂN ĐỔI ==================== */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, modalTab === 'CREATE' && styles.tabItemActive]}
            onPress={() => setModalTab('CREATE')}
            activeOpacity={0.8}
          >
            <Feather
              name="edit-3"
              size={15}
              color={modalTab === 'CREATE' ? '#0066FF' : '#64748B'}
            />
            <Text style={[styles.tabText, modalTab === 'CREATE' && styles.tabTextActive]}>
              Đóng góp mới
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, modalTab === 'HISTORY' && styles.tabItemActive]}
            onPress={() => {
              setModalTab('HISTORY');
              fetchMyReports();
            }}
            activeOpacity={0.8}
          >
            <Feather
              name="list"
              size={15}
              color={modalTab === 'HISTORY' ? '#0066FF' : '#64748B'}
            />
            <Text style={[styles.tabText, modalTab === 'HISTORY' && styles.tabTextActive]}>
              Đóng góp đã gửi
            </Text>
            {myReports.length > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{myReports.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ==================== TAB 1: FORM ĐÓNG GÓP MỚI ==================== */}
        {modalTab === 'CREATE' && (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Info Banner: Khung nền trắng, chữ cam vàng, ngắn gọn */}
            <View style={styles.pendingInfoBanner}>
              <Feather name="clock" size={15} color="#D97706" style={{ marginTop: 2 }} />
              <Text style={styles.pendingInfoText}>
                Thông tin sẽ ở trạng thái <Text style={{ fontWeight: '700' }}>chờ duyệt</Text>. Sau
                khi chính quyền thẩm định, điểm này sẽ được hiển thị trên bản đồ cứu nạn.
              </Text>
            </View>

            {/* Người báo: Chỉ hiển thị tên, không khung xanh mà chữ xanh thôi */}
            <View style={styles.reporterRow}>
              <Feather name="user" size={15} color="#0066FF" />
              <Text style={styles.reporterText}>
                Người báo: <Text style={styles.reporterName}>{user?.fullName || 'Người dùng SOS'}</Text>
              </Text>
            </View>

            {/* 1. Tiêu đề điểm nguy hiểm */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Tiêu đề điểm nguy hiểm <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="VD: Sạt lở đèo Sơn Trà, Ngập sâu 1.2m đường Trưng Nữ Vương..."
                placeholderTextColor="#94A3B8"
                value={title}
                onChangeText={setTitle}
              />
            </View>

            {/* 2. Loại rủi ro / nguy hiểm */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Loại nguy hiểm thiên tai <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.typeGrid}>
                {HAZARD_TYPES.map((t) => {
                  const isSelected = hazardType === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      style={[styles.typeButton, isSelected && styles.typeButtonSelected]}
                      onPress={() => setHazardType(t.key)}
                      activeOpacity={0.75}
                    >
                      <MaterialCommunityIcons
                        name={t.icon as any}
                        size={20}
                        color={isSelected ? '#FFFFFF' : '#475569'}
                      />
                      <Text style={[styles.typeText, isSelected && styles.typeTextSelected]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Điểm nguy hiểm khác thì cho nhập tay */}
              {hazardType === 'OTHER' && (
                <View style={styles.customTypeWrap}>
                  <Text style={styles.customTypeLabel}>
                    Nhập cụ thể loại nguy hiểm: <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="VD: Lún sụt mố cầu, Dòng nước xoáy ngầm, Đá lăn..."
                    placeholderTextColor="#94A3B8"
                    value={customHazardType}
                    onChangeText={setCustomHazardType}
                    autoFocus
                  />
                </View>
              )}
            </View>

            {/* 3. Mức độ nghiêm trọng */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Mức độ nguy hiểm <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.severityRow}>
                {SEVERITIES.map((s) => {
                  const isSelected = severity === s.key;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      style={[
                        styles.severityButton,
                        isSelected && { backgroundColor: s.color, borderColor: s.color },
                      ]}
                      onPress={() => setSeverity(s.key)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.severityText,
                          isSelected && { color: '#FFFFFF', fontWeight: '700' },
                        ]}
                      >
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 4. Tọa độ hiện trường: Hỗ trợ lấy GPS hoặc Mở Google Maps chọn ghim */}
            <View style={styles.formGroup}>
              <View style={styles.gpsLabelRow}>
                <Text style={styles.label}>
                  Tọa độ hiện trường <Text style={styles.required}>*</Text>
                </Text>
                <View style={styles.gpsActionsRow}>
                  {/* Nút 1: Lấy GPS hiện tại */}
                  <TouchableOpacity
                    style={styles.actionGpsBtn}
                    onPress={fetchCurrentLocation}
                    disabled={loadingGps}
                    activeOpacity={0.7}
                  >
                    {loadingGps ? (
                      <ActivityIndicator size="small" color="#0066FF" />
                    ) : (
                      <>
                        <Feather name="navigation" size={12} color="#0066FF" />
                        <Text style={styles.actionGpsText}>Lấy GPS</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Nút 2: Mở bản đồ chọn ghim */}
                  <TouchableOpacity
                    style={[styles.actionGpsBtn, styles.mapPickerBtn]}
                    onPress={() => {
                      if (location) {
                        setPickerCoords(location);
                      }
                      setShowMapPicker(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name="map-pin" size={12} color="#0066FF" />
                    <Text style={[styles.actionGpsText, { color: '#0066FF' }]}>Ghim bản đồ</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.gpsBox}>
                <Feather name="map-pin" size={17} color="#EA580C" />
                <Text style={styles.gpsText}>
                  {location
                    ? `[${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}]`
                    : 'Đang xác định tọa độ...'}
                </Text>
              </View>
            </View>

            {/* 5. Địa chỉ cụ thể */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Địa chỉ / Mô tả vị trí đường đi <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="VD: Đoạn dốc gần Chùa Linh Ứng, P. Thọ Quang, Sơn Trà..."
                placeholderTextColor="#94A3B8"
                value={address}
                onChangeText={setAddress}
              />
            </View>

            {/* 6. Mô tả chi tiết hiện trường */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Mô tả chi tiết tình hình <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Nêu rõ mức độ nước sâu, xe máy có qua được không, đất đá sạt lở chặn mấy làn đường..."
                placeholderTextColor="#94A3B8"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* 7. Hình ảnh hiện trường (Gửi nhiều ảnh - Lưu trữ lên Cloudinary) */}
            <View style={styles.formGroup}>
              <View style={styles.imageHeaderRow}>
                <Text style={styles.label}>
                  Hình ảnh hiện trường <Text style={styles.required}>*</Text>
                </Text>
                <Text style={styles.imageCountText}>{selectedImages.length}/10 ảnh</Text>
              </View>

              {/* Danh sách ảnh đã chọn */}
              {selectedImages.length > 0 ? (
                <View style={styles.imageGalleryContainer}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.galleryScroll}
                  >
                    {selectedImages.map((img, idx) => (
                      <View key={img.id} style={styles.thumbnailWrapper}>
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => setPreviewImageUrl(img.uri)}
                        >
                          <Image source={{ uri: img.uri }} style={styles.thumbnailImage} />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.thumbnailRemoveBtn}
                          onPress={() => removeSelectedImage(img.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Feather name="x" size={13} color="#FFFFFF" />
                        </TouchableOpacity>

                        <View style={styles.thumbnailIndexBadge}>
                          <Text style={styles.thumbnailIndexText}>{idx + 1}</Text>
                        </View>
                      </View>
                    ))}

                    {selectedImages.length < 10 && (
                      <TouchableOpacity
                        style={styles.addMoreImageBtn}
                        onPress={pickImages}
                        activeOpacity={0.75}
                      >
                        <Feather name="plus" size={24} color="#0066FF" />
                        <Text style={styles.addMoreImageText}>Thêm ảnh</Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>

                  <View style={styles.imageActionRow}>
                    <TouchableOpacity
                      style={styles.imageMiniBtn}
                      onPress={pickImages}
                      activeOpacity={0.75}
                    >
                      <Feather name="image" size={14} color="#0066FF" />
                      <Text style={styles.imageMiniText}>Thêm từ thư viện</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.imageMiniBtn}
                      onPress={takePhoto}
                      activeOpacity={0.75}
                    >
                      <Feather name="camera" size={14} color="#0066FF" />
                      <Text style={styles.imageMiniText}>Chụp thêm ảnh</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.imageButtonRow}>
                  <TouchableOpacity
                    style={styles.imagePickerBtn}
                    onPress={pickImages}
                    activeOpacity={0.75}
                  >
                    <Feather name="image" size={18} color="#0066FF" />
                    <Text style={styles.imagePickerText}>Chọn nhiều ảnh</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.imagePickerBtn}
                    onPress={takePhoto}
                    activeOpacity={0.75}
                  >
                    <Feather name="camera" size={18} color="#0066FF" />
                    <Text style={styles.imagePickerText}>Chụp ảnh ngay</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Nút gửi đóng góp */}
            <TouchableOpacity
              style={[styles.submitButton, sending && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={sending}
              activeOpacity={0.85}
            >
              {sending ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.submitButtonText}>
                    {uploadStatusText || 'ĐANG GỬI ĐẾN CHÍNH QUYỀN...'}
                  </Text>
                </>
              ) : (
                <>
                  <Feather name="send" size={18} color="#FFFFFF" />
                  <Text style={styles.submitButtonText}>GỬI ĐIỂM NGUY HIỂM ĐẾN CHÍNH QUYỀN</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ==================== TAB 2: XEM LẠI CÁC ĐÓNG GÓP ĐÃ GỬI ==================== */}
        {modalTab === 'HISTORY' && (
          <View style={styles.historyContainer}>
            {/* Bộ lọc trạng thái */}
            <View style={styles.filterChipRow}>
              {[
                { key: 'ALL', label: 'Tất cả' },
                { key: 'PENDING', label: 'Chờ duyệt' },
                { key: 'APPROVED', label: 'Đã duyệt' },
                { key: 'REJECTED', label: 'Từ chối' },
              ].map((chip) => {
                const isActive = historyFilter === chip.key;
                return (
                  <TouchableOpacity
                    key={chip.key}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                    onPress={() => setHistoryFilter(chip.key as any)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {loadingHistory ? (
              <View style={styles.historyCenter}>
                <ActivityIndicator size="large" color="#EA580C" />
                <Text style={styles.historyLoadingText}>Đang tải danh sách đóng góp...</Text>
              </View>
            ) : filteredMyReports.length === 0 ? (
              <ScrollView
                contentContainerStyle={styles.historyEmptyWrap}
                refreshControl={
                  <RefreshControl refreshing={loadingHistory} onRefresh={fetchMyReports} />
                }
              >
                <View style={styles.emptyIconCircle}>
                  <Feather name="inbox" size={36} color="#94A3B8" />
                </View>
                <Text style={styles.emptyTitle}>Chưa có đóng góp nào</Text>
                <Text style={styles.emptySubtitle}>
                  {historyFilter === 'ALL'
                    ? 'Bạn chưa gửi điểm nguy hiểm nào. Khi bạn báo cáo ngập lụt, sạt lở, thông tin sẽ được lưu tại đây.'
                    : `Không có đóng góp nào ở trạng thái "${
                        historyFilter === 'PENDING'
                          ? 'Chờ duyệt'
                          : historyFilter === 'APPROVED'
                          ? 'Đã duyệt'
                          : 'Từ chối'
                      }".`}
                </Text>
                <TouchableOpacity
                  style={styles.emptyActionButton}
                  onPress={() => setModalTab('CREATE')}
                  activeOpacity={0.8}
                >
                  <Feather name="plus-circle" size={16} color="#FFFFFF" />
                  <Text style={styles.emptyActionText}>Tạo đóng góp mới ngay</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <ScrollView
                contentContainerStyle={styles.historyListContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl refreshing={loadingHistory} onRefresh={fetchMyReports} />
                }
              >
                {filteredMyReports.map((item) => {
                  const hazardMeta = HAZARD_TYPES.find((t) => t.key === item.hazardType);
                  const displayType =
                    item.hazardType === 'OTHER' && item.customHazardType
                      ? item.customHazardType
                      : hazardMeta?.label || 'Nguy hiểm';

                  return (
                    <View key={item._id} style={styles.reportCard}>
                      {/* Card Header: Loại & Trạng thái duyệt */}
                      <View style={styles.cardHeaderRow}>
                        <View style={styles.typeBadge}>
                          <MaterialCommunityIcons
                            name={(hazardMeta?.icon as any) || 'alert-circle'}
                            size={14}
                            color="#EA580C"
                          />
                          <Text style={styles.typeBadgeText}>{displayType}</Text>
                        </View>

                        {/* Status Badge */}
                        <View
                          style={[
                            styles.statusBadge,
                            item.status === 'APPROVED' && styles.statusBadgeApproved,
                            item.status === 'REJECTED' && styles.statusBadgeRejected,
                            item.status === 'PENDING' && styles.statusBadgePending,
                          ]}
                        >
                          <Feather
                            name={
                              item.status === 'APPROVED'
                                ? 'check-circle'
                                : item.status === 'REJECTED'
                                ? 'x-circle'
                                : 'clock'
                            }
                            size={12}
                            color={
                              item.status === 'APPROVED'
                                ? '#16A34A'
                                : item.status === 'REJECTED'
                                ? '#DC2626'
                                : '#D97706'
                            }
                          />
                          <Text
                            style={[
                              styles.statusBadgeText,
                              item.status === 'APPROVED' && styles.statusTextApproved,
                              item.status === 'REJECTED' && styles.statusTextRejected,
                              item.status === 'PENDING' && styles.statusTextPending,
                            ]}
                          >
                            {item.status === 'APPROVED'
                              ? 'ĐÃ DUYỆT'
                              : item.status === 'REJECTED'
                              ? 'TỪ CHỐI'
                              : 'CHỜ DUYỆT'}
                          </Text>
                        </View>
                      </View>

                      {/* Tiêu đề & Mô tả */}
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.cardDesc} numberOfLines={3}>
                        {item.description}
                      </Text>

                      {/* Địa chỉ & Tọa độ */}
                      <View style={styles.cardAddressRow}>
                        <Feather name="map-pin" size={13} color="#64748B" style={{ marginTop: 2 }} />
                        <Text style={styles.cardAddressText} numberOfLines={2}>
                          {item.address}
                        </Text>
                      </View>

                      {item.location?.coordinates && (
                        <View style={styles.cardCoordsRow}>
                          <Feather name="crosshair" size={12} color="#0066FF" />
                          <Text style={styles.cardCoordsText}>
                            [{item.location.coordinates[1].toFixed(5)},{' '}
                            {item.location.coordinates[0].toFixed(5)}]
                          </Text>
                          <Text style={styles.cardDot}>•</Text>
                          <Text style={styles.cardDateText}>
                            {new Date(item.createdAt).toLocaleString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })}
                          </Text>
                        </View>
                      )}

                      {/* Danh sách ảnh hiện trường (Lưu trên Cloudinary) */}
                      {item.images && item.images.length > 0 && (
                        <View style={styles.cardImagesSection}>
                          <Text style={styles.cardImagesTitle}>
                            📸 {item.images.length} ảnh hiện trường:
                          </Text>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.cardImagesScroll}
                          >
                            {item.images.map((imgUrl, imgIdx) => (
                              <TouchableOpacity
                                key={imgIdx}
                                activeOpacity={0.85}
                                onPress={() => setPreviewImageUrl(imgUrl)}
                                style={styles.cardImageThumbWrap}
                              >
                                <Image
                                  source={{ uri: imgUrl }}
                                  style={styles.cardImageThumb}
                                  resizeMode="cover"
                                />
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}

                      {/* Phản hồi / Ý kiến thẩm định từ chính quyền */}
                      {item.reviewNote && (
                        <View style={styles.reviewNoteCallout}>
                          <Feather name="message-square" size={14} color="#0284C7" />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.reviewNoteTitle}>Ý kiến Ban chỉ huy:</Text>
                            <Text style={styles.reviewNoteText}>{item.reviewNote}</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ==================== MODAL PHÓNG TO XEM ẢNH FULL SIZE ==================== */}
      <Modal
        visible={Boolean(previewImageUrl)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUrl(null)}
      >
        <View style={styles.previewModalOverlay}>
          <TouchableOpacity
            style={styles.previewCloseBtn}
            onPress={() => setPreviewImageUrl(null)}
            activeOpacity={0.8}
          >
            <Feather name="x" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {previewImageUrl && (
            <Image
              source={{ uri: previewImageUrl }}
              style={styles.fullPreviewImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* ==================== MODAL CHỌN GHIM TRÊN GOOGLE MAPS ==================== */}
      <Modal visible={showMapPicker} animationType="slide" onRequestClose={() => setShowMapPicker(false)}>
        <View style={styles.mapPickerModalContainer}>
          <View
            style={[
              styles.mapPickerHeader,
              { paddingTop: Math.max(insets.top + 8, Platform.OS === 'android' ? 44 : 54) },
            ]}
          >
            <View>
              <Text style={styles.mapPickerTitle}>Chọn vị trí trên bản đồ</Text>
              <Text style={styles.mapPickerSubtitle}>Chạm hoặc kéo ghim đỏ đến đúng điểm nguy hiểm</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowMapPicker(false)}
              activeOpacity={0.7}
            >
              <Feather name="x" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={styles.mapViewWrap}>
            <WebView
              ref={webViewRef}
              originWhitelist={['*']}
              source={{ html: mapPickerHtml }}
              style={styles.webView}
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  if (data.type === 'PICKED_LOCATION') {
                    setPickerCoords({
                      latitude: data.latitude,
                      longitude: data.longitude,
                    });
                  }
                } catch (e) {
                  // Optional parse error
                }
              }}
            />

            {/* Nút định vị GPS về vị trí hiện tại */}
            <TouchableOpacity
              style={styles.myLocationFab}
              onPress={recenterToMyLocation}
              disabled={recenterLoading}
              activeOpacity={0.8}
            >
              {recenterLoading ? (
                <ActivityIndicator size="small" color="#0066FF" />
              ) : (
                <Feather name="crosshair" size={20} color="#0066FF" />
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.mapPickerBottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.mapPickerCoordsRow}>
              <Feather name="map-pin" size={16} color="#EA580C" />
              <Text style={styles.mapPickerCoordsText}>
                Tọa độ đã chọn: [{pickerCoords.latitude.toFixed(5)}, {pickerCoords.longitude.toFixed(5)}]
              </Text>
            </View>

            <TouchableOpacity
              style={styles.confirmPinButton}
              onPress={handleConfirmMapPicker}
              activeOpacity={0.85}
            >
              <Feather name="check-circle" size={18} color="#FFFFFF" />
              <Text style={styles.confirmPinText}>XÁC NHẬN VỊ TRÍ NÀY</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFEDD5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  closeButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },

  // Tab switcher
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#0066FF',
  },
  tabText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#0066FF',
    fontWeight: '700',
  },
  tabBadge: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // Info banner
  pendingInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FEF3C7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  pendingInfoText: {
    flex: 1,
    fontSize: 12,
    color: '#D97706',
    lineHeight: 17,
  },

  // Người báo
  reporterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  reporterText: {
    fontSize: 13,
    color: '#0066FF',
  },
  reporterName: {
    fontWeight: '700',
    color: '#0066FF',
  },

  formGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  required: {
    color: '#EF4444',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
  },
  textArea: {
    minHeight: 90,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  typeButtonSelected: {
    backgroundColor: '#EA580C',
    borderColor: '#EA580C',
  },
  typeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  typeTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  customTypeWrap: {
    marginTop: 10,
  },
  customTypeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D97706',
    marginBottom: 6,
  },
  severityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  severityButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  severityText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },

  // GPS Row & Buttons
  gpsLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  gpsActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionGpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  mapPickerBtn: {
    backgroundColor: '#EFF6FF',
  },
  actionGpsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066FF',
  },
  gpsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  gpsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#C2410C',
  },

  // Image Gallery Styling
  imageHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  imageCountText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  imageGalleryContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
  },
  galleryScroll: {
    gap: 10,
    alignItems: 'center',
    paddingVertical: 4,
  },
  thumbnailWrapper: {
    position: 'relative',
    width: 90,
    height: 90,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailIndexBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  thumbnailIndexText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  addMoreImageBtn: {
    width: 90,
    height: 90,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  addMoreImageText: {
    fontSize: 11,
    color: '#0066FF',
    fontWeight: '600',
  },
  imageActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  imageMiniBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
    borderRadius: 8,
  },
  imageMiniText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066FF',
  },
  imageButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  imagePickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#93C5FD',
    borderRadius: 12,
    paddingVertical: 14,
  },
  imagePickerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0066FF',
  },

  submitButton: {
    backgroundColor: '#0066FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 10,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // ==================== LỊCH SỬ ĐÓNG GÓP ====================
  historyContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  filterChipRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: {
    backgroundColor: '#0066FF',
  },
  filterChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  historyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  historyLoadingText: {
    color: '#64748B',
    fontSize: 13,
  },
  historyEmptyWrap: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  emptyActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0066FF',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyActionText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  historyListContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  reportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFEDD5',
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C2410C',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgePending: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeApproved: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeRejected: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statusTextPending: {
    color: '#D97706',
  },
  statusTextApproved: {
    color: '#15803D',
  },
  statusTextRejected: {
    color: '#B91C1C',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 10,
  },
  cardAddressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  cardAddressText: {
    flex: 1,
    fontSize: 12,
    color: '#64748B',
  },
  cardCoordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  cardCoordsText: {
    fontSize: 11.5,
    color: '#0066FF',
    fontWeight: '600',
  },
  cardDot: {
    color: '#94A3B8',
    fontSize: 12,
  },
  cardDateText: {
    fontSize: 11,
    color: '#94A3B8',
  },

  // Card images (Cloudinary)
  cardImagesSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cardImagesTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  cardImagesScroll: {
    gap: 8,
  },
  cardImageThumbWrap: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  cardImageThumb: {
    width: '100%',
    height: '100%',
  },

  // Review note callout
  reviewNoteCallout: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    padding: 10,
  },
  reviewNoteTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0369A1',
    marginBottom: 2,
  },
  reviewNoteText: {
    fontSize: 12,
    color: '#0C4A6E',
    lineHeight: 16,
  },

  // Image Preview Modal Overlay
  previewModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullPreviewImage: {
    width: SCREEN_WIDTH * 0.95,
    height: '75%',
  },

  // Map Picker Modal Styles
  mapPickerModalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mapPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  mapPickerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  mapPickerSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  mapViewWrap: {
    flex: 1,
    position: 'relative',
  },
  webView: {
    flex: 1,
  },
  myLocationFab: {
    position: 'absolute',
    bottom: 20,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mapPickerBottomBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  mapPickerCoordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mapPickerCoordsText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#C2410C',
  },
  confirmPinButton: {
    backgroundColor: '#0066FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  confirmPinText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

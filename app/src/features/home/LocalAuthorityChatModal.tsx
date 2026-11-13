import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
  Alert,
  StatusBar,
  Image,
  ScrollView,
  Keyboard,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Ionicons,
  Feather,
  MaterialCommunityIcons,
  FontAwesome5,
} from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/context/AuthContext';
import { backendApi, ChatMessageItem, LocalAuthorityInfo } from '@/api';
import { CitizenSosTrackingModal } from '../profile';

export const SOS_TYPE_LABELS: Record<string, string> = {
  MEDICAL: 'Cấp cứu y tế / Bị thương',
  FIRE: 'Hỏa hoạn / Cháy nổ',
  FLOOD: 'Cứu hộ ngập lụt / Mắc kẹt',
  LANDSLIDE: 'Sạt lở đất / Đổ sập',
  STORM: 'Bão lốc / Cây đổ',
  ACCIDENT: 'Tai nạn khẩn cấp',
  MISSING_PERSON: 'Tìm kiếm người mất tích',
  RESCUE: 'Cứu hộ khẩn cấp',
  FOOD: 'Cứu trợ lương thực',
  EVACUATION: 'Sơ tán khẩn cấp',
  OTHER: 'Cứu nạn khẩn cấp khác',
};

export const SOS_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  PENDING: { label: 'Chờ tiếp nhận', color: '#D97706', bgColor: '#FEF3C7' },
  VERIFIED: { label: 'Đã xác minh', color: '#0284C7', bgColor: '#E0F2FE' },
  ASSIGNED: { label: 'Đã phân công', color: '#7C3AED', bgColor: '#EDE9FE' },
  ACCEPTED: { label: 'Đội đã nhận lệnh', color: '#7C3AED', bgColor: '#EDE9FE' },
  ON_THE_WAY: { label: 'Đang di chuyển tới', color: '#2563EB', bgColor: '#EFF6FF' },
  EN_ROUTE: { label: 'Đang di chuyển tới', color: '#2563EB', bgColor: '#EFF6FF' },
  ARRIVED: { label: 'Đã tiếp cận hiện trường', color: '#059669', bgColor: '#D1FAE5' },
  IN_PROGRESS: { label: 'Đang cứu hộ', color: '#2563EB', bgColor: '#EFF6FF' },
  RESCUING: { label: 'Đang cứu nạn', color: '#DC2626', bgColor: '#FEE2E2' },
  COMPLETED: { label: 'Hoàn thành', color: '#16A34A', bgColor: '#DCFCE7' },
  RESOLVED: { label: 'Đã giải quyết', color: '#16A34A', bgColor: '#DCFCE7' },
  CANCELLED: { label: 'Đã hủy', color: '#DC2626', bgColor: '#FEE2E2' },
  REJECTED: { label: 'Từ chối', color: '#DC2626', bgColor: '#FEE2E2' },
};

export interface WardOption {
  ward: string;
  category: string;
  province: string;
  fullName: string;
}

const removeVietnameseTones = (str: string): string => {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
};

const DANANG_CATEGORIES = [
  'Tất cả',
  'Trung tâm',
  'Ven biển',
  'Đô thị mới',
  'Ngoại thành',
];

const POPULAR_WARDS: WardOption[] = [
  // 1. Phường Trung tâm
  { ward: 'Phường Hải Châu', category: 'Trung tâm', province: 'Thành phố Đà Nẵng', fullName: 'Phường Hải Châu, Thành phố Đà Nẵng' },
  { ward: 'Phường Thanh Khê', category: 'Trung tâm', province: 'Thành phố Đà Nẵng', fullName: 'Phường Thanh Khê, Thành phố Đà Nẵng' },
  { ward: 'Phường An Khê', category: 'Trung tâm', province: 'Thành phố Đà Nẵng', fullName: 'Phường An Khê, Thành phố Đà Nẵng' },
  { ward: 'Phường Hòa Cường', category: 'Trung tâm', province: 'Thành phố Đà Nẵng', fullName: 'Phường Hòa Cường, Thành phố Đà Nẵng' },

  // 2. Phường Ven biển & Hải đảo
  { ward: 'Phường Sơn Trà', category: 'Ven biển', province: 'Thành phố Đà Nẵng', fullName: 'Phường Sơn Trà, Thành phố Đà Nẵng' },
  { ward: 'Phường An Hải', category: 'Ven biển', province: 'Thành phố Đà Nẵng', fullName: 'Phường An Hải, Thành phố Đà Nẵng' },
  { ward: 'Phường Ngũ Hành Sơn', category: 'Ven biển', province: 'Thành phố Đà Nẵng', fullName: 'Phường Ngũ Hành Sơn, Thành phố Đà Nẵng' },
  { ward: 'Phường Hải Vân', category: 'Ven biển', province: 'Thành phố Đà Nẵng', fullName: 'Phường Hải Vân, Thành phố Đà Nẵng' },
  { ward: 'Đặc khu Hoàng Sa', category: 'Ven biển', province: 'Thành phố Đà Nẵng', fullName: 'Đặc khu Hoàng Sa, Thành phố Đà Nẵng' },

  // 3. Phường Đô thị mới & Công nghiệp
  { ward: 'Phường Liên Chiểu', category: 'Đô thị mới', province: 'Thành phố Đà Nẵng', fullName: 'Phường Liên Chiểu, Thành phố Đà Nẵng' },
  { ward: 'Phường Hòa Khánh', category: 'Đô thị mới', province: 'Thành phố Đà Nẵng', fullName: 'Phường Hòa Khánh, Thành phố Đà Nẵng' },
  { ward: 'Phường Cẩm Lệ', category: 'Đô thị mới', province: 'Thành phố Đà Nẵng', fullName: 'Phường Cẩm Lệ, Thành phố Đà Nẵng' },
  { ward: 'Phường Hòa Xuân', category: 'Đô thị mới', province: 'Thành phố Đà Nẵng', fullName: 'Phường Hòa Xuân, Thành phố Đà Nẵng' },

  // 4. Ngoại thành & Nông thôn
  { ward: 'Xã Hòa Vang', category: 'Ngoại thành', province: 'Thành phố Đà Nẵng', fullName: 'Xã Hòa Vang, Thành phố Đà Nẵng' },
  { ward: 'Xã Hòa Tiến', category: 'Ngoại thành', province: 'Thành phố Đà Nẵng', fullName: 'Xã Hòa Tiến, Thành phố Đà Nẵng' },
  { ward: 'Xã Bà Nà', category: 'Ngoại thành', province: 'Thành phố Đà Nẵng', fullName: 'Xã Bà Nà, Thành phố Đà Nẵng' },
];

interface LocalAuthorityChatModalProps {
  visible: boolean;
  onClose: () => void;
  initialSosData?: any;
}

export const LocalAuthorityChatModal: React.FC<LocalAuthorityChatModalProps> = ({
  visible,
  onClose,
  initialSosData,
}) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Thông tin địa bàn & cán bộ địa phương
  const [localInfo, setLocalInfo] = useState<LocalAuthorityInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [userLocationName, setUserLocationName] = useState<string>('');
  const [provinceName, setProvinceName] = useState<string>('Thành phố Đà Nẵng');
  const [wardName, setWardName] = useState<string>('Thanh Khê');
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Tùy chọn chuyển đổi Phường/Xã thủ công (thay vì cố định theo GPS / Hồ sơ)
  const [showWardPicker, setShowWardPicker] = useState(false);
  const [selectedCustomWard, setSelectedCustomWard] = useState<WardOption | null>(null);
  const [searchWardText, setSearchWardText] = useState('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState('Tất cả');

  // Danh sách tin nhắn & input
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingGps, setSendingGps] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Trạng thái yêu cầu SOS đang hoạt động của người dân
  const [activeSos, setActiveSos] = useState<any | null>(null);
  const [showSosPopup, setShowSosPopup] = useState(false);
  const [sendingSos, setSendingSos] = useState(false);
  const [trackingSosId, setTrackingSosId] = useState<string | null>(null);
  const [sosStatusMap, setSosStatusMap] = useState<Record<string, string>>({});
  const sosStatusMapRef = useRef<Record<string, string>>({});
  sosStatusMapRef.current = sosStatusMap;

  const updateSosStatusMap = useCallback((newEntries: Record<string, string>) => {
    setSosStatusMap((prev) => {
      const next = { ...prev, ...newEntries };
      sosStatusMapRef.current = next;
      return next;
    });
  }, []);

  const [selectedSosDetail, setSelectedSosDetail] = useState<{
    sosId?: any;
    sosCode: string;
    typeLabel: string;
    people: number;
    address: string;
    phone: string;
    description: string;
    status: string;
    lat?: number;
    lng?: number;
    images: string[];
  } | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);

  // Tải lịch sử tin nhắn của kênh địa phương
  const loadChatHistory = async (channel: string) => {
    setLoadingMessages(true);
    try {
      const res = await backendApi.getChatMessages({ channel, limit: 100 });
      if (res.success && res.data?.messages) {
        const seen = new Set<string>();
        const uniqueList = res.data.messages.filter((m) => {
          if (!m._id || seen.has(m._id)) return false;
          seen.add(m._id);
          return true;
        });
        setMessages(uniqueList);
      }
    } catch {
    } finally {
      setLoadingMessages(false);
    }
  };

  // Kết nối Socket.IO thời gian thực
  const initRealtimeSocket = async (channel: string) => {
    try {
      const baseUrl = await backendApi.getBaseUrl();
      const socketUrl = baseUrl.replace(/\/api\/?$/, '');

      if (socketRef.current) {
        socketRef.current.disconnect();
      }

      const socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        extraHeaders: {
          'Bypass-Tunnel-Reminder': 'true',
        },
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setIsConnected(true);
        socket.emit('join_channel', channel);
        if (user?._id) {
          socket.emit('register_user', user._id);
        }
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
      });

      // Nhận tin nhắn mới từ Cán bộ địa phương theo thời gian thực
      socket.on('new_message', (newMsg: ChatMessageItem) => {
        if (newMsg && newMsg.channel === channel) {
          setMessages((prev) => {
            if (prev.some((m) => m._id === newMsg._id)) return prev;

            const tempIdx = prev.findIndex(
              (m) => m._id.startsWith('temp_') && m.content === newMsg.content
            );
            if (tempIdx !== -1) {
              const clone = [...prev];
              clone[tempIdx] = newMsg;
              return clone;
            }

            return [...prev, newMsg];
          });
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      });

      // Lắng nghe cập nhật trạng thái SOS từ Socket.IO hệ thống
      const handleSocketSosUpdate = (sosData: any) => {
        if (!sosData) return;
        const id = sosData._id || sosData.id;
        const code = sosData.sosCode;
        const st = sosData.status;
        if (id || code) {
          const entry: Record<string, string> = {};
          if (id) entry[String(id)] = st;
          if (code) entry[String(code)] = st;
          updateSosStatusMap(entry);
        }
        if (['COMPLETED', 'RESOLVED', 'CANCELLED', 'REJECTED'].includes(st)) {
          setActiveSos((prev: any) => {
            if (!prev) return null;
            const prevId = String(prev._id || prev.id || '');
            if (prevId === String(id) || (code && prev.sosCode === code)) {
              return null;
            }
            return prev;
          });
          setShowSosPopup(false);
          setSelectedSosDetail((prev: any) => {
            if (!prev) return null;
            if (String(prev.sosId) === String(id) || (code && prev.sosCode === code)) {
              return { ...prev, status: st };
            }
            return prev;
          });
        }
      };

      socket.on('sos:updated', handleSocketSosUpdate);
      socket.on('sos:status_changed', handleSocketSosUpdate);
    } catch (err) {
      console.warn('[Socket Init Error]:', err);
    }
  };

  // Tự động phân giải địa phương mặc định (từ GPS thực tế hoặc địa chỉ trong hồ sơ)
  const resolveAreaAndAuthority = useCallback(async () => {
    setLoadingInfo(true);
    let detectedArea = '';
    let detectedProvince = '';
    let detectedWard = '';
    let lat: number | undefined = undefined;
    let lng: number | undefined = undefined;

    // 1. ƯU TIÊN SỐ 1 TUYỆT ĐỐI: Dựa trên ĐỊA CHỈ của Customer (user.address)
    if (user?.address && user.address.trim()) {
      const fullAddress = user.address.trim();
      detectedArea = fullAddress;

      const parts = fullAddress.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 3) {
        detectedProvince = parts[parts.length - 1]; // Tỉnh / Thành phố
        detectedWard = parts[parts.length - 2];     // Phường / Xã / Thị trấn
      } else if (parts.length === 2) {
        detectedProvince = parts[1];
        detectedWard = parts[0];
      } else {
        detectedProvince = fullAddress;
      }

      // Tự động geocode toạ độ [lat, lng] của địa chỉ Customer
      try {
        const geoList = await Location.geocodeAsync(fullAddress);
        if (geoList && geoList.length > 0) {
          lat = geoList[0].latitude;
          lng = geoList[0].longitude;
          setCurrentCoords({ lat, lng });
        }
      } catch (err) {
        console.log('[Geocode Customer Address Note]:', err);
      }
    } else {
      // 2. CHỈ KHI CUSTOMER CHƯA LƯU ĐỊA CHỈ: Mới fallback lấy toạ độ GPS thiết bị
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
          setCurrentCoords({ lat, lng });

          const geoList = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });

          if (geoList && geoList.length > 0) {
            const geo = geoList[0];
            detectedProvince = geo.region || geo.city || '';
            detectedWard = geo.district || geo.subregion || geo.street || geo.name || '';
            detectedArea = [detectedWard, detectedProvince].filter(Boolean).join(', ');
          }
        }
      } catch (err) {
        console.log('[GPS Detect Note]:', err);
      }
    }

    if (!detectedArea) {
      detectedArea = 'Khu vực của bạn';
    }

    setUserLocationName(detectedArea);
    if (detectedProvince) setProvinceName(detectedProvince);
    if (detectedWard) setWardName(detectedWard);

    // 3. Gọi Backend lấy thông tin Ban chỉ huy / Cán bộ địa phương quản lý đúng địa bàn
    try {
      const res = await backendApi.getLocalAuthority({
        areaName: detectedArea !== 'Khu vực của bạn' ? detectedArea : (user?.address || undefined),
        province: detectedProvince || undefined,
        ward: detectedWard || undefined,
        lat,
        lng,
        userId: user?._id,
      });

      if (res.success && res.data) {
        setLocalInfo(res.data);
        if (res.data.areaName) {
          setUserLocationName(res.data.areaName);
        }
        loadChatHistory(res.data.channel);
        initRealtimeSocket(res.data.channel);
      }
    } catch (err) {
      console.warn('[Get Local Authority Error]:', err);
    } finally {
      setLoadingInfo(false);
    }
  }, [user?._id, user?.address]);

  // Tự động kiểm tra xem người dân có yêu cầu cứu nạn SOS đang hoạt động không & đồng bộ trạng thái thực tế
  const fetchActiveSosRequest = useCallback(async () => {
    try {
      const res = await backendApi.get('/sos');
      if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
        // Đồng bộ danh mục trạng thái thực tế mới nhất của tất cả các ca SOS
        const statusMap: Record<string, string> = {};
        res.data.forEach((item: any) => {
          if (item._id) statusMap[String(item._id)] = item.status;
          if (item.sosCode) statusMap[String(item.sosCode)] = item.status;
        });
        updateSosStatusMap(statusMap);

        // Tìm các ca SOS chưa hoàn thành hoặc chưa hủy
        const activeList = res.data.filter((item: any) =>
          !['COMPLETED', 'RESOLVED', 'CANCELLED', 'REJECTED'].includes(item.status)
        );
        if (activeList.length > 0) {
          activeList.sort(
            (a: any, b: any) =>
              new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          );
          setActiveSos(activeList[0]);
          setShowSosPopup(true);
          return;
        }
      }
      if (!initialSosData) {
        setActiveSos(null);
        setShowSosPopup(false);
      }
    } catch (err) {
      console.warn('[Fetch Active SOS Error]:', err);
    }
  }, [initialSosData, updateSosStatusMap]);

  // Khởi động phân giải khi mở modal
  useEffect(() => {
    if (!visible) {
      setMessages([]);
      setSelectedCustomWard(null);
      setActiveSos(null);
      setShowSosPopup(false);
      return;
    }

    setMessages([]);
    if (!selectedCustomWard) {
      resolveAreaAndAuthority();
    }

    if (initialSosData) {
      setActiveSos(initialSosData);
      setShowSosPopup(true);
    }
    fetchActiveSosRequest();

    // Lắng nghe sự kiện tạo mới, cập nhật hoặc hủy SOS từ thiết bị (ví dụ SOSMapScreen vừa gửi hoặc hủy)
    const subSosSync = DeviceEventEmitter.addListener('sos:sync', (updatedSos) => {
      if (updatedSos && typeof updatedSos === 'object') {
        const id = updatedSos._id || updatedSos.id;
        const code = updatedSos.sosCode;
        const st = updatedSos.status;
        if (id || code) {
          const entry: Record<string, string> = {};
          if (id) entry[String(id)] = st;
          if (code) entry[String(code)] = st;
          updateSosStatusMap(entry);
        }
        if (['COMPLETED', 'RESOLVED', 'CANCELLED', 'REJECTED'].includes(st)) {
          setActiveSos((prev: any) => {
            if (!prev) return null;
            const prevId = String(prev._id || prev.id || '');
            if (prevId === String(id) || (code && prev.sosCode === code)) {
              return null;
            }
            return prev;
          });
          setShowSosPopup(false);
          setSelectedSosDetail((prev: any) => {
            if (!prev) return null;
            if (String(prev.sosId) === String(id) || (code && prev.sosCode === code)) {
              return { ...prev, status: st };
            }
            return prev;
          });
        } else if (st) {
          setActiveSos(updatedSos);
          setShowSosPopup(true);
        }
      }
      fetchActiveSosRequest();
    });

    const subSosDeleted = DeviceEventEmitter.addListener('sos:deleted', () => {
      fetchActiveSosRequest();
    });

    return () => {
      subSosSync.remove();
      subSosDeleted.remove();
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [visible, resolveAreaAndAuthority, initialSosData, fetchActiveSosRequest, updateSosStatusMap]);

  // Xử lý chuyển kênh chat sang một Phường/Xã được người dân tự chọn
  const handleSelectWard = async (wardItem: WardOption | null) => {
    setShowWardPicker(false);
    setSearchWardText('');
    setMessages([]);
    setLoadingInfo(true);

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (!wardItem) {
      // Quay về mặc định GPS / Hồ sơ cá nhân
      setSelectedCustomWard(null);
      await resolveAreaAndAuthority();
      return;
    }

    setSelectedCustomWard(wardItem);
    setUserLocationName(wardItem.fullName);
    setWardName(wardItem.ward);
    setProvinceName(wardItem.province);

    try {
      const res = await backendApi.getLocalAuthority({
        areaName: wardItem.fullName,
        ward: wardItem.ward,
        province: wardItem.province,
        userId: user?._id,
      });

      if (res.success && res.data) {
        setLocalInfo(res.data);
        if (res.data.areaName) {
          setUserLocationName(res.data.areaName);
        }
        loadChatHistory(res.data.channel);
        initRealtimeSocket(res.data.channel);
      }
    } catch (err) {
      console.warn('[Select Custom Ward Error]:', err);
      Alert.alert('Lỗi kết nối', `Không thể kết nối đến cơ quan ${wardItem.ward}. Vui lòng thử lại.`);
    } finally {
      setLoadingInfo(false);
    }
  };

  // Danh sách phường/xã đã lọc theo ô tìm kiếm và tab Khu vực (hỗ trợ tiếng Việt không dấu)
  const filteredWards = POPULAR_WARDS.filter((w) => {
    const matchCategory = selectedCategoryTab === 'Tất cả' || w.category === selectedCategoryTab;
    const rawQ = searchWardText.trim().toLowerCase();
    if (!rawQ) return matchCategory;

    const cleanQ = removeVietnameseTones(rawQ);
    const wardClean = removeVietnameseTones(w.ward);
    const catClean = removeVietnameseTones(w.category);
    const fullClean = removeVietnameseTones(w.fullName);

    const matchSearch =
      w.ward.toLowerCase().includes(rawQ) ||
      w.category.toLowerCase().includes(rawQ) ||
      w.fullName.toLowerCase().includes(rawQ) ||
      wardClean.includes(cleanQ) ||
      catClean.includes(cleanQ) ||
      fullClean.includes(cleanQ);

    return matchCategory && matchSearch;
  });

  // Gửi tin nhắn văn bản
  const handleSendMessage = async (textToSend?: string) => {
    const content = (textToSend || inputText).trim();
    if (!content || !localInfo?.channel) return;

    setInputText('');
    setSending(true);

    // Optimistic UI: hiển thị tin nhắn ngay lập tức
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg: ChatMessageItem = {
      _id: tempId,
      senderId: user?._id || 'me',
      senderName: user?.fullName || 'Tôi',
      senderRole: (user?.roles || []).includes('RESCUER') ? 'RESCUER' : (user?.roles?.[0] || 'CITIZEN'),
      channel: localInfo.channel,
      content,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const res = await backendApi.sendChatMessage({
        content,
        channel: localInfo.channel,
        recipientId: localInfo.authority?.id || undefined,
      });

      if (res.success && res.data) {
        const confirmedMsg = res.data;
        setMessages((prev) => {
          const alreadyHasConfirmed = prev.some((m) => m._id === confirmedMsg._id);
          if (alreadyHasConfirmed) {
            return prev.filter((m) => m._id !== tempId);
          }
          return prev.map((m) => (m._id === tempId ? confirmedMsg : m));
        });
      }
    } catch (err: any) {
      Alert.alert('Không thể gửi', err.message || 'Lỗi gửi tin nhắn đến địa phương.');
    } finally {
      setSending(false);
    }
  };

  // Gửi trực tiếp yêu cầu cứu nạn SOS của người dân vào cuộc trò chuyện với địa phương
  const handleSendSosRequest = async (sosItem: any) => {
    if (!sosItem || sendingSos || !localInfo?.channel) return;

    setSendingSos(true);
    try {
      const typeLabel =
        SOS_TYPE_LABELS[sosItem.emergencyType] ||
        (Array.isArray(sosItem.emergencyTypes) && sosItem.emergencyTypes.length > 0
          ? sosItem.emergencyTypes.map((t: string) => SOS_TYPE_LABELS[t] || t).join(', ')
          : sosItem.emergencyType || 'Cứu hộ khẩn cấp');

      const coords = sosItem.location?.coordinates;
      const lng = coords?.[0];
      const lat = coords?.[1];
      const coordsText =
        typeof lat === 'number' && typeof lng === 'number'
          ? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
          : '';

      const contentLines = [
        `🆘 [YÊU CẦU CỨU NẠN KHẨN CẤP]`,
        `• Mã cứu trợ: ${sosItem.sosCode || 'SOS-' + (sosItem._id || '').slice(-6).toUpperCase()}`,
        `• Loại yêu cầu: ${typeLabel}`,
        `• Số người gặp nạn: ${sosItem.people || 1} người`,
        `• Địa chỉ: ${sosItem.address || userLocationName || 'Vị trí hiện tại'}`,
        coordsText ? `• Tọa độ GPS: ${coordsText}` : '',
        sosItem.contactPhone ? `• Số điện thoại: ${sosItem.contactPhone}` : '',
        sosItem.description ? `• Tình trạng: ${sosItem.description}` : '',
        `• Trạng thái hiện tại: ${SOS_STATUS_CONFIG[sosItem.status]?.label || sosItem.status || 'Chờ tiếp nhận'}`,
      ].filter(Boolean);

      const content = contentLines.join('\n');

      const attachments =
        Array.isArray(sosItem.images) && sosItem.images.length > 0
          ? sosItem.images.map((url: string, idx: number) => ({
              url,
              fileType: 'IMAGE',
              fileName: `sos_img_${idx + 1}.jpg`,
            }))
          : undefined;

      const tempId = `temp_sos_${Date.now()}`;
      const optimisticMsg: ChatMessageItem = {
        _id: tempId,
        senderId: user?._id || 'me',
        senderName: user?.fullName || 'Tôi',
        senderRole: (user?.roles || []).includes('RESCUER') ? 'RESCUER' : (user?.roles?.[0] || 'CITIZEN'),
        channel: localInfo.channel,
        content,
        attachments,
        sosRequestId: sosItem._id,
        sosData: sosItem,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

      const res = await backendApi.sendChatMessage({
        content,
        channel: localInfo.channel,
        recipientId: localInfo.authority?.id || undefined,
        attachments,
        sosRequestId: sosItem._id,
        sosData: sosItem,
      } as any);

      if (res.success && res.data) {
        const confirmedMsg = res.data;
        setMessages((prev) => {
          const already = prev.some((m) => m._id === confirmedMsg._id);
          if (already) {
            return prev.filter((m) => m._id !== tempId);
          }
          return prev.map((m) => (m._id === tempId ? confirmedMsg : m));
        });
      }

      setShowSosPopup(false);
      Alert.alert(
        'Đã gửi yêu cầu SOS',
        `Thông tin yêu cầu cứu nạn [${sosItem.sosCode || 'SOS'}] đã được gửi trực tiếp đến cán bộ trực ban địa phương.`
      );
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể gửi yêu cầu SOS vào cuộc trò chuyện.');
    } finally {
      setSendingSos(false);
    }
  };

  // Gửi nhanh tọa độ GPS thực tế
  const handleSendLocation = async () => {
    if (sendingGps) return;
    setSendingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Quyền vị trí',
          'Vui lòng cấp quyền vị trí trong cài đặt thiết bị để gửi tọa độ cứu nạn cho cán bộ địa phương.'
        );
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      setCurrentCoords({ lat, lng });

      const locationText = `📍 [Tọa độ GPS khẩn cấp]: ${lat.toFixed(6)}, ${lng.toFixed(6)}\n(Vị trí gần: ${userLocationName})`;
      await handleSendMessage(locationText);
    } catch {
      Alert.alert('Lỗi định vị', 'Không thể lấy tọa độ GPS thực tế vào lúc này.');
    } finally {
      setSendingGps(false);
    }
  };

  // Chọn ảnh từ máy và gửi lên Cloudinary
  const handlePickImage = async () => {
    if (uploadingImage || !localInfo?.channel) return;

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          'Quyền truy cập ảnh',
          'Vui lòng cấp quyền truy cập thư viện ảnh để gửi hình ảnh hiện trường cứu hộ.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      if (!asset.base64 && !asset.uri) {
        Alert.alert('Lỗi', 'Không thể đọc dữ liệu ảnh đã chọn.');
        return;
      }

      setUploadingImage(true);

      // Gửi chuỗi base64 lên backend -> backend upload trực tiếp sang Cloudinary
      const base64Data = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
      const uploadRes = await backendApi.uploadFile(base64Data, asset.fileName || `chat_${Date.now()}.jpg`);

      const uploadedUrl = (uploadRes as any)?.data?.url || (uploadRes as any)?.url || (uploadRes as any)?.data?.data?.url;
      if (!uploadedUrl) {
        throw new Error(uploadRes.message || 'Không nhận được đường dẫn ảnh từ máy chủ');
      }

      const caption = inputText.trim();
      setInputText('');

      // Optimistic UI: hiển thị ảnh ngay lập tức
      const tempId = `temp_img_${Date.now()}`;
      const optimisticMsg: ChatMessageItem = {
        _id: tempId,
        senderId: user?._id || 'me',
        senderName: user?.fullName || 'Tôi',
        senderRole: (user?.roles || []).includes('RESCUER') ? 'RESCUER' : (user?.roles?.[0] || 'CITIZEN'),
        channel: localInfo.channel,
        content: caption || '[Hình ảnh]',
        attachments: [{ url: uploadedUrl, fileType: 'IMAGE', fileName: asset.fileName || 'photo.jpg' }],
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

      const sendRes = await backendApi.sendChatMessage({
        content: caption || '[Hình ảnh]',
        channel: localInfo.channel,
        recipientId: localInfo.authority?.id || undefined,
        attachments: [{ url: uploadedUrl, fileType: 'IMAGE', fileName: asset.fileName || 'photo.jpg' }],
      });

      if (sendRes.success && sendRes.data) {
        const confirmedMsg = sendRes.data;
        setMessages((prev) => {
          const alreadyHasConfirmed = prev.some((m) => m._id === confirmedMsg._id);
          if (alreadyHasConfirmed) {
            return prev.filter((m) => m._id !== tempId);
          }
          return prev.map((m) => (m._id === tempId ? confirmedMsg : m));
        });
      }
    } catch (err: any) {
      Alert.alert('Không thể gửi ảnh', err.message || 'Lỗi tải ảnh lên Cloudinary.');
    } finally {
      setUploadingImage(false);
    }
  };

  // Xử lý gọi điện trực tiếp tới chính quyền / cán bộ địa phương: Mở trực tiếp màn hình quay số điện thoại
  const handleCallHotline = () => {
    const hotline = localInfo?.authority?.phone;
    if (!hotline) {
      Alert.alert('Chưa có số điện thoại', 'Hệ thống chưa tìm thấy số liên lạc của chính quyền địa phương này.');
      return;
    }
    const clean = hotline.replace(/[^0-9+]/g, '');
    if (clean) {
      Linking.openURL(`tel:${clean}`).catch(() => {
        Alert.alert('Lỗi', `Không thể mở ứng dụng quay số với số điện thoại: ${hotline}`);
      });
    }
  };

  // Menu tùy chọn ba chấm
  const handleOpenMenu = () => {
    const hotline = localInfo?.authority?.phone;
    Alert.alert(
      headerDepartmentTitle,
      `Địa bàn: ${userLocationName}\nĐơn vị: ${localInfo?.authority?.department || 'Trực ban PCTT'}${hotline ? `\nHotline: ${hotline}` : ''}`,
      [
        ...(hotline
          ? [
              {
                text: `Gọi trực ban (${hotline})`,
                onPress: handleCallHotline,
              },
            ]
          : []),
        {
          text: 'Đổi Phường / Xã khác',
          onPress: () => setShowWardPicker(true),
        },
        ...(selectedCustomWard
          ? [
              {
                text: 'Về địa chỉ GPS / hồ sơ mặc định',
                onPress: () => handleSelectWard(null),
              },
            ]
          : []),
        {
          text: 'Tải lại tin nhắn',
          onPress: () => {
            if (localInfo?.channel) loadChatHistory(localInfo.channel);
          },
        },
        { text: 'Đóng', style: 'cancel' },
      ]
    );
  };

  // Format thời gian hiển thị (e.g. 12:30)
  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const hours = d.getHours().toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch {
      return '';
    }
  };

  // Kiểm tra tin nhắn có phải tọa độ GPS hay không
  const isGpsMessage = (text: string) => {
    return text.includes('[Tọa độ GPS khẩn cấp]') || text.includes('📍 [Tọa độ GPS');
  };

  // Tách tọa độ GPS từ nội dung tin nhắn
  const extractCoords = (text: string) => {
    const match = text.match(/([0-9]+\.[0-9]+),\s*([0-9]+\.[0-9]+)/);
    if (match) {
      return {
        lat: parseFloat(match[1]),
        lng: parseFloat(match[2]),
      };
    }
    return null;
  };

  // Render thẻ định vị GPS khẩn cấp
  const renderGpsCard = (content: string, isMe: boolean) => {
    const coords = extractCoords(content);
    const cleanNear = content
      .replace(/📍\s*\[Tọa độ GPS khẩn cấp\]:[^\n]*\n?/i, '')
      .replace(/[()]/g, '')
      .replace(/^Vị trí gần:\s*/i, '')
      .trim();

    return (
      <View style={[styles.gpsCard, isMe ? styles.gpsCardMe : styles.gpsCardOther]}>
        <View style={styles.gpsHeader}>
          <View style={styles.gpsIconCircle}>
            <Ionicons name="location-sharp" size={18} color="#EF4444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.gpsBadgeText, isMe ? styles.gpsTextWhite : styles.gpsTextDark]}>
              TỌA ĐỘ CỨU HỘ KHẨN CẤP
            </Text>
            <Text style={[styles.gpsCoordsText, isMe ? styles.gpsSubWhite : styles.gpsSubDark]}>
              {coords ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}` : 'Đã xác định vị trí vệ tinh'}
            </Text>
          </View>
        </View>

        {cleanNear ? (
          <View style={styles.gpsNearBox}>
            <Feather name="map-pin" size={13} color={isMe ? '#E0F2FE' : '#64748B'} />
            <Text style={[styles.gpsNearText, isMe ? styles.gpsTextWhite : styles.gpsTextDark]} numberOfLines={2}>
              {cleanNear}
            </Text>
          </View>
        ) : null}

        {coords && (
          <TouchableOpacity
            style={[styles.gpsActionBtn, isMe ? styles.gpsActionBtnMe : styles.gpsActionBtnOther]}
            onPress={() => {
              const mapUrl = Platform.select({
                ios: `maps:0,0?q=${coords.lat},${coords.lng}`,
                android: `geo:0,0?q=${coords.lat},${coords.lng}`,
                default: `https://maps.google.com/?q=${coords.lat},${coords.lng}`,
              });
              Linking.openURL(mapUrl!).catch(() => {});
            }}
            activeOpacity={0.8}
          >
            <Feather name="external-link" size={13} color={isMe ? '#FFFFFF' : '#0066FF'} />
            <Text style={[styles.gpsActionBtnText, isMe ? styles.gpsTextWhite : styles.gpsActionBtnTextOther]}>
              Xem vị trí trên bản đồ
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Kiểm tra tin nhắn có phải thẻ SOS hay không
  const isSosMessage = (item: ChatMessageItem) => {
    return (
      Boolean(item.sosRequestId) ||
      Boolean(item.sosData) ||
      (typeof item.content === 'string' &&
        (item.content.includes('[YÊU CẦU CỨU NẠN KHẨN CẤP]') ||
          item.content.includes('🆘 [YÊU CẦU CỨU NẠN') ||
          item.content.includes('Mã cứu trợ: SOS-')))
    );
  };

  // Trích xuất dữ liệu chi tiết của yêu cầu SOS từ tin nhắn
  const parseSosMessageData = (item: ChatMessageItem) => {
    let baseData: any = null;
    if (item.sosData && typeof item.sosData === 'object') {
      const s = item.sosData;
      const typeLabel =
        SOS_TYPE_LABELS[s.emergencyType] ||
        (Array.isArray(s.emergencyTypes) && s.emergencyTypes.length > 0
          ? s.emergencyTypes.map((t: string) => SOS_TYPE_LABELS[t] || t).join(', ')
          : s.emergencyType || 'Cứu hộ khẩn cấp');
      const coords = s.location?.coordinates;
      baseData = {
        sosId: s._id || item.sosRequestId,
        sosCode: s.sosCode || 'SOS',
        typeLabel,
        people: s.people || 1,
        address: s.address || '',
        phone: s.contactPhone || '',
        description: s.description || '',
        status: s.status || 'PENDING',
        lat: typeof coords?.[1] === 'number' ? coords[1] : undefined,
        lng: typeof coords?.[0] === 'number' ? coords[0] : undefined,
        images: Array.isArray(s.images)
          ? s.images
          : Array.isArray(item.attachments)
          ? item.attachments.map((a) => a.url).filter(Boolean)
          : [],
      };
    } else {
      const content = item.content || '';
      const codeMatch = content.match(/Mã cứu trợ:\s*(SOS-[A-Z0-9\-]+)/i);
      const typeMatch = content.match(/Loại yêu cầu:\s*([^\n]+)/i);
      const peopleMatch = content.match(/Số người gặp nạn:\s*([0-9]+)/i);
      const addrMatch = content.match(/Địa chỉ:\s*([^\n]+)/i);
      const gpsMatch = content.match(/Tọa độ GPS:\s*([0-9]+\.[0-9]+),\s*([0-9]+\.[0-9]+)/i);
      const phoneMatch = content.match(/Số điện thoại:\s*([0-9\+\s]+)/i);
      const descMatch = content.match(/Tình trạng:\s*([^\n]+)/i);
      const statusMatch = content.match(/Trạng thái hiện tại:\s*([^\n]+)/i);

      baseData = {
        sosId: item.sosRequestId || undefined,
        sosCode: codeMatch ? codeMatch[1].trim() : 'SOS',
        typeLabel: typeMatch ? typeMatch[1].trim() : 'Cứu hộ khẩn cấp',
        people: peopleMatch ? parseInt(peopleMatch[1], 10) : 1,
        address: addrMatch ? addrMatch[1].trim() : '',
        phone: phoneMatch ? phoneMatch[1].trim() : '',
        description: descMatch ? descMatch[1].trim() : '',
        status: statusMatch ? statusMatch[1].trim() : 'PENDING',
        lat: gpsMatch ? parseFloat(gpsMatch[1]) : undefined,
        lng: gpsMatch ? parseFloat(gpsMatch[2]) : undefined,
        images: Array.isArray(item.attachments) ? item.attachments.map((a) => a.url).filter(Boolean) : [],
      };
    }

    // Ghi đè trạng thái thực tế mới nhất từ sosStatusMap nếu có
    const liveStatus =
      (baseData.sosId
        ? sosStatusMapRef.current[String(baseData.sosId)] || sosStatusMap[String(baseData.sosId)]
        : null) ||
      (baseData.sosCode
        ? sosStatusMapRef.current[String(baseData.sosCode)] || sosStatusMap[String(baseData.sosCode)]
        : null);
    if (liveStatus) {
      baseData.status = liveStatus;
    }

    return baseData;
  };

  // Mở modal chi tiết yêu cầu SOS và đồng bộ ngay trạng thái mới nhất từ backend
  const handlePressSosCard = async (sos: any) => {
    setSelectedSosDetail(sos);
    if (sos.sosId) {
      try {
        const res = await backendApi.get(`/sos/${sos.sosId}`);
        if (res && res.success && res.data?.status) {
          const liveStatus = res.data.status;
          updateSosStatusMap({
            [String(sos.sosId)]: liveStatus,
            ...(res.data.sosCode ? { [String(res.data.sosCode)]: liveStatus } : {}),
          });
          setSelectedSosDetail((prev: any) =>
            prev && String(prev.sosId) === String(sos.sosId)
              ? { ...prev, status: liveStatus }
              : prev
          );
        }
      } catch {
        // Fallback giữ nguyên dữ liệu đã parse
      }
    }
  };


  // Lấy tên cán bộ hiển thị bên trên tin nhắn của cán bộ địa phương (ưu tiên tên cụ thể như Lê Trọng Phúc)
  const getOfficerDisplayName = (msg: ChatMessageItem) => {
    // 1. Tên cán bộ từ senderId populated (ví dụ: Lê Trọng Phúc)
    if (typeof msg.senderId === 'object' && msg.senderId?.fullName) {
      const fn = msg.senderId.fullName.trim();
      if (!fn.toLowerCase().includes('ban chỉ huy') && fn.toLowerCase() !== 'admin') {
        return fn;
      }
    }

    // 2. Tên cán bộ từ senderName trong tin nhắn (nếu không phải chuỗi 'Ban Chỉ Huy...')
    if (msg.senderName && typeof msg.senderName === 'string') {
      const sn = msg.senderName.trim();
      if (!sn.toLowerCase().includes('ban chỉ huy') && sn.toLowerCase() !== 'admin') {
        return sn;
      }
    }

    // 3. Tên cán bộ trực ban phụ trách địa bàn (hình 3: localInfo.authority.name = "Lê Trọng Phúc")
    if (localInfo?.authority?.name && !localInfo.authority.name.toLowerCase().includes('ban chỉ huy')) {
      return localInfo.authority.name;
    }

    return 'Cán bộ trực ban';
  };

  // Render thẻ hiển thị yêu cầu cứu hộ SOS (PHIÊN BẢN 1 - 2 DÒNG SIÊU GỌN TRONG CHAT, BẤM VÀO ĐỂ XEM CHI TIẾT)
  const renderSosCard = (item: ChatMessageItem, isMe: boolean) => {
    const sos = parseSosMessageData(item);
    const isCancelled = sos.status === 'CANCELLED';
    const isRejected = sos.status === 'REJECTED';
    const isClosed = isCancelled || isRejected;
    const statusCfg = SOS_STATUS_CONFIG[sos.status] || SOS_STATUS_CONFIG['PENDING'];

    return (
      <TouchableOpacity
        style={[
          styles.sosCardCompact,
          isMe ? styles.sosCardCompactMe : styles.sosCardCompactOther,
          isCancelled && styles.sosCardCompactCancelled,
        ]}
        onPress={() => handlePressSosCard(sos)}
        activeOpacity={0.82}
      >
        {/* Dòng 1: Mã SOS & Loại khẩn cấp (trái) + Badge trạng thái (phải) */}
        <View style={styles.sosCompactTopRow}>
          <View style={styles.sosCompactBadge}>
            <Ionicons
              name={isCancelled ? 'close-circle' : 'warning'}
              size={13}
              color={isCancelled ? '#DC2626' : '#EF4444'}
            />
            <Text
              style={[styles.sosCompactCodeText, isCancelled && styles.sosCompactCodeTextCancelled]}
            >
              {sos.sosCode}
            </Text>
            <Text style={styles.sosCompactTypeText} numberOfLines={1}>
              {sos.typeLabel}
            </Text>
          </View>
          <View style={[styles.sosCompactStatusPill, { backgroundColor: statusCfg.bgColor }]}>
            <Text
              style={[styles.sosCompactStatusText, { color: statusCfg.color }]}
              numberOfLines={1}
            >
              {statusCfg.label}
            </Text>
          </View>
        </View>

        {/* Dòng 2: Địa chỉ & Số người (trái) + Gợi ý xem chi tiết (phải) */}
        <View style={styles.sosCompactSecondRow}>
          <View style={styles.sosCompactAddrWrap}>
            <Feather name="map-pin" size={11} color="#64748B" style={{ marginRight: 3 }} />
            <Text style={styles.sosCompactAddrText} numberOfLines={1}>
              {sos.address ? `${sos.address} • ` : ''}{sos.people} người
            </Text>
          </View>
          <View style={styles.sosCompactTapHint}>
            <Text
              style={[
                styles.sosCompactTapHintText,
                isClosed && { color: '#DC2626' },
              ]}
            >
              {isCancelled ? 'Đã hủy' : 'Chi tiết'}
            </Text>
            <Feather
              name="chevron-right"
              size={11}
              color={isClosed ? '#DC2626' : '#0066FF'}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Render từng bóng tin nhắn
  const renderMessageItem = ({ item }: { item: ChatMessageItem }) => {
    const senderIdStr =
      typeof item.senderId === 'object' && item.senderId !== null
        ? (item.senderId as any)._id
        : item.senderId;
    const myIdStr = user?._id;

    // Kiểm tra tin nhắn của chính người dân
    const isMe =
      (myIdStr && senderIdStr && String(senderIdStr) === String(myIdStr)) ||
      item.senderRole === 'CITIZEN' ||
      item.senderName === (user?.fullName || 'Tôi');

    const timeStr = formatTime(item.createdAt);
    const hasGps = isGpsMessage(item.content);

    // Kiểm tra tệp đính kèm hình ảnh
    const hasAttachments = Array.isArray(item.attachments) && item.attachments.length > 0;
    const imageAttachments = hasAttachments
      ? item.attachments!.filter(
          (att) =>
            att.url &&
            (!att.fileType ||
              att.fileType.toUpperCase().includes('IMAGE') ||
              /\.(jpg|jpeg|png|webp|gif)/i.test(att.url))
        )
      : [];
    const showText = item.content && item.content.trim() !== '[Hình ảnh]';

    return (
      <View
        style={[
          styles.messageRow,
          isMe ? styles.messageRowMe : styles.messageRowOther,
        ]}
      >
        {/* Avatar bên trái cho tin nhắn Cán bộ địa phương */}
        {!isMe && (
          <View style={styles.authorityAvatarWrap}>
            <FontAwesome5 name="landmark" size={13} color="#0066FF" />
          </View>
        )}

        <View style={[styles.bubbleCol, isMe ? styles.bubbleColMe : styles.bubbleColOther]}>
          {/* Tên cán bộ phản hồi */}
          {!isMe && (
            <Text style={styles.officerNameText}>
              {getOfficerDisplayName(item)}
            </Text>
          )}

          {hasGps ? (
            renderGpsCard(item.content, isMe)
          ) : isSosMessage(item) ? (
            renderSosCard(item, isMe)
          ) : (
            <View
              style={[
                styles.messageBubble,
                isMe ? styles.messageBubbleMe : styles.messageBubbleOther,
                imageAttachments.length > 0 && styles.messageBubbleWithImage,
              ]}
            >
              {/* Hiển thị danh sách ảnh nếu có */}
              {imageAttachments.map((img, imgIdx) => (
                <TouchableOpacity
                  key={`img_${imgIdx}`}
                  activeOpacity={0.88}
                  onPress={() => setPreviewImageUrl(img.url)}
                  style={styles.chatImageWrap}
                >
                  <Image
                    source={{ uri: img.url }}
                    style={styles.chatImage}
                    resizeMode="cover"
                  />
                  <View style={styles.chatImageOverlayIcon}>
                    <Feather name="maximize-2" size={13} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
              ))}

              {/* Nội dung văn bản kèm theo */}
              {showText && (
                <Text
                  style={[
                    styles.messageText,
                    isMe ? styles.messageTextMe : styles.messageTextOther,
                    imageAttachments.length > 0 && { marginTop: 6 },
                  ]}
                >
                  {item.content}
                </Text>
              )}
            </View>
          )}

          {/* Dòng thời gian & trạng thái gửi */}
          <View
            style={[
              styles.metaRow,
              isMe ? styles.metaRowMe : styles.metaRowOther,
            ]}
          >
            <Text style={styles.metaTimeText}>{timeStr}</Text>
            {isMe && (
              <Ionicons
                name="checkmark-done"
                size={14}
                color="#0066FF"
                style={{ marginLeft: 3 }}
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  // Tên hiển thị chuẩn xác theo địa bàn thực tế (GPS hoặc địa chỉ hồ sơ)
  const displayArea = localInfo?.areaName || userLocationName || 'Địa phương';
  const cleanDisplayArea = displayArea.replace(/^(phường|xã|thị trấn|p\.|x\.|tt\.)\s+/i, '').trim();

  const isCommuneOrWard =
    displayArea.toLowerCase().includes('phường') ||
    displayArea.toLowerCase().includes('xã') ||
    displayArea.toLowerCase().includes('thị trấn');

  const headerDepartmentTitle =
    localInfo?.authority?.department ||
    (isCommuneOrWard ? `UBND ${displayArea}` : `Ban Chỉ Huy PCTT ${cleanDisplayArea}`);

  const headerSubtitleText = localInfo?.authority?.name
    ? `${localInfo.authority.name} · Trực ban 24/7`
    : `${displayArea} · Trực tuyến 24/7`;

  // Tính toán Top Inset an toàn cho tai thỏ iPhone / Dynamic Island
  const topSafeInset = Math.max(
    insets.top,
    Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight || 24)
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

        {/* ========================================================
            1. HEADER CỐ ĐỊNH CHỐNG CHE TAI THỎ / DYNAMIC ISLAND
           ======================================================== */}
        <View style={[styles.header, { paddingTop: topSafeInset + 6 }]}>
          <TouchableOpacity
            style={styles.headerBackBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </TouchableOpacity>

          {/* Avatar địa phương với icon tòa nhà và chấm trạng thái online */}
          <View style={styles.headerAvatarBox}>
            <FontAwesome5 name="landmark" size={17} color="#0066FF" />
            <View
              style={[
                styles.headerStatusDot,
                { backgroundColor: isConnected ? '#16A34A' : '#94A3B8' },
              ]}
            />
          </View>

          {/* Tiêu đề & phụ đề địa phương (nhấn để đổi phường/xã) */}
          <TouchableOpacity
            style={styles.headerTextWrap}
            onPress={() => setShowWardPicker(true)}
            activeOpacity={0.7}
          >
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {headerDepartmentTitle}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#64748B" style={{ marginLeft: 3 }} />
            </View>
            <View style={styles.headerSubRow}>
              <View
                style={[
                  styles.subDot,
                  { backgroundColor: isConnected ? '#16A34A' : '#94A3B8' },
                ]}
              />
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {isConnected ? headerSubtitleText : 'Đang kết nối lại...'}
              </Text>
              <Text style={styles.headerChangeBadge}>Đổi</Text>
            </View>
          </TouchableOpacity>

          {/* Nút chọn phường / xã */}
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => setShowWardPicker(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
            accessibilityLabel="Đổi Phường / Xã"
          >
            <Ionicons name="map-outline" size={18} color="#0066FF" />
          </TouchableOpacity>

          {/* Nút gọi điện khẩn cấp đến chính quyền địa phương */}
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={handleCallHotline}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
            accessibilityLabel="Gọi trực ban cứu nạn địa phương"
          >
            <Feather name="phone-call" size={18} color="#16A34A" />
          </TouchableOpacity>

          {/* Nút ba chấm */}
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={handleOpenMenu}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#0F172A" />
          </TouchableOpacity>
        </View>

        {/* ========================================================
            2. KHU VỰC DANH SÁCH TIN NHẮN & THẺ GIỚI THIỆU
           ======================================================== */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {loadingInfo || loadingMessages ? (
            <View style={styles.centerLoadingWrap}>
              <ActivityIndicator size="small" color="#0066FF" />
              <Text style={styles.centerLoadingText}>
                Đang kết nối tới chính quyền địa phương...
              </Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item, index) => `${item._id || 'msg'}_${index}`}
              renderItem={renderMessageItem}
              contentContainerStyle={[styles.flatListContent, { paddingBottom: 24 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <View style={styles.introCardContainer}>
                  {/* Thẻ giới thiệu cuộc trò chuyện */}
                  <View style={styles.introCard}>
                    <View style={styles.introIconCircle}>
                      <MaterialCommunityIcons
                        name="shield-check"
                        size={24}
                        color="#0066FF"
                      />
                    </View>

                    <Text style={styles.introCardTitle}>
                      Kênh kết nối cứu hộ{'\n'}
                      {displayArea}
                    </Text>

                    <Text style={styles.introCardDesc}>
                      Kết nối trực tiếp với cán bộ phụ trách cứu hộ & phòng chống thiên tai cơ sở. Gửi ngay vị trí hoặc tin nhắn nếu cần hỗ trợ khẩn cấp.
                    </Text>

                    {/* Nút chuyển đổi phường / xã nhanh */}
                    <TouchableOpacity
                      style={styles.introWardBadgeBtn}
                      onPress={() => setShowWardPicker(true)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="location-outline" size={15} color="#0066FF" />
                      <Text style={styles.introWardBadgeText} numberOfLines={1}>
                        {selectedCustomWard ? `Đang kết nối: ${selectedCustomWard.ward}` : `Khu vực: ${displayArea}`}
                      </Text>
                      <View style={styles.introWardChangeTag}>
                        <Text style={styles.introWardChangeLink}>Đổi phường</Text>
                        <Ionicons name="chevron-forward" size={12} color="#0066FF" />
                      </View>
                    </TouchableOpacity>

                    {/* Nút gửi tọa độ GPS */}
                    <TouchableOpacity
                      style={styles.sendGpsButton}
                      onPress={handleSendLocation}
                      disabled={sendingGps}
                      activeOpacity={0.8}
                    >
                      {sendingGps ? (
                        <ActivityIndicator size="small" color="#0066FF" style={{ marginRight: 8 }} />
                      ) : (
                        <Feather
                          name="navigation"
                          size={15}
                          color="#0066FF"
                          style={{ marginRight: 8 }}
                        />
                      )}
                      <Text style={styles.sendGpsButtonText}>
                        {sendingGps ? 'Đang lấy tọa độ GPS...' : 'Gửi tọa độ GPS của bạn'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Thanh phân cách thời gian tự nhiên */}
                  <View style={styles.timeDividerWrap}>
                    <View style={styles.timeDividerLine} />
                    <Text style={styles.timeSeparatorText}>
                      {messages.length > 0 && messages[0]?.createdAt
                        ? `Bắt đầu phiên trực ${formatTime(messages[0].createdAt)}`
                        : 'Phiên cứu trợ trực tuyến hôm nay'}
                    </Text>
                    <View style={styles.timeDividerLine} />
                  </View>
                </View>
              }
              onContentSizeChange={() =>
                flatListRef.current?.scrollToEnd({ animated: true })
              }
            />
          )}

          {/* ========================================================
              POPUP NHỎ GỬI THẲNG YÊU CẦU SOS ĐANG TẠO / HOẠT ĐỘNG
             ======================================================== */}
          {showSosPopup && activeSos && (
            <View style={styles.sosPopupWrapper}>
              <View style={styles.sosPopupCard}>
                <View style={styles.sosPopupHeader}>
                  <View style={styles.sosPopupBadge}>
                    <View style={styles.sosPulseDot} />
                    <Ionicons name="alert-circle" size={15} color="#DC2626" />
                    <Text style={styles.sosPopupBadgeText}>
                      BẠN ĐANG CÓ YÊU CẦU CỨU NẠN KHẨN CẤP
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.sosPopupCloseBtn}
                    onPress={() => setShowSosPopup(false)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={16} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <View style={styles.sosPopupBody}>
                  <View style={styles.sosPopupInfoLeft}>
                    <View style={styles.sosPopupCodeLine}>
                      <Text style={styles.sosPopupCodeBadge}>
                        {activeSos.sosCode || 'SOS'}
                      </Text>
                      <Text style={styles.sosPopupTypeLabel} numberOfLines={1}>
                        {SOS_TYPE_LABELS[activeSos.emergencyType] || activeSos.emergencyType || 'Cứu hộ khẩn cấp'}
                      </Text>
                    </View>
                    <Text style={styles.sosPopupAddress} numberOfLines={1}>
                      📍 {activeSos.address || 'Vị trí hiện tại'} &bull; {activeSos.people || 1} người
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.sosPopupSendActionBtn}
                    onPress={() => handleSendSosRequest(activeSos)}
                    disabled={sendingSos}
                    activeOpacity={0.8}
                  >
                    {sendingSos ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="paper-plane" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text style={styles.sosPopupSendActionText}>Gửi cho địa phương</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* ========================================================
              3. THANH NHẬP TIN NHẮN AN TOÀN TRÊN IPHONE (SAFE BOTTOM)
             ======================================================== */}
          <View
            style={[
              styles.composerBar,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            {/* Nút bật/mở popup gửi SOS nếu người dân đang có ca SOS hoạt động */}
            {activeSos && (
              <TouchableOpacity
                style={[
                  styles.attachBtn,
                  styles.attachBtnSos,
                  showSosPopup && styles.attachBtnSosActive,
                ]}
                onPress={() => setShowSosPopup(!showSosPopup)}
                disabled={sendingSos}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Đính kèm yêu cầu SOS"
              >
                <MaterialCommunityIcons
                  name="shield-alert"
                  size={20}
                  color={showSosPopup ? '#DC2626' : '#EF4444'}
                />
              </TouchableOpacity>
            )}

            {/* Nút gửi nhanh tọa độ GPS */}
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={handleSendLocation}
              disabled={sendingGps || uploadingImage}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {sendingGps ? (
                <ActivityIndicator size="small" color="#0066FF" />
              ) : (
                <Ionicons name="location" size={21} color="#0066FF" />
              )}
            </TouchableOpacity>

            {/* Nút gửi ảnh chụp / ảnh thư viện */}
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={handlePickImage}
              disabled={sendingGps || uploadingImage}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {uploadingImage ? (
                <ActivityIndicator size="small" color="#0066FF" />
              ) : (
                <Ionicons name="images-outline" size={21} color="#0066FF" />
              )}
            </TouchableOpacity>

            {/* Ô nhập tin nhắn */}
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.textInput}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Nhập tin nhắn cứu trợ..."
                placeholderTextColor="#94A3B8"
                multiline
                maxLength={500}
              />
            </View>

            {/* Nút gửi tin nhắn tròn */}
            <TouchableOpacity
              style={[
                styles.sendRoundBtn,
                (!inputText.trim() || sending) && styles.sendRoundBtnDisabled,
              ]}
              onPress={() => handleSendMessage()}
              disabled={!inputText.trim() || sending}
              activeOpacity={0.85}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons
                  name="send"
                  size={17}
                  color="#FFFFFF"
                  style={{ marginLeft: 2 }}
                />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

        {/* Modal phóng to ảnh trong chat */}
        <Modal
          visible={!!previewImageUrl}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setPreviewImageUrl(null)}
        >
          <View style={styles.lightboxContainer}>
            <StatusBar barStyle="light-content" backgroundColor="#000000" />
            <TouchableOpacity
              style={[styles.lightboxCloseBtn, { top: insets.top + 10 }]}
              onPress={() => setPreviewImageUrl(null)}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={26} color="#FFFFFF" />
            </TouchableOpacity>
            {previewImageUrl && (
              <Image
                source={{ uri: previewImageUrl }}
                style={styles.lightboxImage}
                resizeMode="contain"
              />
            )}
          </View>
        </Modal>

        {/* Modal Chi Tiết Ca SOS Khẩn Cấp (Hiện ra khi ấn vào thẻ SOS ngắn gọn) */}
        <Modal
          visible={Boolean(selectedSosDetail)}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedSosDetail(null)}
        >
          <TouchableOpacity
            style={styles.sosDetailModalBackdrop}
            activeOpacity={1}
            onPress={() => setSelectedSosDetail(null)}
          >
            <TouchableOpacity
              style={styles.sosDetailModalCard}
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              {selectedSosDetail && (
                <>
                  {/* Header chi tiết */}
                  <View style={styles.sosDetailModalHeader}>
                    <View style={styles.sosCardHeaderBadge}>
                      <Ionicons name="warning" size={16} color="#EF4444" />
                      <Text style={styles.sosCardHeaderTitle}>YÊU CẦU CỨU NẠN KHẨN CẤP</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.sosDetailModalCloseBtn}
                      onPress={() => setSelectedSosDetail(null)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close" size={20} color="#64748B" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.sosDetailModalBody} showsVerticalScrollIndicator={false}>
                    {/* Trạng thái & Mã */}
                    <View style={styles.sosCardCodeRow}>
                      <Text style={styles.sosCardCodeText}>{selectedSosDetail.sosCode}</Text>
                      <View
                        style={[
                          styles.sosCardStatusPill,
                          {
                            backgroundColor:
                              (SOS_STATUS_CONFIG[selectedSosDetail.status] || SOS_STATUS_CONFIG['PENDING']).bgColor,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.sosCardStatusText,
                            {
                              color:
                                (SOS_STATUS_CONFIG[selectedSosDetail.status] || SOS_STATUS_CONFIG['PENDING']).color,
                            },
                          ]}
                        >
                          {(SOS_STATUS_CONFIG[selectedSosDetail.status] || SOS_STATUS_CONFIG['PENDING']).label}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.sosCardTypeTag, { alignSelf: 'flex-start', marginTop: 4, marginBottom: 12 }]}>
                      {selectedSosDetail.typeLabel}
                    </Text>

                    {/* Chi tiết người gặp nạn & địa chỉ */}
                    <View style={styles.sosCardDetailsBox}>
                      <View style={styles.sosCardDetailItem}>
                        <Feather name="users" size={14} color="#64748B" style={styles.sosDetailIcon} />
                        <Text style={styles.sosDetailText}>
                          <Text style={styles.sosDetailLabel}>Số người: </Text>
                          <Text style={styles.sosDetailValueBold}>{selectedSosDetail.people} người gặp nạn</Text>
                        </Text>
                      </View>

                      {selectedSosDetail.address ? (
                        <View style={styles.sosCardDetailItem}>
                          <Feather name="map-pin" size={14} color="#64748B" style={styles.sosDetailIcon} />
                          <Text style={styles.sosDetailText}>
                            <Text style={styles.sosDetailLabel}>Địa chỉ: </Text>
                            <Text style={styles.sosDetailValue}>{selectedSosDetail.address}</Text>
                          </Text>
                        </View>
                      ) : null}

                      {typeof selectedSosDetail.lat === 'number' && typeof selectedSosDetail.lng === 'number' ? (
                        <View style={styles.sosCardDetailItem}>
                          <Feather name="crosshair" size={14} color="#64748B" style={styles.sosDetailIcon} />
                          <Text style={styles.sosDetailText}>
                            <Text style={styles.sosDetailLabel}>GPS: </Text>
                            <Text style={styles.sosDetailValueMono}>
                              {selectedSosDetail.lat.toFixed(6)}, {selectedSosDetail.lng.toFixed(6)}
                            </Text>
                          </Text>
                        </View>
                      ) : null}

                      {selectedSosDetail.phone ? (
                        <View style={styles.sosCardDetailItem}>
                          <Feather name="phone" size={14} color="#64748B" style={styles.sosDetailIcon} />
                          <Text style={styles.sosDetailText}>
                            <Text style={styles.sosDetailLabel}>SĐT: </Text>
                            <Text style={[styles.sosDetailValue, { color: '#0066FF', fontWeight: '700' }]}>
                              {selectedSosDetail.phone}
                            </Text>
                          </Text>
                        </View>
                      ) : null}

                      {selectedSosDetail.description ? (
                        <View style={styles.sosCardDetailItem}>
                          <Feather name="alert-circle" size={14} color="#E11D48" style={styles.sosDetailIcon} />
                          <Text style={styles.sosDetailText}>
                            <Text style={styles.sosDetailLabel}>Tình trạng: </Text>
                            <Text style={[styles.sosDetailValue, { color: '#B91C1C' }]}>
                              {selectedSosDetail.description}
                            </Text>
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Thư viện ảnh đính kèm (nếu có) */}
                    {selectedSosDetail.images && selectedSosDetail.images.length > 0 ? (
                      <View style={{ marginTop: 12 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 6 }}>
                          HÌNH ẢNH HIỆN TRƯỜNG:
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sosCardGallery}>
                          {selectedSosDetail.images.map((imgUrl: string, imgIdx: number) => (
                            <TouchableOpacity
                              key={`sos_img_modal_${imgIdx}`}
                              activeOpacity={0.88}
                              onPress={() => setPreviewImageUrl(imgUrl)}
                              style={styles.sosCardImageThumbWrap}
                            >
                              <Image source={{ uri: imgUrl }} style={styles.sosCardImageThumb} resizeMode="cover" />
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}
                  </ScrollView>

                  {/* Banner trạng thái nếu ca đã hủy hoặc từ chối */}
                  {(selectedSosDetail.status === 'CANCELLED' || selectedSosDetail.status === 'REJECTED') && (
                    <View style={styles.sosDetailModalFooter}>
                      <View style={styles.sosCancelledBanner}>
                        <Ionicons name="close-circle" size={18} color="#DC2626" style={{ marginRight: 6 }} />
                        <Text style={styles.sosCancelledBannerText}>
                          {selectedSosDetail.status === 'CANCELLED'
                            ? 'Yêu cầu cứu nạn này đã được hủy bỏ'
                            : 'Yêu cầu cứu nạn này đã bị từ chối'}
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Modal theo dõi tiến độ SOS trực tiếp khi bấm vào thẻ SOS trong chat */}
        {trackingSosId ? (
          <CitizenSosTrackingModal
            visible={!!trackingSosId}
            sosId={trackingSosId}
            onClose={() => setTrackingSosId(null)}
          />
        ) : null}

        {/* Modal Chọn Phường / Xã để kết nối cứu hộ */}
        <Modal
          visible={showWardPicker}
          transparent={true}
          animationType="slide"
          onRequestClose={() => {
            Keyboard.dismiss();
            setShowWardPicker(false);
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.wardModalBackdrop}
          >
            {/* Vùng mờ bấm ngoài để đóng và ẩn bàn phím */}
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => {
                Keyboard.dismiss();
                setShowWardPicker(false);
              }}
            />

            <View style={styles.wardModalContent}>
              {/* Header Modal */}
              <View style={styles.wardModalHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.wardModalTitle}>Chọn Phường / Xã cứu hộ</Text>
                  <Text style={styles.wardModalSubtitle}>
                    Kết nối trực tiếp tới cơ quan trực ban theo địa bàn bạn chọn
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.wardModalCloseBtn}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowWardPicker(false);
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={20} color="#0F172A" />
                </TouchableOpacity>
              </View>

              {/* Ô tìm kiếm */}
              <View style={styles.wardSearchBox}>
                <Ionicons name="search" size={17} color="#64748B" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.wardSearchInput}
                  placeholder="Tìm theo tên phường, xã, khu vực..."
                  placeholderTextColor="#94A3B8"
                  value={searchWardText}
                  onChangeText={setSearchWardText}
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
                {!!searchWardText && (
                  <TouchableOpacity onPress={() => setSearchWardText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                )}
                {/* Nút hạ bàn phím nhanh */}
                <TouchableOpacity
                  onPress={() => Keyboard.dismiss()}
                  style={styles.dismissKeyboardBtn}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="chevron-down" size={16} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Thanh cuộn ngang lọc theo Khu vực */}
              <View style={styles.districtChipsWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.districtChipsScroll}
                  keyboardShouldPersistTaps="handled"
                >
                  {DANANG_CATEGORIES.map((cat) => {
                    const isActive = selectedCategoryTab === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.districtChip, isActive && styles.districtChipActive]}
                        onPress={() => setSelectedCategoryTab(cat)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.districtChipText, isActive && styles.districtChipTextActive]}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Nút đặt lại về địa chỉ GPS / hồ sơ cá nhân (chỉ hiện khi chưa gõ tìm kiếm để không choán chỗ) */}
              {!searchWardText.trim() && (
                <TouchableOpacity
                  style={styles.defaultAddressBtn}
                  onPress={() => handleSelectWard(null)}
                  activeOpacity={0.7}
                >
                  <View style={styles.defaultAddressIconWrap}>
                    <Ionicons name="locate" size={18} color="#0066FF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.defaultAddressTitle}>Dùng vị trí mặc định (GPS / Hồ sơ)</Text>
                    <Text style={styles.defaultAddressSub} numberOfLines={1}>
                      {user?.address || 'Tự động định vị vị trí hiện tại của thiết bị'}
                    </Text>
                  </View>
                  {!selectedCustomWard && (
                    <Ionicons name="checkmark-circle" size={20} color="#0066FF" />
                  )}
                </TouchableOpacity>
              )}

              {/* Danh sách các phường / xã (mô hình 2 cấp sau sáp nhập) */}
              <FlatList
                data={filteredWards}
                keyExtractor={(item, index) => `${item.ward}_${index}`}
                contentContainerStyle={styles.wardListContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                renderItem={({ item }) => {
                  const isSelected = selectedCustomWard?.ward === item.ward;
                  return (
                    <TouchableOpacity
                      style={[styles.wardItemCard, isSelected && styles.wardItemCardSelected]}
                      onPress={() => {
                        Keyboard.dismiss();
                        handleSelectWard(item);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.wardItemLeft}>
                        <View style={[styles.wardItemIcon, isSelected && styles.wardItemIconSelected]}>
                          <FontAwesome5 name="landmark" size={13} color={isSelected ? '#0066FF' : '#64748B'} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.wardItemName, isSelected && styles.wardItemNameSelected]}>
                            {item.ward}
                          </Text>
                          <Text style={styles.wardItemDistrict}>
                            Trực thuộc TP. Đà Nẵng · Khu vực {item.category}
                          </Text>
                        </View>
                      </View>
                      {isSelected ? (
                        <Ionicons name="checkmark-circle" size={20} color="#0066FF" />
                      ) : (
                        <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                      )}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.wardEmptyWrap}>
                    <Ionicons name="search-outline" size={32} color="#CBD5E1" />
                    <Text style={styles.wardEmptyText}>Không tìm thấy phường/xã phù hợp</Text>
                  </View>
                }
              />
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // ==================== HEADER ====================
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 10,
  },
  headerBackBtn: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
  },
  headerAvatarBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    marginRight: 10,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  headerStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    position: 'absolute',
    bottom: -1,
    right: -1,
  },
  headerTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerChangeBadge: {
    fontSize: 10,
    color: '#0066FF',
    fontWeight: '700',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  subDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },

  // ==================== LIST & INTRO CARD ====================
  flatListContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  centerLoadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    padding: 24,
  },
  centerLoadingText: {
    fontSize: 13.5,
    color: '#64748B',
    fontWeight: '500',
  },
  introCardContainer: {
    marginBottom: 10,
  },
  introCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 6,
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  introIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  introCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 22,
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  introCardDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
    marginBottom: 10,
  },
  introWardBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  introWardBadgeText: {
    flex: 1,
    fontSize: 12.5,
    color: '#1E293B',
    fontWeight: '600',
    marginLeft: 6,
  },
  introWardChangeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#EFF6FF',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  introWardChangeLink: {
    fontSize: 11,
    color: '#0066FF',
    fontWeight: '700',
  },
  sendGpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  sendGpsButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0066FF',
  },

  timeDividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    gap: 10,
  },
  timeDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  timeSeparatorText: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '600',
  },

  // ==================== MESSAGE ROWS ====================
  messageRow: {
    flexDirection: 'row',
    marginVertical: 4,
    alignItems: 'flex-end',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  authorityAvatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  bubbleCol: {
    maxWidth: '82%',
  },
  bubbleColMe: {
    alignItems: 'flex-end',
  },
  bubbleColOther: {
    alignItems: 'flex-start',
  },
  officerNameText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 3,
    marginLeft: 4,
  },
  messageBubble: {
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  messageBubbleMe: {
    backgroundColor: '#0066FF',
    borderBottomRightRadius: 4,
  },
  messageBubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  messageText: {
    fontSize: 14.5,
    lineHeight: 21,
  },
  messageTextMe: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  messageTextOther: {
    color: '#0F172A',
    fontWeight: '500',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  metaRowMe: {
    justifyContent: 'flex-end',
    paddingRight: 2,
  },
  metaRowOther: {
    justifyContent: 'flex-start',
    paddingLeft: 2,
  },
  metaTimeText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },

  // ==================== GPS LOCATION CARD ====================
  gpsCard: {
    borderRadius: 16,
    padding: 12,
    minWidth: 240,
    maxWidth: '100%',
  },
  gpsCardMe: {
    backgroundColor: '#0066FF',
    borderBottomRightRadius: 4,
  },
  gpsCardOther: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: 4,
  },
  gpsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gpsIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gpsBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  gpsCoordsText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  gpsTextWhite: {
    color: '#FFFFFF',
  },
  gpsTextDark: {
    color: '#0F172A',
  },
  gpsSubWhite: {
    color: '#DBEAFE',
  },
  gpsSubDark: {
    color: '#64748B',
  },
  gpsNearBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  gpsNearText: {
    fontSize: 12.5,
    fontWeight: '500',
    flex: 1,
  },
  gpsActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  gpsActionBtnMe: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  gpsActionBtnOther: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  gpsActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  gpsActionBtnTextOther: {
    color: '#0066FF',
  },

  // ==================== COMPOSER BAR ====================
  composerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputWrap: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 22,
    paddingHorizontal: 14,
    minHeight: 42,
    maxHeight: 100,
    justifyContent: 'center',
  },
  textInput: {
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: Platform.OS === 'ios' ? 9 : 6,
  },
  sendRoundBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendRoundBtnDisabled: {
    backgroundColor: '#93C5FD',
  },

  // ==================== IMAGE ATTACHMENTS & LIGHTBOX ====================
  messageBubbleWithImage: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
  chatImageWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E2E8F0',
  },
  chatImage: {
    width: 220,
    height: 160,
    borderRadius: 14,
  },
  chatImageOverlayIcon: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxCloseBtn: {
    position: 'absolute',
    right: 18,
    zIndex: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '80%',
  },

  // ==================== WARD PICKER MODAL ====================
  wardModalBackdrop: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  wardModalContent: {
    width: '100%',
    maxWidth: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    maxHeight: '92%',
    height: '78%',
    overflow: 'hidden',
  },
  wardModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    width: '100%',
  },
  wardModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  wardModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  wardModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  wardSearchBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 10,
  },
  wardSearchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    paddingVertical: 0,
  },
  dismissKeyboardBtn: {
    marginLeft: 6,
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  districtChipsWrap: {
    width: '100%',
    marginBottom: 10,
  },
  districtChipsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  districtChip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  districtChipActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  districtChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  districtChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  defaultAddressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  defaultAddressIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  defaultAddressTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0066FF',
  },
  defaultAddressSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  wardListContent: {
    paddingBottom: 16,
  },
  wardItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 6,
  },
  wardItemCardSelected: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  wardItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  wardItemIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  wardItemIconSelected: {
    backgroundColor: '#EFF6FF',
  },
  wardItemName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  wardItemNameSelected: {
    color: '#0066FF',
    fontWeight: '700',
  },
  wardItemDistrict: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  wardEmptyWrap: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  wardEmptyText: {
    fontSize: 12.5,
    color: '#94A3B8',
    marginTop: 6,
  },

  // --- SOS POPUP BANNER STYLES ---
  sosPopupWrapper: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: 'transparent',
  },
  sosPopupCard: {
    backgroundColor: '#FFF1F2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECDD3',
    padding: 10,
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  sosPopupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sosPopupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sosPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#E11D48',
    marginRight: 6,
  },
  sosPopupBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#9F1239',
    letterSpacing: 0.4,
    marginLeft: 3,
  },
  sosPopupCloseBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFE4E6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sosPopupBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sosPopupInfoLeft: {
    flex: 1,
    marginRight: 8,
  },
  sosPopupCodeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  sosPopupCodeBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E11D48',
    backgroundColor: '#FFE4E6',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginRight: 6,
  },
  sosPopupTypeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  sosPopupAddress: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  sosPopupSendActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E11D48',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  sosPopupSendActionText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  attachBtnSos: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    borderWidth: 1,
  },
  attachBtnSosActive: {
    backgroundColor: '#FFE4E6',
    borderColor: '#E11D48',
  },

  // --- SOS MESSAGE CARD STYLES ---
  sosCardContainer: {
    width: '100%',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    marginVertical: 2,
  },
  sosCardMe: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  sosCardOther: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  sosCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
    borderBottomWidth: 0.8,
    borderBottomColor: '#FEE2E2',
    marginBottom: 6,
  },
  sosCardHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sosCardHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#E11D48',
    marginLeft: 5,
    letterSpacing: 0.3,
  },
  sosCardStatusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sosCardStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  sosCardCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  sosCardCodeText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#9F1239',
    marginRight: 8,
  },
  sosCardTypeTag: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E293B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  sosCardDetailsBox: {
    gap: 4,
    marginVertical: 4,
  },
  sosCardDetailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sosDetailIcon: {
    marginTop: 2,
    marginRight: 6,
  },
  sosDetailText: {
    fontSize: 12,
    color: '#334155',
    flex: 1,
    lineHeight: 16,
  },
  sosDetailLabel: {
    color: '#64748B',
  },
  sosDetailValue: {
    color: '#1E293B',
  },
  sosDetailValueBold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  sosDetailValueMono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#0284C7',
    fontWeight: '600',
  },
  sosCardGallery: {
    marginTop: 6,
    marginBottom: 4,
  },
  sosCardImageThumbWrap: {
    marginRight: 6,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sosCardImageThumb: {
    width: 68,
    height: 68,
  },

  // --- COMPACT SOS CARD IN CHAT STREAM (1 - 2 DÒNG SIÊU GỌN) ---
  sosCardCompact: {
    width: 270,
    maxWidth: '100%',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    marginVertical: 2,
  },
  sosCardCompactMe: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  sosCardCompactOther: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  sosCardCompactCancelled: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  sosCompactTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  sosCompactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    marginRight: 4,
    gap: 4,
  },
  sosCompactCodeText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#9F1239',
  },
  sosCompactCodeTextCancelled: {
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  sosCompactTypeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1E293B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    flexShrink: 1,
  },
  sosCompactStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    flexShrink: 0,
    alignSelf: 'center',
  },
  sosCompactStatusText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  sosCompactSecondRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 5,
  },
  sosCompactAddrWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 6,
  },
  sosCompactAddrText: {
    fontSize: 11,
    color: '#475569',
    flex: 1,
  },
  sosCompactTapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    flexShrink: 0,
  },
  sosCompactTapHintText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0066FF',
  },

  // --- DETAIL MODAL STYLES (OPENED ON TAP) ---
  sosDetailModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sosDetailModalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  sosDetailModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
  },
  sosDetailModalCloseBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  sosDetailModalBody: {
    flexGrow: 0,
    marginBottom: 14,
  },
  sosDetailModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  sosCancelledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: '100%',
  },
  sosCancelledBannerText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#DC2626',
  },
});

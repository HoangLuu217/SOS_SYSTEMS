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
}

export const LocalAuthorityChatModal: React.FC<LocalAuthorityChatModalProps> = ({
  visible,
  onClose,
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

  // Khởi động phân giải khi mở modal
  useEffect(() => {
    if (!visible) {
      setMessages([]);
      setSelectedCustomWard(null);
      return;
    }

    setMessages([]);
    if (!selectedCustomWard) {
      resolveAreaAndAuthority();
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [visible, resolveAreaAndAuthority]);

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
              {item.senderRole === 'ADMIN' || (item.senderName && item.senderName.toLowerCase().includes('admin'))
                ? (localInfo?.authority?.department || `Ban Chỉ Huy PCTT ${displayArea}`)
                : (item.senderName || localInfo?.authority?.name || localInfo?.authority?.department || 'Cán bộ trực ban')}
            </Text>
          )}

          {hasGps ? (
            renderGpsCard(item.content, isMe)
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
              3. THANH NHẬP TIN NHẮN AN TOÀN TRÊN IPHONE (SAFE BOTTOM)
             ======================================================== */}
          <View
            style={[
              styles.composerBar,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
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
              style={StyleSheet.absoluteFillObject}
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
});

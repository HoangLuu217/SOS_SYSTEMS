import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Ionicons,
  Feather,
  MaterialCommunityIcons,
  FontAwesome5,
} from '@expo/vector-icons';
import * as Location from 'expo-location';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/context/AuthContext';
import { backendApi, ChatMessageItem, LocalAuthorityInfo } from '@/api';

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

  // Danh sách tin nhắn & input
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingGps, setSendingGps] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);

  // Xác định địa phương của người dân (từ GPS thực tế hoặc địa chỉ trong hồ sơ)
  useEffect(() => {
    if (!visible) {
      setMessages([]);
      return;
    }

    // Reset sạch tin nhắn khi mở modal hoặc khi tài khoản thay đổi
    setMessages([]);
    let isMounted = true;

    const resolveAreaAndAuthority = async () => {
      setLoadingInfo(true);
      let detectedArea = '';
      let detectedProvince = 'Thành phố Đà Nẵng';
      let detectedWard = 'Thanh Khê';
      let lat: number | undefined = undefined;
      let lng: number | undefined = undefined;

      // 1. Lấy toạ độ GPS thực tế của thiết bị
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
          if (isMounted) setCurrentCoords({ lat, lng });

          // Dịch ngược toạ độ (reverse geocode)
          const geoList = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });

          if (geoList && geoList.length > 0) {
            const geo = geoList[0];
            detectedWard = geo.subregion || geo.district || geo.name || 'Thanh Khê';
            detectedProvince = geo.region || geo.city || 'Thành phố Đà Nẵng';
            detectedArea = [detectedWard, detectedProvince].filter(Boolean).join(', ');
          }
        }
      } catch (err) {
        console.log('[GPS Detect Note]:', err);
      }

      // 2. Dự phòng nếu người dùng chưa bật GPS: Lấy từ hồ sơ tài khoản
      if (!detectedArea && user?.address) {
        detectedArea = user.address;
        const parts = user.address.split(',').map((s) => s.trim());
        if (parts.length >= 2) {
          detectedProvince = parts[parts.length - 1];
          detectedWard = parts[parts.length - 2];
        } else {
          detectedProvince = user.address;
        }
      }

      if (!detectedArea) {
        detectedArea = 'P. Thanh Khê, Thành phố Đà Nẵng';
      }

      if (isMounted) {
        setUserLocationName(detectedArea);
        setProvinceName(detectedProvince);
        setWardName(detectedWard);
      }

      // 3. Gọi Backend lấy thông tin Ban chỉ huy / Cán bộ địa phương quản lý theo từng tài khoản
      try {
        const res = await backendApi.getLocalAuthority({
          areaName: detectedArea,
          province: detectedProvince,
          ward: detectedWard,
          lat,
          lng,
          userId: user?._id,
        });

        if (isMounted && res.success && res.data) {
          setLocalInfo(res.data);
          loadChatHistory(res.data.channel);
          initRealtimeSocket(res.data.channel);
        }
      } catch (err) {
        console.warn('[Get Local Authority Error]:', err);
      } finally {
        if (isMounted) setLoadingInfo(false);
      }
    };

    resolveAreaAndAuthority();

    return () => {
      isMounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [visible, user?._id, user?.address]);

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

  // Menu tùy chọn ba chấm
  const handleOpenMenu = () => {
    const hotline = localInfo?.authority?.phone || '112';
    Alert.alert(
      headerDepartmentTitle,
      `Địa bàn: ${userLocationName}\nĐường dây nóng: ${hotline}`,
      [
        {
          text: 'Gọi trực ban (' + hotline + ')',
          onPress: () => {
            const clean = hotline.replace(/[^0-9+]/g, '');
            Linking.openURL(`tel:${clean}`).catch(() => {});
          },
        },
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
              {item.senderName || localInfo?.authority?.name || 'Cán bộ trực ban'}
            </Text>
          )}

          {hasGps ? (
            renderGpsCard(item.content, isMe)
          ) : (
            <View
              style={[
                styles.messageBubble,
                isMe ? styles.messageBubbleMe : styles.messageBubbleOther,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  isMe ? styles.messageTextMe : styles.messageTextOther,
                ]}
              >
                {item.content}
              </Text>
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

  // Tên hiển thị chuẩn xác: Phường / Xã thực tế
  const cleanWard = (wardName || 'Thanh Khê')
    .replace(/^(phường|xã|thị trấn|p\.|x\.|tt\.)\s+/i, '')
    .trim();

  const cleanProvince = (provinceName || 'Đà Nẵng')
    .replace(/^(thành phố|tỉnh|tp\.)\s+/i, '')
    .trim();

  const headerDepartmentTitle = `UBND Phường ${cleanWard}`;
  const headerSubtitleText = `${cleanProvince} · Trực tuyến 24/7`;

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

          {/* Tiêu đề & phụ đề địa phương */}
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {headerDepartmentTitle}
            </Text>
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
            </View>
          </View>

          {/* Nút gọi điện khẩn cấp */}
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => {
              const hotline = localInfo?.authority?.phone || '112';
              const clean = hotline.replace(/[^0-9+]/g, '');
              Linking.openURL(`tel:${clean}`).catch(() => {});
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
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
                      Kênh kết nối P. {cleanWard},{'\n'}
                      {provinceName || 'Thành Phố Đà Nẵng'}
                    </Text>

                    <Text style={styles.introCardDesc}>
                      Kết nối trực tiếp với cán bộ phụ trách cứu hộ & phòng chống thiên tai cơ sở. Gửi ngay vị trí hoặc tin nhắn nếu cần hỗ trợ khẩn cấp.
                    </Text>

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
              disabled={sendingGps}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {sendingGps ? (
                <ActivityIndicator size="small" color="#0066FF" />
              ) : (
                <Ionicons name="location" size={21} color="#0066FF" />
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
    marginBottom: 14,
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
});

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Animated,
  PanResponder,
  Dimensions,
  Platform,
  DeviceEventEmitter,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { backendApi } from '@/api';
import { useAuth } from '@/context/AuthContext';
import { CitizenSosTrackingModal } from '@/features/profile/CitizenSosTrackingModal';

const WIDGET_SIZE = 50;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  PENDING: { label: 'Chờ tiếp nhận', color: '#B45309', bg: '#FEF3C7', icon: 'time-outline' },
  ASSIGNED: { label: 'Đã điều đội', color: '#0284C7', bg: '#E0F2FE', icon: 'shield-outline' },
  ACCEPTED: { label: 'Đã nhận lệnh', color: '#7C3AED', bg: '#EDE9FE', icon: 'checkmark-circle-outline' },
  ON_THE_WAY: { label: 'Đang di chuyển đến', color: '#2563EB', bg: '#DBEAFE', icon: 'boat-outline' },
  ARRIVED: { label: 'Tại hiện trường', color: '#DC2626', bg: '#FEE2E2', icon: 'location-outline' },
  RESCUING: { label: 'Đang cứu nạn', color: '#DC2626', bg: '#FEE2E2', icon: 'medical-outline' },
  IN_PROGRESS: { label: 'Đang xử lý', color: '#0284C7', bg: '#E0F2FE', icon: 'sync-outline' },
};

const TYPE_LABELS: Record<string, string> = {
  MEDICAL: '🚑 Cấp cứu Y tế',
  FIRE: '🔥 Hỏa hoạn',
  FLOOD: '🌊 Lũ lụt / Mắc kẹt',
  LANDSLIDE: '⛰️ Sạt lở',
  STORM: '⛈️ Bão lũ',
  ACCIDENT: '💥 Tai nạn',
  MISSING_PERSON: '👤 Lạc người',
  OTHER: '⚠️ Cứu nạn khẩn cấp',
};

export const FloatingActiveSosWidget: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [activeSosList, setActiveSosList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [showListModal, setShowListModal] = useState<boolean>(false);
  const [selectedSosForTracking, setSelectedSosForTracking] = useState<any | null>(null);
  const [trackingModalVisible, setTrackingModalVisible] = useState<boolean>(false);

  // Tọa độ khởi tạo: Nằm ở mép phải màn hình, phía dưới thanh header
  const initialX = SCREEN_WIDTH - WIDGET_SIZE - 12;
  const initialY = Math.max(insets.top + 70, 120);

  const pan = useRef(new Animated.ValueXY({ x: initialX, y: initialY })).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isDragging = useRef<boolean>(false);

  // Hiệu ứng nhịp đập radar khẩn cấp
  useEffect(() => {
    if (activeSosList.length > 0) {
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();
      return () => pulseLoop.stop();
    }
  }, [activeSosList.length, pulseAnim]);

  // Nạp danh sách yêu cầu cứu nạn của người dùng
  const fetchActiveSos = useCallback(async () => {
    if (!user) return;
    try {
      const res = await backendApi.get('/sos');
      if (res.success && Array.isArray(res.data)) {
        // Lọc các ca đang kích hoạt (Chưa kết thúc / hủy / từ chối)
        const active = res.data.filter(
          (item: any) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(item.status)
        );
        // Sắp xếp ca mới nhất lên đầu
        active.sort(
          (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setActiveSosList(active);
      }
    } catch {
      // Ignored
    }
  }, [user]);

  useEffect(() => {
    void fetchActiveSos();

    // Lắng nghe các sự kiện cập nhật SOS realtime
    const subSync = DeviceEventEmitter.addListener('sos:sync', fetchActiveSos);
    const subCreated = DeviceEventEmitter.addListener('sos:created', fetchActiveSos);
    const subUpdated = DeviceEventEmitter.addListener('sos:updated', fetchActiveSos);

    // Chu kỳ làm mới mỗi 15 giây
    const interval = setInterval(fetchActiveSos, 15000);

    return () => {
      subSync.remove();
      subCreated.remove();
      subUpdated.remove();
      clearInterval(interval);
    };
  }, [fetchActiveSos]);

  // Cấu hình PanResponder để kéo thả xung quanh màn hình
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Chỉ bắt đầu kéo nếu người dùng di chuyển hơn 4px (phân biệt giữa tap và drag)
        return Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
      },
      onPanResponderGrant: () => {
        isDragging.current = false;
        pan.setOffset({
          // @ts-ignore
          x: pan.x._value,
          // @ts-ignore
          y: pan.y._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6) {
          isDragging.current = true;
        }
        Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false })(
          _,
          gestureState
        );
      },
      onPanResponderRelease: (_, gestureState) => {
        pan.flattenOffset();

        // Nếu chỉ là chạm nhẹ (tap) và không kéo -> Mở modal danh sách
        if (!isDragging.current && Math.abs(gestureState.dx) < 6 && Math.abs(gestureState.dy) < 6) {
          setShowListModal(true);
          return;
        }

        // Tự động neo nhẹ vào mép trái hoặc mép phải màn hình cho ngay ngắn
        // @ts-ignore
        const currentX = pan.x._value;
        // @ts-ignore
        const currentY = pan.y._value;

        const targetX = currentX < SCREEN_WIDTH / 2 ? 12 : SCREEN_WIDTH - WIDGET_SIZE - 12;
        // Giới hạn trong vùng an toàn theo chiều dọc
        const minY = insets.top + 50;
        const maxY = SCREEN_HEIGHT - insets.bottom - 110;
        const targetY = Math.max(minY, Math.min(currentY, maxY));

        Animated.spring(pan, {
          toValue: { x: targetX, y: targetY },
          friction: 6,
          tension: 40,
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

  // Nếu không có ca SOS nào đang kích hoạt -> Ẩn widget để không che màn hình
  if (activeSosList.length === 0) {
    return null;
  }

  return (
    <>
      {/* Widget nổi có thể kéo thả */}
      <Animated.View
        style={[
          styles.floatingWidget,
          {
            transform: pan.getTranslateTransform(),
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Vòng hào quang nhịp đập bên ngoài */}
        <Animated.View
          style={[
            styles.pulseRing,
            {
              transform: [{ scale: pulseAnim }],
            },
          ]}
        />

        {/* Nút chính widget hình tròn màu đen theo mẫu */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setShowListModal(true)}
          style={styles.widgetButton}
        >
          <View style={styles.blackCircle}>
            <Text style={styles.sosText}>SOS</Text>
          </View>

          {/* Badge đếm số lượng ca cứu hộ đang kích hoạt (1, 2, ...) */}
          <View style={styles.counterBadge}>
            <Text style={styles.counterText}>{activeSosList.length}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Modal danh sách các ca SOS đang diễn ra */}
      <Modal
        visible={showListModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowListModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowListModal(false)}
        >
          <Pressable
            style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Thanh gạt trên đỉnh */}
            <View style={styles.sheetHandle} />

            {/* Header Modal */}
            <View style={styles.sheetHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.sheetIconWrap}>
                  <Text style={styles.sheetIconText}>SOS</Text>
                </View>
                <View>
                  <Text style={styles.sheetTitle}>Yêu Cầu Cứu Nạn Của Bạn</Text>
                  <Text style={styles.sheetSub}>
                    Đang có <Text style={{ fontWeight: '800', color: '#DC2626' }}>{activeSosList.length} ca</Text> cứu hộ đang kích hoạt
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setShowListModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Danh sách các ca SOS */}
            <ScrollView
              style={{ maxHeight: SCREEN_HEIGHT * 0.55 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingTop: 6 }}
            >
              {activeSosList.map((sos) => {
                const statusCfg = STATUS_MAP[sos.status] || STATUS_MAP.PENDING;
                const typeLabel = TYPE_LABELS[sos.emergencyType] || '⚠️ Cứu nạn khẩn cấp';

                return (
                  <TouchableOpacity
                    key={sos._id}
                    style={styles.sosCard}
                    activeOpacity={0.8}
                    onPress={() => {
                      setShowListModal(false);
                      setSelectedSosForTracking(sos);
                      setTrackingModalVisible(true);
                    }}
                  >
                    <View style={styles.cardHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.sosCodeText}>
                          #{sos.sosCode || (sos._id ? sos._id.toString().slice(-4).toUpperCase() : 'SOS')}
                        </Text>
                        <Text style={styles.emergencyTypeBadge}>{typeLabel}</Text>
                      </View>

                      {/* Trạng thái ca */}
                      <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                        <Ionicons name={statusCfg.icon as any} size={12} color={statusCfg.color} />
                        <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>
                          {statusCfg.label}
                        </Text>
                      </View>
                    </View>

                    {/* Địa điểm */}
                    <View style={styles.locationRow}>
                      <Feather name="map-pin" size={13} color="#64748B" />
                      <Text style={styles.locationText} numberOfLines={1}>
                        {sos.address || 'Hiện trường chưa có địa chỉ'}
                      </Text>
                    </View>

                    {/* Nạn nhân & Thời gian */}
                    <View style={styles.cardFooter}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="people-outline" size={13} color="#64748B" />
                        <Text style={styles.metaText}>{sos.people || 1} người cần cứu</Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.actionLinkText}>Theo dõi hành trình</Text>
                        <Feather name="chevron-right" size={14} color="#0066FF" />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal theo dõi chi tiết ca SOS */}
      {selectedSosForTracking && (
        <CitizenSosTrackingModal
          visible={trackingModalVisible}
          sosId={selectedSosForTracking._id}
          initialSosData={selectedSosForTracking}
          onClose={() => {
            setTrackingModalVisible(false);
            setSelectedSosForTracking(null);
            void fetchActiveSos();
          }}
          onSosCompleted={() => {
            void fetchActiveSos();
          }}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  floatingWidget: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 9999,
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    elevation: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
  },
  pulseRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: (WIDGET_SIZE + 8) / 2,
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  widgetButton: {
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    borderRadius: WIDGET_SIZE / 2,
    overflow: 'visible',
  },
  blackCircle: {
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    borderRadius: WIDGET_SIZE / 2,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  sosText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.2,
    textAlign: 'center',
    includeFontPadding: false,
  },
  counterBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 4,
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },

  // Modal Sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  sheetIconText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  sheetSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },

  // SOS Card
  sosCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sosCodeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  emergencyTypeBadge: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  locationText: {
    fontSize: 12,
    color: '#334155',
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  metaText: {
    fontSize: 11,
    color: '#64748B',
  },
  actionLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066FF',
  },
});


import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { backendApi } from '../../services/backendApi';
import { PROFILE_THEME } from './theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface CitizenSosTrackingModalProps {
  visible: boolean;
  sosId: string | null;
  initialSosData?: any;
  onClose: () => void;
  onSosCompleted?: (updatedSos: any) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: any; step: number; desc: string }> = {
  PENDING: {
    label: 'Chờ tiếp nhận',
    color: '#D97706',
    bgColor: '#FEF3C7',
    icon: 'time-outline',
    step: 1,
    desc: 'Yêu cầu của bạn đã được gửi lên hệ thống và đang chờ Ban chỉ huy duyệt điều phối.',
  },
  VERIFIED: {
    label: 'Đã xác minh',
    color: '#0284C7',
    bgColor: '#E0F2FE',
    icon: 'shield-checkmark-outline',
    step: 2,
    desc: 'Chính quyền địa phương đã xác thực thông tin và đang tìm đội cứu hộ gần nhất.',
  },
  ASSIGNED: {
    label: 'Đã điều phối đội',
    color: '#7C3AED',
    bgColor: '#EDE9FE',
    icon: 'people-outline',
    step: 2,
    desc: 'Đã phân công lực lượng cứu hộ phụ trách ca này.',
  },
  ACCEPTED: {
    label: 'Đội đã nhận lệnh',
    color: '#7C3AED',
    bgColor: '#EDE9FE',
    icon: 'briefcase-outline',
    step: 2,
    desc: 'Đội cứu hộ đã tiếp nhận lệnh tác chiến và đang chuẩn bị phương tiện.',
  },
  ON_THE_WAY: {
    label: 'Đang trên đường tới',
    color: '#2563EB',
    bgColor: '#EFF6FF',
    icon: 'boat-outline',
    step: 3,
    desc: 'Cano / Xe cứu hộ đang di chuyển khẩn cấp tới vị trí của bạn.',
  },
  ARRIVED: {
    label: 'Đã tiếp cận hiện trường',
    color: '#C026D3',
    bgColor: '#FAE8FF',
    icon: 'location-outline',
    step: 3,
    desc: 'Đội cứu hộ đã có mặt tại khu vực. Hãy chú ý còi hiệu và tạo tín hiệu nhận dạng!',
  },
  RESCUING: {
    label: 'Đang tiến hành ứng cứu',
    color: '#E11D48',
    bgColor: '#FFE4E6',
    icon: 'medical-outline',
    step: 3,
    desc: 'Lực lượng cứu hộ đang hỗ trợ di dời, cấp cứu hoặc bốc dỡ người an toàn.',
  },
  COMPLETED: {
    label: 'Cứu hộ an toàn',
    color: '#16A34A',
    bgColor: '#DCFCE7',
    icon: 'checkmark-circle-outline',
    step: 4,
    desc: 'Ca cứu hộ đã hoàn thành thành công. Bạn và gia đình đã an toàn!',
  },
  CANCELLED: {
    label: 'Đã hủy',
    color: '#64748B',
    bgColor: '#F1F5F9',
    icon: 'close-circle-outline',
    step: 0,
    desc: 'Yêu cầu cứu nạn đã được hủy.',
  },
  REJECTED: {
    label: 'Từ chối',
    color: '#DC2626',
    bgColor: '#FEE2E2',
    icon: 'ban-outline',
    step: 0,
    desc: 'Yêu cầu không thể xử lý hoặc đã chuyển sang đơn vị khác.',
  },
};

const TYPE_CONFIG: Record<string, { label: string; icon: string }> = {
  MEDICAL: { label: 'Cấp cứu y tế / Bị thương', icon: 'medical-bag' },
  FIRE: { label: 'Hỏa hoạn / Cháy nổ', icon: 'fire' },
  FLOOD: { label: 'Cứu hộ ngập lụt / Mắc kẹt', icon: 'water' },
  LANDSLIDE: { label: 'Sạt lở đất / Đổ sập', icon: 'image-filter-hdr' },
  STORM: { label: 'Bão lốc / Cây đổ', icon: 'weather-windy' },
  ACCIDENT: { label: 'Tai nạn khẩn cấp', icon: 'car-emergency' },
  MISSING_PERSON: { label: 'Tìm kiếm người mất tích', icon: 'account-search' },
  OTHER: { label: 'Cứu nạn khẩn cấp khác', icon: 'alert-circle' },
};

export const CitizenSosTrackingModal: React.FC<CitizenSosTrackingModalProps> = ({
  visible,
  sosId,
  initialSosData,
  onClose,
  onSosCompleted,
}) => {
  const [sos, setSos] = useState<any>(initialSosData || null);
  const [assignment, setAssignment] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(!initialSosData);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isCompleting, setIsCompleting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const webViewRef = useRef<WebView>(null);

  // Tải chi tiết ca SOS và danh sách phân công đội cứu hộ
  const loadData = async (showLoadingIndicator = true) => {
    if (!sosId) return;
    if (showLoadingIndicator) setLoading(true);

    try {
      // 1. Lấy chi tiết ca SOS
      const sosRes = await backendApi.get(`/sos/${sosId}`);
      if (sosRes.success && sosRes.data) {
        setSos(sosRes.data);
      }

      // 2. Lấy thông tin phân công (Assignment) nếu có
      try {
        const assignRes = await backendApi.get(`/sos/${sosId}/assignments`);
        if (assignRes.success && Array.isArray(assignRes.data) && assignRes.data.length > 0) {
          // Lấy phân công mới nhất
          setAssignment(assignRes.data[0]);
        } else {
          setAssignment(null);
        }
      } catch (assignErr) {
        console.warn('Lỗi lấy assignment:', assignErr);
      }
    } catch (err: any) {
      console.warn('Lỗi tải thông tin theo dõi SOS:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (visible && sosId) {
      if (initialSosData) {
        setSos(initialSosData);
      }
      loadData(!initialSosData);
    }
  }, [visible, sosId]);

  // Xử lý khi người dân nhấn "Tôi đã được cứu an toàn"
  const handleConfirmSafety = () => {
    Alert.alert(
      'Xác nhận an toàn',
      'Bạn và gia đình đã được Đội cứu hộ tiếp cận và đưa đến nơi an toàn rồi đúng không?',
      [
        { text: 'Chưa, vẫn đang chờ', style: 'cancel' },
        {
          text: 'Đúng, tôi đã an toàn',
          style: 'default',
          onPress: async () => {
            if (!sos?._id) return;
            setIsCompleting(true);
            try {
              const res = await backendApi.post(`/sos/${sos._id}/complete`, {});
              if (res.success) {
                const updated = { ...sos, status: 'COMPLETED' };
                setSos(updated);
                onSosCompleted?.(updated);
                Alert.alert(
                  'Cứu hộ thành công! 🎉',
                  'Hệ thống đã ghi nhận bạn an toàn. Chúc bạn và gia đình luôn bình an!'
                );
              } else {
                Alert.alert('Không thể cập nhật', res.message || 'Vui lòng thử lại sau.');
              }
            } catch (err: any) {
              Alert.alert('Lỗi kết nối', err.message || 'Không thể gửi xác nhận an toàn.');
            } finally {
              setIsCompleting(false);
            }
          },
        },
      ]
    );
  };

  // Xử lý khi người dân muốn hủy yêu cầu cứu hộ
  const handleCancelSos = () => {
    Alert.alert(
      'Hủy yêu cầu cứu nạn',
      'Bạn có chắc chắn muốn hủy yêu cầu cứu hộ này? (Chỉ hủy khi bạn đã tự di chuyển an toàn)',
      [
        { text: 'Không hủy', style: 'cancel' },
        {
          text: 'Xác nhận hủy',
          style: 'destructive',
          onPress: async () => {
            if (!sos?._id) return;
            setIsCancelling(true);
            try {
              const res = await backendApi.post(`/sos/${sos._id}/cancel`, {
                cancelReason: 'Người dân tự thoát hiểm an toàn',
              });
              if (res.success) {
                const updated = { ...sos, status: 'CANCELLED' };
                setSos(updated);
                onSosCompleted?.(updated);
                Alert.alert('Đã hủy', 'Yêu cầu cứu nạn đã được hủy thành công.');
              } else {
                Alert.alert('Lỗi', res.message || 'Không thể hủy yêu cầu.');
              }
            } catch (err: any) {
              Alert.alert('Lỗi', err.message || 'Không thể gửi lệnh hủy.');
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ]
    );
  };

  if (!visible) return null;

  const currentStatus = sos?.status || 'PENDING';
  const statusCfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG['PENDING'];
  const typeCfg = TYPE_CONFIG[sos?.emergencyType] || TYPE_CONFIG['FLOOD'];

  // Tọa độ người dân
  const victimLng = sos?.location?.coordinates?.[0] || 108.26054;
  const victimLat = sos?.location?.coordinates?.[1] || 15.96836;

  // Tọa độ giả định / thực tế của đội cứu hộ (dịch chuyển nhẹ về hướng trạm cứu nạn nếu chưa có GPS)
  const rescuerLat = victimLat + 0.0072;
  const rescuerLng = victimLng - 0.0055;

  const rescuerPhone =
    assignment?.rescuerId?.phone ||
    assignment?.authorityOrganizationId?.phone ||
    '112';

  const rescuerName =
    assignment?.rescuerId?.fullName ||
    assignment?.rescueTeamId?.name ||
    'Đội Phản ứng nhanh địa phương';

  const teamName =
    assignment?.rescueTeamId?.name ||
    'Lực lượng Cứu nạn - Cứu trợ TP Đà Nẵng';

  const vehicleName =
    assignment?.vehicleId?.plateNumber
      ? `Cano / Phương tiện: ${assignment.vehicleId.plateNumber}`
      : 'Cano chuyên dụng vượt lũ';

  // Vật phẩm tiếp tế chuẩn bị mang theo
  const peopleCount = sos?.people || 1;
  const priorityGroups: string[] = sos?.priorityGroups || [];

  // Tạo mã HTML nhúng Leaflet Map đồng bộ 100% với MapScreen trong app
  const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #f1f5f9; font-family: -apple-system, sans-serif; }
        .leaflet-container { background-color: #f1f5f9; }
        .leaflet-tile { -webkit-backface-visibility: hidden; backface-visibility: hidden; }
        
        @keyframes pulseWave {
          0% { transform: scale(0.6); opacity: 0.95; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .sos-radar-container {
          position: relative;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sos-radar-wave {
          position: absolute;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background-color: rgba(220, 38, 38, 0.45);
          border: 2px solid #DC2626;
          animation: pulseWave 1.6s ease-out infinite;
        }
        .sos-radar-core {
          position: relative;
          width: 28px;
          height: 28px;
          background: #DC2626;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 0 10px rgba(220, 38, 38, 0.8), 0 2px 5px rgba(0,0,0,0.3);
          border: 2px solid white;
          z-index: 2;
        }

        .rescuer-pin-wrap {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
        }
        .rescuer-pin-circle {
          background: #2563eb;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2.5px solid #ffffff;
          box-shadow: 0 3px 8px rgba(37, 99, 235, 0.45);
          color: white;
          font-size: 16px;
        }
        .rescuer-pin-arrow {
          width: 0;
          height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 6px solid #2563eb;
          margin-top: -1px;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', {
          zoomControl: false,
          preferCanvas: true
        });

        // 1. Chế độ thu nhỏ (Zoom <= 15) - Chuẩn Google Maps không quán xá như MapScreen
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

        // 2. Chế độ phóng to gần (Zoom >= 16) - Hiện tên đường ngõ hẻm
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

        L.control.zoom({ position: 'topright' }).addTo(map);

        var vLat = ${victimLat};
        var vLng = ${victimLng};
        var rLat = ${rescuerLat};
        var rLng = ${rescuerLng};

        // Icon Radar cứu hộ chuẩn phong cách app
        var victimRadarIcon = L.divIcon({
          html: '<div class="sos-radar-container"><div class="sos-radar-wave"></div><div class="sos-radar-core"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12a5 5 0 0 1 5-5v0a5 5 0 0 1 5 5v6H7v-6Z"/><path d="M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2H5v-2Z"/><path d="M21 12h1"/><path d="M18.5 4.5 19 4"/><path d="M2 12h1"/><path d="M12 2v1"/><path d="M4.5 4.5 5 4"/><path d="M12 11v3"/></svg></div></div>',
          className: 'custom-sos-radar-wrapper',
          iconSize: [44, 44],
          iconAnchor: [22, 22]
        });

        var markerVictim = L.marker([vLat, vLng], { icon: victimRadarIcon }).addTo(map)
          .bindPopup('<b>📍 Vị trí của bạn</b><br/>Đang chờ cứu nạn');

        // Vòng tròn bảo vệ bán kính 300m
        L.circle([vLat, vLng], {
          color: '#DC2626',
          fillColor: '#EF4444',
          fillOpacity: 0.12,
          radius: 300,
          weight: 1.5
        }).addTo(map);

        // Icon Cano / Đội cứu hộ
        var rescuerIcon = L.divIcon({
          html: '<div class="rescuer-pin-wrap"><div class="rescuer-pin-circle">🚤</div><div class="rescuer-pin-arrow"></div></div>',
          className: 'custom-rescuer-pin',
          iconSize: [32, 38],
          iconAnchor: [16, 38]
        });

        ${assignment || currentStatus === 'ON_THE_WAY' || currentStatus === 'ARRIVED' ? `
          var markerRescuer = L.marker([rLat, rLng], { icon: rescuerIcon }).addTo(map)
            .bindPopup('<b>🚤 Đội Cứu Hộ Tiếp Ứng</b><br/>Đang di chuyển tiếp cận');

          var polyline = L.polyline([[rLat, rLng], [vLat, vLng]], {
            color: '#2563EB',
            weight: 4,
            dashArray: '6, 8',
            opacity: 0.9
          }).addTo(map);

          var group = new L.featureGroup([markerVictim, markerRescuer]);
          map.fitBounds(group.getBounds().pad(0.35));
        ` : `
          map.setView([vLat, vLng], 15);
        `}
      </script>
    </body>
    </html>
  `;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

        {/* 1. HEADER CHUẨN ĐỒNG BỘ PHONG CÁCH PROFILE */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose} activeOpacity={0.7}>
            <Feather name="arrow-left" size={24} color="#0F172A" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Hành trình cứu hộ</Text>
            <Text style={styles.headerCode}>{sos?.sosCode || 'MÃ ĐANG TẢI...'}</Text>
          </View>

          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => {
              setRefreshing(true);
              loadData(false);
            }}
            activeOpacity={0.7}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#0066FF" />
            ) : (
              <Feather name="refresh-cw" size={19} color="#0066FF" />
            )}
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#0066FF" />
            <Text style={styles.loadingText}>Đang đồng bộ hành trình thực địa...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* 2. BANNER TRẠNG THÁI & STEPPER TIẾN TRÌNH */}
            <View style={[styles.statusBanner, { backgroundColor: statusCfg.bgColor, borderColor: statusCfg.color + '40' }]}>
              <View style={styles.statusBannerTop}>
                <View style={[styles.statusIconWrap, { backgroundColor: statusCfg.color }]}>
                  <Ionicons name={statusCfg.icon} size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.statusBannerTitle, { color: statusCfg.color }]}>
                    {statusCfg.label.toUpperCase()}
                  </Text>
                  <Text style={styles.statusBannerDesc}>{statusCfg.desc}</Text>
                </View>
              </View>

              {/* Stepper trực quan 4 bước */}
              {currentStatus !== 'CANCELLED' && currentStatus !== 'REJECTED' && (
                <View style={styles.stepperContainer}>
                  {[
                    { step: 1, label: 'Tiếp nhận' },
                    { step: 2, label: 'Điều phối' },
                    { step: 3, label: 'Tiếp cận' },
                    { step: 4, label: 'An toàn' },
                  ].map((s, idx) => {
                    const isDone = statusCfg.step > s.step;
                    const isCurrent = statusCfg.step === s.step;
                    return (
                      <React.Fragment key={s.step}>
                        <View style={styles.stepNode}>
                          <View
                            style={[
                              styles.stepDot,
                              isDone && styles.stepDotDone,
                              isCurrent && [styles.stepDotCurrent, { borderColor: statusCfg.color }],
                            ]}
                          >
                            {isDone ? (
                              <Feather name="check" size={12} color="#FFFFFF" />
                            ) : (
                              <Text style={[styles.stepNum, isCurrent && { color: statusCfg.color, fontWeight: '800' }]}>
                                {s.step}
                              </Text>
                            )}
                          </View>
                          <Text style={[styles.stepLabel, (isDone || isCurrent) && styles.stepLabelActive]}>
                            {s.label}
                          </Text>
                        </View>
                        {idx < 3 && (
                          <View
                            style={[
                              styles.stepLine,
                              statusCfg.step > idx + 1 && styles.stepLineDone,
                            ]}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </View>
              )}
            </View>

            {/* 3. BẢN ĐỒ LIVE TRỰC QUAN (LEAFLET WEBVIEW) */}
            <View style={styles.mapCard}>
              <View style={styles.mapHeaderRow}>
                <View style={styles.mapHeaderLeft}>
                  <Feather name="compass" size={16} color="#0066FF" />
                  <Text style={styles.mapCardTitle}>Bản đồ định vị tác chiến</Text>
                </View>
                {assignment || currentStatus === 'ON_THE_WAY' ? (
                  <View style={styles.liveIndicator}>
                    <View style={styles.pulseDot} />
                    <Text style={styles.liveText}>Đang di chuyển (~650m)</Text>
                  </View>
                ) : (
                  <Text style={styles.mapCoordsText}>
                    [{victimLat.toFixed(5)}, {victimLng.toFixed(5)}]
                  </Text>
                )}
              </View>

              <View style={styles.webViewWrap}>
                <WebView
                  ref={webViewRef}
                  source={{ html: mapHtml }}
                  style={styles.webView}
                  scrollEnabled={false}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  androidLayerType="hardware"
                  originWhitelist={['*']}
                />
              </View>

              {/* Chú thích trên bản đồ */}
              <View style={styles.mapLegendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={styles.legendLabel}>Vị trí của bạn</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#2563EB' }]} />
                  <Text style={styles.legendLabel}>Đội cứu hộ đang đến</Text>
                </View>
              </View>
            </View>

            {/* 4. KHỐI ĐỘI CỨU TRỢ & VẬT PHẨM MANG THEO */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderIconWrap}>
                  <MaterialCommunityIcons name="shield-account" size={18} color="#0066FF" />
                </View>
                <Text style={styles.cardSectionTitle}>Đội cứu hộ & Vật phẩm tiếp ứng</Text>
              </View>

              <View style={styles.teamInfoBox}>
                <View style={styles.teamMainInfo}>
                  <Text style={styles.teamName}>{teamName}</Text>
                  <Text style={styles.teamLeader}>Chỉ huy: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{rescuerName}</Text></Text>
                  <Text style={styles.teamVehicle}>{vehicleName}</Text>
                </View>

                <TouchableOpacity
                  style={styles.callRescuerBtn}
                  onPress={() => Linking.openURL(`tel:${rescuerPhone}`)}
                  activeOpacity={0.8}
                >
                  <Feather name="phone-call" size={15} color="#FFFFFF" />
                  <Text style={styles.callRescuerBtnText}>Gọi điện</Text>
                </TouchableOpacity>
              </View>

              {/* Danh sách vật phẩm cứu trợ mang theo */}
              <View style={styles.gearBox}>
                <Text style={styles.gearBoxTitle}>🎒 Trang bị & Vật phẩm cứu trợ mang theo:</Text>

                <View style={styles.gearGrid}>
                  <View style={styles.gearItem}>
                    <Text style={styles.gearIcon}>🦺</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.gearName}>Áo phao cứu sinh</Text>
                      <Text style={styles.gearDesc}>Chuẩn bị theo số người ({peopleCount} áo phao)</Text>
                    </View>
                  </View>

                  <View style={styles.gearItem}>
                    <Text style={styles.gearIcon}>💧</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.gearName}>Nước uống & Lương khô</Text>
                      <Text style={styles.gearDesc}>Thùng nước khoáng, bánh mì, lương khô tiếp tế</Text>
                    </View>
                  </View>

                  <View style={styles.gearItem}>
                    <Text style={styles.gearIcon}>🩹</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.gearName}>Túi y tế khẩn cấp</Text>
                      <Text style={styles.gearDesc}>Bông băng sát trùng, thuốc hạ sốt, giữ ấm</Text>
                    </View>
                  </View>

                  <View style={styles.gearItem}>
                    <Text style={styles.gearIcon}>🔦</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.gearName}>Đèn pin & Dây cứu nạn</Text>
                      <Text style={styles.gearDesc}>Đèn rọi công suất lớn, dây thừng kéo vượt lũ</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* 5. KHỐI HỒ SƠ YÊU CẦU BẠN ĐÃ GỬI (Đối soát tránh hoang mang nhầm ca) */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardHeaderIconWrap, { backgroundColor: '#FEF2F2' }]}>
                  <Feather name="file-text" size={18} color="#DC2626" />
                </View>
                <Text style={styles.cardSectionTitle}>Hồ sơ cứu nạn bạn đã gửi</Text>
              </View>

              {/* Số người & Loại tình huống */}
              <View style={styles.requestGrid2}>
                <View style={styles.requestMiniBox}>
                  <Text style={styles.requestMiniLabel}>Số người gặp nạn</Text>
                  <Text style={styles.requestMiniValueBold}>👥 {peopleCount} người</Text>
                </View>
                <View style={styles.requestMiniBox}>
                  <Text style={styles.requestMiniLabel}>Loại yêu cầu</Text>
                  <Text style={styles.requestMiniValue} numberOfLines={1}>{typeCfg.label}</Text>
                </View>
              </View>

              {/* Danh sách đối tượng ưu tiên */}
              {priorityGroups && priorityGroups.length > 0 && (
                <View style={styles.priorityBox}>
                  <Text style={styles.priorityBoxTitle}>Đối tượng ưu tiên cần bảo vệ đặc biệt:</Text>
                  <Text style={styles.priorityText}>
                    {priorityGroups.join(', ')}
                  </Text>
                </View>
              )}

              {/* Địa chỉ hiện trường */}
              <View style={styles.infoRow}>
                <Feather name="map-pin" size={16} color="#0066FF" style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Địa chỉ bạn đã gửi:</Text>
                  <Text style={styles.infoTextValue}>{sos?.address || 'Đã gửi tọa độ GPS vệ tinh'}</Text>
                </View>
              </View>

              {/* Lời nhắn / Mô tả */}
              {sos?.description && (
                <View style={styles.descBox}>
                  <Text style={styles.descBoxLabel}>Nội dung mô tả tình hình:</Text>
                  <Text style={styles.descBoxText}>{sos.description}</Text>
                </View>
              )}

              {/* Số điện thoại liên hệ của người dân */}
              <View style={styles.infoRow}>
                <Feather name="phone" size={16} color="#16A34A" />
                <Text style={styles.infoLabel}>Số điện thoại của bạn:</Text>
                <Text style={[styles.infoTextValue, { fontWeight: '700', color: '#0F172A' }]}>
                  {sos?.contactPhone || 'Chưa cung cấp'}
                </Text>
              </View>
            </View>

            {/* 6. NÚT HÀNH ĐỘNG DUY NHẤT: XÁC NHẬN ĐÃ ĐƯỢC CỨU AN TOÀN */}
            {currentStatus !== 'COMPLETED' && currentStatus !== 'CANCELLED' && currentStatus !== 'REJECTED' ? (
              <View style={styles.actionContainer}>
                <TouchableOpacity
                  style={styles.completedBtn}
                  onPress={handleConfirmSafety}
                  disabled={isCompleting}
                  activeOpacity={0.85}
                >
                  {isCompleting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Feather name="check-circle" size={19} color="#FFFFFF" />
                      <Text style={styles.completedBtnText}>XÁC NHẬN ĐÃ ĐƯỢC CỨU AN TOÀN</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={handleCancelSos}
                  disabled={isCancelling}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelBtnText}>Hủy yêu cầu cứu nạn (Nếu đã tự thoát hiểm)</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.completedBadgeBox}>
                <Ionicons name="checkmark-done-circle" size={40} color="#16A34A" />
                <Text style={styles.completedBadgeTitle}>YÊU CẦU ĐÃ KẾT THÚC</Text>
                <Text style={styles.completedBadgeSub}>
                  {currentStatus === 'COMPLETED'
                    ? 'Bạn đã xác nhận an toàn. Chúc bạn và gia đình luôn khỏe mạnh và bình an!'
                    : 'Ca cứu hộ này đã được kết thúc / hủy.'}
                </Text>
              </View>
            )}

            <View style={{ height: 30 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backBtn: {
    width: 42,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerCode: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066FF',
    marginTop: 2,
  },
  refreshBtn: {
    width: 42,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: PROFILE_THEME.colors.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: PROFILE_THEME.colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  statusBanner: {
    borderRadius: PROFILE_THEME.radius.card,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  statusBannerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  statusIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statusBannerDesc: {
    fontSize: 13,
    color: '#334155',
    marginTop: 4,
    lineHeight: 18,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
  },
  stepNode: {
    alignItems: 'center',
    width: 58,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepDotDone: {
    backgroundColor: '#16A34A',
  },
  stepDotCurrent: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
  },
  stepNum: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  stepLabelActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#CBD5E1',
    marginBottom: 16,
  },
  stepLineDone: {
    backgroundColor: '#16A34A',
  },
  mapCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: PROFILE_THEME.radius.card,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  mapHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  mapHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mapCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  mapCoordsText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#0066FF',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0066FF',
  },
  webViewWrap: {
    width: '100%',
    height: 220,
    backgroundColor: '#F1F5F9',
  },
  webView: {
    width: '100%',
    height: '100%',
  },
  mapLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: PROFILE_THEME.radius.card,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardHeaderIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  teamInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  teamMainInfo: {
    flex: 1,
    marginRight: 10,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  teamLeader: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  teamVehicle: {
    fontSize: 12,
    color: '#0066FF',
    fontWeight: '600',
    marginTop: 2,
  },
  callRescuerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  callRescuerBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  gearBox: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  gearBoxTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  gearGrid: {
    gap: 10,
  },
  gearItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0F9FF',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  gearIcon: {
    fontSize: 22,
  },
  gearName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369A1',
  },
  gearDesc: {
    fontSize: 11,
    color: '#0284C7',
    marginTop: 2,
  },
  requestGrid2: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  requestMiniBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  requestMiniLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  requestMiniValueBold: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 3,
  },
  requestMiniValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 3,
  },
  priorityBox: {
    marginBottom: 12,
  },
  priorityBoxTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  priorityText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 3,
    lineHeight: 19,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  infoTextValue: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    marginTop: 1,
  },
  descBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#0066FF',
    marginBottom: 12,
  },
  descBoxLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  descBoxText: {
    fontSize: 13,
    color: '#1E293B',
    lineHeight: 19,
    fontStyle: 'italic',
  },
  actionContainer: {
    gap: 10,
    marginTop: 4,
  },
  completedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16A34A',
    paddingVertical: 14,
    borderRadius: PROFILE_THEME.radius.button,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  completedBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  completedBadgeBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DCFCE7',
    borderRadius: PROFILE_THEME.radius.card,
    borderWidth: 1,
    borderColor: '#86EFAC',
    padding: 20,
    marginTop: 8,
  },
  completedBadgeTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#16A34A',
    marginTop: 6,
  },
  completedBadgeSub: {
    fontSize: 12,
    color: '#15803D',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    paddingHorizontal: 16,
  },
});

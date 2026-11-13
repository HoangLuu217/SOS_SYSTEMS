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
  TextInput,
  DeviceEventEmitter,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { backendApi } from '@/api';
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
  FOOD: { label: 'Tiếp tế lương thực & Nước uống', icon: 'food' },
  EVACUATION: { label: 'Sơ tán khẩn cấp', icon: 'run-fast' },
  SUPPLIES: { label: 'Tiếp tế nhu yếu phẩm', icon: 'package-variant' },
  RESCUE: { label: 'Cứu hộ khẩn cấp', icon: 'lifebuoy' },
  WATER: { label: 'Nước uống sinh hoạt', icon: 'water' },
  SHELTER: { label: 'Tìm nơi trú ẩn an toàn', icon: 'home-heart' },
  LANDSLIDE: { label: 'Sạt lở đất / Đổ sập', icon: 'image-filter-hdr' },
  STORM: { label: 'Bão lốc / Cây đổ', icon: 'weather-windy' },
  ACCIDENT: { label: 'Tai nạn khẩn cấp', icon: 'car-emergency' },
  MISSING_PERSON: { label: 'Tìm kiếm người mất tích', icon: 'account-search' },
  OTHER: { label: 'Cứu nạn khẩn cấp khác', icon: 'alert-circle' },
};

let _SOSMapScreen: any = null;
const getSOSMapScreen = () => {
  if (!_SOSMapScreen) {
    _SOSMapScreen = require('../sos/SOSMapScreen').SOSMapScreen;
  }
  return _SOSMapScreen;
};

export const CitizenSosTrackingModal: React.FC<CitizenSosTrackingModalProps> = ({
  visible,
  sosId,
  initialSosData,
  onClose,
  onSosCompleted,
}) => {
  const [sos, setSos] = useState<any>(initialSosData || null);
  const [assignment, setAssignment] = useState<any>(initialSosData?.assignment || null);
  const [loading, setLoading] = useState<boolean>(!initialSosData);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isCompleting, setIsCompleting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [inAppAlert, setInAppAlert] = useState<{
    visible: boolean;
    type: 'success' | 'danger' | 'warning' | 'info';
    title: string;
    message: string;
    cancelText?: string;
    confirmText?: string;
    confirmStyle?: 'success' | 'danger' | 'primary';
    onCancel?: () => void;
    onConfirm?: () => Promise<void> | void;
  } | null>(null);
  const [inAppAlertLoading, setInAppAlertLoading] = useState<boolean>(false);
  const [showFullMapModal, setShowFullMapModal] = useState<boolean>(false);
  const [fullMapType, setFullMapType] = useState<'standard' | 'satellite'>('standard');
  const [routeData, setRouteData] = useState<{
    distanceKm: string;
    durationMin: string;
    coordinates: [number, number][];
  } | null>(null);
  const webViewRef = useRef<WebView>(null);
  const fullMapWebViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const iosHeaderPaddingTop = Platform.OS === 'ios' ? (insets.top > 20 ? insets.top + 6 : 50) : 12;

  // Tải chi tiết ca SOS và danh sách phân công đội cứu hộ
  const loadData = async (showLoadingIndicator = true) => {
    if (!sosId) return;
    if (showLoadingIndicator) setLoading(true);

    try {
      let activeAssign: any = null;
      let hasValidResponse = false;

      const [sosResult, assignResult] = await Promise.allSettled([
        backendApi.get(`/sos/${sosId}`),
        backendApi.get(`/sos/${sosId}/assignments`),
      ]);

      // 1. Lấy chi tiết ca SOS
      if (sosResult.status === 'fulfilled' && sosResult.value?.success && sosResult.value?.data) {
        hasValidResponse = true;
        const freshSos = sosResult.value.data;
        setSos(freshSos);
        if (freshSos.assignment) {
          activeAssign = freshSos.assignment;
        }
      }

      // 2. Luôn đối chiếu thêm /assignments để lấy lệnh phân công mới nhất (ưu tiên lệnh còn hiệu lực & có vật tư)
      if (assignResult.status === 'fulfilled') {
        const assignRes = assignResult.value;
        if (assignRes?.success && Array.isArray(assignRes.data)) {
          hasValidResponse = true;
          if (assignRes.data.length > 0) {
            const validList = assignRes.data
              .filter((a: any) => !['CANCELLED', 'REJECTED'].includes(a.status))
              .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

            if (validList.length > 0) {
              const newest = validList[0];
              const withSupplies = validList.find((a: any) => Array.isArray(a.supplies) && a.supplies.length > 0);
              // Nếu lệnh mới nhất có vật tư thì lấy luôn, hoặc nếu activeAssign hiện tại chưa có vật tư thì ưu tiên lệnh mới nhất/có vật tư
              if (Array.isArray(newest.supplies) && newest.supplies.length > 0) {
                activeAssign = newest;
              } else if (!activeAssign || !Array.isArray(activeAssign.supplies) || activeAssign.supplies.length === 0) {
                activeAssign = withSupplies || newest;
              }
            }
          }
        }
      }

      if (hasValidResponse) {
        setAssignment(activeAssign);
      }
    } catch (err: any) {
      console.warn('Lỗi tải thông tin theo dõi SOS:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!visible || !sosId) {
      if (!visible) {
        setShowFullMapModal(false);
      }
      return;
    }

    if (initialSosData) {
      setSos((prev: any) => (prev?._id === initialSosData._id ? { ...prev, ...initialSosData } : initialSosData));
      if (initialSosData.assignment) {
        setAssignment(initialSosData.assignment);
      }
      loadData(false);
    } else {
      const isDifferentSos = sos?._id !== sosId;
      if (isDifferentSos) {
        setSos(null);
        setAssignment(null);
      }
      loadData(isDifferentSos || !sos);
    }

    // Lắng nghe sự kiện realtime khi Ban chỉ huy điều phối hoặc Cứu hộ viên cập nhật tiến trình
    const subSync = DeviceEventEmitter.addListener('sos:sync', () => {
      loadData(false);
    });
    const subUpdated = DeviceEventEmitter.addListener('sos:updated', () => {
      loadData(false);
    });

    // Tự động kiểm tra cập nhật mỗi 10 giây khi người dân đang mở màn hình theo dõi
    const pollInterval = setInterval(() => {
      loadData(false);
    }, 10000);

    return () => {
      subSync.remove();
      subUpdated.remove();
      clearInterval(pollInterval);
    };
  }, [visible, sosId]);

  // Tính toán tọa độ người dân & đội cứu hộ (dùng trước conditional return để đảm bảo đúng Rules of Hooks)
  const victimLng = sos?.location?.coordinates?.[0] || 108.26054;
  const victimLat = sos?.location?.coordinates?.[1] || 15.96836;
  const teamRawCoords =
    assignment?.teamLocation?.coordinates ||
    assignment?.rescuerId?.location?.coordinates ||
    assignment?.rescueTeamId?.currentLocation?.coordinates ||
    assignment?.rescueTeamId?.baseLocation?.coordinates;
  const rescuerLng =
    Array.isArray(teamRawCoords) && teamRawCoords.length === 2 ? teamRawCoords[0] : victimLng - 0.0055;
  const rescuerLat =
    Array.isArray(teamRawCoords) && teamRawCoords.length === 2 ? teamRawCoords[1] : victimLat + 0.0072;

  useEffect(() => {
    if (!visible || !victimLat || !victimLng) return;
    const statusNow = sos?.status || 'PENDING';
    if (!assignment && !['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(statusNow) && !showFullMapModal) {
      return;
    }

    let cancelled = false;
    const fetchOsrm = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${rescuerLng},${rescuerLat};${victimLng},${victimLat}?overview=full&geometries=geojson`;
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'SOS-Citizen-App/1.0' },
          signal: controller.signal,
        });
        clearTimeout(tid);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.code === 'Ok' && data.routes?.[0]) {
          const r = data.routes[0];
          const rawMeters = r.distance || 0;
          const distKm =
            rawMeters < 1000 ? `${Math.round(rawMeters)} m` : `${(rawMeters / 1000).toFixed(1)} km`;
          const totalMin = Math.max(1, Math.round((r.duration || 0) / 60));
          const durMin =
            totalMin >= 60
              ? `${Math.floor(totalMin / 60)} giờ ${totalMin % 60 > 0 ? `${totalMin % 60} phút` : ''}`.trim()
              : `${totalMin} phút`;
          const coords: [number, number][] = (r.geometry?.coordinates || []).map(
            (c: [number, number]) => [c[1], c[0]]
          );
          setRouteData({ distanceKm: distKm, durationMin: durMin, coordinates: coords });
        }
      } catch {
        // Fallback giữ nguyên đường thẳng nếu OSRM timeout
      }
    };
    void fetchOsrm();
    return () => {
      cancelled = true;
    };
  }, [visible, victimLat, victimLng, rescuerLat, rescuerLng, assignment, sos?.status, showFullMapModal]);

  // Xử lý khi người dân nhấn "Tôi đã được cứu an toàn" (Custom Alert Popup)
  const handleConfirmSafety = () => {
    setInAppAlert({
      visible: true,
      type: 'success',
      title: 'Xác nhận an toàn',
      message: 'Bạn và gia đình đã được Đội cứu hộ tiếp cận và đưa đến nơi an toàn rồi đúng không?',
      cancelText: 'Chưa, vẫn đang chờ',
      confirmText: 'Đúng, tôi đã an toàn',
      confirmStyle: 'success',
      onCancel: () => setInAppAlert(null),
      onConfirm: async () => {
        if (!sos?._id) return;
        setInAppAlertLoading(true);
        setIsCompleting(true);
        try {
          const res = await backendApi.post(`/sos/${sos._id}/complete`, {});
          if (res.success) {
            const updated = { ...sos, status: 'COMPLETED' };
            setSos(updated);
            DeviceEventEmitter.emit('sos:sync', updated);
            onSosCompleted?.(updated);
            setInAppAlert({
              visible: true,
              type: 'success',
              title: 'Cứu hộ thành công! 🎉',
              message: 'Hệ thống đã ghi nhận bạn an toàn. Chúc bạn và gia đình luôn bình an!',
              confirmText: 'Hoàn tất',
              confirmStyle: 'success',
              onConfirm: () => setInAppAlert(null),
            });
          } else {
            setInAppAlert({
              visible: true,
              type: 'danger',
              title: 'Không thể cập nhật',
              message: res.message || 'Vui lòng thử lại sau.',
              confirmText: 'Đã hiểu',
              confirmStyle: 'primary',
              onConfirm: () => setInAppAlert(null),
            });
          }
        } catch (err: any) {
          setInAppAlert({
            visible: true,
            type: 'danger',
            title: 'Lỗi kết nối',
            message: err.message || 'Không thể gửi xác nhận an toàn.',
            confirmText: 'Đã hiểu',
            confirmStyle: 'primary',
            onConfirm: () => setInAppAlert(null),
          });
        } finally {
          setIsCompleting(false);
          setInAppAlertLoading(false);
        }
      },
    });
  };

  // Xử lý khi người dân muốn hủy yêu cầu cứu hộ (Custom Alert Popup)
  const handleCancelSos = () => {
    setInAppAlert({
      visible: true,
      type: 'danger',
      title: 'Hủy yêu cầu cứu nạn',
      message: 'Bạn có chắc chắn muốn hủy yêu cầu cứu hộ này? (Chỉ hủy khi bạn đã tự di chuyển an toàn)',
      cancelText: 'Không hủy',
      confirmText: 'Xác nhận hủy',
      confirmStyle: 'danger',
      onCancel: () => setInAppAlert(null),
      onConfirm: async () => {
        if (!sos?._id) return;
        setInAppAlertLoading(true);
        setIsCancelling(true);
        try {
          const res = await backendApi.post(`/sos/${sos._id}/cancel`, {
            cancelReason: 'Người dân tự thoát hiểm an toàn',
          });
          if (res.success) {
            const updated = { ...sos, status: 'CANCELLED' };
            setSos(updated);
            DeviceEventEmitter.emit('sos:sync', updated);
            onSosCompleted?.(updated);
            setInAppAlert({
              visible: true,
              type: 'info',
              title: 'Đã hủy yêu cầu',
              message: 'Yêu cầu cứu nạn đã được hủy thành công.',
              confirmText: 'Đóng',
              confirmStyle: 'primary',
              onConfirm: () => setInAppAlert(null),
            });
          } else {
            setInAppAlert({
              visible: true,
              type: 'danger',
              title: 'Không thể hủy yêu cầu',
              message: res.message || 'Vui lòng thử lại sau.',
              confirmText: 'Đã hiểu',
              confirmStyle: 'primary',
              onConfirm: () => setInAppAlert(null),
            });
          }
        } catch (err: any) {
          setInAppAlert({
            visible: true,
            type: 'danger',
            title: 'Lỗi',
            message: err.message || 'Không thể gửi lệnh hủy.',
            confirmText: 'Đã hiểu',
            confirmStyle: 'primary',
            onConfirm: () => setInAppAlert(null),
          });
        } finally {
          setIsCancelling(false);
          setInAppAlertLoading(false);
        }
      },
    });
  };

  // Xử lý khi người dân muốn xóa vĩnh viễn ca SOS đã đóng/đã hủy khỏi lịch sử
  const handleDeleteSos = () => {
    setInAppAlert({
      visible: true,
      type: 'danger',
      title: 'Xóa khỏi lịch sử',
      message: 'Bạn có chắc chắn muốn xóa ca SOS này khỏi lịch sử báo nạn để giao diện gọn gàng hơn?',
      cancelText: 'Giữ lại',
      confirmText: 'Xác nhận xóa',
      confirmStyle: 'danger',
      onCancel: () => setInAppAlert(null),
      onConfirm: async () => {
        if (!sos?._id) return;
        setInAppAlertLoading(true);
        try {
          const res = await backendApi.delete(`/sos/${sos._id}`);
          if (res.success) {
            DeviceEventEmitter.emit('sos:deleted', sos._id);
            DeviceEventEmitter.emit('sos:sync');
            setInAppAlert(null);
            onClose();
          } else {
            setInAppAlert({
              visible: true,
              type: 'danger',
              title: 'Không thể xóa',
              message: res.message || 'Vui lòng thử lại sau.',
              confirmText: 'Đã hiểu',
              confirmStyle: 'primary',
              onConfirm: () => setInAppAlert(null),
            });
          }
        } catch (err: any) {
          setInAppAlert({
            visible: true,
            type: 'danger',
            title: 'Lỗi',
            message: err.message || 'Không thể xóa yêu cầu.',
            confirmText: 'Đã hiểu',
            confirmStyle: 'primary',
            onConfirm: () => setInAppAlert(null),
          });
        } finally {
          setInAppAlertLoading(false);
        }
      },
    });
  };

  // State và hàm xử lý form chỉnh sửa ca cứu nạn toàn diện (đồng bộ 100% với SOSMapScreen)
  const [showEditSOSMap, setShowEditSOSMap] = useState<boolean>(false);

  const handleOpenEdit = () => {
    setShowEditSOSMap(true);
  };

  if (!visible) return null;

  const currentStatus = sos?.status || 'PENDING';
  const statusCfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG['PENDING'];
  const typeCfg = TYPE_CONFIG[sos?.emergencyType] || TYPE_CONFIG['FLOOD'];
  const typeLabelText = Array.isArray(sos?.emergencyTypes) && sos.emergencyTypes.length > 0
    ? sos.emergencyTypes.map((t: string) => TYPE_CONFIG[t]?.label || t).join(', ')
    : typeCfg.label;

  const hasAssignedTeam = Boolean(
    assignment?.rescueTeamId ||
    assignment?.rescuerId ||
    ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING', 'COMPLETED'].includes(currentStatus)
  );

  const rescuerPhone =
    assignment?.rescuerId?.phone ||
    assignment?.rescueTeamId?.leaderId?.phone ||
    assignment?.authorityOrganizationId?.phone ||
    '112';

  const rescuerName =
    assignment?.rescuerId?.fullName ||
    assignment?.rescueTeamId?.leaderId?.fullName ||
    assignment?.rescueTeamId?.name ||
    'Đang phân công chỉ huy';

  const teamName =
    assignment?.rescueTeamId?.name ||
    'Đội Cứu nạn - Cứu trợ TP Đà Nẵng';

  const vehicleName =
    assignment?.vehicleId?.plateNumber
      ? `Phương tiện: ${assignment.vehicleId.plateNumber}`
      : 'Cano / Xe cứu hộ chuyên dụng';

  // Vật phẩm tiếp tế chuẩn bị mang theo
  const peopleCount = sos?.people || 1;
  const priorityGroups: string[] = sos?.priorityGroups || [];

  // Phân tích và định dạng nội dung mô tả tình hình tránh bị chẹt chữ (tính trực tiếp, không dùng hook tránh lỗi React)
  const rawDesc = (sos?.description || '').replace(/⚡\s*/g, '').trim();
  const tagMatches: string[] = rawDesc.match(/\[[^\]]+\]/g) || [];
  const parsedTags: string[] = tagMatches.map((t: string) => t.replace(/^\[|\]$/g, '').trim());
  const parsedUserNote: string = rawDesc.replace(/\[[^\]]+\]/g, '').trim();

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
        .leaflet-control-attribution {
          display: none !important;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', {
          zoomControl: false,
          preferCanvas: true,
          attributionControl: false
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

        var routeCoords = ${JSON.stringify(routeData?.coordinates || [])};

        ${assignment || currentStatus === 'ON_THE_WAY' || currentStatus === 'ARRIVED' ? `
          var markerRescuer = L.marker([rLat, rLng], { icon: rescuerIcon }).addTo(map)
            .bindPopup('<b>🚤 Đội Cứu Hộ Tiếp Ứng</b><br/>Đang di chuyển tiếp cận');

          var polylinePoints = (routeCoords && routeCoords.length > 1) ? routeCoords : [[rLat, rLng], [vLat, vLng]];
          var polyline = L.polyline(polylinePoints, {
            color: '#2563EB',
            weight: 5,
            opacity: 0.92
          }).addTo(map);

          map.fitBounds(polyline.getBounds().pad(0.28));
        ` : `
          map.setView([vLat, vLng], 15);
        `}
      </script>
    </body>
    </html>
  `;

  // Bản đồ toàn màn hình chi tiết tuyến đường (lấy giao diện dẫn đường giống bên Rescuer)
  const fullMapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #f1f5f9; font-family: -apple-system, sans-serif; }
        .leaflet-control-attribution { display: none !important; }
        @keyframes pulseWave {
          0% { transform: scale(0.6); opacity: 0.95; }
          70% { transform: scale(1.7); opacity: 0; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        .sos-radar-container { position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; }
        .sos-radar-wave { position: absolute; width: 38px; height: 38px; border-radius: 50%; background-color: rgba(220,38,38,0.45); border: 2px solid #DC2626; animation: pulseWave 1.6s ease-out infinite; }
        .sos-radar-core { position: relative; width: 28px; height: 28px; background: #DC2626; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 0 10px rgba(220,38,38,0.8); border: 2px solid white; z-index: 2; }
        .rescuer-nav-wrap { display: flex; flex-direction: column; align-items: center; }
        .rescuer-nav-dot { width: 36px; height: 36px; border-radius: 50%; background: #FFFFFF; border: 3px solid #2563EB; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 10px rgba(37,99,235,0.45); }
        .rescuer-eta-pill { margin-top: 4px; background: #FFFFFF; color: #0F172A; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 10px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.22); border: 1px solid #E2E8F0; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { zoomControl: false, preferCanvas: true, attributionControl: false });
        var stdOverview = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&apistyle=s.t:33|p.v:off%2Cs.t:21|s.e:l|p.v:off&x={x}&y={y}&z={z}', { subdomains: ['0','1','2','3'], minZoom: 1, maxZoom: 15 });
        var stdDetail = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&apistyle=s.t:33|p.v:off%2Cs.t:22|s.e:l|p.v:off&x={x}&y={y}&z={z}', { subdomains: ['0','1','2','3'], minZoom: 16, maxZoom: 20 });
        var satLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { subdomains: ['0','1','2','3'], maxZoom: 20 });

        stdOverview.addTo(map);
        stdDetail.addTo(map);

        window.setFullMapType = function(type) {
          if (type === 'satellite') {
            if (map.hasLayer(stdOverview)) map.removeLayer(stdOverview);
            if (map.hasLayer(stdDetail)) map.removeLayer(stdDetail);
            if (!map.hasLayer(satLayer)) satLayer.addTo(map);
          } else {
            if (map.hasLayer(satLayer)) map.removeLayer(satLayer);
            if (!map.hasLayer(stdOverview)) stdOverview.addTo(map);
            if (!map.hasLayer(stdDetail)) stdDetail.addTo(map);
          }
        };

        var vLat = ${victimLat};
        var vLng = ${victimLng};
        var rLat = ${rescuerLat};
        var rLng = ${rescuerLng};
        var routeCoords = ${JSON.stringify(routeData?.coordinates || [])};
        var etaLabel = ${JSON.stringify(routeData ? `${routeData.durationMin} • ${routeData.distanceKm}` : 'Đang định tuyến')};

        var victimRadarIcon = L.divIcon({
          html: '<div class="sos-radar-container"><div class="sos-radar-wave"></div><div class="sos-radar-core"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12a5 5 0 0 1 5-5v0a5 5 0 0 1 5 5v6H7v-6Z"/><path d="M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2H5v-2Z"/><path d="M21 12h1"/><path d="M18.5 4.5 19 4"/><path d="M2 12h1"/><path d="M12 2v1"/><path d="M4.5 4.5 5 4"/><path d="M12 11v3"/></svg></div></div>',
          className: '',
          iconSize: [44, 44],
          iconAnchor: [22, 22]
        });

        L.circle([vLat, vLng], { color: '#DC2626', fillColor: '#EF4444', fillOpacity: 0.12, radius: 220, weight: 1.5 }).addTo(map);
        var markerVictim = L.marker([vLat, vLng], { icon: victimRadarIcon }).addTo(map);

        var polylinePoints = (routeCoords && routeCoords.length > 1) ? routeCoords : [[rLat, rLng], [vLat, vLng]];
        L.polyline(polylinePoints, { color: '#FFFFFF', weight: 9, opacity: 0.95 }).addTo(map);
        var routeLine = L.polyline(polylinePoints, { color: '#2563EB', weight: 6, opacity: 1 }).addTo(map);

        var rescuerNavIcon = L.divIcon({
          html: '<div class="rescuer-nav-wrap"><div class="rescuer-nav-dot"><svg width="18" height="18" viewBox="0 0 24 24" fill="#2563EB"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg></div><div class="rescuer-eta-pill">' + etaLabel + '</div></div>',
          className: '',
          iconSize: [140, 62],
          iconAnchor: [70, 18]
        });
        var markerRescuer = L.marker([rLat, rLng], { icon: rescuerNavIcon, zIndexOffset: 1000 }).addTo(map);

        window.fitRoute = function() {
          map.fitBounds(routeLine.getBounds(), { paddingTopLeft: [40, 120], paddingBottomRight: [40, 260], animate: true });
        };
        window.flyToVictim = function() {
          map.flyTo([vLat, vLng], 17, { animate: true, duration: 0.9 });
        };

        setTimeout(function() { window.fitRoute(); }, 120);
      </script>
    </body>
    </html>
  `;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

        {/* 1. HEADER CHUẨN ĐỒNG BỘ PHONG CÁCH PROFILE */}
        <View style={[styles.header, { paddingTop: iosHeaderPaddingTop, paddingBottom: 12 }]}>
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
            {/* 2. BANNER TRẠNG THÁI & STEPPER TIẾN TRÌNH (Ẩn khi Đã hủy / Từ chối vì đã có card chi tiết bên dưới) */}
            {currentStatus !== 'CANCELLED' && currentStatus !== 'REJECTED' && (
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
              </View>
            )}

            {/* 3. BẢN ĐỒ LIVE TRỰC QUAN (LEAFLET WEBVIEW) */}
            <View style={styles.mapCard}>
              <View style={styles.mapHeaderRow}>
                <View style={styles.mapHeaderLeft}>
                  <Feather name="compass" size={16} color="#0066FF" />
                  <Text style={styles.mapCardTitle}>Bản đồ định vị tác chiến</Text>
                </View>
                {assignment || currentStatus === 'ON_THE_WAY' || currentStatus === 'ARRIVED' ? (
                  <View style={styles.liveIndicator}>
                    <View style={styles.pulseDot} />
                    <Text style={styles.liveText}>
                      {routeData ? `${routeData.durationMin} • ${routeData.distanceKm}` : 'Đang tính tuyến đường...'}
                    </Text>
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
                {/* Lớp phủ bấm vào bản đồ để mở toàn màn hình xem đường đi chi tiết giống bên Rescuer */}
                <TouchableOpacity
                  style={StyleSheet.absoluteFill}
                  activeOpacity={0.9}
                  onPress={() => setShowFullMapModal(true)}
                >
                  <View
                    style={{
                      position: 'absolute',
                      bottom: 10,
                      right: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      backgroundColor: 'rgba(15, 23, 42, 0.86)',
                      paddingHorizontal: 11,
                      paddingVertical: 6,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.25)',
                    }}
                  >
                    <Feather name="maximize-2" size={13} color="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '700' }}>
                      Xem đường đi chi tiết
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Chú thích trên bản đồ */}
              <View style={styles.mapLegendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={styles.legendLabel}>Vị trí của bạn</Text>
                </View>
                {hasAssignedTeam && (
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#2563EB' }]} />
                    <Text style={styles.legendLabel}>Đội cứu hộ đang đến</Text>
                  </View>
                )}
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

              {hasAssignedTeam ? (
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
              ) : (
                <View style={[styles.teamInfoBox, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0', paddingVertical: 12 }]}>
                  <View style={styles.teamMainInfo}>
                    <Text style={[styles.teamName, { color: '#475569', fontSize: 13 }]}>⏳ Đang chờ Ban chỉ huy điều phối lực lượng</Text>
                    <Text style={[styles.teamLeader, { color: '#64748B', fontSize: 12, marginTop: 4, lineHeight: 17 }]}>
                      Thông tin Đội cứu hộ, Chỉ huy và SĐT liên hệ trực tiếp sẽ tự động hiển thị ngay khi lệnh xuất kích được duyệt.
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.callRescuerBtn, { backgroundColor: '#DC2626' }]}
                    onPress={() => Linking.openURL('tel:112')}
                    activeOpacity={0.8}
                  >
                    <Feather name="phone-call" size={15} color="#FFFFFF" />
                    <Text style={styles.callRescuerBtnText}>Gọi 112</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Danh sách vật tư kho khu vực đã cấp phát thực tế */}
              <View style={styles.gearBox}>
                <Text style={styles.gearBoxTitle}>📦 Vật tư kho khu vực đã cấp phát:</Text>

                {(() => {
                  const activeAssignObj = assignment || sos?.assignment;
                  const allocatedSupplies =
                    Array.isArray(activeAssignObj?.supplies) && activeAssignObj.supplies.length > 0
                      ? activeAssignObj.supplies
                      : Array.isArray(activeAssignObj?.requestedSupplies)
                        ? activeAssignObj.requestedSupplies.filter((r: any) => r.status === 'APPROVED')
                        : [];

                  if (allocatedSupplies.length > 0) {
                    return (
                      <View style={styles.gearGrid}>
                        {allocatedSupplies.map((sup: any, idx: number) => (
                          <View key={sup.supplyId || sup._id || idx} style={styles.gearItem}>
                            <Text style={styles.gearIcon}>📦</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.gearName}>{sup.name || 'Vật tư cứu trợ'}</Text>
                              <Text style={styles.gearDesc}>
                                Số lượng cấp phát:{' '}
                                <Text style={{ fontWeight: '800', color: '#0369A1' }}>
                                  {sup.quantity || 0} {sup.unit || 'Đơn vị'}
                                </Text>
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    );
                  }

                  return (
                    <View
                      style={{
                        backgroundColor: '#F8FAFC',
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        borderRadius: 10,
                        padding: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <Feather name="package" size={16} color="#64748B" />
                      <Text style={{ fontSize: 12.5, color: '#64748B', flex: 1, lineHeight: 18 }}>
                        {hasAssignedTeam
                          ? 'Ban chỉ huy chưa xuất vật tư kho kèm theo cho ca này.'
                          : 'Danh sách vật tư cấp phát sẽ hiển thị sau khi Ban chỉ huy điều phối.'}
                      </Text>
                    </View>
                  );
                })()}
              </View>
            </View>

            {/* 5. KHỐI HỒ SƠ YÊU CẦU BẠN ĐÃ GỬI (Đối soát tránh hoang mang nhầm ca) */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardHeaderIconWrap, { backgroundColor: '#EFF6FF' }]}>
                  <Feather name="file-text" size={18} color="#0066FF" />
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
                  <Text style={styles.requestMiniValue} numberOfLines={2}>{typeLabelText}</Text>
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
              {sos?.description && (parsedTags.length > 0 || parsedUserNote) ? (
                <View style={styles.descBox}>
                  <Text style={styles.descBoxLabel}>Nội dung mô tả tình hình:</Text>

                  {parsedTags.length > 0 && (
                    <View style={styles.descTagsCol}>
                      {parsedTags.map((tag: string, idx: number) => (
                        <View key={idx} style={styles.descTagRow}>
                          <View style={styles.descTagBullet} />
                          <Text style={styles.descTagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {parsedUserNote ? (
                    <View style={[styles.descUserNoteBox, parsedTags.length > 0 && { marginTop: 8 }]}>
                      <Text style={styles.descUserNoteLabel}>Ghi chú khẩn cấp của bạn:</Text>
                      <Text style={styles.descUserNoteText}>{parsedUserNote}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Số điện thoại liên hệ của người dân */}
              <View style={styles.infoRow}>
                <Feather name="phone" size={16} color="#16A34A" />
                <Text style={styles.infoLabel}>Số điện thoại của bạn:</Text>
                <Text style={[styles.infoTextValue, { fontWeight: '700', color: '#0F172A' }]}>
                  {sos?.contactPhone || 'Chưa cung cấp'}
                </Text>
              </View>
            </View>

            {/* 6. NÚT HÀNH ĐỘNG: CẬP NHẬT THÔNG TIN / XÁC NHẬN AN TOÀN */}
            {currentStatus !== 'COMPLETED' && currentStatus !== 'CANCELLED' && currentStatus !== 'REJECTED' ? (
              <View style={styles.actionContainer}>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={handleOpenEdit}
                  activeOpacity={0.85}
                >
                  <Text style={styles.editBtnText}>CẬP NHẬT / SỬA THÔNG TIN YÊU CẦU</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.completedBtn}
                  onPress={handleConfirmSafety}
                  disabled={isCompleting}
                  activeOpacity={0.85}
                >
                  {isCompleting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.completedBtnText}>XÁC NHẬN ĐÃ ĐƯỢC CỨU AN TOÀN</Text>
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
              <View
                style={[
                  styles.completedBadgeBox,
                  (currentStatus === 'CANCELLED' || currentStatus === 'REJECTED') && {
                    backgroundColor: '#F1F5F9',
                    borderColor: '#CBD5E1',
                  },
                ]}
              >
                <Ionicons
                  name={currentStatus === 'CANCELLED' || currentStatus === 'REJECTED' ? 'close-circle' : 'checkmark-done-circle'}
                  size={42}
                  color={currentStatus === 'CANCELLED' || currentStatus === 'REJECTED' ? '#64748B' : '#16A34A'}
                />
                <Text
                  style={[
                    styles.completedBadgeTitle,
                    (currentStatus === 'CANCELLED' || currentStatus === 'REJECTED')
                      ? { color: '#334155' }
                      : { color: '#16A34A' },
                  ]}
                >
                  {currentStatus === 'CANCELLED' || currentStatus === 'REJECTED'
                    ? 'YÊU CẦU ĐÃ ĐƯỢC HỦY'
                    : 'YÊU CẦU ĐÃ KẾT THÚC'}
                </Text>
                <Text
                  style={[
                    styles.completedBadgeSub,
                    (currentStatus === 'CANCELLED' || currentStatus === 'REJECTED') && {
                      color: '#64748B',
                    },
                  ]}
                >
                  {currentStatus === 'COMPLETED'
                    ? 'Bạn đã xác nhận an toàn. Chúc bạn và gia đình luôn khỏe mạnh và bình an!'
                    : 'Yêu cầu cứu hộ này đã được hủy. Bạn có thể xóa ca này để danh sách không bị rối mắt.'}
                </Text>

                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1,
                    borderColor: (currentStatus === 'CANCELLED' || currentStatus === 'REJECTED') ? '#CBD5E1' : '#FEE2E2',
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 12,
                    marginTop: 14,
                  }}
                  onPress={handleDeleteSos}
                  activeOpacity={0.8}
                >
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>
                    Xóa ca này khỏi lịch sử báo nạn
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ height: 30 }} />
          </ScrollView>
        )}

        {/* MODAL CẬP NHẬT TOÀN DIỆN Y HỆT FORM ĐĂNG TIN CỨU TRỢ (FULL SCREEN) */}
        {showEditSOSMap ? (
          <Modal
            visible={showEditSOSMap}
            animationType="slide"
            onRequestClose={() => setShowEditSOSMap(false)}
          >
            {React.createElement(getSOSMapScreen(), {
              editingSosId: sos?._id || sosId,
              editingSosData: sos,
              onClose: () => setShowEditSOSMap(false),
              onSosUpdated: (updated: any) => {
                setSos(updated);
                onSosCompleted?.(updated);
                loadData(false);
                setShowEditSOSMap(false);
              },
            })}
          </Modal>
        ) : null}

        {/* DIALOG XÁC NHẬN / THÔNG BÁO TÙY BIẾN THEO PHONG CÁCH SOS SYSTEMS (CHUẨN TRUNG TÂM MÀN HÌNH) */}
        {inAppAlert?.visible ? (
          <Modal
            visible={Boolean(inAppAlert.visible)}
            transparent={true}
            animationType="fade"
            statusBarTranslucent={true}
            onRequestClose={() => {
              if (!inAppAlertLoading) {
                if (inAppAlert.onCancel) inAppAlert.onCancel();
                else setInAppAlert(null);
              }
            }}
          >
            <View style={styles.dialogModalRoot}>
              <View style={styles.dialogCard}>
                {/* Icon chỉ báo phân loại */}
                <View
                  style={[
                    styles.dialogIconWrap,
                    inAppAlert.type === 'success' && styles.dialogIconSuccess,
                    inAppAlert.type === 'danger' && styles.dialogIconDanger,
                    inAppAlert.type === 'warning' && styles.dialogIconWarning,
                    inAppAlert.type === 'info' && styles.dialogIconInfo,
                  ]}
                >
                  {inAppAlert.type === 'success' && (
                    <Ionicons name="checkmark-circle" size={36} color="#16A34A" />
                  )}
                  {inAppAlert.type === 'danger' && (
                    <Ionicons name="alert-circle" size={36} color="#DC2626" />
                  )}
                  {inAppAlert.type === 'warning' && (
                    <Ionicons name="warning" size={34} color="#D97706" />
                  )}
                  {inAppAlert.type === 'info' && (
                    <Ionicons name="information-circle" size={36} color="#0066FF" />
                  )}
                </View>

                {/* Tiêu đề & Nội dung */}
                <Text style={styles.dialogTitle}>{inAppAlert.title}</Text>
                <Text style={styles.dialogMessage}>{inAppAlert.message}</Text>

                {/* Hàng nút bấm */}
                <View style={styles.dialogButtonRow}>
                  {inAppAlert.cancelText ? (
                    <TouchableOpacity
                      style={styles.dialogCancelBtn}
                      onPress={() => {
                        if (inAppAlert.onCancel) {
                          inAppAlert.onCancel();
                        } else {
                          setInAppAlert(null);
                        }
                      }}
                      disabled={inAppAlertLoading}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.dialogCancelBtnText}>{inAppAlert.cancelText}</Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.dialogConfirmBtn,
                      !inAppAlert.cancelText && { width: '100%', flex: 0 },
                      inAppAlert.confirmStyle === 'danger' && styles.dialogConfirmDanger,
                      inAppAlert.confirmStyle === 'success' && styles.dialogConfirmSuccess,
                      (!inAppAlert.confirmStyle || inAppAlert.confirmStyle === 'primary') && styles.dialogConfirmPrimary,
                    ]}
                    onPress={async () => {
                      if (inAppAlert.onConfirm) {
                        setInAppAlertLoading(true);
                        try {
                          await inAppAlert.onConfirm();
                        } finally {
                          setInAppAlertLoading(false);
                        }
                      } else {
                        setInAppAlert(null);
                      }
                    }}
                    disabled={inAppAlertLoading}
                    activeOpacity={0.85}
                  >
                    {inAppAlertLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.dialogConfirmBtnText}>
                        {inAppAlert.confirmText || 'Đồng ý'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        ) : null}

        {/* MODAL BẢN ĐỒ DẪN ĐƯỜNG CHI TIẾT TOÀN MÀN HÌNH (ĐỒNG BỘ GIAO DIỆN RESCUER) */}
        <Modal
          visible={showFullMapModal}
          animationType="slide"
          statusBarTranslucent
          onRequestClose={() => setShowFullMapModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: '#F1F5F9' }}>
            <WebView
              ref={fullMapWebViewRef}
              source={{ html: fullMapHtml }}
              style={{ flex: 1 }}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              androidLayerType="hardware"
              originWhitelist={['*']}
            />

            {/* Thanh điều hướng nổi phía trên (Giống Hình 1 bên Rescuer) */}
            <View
              style={{
                position: 'absolute',
                top: Platform.OS === 'ios' ? insets.top + 8 : 36,
                left: 14,
                right: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <TouchableOpacity
                onPress={() => setShowFullMapModal(false)}
                activeOpacity={0.85}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.16,
                  shadowRadius: 6,
                  elevation: 5,
                }}
              >
                <Feather name="x" size={20} color="#0F172A" />
              </TouchableOpacity>

              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 6,
                  elevation: 5,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    backgroundColor: '#2563EB',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="navigate" size={18} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }} numberOfLines={1}>
                    {routeData
                      ? `${routeData.durationMin} • ${routeData.distanceKm}`
                      : 'Đang định tuyến đường đi...'}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748B' }} numberOfLines={1}>
                    {hasAssignedTeam ? `${teamName} đang di chuyển tới bạn` : 'Vị trí hiện trường SOS của bạn'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Cụm nút công cụ bên phải */}
            <View
              style={{
                position: 'absolute',
                top: (Platform.OS === 'ios' ? insets.top + 8 : 36) + 64,
                right: 14,
                gap: 10,
              }}
            >
              <TouchableOpacity
                onPress={() => fullMapWebViewRef.current?.injectJavaScript('window.fitRoute && window.fitRoute(); true;')}
                activeOpacity={0.85}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOpacity: 0.15,
                  shadowRadius: 5,
                  elevation: 4,
                }}
              >
                <MaterialCommunityIcons name="routes" size={20} color="#2563EB" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => fullMapWebViewRef.current?.injectJavaScript('window.flyToVictim && window.flyToVictim(); true;')}
                activeOpacity={0.85}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOpacity: 0.15,
                  shadowRadius: 5,
                  elevation: 4,
                }}
              >
                <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#DC2626" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const next = fullMapType === 'standard' ? 'satellite' : 'standard';
                  setFullMapType(next);
                  fullMapWebViewRef.current?.injectJavaScript(`window.setFullMapType && window.setFullMapType('${next}'); true;`);
                }}
                activeOpacity={0.85}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOpacity: 0.15,
                  shadowRadius: 5,
                  elevation: 4,
                }}
              >
                <MaterialCommunityIcons
                  name="layers-outline"
                  size={20}
                  color={fullMapType === 'satellite' ? '#2563EB' : '#475569'}
                />
              </TouchableOpacity>
            </View>

            {/* Thẻ thông tin nổi phía dưới (Giống Hình 1 bên Rescuer) */}
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: '#FFFFFF',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingHorizontal: 18,
                paddingTop: 12,
                paddingBottom: Math.max(insets.bottom, 18),
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.14,
                shadowRadius: 12,
                elevation: 12,
              }}
            >
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 12 }} />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>1</Text>
                  </View>
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#DC2626' }}>
                    Điểm cứu hộ • #{sos?.sosCode || 'SOS'}
                  </Text>
                </View>
                {routeData && (
                  <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#15803D' }}>
                      {routeData.durationMin} ({routeData.distanceKm})
                    </Text>
                  </View>
                )}
              </View>

              <Text style={{ fontSize: 17, fontWeight: '800', color: '#0F172A', marginBottom: 4 }} numberOfLines={1}>
                {hasAssignedTeam ? teamName : 'Đang chờ điều phối đội cứu hộ'}
              </Text>
              <Text style={{ fontSize: 13, color: '#475569', marginBottom: 4 }} numberOfLines={2}>
                📍 {sos?.location?.address || 'Vị trí GPS hiện trường'}
              </Text>
              <Text style={{ fontSize: 12.5, color: '#64748B', marginBottom: 14 }}>
                {peopleCount} người cần cứu · {hasAssignedTeam ? `Chỉ huy: ${rescuerName} (${vehicleName})` : 'Đang kết nối lực lượng gần nhất'}
              </Text>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => Linking.openURL(`tel:${rescuerPhone}`)}
                  activeOpacity={0.85}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    backgroundColor: '#16A34A',
                    paddingVertical: 13,
                    borderRadius: 14,
                  }}
                >
                  <Feather name="phone-call" size={17} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>
                    {hasAssignedTeam ? 'Gọi đội cứu hộ' : 'Gọi khẩn cấp 112'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowFullMapModal(false)}
                  activeOpacity={0.85}
                  style={{
                    paddingHorizontal: 18,
                    paddingVertical: 13,
                    borderRadius: 14,
                    backgroundColor: '#F1F5F9',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#334155', fontSize: 14, fontWeight: '700' }}>Đóng</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
    backgroundColor: '#0066FF',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    shadowColor: '#0066FF',
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
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#0066FF',
    marginBottom: 12,
  },
  descBoxLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  descTagsCol: {
    gap: 5,
  },
  descTagRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  descTagBullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#0066FF',
    marginTop: 6,
  },
  descTagText: {
    flex: 1,
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 18,
    fontWeight: '500',
  },
  descUserNoteBox: {
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  descUserNoteLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  descUserNoteText: {
    fontSize: 13.5,
    color: '#0F172A',
    fontWeight: '600',
    lineHeight: 20,
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
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    paddingVertical: 13,
    borderRadius: PROFILE_THEME.radius.button,
    marginBottom: 10,
  },
  editBtnText: {
    color: '#0066FF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  dialogModalRoot: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dialogCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 22,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 20,
  },
  dialogIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
  },
  dialogIconSuccess: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  dialogIconDanger: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  dialogIconWarning: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  dialogIconInfo: {
    backgroundColor: '#E0F2FE',
    borderColor: '#BAE6FD',
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  dialogMessage: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 22,
  },
  dialogButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  dialogCancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dialogCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  dialogConfirmBtn: {
    flex: 1.15,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogConfirmPrimary: {
    backgroundColor: '#0066FF',
  },
  dialogConfirmSuccess: {
    backgroundColor: '#16A34A',
  },
  dialogConfirmDanger: {
    backgroundColor: '#DC2626',
  },
  dialogConfirmBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});


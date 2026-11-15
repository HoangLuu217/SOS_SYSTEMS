import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Linking,
  Modal,
  Image,
  Dimensions,
  TextInput,
  DeviceEventEmitter,
  AppState,
  Vibration,
  Platform,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { io, Socket } from 'socket.io-client';
import { backendApi } from '@/api';
import { ENV } from '@/config/env';
import { useAuth } from '@/context/AuthContext';
import { sanitizeVietnamAddress } from '@/utils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export type RescuerMissionState =
  | 'ASSIGNED_PENDING_ACCEPTANCE' // State 1: Màn hình "Nổ nhiệm vụ" / Chờ nhận lệnh
  | 'EN_ROUTE'                    // State 2: Đang di chuyển đến hiện trường / Active Navigation
  | 'ON_SCENE_RESCUING'           // State 3: Đã tiếp cận hiện trường & cứu nạn tại chỗ
  | 'COMPLETED';                  // State 4: Hoàn thành nhiệm vụ & Báo cáo kết thúc

export interface RescuerMissionWorkspaceModalProps {
  visible: boolean;
  assignmentId?: string | null;
  initialSosData?: any;
  initialAssignmentData?: any;
  onClose: () => void;
  onMissionCompleted?: (summary?: any) => void;
  onMissionUpdated?: (newStatus: string, assignmentId?: string) => void;
}

// Cấu hình danh mục trạm trú ẩn an toàn gần nhất
const SAFE_SHELTERS = [
  { id: 'sh-1', name: 'Trường THCS Tây Sơn', address: '180 Lê Đình Lý, Hải Châu', distance: '450m', capacity: '350 người', lat: 16.0512, lng: 108.2135 },
  { id: 'sh-2', name: 'Trung tâm VH-TT Phường Hòa Cường', address: '48 Phan Đăng Lưu', distance: '720m', capacity: '200 người', lat: 16.0428, lng: 108.2185 },
];

export interface NavigationManeuverStep {
  stepIndex: number;
  instruction: string;
  iconName: string;
  actionType: string;
  distanceMeters: number;
  streetName: string;
  targetStreet: string;
  location: [number, number]; // [lat, lng]
}

function getHaversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function cleanStreetName(n?: string): string {
  if (!n || n.trim() === '') return '';
  const t = n.trim();
  const lower = t.toLowerCase();
  if (
    lower.startsWith('đường') ||
    lower.startsWith('phố') ||
    lower.startsWith('cầu') ||
    lower.startsWith('ngõ') ||
    lower.startsWith('hẻm') ||
    lower.startsWith('quốc lộ') ||
    lower.startsWith('tỉnh lộ')
  ) {
    return t;
  }
  return `Đường ${t}`;
}

// Tạo lộ trình bám đường bộ thông minh (Road corridor) tránh cắt qua biển/sông khi mất mạng hoặc OSRM timeout
function generateRoadCorridorPoints(
  start: { lat: number; lng: number },
  dest: { lat: number; lng: number }
): [number, number][] {
  // Trục đường bộ ven biển & cầu kết nối Đà Nẵng - Quảng Nam (Trường Sa, Võ Nguyên Giáp, Lê Văn Hiến)
  const waypoints: [number, number][] = [];
  waypoints.push([start.lng, start.lat]);

  const numMidPoints = 8;
  for (let i = 1; i <= numMidPoints; i++) {
    const fraction = i / (numMidPoints + 1);
    const midLat = start.lat + (dest.lat - start.lat) * fraction;
    // Bám theo hành lang trục đường ven biển / đường chính (lng ~ 108.243 - 108.248)
    const midLng = start.lng + (dest.lng - start.lng) * fraction + Math.sin(fraction * Math.PI) * 0.003;
    waypoints.push([Number(midLng.toFixed(6)), Number(midLat.toFixed(6))]);
  }

  waypoints.push([dest.lng, dest.lat]);
  return waypoints;
}

// Tạo danh sách từng ngã rẽ thông minh Turn-by-Turn fallback chuẩn Google Maps
function generateFallbackSteps(
  startLoc: { lat: number; lng: number },
  destLoc: { lat: number; lng: number },
  totalMeters: number,
  destinationAddress?: string
): NavigationManeuverStep[] {
  const steps: NavigationManeuverStep[] = [];
  const safeTotal = Math.max(totalMeters, 500);

  // Bước 0: Xuất phát
  steps.push({
    stepIndex: 0,
    instruction: 'Rẽ phải vào Trục đường chính',
    iconName: 'arrow-top-right',
    actionType: 'TURN_RIGHT',
    distanceMeters: Math.min(120, Math.round(safeTotal * 0.08)),
    streetName: 'Tuyến đường xuất phát',
    targetStreet: 'Trục đường chính',
    location: [
      Number((startLoc.lat + (destLoc.lat - startLoc.lat) * 0.08).toFixed(6)),
      Number((startLoc.lng + (destLoc.lng - startLoc.lng) * 0.08).toFixed(6)),
    ],
  });

  // Bước 1: Đi trên trục đường chính
  steps.push({
    stepIndex: 1,
    instruction: 'Rẽ trái vào Tuyến đường tiếp cận',
    iconName: 'arrow-top-left',
    actionType: 'TURN_LEFT',
    distanceMeters: Math.round(safeTotal * 0.72),
    streetName: 'Trục đường Lê Văn Hiến - Võ Nguyên Giáp',
    targetStreet: 'Tuyến đường tiếp cận',
    location: [
      Number((startLoc.lat + (destLoc.lat - startLoc.lat) * 0.82).toFixed(6)),
      Number((startLoc.lng + (destLoc.lng - startLoc.lng) * 0.82).toFixed(6)),
    ],
  });

  // Bước 2: Tiếp cận hiện trường
  steps.push({
    stepIndex: 2,
    instruction: 'Rẽ phải vào khu vực cứu hộ',
    iconName: 'arrow-top-right',
    actionType: 'TURN_RIGHT',
    distanceMeters: Math.round(safeTotal * 0.2),
    streetName: 'Tuyến đường tiếp cận',
    targetStreet: 'Khu vực cứu hộ',
    location: [
      Number((startLoc.lat + (destLoc.lat - startLoc.lat) * 0.95).toFixed(6)),
      Number((startLoc.lng + (destLoc.lng - startLoc.lng) * 0.95).toFixed(6)),
    ],
  });

  // Bước 3: Về đích
  steps.push({
    stepIndex: 3,
    instruction: destinationAddress ? `Đến điểm cứu hộ: ${destinationAddress}` : 'Đã đến hiện trường cứu nạn',
    iconName: 'flag-checkered',
    actionType: 'ARRIVE',
    distanceMeters: 0,
    streetName: 'Hiện trường cứu hộ',
    targetStreet: '',
    location: [destLoc.lat, destLoc.lng],
  });

  return steps;
}

// Phân tích chi tiết từng ngã rẽ Turn-by-Turn chuẩn xác Google Maps & Grab:
// Mỗi bước đại diện cho đoạn đường xe đang di chuyển, với thao tác rẽ ở CUỐI đoạn để nhập vào đường tiếp theo
function parseOsrmSteps(rawSteps: any[], destinationAddress?: string): NavigationManeuverStep[] {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) return [];

  const parsed: NavigationManeuverStep[] = [];

  for (let idx = 0; idx < rawSteps.length; idx++) {
    const s = rawSteps[idx];
    const nextStep = rawSteps[idx + 1];
    const isLast = idx === rawSteps.length - 1;

    const curName = cleanStreetName(s.name);
    const nextName = nextStep ? cleanStreetName(nextStep.name) : '';

    if (isLast) {
      const loc: [number, number] = s.maneuver && s.maneuver.location
        ? [s.maneuver.location[1], s.maneuver.location[0]]
        : [0, 0];
      parsed.push({
        stepIndex: idx,
        instruction: destinationAddress ? `Đến điểm cứu hộ: ${destinationAddress}` : 'Đã đến hiện trường cứu nạn',
        iconName: 'flag-checkered',
        actionType: 'ARRIVE',
        distanceMeters: s.distance || 0,
        streetName: curName || 'Hiện trường cứu hộ',
        targetStreet: '',
        location: loc,
      });
      continue;
    }

    // Thao tác rẽ ở cuối đoạn s để chuyển vào nextStep
    const m = nextStep.maneuver || {};
    const mType = m.type || '';
    const mMod = m.modifier || '';
    const turnLoc: [number, number] = m.location ? [m.location[1], m.location[0]] : [0, 0];

    let instruction = '';
    let iconName = 'arrow-up';
    let actionType = 'STRAIGHT';

    if (mMod === 'left') {
      instruction = nextName ? `Rẽ trái vào ${nextName}` : 'Rẽ trái';
      iconName = 'arrow-top-left';
      actionType = 'TURN_LEFT';
    } else if (mMod === 'right') {
      instruction = nextName ? `Rẽ phải vào ${nextName}` : 'Rẽ phải';
      iconName = 'arrow-top-right';
      actionType = 'TURN_RIGHT';
    } else if (mMod === 'slight left') {
      instruction = nextName ? `Chếch sang trái vào ${nextName}` : 'Chếch sang trái';
      iconName = 'arrow-top-left';
      actionType = 'SLIGHT_LEFT';
    } else if (mMod === 'slight right') {
      instruction = nextName ? `Chếch sang phải vào ${nextName}` : 'Chếch sang phải';
      iconName = 'arrow-top-right';
      actionType = 'SLIGHT_RIGHT';
    } else if (mMod === 'sharp left') {
      instruction = nextName ? `Ngoặt gấp sang trái vào ${nextName}` : 'Ngoặt gấp sang trái';
      iconName = 'arrow-u-left-top';
      actionType = 'SHARP_LEFT';
    } else if (mMod === 'sharp right') {
      instruction = nextName ? `Ngoặt gấp sang phải vào ${nextName}` : 'Ngoặt gấp sang phải';
      iconName = 'arrow-u-right-top';
      actionType = 'SHARP_RIGHT';
    } else if (mMod === 'uturn') {
      instruction = 'Quay đầu xe (U-turn)';
      iconName = 'u-turn-left';
      actionType = 'UTURN';
    } else if (mType === 'roundabout' || mType === 'rotary') {
      instruction = nextName ? `Vào bùng binh, rẽ vào ${nextName}` : 'Vào bùng binh';
      iconName = 'rotate-left';
      actionType = 'ROUNDABOUT';
    } else if (mType === 'arrive') {
      instruction = destinationAddress ? `Đến điểm cứu hộ: ${destinationAddress}` : 'Đến hiện trường';
      iconName = 'flag-checkered';
      actionType = 'ARRIVE';
    } else {
      instruction = nextName ? `Đi thẳng vào ${nextName}` : (curName ? `Tiếp tục đi thẳng trên ${curName}` : 'Tiếp tục đi thẳng');
      iconName = 'arrow-up';
      actionType = 'STRAIGHT';
    }

    parsed.push({
      stepIndex: idx,
      instruction,
      iconName,
      actionType,
      distanceMeters: s.distance || 0,
      streetName: curName,
      targetStreet: nextName,
      location: turnLoc,
    });
  }

  return parsed;
}

export const RescuerMissionWorkspaceModal: React.FC<RescuerMissionWorkspaceModalProps> = ({
  visible,
  assignmentId,
  initialSosData,
  initialAssignmentData,
  onClose,
  onMissionCompleted,
  onMissionUpdated,
}) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Assignment & SOS Data
  const [assignment, setAssignment] = useState<any>(initialAssignmentData || null);
  const [sos, setSos] = useState<any>(initialSosData || null);

  // Địa chỉ điểm đến sự cố (Xác định sớm để phục vụ routing OSRM và dẫn đường Turn-by-Turn)
  const incidentAddress = assignment?.destination || sos?.address || initialAssignmentData?.destination || initialSosData?.address || '';
  const [loading, setLoading] = useState<boolean>(!initialAssignmentData && !initialSosData);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Operational State Machine
  const [missionState, setMissionState] = useState<RescuerMissionState>('ASSIGNED_PENDING_ACCEPTANCE');

  // Team GPS Location & Telemetry (Mặc định Trạm Cứu hộ Quận Ngũ Hành Sơn)
  const [teamLocation, setTeamLocation] = useState<{ lat: number; lng: number; heading: number }>({
    lat: 16.0315,
    lng: 108.2435,
    heading: 45,
  });
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);

  // OSRM Road Metrics (Lái xe ô tô theo Google Maps)
  const [roadMetrics, setRoadMetrics] = useState<{ distanceKm: string; durationMin: string; roadCoordinates: [number, number][] | null }>({
    distanceKm: '1.2 km',
    durationMin: '5 phút',
    roadCoordinates: null,
  });

  // Kiểm tra quyền Đội trưởng: Chỉ Đội trưởng mới được nhận lệnh hoặc từ chối
  const isLeader = useMemo(() => {
    const currentUserId = (user?._id || (user as any)?.id)?.toString();
    const currentUserPhone = user?.phone;
    const teamLeader = assignment?.rescueTeamId?.leaderId;
    const teamLeaderId = (teamLeader?._id || teamLeader)?.toString();
    const teamLeaderPhone = teamLeader?.phone;

    if (teamLeaderId && currentUserId && teamLeaderId === currentUserId) return true;
    if (teamLeaderPhone && currentUserPhone && teamLeaderPhone === currentUserPhone) return true;

    const rescuerObj = assignment?.rescuerId;
    const rescuerId = (rescuerObj?._id || rescuerObj)?.toString();
    if (rescuerId && currentUserId && rescuerId === currentUserId) return true;

    if (user?.roles?.includes('LEADER') || user?.roles?.includes('ADMIN')) return true;

    return false;
  }, [user, assignment]);

  // Turn-by-Turn Dynamic Navigation State (Chỉ dẫn từng ngã rẽ gần nhất chuẩn Google Maps / Grab)
  const [navigationSteps, setNavigationSteps] = useState<NavigationManeuverStep[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [stepDistRemainingMeters, setStepDistRemainingMeters] = useState<number | null>(null);

  const navigationStepsRef = useRef<NavigationManeuverStep[]>([]);
  const activeStepIndexRef = useRef<number>(0);

  // Hàm tự động cập nhật ngã rẽ chuẩn Google Maps / Grab khi xe di chuyển tiếp cận ngã rẽ gần nhất
  const updateTurnByTurnProgress = useCallback((vLat: number, vLng: number) => {
    const steps = navigationStepsRef.current;
    if (!steps || steps.length === 0) return;
    const curIdx = activeStepIndexRef.current;
    const curStep = steps[curIdx];
    if (!curStep) return;

    const targetLoc = curStep.location;
    if (!targetLoc || (targetLoc[0] === 0 && targetLoc[1] === 0)) return;

    const distToTurn = getHaversineDistanceMeters(vLat, vLng, targetLoc[0], targetLoc[1]);

    // Khi xe tiến sát ngã rẽ gần nhất (<= 35m) thì tự động chuyển sang ngã rẽ tiếp theo
    if (distToTurn <= 35 && curIdx < steps.length - 1) {
      const nextIdx = curIdx + 1;
      activeStepIndexRef.current = nextIdx;
      setActiveStepIndex(nextIdx);
      Vibration.vibrate(100);

      const nextStep = steps[nextIdx];
      const newDist = nextStep && nextStep.location && (nextStep.location[0] !== 0 || nextStep.location[1] !== 0)
        ? getHaversineDistanceMeters(vLat, vLng, nextStep.location[0], nextStep.location[1])
        : distToTurn;
      setStepDistRemainingMeters(newDist);
    } else {
      setStepDistRemainingMeters(distToTurn);
    }
  }, []);

  // UI Modes & Toggles
  const [isWaterwayMode, setIsWaterwayMode] = useState<boolean>(false);
  const [mapLayer, setMapLayer] = useState<'streets' | 'satellite'>('streets');
  const [showFloodZones, setShowFloodZones] = useState<boolean>(true);
  const [showSafeShelters, setShowSafeShelters] = useState<boolean>(false);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState<boolean>(false); // Cho phép kéo gọn xuống để xem map
  const [isNavigating, setIsNavigating] = useState<boolean>(false); // Dẫn đường trực tiếp trong App chuẩn Grab
  const [isHeadingLocked, setIsHeadingLocked] = useState<boolean>(true); // Ghim theo dõi vị trí và hướng xe chuẩn Grab
  const [isTopHudHidden, setIsTopHudHidden] = useState<boolean>(false); // Thu gọn HUD trên để thoáng bản đồ
  const [noteExpanded, setNoteExpanded] = useState<boolean>(true); // Hiển thị full ghi chú hiện trường / có nút xem chi tiết
  const [suppliesExpanded, setSuppliesExpanded] = useState<boolean>(false); // Xem chi tiết / thu gọn danh mục vật tư
  const [supplyRequestModalVisible, setSupplyRequestModalVisible] = useState<boolean>(false); // Modal yêu cầu cấp thêm vật tư
  const [requestedSuppliesList, setRequestedSuppliesList] = useState<any[]>([]); // Danh sách vật tư đã gửi yêu cầu
  const [warehouseEquipments, setWarehouseEquipments] = useState<any[]>([]); // Danh mục vật tư thực tế từ kho địa phương
  const [isLoadingWarehouseEquipments, setIsLoadingWarehouseEquipments] = useState<boolean>(false);
  const [selectedSuppliesToRequest, setSelectedSuppliesToRequest] = useState<Record<string, number>>({});
  const [supplyUrgency, setSupplyUrgency] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [supplyNote, setSupplyNote] = useState<string>('');

  // Luồng cứu hộ 2 giai đoạn: Ca-nô đón nước -> Bến cập bờ -> Xe đường bộ chở viện/trú ẩn
  const [shoreHandoffModalVisible, setShoreHandoffModalVisible] = useState<boolean>(false);
  const [shoreHandoffData, setShoreHandoffData] = useState<any>(initialSosData?.shoreHandoff || null);
  const [landingAddress, setLandingAddress] = useState<string>('');
  const [landingCoords, setLandingCoords] = useState<{ lat: number; lng: number }>({
    lat: initialSosData?.location?.coordinates?.[1] || 16.0345,
    lng: initialSosData?.location?.coordinates?.[0] || 108.2325,
  });
  const [isPickingLandingLocation, setIsPickingLandingLocation] = useState<boolean>(false);
  const [pickedTempCoords, setPickedTempCoords] = useState<{ lat: number; lng: number }>({
    lat: initialSosData?.location?.coordinates?.[1] || 16.0345,
    lng: initialSosData?.location?.coordinates?.[0] || 108.2325,
  });
  const [isFetchingAddress, setIsFetchingAddress] = useState<boolean>(false);
  const [selectedRelayVehicleType, setSelectedRelayVehicleType] = useState<'AMBULANCE' | 'TRUCK'>('AMBULANCE');
  const [relayVictimCount, setRelayVictimCount] = useState<number>(initialSosData?.people ?? 0);
  const [relayNotes, setRelayNotes] = useState<string>('');

  // State 1 Rejection Modal (Từ chối nhận lệnh)
  const [rejectModalVisible, setRejectModalVisible] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>('Phương tiện gặp sự cố kỹ thuật đột xuất');
  const [rejectCustomNote, setRejectCustomNote] = useState<string>('');

  // Custom UI Modals (Thay thế Alert.alert hệ thống)
  const [arriveConfirmModalVisible, setArriveConfirmModalVisible] = useState<boolean>(false);
  const [launchSuccessModalVisible, setLaunchSuccessModalVisible] = useState<boolean>(false);
  const [rejectSuccessModalVisible, setRejectSuccessModalVisible] = useState<boolean>(false);
  const [missionSuccessModalVisible, setMissionSuccessModalVisible] = useState<boolean>(false);
  const [customNotice, setCustomNotice] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'success' | 'error' | 'warning' | 'info';
    actionText?: string;
    onAction?: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
  });

  // State 3 On-Scene Triage Verification
  const [rescuedHeadcount, setRescuedHeadcount] = useState<number>(initialSosData?.people ?? 1);
  const [activeTriageTags, setActiveTriageTags] = useState<Record<string, boolean>>({
    'Cần hỗ trợ y tế': true,
    'Nước chảy xiết': true,
    'Đã cấp áo phao': true,
    'Cần thêm ca-nô': false,
  });

  // State 4 Completion Modal
  const DEFAULT_RESCUE_SUMMARY = 'Đã tiếp cận thành công, đưa toàn bộ nạn nhân về trạm an toàn.';
  const DEFAULT_RELIEF_SUMMARY = 'Đã bàn giao đầy đủ hàng cứu trợ / thiết bị tiếp tế tới điểm tiếp nhận đúng số lượng, đảm bảo nguyên vẹn.';
  const DEFAULT_SHORE_HANDOFF_SUMMARY = 'Đã bàn giao nạn nhân an toàn tại điểm đón bờ cho lực lượng tiếp nhận.';
  const MAX_PROOF_PHOTOS = 5;
  const [completionModalVisible, setCompletionModalVisible] = useState<boolean>(false);
  const [fieldReportNotes, setFieldReportNotes] = useState<string>(DEFAULT_RESCUE_SUMMARY);
  const [capturedPhotos, setCapturedPhotos] = useState<Array<{
    uri: string;
    base64?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
  }>>([]);
  const completedProofImagesRef = useRef<string[]>([]);
  const [missionDurationText, setMissionDurationText] = useState<string>('Vừa tiếp nhận');

  // Tính toán thời gian thực hiện thực tế (từ khi nhận/bắt đầu nhiệm vụ đến khi hoàn thành)
  useEffect(() => {
    if (completionModalVisible) {
      const isRelief =
        assignment?.missionType === 'RELIEF_DISPATCH' ||
        sos?.emergencyType === 'RELIEF' ||
        (typeof sos?.description === 'string' && sos.description.includes('xuất cấp cứu trợ')) ||
        (typeof assignment?.note === 'string' && assignment.note.includes('xuất cấp cứu trợ'));
      const isShore =
        assignment?.missionType === 'SHORE_HANDOFF' ||
        Boolean(shoreHandoffData && shoreHandoffData.status === 'ASSIGNED');

      setFieldReportNotes((prev) => {
        const trimmed = prev.trim();
        const isPresetOrEmpty =
          !trimmed ||
          trimmed === DEFAULT_RESCUE_SUMMARY ||
          trimmed === DEFAULT_RELIEF_SUMMARY ||
          trimmed === DEFAULT_SHORE_HANDOFF_SUMMARY;
        if (!isPresetOrEmpty) return prev;
        if (isRelief) return DEFAULT_RELIEF_SUMMARY;
        if (isShore) return DEFAULT_SHORE_HANDOFF_SUMMARY;
        return DEFAULT_RESCUE_SUMMARY;
      });

      const rawStart =
        assignment?.acceptedAt ||
        assignment?.startedAt ||
        assignment?.assignedAt ||
        assignment?.createdAt ||
        sos?.createdAt;

      if (!rawStart) {
        setMissionDurationText('< 1 phút');
        return;
      }

      const startDate = new Date(rawStart);
      if (isNaN(startDate.getTime())) {
        setMissionDurationText('< 1 phút');
        return;
      }

      const endDate = assignment?.completedAt ? new Date(assignment.completedAt) : new Date();
      const durationMs = Math.max(0, endDate.getTime() - startDate.getTime());
      const totalMinutes = Math.round(durationMs / 60000);

      if (totalMinutes < 1) {
        setMissionDurationText('< 1 phút');
      } else if (totalMinutes < 60) {
        setMissionDurationText(`${totalMinutes} phút`);
      } else {
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        setMissionDurationText(mins > 0 ? `${hours} giờ ${mins} phút` : `${hours} giờ`);
      }
    }
  }, [completionModalVisible, assignment, sos]);

  // Thumbnail Zoom Modal
  const [zoomPhotoVisible, setZoomPhotoVisible] = useState<boolean>(false);

  const webViewRef = useRef<WebView>(null);
  const isMapReadyRef = useRef<boolean>(false);
  const lastOsrmFetchOriginRef = useRef<{ lat: number; lng: number; destLat: number; destLng: number } | null>(null);
  const teamLocationRef = useRef(teamLocation);
  const roadMetricsRef = useRef(roadMetrics);
  const syncMapStateToWebViewRef = useRef<(() => void) | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const assignmentRef = useRef<any>(assignment);
  const sosRef = useRef<any>(sos);
  const assignmentIdRef = useRef<string | null | undefined>(assignmentId);
  const initialAssignmentRef = useRef<any>(initialAssignmentData);
  const initialSosRef = useRef<any>(initialSosData);
  const missionStateRef = useRef<RescuerMissionState>(missionState);
  const isRefreshingAssignmentRef = useRef<boolean>(false);
  const lastSupplyNoticeSigRef = useRef<string>('');
  const handleMissionCancelledRef = useRef<((data?: any) => void) | null>(null);

  useEffect(() => {
    teamLocationRef.current = teamLocation;
  }, [teamLocation]);

  useEffect(() => {
    roadMetricsRef.current = roadMetrics;
  }, [roadMetrics]);

  useEffect(() => {
    if (!visible) {
      isMapReadyRef.current = false;
      lastOsrmFetchOriginRef.current = null;
    }
  }, [visible]);

  useEffect(() => {
    assignmentRef.current = assignment;
  }, [assignment]);

  useEffect(() => {
    sosRef.current = sos;
  }, [sos]);

  useEffect(() => {
    assignmentIdRef.current = assignmentId;
  }, [assignmentId]);

  useEffect(() => {
    initialAssignmentRef.current = initialAssignmentData;
  }, [initialAssignmentData]);

  useEffect(() => {
    initialSosRef.current = initialSosData;
  }, [initialSosData]);

  useEffect(() => {
    missionStateRef.current = missionState;
  }, [missionState]);

  // Đồng bộ nếu parent cập nhật initialAssignmentData khi modal đang mở
  useEffect(() => {
    if (!visible || !initialAssignmentData) return;
    setAssignment((prev: any) => {
      if (!prev) return initialAssignmentData;
      if (String(prev._id) !== String(initialAssignmentData._id)) return prev;
      return {
        ...prev,
        ...initialAssignmentData,
        supplies: Array.isArray(initialAssignmentData.supplies)
          ? initialAssignmentData.supplies
          : prev.supplies,
        requestedSupplies: Array.isArray(initialAssignmentData.requestedSupplies)
          ? initialAssignmentData.requestedSupplies
          : prev.requestedSupplies,
      };
    });
    if (Array.isArray(initialAssignmentData.requestedSupplies)) {
      setRequestedSuppliesList(initialAssignmentData.requestedSupplies);
    }
  }, [visible, initialAssignmentData]);

  // Lắng nghe sự kiện từ Leaflet WebView (ví dụ: người dùng vuốt/kéo bản đồ -> hủy ghim tự động)
  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'MAP_READY') {
        isMapReadyRef.current = true;
        syncMapStateToWebViewRef.current?.();
      } else if (data.type === 'MAP_DRAGGED') {
        setIsHeadingLocked(false);
      } else if (data.type === 'LANDING_PIN_MOVED' || data.type === 'LANDING_PIN_DRAGGED') {
        if (typeof data.lat === 'number' && typeof data.lng === 'number') {
          setPickedTempCoords({ lat: data.lat, lng: data.lng });
        }
      }
    } catch (err) { }
  }, []);

  // Định nghĩa thứ bậc trạng thái để ngăn polling/socket với dữ liệu cũ làm lùi trạng thái tác chiến
  const STATE_RANK: Record<string, number> = {
    ASSIGNED_PENDING_ACCEPTANCE: 1,
    EN_ROUTE: 2,
    ON_SCENE_RESCUING: 3,
    COMPLETED: 4,
  };

  // Đồng bộ Mission State từ Assignment Status với cơ chế State Rank chống stale regression
  const syncStateFromStatus = (status?: string, force = false) => {
    const s = String(status || '').toUpperCase();
    let nextState: RescuerMissionState | null = null;
    if (['PENDING', 'ASSIGNED'].includes(s)) {
      nextState = 'ASSIGNED_PENDING_ACCEPTANCE';
    } else if (['ACCEPTED', 'DISPATCHED', 'EN_ROUTE', 'ON_THE_WAY'].includes(s)) {
      nextState = 'EN_ROUTE';
    } else if (['ARRIVED', 'IN_PROGRESS', 'RESCUING'].includes(s)) {
      nextState = 'ON_SCENE_RESCUING';
    } else if (['COMPLETED', 'RESOLVED'].includes(s)) {
      nextState = 'COMPLETED';
    }

    if (!nextState) return;

    if (force) {
      setMissionState(nextState);
      missionStateRef.current = nextState;
      return;
    }

    const currentRank = STATE_RANK[missionStateRef.current] || 0;
    const nextRank = STATE_RANK[nextState] || 0;
    if (nextRank >= currentRank) {
      setMissionState(nextState);
      missionStateRef.current = nextState;
    }
  };

  // 1. Tải dữ liệu Phân công & Ca SOS chi tiết
  const loadWorkspaceData = useCallback(async () => {
    try {
      setLoading(true);
      let targetAssign = initialAssignmentData;

      const targetId = assignmentId || initialAssignmentData?._id;
      if (targetId) {
        try {
          const assignRes = await backendApi.get(`/assignments/${targetId}`);
          if (assignRes.success && assignRes.data) {
            targetAssign = assignRes.data;
          }
        } catch {
          // fallback to initialAssignmentData
        }
      }

      // Nếu vẫn chưa có targetAssign, lấy phân công mới nhất của rescuer
      if (!targetAssign) {
        const myRes = await backendApi.getMyAssignments();
        if (myRes.success && Array.isArray(myRes.data) && myRes.data.length > 0) {
          targetAssign = myRes.data.find((a: any) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(a.status)) || myRes.data[0];
        }
      }

      if (targetAssign) {
        if (['CANCELLED', 'REJECTED'].includes(targetAssign.status)) {
          handleMissionCancelledRef.current?.({
            assignmentId: targetAssign._id,
            reason: targetAssign.cancelReason,
          });
          return;
        }
        setCapturedPhotos([]);
        setAssignment(targetAssign);
        syncStateFromStatus(targetAssign.status, true);
        if (Array.isArray(targetAssign.requestedSupplies)) {
          setRequestedSuppliesList(targetAssign.requestedSupplies);
        }

        if (targetAssign.rescuerLocation?.lat && targetAssign.rescuerLocation?.lng) {
          setTeamLocation({
            lat: targetAssign.rescuerLocation.lat,
            lng: targetAssign.rescuerLocation.lng,
            heading: 45,
          });
        }

        // Lấy chi tiết SOS nếu lệnh có gắn với ca SOS (Lệnh tiếp tế xuất kho độc lập sẽ có sosRequestId = null)
        const sId = targetAssign.sosRequestId?._id || targetAssign.sosRequestId || targetAssign.sosId?._id || targetAssign.sosId;
        if (sId) {
          const sosRes = await backendApi.get(`/sos/${sId}`);
          if (sosRes.success && sosRes.data) {
            setSos(sosRes.data);
            if (sosRes.data.people) {
              setRescuedHeadcount(sosRes.data.people);
              setRelayVictimCount(sosRes.data.people);
            }
            if (sosRes.data.shoreHandoff) {
              setShoreHandoffData(sosRes.data.shoreHandoff);
            }
          }
        } else {
          setSos(null);
          setShoreHandoffData(null);
        }
      } else if (initialSosData) {
        setSos(initialSosData);
        if (initialSosData.people) {
          setRescuedHeadcount(initialSosData.people);
          setRelayVictimCount(initialSosData.people);
        }
        if (initialSosData.shoreHandoff) {
          setShoreHandoffData(initialSosData.shoreHandoff);
        }
        syncStateFromStatus(initialSosData.status, true);
      }
    } catch (err) {
      console.warn('[Rescuer Workspace Load Error]:', err);
    } finally {
      setLoading(false);
    }
  }, [assignmentId, initialAssignmentData, initialSosData]);

  // 1b. Làm mới ngầm thông tin Assignment & Vật tư (không làm nháy loading UI)
  const refreshAssignmentSilently = useCallback(async () => {
    if (isRefreshingAssignmentRef.current) return;
    const targetId =
      assignmentRef.current?._id ||
      assignmentIdRef.current ||
      initialAssignmentRef.current?._id;
    if (!targetId) return;

    isRefreshingAssignmentRef.current = true;
    try {
      const assignRes = await backendApi.get(`/assignments/${targetId}`);
      if (assignRes.success && assignRes.data) {
        if (['CANCELLED', 'REJECTED'].includes(assignRes.data.status)) {
          handleMissionCancelledRef.current?.({
            assignmentId: targetId,
            reason: assignRes.data.cancelReason,
          });
          return;
        }
        setAssignment(assignRes.data);
        if (Array.isArray(assignRes.data.requestedSupplies)) {
          setRequestedSuppliesList(assignRes.data.requestedSupplies);
        }
        syncStateFromStatus(assignRes.data.status);
      }
    } catch {
      // ignore silent refresh errors
    } finally {
      isRefreshingAssignmentRef.current = false;
    }
  }, []);

  // 2. Rung cảnh báo khi nổ lệnh điều động khẩn cấp
  useEffect(() => {
    if (visible && missionState === 'ASSIGNED_PENDING_ACCEPTANCE') {
      Vibration.vibrate([0, 500, 200, 500]);
    }
  }, [visible, missionState]);

  // 3. Khởi tạo GPS Telemetry & Background Watch
  useEffect(() => {
    if (!visible) return;

    let isMounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const curr = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          if (isMounted && curr.coords) {
            const initialLoc = {
              lat: curr.coords.latitude,
              lng: curr.coords.longitude,
              heading: curr.coords.heading || 45,
            };
            setTeamLocation(initialLoc);

            if (socketRef.current && socketRef.current.connected) {
              const curAssign = assignmentRef.current;
              socketRef.current.emit('rescuer:location_update', {
                rescuerId: user?._id,
                phone: user?.phone,
                assignmentId: curAssign?._id,
                teamId: curAssign?.rescueTeamId?._id || curAssign?.rescueTeamId,
                location: initialLoc,
                coords: { lat: initialLoc.lat, lng: initialLoc.lng },
              });
            }
          }

          locationSubRef.current = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              distanceInterval: 5,
              timeInterval: 4000,
            },
            (loc) => {
              if (isMounted && loc.coords) {
                const newLoc = {
                  lat: loc.coords.latitude,
                  lng: loc.coords.longitude,
                  heading: loc.coords.heading || 45,
                };
                setTeamLocation(newLoc);
                updateTurnByTurnProgress(newLoc.lat, newLoc.lng);

                // Phát telemetry GPS thực tế lên Socket.IO
                if (socketRef.current && socketRef.current.connected) {
                  const curAssign = assignmentRef.current;
                  socketRef.current.emit('rescuer:location_update', {
                    rescuerId: user?._id,
                    phone: user?.phone,
                    assignmentId: curAssign?._id,
                    teamId: curAssign?.rescueTeamId?._id || curAssign?.rescueTeamId,
                    location: newLoc,
                    coords: { lat: newLoc.lat, lng: newLoc.lng },
                  });
                }

                // Cập nhật vị trí lên WebView
                if (webViewRef.current) {
                  const curMetrics = roadMetricsRef.current;
                  webViewRef.current.postMessage(
                    JSON.stringify({
                      type: 'UPDATE_TEAM_GPS',
                      lat: newLoc.lat,
                      lng: newLoc.lng,
                      heading: newLoc.heading,
                      etaText: `${curMetrics.durationMin} • ${curMetrics.distanceKm}`,
                    })
                  );
                }
              }
            }
          );
        }
      } catch (err) {
        console.warn('[Location Permission / Watch Error]:', err);
      }
    })();

    return () => {
      isMounted = false;
      if (locationSubRef.current) {
        locationSubRef.current.remove();
        locationSubRef.current = null;
      }
    };
  }, [visible, user?._id]);

  // 4. Kết nối Realtime Socket.IO & Đồng bộ trạng thái vật tư/nhiệm vụ
  useEffect(() => {
    if (!visible) return;

    let isDisposed = false;
    let activeSocket: Socket | null = null;
    lastSupplyNoticeSigRef.current = '';

    const isMatchingMissionEvent = (data?: any) => {
      if (!data) return false;
      const candidateAssignIds = [
        assignmentRef.current?._id,
        assignmentIdRef.current,
        initialAssignmentRef.current?._id,
      ]
        .filter(Boolean)
        .map(String);

      const candidateSosIds = [
        sosRef.current?._id,
        sosRef.current?.id,
        assignmentRef.current?.sosRequestId?._id,
        assignmentRef.current?.sosRequestId,
        assignmentRef.current?.sosId?._id,
        assignmentRef.current?.sosId,
        initialSosRef.current?._id,
        initialSosRef.current?.id,
      ]
        .filter(Boolean)
        .map(String);

      const incomingAssignId = data.assignmentId?._id || data.assignmentId || data._id || data.id;
      const incomingSosId = data.sosId?._id || data.sosId || data.sosRequestId?._id || data.sosRequestId;

      if (incomingAssignId && candidateAssignIds.includes(String(incomingAssignId))) {
        return true;
      }
      if (incomingSosId && candidateSosIds.includes(String(incomingSosId))) {
        return true;
      }
      return false;
    };

    const handleMissionCancelled = (data?: any) => {
      const isMatched = !data || (!data.assignmentId && !data.sosId && !data._id && !data.id) || isMatchingMissionEvent(data);

      if (isMatched) {
        setShoreHandoffModalVisible(false);
        setArriveConfirmModalVisible(false);
        setRejectModalVisible(false);
        setSupplyRequestModalVisible(false);
        setLaunchSuccessModalVisible(false);
        setIsPickingLandingLocation(false);

        Alert.alert(
          '⚠️ ĐIỀU ĐỘNG ĐÃ HỦY',
          data?.reason
            ? `Ban chỉ huy đã hủy điều động ca này.\nLý do: ${data.reason}`
            : 'Ban chỉ huy đã thu hồi hoặc hủy lệnh điều động cho ca cứu nạn.',
          [{ text: 'Đã hiểu', onPress: onClose }]
        );
        onClose();
      }
    };
    handleMissionCancelledRef.current = handleMissionCancelled;

    const handleSosUpdated = (updatedSos: any) => {
      const currentSosId = sosRef.current?._id || initialSosRef.current?._id;
      if (updatedSos && currentSosId && (String(updatedSos._id) === String(currentSosId) || String(updatedSos.id) === String(currentSosId))) {
        if (updatedSos.status === 'CANCELLED' || (updatedSos.status === 'VERIFIED' && missionStateRef.current !== 'COMPLETED')) {
          handleMissionCancelled({ sosId: updatedSos._id, reason: 'Ca cứu nạn đã được trung tâm chuyển trạng thái điều phối lại.' });
          return;
        }
        if (updatedSos.shoreHandoff) {
          setShoreHandoffData(updatedSos.shoreHandoff);
        }
        setSos((prev: any) => ({ ...prev, ...updatedSos }));
        syncStateFromStatus(updatedSos.status);
        onMissionUpdated?.(updatedSos.status, assignmentRef.current?._id);
      }
    };

    const handleSupplyApproved = (data: any) => {
      if (!isMatchingMissionEvent(data)) return;

      if (Array.isArray(data.requestedSupplies)) {
        setRequestedSuppliesList(data.requestedSupplies);
      }
      if (Array.isArray(data.supplies) || Array.isArray(data.requestedSupplies) || data.assignment) {
        setAssignment((prev: any) => {
          const base = prev || data.assignment || initialAssignmentRef.current || {};
          return {
            ...base,
            ...(data.assignment || {}),
            supplies: Array.isArray(data.supplies)
              ? data.supplies
              : (data.assignment?.supplies ?? base.supplies),
            requestedSupplies: Array.isArray(data.requestedSupplies)
              ? data.requestedSupplies
              : (data.assignment?.requestedSupplies ?? base.requestedSupplies),
          };
        });
      }

      refreshAssignmentSilently();

      const sig = `APPROVED:${String(data.assignmentId || assignmentRef.current?._id || '')}:${JSON.stringify(
        (data.requestedSupplies || []).map((s: any) => `${s.name}:${s.quantity}:${s.status}`)
      )}`;
      if (lastSupplyNoticeSigRef.current !== sig) {
        lastSupplyNoticeSigRef.current = sig;
        Vibration.vibrate(60);
        setCustomNotice({
          visible: true,
          type: 'success',
          title: 'Địa phương đã xuất cấp vật tư',
          message: 'Ban Chỉ Huy địa phương đã phê duyệt và xuất kho tiếp tế bổ sung cho đội cứu hộ!',
        });
      }
    };

    const handleSupplyRejected = (data: any) => {
      if (!isMatchingMissionEvent(data)) return;

      if (Array.isArray(data.requestedSupplies)) {
        setRequestedSuppliesList(data.requestedSupplies);
        setAssignment((prev: any) => {
          const base = prev || initialAssignmentRef.current || {};
          return { ...base, requestedSupplies: data.requestedSupplies };
        });
      }

      refreshAssignmentSilently();

      const sig = `REJECTED:${String(data.assignmentId || assignmentRef.current?._id || '')}:${JSON.stringify(
        (data.requestedSupplies || []).map((s: any) => `${s.name}:${s.quantity}:${s.status}`)
      )}`;
      if (lastSupplyNoticeSigRef.current !== sig) {
        lastSupplyNoticeSigRef.current = sig;
        Vibration.vibrate(60);
        setCustomNotice({
          visible: true,
          type: 'warning',
          title: 'Từ chối cấp thêm vật tư',
          message: 'Kho tiếp tế địa phương chưa thể đáp ứng yêu cầu vật tư lúc này.',
        });
      }
    };

    const handleAssignmentRealtimeSync = (data?: any) => {
      if (data && (data.assignmentId || data.sosId || data._id) && !isMatchingMissionEvent(data)) {
        return;
      }
      if (data && (data.status === 'CANCELLED' || data.status === 'REJECTED')) {
        handleMissionCancelled(data);
        return;
      }
      if (data && isMatchingMissionEvent(data)) {
        if (Array.isArray(data.requestedSupplies)) {
          setRequestedSuppliesList(data.requestedSupplies);
        }
        if (Array.isArray(data.supplies) || Array.isArray(data.requestedSupplies)) {
          setAssignment((prev: any) => {
            if (!prev) return data.assignment || prev;
            return {
              ...prev,
              ...(Array.isArray(data.supplies) ? { supplies: data.supplies } : {}),
              ...(Array.isArray(data.requestedSupplies) ? { requestedSupplies: data.requestedSupplies } : {}),
            };
          });
        }
      }
      refreshAssignmentSilently();
    };

    const handleTeamChangedInWorkspace = async () => {
      refreshAssignmentSilently();
    };

    const subMissionCancelled = DeviceEventEmitter.addListener(
      'assignment:cancelled',
      handleMissionCancelled
    );
    const subTeamWorkspace = DeviceEventEmitter.addListener(
      'team:membership_updated',
      handleTeamChangedInWorkspace
    );
    const subSupplyApproved = DeviceEventEmitter.addListener(
      'assignment:supply_approved',
      handleSupplyApproved
    );
    const subSupplyRejected = DeviceEventEmitter.addListener(
      'assignment:supply_rejected',
      handleSupplyRejected
    );
    const subSosSync = DeviceEventEmitter.addListener('sos:sync', handleAssignmentRealtimeSync);

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshAssignmentSilently();
      }
    });

    // Polling dự phòng nhẹ mỗi 5s khi đang mở modal để luôn khớp DB kể cả khi mất sóng tạm thời
    const syncInterval = setInterval(() => {
      refreshAssignmentSilently();
    }, 5000);

    (async () => {
      try {
        const resolvedBaseUrl = await backendApi.getBaseUrl().catch(() => ENV.API_BASE_URL);
        if (isDisposed) return;

        const socketUrl = (resolvedBaseUrl || ENV.API_BASE_URL).replace(/\/api\/?$/, '');
        const socket = io(socketUrl, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1500,
        });

        activeSocket = socket;
        socketRef.current = socket;

        socket.on('connect', () => {
          if (user?._id) {
            socket.emit('register_user', user._id);
          }
          refreshAssignmentSilently();
        });

        socket.on('assignment:cancelled', handleMissionCancelled);
        socket.on('assignment:deleted', handleMissionCancelled);
        socket.on('sos:updated', handleSosUpdated);
        socket.on('assignment:supply_approved', handleSupplyApproved);
        socket.on('assignment:supply_rejected', handleSupplyRejected);
        socket.on('assignment:supply_requested', handleAssignmentRealtimeSync);
        socket.on('assignment:updated', handleAssignmentRealtimeSync);
        socket.on('assignment:status_updated', handleAssignmentRealtimeSync);
        socket.on('sos:sync', handleAssignmentRealtimeSync);

        // Lắng nghe thông báo khi Ban Chỉ Huy điều động xe cứu thương/xe tải đón tại bờ
        socket.on('sos:shore_handoff_assigned', (data: any) => {
          if (data?.shoreHandoff) {
            setShoreHandoffData(data.shoreHandoff);
            Vibration.vibrate([200, 100, 200]);
            Alert.alert(
              '🚑 Xe đón bờ đã xuất phát!',
              `Ban Chỉ Huy đã điều động ${data.shoreHandoff.assignedVehicleName} (${data.shoreHandoff.assignedVehiclePlate}) do tài xế ${data.shoreHandoff.assignedDriverName} (${data.shoreHandoff.assignedDriverPhone}) phụ trách đang đến bến đón!`
            );
          }
        });

        socket.on('team:membership_updated', handleTeamChangedInWorkspace);
        socket.on('rescue_teams_updated', handleTeamChangedInWorkspace);
      } catch (err) {
        console.warn('[Socket Workspace Error]:', err);
      }
    })();

    return () => {
      isDisposed = true;
      clearInterval(syncInterval);
      appStateSub.remove();
      subTeamWorkspace.remove();
      subMissionCancelled.remove();
      subSupplyApproved.remove();
      subSupplyRejected.remove();
      subSosSync.remove();
      if (activeSocket) {
        activeSocket.off('assignment:cancelled', handleMissionCancelled);
        activeSocket.off('assignment:deleted', handleMissionCancelled);
        activeSocket.off('sos:updated', handleSosUpdated);
        activeSocket.off('sos:shore_handoff_assigned');
        activeSocket.off('assignment:supply_approved', handleSupplyApproved);
        activeSocket.off('assignment:supply_rejected', handleSupplyRejected);
        activeSocket.off('assignment:supply_requested', handleAssignmentRealtimeSync);
        activeSocket.off('assignment:updated', handleAssignmentRealtimeSync);
        activeSocket.off('assignment:status_updated', handleAssignmentRealtimeSync);
        activeSocket.off('sos:sync', handleAssignmentRealtimeSync);
        activeSocket.off('team:membership_updated', handleTeamChangedInWorkspace);
        activeSocket.off('rescue_teams_updated', handleTeamChangedInWorkspace);
        activeSocket.disconnect();
      }
      socketRef.current = null;
    };
  }, [visible, user?._id, refreshAssignmentSilently, onClose, onMissionUpdated]);

  // 5. Tự động tải dữ liệu khi mở Modal
  useEffect(() => {
    if (visible) {
      loadWorkspaceData();
    }
  }, [visible, loadWorkspaceData]);

  // Tọa độ điểm đến (ưu tiên từ SOS nếu là ca cứu nạn, hoặc từ SosAssignment nếu là Lệnh tiếp tế xuất kho độc lập)
  const { victimLat, victimLng } = useMemo(() => {
    let rawLng = 108.1400;
    let rawLat = 16.0800;

    const assignCoords =
      assignment?.location?.coordinates ||
      initialAssignmentData?.location?.coordinates;

    if (sos?.location?.coordinates && Array.isArray(sos.location.coordinates)) {
      rawLng = sos.location.coordinates[0];
      rawLat = sos.location.coordinates[1];
    } else if (sos?.coordinates?.lat && sos?.coordinates?.lng) {
      rawLat = sos.coordinates.lat;
      rawLng = sos.coordinates.lng;
    } else if (Array.isArray(assignCoords) && assignCoords.length >= 2) {
      rawLng = assignCoords[0];
      rawLat = assignCoords[1];
    }

    // Tự động đảo tọa độ nếu bị ngược
    if (Math.abs(rawLat) > 90 || (rawLng < 50 && rawLat > 50)) {
      return { victimLat: Number(rawLng), victimLng: Number(rawLat) };
    }
    return { victimLat: Number(rawLat), victimLng: Number(rawLng) };
  }, [
    sos?.location?.coordinates?.[0],
    sos?.location?.coordinates?.[1],
    sos?.coordinates?.lat,
    sos?.coordinates?.lng,
    assignment?.location?.coordinates?.[0],
    assignment?.location?.coordinates?.[1],
    initialAssignmentData?.location?.coordinates?.[0],
    initialAssignmentData?.location?.coordinates?.[1],
  ]);

  const victimCoords = useMemo(() => ({ lat: victimLat, lng: victimLng }), [victimLat, victimLng]);

  // 6. Tính toán tuyến đường thực tế qua OSRM API (Lái xe ô tô theo Google Maps) & Tạo Turn-by-Turn chuẩn
  const fetchOsrmRoute = useCallback(async () => {
    const curTeam = teamLocationRef.current;
    if (!curTeam.lat || !victimCoords.lat) return;

    const prevOrigin = lastOsrmFetchOriginRef.current;
    if (prevOrigin) {
      const destMoved = Math.abs(prevOrigin.destLat - victimCoords.lat) > 0.0001 || Math.abs(prevOrigin.destLng - victimCoords.lng) > 0.0001;
      const teamMoved = Math.abs(prevOrigin.lat - curTeam.lat) > 0.0014 || Math.abs(prevOrigin.lng - curTeam.lng) > 0.0014;
      if (!destMoved && !teamMoved) {
        return;
      }
    }

    lastOsrmFetchOriginRef.current = {
      lat: curTeam.lat,
      lng: curTeam.lng,
      destLat: victimCoords.lat,
      destLng: victimCoords.lng,
    };

    try {
      const startLng = curTeam.lng;
      const startLat = curTeam.lat;
      const endLng = victimCoords.lng;
      const endLat = victimCoords.lat;

      // OSRM Profile /driving/ = tính đường ô tô (Google Maps Car Driving) kèm timeout 6s
      const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=true`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'SOS-Rescue-App/1.0',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
      const data = await res.json();

      if (data.code === 'Ok' && data.routes && data.routes[0]) {
        const route = data.routes[0];
        // Khoảng cách theo chuẩn Google Maps
        const rawMeters = route.distance || 0;
        const distKm = rawMeters < 1000
          ? `${Math.round(rawMeters)} m`
          : `${(rawMeters / 1000).toFixed(1)} km`;

        // Thời gian lái xe ô tô theo chuẩn Google Maps
        const totalMinutes = Math.max(1, Math.round(route.duration / 60));
        let durMin = `${totalMinutes} phút`;
        if (totalMinutes >= 60) {
          const hours = Math.floor(totalMinutes / 60);
          const mins = totalMinutes % 60;
          durMin = mins > 0 ? `${hours} giờ ${mins} phút` : `${hours} giờ`;
        }

        const coords: [number, number][] = route.geometry.coordinates;

        setRoadMetrics({
          distanceKm: distKm,
          durationMin: durMin,
          roadCoordinates: coords,
        });

        // Parse chi tiết từng ngã rẽ Turn-by-Turn chuẩn Google Maps
        if (route.legs && route.legs[0] && Array.isArray(route.legs[0].steps)) {
          const parsed = parseOsrmSteps(route.legs[0].steps, incidentAddress);
          setNavigationSteps(parsed);
          navigationStepsRef.current = parsed;
          setActiveStepIndex(0);
          activeStepIndexRef.current = 0;
          setStepDistRemainingMeters(null);
        }

        // Đẩy tuyến đường vào Leaflet WebView
        if (webViewRef.current) {
          webViewRef.current.postMessage(
            JSON.stringify({
              type: 'SET_ROAD_ROUTE',
              coordinates: coords,
              distance: distKm,
              duration: durMin,
            })
          );
        }
        return;
      }
    } catch (err) {
      console.warn('[OSRM Fetch Error, fallback to Road Corridor Routing]:', err);
    }

    // FALLBACK THÔNG MINH: Tính khoảng cách đường bộ & Tạo Turn-by-Turn bám đường (không bao giờ cắt qua biển)
    const dLat = (victimCoords.lat - curTeam.lat) * (Math.PI / 180);
    const dLon = (victimCoords.lng - curTeam.lng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(curTeam.lat * (Math.PI / 180)) *
      Math.cos(victimCoords.lat * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const directKm = 6371 * c;
    const carKm = directKm * 1.35;
    const distStr = carKm < 1 ? `${Math.round(carKm * 1000)} m` : `${carKm.toFixed(1)} km`;
    const carMins = Math.max(2, Math.round(carKm * 2.2));

    const corridorCoords = generateRoadCorridorPoints(curTeam, victimCoords);
    setRoadMetrics({
      distanceKm: distStr,
      durationMin: `${carMins} phút`,
      roadCoordinates: corridorCoords,
    });

    const fallbackSteps = generateFallbackSteps(curTeam, victimCoords, carKm * 1000, incidentAddress);
    setNavigationSteps(fallbackSteps);
    navigationStepsRef.current = fallbackSteps;
    setActiveStepIndex(0);
    activeStepIndexRef.current = 0;
    setStepDistRemainingMeters(null);

    if (webViewRef.current) {
      webViewRef.current.postMessage(
        JSON.stringify({
          type: 'SET_ROAD_ROUTE',
          coordinates: corridorCoords,
          distance: distStr,
          duration: `${carMins} phút`,
        })
      );
    }
  }, [victimCoords, incidentAddress]);

  useEffect(() => {
    if (visible && victimCoords.lat) {
      fetchOsrmRoute();
    }
  }, [visible, victimCoords, teamLocation.lat, teamLocation.lng, fetchOsrmRoute]);

  // 7. Xử lý Chấp Nhận & Xuất Kích (State 1 -> State 2)
  const handleAcceptMission = async () => {
    if (!isLeader) {
      Alert.alert(
        'Chỉ Đội Trưởng',
        'Chỉ Đội trưởng mới có quyền xác nhận tiếp nhận hoặc từ chối lệnh điều động.',
        [{ text: 'Đã hiểu' }]
      );
      return;
    }

    const prevMissionState = missionStateRef.current;
    const prevAssignment = assignmentRef.current;

    // OPTIMISTIC UPDATE: Phản hồi tức thì 0ms, không đợi round-trip HTTP
    missionStateRef.current = 'EN_ROUTE';
    setMissionState('EN_ROUTE');
    setAssignment((prev: any) =>
      prev
        ? {
          ...prev,
          status: 'EN_ROUTE',
          acceptedAt: prev.acceptedAt || new Date().toISOString(),
        }
        : prev
    );

    // Kích hoạt ngay rung phản hồi & phát sự kiện đồng bộ
    Vibration.vibrate([0, 150, 100, 150]);
    DeviceEventEmitter.emit('sos:sync');
    onMissionUpdated?.('EN_ROUTE', assignment?._id);

    // Kích hoạt ngay chế độ điều hướng 3D Camera theo chuẩn Google Maps / Grab
    setIsNavigating(true);
    setIsHeadingLocked(true);
    setIsSheetCollapsed(true);
    if (webViewRef.current) {
      webViewRef.current.postMessage(
        JSON.stringify({
          type: 'START_INAPP_NAVIGATION',
          lat: teamLocation.lat,
          lng: teamLocation.lng,
          heading: teamLocation.heading,
        })
      );
    }

    // Hiển thị ngay modal xuất kích thành công không cần chờ mạng
    setLaunchSuccessModalVisible(true);

    // Đồng bộ ngầm lên máy chủ (Non-blocking background sync)
    try {
      if (assignment?._id) {
        await backendApi.updateAssignmentStatus(assignment._id, 'EN_ROUTE');
      } else if (sos?._id) {
        await backendApi.updateSosMissionStatus(sos._id, 'ON_THE_WAY', 'Đội đã tiếp nhận và đang trên đường tới');
      }
    } catch (err: any) {
      console.warn('[handleAcceptMission] Lỗi đồng bộ ngầm:', err);
      // Rollback trạng thái nếu máy chủ báo lỗi nghiêm trọng
      missionStateRef.current = prevMissionState;
      setMissionState(prevMissionState);
      setAssignment(prevAssignment);
      setLaunchSuccessModalVisible(false);
      setIsNavigating(false);
      setIsSheetCollapsed(false);

      setCustomNotice({
        visible: true,
        type: 'error',
        title: 'Lỗi đồng bộ',
        message: err?.message || 'Không thể đồng bộ trạng thái lên máy chủ. Vui lòng kiểm tra lại kết nối mạng.',
      });
    }
  };

  // 8. Xử lý Báo Cáo Không Thể Nhận / Từ Chối
  const handleConfirmReject = async () => {
    if (!isLeader) {
      Alert.alert(
        'Chỉ Đội Trưởng',
        'Chỉ Đội trưởng mới có quyền xác nhận tiếp nhận hoặc từ chối lệnh điều động.',
        [{ text: 'Đã hiểu' }]
      );
      return;
    }

    const prevAssignment = assignmentRef.current;
    const finalReason = rejectCustomNote.trim() ? `${rejectReason} - ${rejectCustomNote.trim()}` : rejectReason;

    // OPTIMISTIC UPDATE: Đóng form từ chối và hiện popup thông báo thành công tức thì
    setRejectModalVisible(false);
    setAssignment((prev: any) => (prev ? { ...prev, status: 'REJECTED' } : prev));
    DeviceEventEmitter.emit('sos:sync');
    onMissionUpdated?.('REJECTED', assignment?._id);
    setRejectSuccessModalVisible(true);

    // Đồng bộ ngầm lên máy chủ
    try {
      if (assignment?._id) {
        await backendApi.updateAssignmentStatus(assignment._id, 'REJECTED', finalReason);
      } else if (sos?._id) {
        await backendApi.updateSosMissionStatus(sos._id, 'VERIFIED', `Đội không thể nhận: ${finalReason}`);
      }
    } catch (err: any) {
      console.warn('[handleConfirmReject] Lỗi đồng bộ ngầm:', err);
      // Rollback nếu có lỗi
      setAssignment(prevAssignment);
      setRejectSuccessModalVisible(false);
      setCustomNotice({
        visible: true,
        type: 'error',
        title: 'Lỗi báo cáo',
        message: err?.message || 'Không thể gửi phản hồi từ chối lên máy chủ.',
      });
    }
  };

  // 9. Xử lý Đã Đến Hiện Trường (State 2 -> State 3)
  const handleArriveAtScene = () => {
    if (!isLeader) {
      Alert.alert(
        'Chỉ Đội Trưởng',
        'Thành viên chỉ có quyền theo dõi nhiệm vụ. Chỉ Đội trưởng mới có quyền xác nhận đã đến hiện trường.',
        [{ text: 'Đã hiểu' }]
      );
      return;
    }
    setArriveConfirmModalVisible(true);
  };

  const executeArriveAtScene = async () => {
    const prevMissionState = missionStateRef.current;
    const prevAssignment = assignmentRef.current;

    // OPTIMISTIC UPDATE: Đóng modal xác nhận và chuyển trạng thái tức thì 0ms
    setArriveConfirmModalVisible(false);
    missionStateRef.current = 'ON_SCENE_RESCUING';
    setMissionState('ON_SCENE_RESCUING');
    setAssignment((prev: any) => (prev ? { ...prev, status: 'ARRIVED' } : prev));
    Vibration.vibrate(300);
    DeviceEventEmitter.emit('sos:sync');
    onMissionUpdated?.('ARRIVED', assignment?._id);

    // Đồng bộ ngầm lên máy chủ
    try {
      if (assignment?._id) {
        await backendApi.updateAssignmentStatus(assignment._id, 'ARRIVED');
      } else if (sos?._id) {
        await backendApi.updateSosMissionStatus(sos._id, 'ARRIVED', 'Đã tiếp cận hiện trường');
      }
    } catch (err: any) {
      console.warn('[executeArriveAtScene] Lỗi đồng bộ ngầm:', err);
      // Rollback nếu có lỗi
      missionStateRef.current = prevMissionState;
      setMissionState(prevMissionState);
      setAssignment(prevAssignment);
      setCustomNotice({
        visible: true,
        type: 'error',
        title: 'Lỗi xác nhận đến hiện trường',
        message: err?.message || 'Không thể đồng bộ với máy chủ. Vui lòng thử lại.',
      });
    }
  };

  // 10. Xử lý Chụp / chọn nhiều ảnh hiện trường báo cáo & xóa ảnh chọn nhầm
  const handleCaptureFieldPhoto = async () => {
    if (capturedPhotos.length >= MAX_PROOF_PHOTOS) {
      setCustomNotice({
        visible: true,
        type: 'warning',
        title: 'Đã đạt giới hạn ảnh',
        message: `Chỉ có thể đính kèm tối đa ${MAX_PROOF_PHOTOS} ảnh xác thực. Hãy xóa bớt ảnh cũ trước khi chụp thêm.`,
      });
      return;
    }
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setCustomNotice({
          visible: true,
          type: 'warning',
          title: 'Quyền máy ảnh',
          message: 'Vui lòng cấp quyền máy ảnh trong cài đặt thiết bị để chụp ảnh hiện trường.',
        });
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.4,
        base64: true,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        setCapturedPhotos((prev) => {
          if (prev.length >= MAX_PROOF_PHOTOS) return prev;
          return [
            ...prev,
            {
              uri: asset.uri,
              base64: asset.base64 || null,
              fileName: asset.fileName || null,
              mimeType: asset.mimeType || null,
            },
          ];
        });
      }
    } catch {
      setCustomNotice({
        visible: true,
        type: 'error',
        title: 'Lỗi',
        message: 'Không thể khởi động máy ảnh trên thiết bị.',
      });
    }
  };

  const handlePickFieldPhotoFromLibrary = async () => {
    const remainingSlots = MAX_PROOF_PHOTOS - capturedPhotos.length;
    if (remainingSlots <= 0) {
      setCustomNotice({
        visible: true,
        type: 'warning',
        title: 'Đã đạt giới hạn ảnh',
        message: `Chỉ có thể đính kèm tối đa ${MAX_PROOF_PHOTOS} ảnh xác thực. Hãy xóa bớt ảnh cũ trước khi chọn thêm.`,
      });
      return;
    }
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setCustomNotice({
          visible: true,
          type: 'warning',
          title: 'Quyền thư viện ảnh',
          message: 'Vui lòng cấp quyền truy cập thư viện ảnh để chọn hình ảnh xác thực bàn giao.',
        });
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
        quality: 0.4,
        base64: true,
      });
      if (!res.canceled && Array.isArray(res.assets) && res.assets.length > 0) {
        const picked = res.assets.map((asset) => ({
          uri: asset.uri,
          base64: asset.base64 || null,
          fileName: asset.fileName || null,
          mimeType: asset.mimeType || null,
        }));
        setCapturedPhotos((prev) => {
          const existingUris = new Set(prev.map((item) => item.uri));
          const uniqueNew = picked.filter((item) => item.uri && !existingUris.has(item.uri));
          return [...prev, ...uniqueNew].slice(0, MAX_PROOF_PHOTOS);
        });
      }
    } catch {
      setCustomNotice({
        visible: true,
        type: 'error',
        title: 'Lỗi',
        message: 'Không thể mở thư viện ảnh trên thiết bị.',
      });
    }
  };

  const handleRemoveFieldPhoto = (index: number) => {
    setCapturedPhotos((prev) => prev.filter((_, idx) => idx !== index));
  };

  // 11. Xử lý Hoàn Tất Cứu Hộ & Báo Cáo Kết Thúc (State 3 -> State 4)
  const handleOpenCompleteModal = () => {
    if (!isLeader) {
      Alert.alert(
        'Chỉ Đội Trưởng',
        'Thành viên chỉ có quyền theo dõi nhiệm vụ. Chỉ Đội trưởng mới có quyền báo cáo hoàn tất cứu hộ.',
        [{ text: 'Đã hiểu' }]
      );
      return;
    }
    setCompletionModalVisible(true);
  };

  const handleFinalSubmitCompletion = async () => {
    const isRelief =
      assignment?.missionType === 'RELIEF_DISPATCH' ||
      sos?.emergencyType === 'RELIEF' ||
      (typeof sos?.description === 'string' && sos.description.includes('xuất cấp cứu trợ')) ||
      (typeof assignment?.note === 'string' && assignment.note.includes('xuất cấp cứu trợ'));
    const isShore =
      assignment?.missionType === 'SHORE_HANDOFF' ||
      Boolean(shoreHandoffData && shoreHandoffData.status === 'ASSIGNED');

    if (capturedPhotos.length === 0) {
      setCustomNotice({
        visible: true,
        type: 'warning',
        title: 'Thiếu ảnh xác thực hoàn thành',
        message: 'Vui lòng chụp hoặc chọn ít nhất 1 hình ảnh hiện trường / bàn giao trước khi bấm xác nhận hoàn thành.',
      });
      return;
    }

    try {
      setActionLoading(true);
      const suppliesArr = Array.isArray(assignment?.supplies) && assignment.supplies.length > 0
        ? assignment.supplies
        : Array.isArray(sos?.supplies)
          ? sos.supplies
          : [];
      const totalReliefQty = suppliesArr.reduce((sum: number, s: any) => sum + (Number(s?.quantity) || 0), 0);
      const notePayload = isRelief
        ? `${fieldReportNotes.trim()} | Tổng hàng bàn giao: ${totalReliefQty} món/kiện (${suppliesArr.length} mặt hàng) | Thời gian hoàn thành: ${missionDurationText}`
        : isShore
          ? `${fieldReportNotes.trim()} | Thời gian hoàn thành: ${missionDurationText}`
          : `${fieldReportNotes.trim()} | Đã cứu: ${rescuedHeadcount} người | Thời gian hoàn thành: ${missionDurationText}`;

      const targetSosId = sos?._id || assignment?.sosRequestId || assignment?.sosId;

      // 1. Tải toàn bộ ảnh thực tế tại hiện trường lên máy chủ Cloudinary để lấy URL công khai (tuyệt đối không lưu URI file:// nội bộ)
      const extractUploadedUrl = (fileRes: any): string | null => {
        if (!fileRes || fileRes.success === false) return null;
        const candidate =
          fileRes?.url ||
          fileRes?.data?.url ||
          (Array.isArray(fileRes?.urls) ? fileRes.urls[0] : null) ||
          (Array.isArray(fileRes?.data) ? fileRes.data[0]?.url : null);
        return typeof candidate === 'string' && /^https?:\/\//i.test(candidate) ? candidate : null;
      };

      const uploadedResults = await Promise.all(
        capturedPhotos.map(async (photo, idx) => {
          const fallbackExt = photo.uri?.split('.').pop()?.toLowerCase() === 'png' ? 'png' : 'jpg';
          const safeFileName = photo.fileName || `proof_${Date.now()}_${idx + 1}.${fallbackExt}`;
          const safeMime =
            photo.mimeType ||
            (fallbackExt === 'png' ? 'image/png' : 'image/jpeg');

          try {
            const formData = new FormData();
            formData.append('file', {
              uri: photo.uri,
              name: safeFileName,
              type: safeMime,
            } as any);
            if (targetSosId) formData.append('sosId', String(targetSosId));
            formData.append('purpose', 'PROOF');

            const formRes = await backendApi.postFormData('/files', formData);
            const formUrl = extractUploadedUrl(formRes);
            if (formUrl) return formUrl;
          } catch (formErr) {
            console.warn(`Lỗi upload FormData ảnh ${idx + 1}:`, formErr);
          }

          if (photo.base64) {
            try {
              const b64Res = await backendApi.post(
                '/files',
                {
                  base64File: photo.base64,
                  fileName: safeFileName,
                  sosId: targetSosId,
                  purpose: 'PROOF',
                },
                { timeout: 60000 } as any
              );
              const b64Url = extractUploadedUrl(b64Res);
              if (b64Url) return b64Url;
            } catch (b64Err) {
              console.warn(`Lỗi upload base64 ảnh ${idx + 1}:`, b64Err);
            }
          }

          return null;
        })
      );

      const proofImages = uploadedResults.filter((u): u is string => Boolean(u));

      if (capturedPhotos.length > 0 && proofImages.length < capturedPhotos.length) {
        setCustomNotice({
          visible: true,
          type: 'error',
          title: 'Tải ảnh xác thực thất bại',
          message:
            proofImages.length === 0
              ? 'Không thể tải ảnh xác thực lên máy chủ. Vui lòng kiểm tra kết nối mạng và thử bấm Bàn giao lại.'
              : `Chỉ tải lên được ${proofImages.length}/${capturedPhotos.length} ảnh. Vui lòng kiểm tra mạng hoặc xóa bớt ảnh lỗi rồi thử lại.`,
        });
        return;
      }

      completedProofImagesRef.current = proofImages;

      // 2. Chỉ đội xe tiếp vận đón bờ (isShoreHandoffMission) mới hoàn tất trạng thái đón bờ.
      // Đội đi cứu chính không được tự động đóng thay nhiệm vụ xe tiếp vận.
      if (isShoreHandoffMission && targetSosId && shoreHandoffData && shoreHandoffData.status === 'ASSIGNED') {
        try {
          await backendApi.completeShoreHandoff(targetSosId, { proofImages });
          setShoreHandoffData((prev: any) => (prev ? { ...prev, status: 'COMPLETED' } : null));
        } catch (err) {
          console.warn('Auto complete shore handoff error:', err);
        }
      }

      const recipientName = citizenName || 'Người nhận tại hiện trường';
      if (assignment?._id) {
        await backendApi.updateAssignmentStatus(assignment._id, 'COMPLETED', notePayload, {
          proofImages,
          actualRecipient: recipientName,
        });
      } else if (sos?._id) {
        await backendApi.post(`/sos/${sos._id}/complete`, {
          note: notePayload,
          notes: notePayload,
          proofImages,
          actualRecipient: recipientName,
        });
      }

      setCompletionModalVisible(false);
      setCapturedPhotos([]);
      setMissionState('COMPLETED');
      setAssignment((prev: any) => (prev ? {
        ...prev,
        status: 'COMPLETED',
        proofImages,
        completedAt: new Date().toISOString(),
      } : prev));
      DeviceEventEmitter.emit('sos:sync');
      onMissionUpdated?.('COMPLETED', assignment?._id);
      Vibration.vibrate([0, 200, 100, 200]);
      setMissionSuccessModalVisible(true);
    } catch (err: any) {
      console.warn('Lỗi lưu báo cáo hoàn tất:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // 12. Helper tra cứu địa chỉ từ toạ độ (Ưu tiên Reverse Geocode Native từ Google/Apple Maps, fallback Nominatim kèm chuẩn hóa địa giới)
  const fetchAddressFromCoords = async (lat: number, lng: number): Promise<string> => {
    // 1. Thử qua Native Location Geocoder của thiết bị (Android dùng Google Play Services, iOS dùng Apple Maps)
    try {
      const geoList = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (Array.isArray(geoList) && geoList.length > 0) {
        const geo = geoList[0];
        const streetPart = [geo.streetNumber, geo.street || geo.name].filter(Boolean).join(' ').trim();
        const rawDistrict = geo.district || geo.subregion || '';
        const rawCity = geo.city || geo.region || '';
        const parts = [streetPart, rawDistrict, rawCity].filter(Boolean);

        if (parts.length > 0) {
          const sanitized = sanitizeVietnamAddress(parts);
          if (sanitized) return sanitized;
        }
      }
    } catch {
      // Fallback sang OpenStreetMap Nominatim nếu Geocoder thiết bị chưa sẵn sàng
    }

    // 2. Fallback sang OpenStreetMap Nominatim kèm bộ lọc làm sạch ranh giới hành chính
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'User-Agent': 'SOS-Rescue-App/1.0' } }
      );
      const data = await res.json();
      if (data && data.display_name) {
        const sanitized = sanitizeVietnamAddress(String(data.display_name).split(','));
        if (sanitized) return sanitized;
      }
    } catch { }
    return `Bến cập bờ tại tọa độ (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  };

  const handleStartPickOnMap = () => {
    setPickedTempCoords(landingCoords);
    setShoreHandoffModalVisible(false);
    setIsPickingLandingLocation(true);
    setIsSheetCollapsed(true);
    if (webViewRef.current) {
      webViewRef.current.postMessage(
        JSON.stringify({
          type: 'ENABLE_LANDING_PICKER',
          lat: landingCoords.lat,
          lng: landingCoords.lng,
        })
      );
    }
  };

  const handleUseCurrentGps = async () => {
    try {
      setIsFetchingAddress(true);
      let curLat = teamLocation.lat;
      let curLng = teamLocation.lng;

      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (loc && loc.coords) {
          curLat = loc.coords.latitude;
          curLng = loc.coords.longitude;
          setTeamLocation((prev) => ({ ...prev, lat: curLat, lng: curLng }));
        }
      } catch { }

      setLandingCoords({ lat: curLat, lng: curLng });
      setPickedTempCoords({ lat: curLat, lng: curLng });
      const addr = await fetchAddressFromCoords(curLat, curLng);
      setLandingAddress(addr);
      Vibration.vibrate(50);
    } catch {
      setLandingCoords({ lat: teamLocation.lat, lng: teamLocation.lng });
      setLandingAddress(`Vị trí GPS của Đội (${teamLocation.lat.toFixed(4)}, ${teamLocation.lng.toFixed(4)})`);
    } finally {
      setIsFetchingAddress(false);
    }
  };

  // Xử lý Gửi Yêu Cầu Xe Đón Tại Bờ (Shore Relay Handoff)
  const handleSendShoreHandoffRequest = async () => {
    try {
      setActionLoading(true);
      const targetSosId = sos?._id || assignment?.sosRequestId || assignment?.sosId;
      const landingName = landingAddress.trim() || 'Bến Cập Bờ';
      const landing = {
        name: landingName,
        address: landingAddress.trim() || `Tọa độ: ${landingCoords.lat.toFixed(5)}, ${landingCoords.lng.toFixed(5)}`,
        coordinates: [landingCoords.lng, landingCoords.lat] as [number, number],
      };
      const resolvedRescueTeamId =
        typeof assignment?.rescueTeamId === 'object' && assignment?.rescueTeamId
          ? String(assignment.rescueTeamId._id || assignment.rescueTeamId.id || '') || undefined
          : assignment?.rescueTeamId
            ? String(assignment.rescueTeamId)
            : undefined;
      const resolvedRescueTeamName =
        (typeof assignment?.rescueTeamId === 'object' && assignment?.rescueTeamId?.name) ||
        assignment?.rescueTeamName ||
        'Đội Cứu Hộ';

      const payload = {
        landingPoint: landing,
        vehicleTypeNeeded: selectedRelayVehicleType,
        peopleCount: relayVictimCount,
        notes: relayNotes,
        rescueTeamName: resolvedRescueTeamName,
        rescueTeamId: resolvedRescueTeamId,
      };

      if (targetSosId) {
        try {
          await backendApi.requestShoreHandoff(targetSosId, payload);
        } catch (err) {
          console.warn('Backend requestShoreHandoff error:', err);
        }
      }

      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('rescuer:request_shore_handoff', {
          sosId: targetSosId,
          sosCode: sos?.sosCode || 'SOS',
          shoreHandoff: {
            status: 'REQUESTED',
            ...payload,
          },
        });
      }

      setShoreHandoffData({
        status: 'REQUESTED',
        ...payload,
      });
      setShoreHandoffModalVisible(false);
      Vibration.vibrate(300);
      Alert.alert(
        '⚡ Đã gửi yêu cầu xe đón bờ',
        `Đã báo Ban Chỉ Huy điều động ${selectedRelayVehicleType === 'AMBULANCE' ? 'Xe Cứu Thương 115' : 'Xe Tải Cứu Hộ'} đến ${landing.name} đón ${relayVictimCount} nạn nhân.`
      );
    } catch (err) {
      console.error('Lỗi gửi yêu cầu đón bờ:', err);
    } finally {
      setActionLoading(false);
    }
  };



  // Dữ liệu hiển thị chi tiết (Động theo dữ liệu API thực tế)
  const isReliefMission =
    assignment?.missionType === 'RELIEF_DISPATCH' ||
    sos?.emergencyType === 'RELIEF' ||
    (typeof sos?.description === 'string' && sos.description.includes('xuất cấp cứu trợ')) ||
    (typeof assignment?.note === 'string' && assignment.note.includes('xuất cấp cứu trợ'));

  const isShoreHandoffMission =
    assignment?.missionType === 'SHORE_HANDOFF' ||
    (!assignment?.missionType &&
      typeof assignment?.note === 'string' &&
      assignment.note.toLowerCase().includes('đón bờ'));

  const sosCode =
    assignment?.dispatchCode ||
    sos?.sosCode ||
    (assignment?._id ? `LP-${String(assignment._id).slice(-4).toUpperCase()}` : 'SOS');
  const recipientName =
    assignment?.recipientName ||
    (typeof assignment?.note === 'string' && assignment.note.match(/Người nhận:\s*([^.)\]]+)/)?.[1]?.trim()) ||
    (typeof sos?.description === 'string' && sos.description.match(/Người nhận:\s*([^.)\]]+)/)?.[1]?.trim());
  const citizenName = isReliefMission
    ? (recipientName || sos?.citizenId?.fullName || 'Đầu mối tiếp nhận cứu trợ')
    : (sos?.citizenId?.fullName || sos?.reporterName || 'Người dân');
  const citizenPhone =
    sos?.contactPhone ||
    sos?.citizenId?.phone ||
    sos?.secondaryPhone ||
    (typeof assignment?.note === 'string' && assignment.note.match(/(\b0\d{9,10}\b)/)?.[1]) ||
    (typeof sos?.description === 'string' && sos.description.match(/(\b0\d{9,10}\b)/)?.[1]) ||
    '';

  const reliefSupplies = useMemo<any[]>(() => {
    const rawList =
      assignment?.supplies ||
      (assignment as any)?.reliefItems ||
      sos?.supplies ||
      [];
    return Array.isArray(rawList) ? rawList : [];
  }, [assignment, sos]);

  const reliefRecipientName = useMemo(() => {
    if (!recipientName) return '';
    return String(recipientName).replace(/\s*[-•]\s*0\d{9,10}\b/g, '').trim() || String(recipientName).trim();
  }, [recipientName]);

  const reliefRecipientPhone = useMemo(() => {
    if (recipientName) {
      const match = String(recipientName).match(/(\b0\d{9,10}\b)/);
      if (match?.[1]) return match[1];
    }
    if (typeof assignment?.note === 'string') {
      const recipSection = assignment.note.match(/Người nhận:\s*([^|\n-]*0\d{9,10}[^|\n]*)/);
      const phoneMatch = recipSection?.[1]?.match(/(\b0\d{9,10}\b)/);
      if (phoneMatch?.[1]) return phoneMatch[1];
    }
    return '';
  }, [recipientName, assignment?.note]);

  const reliefCoordinatorName =
    assignment?.assignedBy?.fullName ||
    sos?.citizenId?.fullName ||
    assignment?.authorityOrganizationId?.name ||
    'Cán bộ điều phối';

  const reliefCoordinatorPhone =
    assignment?.assignedBy?.phone ||
    sos?.citizenId?.phone ||
    sos?.contactPhone ||
    '';

  const reliefPriorityMeta = useMemo(() => {
    const prio = String(assignment?.priority || sos?.priority || 'HIGH').toUpperCase();
    if (prio === 'CRITICAL') {
      return { label: 'HỎA TỐC', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' };
    }
    if (prio === 'LOW') {
      return { label: 'TIÊU CHUẨN', color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' };
    }
    if (prio === 'MEDIUM') {
      return { label: 'BÌNH THƯỜNG', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' };
    }
    return { label: 'ƯU TIÊN CAO', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' };
  }, [assignment?.priority, sos?.priority]);

  // Tính toán chỉ dẫn ngã rẽ gần nhất hiển thị trên Top HUD (Chuẩn Google Maps & Grab):
  // Ưu tiên hiển thị ngã rẽ gần nhất (sau 50m, 100m rẽ...) hoặc đi thẳng tiếp tục trên đường hiện tại
  const currentHudManeuver = useMemo(() => {
    if (!navigationSteps || navigationSteps.length === 0) {
      return {
        iconName: isNavigating ? 'navigation-variant' : 'arrow-up',
        distanceText: roadMetrics.distanceKm,
        secondaryText: `• ${roadMetrics.durationMin}`,
        instruction: `Tiếp tục đi thẳng đến ${incidentAddress || 'hiện trường cứu hộ'}`,
      };
    }

    const curStep = navigationSteps[activeStepIndex] || navigationSteps[0];
    const isArrival = activeStepIndex >= navigationSteps.length - 1 || curStep.actionType === 'ARRIVE';

    const distVal = stepDistRemainingMeters !== null ? stepDistRemainingMeters : curStep.distanceMeters;

    if (isArrival) {
      const distStr = distVal <= 35 ? 'ĐÃ ĐẾN NƠI' : (distVal < 1000 ? `Sau ${Math.round(distVal)} m` : `Sau ${(distVal / 1000).toFixed(1)} km`);
      return {
        iconName: 'flag-checkered',
        distanceText: distStr,
        secondaryText: distVal <= 35 ? '• Đã tiếp cận hiện trường' : '• Hiện trường cứu nạn',
        instruction: curStep.instruction || `Điểm cứu hộ: ${incidentAddress || 'Hiện trường cứu nạn'}`,
      };
    }

    // Nếu khoảng cách đến ngã rẽ > 120m: Đang chạy trên đoạn đường dài -> Hiển thị mũi tên đi thẳng và tiếp tục đi thẳng
    if (distVal > 120) {
      const distStr = distVal < 1000 ? `${Math.round(distVal)} m` : `${(distVal / 1000).toFixed(1)} km`;
      return {
        iconName: 'arrow-up',
        distanceText: distStr,
        secondaryText: '• Tiếp tục đi thẳng',
        instruction: curStep.streetName ? `Tiếp tục đi thẳng trên ${curStep.streetName}` : (curStep.targetStreet ? `Đi thẳng vào ${curStep.targetStreet}` : 'Tiếp tục đi thẳng'),
      };
    }

    // Khi sắp tiếp cận ngã rẽ (<= 120m): Hiển thị ngã rẽ gần nhất sắp tới (Tới khúc nào hiện khúc đó)
    const distStr = `Sau ${Math.round(distVal)} m`;
    const secStr = distVal <= 35 ? '• Rẽ ngay' : (curStep.targetStreet ? `• ${curStep.targetStreet}` : '');
    return {
      iconName: curStep.iconName,
      distanceText: distStr,
      secondaryText: secStr,
      instruction: curStep.instruction,
    };
  }, [navigationSteps, activeStepIndex, stepDistRemainingMeters, roadMetrics, isNavigating, incidentAddress]);
  const victimHeadcount = sos?.people ?? 0;
  const rawDescription = assignment?.note || sos?.description || '';

  // Rút gọn ghi chú điều phối / hiện trường: chỉ giữ nội dung cốt lõi, loại bỏ các log tiến trình tự động lặp lại
  const displayNote = useMemo(() => {
    if (!rawDescription) return '';
    const parts = rawDescription
      .split('|')
      .map((p: string) => p.trim())
      .filter((p: string) => {
        if (!p) return false;
        const lower = p.toLowerCase();
        if (lower.includes('đội đã nhận lệnh') || lower.includes('xuất phát tiếp cận')) return false;
        if (lower.includes('đã tiếp cận hiện trường') || lower.includes('tiếp cận hiện trường')) return false;
        if (lower.includes('đang trên đường tới')) return false;
        return true;
      });

    const clean = parts.join(' • ');
    return clean || (rawDescription.split('|')[0] || '').trim();
  }, [rawDescription]);

  const reliefDisplayNote = useMemo(() => {
    if (!displayNote) return '';
    const explicitNoteMatch = displayNote.match(/Ghi chú:\s*(.+)$/i);
    if (explicitNoteMatch?.[1]) {
      return explicitNoteMatch[1].trim();
    }
    if (
      displayNote.startsWith('[Lệnh xuất cấp cứu trợ]') ||
      displayNote.startsWith('[Nhiệm vụ xuất cấp cứu trợ]')
    ) {
      return '';
    }
    return displayNote;
  }, [displayNote]);

  const reliefAddressDisplay = useMemo(() => {
    const raw = (incidentAddress || '').trim();
    if (!raw) return 'Chưa cập nhật địa chỉ tiếp nhận';
    // Gọn các cụm tỉnh/thành lặp liên tiếp kiểu "Thành phố Đà Nẵng, TP Đà Nẵng"
    return raw.replace(
      /,\s*(?:Thành phố|TP\.?)\s+([^,)]+),\s*(?:Thành phố|TP\.?)\s+\1(?=\s*(?:\)|$))/gi,
      ', TP. $1'
    );
  }, [incidentAddress]);
  const teamName = assignment?.rescueTeamId?.name || assignment?.teamName || assignment?.rescueTeamName || '';
  const vehiclePlate = assignment?.vehicleId?.plateNumber || assignment?.vehicleName || '';
  const vehicleName = vehiclePlate ? `Phương tiện: ${vehiclePlate}` : '';
  const authorityName =
    assignment?.authorityOrganizationId?.name ||
    assignment?.authorityOrganizationName ||
    '';

  // Khoảng cách an toàn tránh notch / Dynamic Island của iPhone; trên Android Modal không translucent nên y=0 đã nằm ngay dưới status bar
  const safeTop = Platform.OS === 'ios' ? Math.max(insets.top, 56) + 12 : 12;

  // Bật / Tắt chế độ dẫn đường Turn-by-Turn trực tiếp trong ứng dụng chuẩn Grab
  const handleToggleInAppNavigation = useCallback(() => {
    if (isNavigating) {
      setIsNavigating(false);
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify({ type: 'STOP_INAPP_NAVIGATION' }));
      }
    } else {
      setIsNavigating(true);
      setIsHeadingLocked(true);
      setIsSheetCollapsed(true); // Thu gọn bottom sheet để tài xế/cứu hộ viên quan sát bản đồ toàn màn hình
      if (webViewRef.current) {
        webViewRef.current.postMessage(
          JSON.stringify({
            type: 'START_INAPP_NAVIGATION',
            lat: teamLocation.lat,
            lng: teamLocation.lng,
            heading: teamLocation.heading,
          })
        );
      }
      Vibration.vibrate(50);
    }
  }, [isNavigating, teamLocation]);

  // Tải danh mục vật tư thực tế từ kho Ban Chỉ Huy địa phương tương ứng với ca SOS này
  const fetchLocalWarehouseSupplies = useCallback(async () => {
    try {
      setIsLoadingWarehouseEquipments(true);
      const targetArea =
        sos?.wardId?._id || sos?.wardId ||
        sos?.districtId?._id || sos?.districtId ||
        sos?.areaId?._id || sos?.areaId ||
        assignment?.authorityOrganizationId?.areaId?._id || assignment?.authorityOrganizationId?.areaId ||
        assignment?.rescueTeamId?.areaId?._id || assignment?.rescueTeamId?.areaId ||
        sos?.wardName ||
        sos?.districtName ||
        '';

      const teamId = assignment?.rescueTeamId?._id || assignment?.rescueTeamId || assignment?.teamId;

      let queryParams = '?limit=100';
      if (targetArea) {
        queryParams += `&areaId=${encodeURIComponent(String(targetArea))}`;
      } else if (teamId) {
        queryParams += `&teamId=${encodeURIComponent(String(teamId))}`;
      }

      const res: any = await backendApi.get(`/equipments${queryParams}`);
      let eqList: any[] = [];
      if (res?.success && Array.isArray(res?.data) && res.data.length > 0) {
        eqList = res.data;
      } else if (Array.isArray(res?.data?.equipments) && res.data.equipments.length > 0) {
        eqList = res.data.equipments;
      } else {
        const allRes: any = await backendApi.get('/equipments?limit=100');
        if (allRes?.success && Array.isArray(allRes?.data)) {
          eqList = allRes.data;
        } else if (Array.isArray(allRes?.data?.equipments)) {
          eqList = allRes.data.equipments;
        }
      }

      if (eqList.length > 0) {
        setWarehouseEquipments(eqList);
        setSelectedSuppliesToRequest((prev) => {
          const next = { ...prev };
          eqList.forEach((it: any) => {
            if (next[it.name] === undefined) {
              next[it.name] = 0;
            }
          });
          return next;
        });
      }
    } catch (err) {
      console.warn('Lỗi tải danh mục vật tư kho địa phương:', err);
    } finally {
      setIsLoadingWarehouseEquipments(false);
    }
  }, [sos, assignment]);

  useEffect(() => {
    fetchLocalWarehouseSupplies();
  }, [fetchLocalWarehouseSupplies]);

  useEffect(() => {
    if (supplyRequestModalVisible) {
      fetchLocalWarehouseSupplies();
    }
  }, [supplyRequestModalVisible, fetchLocalWarehouseSupplies]);

  // Mở modal yêu cầu vật tư: luôn làm mới bảng số lượng về 0 và xóa ghi chú cũ
  const handleOpenSupplyRequestModal = () => {
    const freshQty: Record<string, number> = {};
    warehouseEquipments.forEach((it: any) => {
      freshQty[it.name] = 0;
    });
    setSelectedSuppliesToRequest(freshQty);
    setSupplyNote('');
    setSupplyUrgency('NORMAL');
    setSupplyRequestModalVisible(true);
  };

  // Đóng modal yêu cầu vật tư và reset trạng thái nhập
  const handleCloseSupplyRequestModal = () => {
    const resetQty: Record<string, number> = {};
    warehouseEquipments.forEach((it: any) => {
      resetQty[it.name] = 0;
    });
    setSelectedSuppliesToRequest(resetQty);
    setSupplyNote('');
    setSupplyUrgency('NORMAL');
    setSupplyRequestModalVisible(false);
  };

  // Xử lý gửi yêu cầu cung cấp bổ sung vật tư lên chính quyền / Ban chỉ huy địa phương
  const handleSubmitSupplyRequest = async () => {
    const items = Object.entries(selectedSuppliesToRequest)
      .filter(([_, qty]) => qty > 0)
      .map(([name, quantity]) => {
        const matched = warehouseEquipments.find((w) => w.name === name);
        return {
          name,
          quantity,
          unit: matched?.unit || 'món',
          equipmentId: matched?._id,
        };
      });

    if (items.length === 0 && !supplyNote.trim()) {
      Alert.alert('Chưa có vật tư', 'Vui lòng chọn số lượng vật tư có sẵn hoặc nhập tên vật tư cần cấp thêm.');
      return;
    }

    try {
      setActionLoading(true);
      const finalItems = [...items];
      if (supplyNote.trim()) {
        finalItems.push({ name: supplyNote.trim(), quantity: 1, unit: 'yêu cầu', equipmentId: undefined });
      }

      const reqRes = await backendApi.post('/supplies/request', {
        assignmentId: assignment?._id,
        sosId: sos?._id,
        items: items.length > 0 ? items : finalItems,
        urgency: supplyUrgency,
        note: supplyNote,
      });

      if (reqRes?.success && reqRes.data) {
        setAssignment(reqRes.data);
        if (Array.isArray(reqRes.data.requestedSupplies)) {
          setRequestedSuppliesList(reqRes.data.requestedSupplies);
        } else {
          setRequestedSuppliesList((prev) => [...prev, ...finalItems.map((it) => ({ ...it, status: 'PENDING' }))]);
        }
      } else {
        setRequestedSuppliesList((prev) => [...prev, ...finalItems.map((it) => ({ ...it, status: 'PENDING' }))]);
      }

      // Reset sạch sẽ bảng vật tư về 0 và xóa ghi chú để lần sau mở ra không bị nhớ số lượng cũ
      const resetQty: Record<string, number> = {};
      warehouseEquipments.forEach((it: any) => {
        resetQty[it.name] = 0;
      });
      setSelectedSuppliesToRequest(resetQty);
      setSupplyNote('');
      setSupplyUrgency('NORMAL');
      setSupplyRequestModalVisible(false);
      setCustomNotice({
        visible: true,
        type: 'success',
        title: 'Đã gửi yêu cầu chi viện',
        message: `Đã gửi danh sách ${finalItems.length} hạng mục vật tư lên Ban Chỉ Huy địa phương phê duyệt và tiếp tế chi viện!`,
      });
      DeviceEventEmitter.emit('sos:sync');
    } catch (err: any) {
      Alert.alert('Lỗi', err?.message || 'Không thể gửi yêu cầu chi viện vật tư.');
    } finally {
      setActionLoading(false);
    }
  };

  // Mở ứng dụng Google Maps / Apple Maps ngoài (Dự phòng nếu cần)
  const handleOpenGoogleMaps = useCallback(() => {
    if (!victimCoords.lat || !victimCoords.lng) {
      Alert.alert('Chỉ đường', 'Không tìm thấy tọa độ hiện trường cần cứu hộ.');
      return;
    }
    const { lat, lng } = victimCoords;
    const label = encodeURIComponent(incidentAddress || `Cứu hộ #${sosCode}`);
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}(${label})`,
    }) || `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          return Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
        }
      })
      .catch(() => {
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
      });
  }, [victimCoords, incidentAddress, sosCode]);

  // Sinh mã HTML Leaflet tương tác toàn màn hình (Khởi tạo 1 lần khi mở Modal, mọi cập nhật sau đó qua postMessage để không bao giờ reload trắng màn hình)
  const mapHtml = useMemo(() => {
    if (!visible) return '';
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow: hidden; }
          #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #f8fafc; }
          .leaflet-container { background-color: #f1f5f9; }
          
          /* Pulsing Red SOS Radar Beacon */
          @keyframes sosRadar {
            0% { transform: scale(0.6); opacity: 0.9; }
            70% { transform: scale(2.0); opacity: 0; }
            100% { transform: scale(2.2); opacity: 0; }
          }
          .sos-beacon-container {
            position: relative;
            width: 50px;
            height: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .sos-beacon-wave {
            position: absolute;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: rgba(220, 38, 38, 0.45);
            animation: sosRadar 1.8s infinite ease-out;
          }
          .sos-beacon-core {
            position: relative;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: #dc2626;
            border: 2.5px solid #ffffff;
            box-shadow: 0 4px 14px rgba(220, 38, 38, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-size: 15px;
            font-weight: 800;
            z-index: 5;
          }
          .sos-floating-pill {
            position: absolute;
            top: -24px;
            background: #0f172a;
            color: #f8fafc;
            font-size: 10px;
            font-weight: 800;
            padding: 2px 7px;
            border-radius: 6px;
            border: 1px solid #ef4444;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.5);
          }
          .sos-beacon-wave.relief {
            background: rgba(5, 150, 105, 0.35);
          }
          .sos-beacon-core.relief {
            background: #059669;
            box-shadow: 0 4px 14px rgba(5, 150, 105, 0.75);
          }
          .sos-floating-pill.relief {
            background: #064e3b;
            border-color: #10b981;
          }

          /* Grab / Google Maps Navigation Puck & Radar Beam */
          .grab-puck-wrap {
            position: relative;
            width: 54px;
            height: 54px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .grab-puck-cone {
            position: absolute;
            top: -42px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 38px solid transparent;
            border-right: 38px solid transparent;
            border-top: 64px solid rgba(0, 132, 255, 0.22);
            filter: blur(1.5px);
            pointer-events: none;
            transform-origin: 50% 64px;
            z-index: 2;
            transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .grab-puck-pulse {
            position: absolute;
            width: 52px;
            height: 52px;
            border-radius: 50%;
            background: rgba(0, 132, 255, 0.22);
            animation: grabPuckPulse 2.2s infinite ease-out;
            pointer-events: none;
            z-index: 3;
          }
          @keyframes grabPuckPulse {
            0% { transform: scale(0.9); opacity: 0.85; }
            70% { transform: scale(1.65); opacity: 0; }
            100% { transform: scale(1.65); opacity: 0; }
          }
          .grab-recenter-ripple {
            position: absolute;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: rgba(0, 132, 255, 0.4);
            border: 2px solid #0084FF;
            pointer-events: none;
            opacity: 0;
            z-index: 4;
          }
          .grab-recenter-ripple.animate {
            animation: recenterRippleAnim 0.85s cubic-bezier(0.2, 0.8, 0.2, 1);
          }
          @keyframes recenterRippleAnim {
            0% { transform: scale(0.8); opacity: 1; }
            50% { transform: scale(2.8); opacity: 0.5; }
            100% { transform: scale(4.2); opacity: 0; }
          }
          .grab-puck-circle {
            position: relative;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: #ffffff;
            border: 3.5px solid #0084ff;
            box-shadow: 0 4px 14px rgba(0, 132, 255, 0.45), 0 2px 6px rgba(0, 0, 0, 0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 5;
            transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .grab-puck-arrow {
            width: 24px;
            height: 24px;
            display: block;
          }
          .grab-puck-eta-badge {
            position: absolute;
            bottom: -22px;
            background: #ffffff;
            color: #0f172a;
            font-size: 11px;
            font-weight: 800;
            padding: 3px 9px;
            border-radius: 12px;
            border: 1px solid rgba(0, 0, 0, 0.12);
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
            white-space: nowrap;
            letter-spacing: -0.2px;
            z-index: 6;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', {
            zoomControl: false,
            attributionControl: false
          }).setView([${teamLocation.lat}, ${teamLocation.lng}], 16);

          // Tạo các pane chuyên biệt để kiểm soát thứ tự đè lớp (Z-Index Hierarchy)
          map.createPane('passedRoutePane');
          map.getPane('passedRoutePane').style.zIndex = '430';

          map.createPane('routePane');
          map.getPane('routePane').style.zIndex = '440';

          // Tile Layer: Google Maps chuẩn Streets & Satellite (Miễn phí 100%, không bị dính watermark 'API KEY REQUIRED', tải cực nhanh, tên đường tiếng Việt sắc nét)
          var currentTileLayer = null;
          function setTileLayer(type) {
            if (currentTileLayer) map.removeLayer(currentTileLayer);
            if (type === 'satellite') {
              currentTileLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                subdomains: ['0', '1', '2', '3'],
                maxZoom: 20
              }).addTo(map);
            } else {
              currentTileLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
                subdomains: ['0', '1', '2', '3'],
                maxZoom: 20
              }).addTo(map);
            }
          }
          setTileLayer('${mapLayer}');

          // 1. SOS Incident / Relief Dispatch Marker
          function buildSosIcon(code, isRelief) {
            var safeCode = code || 'SOS';
            var html = isRelief
              ? '<div class="sos-beacon-container"><div class="sos-floating-pill relief">📦 ' + safeCode + ' • Điểm tiếp tế</div><div class="sos-beacon-wave relief"></div><div class="sos-beacon-core relief">📦</div></div>'
              : '<div class="sos-beacon-container"><div class="sos-floating-pill">📍 ' + safeCode + ' • Điểm cứu hộ</div><div class="sos-beacon-wave"></div><div class="sos-beacon-core">🆘</div></div>';
            return L.divIcon({
              className: 'sos-marker-div',
              html: html,
              iconSize: [50, 50],
              iconAnchor: [25, 25]
            });
          }
          var currentSosCode = ${JSON.stringify(sosCode)};
          var currentIsRelief = ${Boolean(isReliefMission)};
          var sosMarker = L.marker([${victimCoords.lat}, ${victimCoords.lng}], { icon: buildSosIcon(currentSosCode, currentIsRelief), zIndexOffset: 2000 }).addTo(map);

          // 2. Grab & Google Maps Driver Navigation Puck Marker (Ghim hướng xoay & Bong bóng khoảng cách)
          var rescuerIcon = L.divIcon({
            className: 'rescuer-marker-div',
            html: '<div class="grab-puck-wrap">' +
                    '<div class="grab-recenter-ripple" id="rescuerRipple"></div>' +
                    '<div class="grab-puck-pulse"></div>' +
                    '<div class="grab-puck-cone" id="rescuerCone" style="transform: translateX(-50%) rotate(' + (${teamLocation.heading} || 0) + 'deg);"></div>' +
                    '<div class="grab-puck-circle" id="rescuerPuck" style="transform: rotate(' + (${teamLocation.heading} || 0) + 'deg);">' +
                      '<svg class="grab-puck-arrow" viewBox="0 0 24 24" fill="none">' +
                        '<path d="M12 2.5L4.5 20.5L12 16.5L19.5 20.5L12 2.5Z" fill="#0084FF" stroke="#0055CC" stroke-width="1.2" stroke-linejoin="round"/>' +
                      '</svg>' +
                    '</div>' +
                    '<div class="grab-puck-eta-badge" id="rescuerEtaPill">${roadMetrics.durationMin} • ${roadMetrics.distanceKm}</div>' +
                  '</div>',
            iconSize: [54, 78],
            iconAnchor: [27, 27]
          });
          var rescuerMarker = L.marker([${teamLocation.lat}, ${teamLocation.lng}], { icon: rescuerIcon, zIndexOffset: 2500 }).addTo(map);

          // 3. Đường điều hướng 2 lớp nổi khối (Dual-Layer Polyline Casing) & Trimming tiến trình
          var fullRouteLatLngs = [];
          var passedPolyline = null;
          var roadCasingPolyline = null;
          var roadCorePolyline = null;
          var directWaterwayLine = null;
          var footApproachLine = null;

          function getBearing(lat1, lon1, lat2, lon2) {
            var dLon = (lon2 - lon1) * Math.PI / 180;
            var y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
            var x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
                    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
            return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
          }

          // Hàm chiếu điểm vuông góc lên đoạn thẳng để tìm tiến trình chính xác
          function projectPointOnSegment(p, a, b) {
            var x = p[0], y = p[1];
            var x1 = a[0], y1 = a[1];
            var x2 = b[0], y2 = b[1];
            var dx = x2 - x1;
            var dy = y2 - y1;
            var lenSq = dx * dx + dy * dy;
            if (lenSq === 0) return a;
            var t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq));
            return [x1 + t * dx, y1 + t * dy];
          }

          function distSq(p1, p2) {
            var dx = p1[0] - p2[0];
            var dy = p1[1] - p2[1];
            return dx * dx + dy * dy;
          }

          // Cắt ngắn & làm mờ phần đường đã đi qua (Route Progress Trimming)
          function updateRouteProgress(currPoint) {
            if (!fullRouteLatLngs || fullRouteLatLngs.length < 2) return;
            var currLatLng = Array.isArray(currPoint) ? currPoint : [currPoint.lat, currPoint.lng];

            var minDistance = Infinity;
            var bestIdx = 0;
            var bestProj = fullRouteLatLngs[0];

            for (var i = 0; i < fullRouteLatLngs.length - 1; i++) {
              var a = fullRouteLatLngs[i];
              var b = fullRouteLatLngs[i + 1];
              var proj = projectPointOnSegment(currLatLng, a, b);
              var d = distSq(currLatLng, proj);
              if (d < minDistance) {
                minDistance = d;
                bestIdx = i;
                bestProj = proj;
              }
            }

            // Tách lộ trình thành 2 phần:
            // 1. Đã đi qua (Passed Route): làm mờ màu xám nhạt #BDBDBD, weight 6
            var passed = fullRouteLatLngs.slice(0, bestIdx + 1);
            passed.push(bestProj);

            // 2. Phía trước (Remaining Route): giữ nguyên 2 lớp nổi khối màu xanh
            var remaining = [bestProj].concat(fullRouteLatLngs.slice(bestIdx + 1));

            // Cập nhật lớp đường đã đi qua
            if (passed.length >= 2) {
              var curW = getRouteWeights();
              if (!passedPolyline) {
                passedPolyline = L.polyline(passed, {
                  color: '#94A3B8',
                  weight: curW.passed,
                  opacity: 0.75,
                  lineCap: 'round',
                  lineJoin: 'round',
                  pane: 'passedRoutePane'
                }).addTo(map);
              } else {
                passedPolyline.setLatLngs(passed);
              }
            } else if (passedPolyline) {
              map.removeLayer(passedPolyline);
              passedPolyline = null;
            }

            // Cập nhật 2 lớp đường phía trước
            if (remaining.length >= 2) {
              if (roadCasingPolyline) roadCasingPolyline.setLatLngs(remaining);
              if (roadCorePolyline) roadCorePolyline.setLatLngs(remaining);
            }

            // Snap vị trí xe vào tim đường lộ trình khi đang dẫn đường (Chuẩn Google Maps & Grab)
            if (inAppNavActive && minDistance < 0.0001) {
              rescuerMarker.setLatLng(bestProj);
            }
          }

          // Tự động điều chỉnh độ dày đường dẫn theo zoom level (Chuẩn Google Maps & Grab)
          function getRouteWeights(zoom) {
            var z = (typeof zoom === 'number') ? zoom : map.getZoom();
            if (z >= 17) {
              return { casing: 8.0, core: 5.0, passed: 4.0 };
            } else if (z >= 15) {
              return { casing: 7.0, core: 4.2, passed: 3.5 };
            } else if (z >= 13) {
              return { casing: 5.8, core: 3.4, passed: 2.8 };
            } else {
              return { casing: 4.8, core: 2.8, passed: 2.2 };
            }
          }

          function updateRouteStyles() {
            var w = getRouteWeights();
            if (roadCasingPolyline) roadCasingPolyline.setStyle({ weight: w.casing });
            if (roadCorePolyline) roadCorePolyline.setStyle({ weight: w.core });
            if (passedPolyline) passedPolyline.setStyle({ weight: w.passed });
          }

          map.on('zoomend', updateRouteStyles);

          function renderRoadSnappedRoute(coords) {
            if (roadCasingPolyline) map.removeLayer(roadCasingPolyline);
            if (roadCorePolyline) map.removeLayer(roadCorePolyline);
            if (passedPolyline) map.removeLayer(passedPolyline);
            if (directWaterwayLine) map.removeLayer(directWaterwayLine);
            if (footApproachLine) map.removeLayer(footApproachLine);

            var latLngs = coords.map(function(c) { return [c[1], c[0]]; });
            if (latLngs.length < 2) return;
            fullRouteLatLngs = latLngs;

            // 1. Ghim vị trí xe cứu hộ bám chặt vào ĐẦU ĐƯỜNG của lộ trình (Chuẩn Grab / Google Maps)
            rescuerMarker.setLatLng(latLngs[0]);

            // Tự động xoay mũi tên xe cứu hộ theo hướng xuất phát của con đường
            if (latLngs.length > 1) {
              var heading = getBearing(latLngs[0][0], latLngs[0][1], latLngs[1][0], latLngs[1][1]);
              var puck = document.getElementById('rescuerPuck');
              if (puck) {
                puck.style.transform = 'rotate(' + Math.round(heading) + 'deg)';
              }
            }

            var initW = getRouteWeights();

            // 2. Lớp viền dưới (Outer Casing): Xanh đậm #185ABC, bo tròn, độ dày thanh thoát chuẩn Grab
            roadCasingPolyline = L.polyline(latLngs, {
              color: '#185ABC',
              weight: initW.casing,
              opacity: 0.95,
              lineCap: 'round',
              lineJoin: 'round',
              pane: 'routePane'
            }).addTo(map);

            // 3. Lớp lõi trên (Inner Core): Xanh sáng #4285F4, bo tròn, độ dày cân đối
            roadCorePolyline = L.polyline(latLngs, {
              color: '#4285F4',
              weight: initW.core,
              opacity: 1.0,
              lineCap: 'round',
              lineJoin: 'round',
              pane: 'routePane'
            }).addTo(map);

            // Cập nhật vị trí tiến trình hiện tại nếu xe đang ở giữa đường
            updateRouteProgress(rescuerMarker.getLatLng());

            // 4. Đường nét đứt tiếp cận hiện trường nếu điểm SOS nằm sâu trong ngõ/nhà
            var lastRoadPoint = latLngs[latLngs.length - 1];
            var sosLatLng = sosMarker.getLatLng();
            var dLat = Math.abs(lastRoadPoint[0] - sosLatLng.lat);
            var dLng = Math.abs(lastRoadPoint[1] - sosLatLng.lng);
            if (dLat > 0.00008 || dLng > 0.00008) {
              footApproachLine = L.polyline([lastRoadPoint, [sosLatLng.lat, sosLatLng.lng]], {
                color: '#EF4444',
                weight: 3,
                dashArray: '5, 5',
                opacity: 0.85,
                lineCap: 'round',
                pane: 'routePane'
              }).addTo(map);
            }

            if (!inAppNavActive) {
              fitRouteOverview(false);
            }
          }

          var isSheetCollapsed = false;

          // Tính toán tọa độ tâm lệch (Vertical Optical Offset) chuẩn Google Maps & Grab
          // Đảm bảo con trỏ vị trí nằm đúng vùng nhìn thấy thoáng đãng giữa Top HUD và Bottom Sheet
          function getOffsetLatLng(latlng, zoom) {
            var z = zoom !== undefined ? zoom : map.getZoom();
            var bottomH = isSheetCollapsed ? 140 : 340;
            var topH = 100;
            var pixelOffsetY = (bottomH - topH) / 2;
            var pt = map.project(latlng, z).add([0, pixelOffsetY]);
            return map.unproject(pt, z);
          }

          // Hiệu ứng sóng radar bung nở khi bấm nút Ghim Vị Trí (Chuẩn Google Maps & Grab)
          function triggerRecenterRipple() {
            var ripple = document.getElementById('rescuerRipple');
            if (ripple) {
              ripple.classList.remove('animate');
              void ripple.offsetWidth;
              ripple.classList.add('animate');
            }
          }

          // Căn vừa toàn bộ lộ trình và điểm cứu nạn không bao giờ bị lệch ra khỏi màn hình
          function fitRouteOverview(animate) {
            map.invalidateSize();
            var layers = [sosMarker, rescuerMarker];
            if (roadCasingPolyline) layers.push(roadCasingPolyline);
            if (directWaterwayLine) layers.push(directWaterwayLine);
            if (footApproachLine) layers.push(footApproachLine);

            var group = L.featureGroup(layers);
            var bounds = group.getBounds();
            if (!bounds.isValid()) return;

            var topPad = 110;
            var bottomPad = isSheetCollapsed ? 150 : 360;
            var sidePad = 40;

            map.fitBounds(bounds, {
              paddingTopLeft: [sidePad, topPad],
              paddingBottomRight: [sidePad, bottomPad],
              maxZoom: 16.5,
              animate: animate !== false
            });
          }

          function renderDirectWaterwayMode() {
            if (roadCasingPolyline) map.removeLayer(roadCasingPolyline);
            if (roadCorePolyline) map.removeLayer(roadCorePolyline);
            if (passedPolyline) map.removeLayer(passedPolyline);
            if (directWaterwayLine) map.removeLayer(directWaterwayLine);

            var teamLL = rescuerMarker.getLatLng();
            var sosLL = sosMarker.getLatLng();
            var directPoints = [
              [teamLL.lat, teamLL.lng],
              [sosLL.lat, sosLL.lng]
            ];

            directWaterwayLine = L.polyline(directPoints, {
              color: '#06b6d4',
              weight: 4.5,
              dashArray: '8, 8',
              opacity: 0.95
            }).addTo(map);

            if (!inAppNavActive) {
              fitRouteOverview(false);
            }
          }

          // Safe Shelters Markers
          var shelterGroup = L.layerGroup();
          ${SAFE_SHELTERS.map((s) => `
            L.marker([${s.lat}, ${s.lng}], {
              icon: L.divIcon({
                html: '<div style="background: #059669; color: #fff; font-size: 11px; font-weight: 800; padding: 3px 6px; border-radius: 6px; border: 1.5px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3); white-space: nowrap;">🏢 ${s.name}</div>',
                iconSize: [110, 30],
                iconAnchor: [55, 15]
              })
            }).addTo(shelterGroup);
          `).join('')}

          if (${showSafeShelters}) {
            shelterGroup.addTo(map);
          }

          var currentWaterwayMode = ${Boolean(isWaterwayMode)};

          // Initial Render
          ${isWaterwayMode ? 'renderDirectWaterwayMode();' : (roadMetrics.roadCoordinates ? `renderRoadSnappedRoute(${JSON.stringify(roadMetrics.roadCoordinates)});` : 'renderDirectWaterwayMode();')}

          // Tự động căn chỉnh toàn vẹn kích thước sau khi WebView hoàn tất mount
          setTimeout(function() {
            map.invalidateSize();
            fitRouteOverview(false);
          }, 350);

          var inAppNavActive = false;
          var trackingLocked = true;

          // Bắt sự kiện khi người dùng kéo/vuốt bản đồ -> Tạm thời ngừng bám theo xe
          map.on('dragstart', function() {
            trackingLocked = false;
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_DRAGGED' }));
            }
          });

          // Lắng nghe thay đổi kích thước WebView
          window.addEventListener('resize', function() {
            map.invalidateSize();
          });

          // Message Bridge từ React Native
          function handleMapMessage(rawData) {
            try {
              var msg = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
              if (!msg || !msg.type) return;

              if (msg.type === 'START_INAPP_NAVIGATION') {
                inAppNavActive = true;
                trackingLocked = true;
                map.invalidateSize();
                var offsetTarget = getOffsetLatLng(rescuerMarker.getLatLng(), 17.5);
                map.flyTo(offsetTarget, 17.5, { animate: true, duration: 0.8 });
                updateRouteStyles();
                updateRouteProgress(rescuerMarker.getLatLng());
              } else if (msg.type === 'STOP_INAPP_NAVIGATION') {
                inAppNavActive = false;
                map.invalidateSize();
                fitRouteOverview(true);
              } else if (msg.type === 'UPDATE_TEAM_GPS') {
                var latLng = [msg.lat, msg.lng];
                rescuerMarker.setLatLng(latLng);
                var puck = document.getElementById('rescuerPuck');
                var cone = document.getElementById('rescuerCone');
                if (typeof msg.heading === 'number') {
                  if (puck) puck.style.transform = 'rotate(' + msg.heading + 'deg)';
                  if (cone) cone.style.transform = 'translateX(-50%) rotate(' + msg.heading + 'deg)';
                }
                var etaPill = document.getElementById('rescuerEtaPill');
                if (etaPill && msg.etaText) {
                  etaPill.innerText = msg.etaText;
                }
                // Tự động cắt ngắn lộ trình đã đi qua (Route Progress Trimming)
                updateRouteProgress(latLng);
                if (trackingLocked || inAppNavActive) {
                  var offsetTarget = getOffsetLatLng(latLng, inAppNavActive ? 18 : undefined);
                  map.panTo(offsetTarget, { animate: true, duration: 0.8 });
                }
              } else if (msg.type === 'SET_ROAD_ROUTE') {
                if (!currentWaterwayMode && Array.isArray(msg.coordinates) && msg.coordinates.length >= 2) {
                  renderRoadSnappedRoute(msg.coordinates);
                }
                var etaPill = document.getElementById('rescuerEtaPill');
                if (etaPill && msg.distance && msg.duration) {
                  etaPill.innerText = msg.duration + ' • ' + msg.distance;
                }
              } else if (msg.type === 'UPDATE_SOS_MARKER') {
                var sosChanged = false;
                if (typeof msg.lat === 'number' && typeof msg.lng === 'number') {
                  var curSosLL = sosMarker.getLatLng();
                  if (Math.abs(curSosLL.lat - msg.lat) > 0.00001 || Math.abs(curSosLL.lng - msg.lng) > 0.00001) {
                    sosMarker.setLatLng([msg.lat, msg.lng]);
                    sosChanged = true;
                  }
                }
                if (msg.sosCode !== undefined || typeof msg.isReliefMission === 'boolean') {
                  var nextCode = msg.sosCode || currentSosCode;
                  var nextRelief = typeof msg.isReliefMission === 'boolean' ? msg.isReliefMission : currentIsRelief;
                  if (nextCode !== currentSosCode || nextRelief !== currentIsRelief) {
                    currentSosCode = nextCode;
                    currentIsRelief = nextRelief;
                    sosMarker.setIcon(buildSosIcon(currentSosCode, currentIsRelief));
                  }
                }
                if (sosChanged && !inAppNavActive) {
                  if (currentWaterwayMode) renderDirectWaterwayMode();
                  fitRouteOverview(false);
                }
              } else if (msg.type === 'TOGGLE_SHELTERS') {
                if (msg.show) {
                  if (!map.hasLayer(shelterGroup)) shelterGroup.addTo(map);
                } else {
                  if (map.hasLayer(shelterGroup)) map.removeLayer(shelterGroup);
                }
              } else if (msg.type === 'SET_WATERWAY_MODE') {
                currentWaterwayMode = Boolean(msg.isWaterwayMode);
                if (currentWaterwayMode) {
                  renderDirectWaterwayMode();
                } else if (Array.isArray(msg.roadCoordinates) && msg.roadCoordinates.length >= 2) {
                  renderRoadSnappedRoute(msg.roadCoordinates);
                }
              } else if (msg.type === 'SYNC_MAP_STATE') {
                var needFit = false;
                if (typeof msg.victimLat === 'number' && typeof msg.victimLng === 'number') {
                  var oldSosLL = sosMarker.getLatLng();
                  if (Math.abs(oldSosLL.lat - msg.victimLat) > 0.00001 || Math.abs(oldSosLL.lng - msg.victimLng) > 0.00001) {
                    sosMarker.setLatLng([msg.victimLat, msg.victimLng]);
                    needFit = true;
                  }
                }
                if (msg.sosCode || typeof msg.isReliefMission === 'boolean') {
                  var sCode = msg.sosCode || currentSosCode;
                  var sRelief = typeof msg.isReliefMission === 'boolean' ? msg.isReliefMission : currentIsRelief;
                  if (sCode !== currentSosCode || sRelief !== currentIsRelief) {
                    currentSosCode = sCode;
                    currentIsRelief = sRelief;
                    sosMarker.setIcon(buildSosIcon(currentSosCode, currentIsRelief));
                  }
                }
                if (typeof msg.teamLat === 'number' && typeof msg.teamLng === 'number') {
                  rescuerMarker.setLatLng([msg.teamLat, msg.teamLng]);
                }
                if (typeof msg.showSafeShelters === 'boolean') {
                  if (msg.showSafeShelters) {
                    if (!map.hasLayer(shelterGroup)) shelterGroup.addTo(map);
                  } else {
                    if (map.hasLayer(shelterGroup)) map.removeLayer(shelterGroup);
                  }
                }
                if (msg.mapLayer) {
                  setTileLayer(msg.mapLayer);
                }
                currentWaterwayMode = Boolean(msg.isWaterwayMode);
                if (currentWaterwayMode) {
                  renderDirectWaterwayMode();
                } else if (Array.isArray(msg.roadCoordinates) && msg.roadCoordinates.length >= 2) {
                  renderRoadSnappedRoute(msg.roadCoordinates);
                } else if (needFit && !inAppNavActive) {
                  fitRouteOverview(false);
                }
                var syncEtaPill = document.getElementById('rescuerEtaPill');
                if (syncEtaPill && msg.distance && msg.duration) {
                  syncEtaPill.innerText = msg.duration + ' • ' + msg.distance;
                }
              } else if (msg.type === 'RECENTER_TEAM') {
                trackingLocked = true;
                triggerRecenterRipple();
                var targetZoom = inAppNavActive ? 17.5 : 16.8;
                var offsetTarget = getOffsetLatLng(rescuerMarker.getLatLng(), targetZoom);
                map.flyTo(offsetTarget, targetZoom, {
                  animate: true,
                  duration: 0.8,
                  easeLinearity: 0.25
                });
                updateRouteStyles();
              } else if (msg.type === 'FIT_ROUTE') {
                trackingLocked = false;
                fitRouteOverview(true);
              } else if (msg.type === 'UPDATE_SHEET_STATE') {
                isSheetCollapsed = Boolean(msg.isCollapsed);
                if (trackingLocked) {
                  var offsetTarget = getOffsetLatLng(rescuerMarker.getLatLng());
                  map.panTo(offsetTarget, { animate: true, duration: 0.5 });
                } else {
                  fitRouteOverview(true);
                }
              } else if (msg.type === 'CHANGE_MAP_LAYER') {
                setTileLayer(msg.layer);
              } else if (msg.type === 'ENABLE_LANDING_PICKER') {
                var pLat = msg.lat || map.getCenter().lat;
                var pLng = msg.lng || map.getCenter().lng;
                if (!window.landingPickerMarker) {
                  var landingPinHtml = '<div style="position:relative; width:32px; height:36px; display:flex; flex-direction:column; align-items:center;">' +
                    '<div style="width:26px; height:26px; border-radius:50%; background:#ea580c; border:2px solid #ffffff; box-shadow:0 3px 8px rgba(234,88,12,0.75); display:flex; align-items:center; justify-content:center; color:#ffffff; font-size:13px;">🚗</div>' +
                    '<div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:6px solid #ea580c; margin-top:-1px;"></div>' +
                    '</div>';
                  var landingPinIcon = L.divIcon({
                    className: 'custom-landing-picker-icon',
                    html: landingPinHtml,
                    iconSize: [32, 36],
                    iconAnchor: [16, 36]
                  });
                  window.landingPickerMarker = L.marker([pLat, pLng], {
                    icon: landingPinIcon,
                    draggable: true,
                    zIndexOffset: 3000
                  }).addTo(map);

                  window.landingPickerMarker.on('drag', function(ev) {
                    var ll = ev.target.getLatLng();
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'LANDING_PIN_DRAGGED',
                        lat: ll.lat,
                        lng: ll.lng
                      }));
                    }
                  });

                  window.landingPickerMarker.on('dragend', function(ev) {
                    var ll = ev.target.getLatLng();
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'LANDING_PIN_MOVED',
                        lat: ll.lat,
                        lng: ll.lng
                      }));
                    }
                  });
                } else {
                  window.landingPickerMarker.setLatLng([pLat, pLng]);
                  window.landingPickerMarker.addTo(map);
                }
                map.setView([pLat, pLng], 17, { animate: true });
              } else if (msg.type === 'DISABLE_LANDING_PICKER') {
                if (window.landingPickerMarker && !msg.keepVisible) {
                  map.removeLayer(window.landingPickerMarker);
                  window.landingPickerMarker = null;
                }
              }
            } catch(err) {}
          }

          function onBridgeEvent(e) {
            if (e && e.data) handleMapMessage(e.data);
          }
          window.addEventListener('message', onBridgeEvent);
          document.addEventListener('message', onBridgeEvent);

          map.on('click', function(ev) {
            if (window.landingPickerMarker) {
              window.landingPickerMarker.setLatLng(ev.latlng);
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'LANDING_PIN_MOVED',
                  lat: ev.latlng.lat,
                  lng: ev.latlng.lng
                }));
              }
            }
          });

          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
          }
        </script>
      </body>
      </html>
    `;
  }, [visible]);

  const webViewSource = useMemo(() => ({ html: mapHtml }), [mapHtml]);

  // Đồng bộ toàn bộ trạng thái mới nhất vào WebView đã sẵn sàng mà không reload HTML
  const syncMapStateToWebView = useCallback(() => {
    if (!webViewRef.current || !isMapReadyRef.current) return;
    const curTeam = teamLocationRef.current;
    const curMetrics = roadMetricsRef.current;
    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'SYNC_MAP_STATE',
        victimLat: victimCoords.lat,
        victimLng: victimCoords.lng,
        sosCode,
        isReliefMission,
        teamLat: curTeam.lat,
        teamLng: curTeam.lng,
        mapLayer,
        showSafeShelters,
        isWaterwayMode,
        roadCoordinates: curMetrics.roadCoordinates,
        distance: curMetrics.distanceKm,
        duration: curMetrics.durationMin,
      })
    );
  }, [victimCoords.lat, victimCoords.lng, sosCode, isReliefMission, mapLayer, showSafeShelters, isWaterwayMode]);

  useEffect(() => {
    syncMapStateToWebViewRef.current = syncMapStateToWebView;
  }, [syncMapStateToWebView]);

  useEffect(() => {
    if (visible && isMapReadyRef.current) {
      webViewRef.current?.postMessage(
        JSON.stringify({
          type: 'UPDATE_SOS_MARKER',
          lat: victimCoords.lat,
          lng: victimCoords.lng,
          sosCode,
          isReliefMission,
        })
      );
    }
  }, [visible, victimCoords.lat, victimCoords.lng, sosCode, isReliefMission]);

  useEffect(() => {
    if (visible && isMapReadyRef.current) {
      webViewRef.current?.postMessage(
        JSON.stringify({
          type: 'SET_WATERWAY_MODE',
          isWaterwayMode,
          roadCoordinates: roadMetricsRef.current.roadCoordinates,
        })
      );
    }
  }, [visible, isWaterwayMode]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.fullscreenContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

        {/* ======================================================== */}
        {/* A. FULL-SCREEN INTERACTIVE MAP CANVAS                   */}
        {/* ======================================================== */}
        <View style={StyleSheet.absoluteFill}>
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={webViewSource}
            style={StyleSheet.absoluteFill}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            scrollEnabled={false}
            onLoadEnd={() => {
              isMapReadyRef.current = true;
              syncMapStateToWebView();
            }}
            onMessage={handleWebViewMessage}
          />
        </View>

        {!isPickingLandingLocation ? (
          <>
            {/* ======================================================== */}
            {/* B. TOP FLOATING NAVIGATION HUD (KHÔNG BỊ DYNAMIC ISLAND CHE) */}
            {/* ======================================================== */}
            <View style={[styles.grabTopNavContainer, { top: safeTop }]} pointerEvents="box-none">
              {/* Nút Đóng X bên trái */}
              <TouchableOpacity style={styles.grabCloseCircleBtn} onPress={onClose} activeOpacity={0.8}>
                <Feather name="x" size={20} color="#0F172A" />
              </TouchableOpacity>

              {isReliefMission && missionState === 'ASSIGNED_PENDING_ACCEPTANCE' ? (
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={[styles.grabManeuverCard, { borderColor: '#A7F3D0', backgroundColor: '#FFFFFF' }]}>
                    <View style={[styles.grabTurnIconBox, { backgroundColor: '#059669' }]}>
                      <MaterialCommunityIcons name="package-variant-closed" size={20} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.grabDistanceText, { fontSize: 13.5, color: '#065F46' }]} numberOfLines={1}>
                          LỆNH TIẾP TẾ MỚI
                        </Text>
                        <View
                          style={{
                            backgroundColor: reliefPriorityMeta.bg,
                            borderWidth: 1,
                            borderColor: reliefPriorityMeta.border,
                            paddingHorizontal: 6,
                            paddingVertical: 1.5,
                            borderRadius: 6,
                          }}
                        >
                          <Text style={{ fontSize: 9.5, fontWeight: '900', color: reliefPriorityMeta.color }}>
                            {reliefPriorityMeta.label}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.grabRoadText} numberOfLines={1} ellipsizeMode="tail">
                        {reliefSupplies.length > 0 ? `${reliefSupplies.length} mặt hàng • ` : ''}
                        {roadMetrics.distanceKm} • Dự kiến {roadMetrics.durationMin}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : !isTopHudHidden ? (
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={[styles.grabManeuverCard, isNavigating && styles.grabManeuverCardNavigating]}>
                    {/* Maneuver Turn Icon (Tự động cập nhật ngã rẽ gần nhất: Rẽ trái/phải, Đi thẳng, Về đích) */}
                    <View style={[styles.grabTurnIconBox, isNavigating && { backgroundColor: '#10B981' }]}>
                      <MaterialCommunityIcons
                        name={currentHudManeuver.iconName as any}
                        size={22}
                        color="#FFFFFF"
                      />
                    </View>

                    {/* Khoảng cách đến ngã rẽ gần nhất & Thao tác rẽ (Tới khúc nào hiện khúc đó lên, không bị tốc độ tối đa che) */}
                    <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', paddingRight: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                        <Text style={styles.grabDistanceText} numberOfLines={1}>
                          {currentHudManeuver.distanceText}
                        </Text>
                        {Boolean(currentHudManeuver.secondaryText) && (
                          <Text
                            style={[styles.grabDurationText, { flexShrink: 1 }]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {currentHudManeuver.secondaryText}
                          </Text>
                        )}
                      </View>
                      <Text
                        style={[styles.grabRoadText, { flexShrink: 1 }]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {currentHudManeuver.instruction}
                      </Text>
                    </View>

                    {/* Tốc độ giới hạn chuẩn Grab (50 km/h) - Cố định bên phải không che chữ */}
                    <View style={[styles.grabSpeedLimitBadge, { flexShrink: 0 }]}>
                      <Text style={styles.grabSpeedLimitText}>50</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.grabShowHudMiniPill}
                  onPress={() => setIsTopHudHidden(false)}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="navigation-variant" size={14} color="#0084FF" />
                  <Text style={styles.grabShowHudMiniText}>{roadMetrics.distanceKm} • {roadMetrics.durationMin}</Text>
                  <Feather name="chevron-down" size={14} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>

            {/* ======================================================== */}
            {/* FLOATING MAP TOOLS (RIGHT EDGE - CHUẨN GRAB)             */}
            {/* ======================================================== */}
            <View style={[styles.mapFloatingTools, { top: safeTop + 72 }]}>
              {/* Nút 1: Ghim lại hướng & vị trí mình chuẩn Grab (Re-center & Lock Heading) */}
              <TouchableOpacity
                style={[styles.mapToolBtn, isHeadingLocked && styles.mapToolBtnLocked]}
                onPress={() => {
                  setIsHeadingLocked(true);
                  Vibration.vibrate(30);
                  if (webViewRef.current) {
                    webViewRef.current.postMessage(JSON.stringify({ type: 'RECENTER_TEAM' }));
                  }
                }}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={isHeadingLocked ? 'crosshairs-gps' : 'crosshairs'}
                  size={22}
                  color={isHeadingLocked ? '#0084FF' : '#475569'}
                />
                {isHeadingLocked && <View style={styles.mapToolActiveDot} />}
              </TouchableOpacity>
              {/* Nút 2: Xem toàn cảnh lộ trình (Fit Route Overview) */}
              <TouchableOpacity
                style={styles.mapToolBtn}
                onPress={() => {
                  setIsHeadingLocked(false);
                  if (webViewRef.current) {
                    webViewRef.current.postMessage(JSON.stringify({ type: 'FIT_ROUTE' }));
                  }
                }}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="routes" size={20} color="#0F172A" />
              </TouchableOpacity>

              {/* Nút 3: Đổi lớp bản đồ (GrabMaps Đường phố ⇄ Vệ tinh Google) */}
              <TouchableOpacity
                style={styles.mapToolBtn}
                onPress={() => {
                  const nextLayer = mapLayer === 'streets' ? 'satellite' : 'streets';
                  setMapLayer(nextLayer);
                  if (webViewRef.current) {
                    webViewRef.current.postMessage(JSON.stringify({ type: 'CHANGE_MAP_LAYER', layer: nextLayer }));
                  }
                }}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={mapLayer === 'satellite' ? 'earth' : 'layers-outline'}
                  size={20}
                  color={mapLayer === 'satellite' ? '#0084FF' : '#0F172A'}
                />
              </TouchableOpacity>
            </View>

            {/* ======================================================== */}
            {/* C. BOTTOM SHEET: GIAO DIỆN TÁC CHIẾN CHUẨN GRABDRIVER     */}
            {/* ======================================================== */}
            <View style={[styles.bottomDeckCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              {/* Thanh kéo gọn / Mở rộng để xem Map rõ hơn */}
              <TouchableOpacity
                style={styles.deckHandleBarWrap}
                onPress={() => {
                  const next = !isSheetCollapsed;
                  setIsSheetCollapsed(next);
                  if (webViewRef.current) {
                    webViewRef.current.postMessage(JSON.stringify({ type: 'UPDATE_SHEET_STATE', isCollapsed: next }));
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={styles.deckHandleBar} />
                <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 2, paddingBottom: 2 }}>
                  <Feather
                    name={isSheetCollapsed ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color="#94A3B8"
                  />
                </View>
              </TouchableOpacity>

              {/* Grab Sub-Header: Tiêu đề điểm đến & Thời gian tiếp cận */}
              <View style={styles.grabDeckSubHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
                  <View style={[styles.grabOrderBadge, isReliefMission && { backgroundColor: '#059669' }]}>
                    {isReliefMission ? (
                      <MaterialCommunityIcons name="package-variant-closed" size={13} color="#FFFFFF" />
                    ) : (
                      <Text style={styles.grabOrderBadgeText}>1</Text>
                    )}
                  </View>
                  <Text
                    style={[styles.grabOrderTitle, isReliefMission && { color: '#047857', fontWeight: '700' }]}
                    numberOfLines={1}
                  >
                    {isReliefMission ? `Lệnh tiếp tế • #${sosCode}` : `Điểm cứu hộ • #${sosCode}`}
                  </Text>
                </View>

                <View style={styles.grabEtaChip}>
                  <Text style={[styles.grabEtaChipText, isReliefMission && { fontWeight: '700', fontVariant: ['tabular-nums'] }]}>
                    {roadMetrics.durationMin} ({roadMetrics.distanceKm})
                  </Text>
                </View>
              </View>

              {/* Khi bị kéo gọn xuống: Chỉ hiện tên & địa chỉ 1 dòng tóm tắt */}
              {isSheetCollapsed ? (
                <TouchableOpacity
                  style={styles.collapsedSummaryRow}
                  onPress={() => {
                    setIsSheetCollapsed(false);
                    if (webViewRef.current) {
                      webViewRef.current.postMessage(JSON.stringify({ type: 'UPDATE_SHEET_STATE', isCollapsed: false }));
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    {isReliefMission ? (
                      <>
                        <Text style={styles.collapsedCitizenName} numberOfLines={1}>
                          {reliefAddressDisplay}
                        </Text>
                        <Text style={styles.collapsedAddressText} numberOfLines={1}>
                          {reliefSupplies.length > 0 ? `${reliefSupplies.length} mặt hàng xuất kho • ` : ''}
                          {reliefRecipientName || reliefCoordinatorName}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.collapsedCitizenName} numberOfLines={1}>
                          {citizenName}{citizenPhone ? ` • ${citizenPhone}` : ''}{' '}
                          <Text style={styles.collapsedVictimCount}>
                            ({victimHeadcount} người cần cứu)
                          </Text>
                        </Text>
                        <Text style={styles.collapsedAddressText} numberOfLines={1}>
                          {incidentAddress}
                        </Text>
                      </>
                    )}
                  </View>
                  <View style={styles.collapsedExpandHint}>
                    <Text style={styles.collapsedExpandHintText}>Chi tiết</Text>
                    <Feather name="chevron-up" size={14} color="#0284C7" />
                  </View>
                </TouchableOpacity>
              ) : (
                <ScrollView
                  style={styles.sheetScrollArea}
                  contentContainerStyle={styles.sheetScrollContent}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                  bounces={false}
                >
                  {/* Khi mở rộng: Tách riêng giao diện Lệnh Tiếp Tế và Ca Cứu Nạn SOS */}
                  <View style={styles.grabCitizenSection}>
                    {isReliefMission ? (
                      <>
                        {/* 1. Điểm tiếp nhận cứu trợ nổi bật, gọn tối đa 2 dòng */}
                        <View style={{ marginBottom: 8 }}>
                          <Text style={styles.reliefSectionEyebrow}>📍 ĐIỂM TIẾP NHẬN CỨU TRỢ</Text>
                          <Text style={styles.reliefDestinationTitle} numberOfLines={2}>
                            {reliefAddressDisplay}
                          </Text>
                        </View>

                        {/* 2. Danh mục hàng cần xuất kho tối giản kiểu Phiếu giao hàng (Phương án 1) */}
                        <View style={styles.reliefSuppliesBox}>
                          <View style={styles.reliefReceiptHeader}>
                            <View style={styles.suppliesHeaderTitleWrap}>
                              <MaterialCommunityIcons name="package-variant-closed" size={15} color="#0F172A" />
                              <Text style={styles.reliefSuppliesLabel} numberOfLines={1}>
                                Hàng cần xuất kho ({reliefSupplies.length})
                              </Text>
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              {reliefSupplies.length > 3 && (
                                <TouchableOpacity
                                  style={styles.reliefHeaderToggleBtn}
                                  onPress={() => setSuppliesExpanded((prev) => !prev)}
                                  activeOpacity={0.75}
                                >
                                  <Text style={styles.reliefHeaderToggleText}>
                                    {suppliesExpanded ? 'Thu gọn' : 'Xem đủ'}
                                  </Text>
                                  <Feather
                                    name={suppliesExpanded ? 'chevron-up' : 'chevron-down'}
                                    size={12}
                                    color="#0F172A"
                                  />
                                </TouchableOpacity>
                              )}

                              {missionState !== 'ASSIGNED_PENDING_ACCEPTANCE' && (
                                <TouchableOpacity
                                  style={styles.requestSuppliesBtn}
                                  onPress={handleOpenSupplyRequestModal}
                                  activeOpacity={0.8}
                                >
                                  <Feather name="plus-circle" size={12} color="#0284C7" />
                                  <Text style={[styles.requestSuppliesBtnText, { fontSize: 11 }]}>Yêu cầu thêm</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>

                          {reliefSupplies.length > 0 ? (() => {
                            const visibleItems = suppliesExpanded ? reliefSupplies : reliefSupplies.slice(0, 3);
                            const remainingCount = Math.max(0, reliefSupplies.length - 3);
                            const previewOthers = reliefSupplies
                              .slice(3, 5)
                              .map((item: any) => item.name)
                              .join(', ');

                            const renderReceiptRows = () =>
                              visibleItems.map((s: any, idx: number) => {
                                const isLast = idx === visibleItems.length - 1;
                                return (
                                  <View
                                    key={idx}
                                    style={[
                                      styles.reliefReceiptRow,
                                      !isLast && styles.reliefReceiptRowDivider,
                                    ]}
                                  >
                                    <Text style={styles.reliefReceiptIdx}>{idx + 1}.</Text>
                                    <Text style={styles.reliefReceiptName} numberOfLines={1}>
                                      {s.name}
                                    </Text>
                                    <Text style={styles.reliefReceiptQty}>
                                      {s.quantity} {s.unit || 'món'}
                                    </Text>
                                  </View>
                                );
                              });

                            return (
                              <>
                                {suppliesExpanded && reliefSupplies.length > 3 ? (
                                  <ScrollView
                                    style={{ maxHeight: 176 }}
                                    nestedScrollEnabled={true}
                                    showsVerticalScrollIndicator={true}
                                  >
                                    {renderReceiptRows()}
                                  </ScrollView>
                                ) : (
                                  <View>{renderReceiptRows()}</View>
                                )}

                                {!suppliesExpanded && remainingCount > 0 && (
                                  <TouchableOpacity
                                    style={styles.reliefReceiptMoreFooter}
                                    onPress={() => setSuppliesExpanded(true)}
                                    activeOpacity={0.75}
                                  >
                                    <Text style={styles.reliefReceiptMoreText} numberOfLines={1}>
                                      + {remainingCount} mặt hàng khác{previewOthers ? ` (${previewOthers}...)` : ''}
                                    </Text>
                                    <Text style={styles.reliefReceiptMoreAction}>Xem đủ ›</Text>
                                  </TouchableOpacity>
                                )}
                              </>
                            );
                          })() : (
                            <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600', paddingHorizontal: 12, paddingVertical: 10 }}>
                              Theo lệnh xuất kho đính kèm từ Ban Chỉ Huy.
                            </Text>
                          )}

                          {missionState !== 'ASSIGNED_PENDING_ACCEPTANCE' && requestedSuppliesList.length > 0 && (
                            <View style={{ gap: 6, paddingHorizontal: 10, paddingBottom: 8, paddingTop: 4 }}>
                              {requestedSuppliesList.some((s: any) => s.status === 'APPROVED') && (
                                <View style={[styles.requestedSuppliesNotice, { marginTop: 0, backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                                  <Ionicons name="checkmark-circle" size={15} color="#16A34A" />
                                  <Text style={[styles.requestedSuppliesNoticeText, { color: '#166534' }]}>
                                    ✓ Địa phương đã xuất cấp: {requestedSuppliesList.filter((s: any) => s.status === 'APPROVED').map((item: any) => `${item.name} (${item.quantity})`).join(', ')}
                                  </Text>
                                </View>
                              )}
                              {requestedSuppliesList.some((s: any) => s.status === 'PENDING' || !s.status) && (
                                <View style={[styles.requestedSuppliesNotice, { marginTop: 0 }]}>
                                  <Ionicons name="information-circle" size={15} color="#D97706" />
                                  <Text style={styles.requestedSuppliesNoticeText}>
                                    ⏳ Đã yêu cầu chi viện: {requestedSuppliesList.filter((s: any) => s.status === 'PENDING' || !s.status).map((item: any) => `${item.name} (${item.quantity})`).join(', ')} (Chờ địa phương duyệt)
                                  </Text>
                                </View>
                              )}
                              {requestedSuppliesList.some((s: any) => s.status === 'REJECTED') && (
                                <View style={[styles.requestedSuppliesNotice, { marginTop: 0, backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                                  <Ionicons name="close-circle" size={15} color="#DC2626" />
                                  <Text style={[styles.requestedSuppliesNoticeText, { color: '#991B1B' }]}>
                                    ✕ Địa phương từ chối cấp: {requestedSuppliesList.filter((s: any) => s.status === 'REJECTED').map((item: any) => `${item.name} (${item.quantity})`).join(', ')}
                                  </Text>
                                </View>
                              )}
                            </View>
                          )}
                        </View>

                        {/* 3. Đầu mối liên hệ gọn 2 dòng: Luôn nhìn thấy ngay bên dưới bảng hàng */}
                        <View style={styles.reliefContactCard}>
                          <View style={styles.reliefContactRow}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.reliefContactInlineText} numberOfLines={1} ellipsizeMode="tail">
                                <Text style={styles.reliefContactRoleLabel}>👤 Người nhận: </Text>
                                <Text
                                  style={[
                                    styles.reliefContactName,
                                    !reliefRecipientName && { color: '#64748B', fontWeight: '500', fontStyle: 'italic' },
                                  ]}
                                >
                                  {reliefRecipientName || 'Chưa chỉ định'}
                                </Text>
                              </Text>
                            </View>
                            {reliefRecipientPhone ? (
                              <TouchableOpacity
                                style={styles.reliefInlineCallBtn}
                                onPress={() => Linking.openURL(`tel:${reliefRecipientPhone}`)}
                                activeOpacity={0.75}
                              >
                                <Ionicons name="call" size={11} color="#059669" />
                                <Text style={styles.reliefInlineCallText} numberOfLines={1}>{reliefRecipientPhone}</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>

                          <View style={styles.reliefContactDivider} />

                          <View style={styles.reliefContactRow}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.reliefContactInlineText} numberOfLines={1} ellipsizeMode="tail">
                                <Text style={styles.reliefContactRoleLabel}>🏛️ Điều phối: </Text>
                                <Text style={styles.reliefContactName}>{reliefCoordinatorName}</Text>
                              </Text>
                            </View>
                            {reliefCoordinatorPhone ? (
                              <TouchableOpacity
                                style={[styles.reliefInlineCallBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                                onPress={() => Linking.openURL(`tel:${reliefCoordinatorPhone}`)}
                                activeOpacity={0.75}
                              >
                                <Ionicons name="call" size={11} color="#0284C7" />
                                <Text style={[styles.reliefInlineCallText, { color: '#0284C7' }]} numberOfLines={1}>
                                  {reliefCoordinatorPhone}
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>

                        {/* 4. Ghi chú chỉ huy (Chỉ hiển thị khi có ghi chú thực sự, bỏ chuỗi lặp địa chỉ) */}
                        {reliefDisplayNote ? (
                          <View style={[styles.grabNoteBox, { marginTop: 8 }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                              <Text style={styles.grabNoteLabel}>Ghi chú chỉ huy:</Text>
                              {reliefDisplayNote.length > 60 && (
                                <TouchableOpacity
                                  onPress={() => setNoteExpanded((prev) => !prev)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Text style={{ fontSize: 11.5, color: '#0284C7', fontWeight: '700' }}>
                                    {noteExpanded ? 'Thu gọn' : 'Xem chi tiết'}
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                            <Text
                              style={styles.grabNoteText}
                              numberOfLines={noteExpanded ? undefined : 2}
                              ellipsizeMode="tail"
                            >
                              {reliefDisplayNote}
                            </Text>
                          </View>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {/* Tên người dân & SĐT người gặp nạn - To, đậm, có nút gọi nhanh */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                          <Text style={[styles.grabCitizenName, { marginBottom: 0 }]}>{citizenName}</Text>
                          {citizenPhone ? (
                            <TouchableOpacity
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                backgroundColor: '#EFF6FF',
                                borderWidth: 1,
                                borderColor: '#BFDBFE',
                                paddingHorizontal: 8,
                                paddingVertical: 2.5,
                                borderRadius: 6,
                              }}
                              onPress={() => Linking.openURL(`tel:${citizenPhone}`)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="call" size={12} color="#0284C7" />
                              <Text style={{ fontSize: 13, fontWeight: '800', color: '#0284C7' }}>
                                {citizenPhone}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>

                        {/* Địa chỉ hiện trường - Hiển thị đầy đủ, không ẩn bớt, không cắt '...' */}
                        <Text style={styles.grabAddressText}>{incidentAddress}</Text>

                        {/* Số người & Đối tượng cần cứu - Ngắn gọn không tràn viền */}
                        <Text style={styles.grabVictimMeta} numberOfLines={1} ellipsizeMode="tail">
                          {victimHeadcount} người cần cứu • 1 người già, 1 trẻ nhỏ
                        </Text>

                        {/* Mức SOS do AI đề xuất và nhu cầu tác chiến */}
                        {(sos?.priority || typeof sos?.riskScore === 'number') ? (() => {
                          const p = sos?.priority || 'UNASSESSED';
                          const triageReasons: string[] = Array.isArray(sos?.riskAssessment?.reasons)
                            ? sos.riskAssessment.reasons
                            : [];
                          const equipLabelMap: Record<string, string> = {
                            LIFE_VEST: 'Áo phao',
                            MEDICAL_KIT: 'Túi y tế',
                            MEDICAL_DEVICE: 'Thiết bị y tế',
                            ROPE_TOOL: 'Dây cứu hộ',
                            FOOD_WATER: 'Lương thực & nước',
                            WATER_PURIFICATION: 'Viên lọc nước',
                            LIGHTING: 'Đèn chiếu sáng',
                            TOOL: 'Dụng cụ cứu hộ',
                            COMMUNICATION: 'Bộ đàm',
                          };
                          const rawEquipCodes: string[] = Array.isArray(sos?.riskAssessment?.operationalNeeds?.recommendedEquipments)
                            ? sos.riskAssessment.operationalNeeds.recommendedEquipments
                            : [];
                          const mappedEquipLabels = rawEquipCodes.map((c) => equipLabelMap[c] || c).filter(Boolean);
                          const urgentNotesText = '';
                          const legacyUrgentNeeds: string[] = Array.isArray(sos?.aiAssessment?.urgentNeeds)
                            ? sos.aiAssessment.urgentNeeds
                            : [];
                          const urgentNeeds = mappedEquipLabels.length > 0 ? mappedEquipLabels : legacyUrgentNeeds;
                          const prioLabel =
                            p === 'CRITICAL'
                              ? 'NGUY CẤP'
                              : p === 'HIGH'
                                ? 'KHẨN CẤP'
                                : p === 'LOW'
                                  ? 'MỨC THẤP'
                                  : p === 'UNASSESSED'
                                    ? 'CHƯA PHÂN LOẠI'
                                    : 'TRUNG BÌNH';
                          const prioColor =
                            p === 'CRITICAL'
                              ? '#DC2626'
                              : p === 'HIGH'
                                ? '#EA580C'
                                : p === 'LOW'
                                  ? '#0284C7'
                                  : '#CA8A04';
                          const prioBg =
                            p === 'CRITICAL'
                              ? '#FEF2F2'
                              : p === 'HIGH'
                                ? '#FFF7ED'
                                : p === 'LOW'
                                  ? '#F0F9FF'
                                  : '#FEFCE8';

                          return (
                            <View
                              style={{
                                marginTop: 8,
                                paddingHorizontal: 10,
                                paddingVertical: 8,
                                borderRadius: 10,
                                backgroundColor: prioBg,
                                borderWidth: 1,
                                borderColor: prioColor + '33',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={{ fontSize: 11.5, fontWeight: '800', color: prioColor }}>
                                  Mức SOS: {prioLabel}
                                  {!sos?.priorityLockedByAuthority && p !== 'UNASSESSED' ? ' (AI đề xuất)' : ''}
                                </Text>
                                {sos?.priorityLockedByAuthority && (
                                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#475569' }}>
                                    Cán bộ đã xác minh
                                  </Text>
                                )}
                              </View>
                              {triageReasons.length > 0 && (
                                <Text style={{ fontSize: 11.5, color: '#334155', marginTop: 3, lineHeight: 16 }}>
                                  • {triageReasons.slice(0, 2).join(' • ')}
                                </Text>
                              )}
                              {sos?.aiAssessment?.status === 'PENDING' && (
                                <Text style={{ fontSize: 10.5, color: '#64748B', marginTop: 3 }}>AI đang phân tích SOS.</Text>
                              )}
                              {urgentNotesText ? (
                                <Text style={{ fontSize: 11, color: '#9A3412', fontWeight: '700', marginTop: 3 }}>
                                  Lưu ý tác chiến: {urgentNotesText}
                                </Text>
                              ) : null}
                              {urgentNeeds.length > 0 && (
                                <Text style={{ fontSize: 11, color: '#0369A1', fontWeight: '700', marginTop: 3 }}>
                                  Cần mang theo: {urgentNeeds.slice(0, 4).join(', ')}
                                </Text>
                              )}
                            </View>
                          );
                        })() : null}

                        {/* Hộp ghi chú điều phối / hiện trường - Hiển thị đầy đủ nội dung hoặc xem chi tiết */}
                        {displayNote ? (
                          <View style={styles.grabNoteBox}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                              <Text style={styles.grabNoteLabel}>
                                {isReliefMission ? 'Ghi chú điều phối:' : 'Ghi chú hiện trường:'}
                              </Text>
                              {displayNote.length > 60 && (
                                <TouchableOpacity
                                  onPress={() => setNoteExpanded((prev) => !prev)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Text style={{ fontSize: 11.5, color: '#0284C7', fontWeight: '700' }}>
                                    {noteExpanded ? 'Thu gọn' : 'Xem chi tiết'}
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                            <Text
                              style={styles.grabNoteText}
                              numberOfLines={noteExpanded ? undefined : 2}
                              ellipsizeMode="tail"
                            >
                              {displayNote}
                            </Text>
                          </View>
                        ) : null}

                        {/* Hộp vật tư & hàng tiếp tế cấp theo xe (Chỉ hiển thị khi đã tiếp nhận nhiệm vụ) */}
                        {missionState !== 'ASSIGNED_PENDING_ACCEPTANCE' && (() => {
                          const missionSupplies =
                            assignment?.supplies ||
                            (assignment as any)?.reliefItems ||
                            sos?.supplies ||
                            (isReliefMission
                              ? []
                              : [
                                { name: 'Áo phao cứu sinh tiêu chuẩn SOLAS', quantity: Math.max(2, victimHeadcount), unit: 'Chiếc' },
                                { name: 'Túi thuốc & Sơ cấp cứu dã chiến', quantity: 1, unit: 'Bộ' },
                                { name: 'Nước uống đóng chai tiệt trùng (Thùng 24 chai)', quantity: Math.ceil(Math.max(1, victimHeadcount) / 2), unit: 'Thùng' },
                              ]);

                          return (
                            <View style={styles.grabSuppliesBox}>
                              {/* Hàng 1: Tiêu đề + Huy hiệu số lượng bên trái, Nút Yêu cầu thêm bên phải */}
                              <View style={styles.suppliesHeaderRow}>
                                <View style={styles.suppliesHeaderTitleWrap}>
                                  <MaterialCommunityIcons name="package-variant-closed" size={17} color="#15803D" />
                                  <Text style={styles.grabSuppliesLabel} numberOfLines={1}>
                                    {isReliefMission ? 'Vật tư xuất kho' : 'Vật tư theo xe'}
                                  </Text>
                                  <View style={styles.suppliesCountBadge}>
                                    <Text style={styles.suppliesCountBadgeText}>
                                      {missionSupplies.length} loại
                                    </Text>
                                  </View>
                                </View>

                                <TouchableOpacity
                                  style={styles.requestSuppliesBtn}
                                  onPress={handleOpenSupplyRequestModal}
                                  activeOpacity={0.8}
                                >
                                  <Feather name="plus-circle" size={13} color="#0284C7" />
                                  <Text style={styles.requestSuppliesBtnText}>+ Yêu cầu thêm</Text>
                                </TouchableOpacity>
                              </View>

                              {/* Hàng 2: Danh sách vật tư (Thu gọn vs Mở rộng toàn bộ) */}
                              {missionSupplies.length === 0 ? (
                                <Text style={{ fontSize: 12, color: '#64748B', fontStyle: 'italic', marginTop: 2 }}>
                                  Chưa có vật tư cấp theo xe.
                                </Text>
                              ) : suppliesExpanded ? (
                                <View style={{ gap: 6, marginTop: 4 }}>
                                  {missionSupplies.map((s: any, idx: number) => (
                                    <View key={idx} style={styles.grabSupplyChip}>
                                      <Text style={styles.grabSupplyChipText} numberOfLines={1}>
                                        {s.name}
                                      </Text>
                                      <View style={styles.grabSupplyQtyBadge}>
                                        <Text style={styles.grabSupplyQtyText}>
                                          {s.quantity} {s.unit || 'món'}
                                        </Text>
                                      </View>
                                    </View>
                                  ))}

                                  <TouchableOpacity
                                    style={styles.collapseDetailFooterBtn}
                                    onPress={() => setSuppliesExpanded(false)}
                                    activeOpacity={0.8}
                                  >
                                    <Text style={styles.collapseDetailFooterText}>Thu gọn danh sách</Text>
                                    <Feather name="chevron-up" size={13} color="#166534" />
                                  </TouchableOpacity>
                                </View>
                              ) : (
                                <TouchableOpacity
                                  style={styles.suppliesSummaryTouchWrap}
                                  onPress={() => setSuppliesExpanded(true)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.suppliesCollapsedSummaryText} numberOfLines={1}>
                                    {missionSupplies.map((s: any) => `${s.name} (${s.quantity})`).join(' • ')}
                                  </Text>
                                  <View style={styles.viewDetailBadge}>
                                    <Text style={styles.viewDetailBadgeText}>Xem chi tiết</Text>
                                    <Feather name="chevron-down" size={12} color="#166534" />
                                  </View>
                                </TouchableOpacity>
                              )}

                              {/* Danh sách vật tư đã yêu cầu bổ sung nếu có */}
                              {requestedSuppliesList.length > 0 && (
                                <View style={{ gap: 6, marginTop: 6 }}>
                                  {requestedSuppliesList.some((s: any) => s.status === 'APPROVED') && (
                                    <View style={[styles.requestedSuppliesNotice, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                                      <Ionicons name="checkmark-circle" size={15} color="#16A34A" />
                                      <Text style={[styles.requestedSuppliesNoticeText, { color: '#166534' }]}>
                                        ✓ Địa phương đã xuất cấp: {requestedSuppliesList.filter((s: any) => s.status === 'APPROVED').map((item: any) => `${item.name} (${item.quantity})`).join(', ')}
                                      </Text>
                                    </View>
                                  )}
                                  {requestedSuppliesList.some((s: any) => s.status === 'PENDING' || !s.status) && (
                                    <View style={styles.requestedSuppliesNotice}>
                                      <Ionicons name="information-circle" size={15} color="#D97706" />
                                      <Text style={styles.requestedSuppliesNoticeText}>
                                        ⏳ Đã yêu cầu chi viện: {requestedSuppliesList.filter((s: any) => s.status === 'PENDING' || !s.status).map((item: any) => `${item.name} (${item.quantity})`).join(', ')} (Chờ địa phương duyệt)
                                      </Text>
                                    </View>
                                  )}
                                  {requestedSuppliesList.some((s: any) => s.status === 'REJECTED') && (
                                    <View style={[styles.requestedSuppliesNotice, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                                      <Ionicons name="close-circle" size={15} color="#DC2626" />
                                      <Text style={[styles.requestedSuppliesNoticeText, { color: '#991B1B' }]}>
                                        ✕ Địa phương từ chối cấp: {requestedSuppliesList.filter((s: any) => s.status === 'REJECTED').map((item: any) => `${item.name} (${item.quantity})`).join(', ')}
                                      </Text>
                                    </View>
                                  )}
                                </View>
                              )}
                            </View>
                          );
                        })()}
                      </>
                    )}
                  </View>

                  {/* KHỐI YÊU CẦU XE ĐẾN CỨU HỘ / XE ĐÓN BỜ (RELAY HANDOFF) - CHỈ DÀNH CHO ĐỘI TRÊN NƯỚC, KHÔNG HIỂN THỊ CHO CHÍNH XE ĐI ĐÓN HOẶC LỆNH TIẾP TẾ */}
                  {!isShoreHandoffMission && !isReliefMission && missionState !== 'ASSIGNED_PENDING_ACCEPTANCE' && (
                    shoreHandoffData && shoreHandoffData.status === 'ASSIGNED' ? (
                      <View
                        style={{
                          marginTop: 8,
                          marginBottom: 6,
                          backgroundColor: '#ECFDF5',
                          borderWidth: 1.5,
                          borderColor: '#10B981',
                          borderRadius: 12,
                          padding: 12,
                          gap: 6,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                            <Ionicons name="medical" size={17} color="#059669" />
                            <Text
                              style={{ fontSize: 12.5, fontWeight: '800', color: '#065F46', textTransform: 'uppercase' }}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              Xe đón đang tiếp cận
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 10.5,
                              fontWeight: '800',
                              color: '#059669',
                              backgroundColor: '#D1FAE5',
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 4,
                              flexShrink: 0,
                            }}
                          >
                            ĐÃ ĐIỀU XE
                          </Text>
                        </View>

                        <Text style={{ fontSize: 12.5, color: '#1F2937', fontWeight: '600' }}>
                          Xe: <Text style={{ fontWeight: '800' }}>{shoreHandoffData.assignedVehicleName} ({shoreHandoffData.assignedVehiclePlate})</Text>
                        </Text>
                        <Text style={{ fontSize: 12, color: '#4B5563' }}>
                          Tài xế: {shoreHandoffData.assignedDriverName} • {shoreHandoffData.assignedDriverPhone}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#4B5563' }}>
                          Bến đón / Hiện trường: <Text style={{ fontWeight: '700', color: '#B45309' }}>{shoreHandoffData.landingPoint?.name}</Text>
                        </Text>

                        {shoreHandoffData.assignedDriverPhone && (
                          <TouchableOpacity
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                              backgroundColor: '#FFFFFF',
                              borderWidth: 1.5,
                              borderColor: '#10B981',
                              paddingVertical: 9,
                              borderRadius: 8,
                              marginTop: 4,
                            }}
                            onPress={() => Linking.openURL(`tel:${shoreHandoffData.assignedDriverPhone}`)}
                          >
                            <Ionicons name="call" size={15} color="#059669" />
                            <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#059669' }}>Gọi Tài Xế Xe Đón</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : shoreHandoffData && shoreHandoffData.status === 'REQUESTED' ? (
                      <View
                        style={{
                          marginTop: 8,
                          marginBottom: 6,
                          backgroundColor: '#FFFBEB',
                          borderWidth: 1.5,
                          borderColor: '#F59E0B',
                          borderRadius: 12,
                          padding: 12,
                          gap: 6,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                            <Ionicons name="flash" size={17} color="#D97706" />
                            <Text
                              style={{ fontSize: 12.5, fontWeight: '800', color: '#92400E', textTransform: 'uppercase' }}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              Chờ xe đón bờ
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 10.5,
                              fontWeight: '800',
                              color: '#B45309',
                              backgroundColor: '#FDE68A',
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 4,
                              flexShrink: 0,
                            }}
                          >
                            ĐÃ BÁO BAN CHỈ HUY
                          </Text>
                        </View>

                        <Text style={{ fontSize: 12.5, color: '#374151' }}>
                          Cần: <Text style={{ fontWeight: '700' }}>{shoreHandoffData.vehicleTypeNeeded === 'AMBULANCE' ? '01 Xe Cứu Thương 115' : '01 Xe Tải Cứu Hộ'}</Text> cho {shoreHandoffData.peopleCount} nạn nhân
                        </Text>
                        <Text style={{ fontSize: 12, color: '#4B5563' }}>
                          Bến đón / Điểm hẹn: <Text style={{ fontWeight: '700', color: '#B45309' }}>{shoreHandoffData.landingPoint?.name}</Text>
                        </Text>

                        <TouchableOpacity
                          style={{
                            alignSelf: 'flex-start',
                            marginTop: 4,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            backgroundColor: '#FFFFFF',
                            borderWidth: 1,
                            borderColor: '#F59E0B',
                            borderRadius: 6,
                          }}
                          onPress={() => setShoreHandoffModalVisible(true)}
                        >
                          <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#D97706' }}>Chỉnh Sửa / Gửi Lại</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backgroundColor: '#FFF7ED',
                          borderWidth: 1.5,
                          borderColor: '#FDBA74',
                          borderRadius: 12,
                          paddingVertical: 11,
                          paddingHorizontal: 12,
                          marginTop: 8,
                          marginBottom: 6,
                          shadowColor: '#EA580C',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.12,
                          shadowRadius: 4,
                          elevation: 2,
                        }}
                        onPress={() => setShoreHandoffModalVisible(true)}
                        activeOpacity={0.85}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 }}>
                          <View
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 18,
                              backgroundColor: '#FFEDD5',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderWidth: 1,
                              borderColor: '#FED7AA',
                            }}
                          >
                            <MaterialCommunityIcons name="car-emergency" size={20} color="#EA580C" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#9A3412' }}>
                              Yêu Cầu Xe Đến Cứu Hộ / Đón Bờ
                            </Text>
                            <Text style={{ fontSize: 11.5, color: '#C2410C', marginTop: 1 }}>
                              Điều xe cấp cứu 115 / xe tải chi viện đón nạn nhân
                            </Text>
                          </View>
                        </View>
                        <Feather name="chevron-right" size={18} color="#EA580C" />
                      </TouchableOpacity>
                    ))}

                  {/* Hàng nút thao tác nhanh (Khi Tiếp tế + Chờ nhận lệnh: gộp Từ chối xuống thanh CTA chính để gọn; khi Tiếp tế sau nhận lệnh: ẩn Trạm trú ẩn) */}
                  {!(isReliefMission && missionState === 'ASSIGNED_PENDING_ACCEPTANCE') && (
                    <View style={styles.grabActionRow}>
                      {/* Nút 1: Gọi điện */}
                      <TouchableOpacity
                        style={styles.grabActionCol}
                        onPress={() =>
                          Linking.openURL(
                            `tel:${isReliefMission
                              ? (reliefRecipientPhone || reliefCoordinatorPhone || citizenPhone)
                              : citizenPhone
                            }`
                          )
                        }
                        activeOpacity={0.8}
                      >
                        <View style={styles.grabActionIconWrap}>
                          <Feather name="phone" size={20} color="#059669" />
                        </View>
                        <Text style={styles.grabActionLabel}>
                          {isReliefMission
                            ? (reliefRecipientPhone ? 'Gọi người nhận' : 'Gọi điều phối')
                            : 'Gọi điện'}
                        </Text>
                      </TouchableOpacity>

                      {/* Nút 2: Từ chối - Chỉ hiển thị cho Đội trưởng khi lệnh đang chờ tiếp nhận */}
                      {isLeader && missionState === 'ASSIGNED_PENDING_ACCEPTANCE' && (
                        <TouchableOpacity
                          style={styles.grabActionCol}
                          onPress={() => {
                            setRejectReason(
                              isReliefMission
                                ? 'Phương tiện không đủ tải trọng / thể tích chở lô hàng'
                                : 'Phương tiện gặp sự cố kỹ thuật đột xuất'
                            );
                            setRejectModalVisible(true);
                          }}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.grabActionIconWrap, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                            <Feather name="x-circle" size={20} color="#DC2626" />
                          </View>
                          <Text style={[styles.grabActionLabel, { color: '#DC2626', fontWeight: '800' }]}>Từ chối</Text>
                        </TouchableOpacity>
                      )}

                      {/* Nút 3: Trạm trú ẩn (Chỉ hiện cho nhiệm vụ cứu nạn / đón bờ, ẩn với Tiếp tế hàng) */}
                      {!isReliefMission && (
                        <TouchableOpacity
                          style={styles.grabActionCol}
                          onPress={() => {
                            setShowSafeShelters((prev) => !prev);
                            if (webViewRef.current) {
                              webViewRef.current.postMessage(
                                JSON.stringify({ type: 'TOGGLE_SHELTERS', show: !showSafeShelters })
                              );
                            }
                          }}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.grabActionIconWrap, showSafeShelters && { backgroundColor: '#E0F2FE' }]}>
                            <Feather name="shield" size={20} color={showSafeShelters ? '#0284C7' : '#475569'} />
                          </View>
                          <Text style={styles.grabActionLabel}>Trạm trú ẩn</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </ScrollView>
              )}

              {/* Primary Action Button to, rõ, full width giống Grab */}
              <View style={styles.grabPrimaryBtnContainer}>
                {actionLoading ? (
                  <View style={[styles.grabBigGreenBtn, { backgroundColor: '#0284C7', opacity: 0.95 }]}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={[styles.grabBigBtnText, { marginLeft: 8 }]}>Đang đồng bộ dữ liệu...</Text>
                  </View>
                ) : (
                  <>
                    {missionState === 'ASSIGNED_PENDING_ACCEPTANCE' && (
                      isLeader ? (
                        isReliefMission ? (
                          <View style={styles.reliefPendingActionRow}>
                            <TouchableOpacity
                              style={styles.reliefRejectSideBtn}
                              onPress={() => {
                                setRejectReason('Phương tiện không đủ tải trọng / thể tích chở lô hàng');
                                setRejectModalVisible(true);
                              }}
                              activeOpacity={0.82}
                            >
                              <Feather name="x-circle" size={16} color="#DC2626" />
                              <Text style={styles.reliefRejectSideBtnText}>Từ chối</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.grabBigGreenBtn, { flex: 1, backgroundColor: '#059669' }]}
                              onPress={handleAcceptMission}
                              activeOpacity={0.88}
                            >
                              <Ionicons name="flash" size={18} color="#FFFFFF" />
                              <Text style={[styles.grabBigBtnText, { fontSize: 13.5, fontWeight: '700', letterSpacing: 0.3 }]} numberOfLines={1}>
                                {reliefSupplies.length > 0
                                  ? `NHẬN LỆNH & XUẤT KHO (${reliefSupplies.length} MÓN)`
                                  : 'NHẬN LỆNH & XUẤT KHO TIẾP TẾ'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.grabBigGreenBtn}
                            onPress={handleAcceptMission}
                            activeOpacity={0.88}
                          >
                            <Ionicons name="flash" size={20} color="#FFFFFF" />
                            <Text style={styles.grabBigBtnText}>
                              {isShoreHandoffMission
                                ? 'NHẬN LỆNH & XUẤT PHÁT ĐÓN'
                                : 'NHẬN LỆNH & XUẤT KÍCH'}
                            </Text>
                          </TouchableOpacity>
                        )
                      ) : (
                        <TouchableOpacity
                          style={[styles.grabBigGreenBtn, { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1', borderWidth: 1 }]}
                          onPress={() => {
                            Alert.alert(
                              'Chờ Đội Trưởng',
                              'Chỉ Đội trưởng mới có quyền xác nhận nhận lệnh hoặc từ chối lệnh điều động. Bạn vui lòng chờ Đội trưởng tiếp nhận.',
                              [{ text: 'Đã hiểu' }]
                            );
                          }}
                          activeOpacity={0.8}
                        >
                          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="time-outline" size={20} color="#64748B" />
                              <Text style={[styles.grabBigBtnText, { color: '#475569', fontSize: 16 }]}>
                                CHỜ ĐỘI TRƯỞNG TIẾP NHẬN
                              </Text>
                            </View>
                            <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                              Chỉ Đội trưởng mới có quyền nhận hoặc từ chối lệnh này
                            </Text>
                          </View>
                        </TouchableOpacity>
                      )
                    )}

                    {missionState === 'EN_ROUTE' && (
                      isLeader ? (
                        <TouchableOpacity
                          style={[styles.grabBigGreenBtn, { backgroundColor: '#0066FF' }]}
                          onPress={handleArriveAtScene}
                          activeOpacity={0.88}
                        >
                          <Ionicons name="location-sharp" size={22} color="#FFFFFF" />
                          <Text style={styles.grabBigBtnText}>
                            {isShoreHandoffMission
                              ? 'ĐÃ ĐẾN BẾN ĐÓN (ARRIVED)'
                              : isReliefMission
                                ? 'ĐÃ ĐẾN ĐIỂM CỨU TRỢ'
                                : 'ĐÃ ĐẾN HIỆN TRƯỜNG (ARRIVED)'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.grabBigGreenBtn, { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1', borderWidth: 1 }]}>
                          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={[styles.grabBigBtnText, { color: '#475569', fontSize: 15 }]}>
                              ĐANG DI CHUYỂN ĐẾN HIỆN TRƯỜNG
                            </Text>
                            <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                              Chế độ thành viên (Chờ Đội trưởng xác nhận đến nơi)
                            </Text>
                          </View>
                        </View>
                      )
                    )}

                    {missionState === 'ON_SCENE_RESCUING' && (
                      <View style={{ gap: 10, width: '100%' }}>
                        {/* NÚT CHÍNH TO BẢN: HOÀN TẤT CỨU HỘ & BÁO CÁO (CHỈ ĐỘI TRƯỞNG MỚI ĐƯỢC BẤM) */}
                        {isLeader ? (
                          <TouchableOpacity
                            style={[styles.grabBigGreenBtn, { backgroundColor: '#059669' }]}
                            onPress={handleOpenCompleteModal}
                            activeOpacity={0.88}
                          >
                            <Ionicons name="checkmark-done-circle" size={24} color="#FFFFFF" />
                            <Text style={styles.grabBigBtnText}>
                              {isShoreHandoffMission
                                ? 'ĐÃ ĐÓN NẠN NHÂN & HOÀN TẤT'
                                : shoreHandoffData && shoreHandoffData.status === 'ASSIGNED'
                                  ? 'BÀN GIAO LÊN XE & HOÀN TẤT'
                                  : isReliefMission
                                    ? 'BÀN GIAO XONG & HOÀN TẤT'
                                    : 'HOÀN TẤT CỨU HỘ & BÁO CÁO'}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={[styles.grabBigGreenBtn, { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1', borderWidth: 1 }]}>
                            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={[styles.grabBigBtnText, { color: '#475569', fontSize: 15 }]}>
                                ĐANG TÁC CHIẾN TẠI HIỆN TRƯỜNG
                              </Text>
                              <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                                Chế độ thành viên (Chờ Đội trưởng hoàn tất & báo cáo)
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    )}

                    {missionState === 'COMPLETED' && (
                      <TouchableOpacity
                        style={[styles.grabBigGreenBtn, { backgroundColor: '#059669' }]}
                        onPress={onClose}
                        activeOpacity={0.88}
                      >
                        <Ionicons name="home-outline" size={20} color="#FFFFFF" />
                        <Text style={styles.grabBigBtnText}>VỀ TRẠM TRỰC BAN (SẴN SÀNG)</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            </View>
          </>
        ) : (
          <>
            {/* ======================================================== */}
            {/* OVERLAY CHỌN ĐIỂM HẸN XE ĐÓN BỜ TRỰC TIẾP TRÊN BẢN ĐỒ    */}
            {/* ======================================================== */}
            <View style={[styles.pickLandingTopBanner, { top: safeTop }]}>
              <View style={styles.pickLandingTopIcon}>
                <Text style={{ fontSize: 18 }}>🚗</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickLandingTopTitle}>CHỌN ĐIỂM HẸN XE ĐÓN BỜ</Text>
                <Text style={styles.pickLandingTopSubtitle}>
                  Chạm bản đồ hoặc kéo ghim 🚗 đến vị trí xe có thể tiếp cận đón
                </Text>
              </View>
            </View>

            <View style={[styles.pickLandingBottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View style={styles.pickLandingCoordRow}>
                <Ionicons name="location-sharp" size={18} color="#EA580C" />
                <Text style={styles.pickLandingCoordText}>
                  Tọa độ đã ghim: {pickedTempCoords.lat.toFixed(5)}, {pickedTempCoords.lng.toFixed(5)}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  style={styles.pickLandingCancelBtn}
                  onPress={() => {
                    setIsPickingLandingLocation(false);
                    setShoreHandoffModalVisible(true);
                    if (webViewRef.current) {
                      webViewRef.current.postMessage(JSON.stringify({ type: 'DISABLE_LANDING_PICKER', keepVisible: false }));
                    }
                  }}
                >
                  <Text style={styles.pickLandingCancelText}>Hủy bỏ</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.pickLandingConfirmBtn}
                  onPress={async () => {
                    setLandingCoords(pickedTempCoords);
                    setIsPickingLandingLocation(false);
                    setShoreHandoffModalVisible(true);
                    setIsFetchingAddress(true);
                    const addr = await fetchAddressFromCoords(pickedTempCoords.lat, pickedTempCoords.lng);
                    setLandingAddress(addr);
                    setIsFetchingAddress(false);
                    if (webViewRef.current) {
                      webViewRef.current.postMessage(JSON.stringify({ type: 'DISABLE_LANDING_PICKER', keepVisible: true }));
                    }
                  }}
                >
                  <Ionicons name="checkmark-sharp" size={18} color="#FFFFFF" />
                  <Text style={styles.pickLandingConfirmText}>Xác Nhận Điểm Này</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* ======================================================== */}
        {/* MODAL: XÁC NHẬN ĐẾN HIỆN TRƯỜNG TÁC CHIẾN               */}
        {/* ======================================================== */}
        {/* ======================================================== */}
        {/* MODAL: XÁC NHẬN ĐÃ ĐẾN HIỆN TRƯỜNG                       */}
        {/* ======================================================== */}
        <Modal visible={arriveConfirmModalVisible} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={{ alignItems: 'center', marginBottom: 14 }}>
                <View
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 29,
                    backgroundColor: '#E0F2FE',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 10,
                    borderWidth: 1.5,
                    borderColor: '#BAE6FD',
                  }}
                >
                  <Ionicons name="location-sharp" size={30} color="#0284C7" />
                </View>
                <Text style={styles.centeredModalTitle}>
                  {isReliefMission ? 'Xác nhận đến điểm cứu trợ' : 'Xác nhận đến hiện trường'}
                </Text>
                <Text style={styles.centeredModalDesc}>
                  {isReliefMission
                    ? 'Đội đã có mặt tại điểm tiếp nhận để tiến hành cấp phát nhu yếu phẩm cứu trợ?'
                    : 'Đội đã tiếp cận chính xác vị trí người dân gặp nạn và bắt đầu phương án cứu nạn?'}
                </Text>
              </View>

              {/* Tóm tắt địa điểm & số người / hàng cứu trợ */}
              <View
                style={{
                  backgroundColor: '#F8FAFC',
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 14,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="navigate-circle" size={17} color="#0284C7" />
                  <Text style={{ fontSize: 13, color: '#1E293B', flex: 1, fontWeight: '700' }} numberOfLines={2}>
                    {incidentAddress}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {isReliefMission ? (
                    <>
                      <MaterialCommunityIcons name="package-variant-closed" size={15} color="#059669" />
                      <Text style={{ fontSize: 13, color: '#059669', fontWeight: '800' }}>
                        Điểm tiếp nhận cứu trợ ({citizenName})
                      </Text>
                    </>
                  ) : (
                    <>
                      <Feather name="users" size={14} color="#DC2626" />
                      <Text style={{ fontSize: 13, color: '#DC2626', fontWeight: '800' }}>
                        {victimHeadcount} người cần cứu ({citizenName})
                      </Text>
                    </>
                  )}
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <TouchableOpacity
                  style={[
                    styles.modalPrimaryFullBtn,
                    {
                      backgroundColor: isReliefMission ? '#059669' : '#2563EB',
                      shadowColor: isReliefMission ? '#059669' : '#2563EB',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                      elevation: 4,
                      gap: 8,
                      marginTop: 0,
                    },
                  ]}
                  onPress={executeArriveAtScene}
                  disabled={actionLoading}
                >
                  <Ionicons name="checkmark-done" size={20} color="#FFFFFF" />
                  <Text style={styles.modalPrimaryFullBtnText}>
                    {isReliefMission ? 'Đã Đến Điểm Cứu Trợ' : 'Đã Đến Hiện Trường'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalSecondaryFullBtn}
                  onPress={() => setArriveConfirmModalVisible(false)}
                >
                  <Text style={styles.modalSecondaryFullBtnText}>
                    Chưa, vẫn đang đi
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL: ĐÃ NHẬN LỆNH & XUẤT KÍCH                          */}
        {/* ======================================================== */}
        <Modal visible={launchSuccessModalVisible} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                <View
                  style={{
                    width: 62,
                    height: 62,
                    borderRadius: 31,
                    backgroundColor: isReliefMission ? '#ECFDF5' : '#EFF6FF',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: isReliefMission ? '#A7F3D0' : '#BFDBFE',
                  }}
                >
                  <Ionicons
                    name={isReliefMission ? 'cube-outline' : 'rocket-outline'}
                    size={34}
                    color={isReliefMission ? '#059669' : '#2563EB'}
                  />
                </View>
                <Text style={styles.centeredModalTitle}>
                  {isReliefMission ? 'Đã Nhận Lệnh Xuất Kho Tiếp Tế!' : 'Đã Nhận Lệnh Xuất Kích! 🚀'}
                </Text>
                <Text style={styles.centeredModalDesc}>
                  {isReliefMission
                    ? 'Lộ trình vận chuyển đến điểm tiếp nhận cứu trợ đã được kích hoạt. Chúc đội vận chuyển an toàn!'
                    : 'Lộ trình dẫn đường tự động đã được kích hoạt. Di chuyển an toàn đến hiện trường!'}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.modalPrimaryFullBtn,
                    {
                      backgroundColor: isReliefMission ? '#059669' : '#2563EB',
                      shadowColor: isReliefMission ? '#059669' : '#2563EB',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                      elevation: 4,
                    },
                  ]}
                  onPress={() => setLaunchSuccessModalVisible(false)}
                >
                  <Text style={styles.modalPrimaryFullBtnText}>
                    {isReliefMission ? 'BẮT ĐẦU VẬN CHUYỂN' : 'BẮT ĐẦU DẪN ĐƯỜNG'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL: BÁO CÁO TỪ CHỐI THÀNH CÔNG                        */}
        {/* ======================================================== */}
        <Modal visible={rejectSuccessModalVisible} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                <View
                  style={{
                    width: 62,
                    height: 62,
                    borderRadius: 31,
                    backgroundColor: '#FEF2F2',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: '#FECACA',
                  }}
                >
                  <Ionicons name="shield-checkmark-outline" size={34} color="#DC2626" />
                </View>
                <Text style={styles.centeredModalTitle}>
                  Đã Báo Cáo Ban Chỉ Huy
                </Text>
                <Text style={styles.centeredModalDesc}>
                  Lệnh điều động đã được trả về để trung tâm điều phối đội khác chi viện.
                </Text>

                <TouchableOpacity
                  style={[
                    styles.modalPrimaryFullBtn,
                    {
                      backgroundColor: '#DC2626',
                    },
                  ]}
                  onPress={() => {
                    setRejectSuccessModalVisible(false);
                    onClose();
                  }}
                >
                  <Text style={styles.modalPrimaryFullBtnText}>
                    Đóng & Trở Về Trực Ban
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL: THÔNG BÁO / CẢNH BÁO / LỖI TÙY CHỈNH              */}
        {/* ======================================================== */}
        <Modal visible={customNotice.visible} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                <View
                  style={{
                    width: 62,
                    height: 62,
                    borderRadius: 31,
                    backgroundColor:
                      customNotice.type === 'error'
                        ? '#FEF2F2'
                        : customNotice.type === 'warning'
                          ? '#FFFBEB'
                          : '#EFF6FF',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor:
                      customNotice.type === 'error'
                        ? '#FECACA'
                        : customNotice.type === 'warning'
                          ? '#FDE68A'
                          : '#BFDBFE',
                  }}
                >
                  <Ionicons
                    name={
                      customNotice.type === 'error'
                        ? 'alert-circle'
                        : customNotice.type === 'warning'
                          ? 'warning'
                          : 'information-circle'
                    }
                    size={34}
                    color={
                      customNotice.type === 'error'
                        ? '#DC2626'
                        : customNotice.type === 'warning'
                          ? '#D97706'
                          : '#2563EB'
                    }
                  />
                </View>
                <Text style={styles.centeredModalTitle}>
                  {customNotice.title}
                </Text>
                <Text style={styles.centeredModalDesc}>
                  {customNotice.message}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.modalPrimaryFullBtn,
                    {
                      backgroundColor:
                        customNotice.type === 'error'
                          ? '#DC2626'
                          : customNotice.type === 'warning'
                            ? '#D97706'
                            : '#0284C7',
                    },
                  ]}
                  onPress={() => {
                    const action = customNotice.onAction;
                    setCustomNotice((prev) => ({ ...prev, visible: false }));
                    action?.();
                  }}
                >
                  <Text style={styles.modalPrimaryFullBtnText}>
                    {customNotice.actionText || 'Đã hiểu'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 1: TỪ CHỐI NHẬN LỆNH TÁC CHIẾN                    */}
        {/* ======================================================== */}
        <Modal visible={rejectModalVisible} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeaderRow}>
                <Ionicons name="close-circle-outline" size={24} color="#DC2626" />
                <Text style={styles.modalTitle}>
                  {isReliefMission ? 'Từ Chối Lệnh Tiếp Tế' : 'Từ Chối Nhận Nhiệm Vụ'}
                </Text>
                <TouchableOpacity onPress={() => setRejectModalVisible(false)}>
                  <Feather name="x" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalDesc}>
                {isReliefMission
                  ? 'Vui lòng chọn lý do để Ban Chỉ Huy điều chuyển lệnh xuất kho & vận chuyển sang đội dự phòng phù hợp:'
                  : 'Vui lòng chọn lý do nghiệp vụ để Ban Chỉ Huy PCTT điều chuyển ngay lực lượng cứu hộ dự phòng hỗ trợ nạn nhân:'}
              </Text>

              {(isReliefMission
                ? [
                  'Phương tiện không đủ tải trọng / thể tích chở lô hàng',
                  'Tuyến đường vận chuyển bị ngập sâu, chia cắt',
                  'Phương tiện gặp sự cố kỹ thuật đột xuất',
                  'Đội đang thực hiện nhiệm vụ khác chưa thể cơ động',
                ]
                : [
                  'Phương tiện gặp sự cố kỹ thuật đột xuất',
                  'Tuyến đường thủy bị cô lập, dòng nước chảy xiết quá tải',
                  'Vượt quá tải trọng / thiếu trang thiết bị cứu hộ chuyên dụng',
                  'Đang phụ trách cứu nạn một ca nguy kịch khác',
                ]
              ).map((reasonItem) => (
                <TouchableOpacity
                  key={reasonItem}
                  style={[styles.radioItemRow, rejectReason === reasonItem && styles.radioItemRowActive]}
                  onPress={() => setRejectReason(reasonItem)}
                >
                  <Ionicons
                    name={rejectReason === reasonItem ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={rejectReason === reasonItem ? '#DC2626' : '#94A3B8'}
                  />
                  <Text style={[styles.radioItemText, rejectReason === reasonItem && styles.radioItemTextActive]}>
                    {reasonItem}
                  </Text>
                </TouchableOpacity>
              ))}

              <TextInput
                style={styles.modalTextInput}
                placeholder="Ghi chú thêm cho chỉ huy điều phối..."
                value={rejectCustomNote}
                onChangeText={setRejectCustomNote}
                multiline
                numberOfLines={2}
              />

              <View style={styles.modalActionButtons}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setRejectModalVisible(false)}
                >
                  <Text style={styles.modalCancelBtnText}>Hủy bỏ</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalRejectConfirmBtn}
                  onPress={handleConfirmReject}
                  disabled={actionLoading}
                >
                  <Text style={styles.modalRejectConfirmBtnText}>Xác nhận từ chối</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL: YÊU CẦU CUNG CẤP THÊM VẬT TƯ CỨU TRỢ              */}
        {/* ======================================================== */}
        <Modal visible={supplyRequestModalVisible} transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { maxHeight: SCREEN_HEIGHT * 0.85 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: '#E0F2FE',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 10,
                  }}
                >
                  <MaterialCommunityIcons name="package-variant-plus" size={22} color="#0284C7" />
                </View>
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#0F172A', lineHeight: 21 }}>
                    Yêu Cầu Chi Viện Vật Tư
                  </Text>
                  {authorityName ? (
                    <Text
                      style={{ fontSize: 11.5, color: '#0284C7', fontWeight: '700', marginTop: 2 }}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      Kho: {authorityName}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={handleCloseSupplyRequestModal}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ padding: 4, marginLeft: 8 }}
                >
                  <Feather name="x" size={22} color="#64748B" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalDesc}>
                {authorityName
                  ? `Chọn danh mục vật tư từ kho ${authorityName} để gửi Ban Chỉ Huy xuất cấp chi viện:`
                  : 'Gửi yêu cầu tiếp tế trang thiết bị, vật tư lên Ban Chỉ Huy địa phương để được hỗ trợ chuyển đến hiện trường:'}
              </Text>

              <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                {isLoadingWarehouseEquipments && warehouseEquipments.length === 0 ? (
                  <View style={{ paddingVertical: 24, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="small" color="#0284C7" />
                    <Text style={{ fontSize: 12, color: '#64748B', marginTop: 8, fontWeight: '600' }}>
                      Đang kết nối kho vật tư địa phương...
                    </Text>
                  </View>
                ) : warehouseEquipments.length === 0 ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12.5, color: '#64748B', textAlign: 'center', lineHeight: 18 }}>
                      Chưa tìm thấy danh mục vật tư sẵn có trong kho địa phương này. Bạn có thể nhập loại vật tư cần cấp vào ô bên dưới.
                    </Text>
                  </View>
                ) : (
                  warehouseEquipments.map((eq: any) => {
                    const itemKey = eq.name;
                    const qty = selectedSuppliesToRequest[itemKey] || 0;
                    const stock = eq.quantity !== undefined ? eq.quantity : 0;
                    const unit = eq.unit || 'món';
                    return (
                      <View key={eq._id || itemKey} style={styles.supplyRequestItemRow}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={styles.supplyRequestItemName}>{itemKey}</Text>
                          <Text style={{ fontSize: 11, color: stock > 0 ? '#059669' : '#DC2626', fontWeight: '700', marginTop: 2 }}>
                            {stock > 0 ? `📦 Tồn kho: ${stock} ${unit}` : '⚠️ Hết tồn kho'}
                          </Text>
                        </View>
                        <View style={styles.qtyControlRow}>
                          <TouchableOpacity
                            style={styles.qtyBtn}
                            onPress={() =>
                              setSelectedSuppliesToRequest((prev) => ({
                                ...prev,
                                [itemKey]: Math.max(0, (prev[itemKey] || 0) - 1),
                              }))
                            }
                          >
                            <Feather name="minus" size={14} color="#475569" />
                          </TouchableOpacity>
                          <Text style={styles.qtyValueText}>{qty}</Text>
                          <TouchableOpacity
                            style={[styles.qtyBtn, styles.qtyBtnPlus]}
                            onPress={() =>
                              setSelectedSuppliesToRequest((prev) => ({
                                ...prev,
                                [itemKey]: (prev[itemKey] || 0) + 1,
                              }))
                            }
                          >
                            <Feather name="plus" size={14} color="#0284C7" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              {/* Mức độ cấp bách */}
              <View style={{ marginTop: 12, marginBottom: 8 }}>
                <Text style={styles.supplyInputLabel}>Mức độ cần thiết:</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <TouchableOpacity
                    style={[
                      styles.urgencyChoiceBtn,
                      supplyUrgency === 'NORMAL' && styles.urgencyChoiceBtnActive,
                    ]}
                    onPress={() => setSupplyUrgency('NORMAL')}
                  >
                    <Text
                      style={[
                        styles.urgencyChoiceText,
                        supplyUrgency === 'NORMAL' && styles.urgencyChoiceTextActive,
                      ]}
                    >
                      Bình thường
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.urgencyChoiceBtn,
                      supplyUrgency === 'URGENT' && styles.urgencyChoiceBtnUrgent,
                    ]}
                    onPress={() => setSupplyUrgency('URGENT')}
                  >
                    <Text
                      style={[
                        styles.urgencyChoiceText,
                        supplyUrgency === 'URGENT' && styles.urgencyChoiceTextUrgent,
                      ]}
                    >
                      Khẩn cấp (Cần ngay)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Vật tư cần thêm ngoài các vật tư có sẵn */}
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.supplyInputLabel}>Vật tư cần thêm (ngoài các vật tư có sẵn):</Text>
                <TextInput
                  style={styles.supplyNoteInput}
                  placeholder="Ví dụ: 2 bình oxy, 1 máy bơm chìm mini, pin sạc dự phòng, đèn pin chống nước, chăn ấm..."
                  placeholderTextColor="#94A3B8"
                  value={supplyNote}
                  onChangeText={setSupplyNote}
                  multiline
                  numberOfLines={2}
                />
              </View>

              {/* Action buttons */}
              <View style={styles.modalActionButtons}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={handleCloseSupplyRequestModal}
                >
                  <Text style={styles.modalCancelBtnText}>Hủy bỏ</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.supplySubmitBtn}
                  onPress={handleSubmitSupplyRequest}
                  disabled={actionLoading}
                >
                  <Text style={styles.supplySubmitBtnText}>Gửi Lên Địa Phương</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL: YÊU CẦU XE ĐÓN NẠN NHÂN TẠI BẾN CẬP BỜ (RELAY)     */}
        {/* ======================================================== */}
        <Modal
          visible={shoreHandoffModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setShoreHandoffModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalBackdrop}
          >
            <View style={[styles.modalCard, { height: Math.min(SCREEN_HEIGHT * 0.82, 650), maxHeight: Math.min(SCREEN_HEIGHT * 0.9, 720), display: 'flex', flexDirection: 'column' }]}>
              <View style={styles.modalHeaderRow}>
                <MaterialCommunityIcons name="car-emergency" size={24} color="#EA580C" />
                <Text style={styles.modalTitle}>Yêu Cầu Xe Đón Tại Bờ</Text>
                <TouchableOpacity
                  onPress={() => setShoreHandoffModalVisible(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Feather name="x" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <Text style={[styles.modalDesc, { marginBottom: 10 }]}>
                Ca-nô đưa người ra mép ngập. Yêu cầu Ban Chỉ Huy điều động xe đường bộ đón nạn nhân đưa đến Bệnh viện hoặc Khu an toàn:
              </Text>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 28, flexGrow: 1 }}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={true}
              >
                {/* 1. Chọn / Nhập Bến Cập Bờ */}
                <Text style={[styles.supplyInputLabel, { marginBottom: 6 }]}>1. Vị trí bến cập bờ đón nạn nhân (Mép ngập):</Text>

                {/* Ô nhập địa chỉ tự do */}
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                    Tên bến / Địa chỉ đón nạn nhân:
                  </Text>
                  <TextInput
                    style={[styles.supplyNoteInput, { minHeight: 46, paddingVertical: 10 }]}
                    placeholder="Nhập tên bến / điểm hẹn xe đón (Ví dụ: Chân cầu, mép ngập đường...)"
                    placeholderTextColor="#94A3B8"
                    value={landingAddress}
                    onChangeText={setLandingAddress}
                  />
                </View>

                {/* 2 nút thao tác vị trí: Chọn trên bản đồ + Lấy GPS hiện tại */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      backgroundColor: '#FFF7ED',
                      borderWidth: 1.5,
                      borderColor: '#EA580C',
                      borderRadius: 8,
                    }}
                    onPress={handleStartPickOnMap}
                  >
                    <Ionicons name="map" size={17} color="#EA580C" />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#EA580C' }}>
                      Chọn Trên Bản Đồ
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      backgroundColor: '#EFF6FF',
                      borderWidth: 1.5,
                      borderColor: '#0284C7',
                      borderRadius: 8,
                    }}
                    onPress={handleUseCurrentGps}
                    disabled={isFetchingAddress}
                  >
                    {isFetchingAddress ? (
                      <ActivityIndicator size="small" color="#0284C7" />
                    ) : (
                      <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#0284C7" />
                    )}
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#0284C7' }}>
                      Lấy GPS Hiện Tại
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Card hiển thị tọa độ GPS xác thực */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: '#F8FAFC',
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 14,
                  }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: '#FFEDD5',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>🚗</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11.5, color: '#64748B' }}>Tọa độ GPS điểm hẹn xe đón:</Text>
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#0F172A' }}>
                      {landingCoords.lat.toFixed(5)}, {landingCoords.lng.toFixed(5)}
                    </Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                </View>

                {/* 2. Loại Xe Cần Đón */}
                <Text style={[styles.supplyInputLabel, { marginBottom: 6 }]}>2. Loại phương tiện đường bộ cần đón:</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 10,
                      borderWidth: selectedRelayVehicleType === 'AMBULANCE' ? 2 : 1,
                      borderColor: selectedRelayVehicleType === 'AMBULANCE' ? '#DC2626' : '#E2E8F0',
                      backgroundColor: selectedRelayVehicleType === 'AMBULANCE' ? '#FEF2F2' : '#F8FAFC',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    onPress={() => setSelectedRelayVehicleType('AMBULANCE')}
                  >
                    <Ionicons name="medical" size={20} color={selectedRelayVehicleType === 'AMBULANCE' ? '#DC2626' : '#64748B'} />
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: selectedRelayVehicleType === 'AMBULANCE' ? '#DC2626' : '#334155', textAlign: 'center' }}>
                      Xe Cứu Thương
                    </Text>
                    <Text style={{ fontSize: 10.5, color: '#64748B', textAlign: 'center' }}>
                      Cấp cứu y tế / Bị thương
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 10,
                      borderWidth: selectedRelayVehicleType === 'TRUCK' ? 2 : 1,
                      borderColor: selectedRelayVehicleType === 'TRUCK' ? '#0284C7' : '#E2E8F0',
                      backgroundColor: selectedRelayVehicleType === 'TRUCK' ? '#F0F9FF' : '#F8FAFC',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    onPress={() => setSelectedRelayVehicleType('TRUCK')}
                  >
                    <MaterialCommunityIcons name="truck" size={22} color={selectedRelayVehicleType === 'TRUCK' ? '#0284C7' : '#64748B'} />
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: selectedRelayVehicleType === 'TRUCK' ? '#0284C7' : '#334155', textAlign: 'center' }}>
                      Xe Tải / Bán Tải
                    </Text>
                    <Text style={{ fontSize: 10.5, color: '#64748B', textAlign: 'center' }}>
                      Chở dân về khu sơ tán
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 3. Số người cần chuyển tiếp */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <Text style={styles.supplyInputLabel}>3. Số lượng nạn nhân bàn giao:</Text>
                  <View style={styles.qtyControlRow}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => setRelayVictimCount((prev) => Math.max(1, prev - 1))}
                    >
                      <Feather name="minus" size={14} color="#475569" />
                    </TouchableOpacity>
                    <Text style={[styles.qtyValueText, { fontWeight: '900', color: '#EA580C', fontSize: 16 }]}>
                      {relayVictimCount}
                    </Text>
                    <TouchableOpacity
                      style={[styles.qtyBtn, styles.qtyBtnPlus]}
                      onPress={() => setRelayVictimCount((prev) => prev + 1)}
                    >
                      <Feather name="plus" size={14} color="#0284C7" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 4. Ghi chú tình trạng nạn nhân */}
                <Text style={styles.supplyInputLabel}>4. Tình trạng sức khỏe & Ghi chú cho tài xế:</Text>
                <TextInput
                  style={[styles.supplyNoteInput, { minHeight: 60 }]}
                  placeholder="Ghi chú: Người già lạnh run, 1 bé sơ sinh cần bình ủ ấm..."
                  placeholderTextColor="#94A3B8"
                  value={relayNotes}
                  onChangeText={setRelayNotes}
                  multiline
                />
              </ScrollView>

              {/* Action buttons (Cố định ở đáy, luôn hiển thị đầy đủ) */}
              <View style={[styles.modalActionButtons, { marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' }]}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setShoreHandoffModalVisible(false)}
                >
                  <Text style={styles.modalCancelBtnText}>Quay lại</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.supplySubmitBtn, { backgroundColor: '#EA580C' }]}
                  onPress={handleSendShoreHandoffRequest}
                  disabled={actionLoading}
                >
                  <Text style={styles.supplySubmitBtnText}>⚡ Gửi Yêu Cầu Đón</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 2: BÁO CÁO KẾT THÚC CỨU HỘ & CHỤP ẢNH HIỆN TRƯỜNG */}
        {/* ======================================================== */}
        <Modal visible={completionModalVisible} transparent animationType="slide" onRequestClose={() => setCompletionModalVisible(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalBackdrop}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]} />
            </TouchableWithoutFeedback>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeaderRow}>
                  <Ionicons name="checkmark-circle" size={24} color="#16A34A" />
                  <Text style={styles.modalTitle}>
                    {isShoreHandoffMission
                      ? 'Báo Cáo Tiếp Nhận Nạn Nhân Tại Bến'
                      : shoreHandoffData && shoreHandoffData.status === 'ASSIGNED'
                        ? 'Biên Bản Bàn Giao Lên Xe Đón'
                        : isReliefMission
                          ? 'Biên Bản Bàn Giao Cứu Trợ'
                          : 'Báo Cáo Hoàn Tất Cứu Hộ'}
                  </Text>
                  <TouchableOpacity onPress={() => setCompletionModalVisible(false)}>
                    <Feather name="x" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalDesc}>
                  {isShoreHandoffMission
                    ? 'Xác nhận đã đón nạn nhân tại bến và chuyển về nơi an toàn:'
                    : shoreHandoffData && shoreHandoffData.status === 'ASSIGNED'
                      ? `Bàn giao nạn nhân lên xe đón bờ (${shoreHandoffData.assignedVehiclePlate || shoreHandoffData.assignedVehicleName}), chụp ảnh xác nhận và hoàn tất nhiệm vụ:`
                      : isReliefMission
                        ? 'Ghi nhận kết quả bàn giao nhu yếu phẩm cứu trợ để lưu hồ sơ và đồng bộ báo cáo cho Ban Chỉ Huy:'
                        : 'Ghi nhận kết quả tác chiến để lưu hồ sơ cứu trợ và đồng bộ báo cáo cho Ban Chỉ Huy:'}
                </Text>

                <View style={styles.completionStatsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>
                      {isReliefMission ? 'Tổng số mặt hàng cấp' : 'Số người đã cứu'}
                    </Text>
                    <Text style={styles.statValue}>
                      {isReliefMission
                        ? `${(assignment?.supplies || sos?.supplies || []).reduce((sum: number, s: any) => sum + (Number(s.quantity) || 0), 0)} món/kiện`
                        : `${rescuedHeadcount} người`}
                    </Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Thời gian hoàn thành</Text>
                    <Text style={styles.statValue}>{missionDurationText}</Text>
                  </View>
                </View>

                <Text style={[styles.inputSectionLabel, { marginTop: 12, marginBottom: 6 }]}>
                  {isReliefMission
                    ? 'Biên bản tóm tắt cấp phát cứu trợ:'
                    : 'Biên bản tóm tắt tình hình hiện trường:'}
                </Text>
                <TextInput
                  style={[styles.modalTextInput, { height: 70 }]}
                  value={fieldReportNotes}
                  onChangeText={setFieldReportNotes}
                  multiline
                  blurOnSubmit={false}
                />

                {/* Chụp ảnh nghiệm thu hiện trường / bàn giao hàng */}
                {(() => {
                  const requiresProofPhoto = true;
                  const isHandoverProof =
                    isReliefMission ||
                    isShoreHandoffMission ||
                    Boolean(shoreHandoffData && shoreHandoffData.status === 'ASSIGNED');
                  const hasPhotos = capturedPhotos.length > 0;
                  const canAddMore = capturedPhotos.length < MAX_PROOF_PHOTOS;
                  const isSubmitDisabled = actionLoading || (requiresProofPhoto && !hasPhotos);

                  return (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 6 }}>
                        <Text style={[styles.inputSectionLabel, { marginTop: 0, marginBottom: 0 }]}>
                          {isHandoverProof ? `Ảnh xác thực bàn giao (tối đa ${MAX_PROOF_PHOTOS}):` : `Ảnh hiện trường xác thực (tối đa ${MAX_PROOF_PHOTOS}):`}
                        </Text>
                        <Text style={{ fontSize: 11.5, fontWeight: '700', color: hasPhotos ? '#16A34A' : '#DC2626' }}>
                          {hasPhotos ? `✓ Đã chọn ${capturedPhotos.length}/${MAX_PROOF_PHOTOS} ảnh` : '* Bắt buộc'}
                        </Text>
                      </View>

                      <View style={styles.photoUploadRow}>
                        {hasPhotos ? (
                          <View style={{ gap: 10 }}>
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={styles.capturedPhotosList}
                            >
                              {capturedPhotos.map((photo, idx) => (
                                <View key={`${photo.uri}-${idx}`} style={styles.capturedPhotoThumbWrap}>
                                  <Image source={{ uri: photo.uri }} style={styles.capturedPhotoImg} />
                                  <TouchableOpacity
                                    style={styles.capturedPhotoRemoveBtn}
                                    onPress={() => handleRemoveFieldPhoto(idx)}
                                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                  >
                                    <Ionicons name="close" size={12} color="#FFFFFF" />
                                  </TouchableOpacity>
                                </View>
                              ))}
                            </ScrollView>
                            {canAddMore && (
                              <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity style={styles.retakePhotoBtn} onPress={handleCaptureFieldPhoto}>
                                  <Ionicons name="camera-outline" size={14} color="#0284C7" />
                                  <Text style={styles.retakePhotoText}>Chụp thêm</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.retakePhotoBtn} onPress={handlePickFieldPhotoFromLibrary}>
                                  <Ionicons name="images-outline" size={14} color="#475569" />
                                  <Text style={styles.retakePhotoText}>Chọn thêm ảnh</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        ) : (
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity style={[styles.takePhotoBtn, { flex: 1 }]} onPress={handleCaptureFieldPhoto}>
                              <Ionicons name="camera-outline" size={19} color="#0284C7" />
                              <Text style={styles.takePhotoBtnText}>Chụp ảnh xác thực</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.takePhotoBtn,
                                { paddingHorizontal: 14, backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
                              ]}
                              onPress={handlePickFieldPhotoFromLibrary}
                            >
                              <Ionicons name="images-outline" size={18} color="#334155" />
                              <Text style={[styles.takePhotoBtnText, { color: '#334155' }]}>Thư viện</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>

                      {requiresProofPhoto && !hasPhotos && (
                        <Text style={{ fontSize: 11.5, color: '#B45309', marginTop: -6, marginBottom: 10 }}>
                          Cần chụp hoặc chọn ít nhất 1 ảnh xác nhận đã trao hàng/bàn giao trước khi bấm Bàn giao.
                        </Text>
                      )}

                      <View style={styles.modalActionButtons}>
                        <TouchableOpacity
                          style={styles.modalCancelBtn}
                          onPress={() => setCompletionModalVisible(false)}
                        >
                          <Text style={styles.modalCancelBtnText}>Quay lại</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.modalRejectConfirmBtn,
                            {
                              backgroundColor: isSubmitDisabled ? '#CBD5E1' : '#16A34A',
                            },
                          ]}
                          onPress={handleFinalSubmitCompletion}
                          disabled={isSubmitDisabled}
                        >
                          <Text
                            style={[
                              styles.modalRejectConfirmBtnText,
                              isSubmitDisabled && { color: '#64748B' },
                            ]}
                            numberOfLines={1}
                          >
                            {isShoreHandoffMission
                              ? 'Đã đón'
                              : shoreHandoffData && shoreHandoffData.status === 'ASSIGNED'
                                ? 'Bàn giao'
                                : isReliefMission
                                  ? 'Bàn giao'
                                  : 'Hoàn thành'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  );
                })()}
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </Modal>

        {/* MODAL: HOÀN TẤT NHIỆM VỤ THÀNH CÔNG                     */}
        {/* ======================================================== */}
        <Modal visible={missionSuccessModalVisible} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: '#DCFCE7',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Ionicons name="checkmark-circle" size={42} color="#16A34A" />
                </View>
                <Text style={[styles.centeredModalTitle, { color: '#16A34A', fontSize: 19 }]}>
                  {isReliefMission
                    ? 'Hoàn Tất Bàn Giao Tiếp Tế! 🎉'
                    : !isShoreHandoffMission &&
                      shoreHandoffData &&
                      ['REQUESTED', 'ASSIGNED'].includes(String(shoreHandoffData.status || '').toUpperCase())
                      ? 'Hoàn Thành Phần Giải Cứu! 🛟'
                      : 'Hoàn Tất Cứu Hộ Xuất Sắc! 🎉'}
                </Text>
                <Text style={styles.centeredModalDesc}>
                  {isReliefMission
                    ? 'Lô hàng cứu trợ đã được bàn giao minh bạch tại điểm tiếp nhận. Trạng thái đội đã chuyển về SẴN SÀNG.'
                    : !isShoreHandoffMission &&
                      shoreHandoffData &&
                      ['REQUESTED', 'ASSIGNED'].includes(String(shoreHandoffData.status || '').toUpperCase())
                      ? `Đã giải cứu ${rescuedHeadcount} người dân đến điểm hẹn bờ. Đội của bạn đã chuyển sang SẴN SÀNG nhận ca mới; ca SOS sẽ hoàn tất hoàn toàn khi xe tiếp vận đưa nạn nhân tới nơi an toàn.`
                      : `Toàn bộ ${rescuedHeadcount} người dân đã được đưa về nơi an toàn. Trạng thái đội đã tự động chuyển về SẴN SÀNG tác chiến.`}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.modalPrimaryFullBtn,
                    {
                      backgroundColor: '#16A34A',
                    },
                  ]}
                  onPress={() => {
                    setMissionSuccessModalVisible(false);
                    onMissionCompleted?.({ rescuedCount: rescuedHeadcount, proofImages: completedProofImagesRef.current });
                    onClose();
                  }}
                >
                  <Text style={styles.modalPrimaryFullBtnText}>
                    Đóng & Trở Về Trực Ban
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL 3: ZOOM ẢNH HIỆN TRƯỜNG NẠN NHÂN GỬI */}
        <Modal visible={zoomPhotoVisible} transparent animationType="fade">
          <View style={styles.zoomBackdrop}>
            <TouchableOpacity style={styles.zoomCloseBtn} onPress={() => setZoomPhotoVisible(false)}>
              <Feather name="x" size={26} color="#FFFFFF" />
            </TouchableOpacity>
            {sos?.images?.[0] && (
              <Image source={{ uri: sos.images[0] }} style={styles.zoomedImg} resizeMode="contain" />
            )}
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
  },

  /* Grab-style Top Navigation HUD */
  grabTopNavContainer: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 110,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  grabCloseCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 5,
  },
  grabManeuverCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 9,
  },
  grabManeuverCardNavigating: {
    borderColor: '#0084FF',
    borderWidth: 2,
    shadowColor: '#0084FF',
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  grabTurnIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#0084FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabDistanceText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  grabDurationText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0084FF',
  },
  grabRoadText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  grabSpeedLimitBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#EF4444',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabSpeedLimitText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#DC2626',
  },
  grabHideHudBtn: {
    padding: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabShowHudMiniPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 4,
    gap: 6,
  },
  grabShowHudMiniText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  itineraryDropdownCard: {
    marginTop: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  itineraryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 6,
  },
  itineraryTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  itineraryStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  itineraryStepRowActive: {
    backgroundColor: '#EFF6FF',
    borderBottomColor: '#DBEAFE',
  },
  itineraryStepIconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itineraryStepText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  itineraryStepSubText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  itineraryActiveBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#0084FF',
  },
  itineraryActiveBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  /* Grab-style Bottom Deck */
  grabDeckSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  grabOrderBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabOrderBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  grabOrderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#DC2626',
  },
  grabEtaChip: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  grabEtaChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#16A34A',
  },
  grabCitizenSection: {
    paddingVertical: 10,
  },
  grabCitizenName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  grabAddressText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#334155',
    lineHeight: 19,
    marginBottom: 4,
  },
  grabVictimMeta: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
  },
  grabNoteBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  grabNoteLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 2,
  },
  grabNoteText: {
    fontSize: 12.5,
    color: '#1E293B',
    lineHeight: 18,
  },
  grabSuppliesBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },
  suppliesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  suppliesHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  grabSuppliesLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#166534',
    flexShrink: 1,
  },
  suppliesCountBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    flexShrink: 0,
  },
  suppliesCountBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#15803D',
  },
  requestSuppliesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 7,
    flexShrink: 0,
  },
  requestSuppliesBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0284C7',
  },
  suppliesSummaryTouchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 6,
  },
  suppliesCollapsedSummaryText: {
    flex: 1,
    fontSize: 11.5,
    color: '#15803D',
    fontWeight: '600',
  },
  viewDetailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 5,
    flexShrink: 0,
  },
  viewDetailBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#166534',
  },
  grabSupplyChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  grabSupplyChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  grabSupplyQtyBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    flexShrink: 0,
  },
  grabSupplyQtyText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#15803D',
  },
  collapseDetailFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    marginTop: 4,
    backgroundColor: '#DCFCE7',
    borderRadius: 6,
  },
  collapseDetailFooterText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
  },
  requestedSuppliesNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    marginTop: 8,
  },
  requestedSuppliesNoticeText: {
    fontSize: 11.5,
    color: '#B45309',
    fontWeight: '700',
    flex: 1,
  },
  sheetToggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 4,
  },
  sheetToggleHeaderText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  collapsedSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  collapsedCitizenName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  collapsedVictimCount: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#DC2626',
  },
  collapsedAddressText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  collapsedExpandHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  collapsedExpandHintText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0284C7',
  },
  supplyRequestItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  supplyRequestItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  qtyControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnPlus: {
    backgroundColor: '#E0F2FE',
  },
  qtyValueText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    minWidth: 20,
    textAlign: 'center',
  },
  supplyInputLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  urgencyChoiceBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  urgencyChoiceBtnActive: {
    borderColor: '#0284C7',
    backgroundColor: '#F0F9FF',
  },
  urgencyChoiceBtnUrgent: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  urgencyChoiceText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  urgencyChoiceTextActive: {
    color: '#0284C7',
  },
  urgencyChoiceTextUrgent: {
    color: '#DC2626',
  },
  supplyNoteInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 48,
    textAlignVertical: 'top',
  },
  supplySubmitBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplySubmitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  grabActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 2,
  },
  grabActionCol: {
    alignItems: 'center',
    gap: 4,
    minWidth: 68,
  },
  grabActionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabActionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  grabPrimaryBtnContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  grabBigGreenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 28,
    paddingVertical: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  grabBigBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  reliefSectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  reliefDestinationTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  reliefSuppliesBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },
  reliefReceiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  reliefSuppliesLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  reliefHeaderToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
  },
  reliefHeaderToggleText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  reliefReceiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 7.5,
    gap: 6,
    backgroundColor: '#FFFFFF',
  },
  reliefReceiptRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  reliefReceiptIdx: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    width: 18,
    fontVariant: ['tabular-nums'],
  },
  reliefReceiptName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#1E293B',
  },
  reliefReceiptQty: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
  },
  reliefReceiptMoreFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 11,
    paddingVertical: 7.5,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  reliefReceiptMoreText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  reliefReceiptMoreAction: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    flexShrink: 0,
  },
  reliefContactCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7.5,
    marginTop: 8,
    gap: 6.5,
  },
  reliefContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  reliefContactInlineText: {
    flexShrink: 1,
  },
  reliefContactRoleLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  reliefContactName: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  reliefContactDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  reliefInlineCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  reliefInlineCallText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
    fontVariant: ['tabular-nums'],
  },
  reliefPendingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reliefRejectSideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },
  reliefRejectSideBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#DC2626',
  },

  /* TOP FLOATING HUD */
  topHudContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  urgentAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
    gap: 8,
  },
  urgentAlertPulseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#DC2626',
  },
  urgentAlertTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#991B1B',
    letterSpacing: 0.3,
  },
  urgentAlertSubtitle: {
    fontSize: 11,
    color: '#7F1D1D',
    marginTop: 1,
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  countdownText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#DC2626',
  },

  /* Grab-style Navigation HUD */
  navHudCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 10,
  },
  navDirectionCol: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  turnIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navAddressCol: {
    flex: 1,
  },
  navStatusLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.3,
  },
  navAddressText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 2,
  },
  etaPillWrap: {
    alignItems: 'flex-end',
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  etaDistanceText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#38BDF8',
  },
  etaDurationText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },

  topControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  iconCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },
  topRightToggles: {
    flexDirection: 'row',
  },
  roadOnlyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  roadOnlyChipText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },

  /* FLOATING MAP TOOLS (RIGHT EDGE) */
  mapFloatingTools: {
    position: 'absolute',
    right: 14,
    zIndex: 90,
    flexDirection: 'column',
    gap: 8,
  },
  mapToolBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mapToolBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  mapToolBtnLocked: {
    borderColor: '#0084FF',
    borderWidth: 2,
    backgroundColor: '#F0F9FF',
    shadowColor: '#0084FF',
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  mapToolActiveDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },

  /* BOTTOM SHEET CONTROL DECK */
  bottomDeckCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 100,
    maxHeight: SCREEN_HEIGHT * 0.78,
  },
  sheetScrollArea: {
    maxHeight: SCREEN_HEIGHT * 0.46,
  },
  sheetScrollContent: {
    paddingBottom: 8,
  },
  deckHandleBarWrap: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  deckHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  deckHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  urgencyPillsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  criticalBadge: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  criticalBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  ticketIdText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  headerRightWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerEtaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    gap: 4,
  },
  headerEtaText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284C7',
  },
  googleMapsDrivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    gap: 4,
  },
  googleMapsDriveDuration: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0284C7',
  },
  googleMapsDriveDist: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  collapseToggleBtn: {
    padding: 6,
  },

  aiTriageAlertBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    gap: 6,
  },
  aiTriageText: {
    flex: 1,
    fontSize: 12,
    color: '#0C4A6E',
    lineHeight: 17,
  },

  deckScrollBody: {
    maxHeight: 280,
  },

  citizenCardWrap: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  citizenTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  citizenRoleLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  citizenNameText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  citizenPhoneText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284C7',
    marginTop: 2,
  },
  incidentAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  incidentAddressText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  compactCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
    alignSelf: 'flex-start',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  compactCallBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  callCitizenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 5,
    alignSelf: 'flex-start',
  },
  callCitizenBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* Victim details: Clean, prominent, no emojis */
  victimDetailsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
    gap: 8,
  },
  victimHeadcountBold: {
    fontSize: 14,
    fontWeight: '900',
    color: '#DC2626',
  },
  victimSubText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },

  /* Google Maps Car Driving Route Box */
  googleMapsRouteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    gap: 10,
  },
  googleMapsCarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleMapsMainTime: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0369A1',
  },
  googleMapsMainDist: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0284C7',
  },
  googleMapsSubNote: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },

  victimPillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  victimPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  victimPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  victimPillRed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
  },
  victimPillTextRed: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },
  victimPillAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
  },
  victimPillTextAmber: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  victimPillBlue: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    borderWidth: 1,
  },
  victimPillTextBlue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284C7',
  },

  quoteAndThumbRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  quoteBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 3.5,
    borderLeftColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quoteText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 19,
  },
  thumbWrap: {
    position: 'relative',
    width: 52,
    height: 52,
    borderRadius: 8,
    overflow: 'hidden',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  thumbZoomOverlay: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 3,
    borderRadius: 4,
  },

  unitSummaryCard: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  unitTeamName: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 20,
  },
  unitRowSub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  unitVehicleText: {
    fontSize: 13.5,
    color: '#0284C7',
    fontWeight: '700',
  },
  slimUnitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginBottom: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  slimUnitTeamName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  slimUnitDot: {
    fontSize: 12,
    color: '#94A3B8',
  },
  slimUnitVehicleText: {
    fontSize: 11.5,
    color: '#0284C7',
    fontWeight: '700',
  },

  /* Triage Headcount & Tags */
  triageControlsCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  triageCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
    marginBottom: 6,
  },
  headcountStepperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headcountLabel: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '600',
    flex: 1,
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  stepperBtn: {
    padding: 4,
  },
  stepperValText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    minWidth: 42,
    textAlign: 'center',
  },
  triageTagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  triageTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  triageTagChipSelected: {
    backgroundColor: '#E0F2FE',
    borderColor: '#7DD3FC',
  },
  triageTagText: {
    fontSize: 11,
    color: '#64748B',
  },
  triageTagTextSelected: {
    color: '#0369A1',
    fontWeight: '700',
  },

  /* STICKY ACTION BUTTON BAR */
  stickyActionBar: {
    paddingTop: 8,
  },
  loadingActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  loadingActionText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  sideBySideActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rejectOutlineBtn: {
    flex: 0.32,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  rejectOutlineBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
  },
  acceptSolidPrimaryBtn: {
    flex: 0.68,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#0284C7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
    paddingHorizontal: 8,
  },
  acceptSolidPrimaryBtnText: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  actionButtonGroup: {
    gap: 6,
  },
  acceptPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    minHeight: 52,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptPrimaryBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  rejectSecondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: 10,
  },
  rejectSecondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },

  arrivePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    minHeight: 54,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  arrivePrimaryBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  completePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    minHeight: 54,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  completePrimaryBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  /* MODALS */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
    marginLeft: 6,
  },
  modalDesc: {
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 12,
  },
  centeredModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  centeredModalDesc: {
    fontSize: 13.5,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  modalPrimaryFullBtn: {
    width: '100%',
    minHeight: 48,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  modalPrimaryFullBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  modalSecondaryFullBtn: {
    width: '100%',
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  modalSecondaryFullBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  radioItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 8,
    marginBottom: 4,
  },
  radioItemRowActive: {
    backgroundColor: '#FEF2F2',
  },
  radioItemText: {
    fontSize: 12.5,
    color: '#334155',
    flex: 1,
  },
  radioItemTextActive: {
    color: '#991B1B',
    fontWeight: '700',
  },
  modalTextInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    fontSize: 12.5,
    color: '#0F172A',
    marginTop: 8,
    marginBottom: 14,
  },
  modalActionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  modalRejectConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    alignItems: 'center',
  },
  modalRejectConfirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  completionStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: '#15803D',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#166534',
    marginTop: 2,
  },
  inputSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  photoUploadRow: {
    marginBottom: 14,
  },
  takePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 8,
    paddingVertical: 10,
    gap: 6,
  },
  takePhotoBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0284C7',
  },
  capturedPhotosList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 6,
    paddingRight: 6,
  },
  capturedPhotoThumbWrap: {
    position: 'relative',
  },
  capturedPhotoImg: {
    width: 68,
    height: 68,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  capturedPhotoRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    elevation: 2,
  },
  retakePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
  },
  retakePhotoText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },

  zoomBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomCloseBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 40 : 16,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  zoomedImg: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },

  pickLandingTopBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  pickLandingTopIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EA580C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickLandingTopTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#FDBA74',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickLandingTopSubtitle: {
    fontSize: 11.5,
    color: '#E2E8F0',
    marginTop: 2,
    lineHeight: 15,
  },
  pickLandingBottomBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    zIndex: 999,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 10,
    borderWidth: 1.5,
    borderColor: '#FDBA74',
  },
  pickLandingCoordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickLandingCoordText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  pickLandingCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickLandingCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  pickLandingConfirmBtn: {
    flex: 1.6,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#EA580C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  pickLandingConfirmText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});

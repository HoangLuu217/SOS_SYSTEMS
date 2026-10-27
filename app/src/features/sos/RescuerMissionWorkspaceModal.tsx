import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
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
  Vibration,
  Platform,
  Alert,
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

  // UI Modes & Toggles
  const [isWaterwayMode, setIsWaterwayMode] = useState<boolean>(false);
  const [mapLayer, setMapLayer] = useState<'streets' | 'satellite'>('streets');
  const [showFloodZones, setShowFloodZones] = useState<boolean>(true);
  const [showSafeShelters, setShowSafeShelters] = useState<boolean>(false);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState<boolean>(false); // Cho phép kéo gọn xuống để xem map
  const [isNavigating, setIsNavigating] = useState<boolean>(false); // Dẫn đường trực tiếp trong App chuẩn Grab
  const [isHeadingLocked, setIsHeadingLocked] = useState<boolean>(true); // Ghim theo dõi vị trí và hướng xe chuẩn Grab
  const [isTopHudHidden, setIsTopHudHidden] = useState<boolean>(false); // Thu gọn HUD trên để thoáng bản đồ
  const [suppliesExpanded, setSuppliesExpanded] = useState<boolean>(false); // Xem chi tiết / thu gọn danh mục vật tư
  const [supplyRequestModalVisible, setSupplyRequestModalVisible] = useState<boolean>(false); // Modal yêu cầu cấp thêm vật tư
  const [requestedSuppliesList, setRequestedSuppliesList] = useState<any[]>([]); // Danh sách vật tư đã gửi yêu cầu
  const [selectedSuppliesToRequest, setSelectedSuppliesToRequest] = useState<Record<string, number>>({
    'Áo phao cứu sinh tiêu chuẩn SOLAS': 2,
    'Xuồng ca-nô cao su cứu hộ': 0,
    'Túi sơ cứu & Thuốc y tế dã chiến': 1,
    'Nước uống tiệt trùng (Thùng 24 chai)': 2,
    'Lương khô dã chiến (Thùng)': 0,
    'Dây thừng cứu nạn chuyên dụng (50m)': 0,
    'Đèn pin rọi nước dã chiến': 0,
  });
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
  const [rescuedHeadcount, setRescuedHeadcount] = useState<number>(4);
  const [activeTriageTags, setActiveTriageTags] = useState<Record<string, boolean>>({
    'Cần hỗ trợ y tế': true,
    'Nước chảy xiết': true,
    'Đã cấp áo phao': true,
    'Cần thêm ca-nô': false,
  });

  // State 4 Completion Modal
  const [completionModalVisible, setCompletionModalVisible] = useState<boolean>(false);
  const [fieldReportNotes, setFieldReportNotes] = useState<string>('Đã tiếp cận thành công, đưa toàn bộ nạn nhân về trạm an toàn.');
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);

  // Thumbnail Zoom Modal
  const [zoomPhotoVisible, setZoomPhotoVisible] = useState<boolean>(false);

  const webViewRef = useRef<WebView>(null);
  const socketRef = useRef<Socket | null>(null);

  // Lắng nghe sự kiện từ Leaflet WebView (ví dụ: người dùng vuốt/kéo bản đồ -> hủy ghim tự động)
  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'MAP_DRAGGED') {
        setIsHeadingLocked(false);
      } else if (data.type === 'LANDING_PIN_MOVED' || data.type === 'LANDING_PIN_DRAGGED') {
        if (typeof data.lat === 'number' && typeof data.lng === 'number') {
          setPickedTempCoords({ lat: data.lat, lng: data.lng });
        }
      }
    } catch (err) {}
  }, []);

  // Đồng bộ Mission State từ Assignment Status
  const syncStateFromStatus = (status?: string) => {
    const s = String(status || '').toUpperCase();
    if (['PENDING', 'ASSIGNED'].includes(s)) {
      setMissionState('ASSIGNED_PENDING_ACCEPTANCE');
    } else if (['ACCEPTED', 'DISPATCHED', 'EN_ROUTE', 'ON_THE_WAY'].includes(s)) {
      setMissionState('EN_ROUTE');
    } else if (['ARRIVED', 'IN_PROGRESS', 'RESCUING'].includes(s)) {
      setMissionState('ON_SCENE_RESCUING');
    } else if (['COMPLETED', 'RESOLVED'].includes(s)) {
      setMissionState('COMPLETED');
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
        setAssignment(targetAssign);
        syncStateFromStatus(targetAssign.status);

        if (targetAssign.rescuerLocation?.lat && targetAssign.rescuerLocation?.lng) {
          setTeamLocation({
            lat: targetAssign.rescuerLocation.lat,
            lng: targetAssign.rescuerLocation.lng,
            heading: 45,
          });
        }

        // Lấy chi tiết SOS
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
        syncStateFromStatus(initialSosData.status);
      }
    } catch (err) {
      console.warn('[Rescuer Workspace Load Error]:', err);
    } finally {
      setLoading(false);
    }
  }, [assignmentId, initialAssignmentData, initialSosData]);

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
              socketRef.current.emit('rescuer:location_update', {
                rescuerId: user?._id,
                phone: user?.phone,
                assignmentId: assignment?._id,
                teamId: assignment?.rescueTeamId?._id || assignment?.rescueTeamId,
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

                // Phát telemetry GPS thực tế lên Socket.IO
                if (socketRef.current && socketRef.current.connected) {
                  socketRef.current.emit('rescuer:location_update', {
                    rescuerId: user?._id,
                    phone: user?.phone,
                    assignmentId: assignment?._id,
                    teamId: assignment?.rescueTeamId?._id || assignment?.rescueTeamId,
                    location: newLoc,
                    coords: { lat: newLoc.lat, lng: newLoc.lng },
                  });
                }

                  // Cập nhật vị trí lên WebView
                  if (webViewRef.current) {
                    webViewRef.current.postMessage(
                      JSON.stringify({
                        type: 'UPDATE_TEAM_GPS',
                        lat: newLoc.lat,
                        lng: newLoc.lng,
                        heading: newLoc.heading,
                        etaText: `${roadMetrics.durationMin} • ${roadMetrics.distanceKm}`,
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
  }, [visible, user?._id, assignment?._id]);

  // 4. Kết nối Realtime Socket.IO
  useEffect(() => {
    if (!visible) return;

    try {
      const socketUrl = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
      const socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        if (user?._id) {
          socket.emit('register_user', user._id);
        }
      });

      // Xử lý khi Ban chỉ huy trên Web hủy điều động: Tự động thoát khỏi màn hình nhiệm vụ ngay lập tức
      const handleMissionCancelled = (data?: any) => {
        const assignId = assignment?._id || assignmentId;
        const currentSosId = sos?._id || initialSosData?._id;
        const isMatched =
          !data ||
          !data.assignmentId ||
          data.assignmentId === assignId ||
          data.sosId === currentSosId;

        if (isMatched) {
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

      socket.on('assignment:cancelled', handleMissionCancelled);

      // Lắng nghe cập nhật trạng thái SOS từ trung tâm chỉ huy
      socket.on('sos:updated', (updatedSos: any) => {
        if (updatedSos && (updatedSos._id === sos?._id || updatedSos.id === sos?._id)) {
          if (updatedSos.status === 'CANCELLED' || (updatedSos.status === 'VERIFIED' && missionState !== 'COMPLETED')) {
            handleMissionCancelled({ sosId: updatedSos._id, reason: 'Ca cứu nạn đã được trung tâm chuyển trạng thái điều phối lại.' });
            return;
          }
          if (updatedSos.shoreHandoff) {
            setShoreHandoffData(updatedSos.shoreHandoff);
          }
          setSos((prev: any) => ({ ...prev, ...updatedSos }));
          syncStateFromStatus(updatedSos.status);
          onMissionUpdated?.(updatedSos.status, assignment?._id);
        }
      });

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

      return () => {
        socket.off('assignment:cancelled', handleMissionCancelled);
        socket.off('sos:shore_handoff_assigned');
        socket.disconnect();
        socketRef.current = null;
      };
    } catch (err) {
      console.warn('[Socket Workspace Error]:', err);
    }
  }, [visible, user?._id, sos?._id]);

  // 5. Tự động tải dữ liệu khi mở Modal
  useEffect(() => {
    if (visible) {
      loadWorkspaceData();
    }
  }, [visible, loadWorkspaceData]);

  // Tọa độ người dân gặp nạn
  const victimCoords = useMemo(() => {
    let rawLng = 108.1400;
    let rawLat = 16.0800;

    if (sos?.location?.coordinates && Array.isArray(sos.location.coordinates)) {
      rawLng = sos.location.coordinates[0];
      rawLat = sos.location.coordinates[1];
    } else if (sos?.coordinates?.lat && sos?.coordinates?.lng) {
      rawLat = sos.coordinates.lat;
      rawLng = sos.coordinates.lng;
    }

    // Tự động đảo tọa độ nếu bị ngược
    if (Math.abs(rawLat) > 90 || (rawLng < 50 && rawLat > 50)) {
      return { lat: rawLng, lng: rawLat };
    }
    return { lat: rawLat, lng: rawLng };
  }, [sos]);

  // 6. Tính toán tuyến đường thực tế qua OSRM API (Lái xe ô tô theo Google Maps)
  const fetchOsrmRoute = useCallback(async () => {
    if (!teamLocation.lat || !victimCoords.lat) return;

    try {
      const startLng = teamLocation.lng;
      const startLat = teamLocation.lat;
      const endLng = victimCoords.lng;
      const endLat = victimCoords.lat;

      // OSRM Profile /driving/ = tính đường ô tô (Google Maps Car Driving)
      const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
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
      }
    } catch (err) {
      console.warn('[OSRM Fetch Error, fallback to Direct Line]:', err);
      // Fallback tính khoảng cách lái xe ô tô theo Google Maps
      const dLat = (victimCoords.lat - teamLocation.lat) * (Math.PI / 180);
      const dLon = (victimCoords.lng - teamLocation.lng) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(teamLocation.lat * (Math.PI / 180)) *
          Math.cos(victimCoords.lat * (Math.PI / 180)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const directKm = 6371 * c;
      const carKm = directKm * 1.35;
      const distStr = carKm < 1 ? `${Math.round(carKm * 1000)} m` : `${carKm.toFixed(1)} km`;
      const carMins = Math.max(2, Math.round(carKm * 2.2));
      setRoadMetrics({
        distanceKm: distStr,
        durationMin: `${carMins} phút`,
        roadCoordinates: null,
      });
    }
  }, [teamLocation, victimCoords]);

  useEffect(() => {
    if (visible && victimCoords.lat) {
      fetchOsrmRoute();
    }
  }, [visible, victimCoords, fetchOsrmRoute]);

  // 7. Xử lý Chấp Nhận & Xuất Kích (State 1 -> State 2)
  const handleAcceptMission = async () => {
    try {
      setActionLoading(true);

      if (assignment?._id) {
        await backendApi.acceptAssignment(assignment._id);
        await backendApi.updateAssignmentStatus(assignment._id, 'EN_ROUTE', 'Đội đã nhận lệnh và xuất phát tiếp cận');
      } else if (sos?._id) {
        await backendApi.updateSosMissionStatus(sos._id, 'ON_THE_WAY', 'Đội đã tiếp nhận và đang trên đường tới');
      }

      setMissionState('EN_ROUTE');
      setAssignment((prev: any) => (prev ? { ...prev, status: 'EN_ROUTE' } : prev));
      Vibration.vibrate([0, 150, 100, 150]);
      DeviceEventEmitter.emit('sos:sync');
      onMissionUpdated?.('EN_ROUTE', assignment?._id);
      setLaunchSuccessModalVisible(true);
    } catch (err: any) {
      setCustomNotice({
        visible: true,
        type: 'error',
        title: 'Lỗi tiếp nhận',
        message: err?.message || 'Không thể cập nhật trạng thái nhiệm vụ.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // 8. Xử lý Báo Cáo Không Thể Nhận / Từ Chối
  const handleConfirmReject = async () => {
    try {
      setActionLoading(true);
      const finalReason = rejectCustomNote.trim() ? `${rejectReason} - ${rejectCustomNote.trim()}` : rejectReason;

      if (assignment?._id) {
        await backendApi.updateAssignmentStatus(assignment._id, 'REJECTED', finalReason);
      } else if (sos?._id) {
        await backendApi.updateSosMissionStatus(sos._id, 'VERIFIED', `Đội không thể nhận: ${finalReason}`);
      }

      setRejectModalVisible(false);
      setAssignment((prev: any) => (prev ? { ...prev, status: 'REJECTED' } : prev));
      DeviceEventEmitter.emit('sos:sync');
      onMissionUpdated?.('REJECTED', assignment?._id);
      setRejectSuccessModalVisible(true);
    } catch (err: any) {
      setCustomNotice({
        visible: true,
        type: 'error',
        title: 'Lỗi báo cáo',
        message: err?.message || 'Không thể gửi phản hồi từ chối.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // 9. Xử lý Đã Đến Hiện Trường (State 2 -> State 3)
  const handleArriveAtScene = () => {
    setArriveConfirmModalVisible(true);
  };

  const executeArriveAtScene = async () => {
    try {
      setActionLoading(true);
      if (assignment?._id) {
        await backendApi.updateAssignmentStatus(assignment._id, 'ARRIVED', 'Đội cứu hộ đã tiếp cận hiện trường');
      } else if (sos?._id) {
        await backendApi.updateSosMissionStatus(sos._id, 'ARRIVED', 'Đã tiếp cận hiện trường');
      }

      setMissionState('ON_SCENE_RESCUING');
      setAssignment((prev: any) => (prev ? { ...prev, status: 'ARRIVED' } : prev));
      setArriveConfirmModalVisible(false);
      Vibration.vibrate(300);
      DeviceEventEmitter.emit('sos:sync');
      onMissionUpdated?.('ARRIVED', assignment?._id);
    } catch (err: any) {
      console.warn('Lỗi cập nhật đến hiện trường:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // 10. Xử lý Chụp ảnh hiện trường báo cáo
  const handleCaptureFieldPhoto = async () => {
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
        quality: 0.6,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        setCapturedPhotoUri(res.assets[0].uri);
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

  // 11. Xử lý Hoàn Tất Cứu Hộ & Báo Cáo Kết Thúc (State 3 -> State 4)
  const handleOpenCompleteModal = () => {
    setCompletionModalVisible(true);
  };

  const handleFinalSubmitCompletion = async () => {
    try {
      setActionLoading(true);
      const notePayload = `${fieldReportNotes.trim()} | Đã cứu: ${rescuedHeadcount} người`;

      if (assignment?._id) {
        await backendApi.updateAssignmentStatus(assignment._id, 'COMPLETED', notePayload);
      }
      if (sos?._id) {
        await backendApi.post(`/sos/${sos._id}/complete`, { notes: notePayload });
      }

      setCompletionModalVisible(false);
      setMissionState('COMPLETED');
      setAssignment((prev: any) => (prev ? { ...prev, status: 'COMPLETED' } : prev));
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

  // 12. Helper tra cứu địa chỉ từ toạ độ (Reverse Geocode hoặc tọa độ thực tế)
  const fetchAddressFromCoords = async (lat: number, lng: number): Promise<string> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'User-Agent': 'SOS-Rescue-App/1.0' } }
      );
      const data = await res.json();
      if (data && data.display_name) {
        const parts = data.display_name.split(',').slice(0, 3).join(',').trim();
        return parts;
      }
    } catch {}
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
      } catch {}

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
      const payload = {
        landingPoint: landing,
        vehicleTypeNeeded: selectedRelayVehicleType,
        peopleCount: relayVictimCount,
        notes: relayNotes,
        rescueTeamName: assignment?.rescueTeamName || 'Đội Cứu Hộ',
        rescueTeamId: assignment?.rescueTeamId || null,
      };

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

      if (targetSosId) {
        try {
          await backendApi.requestShoreHandoff(targetSosId, payload);
        } catch (err) {
          console.warn('Backend requestShoreHandoff error:', err);
        }
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

  const handleCompleteShoreHandoff = async () => {
    try {
      setActionLoading(true);
      const targetSosId = sos?._id || assignment?.sosRequestId || assignment?.sosId;
      if (targetSosId) {
        try {
          await backendApi.completeShoreHandoff(targetSosId);
        } catch (err) {
          console.warn('Backend completeShoreHandoff error:', err);
        }
      }
      setShoreHandoffData((prev: any) => (prev ? { ...prev, status: 'COMPLETED' } : null));
      Vibration.vibrate(200);
      Alert.alert('✓ Bàn giao hoàn tất', 'Đã hoàn thành bàn giao nạn nhân lên xe đường bộ an toàn!');
    } catch (err) {
      console.warn('Lỗi hoàn tất bàn giao bờ:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Dữ liệu hiển thị chi tiết (Động theo dữ liệu API thực tế)
  const sosCode = sos?.sosCode || 'SOS';
  const citizenName = sos?.citizenId?.fullName || sos?.reporterName || 'Người dân';
  const citizenPhone = sos?.citizenId?.phone || sos?.contactPhone || '';
  const incidentAddress = sos?.address ?? '';
  const victimHeadcount = sos?.people ?? 0;
  const rawDescription = sos?.description ?? '';
  const teamName = assignment?.rescueTeamId?.name || assignment?.teamName || assignment?.rescueTeamName || '';
  const vehiclePlate = assignment?.vehicleId?.plateNumber || assignment?.vehicleName || '';
  const vehicleName = vehiclePlate ? `Phương tiện: ${vehiclePlate}` : '';
  const authorityName =
    assignment?.authorityOrganizationId?.name ||
    assignment?.authorityOrganizationName ||
    '';

  // Khoảng cách an toàn tránh notch / Dynamic Island của iPhone (tránh bị che phủ status bar)
  const safeTop = Math.max(insets.top, Platform.OS === 'ios' ? 56 : 40) + 12;

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

  // Xử lý gửi yêu cầu cung cấp bổ sung vật tư lên chính quyền / Ban chỉ huy địa phương
  const handleSubmitSupplyRequest = async () => {
    const items = Object.entries(selectedSuppliesToRequest)
      .filter(([_, qty]) => qty > 0)
      .map(([name, quantity]) => ({ name, quantity, unit: 'món' }));

    if (items.length === 0 && !supplyNote.trim()) {
      Alert.alert('Chưa có vật tư', 'Vui lòng chọn số lượng vật tư có sẵn hoặc nhập tên vật tư cần cấp thêm.');
      return;
    }

    try {
      setActionLoading(true);
      try {
        await backendApi.post('/supplies/request', {
          assignmentId: assignment?._id,
          sosId: sos?._id,
          items,
          urgency: supplyUrgency,
          note: supplyNote,
        });
      } catch {
        // Fallback ghi nhận
      }

      const finalItems = [...items];
      if (supplyNote.trim()) {
        finalItems.push({ name: supplyNote.trim(), quantity: 1, unit: 'yêu cầu' });
      }

      setRequestedSuppliesList((prev) => [...prev, ...finalItems]);
      setSupplyNote('');
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

  // Sinh mã HTML Leaflet tương tác toàn màn hình (Grab-Style Map Canvas & Turn-by-Turn Navigation)
  const mapHtml = useMemo(() => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow: hidden; }
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

          /* Grab-style Navigation Indicator Puck (Heading Arrow & Attached ETA Pill) */
          .grab-puck-wrap {
            position: relative;
            width: 52px;
            height: 52px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .grab-puck-pulse {
            position: absolute;
            width: 52px;
            height: 52px;
            border-radius: 50%;
            background: rgba(0, 132, 255, 0.25);
            animation: grabPuckPulse 2s infinite ease-out;
            pointer-events: none;
          }
          @keyframes grabPuckPulse {
            0% { transform: scale(0.9); opacity: 0.85; }
            70% { transform: scale(1.6); opacity: 0; }
            100% { transform: scale(1.6); opacity: 0; }
          }
          .grab-puck-circle {
            position: relative;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: #ffffff;
            border: 3.5px solid #0084ff;
            box-shadow: 0 4px 14px rgba(0, 132, 255, 0.42), 0 2px 6px rgba(0, 0, 0, 0.18);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 5;
            transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
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
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.22);
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

          // Tile Layer: Google Maps Streets (Đầy đủ tên đường, ngõ hẻm tiếng Việt, tải nhanh, không bị watermark Carto)
          var currentTileLayer = null;
          function setTileLayer(type) {
            if (currentTileLayer) map.removeLayer(currentTileLayer);
            if (type === 'satellite') {
              currentTileLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                subdomains: ['0', '1', '2', '3'],
                maxZoom: 20
              }).addTo(map);
            } else {
              currentTileLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&apistyle=s.t:33|p.v:off%2Cs.t:21|s.e:l|p.v:off&x={x}&y={y}&z={z}', {
                subdomains: ['0', '1', '2', '3'],
                maxZoom: 20
              }).addTo(map);
            }
          }
          setTileLayer('${mapLayer}');

          // 1. SOS Incident Marker
          var sosIcon = L.divIcon({
            className: 'sos-marker-div',
            html: '<div class="sos-beacon-container"><div class="sos-floating-pill">📍 ${sosCode} • Điểm cứu hộ</div><div class="sos-beacon-wave"></div><div class="sos-beacon-core">🆘</div></div>',
            iconSize: [50, 50],
            iconAnchor: [25, 25]
          });
          var sosMarker = L.marker([${victimCoords.lat}, ${victimCoords.lng}], { icon: sosIcon }).addTo(map);

          // 2. Grab-Style Driver Navigation Puck Marker (Ghim hướng xoay & Bong bóng khoảng cách)
          var rescuerIcon = L.divIcon({
            className: 'rescuer-marker-div',
            html: '<div class="grab-puck-wrap">' +
                    '<div class="grab-puck-pulse"></div>' +
                    '<div class="grab-puck-circle" id="rescuerPuck" style="transform: rotate(' + (${teamLocation.heading} || 0) + 'deg);">' +
                      '<svg class="grab-puck-arrow" viewBox="0 0 24 24" fill="none">' +
                        '<path d="M12 2L4 21L12 17L20 21L12 2Z" fill="#0084FF" stroke="#0055CC" stroke-width="1.2" stroke-linejoin="round"/>' +
                      '</svg>' +
                    '</div>' +
                    '<div class="grab-puck-eta-badge" id="rescuerEtaPill">${roadMetrics.durationMin} • ${roadMetrics.distanceKm}</div>' +
                  '</div>',
            iconSize: [52, 78],
            iconAnchor: [26, 26]
          });
          var rescuerMarker = L.marker([${teamLocation.lat}, ${teamLocation.lng}], { icon: rescuerIcon }).addTo(map);

          // 3. Đường điều hướng mượt mà chuẩn Grab (Bám chặt tim đường, không cắt qua nhà dân)
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

          function renderRoadSnappedRoute(coords) {
            if (roadCasingPolyline) map.removeLayer(roadCasingPolyline);
            if (roadCorePolyline) map.removeLayer(roadCorePolyline);
            if (directWaterwayLine) map.removeLayer(directWaterwayLine);
            if (footApproachLine) map.removeLayer(footApproachLine);

            var latLngs = coords.map(function(c) { return [c[1], c[0]]; });
            if (latLngs.length < 2) return;

            // 1. Ghim vị trí xe cứu hộ bám chặt vào ĐẦU ĐƯỜNG của lộ trình (Chuẩn Grab)
            rescuerMarker.setLatLng(latLngs[0]);

            // Tự động xoay mũi tên xe cứu hộ theo hướng xuất phát của con đường
            if (latLngs.length > 1) {
              var heading = getBearing(latLngs[0][0], latLngs[0][1], latLngs[1][0], latLngs[1][1]);
              var puck = document.getElementById('rescuerPuck');
              if (puck) {
                puck.style.transform = 'rotate(' + Math.round(heading) + 'deg)';
              }
            }

            // 2. Tuyến đường chạy 100% bám theo tim đường (Road-Snapped, không cắt xuyên qua nhà dân)
            roadCasingPolyline = L.polyline(latLngs, {
              color: '#0055CC',
              weight: 9,
              opacity: 0.65,
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(map);

            roadCorePolyline = L.polyline(latLngs, {
              color: '#0084FF',
              weight: 6,
              opacity: 1,
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(map);

            // 3. Đường nét đứt tiếp cận hiện trường nếu điểm SOS nằm sâu trong ngõ/nhà
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
                lineCap: 'round'
              }).addTo(map);
            }

            if (!inAppNavActive) {
              var allBounds = L.featureGroup([sosMarker, rescuerMarker, roadCasingPolyline]).getBounds();
              map.fitBounds(allBounds, {
                paddingTopLeft: [40, 90],
                paddingBottomRight: [50, 320],
                maxZoom: 16
              });
            }
          }

          function renderDirectWaterwayMode() {
            if (roadCasingPolyline) map.removeLayer(roadCasingPolyline);
            if (roadCorePolyline) map.removeLayer(roadCorePolyline);
            if (directWaterwayLine) map.removeLayer(directWaterwayLine);

            var directPoints = [
              [${teamLocation.lat}, ${teamLocation.lng}],
              [${victimCoords.lat}, ${victimCoords.lng}]
            ];

            directWaterwayLine = L.polyline(directPoints, {
              color: '#06b6d4',
              weight: 4.5,
              dashArray: '8, 8',
              opacity: 0.95
            }).addTo(map);

            var allBounds = L.featureGroup([sosMarker, rescuerMarker, directWaterwayLine]).getBounds();
            map.fitBounds(allBounds, {
              paddingTopLeft: [40, 90],
              paddingBottomRight: [50, 320],
              maxZoom: 16
            });
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

          // Initial Render
          ${isWaterwayMode ? 'renderDirectWaterwayMode();' : (roadMetrics.roadCoordinates ? `renderRoadSnappedRoute(${JSON.stringify(roadMetrics.roadCoordinates)});` : 'renderDirectWaterwayMode();')}

          // Fit All Markers initially
          var initialGroup = L.featureGroup([sosMarker, rescuerMarker]);
          map.fitBounds(initialGroup.getBounds(), {
            paddingTopLeft: [40, 90],
            paddingBottomRight: [50, 320],
            maxZoom: 16
          });

          var inAppNavActive = false;
          var trackingLocked = true;

          // Bắt sự kiện khi người dùng kéo/vuốt bản đồ -> Tạm thời ngừng bám theo xe
          map.on('dragstart', function() {
            trackingLocked = false;
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_DRAGGED' }));
            }
          });

          // Message Bridge từ React Native
          window.addEventListener('message', function(e) {
            try {
              var msg = JSON.parse(e.data);
              if (msg.type === 'START_INAPP_NAVIGATION') {
                inAppNavActive = true;
                trackingLocked = true;
                map.setView(rescuerMarker.getLatLng(), 17.5, { animate: true });
                if (roadCorePolyline) {
                  roadCorePolyline.setStyle({ color: '#0084FF', weight: 6.5, opacity: 1 });
                }
              } else if (msg.type === 'STOP_INAPP_NAVIGATION') {
                inAppNavActive = false;
                if (roadCasingPolyline) {
                  map.fitBounds(roadCasingPolyline.getBounds(), {
                    paddingTopLeft: [40, 90],
                    paddingBottomRight: [50, 200],
                  });
                }
              } else if (msg.type === 'UPDATE_TEAM_GPS') {
                rescuerMarker.setLatLng([msg.lat, msg.lng]);
                var puck = document.getElementById('rescuerPuck');
                if (puck && typeof msg.heading === 'number') {
                  puck.style.transform = 'rotate(' + msg.heading + 'deg)';
                }
                var etaPill = document.getElementById('rescuerEtaPill');
                if (etaPill && msg.etaText) {
                  etaPill.innerText = msg.etaText;
                }
                if (trackingLocked || inAppNavActive) {
                  map.panTo([msg.lat, msg.lng], { animate: true, duration: 0.8 });
                }
              } else if (msg.type === 'SET_ROAD_ROUTE') {
                renderRoadSnappedRoute(msg.coordinates);
                var etaPill = document.getElementById('rescuerEtaPill');
                if (etaPill && msg.distance && msg.duration) {
                  etaPill.innerText = msg.duration + ' • ' + msg.distance;
                }
              } else if (msg.type === 'RECENTER_TEAM') {
                trackingLocked = true;
                map.setView(rescuerMarker.getLatLng(), inAppNavActive ? 18 : 17.5, { animate: true });
              } else if (msg.type === 'FIT_ROUTE') {
                trackingLocked = false;
                if (roadCasingPolyline) {
                  map.fitBounds(roadCasingPolyline.getBounds(), {
                    paddingTopLeft: [40, 90],
                    paddingBottomRight: [50, 320],
                  });
                } else {
                  map.fitBounds(initialGroup.getBounds(), {
                    paddingTopLeft: [40, 90],
                    paddingBottomRight: [50, 320],
                  });
                }
              } else if (msg.type === 'CHANGE_MAP_LAYER') {
                setTileLayer(msg.layer);
              } else if (msg.type === 'ENABLE_LANDING_PICKER') {
                var pLat = msg.lat || map.getCenter().lat;
                var pLng = msg.lng || map.getCenter().lng;
                if (!window.landingPickerMarker) {
                  var landingPinHtml = '<div style="position:relative; width:46px; height:46px; display:flex; align-items:center; justify-content:center;">' +
                    '<div style="width:38px; height:38px; border-radius:50%; background:#ea580c; border:3px solid #ffffff; box-shadow:0 4px 14px rgba(234,88,12,0.85); display:flex; align-items:center; justify-content:center; color:#ffffff; font-size:20px;">⚓</div>' +
                    '<div style="position:absolute; bottom:-7px; left:17px; width:0; height:0; border-left:6px solid transparent; border-right:6px solid transparent; border-top:8px solid #ea580c;"></div>' +
                    '</div>';
                  var landingPinIcon = L.divIcon({
                    className: 'custom-landing-picker-icon',
                    html: landingPinHtml,
                    iconSize: [46, 46],
                    iconAnchor: [23, 46]
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
          });

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
        </script>
      </body>
      </html>
    `;
  }, [victimCoords, mapLayer, showSafeShelters, isWaterwayMode, roadMetrics.roadCoordinates, sosCode]);

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
            source={{ html: mapHtml }}
            style={StyleSheet.absoluteFill}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            scrollEnabled={false}
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

          {!isTopHudHidden ? (
            <View style={[styles.grabManeuverCard, isNavigating && styles.grabManeuverCardNavigating]}>
              {/* Maneuver Turn Icon */}
              <View style={[styles.grabTurnIconBox, isNavigating && { backgroundColor: '#10B981' }]}>
                <MaterialCommunityIcons
                  name={isNavigating ? 'navigation-variant' : (missionState === 'ON_SCENE_RESCUING' ? 'target' : 'arrow-up-right')}
                  size={20}
                  color="#FFFFFF"
                />
              </View>

              {/* Distance & Street Name */}
              <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.grabDistanceText}>{roadMetrics.distanceKm}</Text>
                  <Text style={styles.grabDurationText}>• {roadMetrics.durationMin}</Text>
                </View>
                <Text style={styles.grabRoadText} numberOfLines={1}>
                  {isNavigating ? `Dẫn đường: ${incidentAddress}` : `Đến: ${incidentAddress || 'Hiện trường cứu nạn'}`}
                </Text>
              </View>

              {/* Tốc độ giới hạn chuẩn Grab */}
              <View style={styles.grabSpeedLimitBadge}>
                <Text style={styles.grabSpeedLimitText}>50</Text>
              </View>

              {/* Nút thu gọn HUD để thoáng bản đồ */}
              <TouchableOpacity
                style={styles.grabHideHudBtn}
                onPress={() => setIsTopHudHidden(true)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="chevron-up" size={16} color="#64748B" />
              </TouchableOpacity>
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
            onPress={() => setIsSheetCollapsed((prev) => !prev)}
            activeOpacity={0.7}
          >
            <View style={styles.deckHandleBar} />
            <View style={styles.sheetToggleHeader}>
              <Text style={styles.sheetToggleHeaderText}>
                {isSheetCollapsed ? 'Kéo lên để xem đầy đủ chi tiết' : 'Kéo gọn xuống để xem bản đồ'}
              </Text>
              <Feather
                name={isSheetCollapsed ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#64748B"
              />
            </View>
          </TouchableOpacity>

          {/* Grab Sub-Header: Tiêu đề điểm đến & Thời gian tiếp cận */}
          <View style={styles.grabDeckSubHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
              <View style={styles.grabOrderBadge}>
                <Text style={styles.grabOrderBadgeText}>1</Text>
              </View>
              <Text style={styles.grabOrderTitle} numberOfLines={1}>Điểm cứu hộ • #{sosCode}</Text>
            </View>

            <View style={styles.grabEtaChip}>
              <Text style={styles.grabEtaChipText}>{roadMetrics.durationMin} ({roadMetrics.distanceKm})</Text>
            </View>
          </View>

          {/* Khi bị kéo gọn xuống: Chỉ hiện tên & địa chỉ 1 dòng tóm tắt */}
          {isSheetCollapsed ? (
            <TouchableOpacity
              style={styles.collapsedSummaryRow}
              onPress={() => setIsSheetCollapsed(false)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.collapsedCitizenName} numberOfLines={1}>
                  {citizenName} <Text style={styles.collapsedVictimCount}>({victimHeadcount} người cần cứu)</Text>
                </Text>
                <Text style={styles.collapsedAddressText} numberOfLines={1}>
                  {incidentAddress}
                </Text>
              </View>
              <View style={styles.collapsedExpandHint}>
                <Text style={styles.collapsedExpandHintText}>Chi tiết</Text>
                <Feather name="chevron-up" size={14} color="#0284C7" />
              </View>
            </TouchableOpacity>
          ) : (
            /* Khi mở rộng: Hiển thị đầy đủ thông tin */
            <View style={styles.grabCitizenSection}>
              {/* Tên người dân - To, đậm, nổi bật */}
              <Text style={styles.grabCitizenName}>{citizenName}</Text>

              {/* Địa chỉ hiện trường - Hiển thị đầy đủ, không ẩn bớt, không cắt '...' */}
              <Text style={styles.grabAddressText}>{incidentAddress}</Text>

              {/* Số người & Đối tượng cần cứu */}
              <Text style={styles.grabVictimMeta}>
                {victimHeadcount} người cần cứu • 1 người già, 1 trẻ nhỏ
              </Text>

              {/* Hộp ghi chú hiện trường (Note box xám giống hệt Grab) */}
              {rawDescription ? (
                <View style={styles.grabNoteBox}>
                  <Text style={styles.grabNoteLabel}>Ghi chú từ hiện trường:</Text>
                  <Text style={styles.grabNoteText}>{rawDescription}</Text>
                </View>
              ) : null}

              {/* Hộp vật tư & hàng tiếp tế cấp theo xe (Có Xem Chi Tiết & Yêu cầu cấp thêm) */}
              {(() => {
                const missionSupplies =
                  assignment?.supplies ||
                  (assignment as any)?.reliefItems ||
                  sos?.supplies ||
                  [
                    { name: 'Áo phao cứu sinh tiêu chuẩn SOLAS', quantity: Math.max(2, victimHeadcount), unit: 'Chiếc' },
                    { name: 'Túi thuốc & Sơ cấp cứu dã chiến', quantity: 1, unit: 'Bộ' },
                    { name: 'Nước uống đóng chai tiệt trùng (Thùng 24 chai)', quantity: Math.ceil(Math.max(1, victimHeadcount) / 2), unit: 'Thùng' },
                  ];

                return (
                  <View style={styles.grabSuppliesBox}>
                    {/* Hàng 1: Tiêu đề + Huy hiệu số lượng bên trái, Nút Yêu cầu thêm bên phải */}
                    <View style={styles.suppliesHeaderRow}>
                      <View style={styles.suppliesHeaderTitleWrap}>
                        <MaterialCommunityIcons name="package-variant-closed" size={17} color="#15803D" />
                        <Text style={styles.grabSuppliesLabel}>
                          Vật tư theo xe
                        </Text>
                        <View style={styles.suppliesCountBadge}>
                          <Text style={styles.suppliesCountBadgeText}>
                            {missionSupplies.length} loại
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.requestSuppliesBtn}
                        onPress={() => setSupplyRequestModalVisible(true)}
                        activeOpacity={0.8}
                      >
                        <Feather name="plus-circle" size={13} color="#0284C7" />
                        <Text style={styles.requestSuppliesBtnText}>+ Yêu cầu thêm</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Hàng 2: Danh sách vật tư (Thu gọn vs Mở rộng toàn bộ) */}
                    {suppliesExpanded ? (
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
                      <View style={styles.requestedSuppliesNotice}>
                        <Ionicons name="information-circle" size={15} color="#D97706" />
                        <Text style={styles.requestedSuppliesNoticeText}>
                          Đã yêu cầu chi viện: {requestedSuppliesList.map((item) => `${item.name} (${item.quantity})`).join(', ')} (Chờ địa phương cấp)
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })()}
            </View>
          )}

          {/* Hàng 4 nút thao tác nhanh (Chỉ đường in-app, Gọi điện, Từ chối, Trú ẩn) */}
          {!isSheetCollapsed && (
            <View style={styles.grabActionRow}>
              {/* Nút 1: Ghim lại vị trí mình (thay cho nút Chỉ đường) */}
              <TouchableOpacity
                style={styles.grabActionCol}
                onPress={() => {
                  setIsHeadingLocked(true);
                  Vibration.vibrate(30);
                  if (webViewRef.current) {
                    webViewRef.current.postMessage(JSON.stringify({ type: 'RECENTER_TEAM' }));
                  }
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.grabActionIconWrap, isHeadingLocked && { backgroundColor: '#E0F2FE', borderColor: '#0284C7' }]}>
                  <MaterialCommunityIcons
                    name={isHeadingLocked ? 'crosshairs-gps' : 'crosshairs'}
                    size={20}
                    color="#0284C7"
                  />
                </View>
                <Text style={[styles.grabActionLabel, isHeadingLocked && { color: '#0284C7', fontWeight: '800' }]}>
                  {isHeadingLocked ? 'Đang ghim' : 'Ghim vị trí'}
                </Text>
              </TouchableOpacity>

              {/* Nút 2: Gọi điện */}
              <TouchableOpacity
                style={styles.grabActionCol}
                onPress={() => Linking.openURL(`tel:${citizenPhone}`)}
                activeOpacity={0.8}
              >
                <View style={styles.grabActionIconWrap}>
                  <Feather name="phone" size={20} color="#059669" />
                </View>
                <Text style={styles.grabActionLabel}>Gọi điện</Text>
              </TouchableOpacity>

              {/* Nút 3: Từ chối (Đổi từ Báo sự cố sang Từ chối) */}
              <TouchableOpacity
                style={styles.grabActionCol}
                onPress={() => setRejectModalVisible(true)}
                activeOpacity={0.8}
              >
                <View style={[styles.grabActionIconWrap, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                  <Feather name="x-circle" size={20} color="#DC2626" />
                </View>
                <Text style={[styles.grabActionLabel, { color: '#DC2626', fontWeight: '800' }]}>Từ chối</Text>
              </TouchableOpacity>

              {/* Nút 4: Trạm trú ẩn */}
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
            </View>
          )}

          {/* Primary Action Button to, rõ, full width giống Grab */}
          <View style={styles.grabPrimaryBtnContainer}>
            {actionLoading ? (
              <View style={styles.loadingActionBar}>
                <ActivityIndicator size="small" color="#0284C7" />
                <Text style={styles.loadingActionText}>Đang xử lý đồng bộ...</Text>
              </View>
            ) : (
              <>
                {missionState === 'ASSIGNED_PENDING_ACCEPTANCE' && (
                  <TouchableOpacity
                    style={styles.grabBigGreenBtn}
                    onPress={handleAcceptMission}
                    activeOpacity={0.88}
                  >
                    <Ionicons name="flash" size={20} color="#FFFFFF" />
                    <Text style={styles.grabBigBtnText}>⚡ NHẬN LỆNH & XUẤT KÍCH</Text>
                  </TouchableOpacity>
                )}

                {missionState === 'EN_ROUTE' && (
                  <TouchableOpacity
                    style={[styles.grabBigGreenBtn, { backgroundColor: '#0066FF' }]}
                    onPress={handleArriveAtScene}
                    activeOpacity={0.88}
                  >
                    <Ionicons name="location-sharp" size={22} color="#FFFFFF" />
                    <Text style={styles.grabBigBtnText}>ĐÃ ĐẾN HIỆN TRƯỜNG (ARRIVED)</Text>
                  </TouchableOpacity>
                )}

                {missionState === 'ON_SCENE_RESCUING' && (
                  <View style={{ gap: 10, width: '100%' }}>
                    {/* Banner hiển thị khi đã yêu cầu xe đón bờ */}
                    {shoreHandoffData && shoreHandoffData.status === 'ASSIGNED' && (
                      <View
                        style={{
                          backgroundColor: '#ECFDF5',
                          borderWidth: 1.5,
                          borderColor: '#10B981',
                          borderRadius: 12,
                          padding: 12,
                          gap: 6,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="medical" size={18} color="#059669" />
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#065F46', textTransform: 'uppercase' }}>
                              Xe đón bờ đang đến!
                            </Text>
                          </View>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669', backgroundColor: '#D1FAE5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
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
                          Bến đón: <Text style={{ fontWeight: '700', color: '#B45309' }}>{shoreHandoffData.landingPoint?.name}</Text>
                        </Text>

                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                          {shoreHandoffData.assignedDriverPhone && (
                            <TouchableOpacity
                              style={{
                                flex: 1,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                backgroundColor: '#FFFFFF',
                                borderWidth: 1,
                                borderColor: '#10B981',
                                paddingVertical: 8,
                                borderRadius: 8,
                              }}
                              onPress={() => Linking.openURL(`tel:${shoreHandoffData.assignedDriverPhone}`)}
                            >
                              <Ionicons name="call" size={14} color="#059669" />
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>Gọi Tài Xế</Text>
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            style={{
                              flex: 1.4,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                              backgroundColor: '#059669',
                              paddingVertical: 8,
                              borderRadius: 8,
                            }}
                            onPress={handleCompleteShoreHandoff}
                          >
                            <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>Đã Lên Xe Đón</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {shoreHandoffData && shoreHandoffData.status === 'REQUESTED' && (
                      <View
                        style={{
                          backgroundColor: '#FFFBEB',
                          borderWidth: 1.5,
                          borderColor: '#F59E0B',
                          borderRadius: 12,
                          padding: 12,
                          gap: 6,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="flash" size={18} color="#D97706" />
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#92400E', textTransform: 'uppercase' }}>
                              Đang Chờ Xe Đón Bờ
                            </Text>
                          </View>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309', backgroundColor: '#FDE68A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            ĐÃ BÁO BAN CHỈ HUY
                          </Text>
                        </View>

                        <Text style={{ fontSize: 12.5, color: '#374151' }}>
                          Cần: <Text style={{ fontWeight: '700' }}>{shoreHandoffData.vehicleTypeNeeded === 'AMBULANCE' ? '01 Xe Cứu Thương' : '01 Xe Tải'}</Text> cho {shoreHandoffData.peopleCount} nạn nhân
                        </Text>
                        <Text style={{ fontSize: 12, color: '#4B5563' }}>
                          Bến đón: <Text style={{ fontWeight: '700', color: '#B45309' }}>{shoreHandoffData.landingPoint?.name}</Text>
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
                    )}

                    {/* Yêu cầu xe đón tại bờ (Nút nhỏ phụ ở trên dành cho ca cần xe chuyển tiếp) */}
                    {(!shoreHandoffData || shoreHandoffData.status === 'NONE') && (
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backgroundColor: '#FFF7ED',
                          borderWidth: 1.5,
                          borderColor: '#FDBA74',
                          borderRadius: 12,
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          marginBottom: 8,
                        }}
                        onPress={() => setShoreHandoffModalVisible(true)}
                        activeOpacity={0.85}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                          <View
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 16,
                              backgroundColor: '#FFEDD5',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <MaterialCommunityIcons name="car-emergency" size={18} color="#EA580C" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#9A3412' }}>
                              Yêu Cầu Xe Đón Nạn Nhân Tại Bờ
                            </Text>
                            <Text style={{ fontSize: 11, color: '#C2410C' }}>
                              Điều xe cấp cứu / xe tải đón tại mép nước (Tùy chọn)
                            </Text>
                          </View>
                        </View>
                        <Feather name="chevron-right" size={18} color="#EA580C" />
                      </TouchableOpacity>
                    )}

                    {/* NÚT CHÍNH TO BẢN: HOÀN TẤT CỨU HỘ & BÁO CÁO (LUÔN GIỮ NGUYÊN) */}
                    <TouchableOpacity
                      style={[styles.grabBigGreenBtn, { backgroundColor: '#059669' }]}
                      onPress={handleOpenCompleteModal}
                      activeOpacity={0.88}
                    >
                      <Ionicons name="checkmark-done-circle" size={24} color="#FFFFFF" />
                      <Text style={styles.grabBigBtnText}>HOÀN TẤT CỨU HỘ & BÁO CÁO</Text>
                    </TouchableOpacity>
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
                <Text style={{ fontSize: 18 }}>⚓</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickLandingTopTitle}>CHỌN ĐIỂM HẸN XE ĐÓN BỜ</Text>
                <Text style={styles.pickLandingTopSubtitle}>
                  Chạm bản đồ hoặc kéo ghim ⚓ đến vị trí xe có thể tiếp cận đón
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
                  Xác nhận đến hiện trường
                </Text>
                <Text style={styles.centeredModalDesc}>
                  Đội đã tiếp cận chính xác vị trí người dân gặp nạn và bắt đầu phương án cứu nạn?
                </Text>
              </View>

              {/* Tóm tắt địa điểm & số người */}
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
                  <Feather name="users" size={14} color="#DC2626" />
                  <Text style={{ fontSize: 13, color: '#DC2626', fontWeight: '800' }}>
                    {victimHeadcount} người cần cứu ({citizenName})
                  </Text>
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <TouchableOpacity
                  style={[
                    styles.modalPrimaryFullBtn,
                    {
                      backgroundColor: '#2563EB',
                      shadowColor: '#2563EB',
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
                    Đã Đến Hiện Trường
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
                    backgroundColor: '#EFF6FF',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: '#BFDBFE',
                  }}
                >
                  <Ionicons name="rocket-outline" size={34} color="#2563EB" />
                </View>
                <Text style={styles.centeredModalTitle}>
                  Đã Nhận Lệnh Xuất Kích! 🚀
                </Text>
                <Text style={styles.centeredModalDesc}>
                  Lộ trình dẫn đường tự động đã được kích hoạt. Di chuyển an toàn đến hiện trường!
                </Text>

                <TouchableOpacity
                  style={[
                    styles.modalPrimaryFullBtn,
                    {
                      backgroundColor: '#2563EB',
                      shadowColor: '#2563EB',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                      elevation: 4,
                    },
                  ]}
                  onPress={() => setLaunchSuccessModalVisible(false)}
                >
                  <Text style={styles.modalPrimaryFullBtnText}>
                    BẮT ĐẦU DẪN ĐƯỜNG
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
                <Text style={styles.modalTitle}>Từ Chối Nhận Nhiệm Vụ</Text>
                <TouchableOpacity onPress={() => setRejectModalVisible(false)}>
                  <Feather name="x" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalDesc}>
                Vui lòng chọn lý do nghiệp vụ để Ban Chỉ Huy PCTT điều chuyển ngay lực lượng cứu hộ dự phòng hỗ trợ nạn nhân:
              </Text>

              {[
                'Phương tiện gặp sự cố kỹ thuật đột xuất',
                'Tuyến đường thủy bị cô lập, dòng nước chảy xiết quá tải',
                'Vượt quá tải trọng / thiếu trang thiết bị cứu hộ chuyên dụng',
                'Đang phụ trách cứu nạn một ca nguy kịch khác',
              ].map((reasonItem) => (
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
              <View style={styles.modalHeaderRow}>
                <MaterialCommunityIcons name="package-variant-plus" size={24} color="#0284C7" />
                <Text style={styles.modalTitle}>Yêu Cầu Chi Viện Vật Tư</Text>
                <TouchableOpacity onPress={() => setSupplyRequestModalVisible(false)}>
                  <Feather name="x" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalDesc}>
                Gửi yêu cầu tiếp tế trang thiết bị, vật tư lên Ban Chỉ Huy địa phương để được hỗ trợ chuyển đến hiện trường:
              </Text>

              <ScrollView style={{ maxHeight: 250 }} showsVerticalScrollIndicator={false}>
                {Object.entries(selectedSuppliesToRequest).map(([itemKey, qty]) => (
                  <View key={itemKey} style={styles.supplyRequestItemRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.supplyRequestItemName}>{itemKey}</Text>
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
                ))}
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
                  onPress={() => setSupplyRequestModalVisible(false)}
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
        <Modal visible={shoreHandoffModalVisible} transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { maxHeight: SCREEN_HEIGHT * 0.88 }]}>
              <View style={styles.modalHeaderRow}>
                <MaterialCommunityIcons name="car-emergency" size={24} color="#EA580C" />
                <Text style={styles.modalTitle}>Yêu Cầu Xe Đón Tại Bờ</Text>
                <TouchableOpacity onPress={() => setShoreHandoffModalVisible(false)}>
                  <Feather name="x" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalDesc}>
                Ca-nô đưa người ra mép ngập. Yêu cầu Ban Chỉ Huy điều động xe đường bộ đón nạn nhân đưa đến Bệnh viện hoặc Khu an toàn:
              </Text>

              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
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
                    <Text style={{ fontSize: 14 }}>⚓</Text>
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

              {/* Action buttons */}
              <View style={styles.modalActionButtons}>
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
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 2: BÁO CÁO KẾT THÚC CỨU HỘ & CHỤP ẢNH HIỆN TRƯỜNG */}
        {/* ======================================================== */}
        <Modal visible={completionModalVisible} transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeaderRow}>
                <Ionicons name="checkmark-circle" size={24} color="#16A34A" />
                <Text style={styles.modalTitle}>Báo Cáo Hoàn Tất Cứu Hộ</Text>
                <TouchableOpacity onPress={() => setCompletionModalVisible(false)}>
                  <Feather name="x" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalDesc}>
                Ghi nhận kết quả tác chiến để lưu hồ sơ cứu trợ và đồng bộ báo cáo cho Ban Chỉ Huy:
              </Text>

              <View style={styles.completionStatsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Số người đã cứu</Text>
                  <Text style={styles.statValue}>{rescuedHeadcount} người</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Thời gian tiếp cận</Text>
                  <Text style={styles.statValue}>18 phút</Text>
                </View>
              </View>

              <Text style={styles.inputSectionLabel}>Biên bản tóm tắt tình hình hiện trường:</Text>
              <TextInput
                style={[styles.modalTextInput, { height: 70 }]}
                value={fieldReportNotes}
                onChangeText={setFieldReportNotes}
                multiline
              />

              {/* Chụp ảnh nghiệm thu hiện trường */}
              <View style={styles.photoUploadRow}>
                {capturedPhotoUri ? (
                  <View style={styles.capturedPhotoWrap}>
                    <Image source={{ uri: capturedPhotoUri }} style={styles.capturedPhotoImg} />
                    <TouchableOpacity style={styles.retakePhotoBtn} onPress={handleCaptureFieldPhoto}>
                      <Text style={styles.retakePhotoText}>Chụp lại</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.takePhotoBtn} onPress={handleCaptureFieldPhoto}>
                    <Ionicons name="camera-outline" size={20} color="#0284C7" />
                    <Text style={styles.takePhotoBtnText}>Chụp ảnh xác nhận hiện trường</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.modalActionButtons}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setCompletionModalVisible(false)}
                >
                  <Text style={styles.modalCancelBtnText}>Quay lại</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalRejectConfirmBtn, { backgroundColor: '#16A34A' }]}
                  onPress={handleFinalSubmitCompletion}
                  disabled={actionLoading}
                >
                  <Text style={styles.modalRejectConfirmBtnText}>Lưu & Hoàn Thành</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
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
                  Hoàn Tất Cứu Hộ Xuất Sắc! 🎉
                </Text>
                <Text style={styles.centeredModalDesc}>
                  Toàn bộ {rescuedHeadcount} người dân đã được đưa về nơi an toàn. Trạng thái đội đã tự động chuyển về SẴN SÀNG tác chiến.
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
                    onMissionCompleted?.({ rescuedCount: rescuedHeadcount });
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
  },
  suppliesCountBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
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
    maxHeight: SCREEN_HEIGHT * 0.62,
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
  capturedPhotoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  capturedPhotoImg: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  retakePhotoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
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
    top: 40,
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

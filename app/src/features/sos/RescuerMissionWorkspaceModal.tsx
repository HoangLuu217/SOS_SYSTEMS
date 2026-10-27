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

  // Team GPS Location & Telemetry (Mặc định Trạm Cứu hộ Phường Liên Chiểu)
  const [teamLocation, setTeamLocation] = useState<{ lat: number; lng: number; heading: number }>({
    lat: 16.0795,
    lng: 108.1485,
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
  const [isSheetCollapsed, setIsSheetCollapsed] = useState<boolean>(true);

  // State 1 Rejection Modal
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
            }
          }
        }
      } else if (initialSosData) {
        setSos(initialSosData);
        if (initialSosData.people) {
          setRescuedHeadcount(initialSosData.people);
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
            // Kiểm tra xem GPS máy thật có gần hiện trường (< 5km) không
            const dLat = Math.abs(curr.coords.latitude - victimCoords.lat);
            const dLng = Math.abs(curr.coords.longitude - victimCoords.lng);
            const isNearIncident = dLat < 0.05 && dLng < 0.05;

            // Nếu người dùng đang test từ xa (> 5km), giữ tọa độ trạm cứu hộ Phường Liên Chiểu để hiển thị tuyến đường 1.1km thực tế
            if (isNearIncident) {
              setTeamLocation({
                lat: curr.coords.latitude,
                lng: curr.coords.longitude,
                heading: curr.coords.heading || 45,
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
                const dLat = Math.abs(loc.coords.latitude - victimCoords.lat);
                const dLng = Math.abs(loc.coords.longitude - victimCoords.lng);
                const isNearIncident = dLat < 0.05 && dLng < 0.05;

                if (isNearIncident) {
                  const newLoc = {
                    lat: loc.coords.latitude,
                    lng: loc.coords.longitude,
                    heading: loc.coords.heading || 45,
                  };
                  setTeamLocation(newLoc);

                  // Phát telemetry lên Socket.IO
                  if (socketRef.current && socketRef.current.connected) {
                    socketRef.current.emit('rescuer:location_update', {
                      rescuerId: user?._id,
                      assignmentId: assignment?._id,
                      teamId: assignment?.rescueTeamId?._id || assignment?.rescueTeamId,
                      location: newLoc,
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
                      })
                    );
                  }
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
          setSos((prev: any) => ({ ...prev, ...updatedSos }));
          syncStateFromStatus(updatedSos.status);
          onMissionUpdated?.(updatedSos.status, assignment?._id);
        }
      });

      return () => {
        socket.off('assignment:cancelled', handleMissionCancelled);
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

  // Dữ liệu hiển thị chi tiết
  const isReliefMission =
    assignment?.missionType === 'RELIEF_DISPATCH' ||
    sos?.emergencyType === 'RELIEF' ||
    (typeof sos?.description === 'string' && sos.description.includes('xuất cấp cứu trợ')) ||
    (typeof assignment?.note === 'string' && assignment.note.includes('xuất cấp cứu trợ'));

  const sosCode = sos?.sosCode || 'SOS-8924';
  const recipientName =
    assignment?.recipientName ||
    (typeof assignment?.note === 'string' && assignment.note.match(/Người nhận:\s*([^.)\]]+)/)?.[1]?.trim()) ||
    (typeof sos?.description === 'string' && sos.description.match(/Người nhận:\s*([^.)\]]+)/)?.[1]?.trim());
  const citizenName = isReliefMission
    ? (recipientName || sos?.citizenId?.fullName || 'Đầu mối tiếp nhận cứu trợ')
    : (sos?.citizenId?.fullName || sos?.reporterName || 'Người dân khẩn cấp');
  const citizenPhone = sos?.citizenId?.phone || sos?.contactPhone || '0905123987';
  const incidentAddress = assignment?.destination || sos?.address || '456 Tôn Đức Thắng, Phường Liên Chiểu, TP Đà Nẵng';
  const victimHeadcount = sos?.people || 2;
  const rawDescription = assignment?.note || sos?.description || 'Nước ngập sâu, cần hỗ trợ ca-nô di tản người già';
  const teamName = assignment?.rescueTeamId?.name || assignment?.teamName || 'Đội Phản Ứng Nhanh Cứu Hộ Phường Liên Chiểu (43-LC-01)';
  const vehiclePlate = assignment?.vehicleId?.plateNumber || assignment?.vehicleName || '43A-LC.99';
  const vehicleName = assignment?.vehicleId?.plateNumber
    ? `Ca-nô / Xe: ${assignment.vehicleId.plateNumber}`
    : `Ca-nô / Xe: ${vehiclePlate}`;
  const authorityName =
    assignment?.authorityOrganizationId?.name ||
    assignment?.authorityOrganizationName ||
    (incidentAddress?.includes('Liên Chiểu')
      ? 'Ban Chỉ Huy PCTT Phường Liên Chiểu'
      : 'Ban Chỉ Huy PCTT & TKCN');

  // Khoảng cách an toàn tránh notch / Dynamic Island của iPhone (tránh bị che phủ status bar)
  const safeTop = Math.max(insets.top, Platform.OS === 'ios' ? 56 : 40) + 12;

  // Mở ứng dụng Google Maps / Apple Maps ngoài để chỉ đường Turn-by-Turn giống Grab
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
      .catch((err) => {
        console.warn('Lỗi mở ứng dụng bản đồ:', err);
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
      });
  }, [victimCoords, incidentAddress, sosCode]);

  // Sinh mã HTML Leaflet tương tác toàn màn hình (Grab-Style Map Canvas)
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
          html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #0f172a; font-family: -apple-system, sans-serif; overflow: hidden; }
          .leaflet-container { background-color: #0f172a; }
          
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

          /* Rescue Unit Watercraft Marker with Heading Rotation */
          .rescuer-vehicle-wrap {
            position: relative;
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .rescuer-vehicle-core {
            width: 34px;
            height: 34px;
            border-radius: 10px;
            background: #0284c7;
            border: 2.5px solid #ffffff;
            box-shadow: 0 4px 14px rgba(2, 132, 199, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            transition: transform 0.3s ease;
          }
          .rescuer-floating-pill {
            position: absolute;
            bottom: -20px;
            background: #0369a1;
            color: #ffffff;
            font-size: 9.5px;
            font-weight: 800;
            padding: 1.5px 6px;
            border-radius: 5px;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            border: 1px solid #38bdf8;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', {
            zoomControl: false,
            attributionControl: false
          }).setView([${teamLocation.lat}, ${teamLocation.lng}], 15);

          // Tile Layer (Google Maps Streets vs Google Hybrid Satellite)
          var currentTileLayer = null;
          function setTileLayer(type) {
            if (currentTileLayer) map.removeLayer(currentTileLayer);
            if (type === 'satellite') {
              currentTileLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                maxZoom: 20
              }).addTo(map);
            } else {
              currentTileLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
                maxZoom: 20
              }).addTo(map);
            }
          }
          setTileLayer('${mapLayer}');

          // 1. SOS Incident Marker
          var sosIcon = L.divIcon({
            className: 'sos-marker-div',
            html: '<div class="sos-beacon-container"><div class="sos-floating-pill">${sosCode} • CRITICAL</div><div class="sos-beacon-wave"></div><div class="sos-beacon-core">🆘</div></div>',
            iconSize: [50, 50],
            iconAnchor: [25, 25]
          });
          var sosMarker = L.marker([${victimCoords.lat}, ${victimCoords.lng}], { icon: sosIcon }).addTo(map);

          // 2. Rescue Unit Vehicle Marker
          var rescuerIcon = L.divIcon({
            className: 'rescuer-marker-div',
            html: '<div class="rescuer-vehicle-wrap"><div class="rescuer-vehicle-core" id="rescuerCore" style="transform: rotate(${teamLocation.heading}deg);">🚤</div><div class="rescuer-floating-pill">${vehiclePlate}</div></div>',
            iconSize: [48, 48],
            iconAnchor: [24, 24]
          });
          var rescuerMarker = L.marker([${teamLocation.lat}, ${teamLocation.lng}], { icon: rescuerIcon }).addTo(map);

          // 3. Dual-Layer Road Polylines & Grab-Style Dotted Access Connectors
          var roadCasingPolyline = null;
          var roadCorePolyline = null;
          var directWaterwayLine = null;
          var startConnectorLine = null;
          var endConnectorLine = null;
          var currentRoadStartLatLng = null;

          function renderRoadSnappedRoute(coords) {
            if (roadCasingPolyline) map.removeLayer(roadCasingPolyline);
            if (roadCorePolyline) map.removeLayer(roadCorePolyline);
            if (directWaterwayLine) map.removeLayer(directWaterwayLine);
            if (startConnectorLine) map.removeLayer(startConnectorLine);
            if (endConnectorLine) map.removeLayer(endConnectorLine);

            var latLngs = coords.map(function(c) { return [c[1], c[0]]; });
            if (latLngs.length < 2) return;

            currentRoadStartLatLng = latLngs[0];
            var currentRoadEndLatLng = latLngs[latLngs.length - 1];

            // 1. Đường chấm chấm nối điểm đầu: Vị trí đội cứu hộ -> Điểm đầu đường bộ OSRM
            startConnectorLine = L.polyline([rescuerMarker.getLatLng(), currentRoadStartLatLng], {
              color: '#0284c7',
              weight: 2,
              dashArray: '3, 5',
              lineCap: 'round',
              opacity: 0.85
            }).addTo(map);

            // 2. Lớp viền ngoài (Outer Casing: 8px #1d4ed8)
            roadCasingPolyline = L.polyline(latLngs, {
              color: '#1d4ed8',
              weight: 8,
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(map);

            // 3. Lớp lõi sáng (Inner Core: 4px #38bdf8)
            roadCorePolyline = L.polyline(latLngs, {
              color: '#38bdf8',
              weight: 4,
              opacity: 1,
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(map);

            // 4. Đường chấm chấm nối điểm cuối: Điểm cuối đường bộ OSRM -> Vị trí Nạn nhân
            endConnectorLine = L.polyline([currentRoadEndLatLng, sosMarker.getLatLng()], {
              color: '#dc2626',
              weight: 2,
              dashArray: '3, 5',
              lineCap: 'round',
              opacity: 0.85
            }).addTo(map);

            var allBounds = L.featureGroup([sosMarker, rescuerMarker, roadCasingPolyline, startConnectorLine, endConnectorLine]).getBounds();
            map.fitBounds(allBounds, {
              paddingTopLeft: [40, 80],
              paddingBottomRight: [50, 340],
              maxZoom: 16
            });
          }

          function renderDirectWaterwayMode() {
            if (roadCasingPolyline) map.removeLayer(roadCasingPolyline);
            if (roadCorePolyline) map.removeLayer(roadCorePolyline);
            if (directWaterwayLine) map.removeLayer(directWaterwayLine);
            if (startConnectorLine) map.removeLayer(startConnectorLine);
            if (endConnectorLine) map.removeLayer(endConnectorLine);

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
              paddingTopLeft: [40, 80],
              paddingBottomRight: [50, 340],
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

          // Fit All Markers initially with bottom padding for the sheet
          var initialGroup = L.featureGroup([sosMarker, rescuerMarker]);
          map.fitBounds(initialGroup.getBounds(), {
            paddingTopLeft: [40, 80],
            paddingBottomRight: [50, 340],
            maxZoom: 16
          });

          // Message Bridge từ React Native
          window.addEventListener('message', function(e) {
            try {
              var msg = JSON.parse(e.data);
              if (msg.type === 'UPDATE_TEAM_GPS') {
                rescuerMarker.setLatLng([msg.lat, msg.lng]);
                if (startConnectorLine && currentRoadStartLatLng) {
                  startConnectorLine.setLatLngs([[msg.lat, msg.lng], currentRoadStartLatLng]);
                }
                var core = document.getElementById('rescuerCore');
                if (core && msg.heading) {
                  core.style.transform = 'rotate(' + msg.heading + 'deg)';
                }
              } else if (msg.type === 'SET_ROAD_ROUTE') {
                renderRoadSnappedRoute(msg.coordinates);
              } else if (msg.type === 'RECENTER_TEAM') {
                map.setView(rescuerMarker.getLatLng(), 17);
              } else if (msg.type === 'FIT_ROUTE') {
                if (roadCasingPolyline) {
                  map.fitBounds(roadCasingPolyline.getBounds(), {
                    paddingTopLeft: [40, 80],
                    paddingBottomRight: [50, 340],
                  });
                } else {
                  map.fitBounds(initialGroup.getBounds(), {
                    paddingTopLeft: [40, 80],
                    paddingBottomRight: [50, 340],
                  });
                }
              }
            } catch(err) {}
          });
        </script>
      </body>
      </html>
    `;
  }, [teamLocation, victimCoords, mapLayer, showSafeShelters, isWaterwayMode, roadMetrics.roadCoordinates, sosCode]);

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
          />
        </View>

        {/* ======================================================== */}
        {/* B. TOP FLOATING NAVIGATION HUD (KHÔNG BỊ DYNAMIC ISLAND CHE) */}
        {/* ======================================================== */}
        <View style={[styles.grabTopNavContainer, { top: safeTop }]} pointerEvents="box-none">
          {/* Nút Đóng X bên trái */}
          <TouchableOpacity style={styles.grabCloseCircleBtn} onPress={onClose} activeOpacity={0.8}>
            <Feather name="x" size={20} color="#0F172A" />
          </TouchableOpacity>

          {/* Hộp chỉ dẫn điều hướng rẽ kiểu Grab (Nhấn mở Google Maps) */}
          <TouchableOpacity
            style={styles.grabManeuverCard}
            onPress={handleOpenGoogleMaps}
            activeOpacity={0.88}
          >
            <View style={styles.grabTurnIconBox}>
              <MaterialCommunityIcons
                name={missionState === 'ON_SCENE_RESCUING' ? 'target' : 'arrow-up-right'}
                size={22}
                color="#FFFFFF"
              />
            </View>
            <View style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.grabDistanceText}>{roadMetrics.distanceKm}</Text>
                <Text style={styles.grabDurationText}>• {roadMetrics.durationMin}</Text>
              </View>
              <Text style={styles.grabRoadText} numberOfLines={1}>
                Đến: {incidentAddress || 'Hiện trường cứu nạn'}
              </Text>
            </View>
            <View style={styles.grabMapsBadge}>
              <Feather name="navigation" size={13} color="#0284C7" />
              <Text style={styles.grabMapsBadgeText}>Chỉ đường</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ======================================================== */}
        {/* FLOATING MAP TOOLS (RIGHT EDGE)                          */}
        {/* ======================================================== */}
        <View style={[styles.mapFloatingTools, { top: safeTop + 65 }]}>
          <TouchableOpacity
            style={styles.mapToolBtn}
            onPress={() => {
              if (webViewRef.current) {
                webViewRef.current.postMessage(JSON.stringify({ type: 'RECENTER_TEAM' }));
              }
            }}
          >
            <Ionicons name="locate" size={20} color="#0284C7" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mapToolBtn}
            onPress={() => setMapLayer((prev) => (prev === 'streets' ? 'satellite' : 'streets'))}
          >
            <MaterialCommunityIcons name="layers" size={20} color="#0F172A" />
          </TouchableOpacity>
        </View>

        {/* ======================================================== */}
        {/* C. BOTTOM SHEET: GIAO DIỆN TÁC CHIẾN CHUẨN GRABDRIVER     */}
        {/* ======================================================== */}
        <View style={[styles.bottomDeckCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* Grab Sub-Header: Tiêu đề điểm đến & Thời gian tiếp cận */}
          <View style={styles.grabDeckSubHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View style={styles.grabOrderBadge}>
                <Text style={styles.grabOrderBadgeText}>1</Text>
              </View>
              <Text style={styles.grabOrderTitle}>Điểm cứu hộ • #{sosCode}</Text>
            </View>

            <View style={styles.grabEtaChip}>
              <Text style={styles.grabEtaChipText}>{roadMetrics.durationMin} ({roadMetrics.distanceKm})</Text>
            </View>
          </View>

          {/* Grab Citizen Info (Mục chính to, rõ ràng, không bị che/cắt chữ) */}
          <View style={styles.grabCitizenSection}>
            {/* Tên người dân - To, đậm, nổi bật */}
            <Text style={styles.grabCitizenName}>{citizenName}</Text>

            {/* Địa chỉ hiện trường - Hiển thị đầy đủ, không ẩn bớt, không cắt '...' */}
            <Text style={styles.grabAddressText}>{incidentAddress}</Text>

            {/* Số người & Đối tượng cần cứu / Thông tin cứu trợ */}
            {isReliefMission ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <MaterialCommunityIcons name="package-variant-closed" size={15} color="#059669" />
                <Text style={[styles.grabVictimMeta, { color: '#059669', fontWeight: '800', marginTop: 0 }]}>
                  Điểm tiếp nhận cứu trợ • Tiếp tế nhu yếu phẩm khẩn cấp
                </Text>
              </View>
            ) : (
              <Text style={styles.grabVictimMeta}>
                {victimHeadcount} người cần cứu • 1 người già, 1 trẻ nhỏ
              </Text>
            )}

            {/* Hộp ghi chú hiện trường (Note box xám giống hệt Grab) */}
            {rawDescription ? (
              <View style={styles.grabNoteBox}>
                <Text style={styles.grabNoteLabel}>
                  {isReliefMission ? 'Lệnh xuất cấp & Ghi chú điều phối:' : 'Ghi chú từ hiện trường:'}
                </Text>
                <Text style={styles.grabNoteText}>{rawDescription}</Text>
              </View>
            ) : null}

            {/* Hộp vật tư & hàng tiếp tế cấp theo xe */}
            {(() => {
              const missionSupplies =
                assignment?.supplies ||
                (assignment as any)?.reliefItems ||
                sos?.supplies ||
                (isReliefMission
                  ? []
                  : [
                      { name: 'Áo phao', quantity: Math.max(1, victimHeadcount), unit: 'Chiếc' },
                      { name: 'Túi y tế', quantity: 1, unit: 'Bộ' },
                      { name: 'Nước sạch', quantity: Math.ceil(Math.max(1, victimHeadcount) / 2), unit: 'Thùng' },
                    ]);

              if (!missionSupplies || missionSupplies.length === 0) return null;

              return (
                <View style={styles.grabSuppliesBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                    <MaterialCommunityIcons name="package-variant-closed" size={15} color="#166534" />
                    <Text style={styles.grabSuppliesLabel}>
                      {isReliefMission ? 'Danh mục vật tư xuất kho theo phiếu:' : 'Vật tư cấp theo xe:'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {missionSupplies.map((s: any, idx: number) => (
                      <View key={idx} style={styles.grabSupplyChip}>
                        <Text style={styles.grabSupplyChipText}>
                          {s.name} <Text style={{ fontWeight: '800', color: '#166534' }}>({s.quantity} {s.unit || 'món'})</Text>
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}
          </View>

          {/* Hàng 4 nút thao tác nhanh (Phong cách Grab: Chỉ đường Maps, Gọi điện, Báo sự cố, Trú ẩn) */}
          <View style={styles.grabActionRow}>
            {/* Nút 1: Chỉ đường Google Maps ngoài */}
            <TouchableOpacity
              style={styles.grabActionCol}
              onPress={handleOpenGoogleMaps}
              activeOpacity={0.8}
            >
              <View style={styles.grabActionIconWrap}>
                <Feather name="navigation" size={20} color="#0284C7" />
              </View>
              <Text style={styles.grabActionLabel}>Chỉ đường</Text>
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

            {/* Nút 3: Báo sự cố */}
            <TouchableOpacity
              style={styles.grabActionCol}
              onPress={() => setRejectModalVisible(true)}
              activeOpacity={0.8}
            >
              <View style={styles.grabActionIconWrap}>
                <Feather name="alert-triangle" size={20} color="#D97706" />
              </View>
              <Text style={styles.grabActionLabel}>Báo sự cố</Text>
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
                    style={[styles.grabBigGreenBtn, isReliefMission && { backgroundColor: '#059669' }]}
                    onPress={handleAcceptMission}
                    activeOpacity={0.88}
                  >
                    <Ionicons name="flash" size={20} color="#FFFFFF" />
                    <Text style={styles.grabBigBtnText}>
                      {isReliefMission ? '⚡ NHẬN LỆNH & XUẤT KHO TIẾP TẾ' : '⚡ NHẬN LỆNH & XUẤT KÍCH'}
                    </Text>
                  </TouchableOpacity>
                )}

                {missionState === 'EN_ROUTE' && (
                  <TouchableOpacity
                    style={[styles.grabBigGreenBtn, { backgroundColor: '#0066FF' }]}
                    onPress={handleArriveAtScene}
                    activeOpacity={0.88}
                  >
                    <Ionicons name="location-sharp" size={22} color="#FFFFFF" />
                    <Text style={styles.grabBigBtnText}>
                      {isReliefMission ? '📍 ĐÃ ĐẾN ĐIỂM GIAO CỨU TRỢ' : 'ĐÃ ĐẾN HIỆN TRƯỜNG (ARRIVED)'}
                    </Text>
                  </TouchableOpacity>
                )}

                {missionState === 'ON_SCENE_RESCUING' && (
                  <TouchableOpacity
                    style={[styles.grabBigGreenBtn, { backgroundColor: '#059669' }]}
                    onPress={handleOpenCompleteModal}
                    activeOpacity={0.88}
                  >
                    <Ionicons name="checkmark-done-circle" size={24} color="#FFFFFF" />
                    <Text style={styles.grabBigBtnText}>
                      {isReliefMission ? '✅ BÀN GIAO XONG & HOÀN TẤT' : 'HOÀN TẤT CỨU HỘ & BÁO CÁO'}
                    </Text>
                  </TouchableOpacity>
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

        {/* ======================================================== */}
        {/* MODAL: XÁC NHẬN ĐẾN HIỆN TRƯỜNG TÁC CHIẾN               */}
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
                <Text style={[styles.modalTitle, { fontSize: 18, textAlign: 'center', color: '#0F172A', marginLeft: 0 }]}>
                  {isReliefMission ? 'Xác nhận đến điểm giao cứu trợ' : 'Xác nhận đến hiện trường'}
                </Text>
                <Text style={[styles.modalDesc, { textAlign: 'center', marginTop: 6, marginBottom: 0, lineHeight: 20, color: '#475569', fontSize: 13.5 }]}>
                  {isReliefMission
                    ? 'Đội đã có mặt tại điểm tiếp nhận để tiến hành bàn giao nhu yếu phẩm cứu trợ?'
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
                  marginBottom: 18,
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

              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  style={[
                    styles.modalRejectConfirmBtn,
                    {
                      backgroundColor: isReliefMission ? '#059669' : '#2563EB',
                      height: 50,
                      borderRadius: 12,
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 8,
                      shadowColor: isReliefMission ? '#059669' : '#2563EB',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                      elevation: 4,
                    },
                  ]}
                  onPress={executeArriveAtScene}
                  disabled={actionLoading}
                >
                  <Ionicons name="checkmark-done" size={20} color="#FFFFFF" />
                  <Text style={[styles.modalRejectConfirmBtnText, { fontSize: 15, fontWeight: '800' }]}>
                    {isReliefMission ? 'Đã Đến Điểm Giao Hàng' : 'Đã Đến Hiện Trường'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalCancelBtn,
                    {
                      height: 46,
                      borderRadius: 12,
                      justifyContent: 'center',
                      backgroundColor: '#F1F5F9',
                      borderWidth: 0,
                    },
                  ]}
                  onPress={() => setArriveConfirmModalVisible(false)}
                >
                  <Text style={[styles.modalCancelBtnText, { color: '#64748B', fontWeight: '700', fontSize: 14 }]}>
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
                <Text style={[styles.modalTitle, { fontSize: 18, textAlign: 'center', color: '#1E293B', marginLeft: 0 }]}>
                  Đã Nhận Lệnh Xuất Kích! 🚀
                </Text>
                <Text style={[styles.modalDesc, { textAlign: 'center', marginTop: 8, lineHeight: 20, color: '#475569', fontSize: 13.5 }]}>
                  Lộ trình dẫn đường tự động đã được kích hoạt. Di chuyển an toàn đến hiện trường!
                </Text>

                <TouchableOpacity
                  style={[
                    styles.modalRejectConfirmBtn,
                    {
                      backgroundColor: '#2563EB',
                      width: '100%',
                      height: 50,
                      borderRadius: 12,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginTop: 16,
                      shadowColor: '#2563EB',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                      elevation: 4,
                    },
                  ]}
                  onPress={() => setLaunchSuccessModalVisible(false)}
                >
                  <Text style={[styles.modalRejectConfirmBtnText, { fontSize: 15, fontWeight: '800' }]}>
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
                <Text style={[styles.modalTitle, { fontSize: 18, textAlign: 'center', color: '#1E293B', marginLeft: 0 }]}>
                  Đã Báo Cáo Ban Chỉ Huy
                </Text>
                <Text style={[styles.modalDesc, { textAlign: 'center', marginTop: 8, lineHeight: 20, color: '#475569', fontSize: 13.5 }]}>
                  Lệnh điều động đã được trả về để trung tâm điều phối đội khác chi viện.
                </Text>

                <TouchableOpacity
                  style={[
                    styles.modalRejectConfirmBtn,
                    {
                      backgroundColor: '#DC2626',
                      width: '100%',
                      height: 50,
                      borderRadius: 12,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginTop: 16,
                    },
                  ]}
                  onPress={() => {
                    setRejectSuccessModalVisible(false);
                    onClose();
                  }}
                >
                  <Text style={[styles.modalRejectConfirmBtnText, { fontSize: 15, fontWeight: '800' }]}>
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
                <Text style={[styles.modalTitle, { fontSize: 18, textAlign: 'center', color: '#1E293B', marginLeft: 0 }]}>
                  {customNotice.title}
                </Text>
                <Text style={[styles.modalDesc, { textAlign: 'center', marginTop: 8, lineHeight: 20, color: '#475569', fontSize: 13.5 }]}>
                  {customNotice.message}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.modalRejectConfirmBtn,
                    {
                      backgroundColor:
                        customNotice.type === 'error'
                          ? '#DC2626'
                          : customNotice.type === 'warning'
                          ? '#D97706'
                          : '#2563EB',
                      width: '100%',
                      height: 50,
                      borderRadius: 12,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginTop: 16,
                    },
                  ]}
                  onPress={() => {
                    const action = customNotice.onAction;
                    setCustomNotice((prev) => ({ ...prev, visible: false }));
                    action?.();
                  }}
                >
                  <Text style={[styles.modalRejectConfirmBtnText, { fontSize: 15, fontWeight: '800' }]}>
                    {customNotice.actionText || 'Đã hiểu'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 1: BÁO CÁO SỰ CỐ / TỪ CHỐI NHẬN LỆNH              */}
        {/* ======================================================== */}
        <Modal visible={rejectModalVisible} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeaderRow}>
                <Ionicons name="warning-outline" size={22} color="#DC2626" />
                <Text style={styles.modalTitle}>Báo Cáo Không Thể Nhận Lệnh</Text>
                <TouchableOpacity onPress={() => setRejectModalVisible(false)}>
                  <Feather name="x" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalDesc}>
                Vui lòng chọn lý do nghiệp vụ chính xác để Ban Chỉ Huy PCTT điều chuyển ngay đội cứu trợ dự phòng:
              </Text>

              {[
                'Phương tiện gặp sự cố kỹ thuật đột xuất',
                'Tuyến đường thủy bị cô lập, dòng nước chảy xiết quá tải',
                'Vượt quá tải trọng / thiếu áo phao chuyên dụng',
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
        {/* MODAL 2: BÁO CÁO KẾT THÚC CỨU HỘ & CHỤP ẢNH HIỆN TRƯỜNG */}
        {/* ======================================================== */}
        <Modal visible={completionModalVisible} transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeaderRow}>
                <Ionicons name="checkmark-circle" size={24} color="#16A34A" />
                <Text style={styles.modalTitle}>
                  {isReliefMission ? 'Biên Bản Bàn Giao Hàng Cứu Trợ' : 'Báo Cáo Hoàn Tất Cứu Hộ'}
                </Text>
                <TouchableOpacity onPress={() => setCompletionModalVisible(false)}>
                  <Feather name="x" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalDesc}>
                {isReliefMission
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
                  <Text style={styles.statLabel}>Thời gian tiếp cận</Text>
                  <Text style={styles.statValue}>18 phút</Text>
                </View>
              </View>

              <Text style={styles.inputSectionLabel}>
                {isReliefMission
                  ? 'Biên bản tóm tắt bàn giao hàng cứu trợ:'
                  : 'Biên bản tóm tắt tình hình hiện trường:'}
              </Text>
              <TextInput
                style={[styles.modalTextInput, { height: 70 }]}
                value={fieldReportNotes}
                onChangeText={setFieldReportNotes}
                multiline
              />

              {/* Chụp ảnh nghiệm thu hiện trường / bàn giao hàng */}
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
                    <Text style={styles.takePhotoBtnText}>
                      {isReliefMission ? 'Chụp ảnh biên bản / bàn giao hàng' : 'Chụp ảnh xác nhận hiện trường'}
                    </Text>
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
                  <Text style={styles.modalRejectConfirmBtnText}>
                    {isReliefMission ? 'Xác Nhận Đã Bàn Giao' : 'Lưu & Hoàn Thành'}
                  </Text>
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
                <Text style={[styles.modalTitle, { fontSize: 19, textAlign: 'center', color: '#16A34A' }]}>
                  Hoàn Tất Cứu Hộ Xuất Sắc! 🎉
                </Text>
                <Text style={[styles.modalDesc, { textAlign: 'center', marginTop: 8, lineHeight: 20 }]}>
                  Toàn bộ {rescuedHeadcount} người dân đã được đưa về nơi an toàn. Trạng thái đội đã tự động chuyển về SẴN SÀNG tác chiến.
                </Text>

                <TouchableOpacity
                  style={[
                    styles.modalRejectConfirmBtn,
                    {
                      backgroundColor: '#16A34A',
                      width: '100%',
                      height: 48,
                      borderRadius: 10,
                      justifyContent: 'center',
                      marginTop: 16,
                    },
                  ]}
                  onPress={() => {
                    setMissionSuccessModalVisible(false);
                    onMissionCompleted?.({ rescuedCount: rescuedHeadcount });
                    onClose();
                  }}
                >
                  <Text style={[styles.modalRejectConfirmBtnText, { fontSize: 14 }]}>
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
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 10,
  },
  grabTurnIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabDistanceText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#38BDF8',
  },
  grabDurationText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#94A3B8',
  },
  grabRoadText: {
    fontSize: 12,
    color: '#E2E8F0',
    marginTop: 2,
  },
  grabMapsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  grabMapsBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284C7',
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
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 9,
    marginTop: 6,
  },
  grabSuppliesLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#166534',
  },
  grabSupplyChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  grabSupplyChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
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
});

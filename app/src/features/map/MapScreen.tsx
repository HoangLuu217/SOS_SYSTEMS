import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Modal,
  Image,
  Dimensions,
  Linking,
  TextInput,
  Alert,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { backendApi } from '@/api';
import { ContributeHazardModal } from '@/features/sos';
import { CitizenSosTrackingModal } from '@/features/profile/CitizenSosTrackingModal';
import { formatDateTime } from '@/utils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

import type { MapFilterType } from '@/types';
export type { MapFilterType };

export interface DanangAreaZone {
  id: string;
  name: string;
  shortName: string;
  lat: number;
  lng: number;
  zoom: number;
  keywords: string[];
}

export const DANANG_AREAS: DanangAreaZone[] = [
  {
    id: 'ALL',
    name: 'Toàn TP. Đà Nẵng',
    shortName: 'Toàn TP',
    lat: 16.0544,
    lng: 108.2022,
    zoom: 12,
    keywords: ['đà nẵng', 'da nang'],
  },
  {
    id: 'HAI_CHAU',
    name: 'Quận Hải Châu',
    shortName: 'Hải Châu',
    lat: 16.0471,
    lng: 108.2195,
    zoom: 14,
    keywords: ['hải châu', 'hai chau'],
  },
  {
    id: 'THANH_KHE',
    name: 'Quận Thanh Khê',
    shortName: 'Thanh Khê',
    lat: 16.0620,
    lng: 108.1880,
    zoom: 14,
    keywords: ['thanh khê', 'thanh khe'],
  },
  {
    id: 'SON_TRA',
    name: 'Quận Sơn Trà',
    shortName: 'Sơn Trà',
    lat: 16.0825,
    lng: 108.2435,
    zoom: 14,
    keywords: ['sơn trà', 'son tra'],
  },
  {
    id: 'NGU_HANH_SON',
    name: 'Quận Ngũ Hành Sơn',
    shortName: 'Ngũ Hành Sơn',
    lat: 16.0028,
    lng: 108.2514,
    zoom: 14,
    keywords: ['ngũ hành sơn', 'ngu hanh son'],
  },
  {
    id: 'CAM_LE',
    name: 'Quận Cẩm Lệ',
    shortName: 'Cẩm Lệ',
    lat: 15.9986,
    lng: 108.1963,
    zoom: 14,
    keywords: ['cẩm lệ', 'cam le'],
  },
  {
    id: 'LIEN_CHIEU',
    name: 'Quận Liên Chiểu',
    shortName: 'Liên Chiểu',
    lat: 16.0965,
    lng: 108.1408,
    zoom: 13,
    keywords: ['liên chiểu', 'lien chieu'],
  },
  {
    id: 'HOA_VANG',
    name: 'Huyện Hòa Vang',
    shortName: 'Hòa Vang',
    lat: 16.0125,
    lng: 108.1065,
    zoom: 12,
    keywords: ['hòa vang', 'hoa vang'],
  },
  {
    id: 'HOANG_SA',
    name: 'Huyện Hoàng Sa',
    shortName: 'Hoàng Sa',
    lat: 16.5367,
    lng: 111.6033,
    zoom: 10,
    keywords: ['hoàng sa', 'hoang sa'],
  },
];

export interface MapScreenProps {
  initialFilter?: MapFilterType;
  navigationKey?: number;
  onFilterChange?: (filter: MapFilterType) => void;
}

interface SelectedDetailItem {
  category: 'HAZARD' | 'SAFE' | 'RELIEF';
  data: any;
}

export const MapScreen: React.FC<MapScreenProps> = ({
  initialFilter = 'ALL',
  navigationKey = 0,
  onFilterChange,
}) => {
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loadingMsg, setLoadingMsg] = useState('Đang tìm vị trí của bạn...');
  const [showHazardModal, setShowHazardModal] = useState(false);
  const [hazards, setHazards] = useState<any[]>([]);
  const [safeLocations, setSafeLocations] = useState<any[]>([]);
  const [reliefLocations, setReliefLocations] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState<MapFilterType>(initialFilter);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [selectedArea, setSelectedArea] = useState<DanangAreaZone>(DANANG_AREAS[0]);
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [baseUrl, setBaseUrl] = useState<string>('');

  // Chế độ bản đồ hiện tại (Top dropdown)
  const [mapMode, setMapMode] = useState<'HAZARD' | 'SOS' | 'SAFE' | 'ALL'>(
    initialFilter === 'HAZARD' ? 'HAZARD' : initialFilter === 'RELIEF' ? 'SOS' : 'ALL'
  );
  const [showModeModal, setShowModeModal] = useState(false);

  // Bộ lọc chi tiết (Center floating card theo ảnh mẫu)
  const [showFilterCard, setShowFilterCard] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterState, setFilterState] = useState({
    all: true,
    unsupported: true,
    supported: false,
    safeShelter: true,
    hospital: true,
    supplies: true,
    medical: true,
    hazards: true,
  });

  // Modal Chi tiết điểm (Detail Bottom Sheet / Modal)
  const [selectedDetail, setSelectedDetail] = useState<SelectedDetailItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Danh sách ca SOS cứu nạn đang kích hoạt & Modal theo dõi hành trình
  const [activeSosList, setActiveSosList] = useState<any[]>([]);
  const [trackingSosId, setTrackingSosId] = useState<string | null>(null);
  const [showTrackingModal, setShowTrackingModal] = useState<boolean>(false);
  const [showSosListModal, setShowSosListModal] = useState<boolean>(false);

  const webViewRef = useRef<WebView>(null);
  const hazardsRef = useRef(hazards);
  hazardsRef.current = hazards;
  const initialCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  if (location && !initialCoordsRef.current) {
    initialCoordsRef.current = {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
    };
  }
  const lastSosSigRef = useRef<string>('');

  // Lấy Base URL để phục vụ SSE Stream và API
  useEffect(() => {
    backendApi.getBaseUrl().then((url) => {
      setBaseUrl(url);
    });
  }, []);

  // Lấy vị trí GPS của thiết bị
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoadingMsg('Chưa cấp quyền GPS');
        return;
      }
      try {
        const currentLoc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setLocation(currentLoc);
      } catch (err) {
        setLoadingMsg('Không thể lấy được GPS');
      }
    })();
  }, []);

  // Hàm tải dữ liệu bản đồ từ Server
  const fetchMapData = useCallback(() => {
    // 1. Lấy danh sách điểm nguy hiểm đã được duyệt (APPROVED)
    backendApi.get('/hazard-reports?status=APPROVED')
      .then((res) => {
        if (res.success && res.data?.reports) {
          setHazards(res.data.reports);
        } else if (res.success && Array.isArray(res.data)) {
          setHazards(res.data);
        }
      })
      .catch(() => { });

    // 2. Lấy danh sách điểm an toàn và điểm cứu trợ
    backendApi.get('/safe-locations')
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          const safe: any[] = [];
          const relief: any[] = [];
          res.data.forEach((item: any) => {
            if (['RESCUE_STATION', 'MEETING_POINT'].includes(item.type)) {
              relief.push(item);
            } else {
              safe.push(item);
            }
          });
          setSafeLocations(safe);
          setReliefLocations(relief);
        }
      })
      .catch(() => { });

    // 3. Lấy danh sách các ca SOS cứu nạn đang kích hoạt
    backendApi.get('/sos')
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          const active = res.data.filter(
            (item: any) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(item.status)
          );
          setActiveSosList(active);
        }
      })
      .catch(() => { });
  }, []);

  // Tải dữ liệu ban đầu & lắng nghe sự kiện cập nhật SOS realtime
  useEffect(() => {
    fetchMapData();

    const subSync = DeviceEventEmitter.addListener('sos:sync', fetchMapData);
    const subUpdated = DeviceEventEmitter.addListener('sos:updated', fetchMapData);
    const subCreated = DeviceEventEmitter.addListener('sos:created', fetchMapData);

    return () => {
      subSync.remove();
      subUpdated.remove();
      subCreated.remove();
    };
  }, [fetchMapData]);

  // Xử lý sự kiện Realtime cập nhật duyệt / tạo / xóa điểm nguy hiểm
  const handleRealtimeHazardEvent = useCallback((payload: any) => {
    if (!payload || !payload.action) return;
    const { action, data } = payload;

    if (action === 'REVIEWED') {
      if (data?.status === 'APPROVED') {
        setHazards((prev) => {
          const exists = prev.some((h) => h._id === data._id);
          if (exists) {
            return prev.map((h) => (h._id === data._id ? data : h));
          }
          return [data, ...prev];
        });
      } else {
        // Điểm bị từ chối hoặc đã giải quyết -> gỡ khỏi bản đồ
        setHazards((prev) => prev.filter((h) => h._id !== data?._id));
      }
      // Đồng bộ toàn diện lại danh sách
      fetchMapData();
    } else if (action === 'DELETED') {
      setHazards((prev) => prev.filter((h) => h._id !== data?._id));
      fetchMapData();
    } else if (action === 'CREATED') {
      if (data?.status === 'APPROVED') {
        setHazards((prev) => [data, ...prev]);
      }
      fetchMapData();
    }
  }, [fetchMapData]);

  // Kết nối SSE Realtime Stream và Polling dự phòng 4 giây
  useEffect(() => {
    let isMounted = true;
    let xhr: XMLHttpRequest | null = null;
    let pollInterval: any = null;

    const connectSSE = async () => {
      try {
        const url = await backendApi.getBaseUrl();
        if (!isMounted) return;

        const streamUrl = `${url}/hazard-reports/stream`;
        xhr = new XMLHttpRequest();
        xhr.open('GET', streamUrl, true);
        xhr.setRequestHeader('Accept', 'text/event-stream');
        xhr.setRequestHeader('Cache-Control', 'no-cache');

        let lastIndex = 0;
        xhr.onprogress = () => {
          if (!isMounted) return;
          const text = xhr?.responseText || '';
          const newChunk = text.slice(lastIndex);
          lastIndex = text.length;

          const lines = newChunk.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) {
              try {
                const jsonStr = trimmed.replace(/^data:\s*/, '');
                const payload = JSON.parse(jsonStr);
                if (payload && payload.action) {
                  handleRealtimeHazardEvent(payload);
                }
              } catch {
                // Heartbeat hoặc gói không parse được
              }
            }
          }
        };

        xhr.onerror = () => {
          setTimeout(() => {
            if (isMounted) connectSSE();
          }, 4000);
        };

        xhr.onloadend = () => {
          setTimeout(() => {
            if (isMounted) connectSSE();
          }, 3000);
        };

        xhr.send();
      } catch {
        setTimeout(() => {
          if (isMounted) connectSSE();
        }, 4000);
      }
    };

    connectSSE();

    // Polling dự phòng mỗi 4 giây để đảm bảo 100% không bao giờ trễ khi duyệt
    pollInterval = setInterval(() => {
      if (isMounted) {
        fetchMapData();
      }
    }, 4000);

    return () => {
      isMounted = false;
      if (xhr) {
        try {
          xhr.abort();
        } catch { }
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [fetchMapData, handleRealtimeHazardEvent]);

  // Helper escape JSON an toàn khi inject vào WebView
  const safeJsonForWebView = (data: any) =>
    JSON.stringify(data)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '');

  // Bắn dữ liệu mới vào Leaflet ngay lập tức mà KHÔNG cần reload lại map
  useEffect(() => {
    if (webViewRef.current && hazards) {
      try {
        const jsonStr = safeJsonForWebView(hazards);
        webViewRef.current.injectJavaScript(`
          if (window.updateHazardsData) {
            window.updateHazardsData(JSON.parse('${jsonStr}'));
          }
          true;
        `);
      } catch { }
    }
  }, [hazards]);

  useEffect(() => {
    if (webViewRef.current && safeLocations) {
      try {
        const jsonStr = safeJsonForWebView(safeLocations);
        webViewRef.current.injectJavaScript(`
          if (window.updateSafeData) {
            window.updateSafeData(JSON.parse('${jsonStr}'));
          }
          true;
        `);
      } catch { }
    }
  }, [safeLocations]);

  useEffect(() => {
    if (webViewRef.current && reliefLocations) {
      try {
        const jsonStr = safeJsonForWebView(reliefLocations);
        webViewRef.current.injectJavaScript(`
          if (window.updateReliefData) {
            window.updateReliefData(JSON.parse('${jsonStr}'));
          }
          true;
        `);
      } catch { }
    }
  }, [reliefLocations]);

  // Đồng bộ danh sách tín hiệu SOS vào Leaflet (chỉ cập nhật khi có thay đổi thực sự để tránh giật)
  useEffect(() => {
    if (webViewRef.current && activeSosList) {
      const sig = activeSosList
        .map((s) => `${s._id}:${s.status}:${s.location?.coordinates?.join(',') || ''}`)
        .join('|');
      if (sig === lastSosSigRef.current) return;
      lastSosSigRef.current = sig;

      try {
        const jsonStr = safeJsonForWebView(activeSosList);
        webViewRef.current.injectJavaScript(`
          if (window.updateSosData) {
            window.updateSosData(JSON.parse('${jsonStr}'));
          }
          true;
        `);
      } catch { }
    }
  }, [activeSosList]);

  // Bơm toàn bộ dữ liệu ngay khi WebView load xong
  const injectAllMapData = useCallback(() => {
    if (!webViewRef.current) return;
    try {
      const hStr = safeJsonForWebView(hazards);
      const sStr = safeJsonForWebView(safeLocations);
      const rStr = safeJsonForWebView(reliefLocations);
      const sosStr = safeJsonForWebView(activeSosList);
      webViewRef.current.injectJavaScript(`
        if (window.updateHazardsData) window.updateHazardsData(JSON.parse('${hStr}'));
        if (window.updateSafeData) window.updateSafeData(JSON.parse('${sStr}'));
        if (window.updateReliefData) window.updateReliefData(JSON.parse('${rStr}'));
        if (window.updateSosData) window.updateSosData(JSON.parse('${sosStr}'));
        true;
      `);
    } catch { }
  }, [hazards, safeLocations, reliefLocations, activeSosList]);

  // Lắng nghe thay đổi bộ lọc từ bên ngoài (ví dụ bấm nút tiện ích từ HomeScreen)
  useEffect(() => {
    if (initialFilter) {
      setActiveFilter(initialFilter);
      if (initialFilter === 'HAZARD') {
        setMapMode('HAZARD');
        setFilterState({
          all: false,
          unsupported: true,
          supported: false,
          safeShelter: false,
          hospital: false,
          supplies: false,
          medical: false,
          hazards: true,
        });
      } else if (initialFilter === 'RELIEF') {
        setMapMode('SOS');
        setFilterState({
          all: false,
          unsupported: true,
          supported: true,
          safeShelter: false,
          hospital: true,
          supplies: true,
          medical: true,
          hazards: false,
        });
      } else if (initialFilter === 'SAFE') {
        setMapMode('SAFE');
        setFilterState({
          all: false,
          unsupported: false,
          supported: true,
          safeShelter: true,
          hospital: true,
          supplies: false,
          medical: false,
          hazards: false,
        });
      } else {
        setMapMode('ALL');
        setFilterState({
          all: true,
          unsupported: true,
          supported: true,
          safeShelter: true,
          hospital: true,
          supplies: true,
          medical: true,
          hazards: true,
        });
      }
      webViewRef.current?.injectJavaScript(`
        if (window.setMapFilter) {
          window.setMapFilter('${initialFilter}');
        }
        true;
      `);
    }
  }, [initialFilter, navigationKey]);

  // Xử lý chuyển đổi chế độ bản đồ (Top dropdown)
  const handleSelectMapMode = (mode: 'HAZARD' | 'SOS' | 'SAFE' | 'ALL') => {
    setMapMode(mode);
    setShowModeModal(false);
    const filterKey = mode === 'HAZARD' ? 'HAZARD' : mode === 'SOS' ? 'RELIEF' : mode === 'SAFE' ? 'SAFE' : 'ALL';
    setActiveFilter(filterKey);
    onFilterChange?.(filterKey);
    if (mode === 'HAZARD') {
      const st = {
        all: false,
        unsupported: true,
        supported: false,
        safeShelter: false,
        hospital: false,
        supplies: false,
        medical: false,
        hazards: true,
      };
      setFilterState(st);
      applyFilterToMap(st);
    } else if (mode === 'SOS') {
      const st = {
        all: false,
        unsupported: true,
        supported: true,
        safeShelter: false,
        hospital: true,
        supplies: true,
        medical: true,
        hazards: false,
      };
      setFilterState(st);
      applyFilterToMap(st);
    } else if (mode === 'SAFE') {
      const st = {
        all: false,
        unsupported: false,
        supported: true,
        safeShelter: true,
        hospital: true,
        supplies: false,
        medical: false,
        hazards: false,
      };
      setFilterState(st);
      applyFilterToMap(st);
    } else {
      const st = {
        all: true,
        unsupported: true,
        supported: true,
        safeShelter: true,
        hospital: true,
        supplies: true,
        medical: true,
        hazards: true,
      };
      setFilterState(st);
      applyFilterToMap(st);
    }
    webViewRef.current?.injectJavaScript(`window.setMapFilter && window.setMapFilter('${filterKey}'); true;`);
  };

  // Áp dụng bộ lọc chi tiết vào WebView
  const applyFilterToMap = (st: typeof filterState) => {
    webViewRef.current?.injectJavaScript(`
      if (window.applyDetailedFilter) {
        window.applyDetailedFilter(${JSON.stringify(st)});
      }
      true;
    `);
  };

  // Toggle "Tất cả"
  const handleToggleSelectAll = () => {
    const nextVal = !filterState.all;
    const nextState = {
      all: nextVal,
      unsupported: nextVal,
      supported: nextVal,
      safeShelter: nextVal,
      hospital: nextVal,
      supplies: nextVal,
      medical: nextVal,
      hazards: nextVal,
    };
    setFilterState(nextState);
    applyFilterToMap(nextState);
  };

  // Toggle từng mục bộ lọc
  const handleToggleFilterKey = (key: keyof typeof filterState) => {
    const nextState = {
      ...filterState,
      [key]: !filterState[key],
      all: false,
    };
    setFilterState(nextState);
    applyFilterToMap(nextState);
  };

  // Tìm kiếm theo số điện thoại / từ khóa
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    const safeQ = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    webViewRef.current?.injectJavaScript(`
      if (window.searchPins) {
        window.searchPins('${safeQ}');
      }
      true;
    `);
  };

  // Xử lý bộ lọc
  const handleFilterSelect = (filterKey: MapFilterType) => {
    setActiveFilter(filterKey);
    onFilterChange?.(filterKey);
    webViewRef.current?.injectJavaScript(`window.setMapFilter && window.setMapFilter('${filterKey}'); true;`);
  };

  // Chuyển đổi bản đồ Vệ tinh / Chuẩn
  const toggleMapType = () => {
    const nextType = mapType === 'standard' ? 'satellite' : 'standard';
    setMapType(nextType);
    webViewRef.current?.injectJavaScript(`window.setMapType && window.setMapType('${nextType}'); true;`);
  };

  // Chọn vùng / quận huyện
  const handleSelectArea = (zone: DanangAreaZone) => {
    setSelectedArea(zone);
    setShowAreaModal(false);
    webViewRef.current?.injectJavaScript(`
      if (window.flyToZone) {
        window.flyToZone(${zone.lat}, ${zone.lng}, ${zone.zoom});
      }
      true;
    `);
  };

  // Bay về vị trí GPS hiện tại
  const handleFlyToMyLocation = () => {
    if (location) {
      webViewRef.current?.injectJavaScript(`
        if (window.flyToMyLocation) {
          window.flyToMyLocation();
        }
        true;
      `);
    }
  };

  // Bay về vị trí tín hiệu SOS cứu nạn đang kích hoạt
  const handleFlyToActiveSos = () => {
    if (activeSosList.length === 0) {
      Alert.alert(
        'Tín hiệu cứu nạn SOS',
        'Hiện không có yêu cầu SOS nào đang kích hoạt quanh bạn. Nếu gặp tình huống khẩn cấp, vui lòng nhấn nút SOS màu đỏ ở giữa thanh điều hướng để phát tín hiệu ứng cứu ngay!'
      );
      return;
    }

    if (activeSosList.length === 1) {
      const targetSos = activeSosList[0];
      const coords = targetSos.location?.coordinates;
      if (coords && coords.length === 2) {
        const [lng, lat] = coords;
        webViewRef.current?.injectJavaScript(`
          if (window.flyToSosSignal) {
            window.flyToSosSignal(${lat}, ${lng});
          }
          true;
        `);
      }
      return;
    }

    // Nếu có nhiều tín hiệu SOS, mở danh sách để chọn đúng ca cần xem
    setShowSosListModal(true);
  };

  const handleSelectSosFromList = (sosItem: any) => {
    setShowSosListModal(false);
    const coords = sosItem?.location?.coordinates;
    if (coords && coords.length === 2) {
      const [lng, lat] = coords;
      webViewRef.current?.injectJavaScript(`
        if (window.flyToSosSignal) {
          window.flyToSosSignal(${lat}, ${lng});
        }
        true;
      `);
    }
  };

  const handleFitAllSosSignals = () => {
    setShowSosListModal(false);
    webViewRef.current?.injectJavaScript(`
      if (window.fitAllSosSignals) {
        window.fitAllSosSignals();
      }
      true;
    `);
  };

  // Đếm số điểm nguy hiểm trong từng khu vực quận / huyện
  const getAreaHazardCount = (zone: DanangAreaZone) => {
    if (zone.id === 'ALL') return hazards.length;
    return hazards.filter((h) => {
      const text = `${h.address || ''} ${h.title || ''} ${h.description || ''}`.toLowerCase();
      return zone.keywords.some((kw) => text.includes(kw));
    }).length;
  };

  // Nhận thông điệp từ Leaflet WebView
  const handleWebViewMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'SELECT_PIN') {
        if (msg.category === 'SOS' && msg.data?._id) {
          setTrackingSosId(msg.data._id);
          setShowTrackingModal(true);
          return;
        }
        setSelectedDetail({
          category: msg.category,
          data: msg.data,
        });
        setShowDetailModal(true);
      } else if (msg.type === 'HAZARD_EVENT') {
        handleRealtimeHazardEvent(msg.payload);
      }
    } catch (err) {
      console.warn('[WebView] Parse message error:', err);
    }
  };

  // Mở ứng dụng Bản đồ chỉ đường
  const handleOpenDirections = () => {
    if (!selectedDetail?.data?.location?.coordinates) return;
    const [lng, lat] = selectedDetail.data.location.coordinates;
    const url = Platform.select({
      ios: `maps:0,0?q=${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    });
    Linking.openURL(url || `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
    });
  };


  // Helper thông tin loại nguy hiểm
  const getHazardTypeMeta = (type: string) => {
    switch (type) {
      case 'FLOOD':
        return { label: 'Ngập lụt', icon: 'water-alert' as const, color: '#0284C7', bg: '#E0F2FE' };
      case 'LANDSLIDE':
        return { label: 'Sạt lở đất', icon: 'image-filter-hdr' as const, color: '#B45309', bg: '#FEF3C7' };
      case 'FALLEN_TREE':
        return { label: 'Cây đổ / Cản trở', icon: 'tree' as const, color: '#16A34A', bg: '#DCFCE7' };
      case 'ELECTRICAL':
        return { label: 'Sự cố điện', icon: 'flash-alert' as const, color: '#CA8A04', bg: '#FEF9C3' };
      case 'ROAD_DAMAGE':
        return { label: 'Hư hỏng đường', icon: 'road-variant' as const, color: '#EA580C', bg: '#FFEDD5' };
      case 'OTHER':
      default:
        return { label: 'Nguy hiểm khác', icon: 'alert-circle' as const, color: '#DC2626', bg: '#FEE2E2' };
    }
  };

  // Helper thông tin mức độ nguy cấp
  const getSeverityMeta = (severity: string) => {
    switch (severity) {
      case 'LOW':
        return { label: 'Thấp', color: '#10B981', bg: '#ECFDF5' };
      case 'MEDIUM':
        return { label: 'Trung bình', color: '#F59E0B', bg: '#FEF3C7' };
      case 'HIGH':
        return { label: 'Cao', color: '#F97316', bg: '#FFEDD5' };
      case 'CRITICAL':
        return { label: 'Nguy hiểm', color: '#EF4444', bg: '#FEF2F2' };
      default:
        return { label: 'Cảnh báo', color: '#64748B', bg: '#F1F5F9' };
    }
  };

  const streamUrl = baseUrl ? `${baseUrl}/hazard-reports/stream` : '';
  const hasLocation = Boolean(location);

  const mapHtml = useMemo(() => {
    if (!hasLocation || !initialCoordsRef.current) return '';
    const initLat = initialCoordsRef.current.lat;
    const initLng = initialCoordsRef.current.lng;

    return `
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
        @keyframes userLocationPulse {
          0% { transform: scale(0.9); opacity: 0.75; }
          70% { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        .user-location-container {
          position: relative;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .user-location-pulse {
          position: absolute;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background-color: rgba(0, 102, 255, 0.35);
          animation: userLocationPulse 2s ease-out infinite;
        }
        .user-location-dot {
          position: relative;
          width: 16px;
          height: 16px;
          background-color: #0066FF;
          border-radius: 50%;
          border: 3px solid #FFFFFF;
          box-shadow: 0 2px 6px rgba(0, 102, 255, 0.45), 0 1px 3px rgba(0, 0, 0, 0.25);
          z-index: 2;
        }

        /* Tín hiệu Radar SOS phát sóng cứu hộ */
        @keyframes sosPulseWave {
          0% { transform: scale(0.6); opacity: 0.95; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .sos-marker-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
        }
        .sos-radar-container {
          position: relative;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .sos-radar-wave {
          position: absolute;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background-color: rgba(220, 38, 38, 0.45);
          border: 2px solid #DC2626;
          animation: sosPulseWave 1.6s ease-out infinite;
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
        .sos-label-pill {
          margin-top: 2px;
          background: rgba(15, 23, 42, 0.9);
          color: #FFFFFF;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 7px;
          border-radius: 10px;
          white-space: nowrap;
          border: 1px solid rgba(255,255,255,0.85);
          box-shadow: 0 2px 5px rgba(0,0,0,0.35);
          letter-spacing: 0.2px;
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
        }).setView([${initLat}, ${initLng}], 15);

        L.control.zoom({ position: 'bottomleft' }).addTo(map);

        var currentMapType = 'standard';
        var userCoords = { lat: ${initLat}, lng: ${initLng} };

        // 1. Chế độ thu nhỏ / Tổng quan (Zoom <= 15):
        // Ẩn toàn bộ quán cà phê / cửa hàng (s.t:33|p.v:off)
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
        });

        // 2. Chế độ phóng to gần (Zoom >= 16):
        // Hiển thị tên các tuyến đường phố nội đô, ngõ hẻm; ẩn quán cà phê (s.t:33|p.v:off) và ẩn biển quốc lộ (s.t:22|s.e:l|p.v:off)
        var detailLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&apistyle=s.t:33|p.v:off%2Cs.t:22|s.e:l|p.v:off&x={x}&y={y}&z={z}', {
          subdomains: ['0', '1', '2', '3'],
          attribution: '© Google Maps',
          minZoom: 16,
          maxZoom: 20,
          keepBuffer: 6,
          tileSize: 256,
          updateWhenIdle: false,
          updateWhenZooming: false
        });

        // 3. Chế độ bản đồ Vệ tinh Hybrid (Ảnh vệ tinh sắc nét + Tên đường xá & địa danh):
        var satelliteLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          subdomains: ['0', '1', '2', '3'],
          attribution: '© Google Maps Satellite',
          minZoom: 1,
          maxZoom: 20,
          keepBuffer: 6,
          tileSize: 256,
          updateWhenIdle: false,
          updateWhenZooming: false
        });

        if (currentMapType === 'satellite') {
          satelliteLayer.addTo(map);
        } else {
          overviewLayer.addTo(map);
          detailLayer.addTo(map);
        }

        // Chuyển đổi qua lại giữa bản đồ chuẩn và vệ tinh
        window.setMapType = function(type) {
          currentMapType = type;
          if (type === 'satellite') {
            if (map.hasLayer(overviewLayer)) map.removeLayer(overviewLayer);
            if (map.hasLayer(detailLayer)) map.removeLayer(detailLayer);
            if (!map.hasLayer(satelliteLayer)) satelliteLayer.addTo(map);
          } else {
            if (map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
            if (!map.hasLayer(overviewLayer)) overviewLayer.addTo(map);
            if (!map.hasLayer(detailLayer)) detailLayer.addTo(map);
          }
        };

        // Bay tới vị trí một quận / huyện bất kỳ
        window.flyToZone = function(lat, lng, zoom) {
          if (map) {
            map.flyTo([lat, lng], zoom, {
              animate: true,
              duration: 1.2
            });
          }
        };

        // Bay về vị trí GPS hiện tại của người dùng
        window.flyToMyLocation = function() {
          if (map && userCoords) {
            map.flyTo([userCoords.lat, userCoords.lng], 16, {
              animate: true,
              duration: 1.0
            });
          }
        };

        // Ghim vị trí hiện tại của tôi (Dấu chấm tròn xanh nước biển GPS)
        var myIcon = L.divIcon({
          html: '<div class="user-location-container"><div class="user-location-pulse"></div><div class="user-location-dot"></div></div>',
          className: '',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        L.marker([${initLat}, ${initLng}], { icon: myIcon }).addTo(map);

        // Cấu hình Icon ghim nhỏ gọn (Compact 26px x 30px) chuẩn theo đúng 6 icon trong tab loại nguy hiểm
        function getHazardMarkerHtml(type) {
          var config = {
            FLOOD: {
              bg: '#0284c7',
              label: 'Ngập lụt',
              // Giọt nước có dấu chấm than bên trong
              svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2.5C12 2.5 6 9.5 6 14.5a6 6 0 0 0 12 0c0-5-6-12-6-12z" fill="#ffffff"/><path d="M12 8.5v4" stroke="#0284c7" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="15.5" r="1.1" fill="#0284c7"/></svg>'
            },
            LANDSLIDE: {
              bg: '#b45309',
              label: 'Sạt lở đất',
              // Hai ngọn núi
              svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff"><path d="M14 6l-3.75 5-2.25-3L3 18h18l-7-12z"/></svg>'
            },
            FALLEN_TREE: {
              bg: '#16a34a',
              label: 'Cây đổ / Cản trở',
              // Cây thân đứng tán lá tròn
              svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff"><path d="M13 19h3.5a4.5 4.5 0 0 0 0-9 5.5 5.5 0 0 0-10.5 1.5A4.5 4.5 0 0 0 7.5 19H11v3h2v-3z"/></svg>'
            },
            ELECTRICAL: {
              bg: '#ca8a04',
              label: 'Sự cố điện',
              // Tia sét bên trái + Dấu chấm than bên phải
              svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polygon points="5 2 5 13 8 13 7 22 14 11 10 11 12 2" fill="#ffffff"/><line x1="18.5" y1="7" x2="18.5" y2="13" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/><circle cx="18.5" cy="17" r="1.2" fill="#ffffff"/></svg>'
            },
            ROAD_DAMAGE: {
              bg: '#ea580c',
              label: 'Hư hỏng đường',
              // Hình con đường phối cảnh có vạch kẻ đứt đoạn ở giữa
              svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff"><path d="M18.11 2H5.89l-2.78 20h17.78L18.11 2zM11 4h2v3h-2V4zm0 6h2v3h-2v-3zm0 6h2v3h-2v-3z"/></svg>'
            },
            OTHER: {
              bg: '#dc2626',
              label: 'Nguy hiểm khác',
              // Hình tròn có dấu chấm than ở giữa
              svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" fill="#ffffff"/><path d="M12 7v6" stroke="#dc2626" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1.2" fill="#dc2626"/></svg>'
            }
          };

          var c = config[type] || config.OTHER;
          return '<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">' +
            '<div style="background:' + c.bg + ';width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.32);">' +
              c.svg +
            '</div>' +
            '<div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ' + c.bg + ';margin-top:-1px;"></div>' +
          '</div>';
        }

        // Cấu hình Icon ghim điểm an toàn (Compact 26px x 30px)
        function getSafeMarkerHtml(type) {
          var isHospital = type === 'HOSPITAL';
          var svg = isHospital
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
          var bg = isHospital ? '#059669' : '#10b981';

          return '<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">' +
            '<div style="background:' + bg + ';width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">' +
              svg +
            '</div>' +
            '<div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ' + bg + ';margin-top:-1px;"></div>' +
          '</div>';
        }

        // Cấu hình Icon ghim điểm cứu trợ (Compact 26px x 30px)
        function getReliefMarkerHtml(type) {
          var isRescue = type === 'RESCUE_STATION';
          var svg = isRescue
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/><line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg>';
          var bg = isRescue ? '#2563eb' : '#ea580c';

          return '<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">' +
            '<div style="background:' + bg + ';width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">' +
              svg +
            '</div>' +
            '<div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ' + bg + ';margin-top:-1px;"></div>' +
          '</div>';
        }

        // Tạo 3 nhóm layer độc lập phục vụ bộ lọc
        var hazardLayer = L.layerGroup();
        var safeLayer = L.layerGroup();
        var reliefLayer = L.layerGroup();
        var sosLayer = L.layerGroup().addTo(map);

        var allSosPoints = [];

        // Hàm render tín hiệu Radar SOS cứu nạn (hỗ trợ tách vị trí nếu trùng tọa độ + gắn nhãn mã SOS)
        function renderSosMarkers(sosList) {
          sosLayer.clearLayers();
          allSosPoints = [];
          if (!Array.isArray(sosList)) return;

          var coordCountMap = {};
          sosList.forEach(function(s) {
            if (s.location && s.location.coordinates && s.location.coordinates.length === 2) {
              var key = s.location.coordinates[1].toFixed(5) + ',' + s.location.coordinates[0].toFixed(5);
              coordCountMap[key] = (coordCountMap[key] || 0) + 1;
            }
          });

          var coordIdxMap = {};
          sosList.forEach(function(s) {
            if (s.location && s.location.coordinates && s.location.coordinates.length === 2) {
              var baseLng = s.location.coordinates[0];
              var baseLat = s.location.coordinates[1];
              var key = baseLat.toFixed(5) + ',' + baseLng.toFixed(5);
              var totalAtSpot = coordCountMap[key] || 1;
              var idxAtSpot = coordIdxMap[key] || 0;
              coordIdxMap[key] = idxAtSpot + 1;

              var lat = baseLat;
              var lng = baseLng;
              if (totalAtSpot > 1) {
                var angle = (2 * Math.PI * idxAtSpot) / totalAtSpot;
                var offsetDeg = 0.00028;
                lat = baseLat + Math.sin(angle) * offsetDeg;
                lng = baseLng + Math.cos(angle) * offsetDeg;
              }

              allSosPoints.push([lat, lng]);

              var codeLabel = s.code
                ? ('#' + s.code)
                : ('#SOS-' + String(s._id || '').slice(-4).toUpperCase());
              if (s.isProxyReport) {
                codeLabel += ' · Hộ';
              }

              var radarIcon = L.divIcon({
                html: '<div class="sos-marker-wrap">' +
                  '<div class="sos-radar-container"><div class="sos-radar-wave"></div><div class="sos-radar-core"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12a5 5 0 0 1 5-5v0a5 5 0 0 1 5 5v6H7v-6Z"/><path d="M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2H5v-2Z"/><path d="M21 12h1"/><path d="M18.5 4.5 19 4"/><path d="M2 12h1"/><path d="M12 2v1"/><path d="M4.5 4.5 5 4"/><path d="M12 11v3"/></svg></div></div>' +
                  '<div class="sos-label-pill">' + codeLabel + '</div>' +
                '</div>',
                className: '',
                iconSize: [110, 66],
                iconAnchor: [55, 22]
              });

              var circle = L.circle([lat, lng], {
                color: '#DC2626',
                fillColor: '#EF4444',
                fillOpacity: 0.12,
                radius: 200,
                weight: 1.5
              });
              sosLayer.addLayer(circle);

              var marker = L.marker([lat, lng], { icon: radarIcon, zIndexOffset: 1000 });
              marker.on('click', function() {
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'SELECT_PIN',
                    category: 'SOS',
                    data: s
                  }));
                }
              });
              sosLayer.addLayer(marker);
            }
          });
        }

        // Hàm render ghim điểm nguy hiểm
        function renderHazardMarkers(hazardList) {
          hazardLayer.clearLayers();
          if (!Array.isArray(hazardList)) return;

          hazardList.forEach(function(h) {
            if (h.location && h.location.coordinates && h.location.coordinates.length === 2) {
              var lng = h.location.coordinates[0];
              var lat = h.location.coordinates[1];
              var hType = h.hazardType || 'OTHER';
              var dangerPin = L.divIcon({
                html: getHazardMarkerHtml(hType),
                className: '',
                iconSize: [26, 30],
                iconAnchor: [13, 30],
                popupAnchor: [0, -30]
              });
              var marker = L.marker([lat, lng], { icon: dangerPin });
              marker.on('click', function() {
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'SELECT_PIN',
                    category: 'HAZARD',
                    data: h
                  }));
                }
              });
              hazardLayer.addLayer(marker);
            }
          });
        }

        // Hàm render ghim điểm an toàn
        function renderSafeMarkers(safeList) {
          safeLayer.clearLayers();
          if (!Array.isArray(safeList)) return;

          safeList.forEach(function(s) {
            if (s.location && s.location.coordinates && s.location.coordinates.length === 2) {
              var lng = s.location.coordinates[0];
              var lat = s.location.coordinates[1];
              var safePin = L.divIcon({
                html: getSafeMarkerHtml(s.type),
                className: '',
                iconSize: [26, 30],
                iconAnchor: [13, 30],
                popupAnchor: [0, -30]
              });
              var marker = L.marker([lat, lng], { icon: safePin });
              marker.on('click', function() {
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'SELECT_PIN',
                    category: 'SAFE',
                    data: s
                  }));
                }
              });
              safeLayer.addLayer(marker);
            }
          });
        }

        // Hàm render ghim điểm cứu trợ
        function renderReliefMarkers(reliefList) {
          reliefLayer.clearLayers();
          if (!Array.isArray(reliefList)) return;

          reliefList.forEach(function(r) {
            if (r.location && r.location.coordinates && r.location.coordinates.length === 2) {
              var lng = r.location.coordinates[0];
              var lat = r.location.coordinates[1];
              var reliefPin = L.divIcon({
                html: getReliefMarkerHtml(r.type),
                className: '',
                iconSize: [26, 30],
                iconAnchor: [13, 30],
                popupAnchor: [0, -30]
              });
              var marker = L.marker([lat, lng], { icon: reliefPin });
              marker.on('click', function() {
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'SELECT_PIN',
                    category: 'RELIEF',
                    data: r
                  }));
                }
              });
              reliefLayer.addLayer(marker);
            }
          });
        }

        // Khởi tạo mảng dữ liệu rỗng, sẽ được inject từ React Native ngay khi load xong
        var allHazards = [];
        var allSafe = [];
        var allRelief = [];

        // Đưa các layer vào bản đồ
        hazardLayer.addTo(map);
        safeLayer.addTo(map);
        reliefLayer.addTo(map);

        // Hàm điều khiển lọc tầng dữ liệu cực nhanh không cần reload trang
        window.setMapFilter = function(filter) {
          if (filter === 'ALL') {
            if (!map.hasLayer(hazardLayer)) map.addLayer(hazardLayer);
            if (!map.hasLayer(safeLayer)) map.addLayer(safeLayer);
            if (!map.hasLayer(reliefLayer)) map.addLayer(reliefLayer);
          } else if (filter === 'HAZARD') {
            if (!map.hasLayer(hazardLayer)) map.addLayer(hazardLayer);
            if (map.hasLayer(safeLayer)) map.removeLayer(safeLayer);
            if (map.hasLayer(reliefLayer)) map.removeLayer(reliefLayer);
          } else if (filter === 'SAFE') {
            if (map.hasLayer(hazardLayer)) map.removeLayer(hazardLayer);
            if (!map.hasLayer(safeLayer)) map.addLayer(safeLayer);
            if (map.hasLayer(reliefLayer)) map.removeLayer(reliefLayer);
          } else if (filter === 'RELIEF') {
            if (map.hasLayer(hazardLayer)) map.removeLayer(hazardLayer);
            if (map.hasLayer(safeLayer)) map.removeLayer(safeLayer);
            if (!map.hasLayer(reliefLayer)) map.addLayer(reliefLayer);
          }
        };

        // Dữ liệu được đồng bộ động qua updateHazardsData / updateSafeData / updateReliefData

        // Hàm lọc chi tiết từng danh mục theo Popup Card
        window.applyDetailedFilter = function(st) {
          if (!st) return;
          if (st.all) {
            if (!map.hasLayer(hazardLayer)) map.addLayer(hazardLayer);
            if (!map.hasLayer(safeLayer)) map.addLayer(safeLayer);
            if (!map.hasLayer(reliefLayer)) map.addLayer(reliefLayer);
            return;
          }

          if (st.hazards) {
            if (!map.hasLayer(hazardLayer)) map.addLayer(hazardLayer);
          } else {
            if (map.hasLayer(hazardLayer)) map.removeLayer(hazardLayer);
          }

          if (st.safeShelter || st.hospital) {
            if (!map.hasLayer(safeLayer)) map.addLayer(safeLayer);
          } else {
            if (map.hasLayer(safeLayer)) map.removeLayer(safeLayer);
          }

          if (st.supplies || st.medical) {
            if (!map.hasLayer(reliefLayer)) map.addLayer(reliefLayer);
          } else {
            if (map.hasLayer(reliefLayer)) map.removeLayer(reliefLayer);
          }
        };

        // Hàm tìm kiếm theo số điện thoại hoặc từ khóa
        window.searchPins = function(keyword) {
          var kw = (keyword || '').toLowerCase().trim();
          if (!kw) {
            renderHazardMarkers(allHazards);
            renderSafeMarkers(allSafe);
            renderReliefMarkers(allRelief);
            return;
          }
          var matchedH = allHazards.filter(function(h) {
            var str = ((h.title || '') + ' ' + (h.address || '') + ' ' + (h.description || '')).toLowerCase();
            return str.indexOf(kw) !== -1;
          });
          renderHazardMarkers(matchedH);

          var matchedS = allSafe.filter(function(s) {
            var str = ((s.name || '') + ' ' + (s.address || '') + ' ' + (s.contactPhone || '')).toLowerCase();
            return str.indexOf(kw) !== -1;
          });
          renderSafeMarkers(matchedS);

          var matchedR = allRelief.filter(function(r) {
            var str = ((r.name || '') + ' ' + (r.address || '') + ' ' + (r.contactPhone || '')).toLowerCase();
            return str.indexOf(kw) !== -1;
          });
          renderReliefMarkers(matchedR);
        };

        // Hàm cập nhật dữ liệu Realtime động từ React Native
        window.updateHazardsData = function(newHazards) {
          allHazards = newHazards || [];
          renderHazardMarkers(allHazards);
        };

        window.updateSafeData = function(newSafe) {
          allSafe = newSafe || [];
          renderSafeMarkers(allSafe);
        };

        window.updateReliefData = function(newRelief) {
          allRelief = newRelief || [];
          renderReliefMarkers(allRelief);
        };

        window.updateSosData = function(newSos) {
          renderSosMarkers(newSos);
        };

        window.flyToSosSignal = function(lat, lng) {
          if (map && lat && lng) {
            map.flyTo([lat, lng], 17, {
              animate: true,
              duration: 1.2
            });
          }
        };

        window.fitAllSosSignals = function() {
          if (map && allSosPoints && allSosPoints.length > 0) {
            if (allSosPoints.length === 1) {
              map.flyTo(allSosPoints[0], 17, { animate: true, duration: 1.0 });
            } else {
              var bounds = L.latLngBounds(allSosPoints);
              map.fitBounds(bounds, { padding: [70, 70], maxZoom: 17, animate: true });
            }
          }
        };

        // Kết nối SSE Realtime trực tiếp từ trình duyệt WebView
        var streamUrl = '${streamUrl}';
        if (window.EventSource && streamUrl) {
          try {
            var es = new EventSource(streamUrl);
            es.onmessage = function(e) {
              try {
                var payload = JSON.parse(e.data);
                if (payload && payload.action) {
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'HAZARD_EVENT',
                      payload: payload
                    }));
                  }
                }
              } catch(err) {}
            };
          } catch(err) {}
        }

        // Khắc phục triệt để lỗi ô xám / bể khung trên WebView:
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
  }, [hasLocation, streamUrl]);

  const totalCount = hazards.length + safeLocations.length + reliefLocations.length;
  const unsupportedCount = hazards.filter(h => h.severity === 'CRITICAL' || h.severity === 'HIGH').length || 1;
  const supportedCount = hazards.filter(h => h.severity === 'LOW' || h.severity === 'MEDIUM').length || 0;
  const safeShelterCount = safeLocations.filter(s => s.type !== 'HOSPITAL').length;
  const hospitalCount = safeLocations.filter(s => s.type === 'HOSPITAL').length;
  const suppliesCount = reliefLocations.filter(r => r.type !== 'RESCUE_STATION').length;
  const medicalCount = reliefLocations.filter(r => r.type === 'RESCUE_STATION').length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Bản đồ WebView chiếm trọn toàn bộ nền */}
      <View style={styles.mapContainer}>
        {!location ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#0066FF" />
            <Text style={{ marginTop: 15, color: '#64748B' }}>{loadingMsg}</Text>
          </View>
        ) : (
          <WebView
            ref={webViewRef}
            source={{ html: mapHtml }}
            style={{ flex: 1, width: '100%', backgroundColor: '#F1F5F9' }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            androidLayerType="hardware"
            cacheEnabled={true}
            originWhitelist={['*']}
            scalesPageToFit={false}
            scrollEnabled={false}
            onLoadEnd={injectAllMapData}
            onMessage={handleWebViewMessage}
          />
        )}
      </View>

      {/* 1. CỤM HEADER NỔI TRÊN CÙNG (TOP OVERLAY THEO ẢNH MẪU) */}
      <View
        style={[styles.topOverlayContainer, { paddingTop: insets.top + (Platform.OS === 'ios' ? 8 : 12) }]}
        pointerEvents="box-none"
      >
        {/* Hàng 1: Nút Dropdown bản đồ cứu trợ / nguy hiểm */}
        <TouchableOpacity
          style={styles.topModeDropdown}
          onPress={() => setShowModeModal(true)}
          activeOpacity={0.85}
        >
          <View style={styles.topModeIconWrap}>
            <MaterialCommunityIcons
              name={mapMode === 'HAZARD' ? 'alert-octagon' : 'alert-circle'}
              size={18}
              color="#DC2626"
            />
          </View>
          <Text style={styles.topModeText}>
            {mapMode === 'HAZARD'
              ? 'Bản đồ nơi nguy hiểm'
              : mapMode === 'SOS'
                ? 'Bản đồ cứu trợ'
                : mapMode === 'SAFE'
                  ? 'Bản đồ điểm an toàn'
                  : 'Bản đồ tổng hợp'}
          </Text>
          <Feather name="chevron-down" size={17} color="#475569" />
        </TouchableOpacity>
      </View>

      {/* 2. CỘT NÚT CHỨC NĂNG BÊN PHẢI (RIGHT FLOATING BUTTONS THEO ẢNH MẪU) */}
      <View
        style={[
          styles.rightButtonsColumn,
          { top: insets.top + (Platform.OS === 'ios' ? 62 : 68) },
        ]}
        pointerEvents="box-none"
      >
        {/* Nút 1: GPS Re-center */}
        <TouchableOpacity
          style={styles.rightActionBtn}
          onPress={handleFlyToMyLocation}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#475569" />
        </TouchableOpacity>

        {/* Nút 2: Vệ tinh / Bản đồ */}
        <TouchableOpacity
          style={[
            styles.rightActionBtn,
            mapType === 'satellite' && styles.rightActionBtnActiveSatellite,
          ]}
          onPress={toggleMapType}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name="earth"
            size={20}
            color={mapType === 'satellite' ? '#0066FF' : '#475569'}
          />
        </TouchableOpacity>

        {/* Nút 3: Thời gian */}
        <TouchableOpacity
          style={styles.rightActionBtn}
          onPress={() => {
            Alert.alert('Cập nhật mới', 'Dữ liệu các điểm cứu hộ và nguy hiểm được đồng bộ thời gian thực.');
          }}
          activeOpacity={0.85}
        >
          <Feather name="clock" size={18} color="#475569" />
        </TouchableOpacity>

        {/* Nút 4: Đóng góp điểm cứu trợ / nguy hiểm (không hiển thị số 12) */}
        <TouchableOpacity
          style={styles.rightActionBtn}
          onPress={() => setShowHazardModal(true)}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="human-handsup" size={20} color="#0066FF" />
        </TouchableOpacity>

        {/* Nút 5: Tín hiệu SOS Cứu nạn (Định vị radar ca cứu hộ) */}
        <TouchableOpacity
          style={[
            styles.rightActionBtn,
            activeSosList.length > 0 && {
              borderColor: '#FCA5A5',
              backgroundColor: '#FEF2F2',
              shadowColor: '#DC2626',
              shadowOpacity: 0.28,
            },
          ]}
          onPress={handleFlyToActiveSos}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name="alarm-light"
            size={20}
            color={activeSosList.length > 0 ? '#DC2626' : '#64748B'}
          />
          {activeSosList.length > 0 && (
            <View
              style={{
                position: 'absolute',
                top: -3,
                right: -3,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                paddingHorizontal: 3,
                backgroundColor: '#DC2626',
                borderWidth: 1.5,
                borderColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontWeight: '800', lineHeight: 11 }}>
                {activeSosList.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* MODAL CHI TIẾT ĐIỂM (DETAIL BOTTOM SHEET) */}
      <Modal
        visible={showDetailModal && !!selectedDetail}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalDismissArea}
            activeOpacity={1}
            onPress={() => setShowDetailModal(false)}
          />

          <View style={[styles.detailSheetContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            {/* Thanh kéo / Drag handle */}
            <View style={styles.dragHandle} />

            {selectedDetail && (
              <>
                {/* Header Modal */}
                <View style={styles.detailHeader}>
                  {/* Badge phân loại */}
                  {selectedDetail.category === 'HAZARD' && (
                    <View style={styles.detailCategoryBadgeHazard}>
                      <Text style={styles.detailCategoryBadgeHazardText}>⚠️ ĐIỂM NGUY HIỂM</Text>
                    </View>
                  )}
                  {selectedDetail.category === 'SAFE' && (
                    <View style={styles.detailCategoryBadgeSafe}>
                      <Text style={styles.detailCategoryBadgeSafeText}>🛡️ ĐIỂM AN TOÀN</Text>
                    </View>
                  )}
                  {selectedDetail.category === 'RELIEF' && (
                    <View style={styles.detailCategoryBadgeRelief}>
                      <Text style={styles.detailCategoryBadgeReliefText}>🛟 ĐIỂM TIẾP TẾ / CỨU TRỢ</Text>
                    </View>
                  )}

                  {/* Nút đóng */}
                  <TouchableOpacity
                    style={styles.detailCloseBtn}
                    onPress={() => setShowDetailModal(false)}
                  >
                    <Feather name="x" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* Nội dung chi tiết cuộn */}
                <ScrollView
                  style={styles.detailScroll}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 16 }}
                >
                  {/* Tiêu đề */}
                  <Text style={styles.detailTitle}>
                    {selectedDetail.category === 'HAZARD'
                      ? selectedDetail.data.title || 'Điểm nguy hiểm thiên tai'
                      : selectedDetail.data.name || 'Điểm cứu trợ / An toàn'}
                  </Text>

                  {/* THÔNG TIN RIÊNG CHO ĐIỂM NGUY HIỂM */}
                  {selectedDetail.category === 'HAZARD' && (() => {
                    const h = selectedDetail.data;
                    const hType = h.hazardType || 'OTHER';
                    const typeMeta = getHazardTypeMeta(hType);
                    const severityMeta = getSeverityMeta(h.severity);

                    return (
                      <View style={{ gap: 14 }}>
                        {/* Hàng nhãn loại nguy hiểm & mức độ */}
                        <View style={styles.tagRow}>
                          <View style={[styles.hazardTypePill, { backgroundColor: typeMeta.bg }]}>
                            <MaterialCommunityIcons name={typeMeta.icon} size={15} color={typeMeta.color} />
                            <Text style={[styles.hazardTypePillText, { color: typeMeta.color }]}>
                              {h.customHazardType && hType === 'OTHER' ? h.customHazardType : typeMeta.label}
                            </Text>
                          </View>

                          <View style={[styles.severityPill, { backgroundColor: severityMeta.bg }]}>
                            <Text style={[styles.severityPillText, { color: severityMeta.color }]}>
                              Mức độ: {severityMeta.label}
                            </Text>
                          </View>

                          <View style={styles.verifiedPill}>
                            <Feather name="check-circle" size={12} color="#059669" />
                            <Text style={styles.verifiedPillText}>Đã phê duyệt</Text>
                          </View>
                        </View>

                        {/* Địa chỉ */}
                        <View style={styles.infoBox}>
                          <View style={styles.infoBoxIcon}>
                            <Feather name="map-pin" size={16} color="#EA580C" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.infoBoxLabel}>Địa chỉ hiện trường:</Text>
                            <Text style={styles.infoBoxValue}>{h.address || 'Đang cập nhật'}</Text>
                          </View>
                        </View>

                        {/* Mô tả chi tiết */}
                        {h.description ? (
                          <View style={styles.descBox}>
                            <Text style={styles.descBoxLabel}>Mô tả thực tế:</Text>
                            <Text style={styles.descBoxContent}>{h.description}</Text>
                          </View>
                        ) : null}

                        {/* Hình ảnh đính kèm */}
                        {Array.isArray(h.images) && h.images.length > 0 && (
                          <View>
                            <Text style={styles.sectionLabel}>
                              Hình ảnh hiện trường ({h.images.length}):
                            </Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                              <View style={styles.imageGallery}>
                                {h.images.map((imgUrl: string, idx: number) => (
                                  <TouchableOpacity
                                    key={idx}
                                    activeOpacity={0.8}
                                    onPress={() => setPreviewImage(imgUrl)}
                                  >
                                    <Image source={{ uri: imgUrl }} style={styles.detailThumbnail} />
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </ScrollView>
                          </View>
                        )}

                        {/* Người báo & Thời gian */}
                        <View style={styles.metaBox}>
                          <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Người báo tin:</Text>
                            <Text style={styles.metaVal}>{h.reportedBy?.fullName || 'Người dân đóng góp'}</Text>
                          </View>
                          <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Thời gian gửi:</Text>
                            <Text style={styles.metaVal}>{formatDateTime(h.createdAt)}</Text>
                          </View>
                          {h.reviewedAt && (
                            <View style={styles.metaRow}>
                              <Text style={styles.metaLabel}>Thời gian duyệt:</Text>
                              <Text style={styles.metaVal}>{formatDateTime(h.reviewedAt)}</Text>
                            </View>
                          )}
                          {h.reviewNote ? (
                            <View style={[styles.metaRow, { marginTop: 4 }]}>
                              <Text style={styles.metaLabel}>Ghi chú thẩm định:</Text>
                              <Text style={[styles.metaVal, { color: '#059669', fontWeight: '600' }]}>
                                {h.reviewNote}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                  })()}

                  {/* THÔNG TIN RIÊNG CHO ĐIỂM AN TOÀN */}
                  {selectedDetail.category === 'SAFE' && (() => {
                    const s = selectedDetail.data;
                    const typeLabel = s.type === 'HOSPITAL'
                      ? '🏥 Bệnh viện - Cấp cứu y tế'
                      : (s.type === 'SHELTER' ? '🛡️ Khu trú ẩn an toàn' : '🛡️ Trung tâm sơ tán khẩn cấp');

                    return (
                      <View style={{ gap: 14 }}>
                        <View style={styles.tagRow}>
                          <View style={[styles.hazardTypePill, { backgroundColor: '#ECFDF5' }]}>
                            <Text style={[styles.hazardTypePillText, { color: '#059669' }]}>{typeLabel}</Text>
                          </View>
                        </View>

                        <View style={styles.infoBox}>
                          <View style={styles.infoBoxIcon}>
                            <Feather name="map-pin" size={16} color="#059669" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.infoBoxLabel}>Địa chỉ an toàn:</Text>
                            <Text style={styles.infoBoxValue}>{s.address || 'Đang cập nhật'}</Text>
                          </View>
                        </View>

                        <View style={styles.capacityCard}>
                          <Text style={styles.capacityCardTitle}>Tình trạng sức chứa hiện tại</Text>
                          <View style={styles.capacityRow}>
                            <View style={styles.capacityCol}>
                              <Text style={styles.capacityNum}>{s.capacity || 0}</Text>
                              <Text style={styles.capacityText}>Sức chứa tối đa</Text>
                            </View>
                            <View style={styles.capacityDivider} />
                            <View style={styles.capacityCol}>
                              <Text style={[styles.capacityNum, { color: '#059669' }]}>
                                {s.currentOccupancy || 0}
                              </Text>
                              <Text style={styles.capacityText}>Đang tiếp nhận</Text>
                            </View>
                          </View>
                        </View>

                        {(s.contactPerson || s.contactPhone) && (
                          <View style={styles.metaBox}>
                            {s.contactPerson && (
                              <View style={styles.metaRow}>
                                <Text style={styles.metaLabel}>Người phụ trách:</Text>
                                <Text style={styles.metaVal}>{s.contactPerson}</Text>
                              </View>
                            )}
                            {s.contactPhone && (
                              <TouchableOpacity
                                style={styles.metaRow}
                                onPress={() => Linking.openURL(`tel:${s.contactPhone}`)}
                              >
                                <Text style={styles.metaLabel}>Hotline liên hệ:</Text>
                                <Text style={[styles.metaVal, { color: '#0284C7', fontWeight: '700' }]}>
                                  📞 {s.contactPhone}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })()}

                  {/* THÔNG TIN RIÊNG CHO ĐIỂM CỨU TRỢ */}
                  {selectedDetail.category === 'RELIEF' && (() => {
                    const r = selectedDetail.data;
                    const typeLabel = r.type === 'RESCUE_STATION'
                      ? '🛟 Trạm cứu hộ PCTT'
                      : '📦 Điểm tập kết tiếp tế cứu trợ';

                    return (
                      <View style={{ gap: 14 }}>
                        <View style={styles.tagRow}>
                          <View style={[styles.hazardTypePill, { backgroundColor: '#FFF7ED' }]}>
                            <Text style={[styles.hazardTypePillText, { color: '#EA580C' }]}>{typeLabel}</Text>
                          </View>
                        </View>

                        <View style={styles.infoBox}>
                          <View style={styles.infoBoxIcon}>
                            <Feather name="map-pin" size={16} color="#EA580C" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.infoBoxLabel}>Địa điểm tiếp tế / cứu trợ:</Text>
                            <Text style={styles.infoBoxValue}>{r.address || 'Đang cập nhật'}</Text>
                          </View>
                        </View>

                        <View style={[styles.capacityCard, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                          <Text style={[styles.capacityCardTitle, { color: '#C2410C' }]}>
                            Khả năng tiếp ứng lương thực & hàng hóa
                          </Text>
                          <View style={styles.capacityRow}>
                            <View style={styles.capacityCol}>
                              <Text style={[styles.capacityNum, { color: '#EA580C' }]}>{r.capacity || 0}</Text>
                              <Text style={styles.capacityText}>Suất hàng / lượt hỗ trợ</Text>
                            </View>
                          </View>
                        </View>

                        {(r.contactPerson || r.contactPhone) && (
                          <View style={styles.metaBox}>
                            {r.contactPerson && (
                              <View style={styles.metaRow}>
                                <Text style={styles.metaLabel}>Người liên hệ:</Text>
                                <Text style={styles.metaVal}>{r.contactPerson}</Text>
                              </View>
                            )}
                            {r.contactPhone && (
                              <TouchableOpacity
                                style={styles.metaRow}
                                onPress={() => Linking.openURL(`tel:${r.contactPhone}`)}
                              >
                                <Text style={styles.metaLabel}>Hotline tiếp nhận:</Text>
                                <Text style={[styles.metaVal, { color: '#0284C7', fontWeight: '700' }]}>
                                  📞 {r.contactPhone}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })()}
                </ScrollView>

                {/* Footer Hành Động: Nút Chỉ đường Google Maps */}
                <View style={styles.detailActionsBar}>
                  <TouchableOpacity
                    style={styles.directionsBtn}
                    onPress={handleOpenDirections}
                    activeOpacity={0.85}
                  >
                    <Feather name="navigation" size={17} color="#FFFFFF" />
                    <Text style={styles.directionsBtnText}>Chỉ đường Google Maps</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.closeSheetBtn}
                    onPress={() => setShowDetailModal(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.closeSheetBtnText}>Đóng</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal Phóng to xem ảnh full size */}
      <Modal
        visible={!!previewImage}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
      >
        <View style={styles.previewImageBackdrop}>
          <TouchableOpacity
            style={styles.previewCloseBtn}
            onPress={() => setPreviewImage(null)}
          >
            <Feather name="x" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {previewImage && (
            <Image
              source={{ uri: previewImage }}
              style={styles.previewFullImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Modal Đóng góp điểm nguy hiểm */}
      <ContributeHazardModal
        visible={showHazardModal}
        onClose={() => setShowHazardModal(false)}
        onSuccess={fetchMapData}
        initialCoords={location ? { latitude: location.coords.latitude, longitude: location.coords.longitude } : undefined}
      />

      {/* MODAL CHUYỂN ĐỔI CHẾ ĐỘ BẢN ĐỒ (TOP DROPDOWN MODAL) */}
      <Modal
        visible={showModeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModeModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalDismissArea}
            activeOpacity={1}
            onPress={() => setShowModeModal(false)}
          />

          <View style={[styles.areaSheetContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.dragHandle} />

            <View style={styles.areaHeader}>
              <View>
                <Text style={styles.areaModalTitle}>Chế độ hiển thị bản đồ</Text>
                <Text style={styles.areaModalSubtitle}>
                  Chọn loại dữ liệu bạn muốn tập trung theo dõi trên bản đồ
                </Text>
              </View>
              <TouchableOpacity
                style={styles.detailCloseBtn}
                onPress={() => setShowModeModal(false)}
              >
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 8, paddingVertical: 10 }}>
              {[
                {
                  id: 'SOS',
                  title: 'Bản đồ cứu trợ khẩn cấp',
                  desc: 'Nhu yếu phẩm, trạm cứu hộ, tiếp tế lương thực & hỗ trợ y tế',
                  icon: 'life-buoy',
                  color: '#EA580C',
                },
                {
                  id: 'HAZARD',
                  title: 'Bản đồ nơi nguy hiểm',
                  desc: 'Điểm ngập sâu, sạt lở, cô lập & các cảnh báo rủi ro thiên tai',
                  icon: 'alert-triangle',
                  color: '#DC2626',
                },
                {
                  id: 'SAFE',
                  title: 'Bản đồ điểm an toàn',
                  desc: 'Khu trú ẩn, trạm sơ tán, bệnh viện & trung tâm y tế',
                  icon: 'shield',
                  color: '#059669',
                },
                {
                  id: 'ALL',
                  title: 'Bản đồ tổng hợp toàn diện',
                  desc: 'Hiển thị tất cả các điểm trên địa bàn thành phố Đà Nẵng',
                  icon: 'layers',
                  color: '#0066FF',
                },
              ].map((item) => {
                const isSelected = mapMode === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.areaItemRow, isSelected && styles.areaItemRowActive]}
                    onPress={() => handleSelectMapMode(item.id as any)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.areaItemLeft}>
                      <View
                        style={[
                          styles.areaItemIconWrap,
                          { backgroundColor: `${item.color}15` },
                          isSelected && { backgroundColor: item.color },
                        ]}
                      >
                        <Feather
                          name={item.icon as any}
                          size={17}
                          color={isSelected ? '#FFFFFF' : item.color}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.areaItemName,
                            isSelected && { color: item.color, fontWeight: '700' },
                          ]}
                        >
                          {item.title}
                        </Text>
                        <Text style={styles.areaItemSub}>{item.desc}</Text>
                      </View>
                    </View>
                    {isSelected && (
                      <Feather name="check" size={18} color={item.color} style={{ marginLeft: 8 }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL CHỌN CÁC VÙNG / ĐỊA BÀN (AREA SELECTION BOTTOM SHEET) */}
      <Modal
        visible={showAreaModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAreaModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalDismissArea}
            activeOpacity={1}
            onPress={() => setShowAreaModal(false)}
          />

          <View style={[styles.areaSheetContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.dragHandle} />

            <View style={styles.areaHeader}>
              <View>
                <Text style={styles.areaModalTitle}>Chọn khu vực / Địa bàn</Text>
                <Text style={styles.areaModalSubtitle}>
                  Nhấn vào quận, huyện để bay tới xem nhanh tình hình thực tế
                </Text>
              </View>
              <TouchableOpacity
                style={styles.detailCloseBtn}
                onPress={() => setShowAreaModal(false)}
              >
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.areaListScroll} showsVerticalScrollIndicator={false}>
              {DANANG_AREAS.map((zone) => {
                const isSelected = selectedArea.id === zone.id;
                const count = getAreaHazardCount(zone);

                return (
                  <TouchableOpacity
                    key={zone.id}
                    style={[styles.areaItemRow, isSelected && styles.areaItemRowActive]}
                    onPress={() => handleSelectArea(zone)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.areaItemLeft}>
                      <View style={[styles.areaItemIconWrap, isSelected && styles.areaItemIconWrapActive]}>
                        <Feather
                          name={zone.id === 'ALL' ? 'globe' : 'map-pin'}
                          size={16}
                          color={isSelected ? '#FFFFFF' : '#0066FF'}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.areaItemName, isSelected && styles.areaItemNameActive]}>
                          {zone.name}
                        </Text>
                        <Text style={styles.areaItemSub}>
                          {zone.id === 'ALL'
                            ? `Toàn thành phố (${hazards.length} điểm nguy hiểm)`
                            : count > 0
                              ? `${count} điểm nguy hiểm ghi nhận`
                              : 'Không có điểm nguy hiểm ghi nhận'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.areaItemRight}>
                      {count > 0 && (
                        <View style={styles.areaHazardBadge}>
                          <Text style={styles.areaHazardBadgeText}>{count} ⚠️</Text>
                        </View>
                      )}
                      {isSelected && (
                        <Feather name="check" size={18} color="#0066FF" style={{ marginLeft: 8 }} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal chọn tín hiệu SOS khi có nhiều ca đang kích hoạt */}
      <Modal
        visible={showSosListModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSosListModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalDismissArea}
            activeOpacity={1}
            onPress={() => setShowSosListModal(false)}
          />
          <View style={[styles.detailSheetContainer, { paddingBottom: Math.max(insets.bottom, 20), maxHeight: SCREEN_HEIGHT * 0.7 }]}>
            <View style={styles.dragHandle} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="alarm-light" size={18} color="#DC2626" />
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                    Tín hiệu SOS đang phát ({activeSosList.length})
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>
                    Chọn 1 ca để định vị hoặc xem tất cả trên bản đồ
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowSosListModal(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleFitAllSosSignals}
              activeOpacity={0.85}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: '#EFF6FF',
                borderWidth: 1,
                borderColor: '#BFDBFE',
                borderRadius: 12,
                paddingVertical: 10,
                marginBottom: 12,
              }}
            >
              <MaterialCommunityIcons name="map-marker-multiple" size={18} color="#0066FF" />
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#0066FF' }}>
                Xem tất cả {activeSosList.length} tín hiệu trên bản đồ
              </Text>
            </TouchableOpacity>

            <ScrollView showsVerticalScrollIndicator={false}>
              {activeSosList.map((sosItem, idx) => {
                const code = sosItem.code || `SOS-${String(sosItem._id || '').slice(-4).toUpperCase()}`;
                const address = sosItem.location?.address || 'Chưa rõ địa chỉ';
                const statusLabel =
                  sosItem.status === 'PENDING'
                    ? 'Chờ tiếp nhận'
                    : sosItem.status === 'VERIFIED' || sosItem.status === 'ASSIGNED'
                    ? 'Đã điều phối'
                    : sosItem.status === 'IN_PROGRESS' || sosItem.status === 'EN_ROUTE'
                    ? 'Đang cứu hộ'
                    : sosItem.status || 'Đang xử lý';
                return (
                  <View
                    key={sosItem._id || idx}
                    style={{
                      backgroundColor: '#F8FAFC',
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                      borderRadius: 14,
                      padding: 12,
                      marginBottom: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>
                          #{code}
                        </Text>
                        {sosItem.isProxyReport && (
                          <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#B45309' }}>Báo hộ</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>{statusLabel}</Text>
                      </View>
                    </View>

                    <Text style={{ fontSize: 12.5, color: '#334155', marginBottom: 4 }} numberOfLines={2}>
                      {sosItem.description || 'Yêu cầu hỗ trợ khẩn cấp'}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }} numberOfLines={1}>
                      📍 {address} · {sosItem.victimCount || 1} người
                    </Text>

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => handleSelectSosFromList(sosItem)}
                        activeOpacity={0.85}
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          backgroundColor: '#DC2626',
                          paddingVertical: 9,
                          borderRadius: 10,
                        }}
                      >
                        <MaterialCommunityIcons name="crosshairs-gps" size={16} color="#FFFFFF" />
                        <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' }}>Định vị</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setShowSosListModal(false);
                          setTrackingSosId(sosItem._id);
                          setShowTrackingModal(true);
                        }}
                        activeOpacity={0.85}
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          backgroundColor: '#FFFFFF',
                          borderWidth: 1,
                          borderColor: '#CBD5E1',
                          paddingVertical: 9,
                          borderRadius: 10,
                        }}
                      >
                        <Feather name="eye" size={15} color="#334155" />
                        <Text style={{ color: '#334155', fontSize: 12.5, fontWeight: '700' }}>Theo dõi</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal theo dõi hành trình SOS khi bấm vào ghim radar trên bản đồ */}
      <CitizenSosTrackingModal
        visible={showTrackingModal && !!trackingSosId}
        sosId={trackingSosId}
        onClose={() => {
          setShowTrackingModal(false);
          setTrackingSosId(null);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  mapContainer: {
    ...StyleSheet.absoluteFill,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 1. CỤM HEADER NỔI TRÊN CÙNG
  topOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 90,
    paddingHorizontal: 12,
    gap: 8,
  },
  topModeDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF1F2',
    borderWidth: 1.5,
    borderColor: '#F87171',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  topModeIconWrap: {
    marginRight: 8,
  },
  topModeText: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  subControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subAreaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 40,
  },
  subAreaText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#475569',
  },
  subSearchBox: {
    flex: 1.15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 40,
  },
  subSearchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    paddingVertical: 0,
  },

  // 2. CỘT NÚT CHỨC NĂNG BÊN PHẢI
  rightButtonsColumn: {
    position: 'absolute',
    right: 12,
    zIndex: 95,
    alignItems: 'center',
    gap: 10,
  },
  rightActionBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 4,
  },
  rightActionBtnActiveSatellite: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
  },
  rightFilterBtnRed: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
  },
  rightBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  rightBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },

  // 3. CARD BỘ LỌC NỔI Ở TRUNG TÂM BẢN ĐỒ
  centerFilterCard: {
    position: 'absolute',
    left: 14,
    right: 64,
    maxHeight: SCREEN_HEIGHT * 0.58,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    zIndex: 92,
  },
  filterCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  filterCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    flex: 1,
  },
  filterCardCloseBtn: {
    padding: 4,
  },
  filterCardScroll: {
    maxHeight: SCREEN_HEIGHT * 0.50,
  },
  filterCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  filterCardRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  filterCardRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filterCardRowText: {
    fontSize: 14.5,
    color: '#334155',
    fontWeight: '500',
  },
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  filterCardCount: {
    fontSize: 13.5,
    color: '#64748B',
    fontWeight: '500',
  },
  filterCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCheckboxActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  filterSectionHeaderWrap: {
    alignItems: 'center',
    marginVertical: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  filterSectionHeaderTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  filterPinkBoxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginVertical: 3.5,
  },
  filterPinkBoxRowActive: {
    backgroundColor: '#FEE2E2',
  },
  filterBoxIcon: {
    fontSize: 16,
  },
  filterBoxText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    flexShrink: 1,
  },
  filterRedCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRedCheckboxActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },

  // 4. DẢI BĂNG THÔNG BÁO KHẨN CẤP ĐỎ Ở ĐÁY
  bottomBannerRed: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#DC2626',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 6,
    zIndex: 85,
  },
  bottomBannerText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '600',
  },
  areaSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.72,
    paddingHorizontal: 20,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  areaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 8,
  },
  areaModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  areaModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  areaListScroll: {
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  areaItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginVertical: 3,
    backgroundColor: '#F8FAFC',
  },
  areaItemRowActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  areaItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  areaItemIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  areaItemIconWrapActive: {
    backgroundColor: '#0066FF',
  },
  areaItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  areaItemNameActive: {
    color: '#0066FF',
    fontWeight: '700',
  },
  areaItemSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  areaItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  areaHazardBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  areaHazardBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#DC2626',
  },

  // Modal Chi tiết Điểm (Detail Sheet)
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  detailSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.82,
    paddingHorizontal: 20,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginVertical: 8,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailCategoryBadgeHazard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  detailCategoryBadgeHazardText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  detailCategoryBadgeSafe: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  detailCategoryBadgeSafeText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  detailCategoryBadgeRelief: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  detailCategoryBadgeReliefText: {
    color: '#EA580C',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  detailCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailScroll: {
    maxHeight: SCREEN_HEIGHT * 0.58,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 24,
    marginBottom: 10,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  hazardTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  hazardTypePillText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  severityPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  severityPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  verifiedPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoBoxIcon: {
    marginTop: 2,
  },
  infoBoxLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  infoBoxValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
    lineHeight: 19,
  },
  descBox: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  descBoxLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  descBoxContent: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
  },
  sectionLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  imageGallery: {
    flexDirection: 'row',
    gap: 8,
  },
  detailThumbnail: {
    width: 100,
    height: 75,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  metaBox: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  metaVal: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  capacityCard: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  capacityCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    marginBottom: 8,
  },
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  capacityCol: {
    alignItems: 'center',
  },
  capacityNum: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  capacityText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  capacityDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#CBD5E1',
  },
  detailActionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  directionsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0066FF',
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  directionsBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  closeSheetBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeSheetBtnText: {
    color: '#475569',
    fontSize: 13.5,
    fontWeight: '700',
  },
  previewImageBackdrop: {
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
    padding: 8,
  },
  previewFullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
  },
});

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { backendApi } from '../services/backendApi';
import { ContributeHazardModal } from './ContributeHazardModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export type MapFilterType = 'ALL' | 'HAZARD' | 'SAFE' | 'RELIEF';

interface SelectedDetailItem {
  category: 'HAZARD' | 'SAFE' | 'RELIEF';
  data: any;
}

export const MapScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loadingMsg, setLoadingMsg] = useState('Đang tìm vị trí của bạn...');
  const [showHazardModal, setShowHazardModal] = useState(false);
  const [hazards, setHazards] = useState<any[]>([]);
  const [safeLocations, setSafeLocations] = useState<any[]>([]);
  const [reliefLocations, setReliefLocations] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState<MapFilterType>('ALL');
  const [baseUrl, setBaseUrl] = useState<string>('');
  
  // Modal Chi tiết điểm (Detail Bottom Sheet / Modal)
  const [selectedDetail, setSelectedDetail] = useState<SelectedDetailItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const webViewRef = useRef<WebView>(null);
  const hazardsRef = useRef(hazards);
  hazardsRef.current = hazards;

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
      .catch(() => {});

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
      .catch(() => {});
  }, []);

  // Tải dữ liệu ban đầu
  useEffect(() => {
    fetchMapData();
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
        } catch {}
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [fetchMapData, handleRealtimeHazardEvent]);

  // Bắn dữ liệu mới vào Leaflet ngay lập tức mà KHÔNG cần reload lại map
  useEffect(() => {
    if (webViewRef.current && hazards) {
      try {
        const jsonStr = JSON.stringify(hazards)
          .replace(/\\/g, '\\\\')
          .replace(/'/g, "\\'")
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '');
        webViewRef.current.injectJavaScript(`
          if (window.updateHazardsData) {
            window.updateHazardsData(JSON.parse('${jsonStr}'));
          }
          true;
        `);
      } catch {}
    }
  }, [hazards]);

  // Xử lý bộ lọc
  const handleFilterSelect = (filterKey: MapFilterType) => {
    setActiveFilter(filterKey);
    webViewRef.current?.injectJavaScript(`window.setMapFilter && window.setMapFilter('${filterKey}'); true;`);
  };

  // Nhận thông điệp từ Leaflet WebView
  const handleWebViewMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'SELECT_PIN') {
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

  // Định dạng ngày giờ
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return 'Vừa xong';
    try {
      const d = new Date(dateStr);
      const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `${time} ngày ${date}`;
    } catch {
      return dateStr;
    }
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
        return { label: 'Cực kỳ nguy cấp', color: '#EF4444', bg: '#FEF2F2' };
      default:
        return { label: 'Cảnh báo', color: '#64748B', bg: '#F1F5F9' };
    }
  };

  const streamUrl = baseUrl ? `${baseUrl}/hazard-reports/stream` : '';

  const mapHtml = location ? `
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
          width: 30px;
          height: 30px;
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
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', {
          zoomControl: false,
          preferCanvas: true
        }).setView([${location.coords.latitude}, ${location.coords.longitude}], 15);

        L.control.zoom({ position: 'topright' }).addTo(map);

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
        }).addTo(map);

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
        }).addTo(map);

        // Ghim vị trí người dùng với hiệu ứng radar cứu hộ
        var myIcon = L.divIcon({
          html: '<div class="sos-radar-container"><div class="sos-radar-wave"></div><div class="sos-radar-core"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12a5 5 0 0 1 5-5v0a5 5 0 0 1 5 5v6H7v-6Z"/><path d="M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2H5v-2Z"/><path d="M21 12h1"/><path d="M18.5 4.5 19 4"/><path d="M2 12h1"/><path d="M12 2v1"/><path d="M4.5 4.5 5 4"/><path d="M12 11v3"/></svg></div></div>',
          className: 'custom-sos-radar-wrapper',
          iconSize: [44, 44],
          iconAnchor: [22, 22]
        });

        L.marker([${location.coords.latitude}, ${location.coords.longitude}], { icon: myIcon }).addTo(map);
        
        L.circle([${location.coords.latitude}, ${location.coords.longitude}], {
          color: '#DC2626',
          fillColor: '#EF4444',
          fillOpacity: 0.12,
          radius: 500,
          weight: 1.8,
          dashArray: '5, 5'
        }).addTo(map);

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

        // Khởi tạo các điểm ban đầu
        renderHazardMarkers(${JSON.stringify(hazards)});
        renderSafeMarkers(${JSON.stringify(safeLocations)});
        renderReliefMarkers(${JSON.stringify(reliefLocations)});

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

        // Hàm cập nhật dữ liệu Realtime động từ React Native
        window.updateHazardsData = function(newHazards) {
          renderHazardMarkers(newHazards);
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
  ` : '';

  const totalCount = hazards.length + safeLocations.length + reliefLocations.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appBadge}>HỆ THỐNG CỨU HỘ SOS</Text>
          <Text style={styles.title}>Bản đồ cứu hộ</Text>
        </View>

        <TouchableOpacity
          style={styles.hazardHeaderBtn}
          onPress={() => setShowHazardModal(true)}
          activeOpacity={0.8}
        >
          <Feather name="alert-triangle" size={14} color="#EA580C" />
          <Text style={styles.hazardHeaderBtnText}>Báo nguy hiểm</Text>
        </TouchableOpacity>
      </View>

      {/* Thanh Bộ Lọc Phân Loại Điểm (Filter Chips Bar) */}
      <View style={styles.filterBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {/* 1. Tất cả */}
          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'ALL' && styles.filterChipActiveAll]}
            onPress={() => handleFilterSelect('ALL')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, activeFilter === 'ALL' && styles.filterChipTextActiveAll]}>
              Tất cả
            </Text>
            <View style={[styles.filterBadge, activeFilter === 'ALL' && styles.filterBadgeActiveAll]}>
              <Text style={[styles.filterBadgeText, activeFilter === 'ALL' && styles.filterBadgeTextActiveAll]}>
                {totalCount}
              </Text>
            </View>
          </TouchableOpacity>

          {/* 2. Điểm nguy hiểm */}
          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'HAZARD' && styles.filterChipActiveHazard]}
            onPress={() => handleFilterSelect('HAZARD')}
            activeOpacity={0.7}
          >
            <Text style={styles.chipEmoji}>⚠️</Text>
            <Text style={[styles.filterChipText, activeFilter === 'HAZARD' && styles.filterChipTextActiveHazard]}>
              Điểm nguy hiểm
            </Text>
            <View style={[styles.filterBadge, activeFilter === 'HAZARD' && styles.filterBadgeActiveHazard]}>
              <Text style={[styles.filterBadgeText, activeFilter === 'HAZARD' && styles.filterBadgeTextActiveHazard]}>
                {hazards.length}
              </Text>
            </View>
          </TouchableOpacity>

          {/* 3. Điểm an toàn */}
          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'SAFE' && styles.filterChipActiveSafe]}
            onPress={() => handleFilterSelect('SAFE')}
            activeOpacity={0.7}
          >
            <Text style={styles.chipEmoji}>🛡️</Text>
            <Text style={[styles.filterChipText, activeFilter === 'SAFE' && styles.filterChipTextActiveSafe]}>
              Điểm an toàn
            </Text>
            <View style={[styles.filterBadge, activeFilter === 'SAFE' && styles.filterBadgeActiveSafe]}>
              <Text style={[styles.filterBadgeText, activeFilter === 'SAFE' && styles.filterBadgeTextActiveSafe]}>
                {safeLocations.length}
              </Text>
            </View>
          </TouchableOpacity>

          {/* 4. Điểm cứu trợ */}
          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'RELIEF' && styles.filterChipActiveRelief]}
            onPress={() => handleFilterSelect('RELIEF')}
            activeOpacity={0.7}
          >
            <Text style={styles.chipEmoji}>🛟</Text>
            <Text style={[styles.filterChipText, activeFilter === 'RELIEF' && styles.filterChipTextActiveRelief]}>
              Điểm cứu trợ
            </Text>
            <View style={[styles.filterBadge, activeFilter === 'RELIEF' && styles.filterBadgeActiveRelief]}>
              <Text style={[styles.filterBadgeText, activeFilter === 'RELIEF' && styles.filterBadgeTextActiveRelief]}>
                {reliefLocations.length}
              </Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Body bản đồ */}
      <View style={styles.body}>
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
            onMessage={handleWebViewMessage}
          />
        )}
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 36 : 10,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    zIndex: 10,
  },
  hazardHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  hazardHeaderBtnText: {
    color: '#EA580C',
    fontSize: 12,
    fontWeight: '700',
  },
  appBadge: {
    fontSize: 11,
    color: '#0066FF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  filterBarWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 9,
    zIndex: 9,
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  filterChipActiveAll: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterChipActiveHazard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  filterChipActiveSafe: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  filterChipActiveRelief: {
    backgroundColor: '#FFF7ED',
    borderColor: '#F97316',
  },
  chipEmoji: {
    fontSize: 13,
  },
  filterChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActiveAll: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterChipTextActiveHazard: {
    color: '#DC2626',
    fontWeight: '700',
  },
  filterChipTextActiveSafe: {
    color: '#059669',
    fontWeight: '700',
  },
  filterChipTextActiveRelief: {
    color: '#EA580C',
    fontWeight: '700',
  },
  filterBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  filterBadgeActiveAll: {
    backgroundColor: '#334155',
  },
  filterBadgeActiveHazard: {
    backgroundColor: '#DC2626',
  },
  filterBadgeActiveSafe: {
    backgroundColor: '#059669',
  },
  filterBadgeActiveRelief: {
    backgroundColor: '#EA580C',
  },
  filterBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  filterBadgeTextActiveAll: {
    color: '#FFFFFF',
  },
  filterBadgeTextActiveHazard: {
    color: '#FFFFFF',
  },
  filterBadgeTextActiveSafe: {
    color: '#FFFFFF',
  },
  filterBadgeTextActiveRelief: {
    color: '#FFFFFF',
  },
  body: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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

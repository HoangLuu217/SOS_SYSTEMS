import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  AppState,
  DeviceEventEmitter,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Platform,
  Image,
  ImageBackground,
  ActivityIndicator,
  Modal,
  Linking,
  RefreshControl,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import * as Location from 'expo-location';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { LogoSOS } from '@/components';
import { BACKGROUND_APP_SOURCE } from '@/constants/backgroundBase64';
import { SOSMapScreen, ContributeHazardModal } from '@/features/sos';
import { LocalAuthorityChatModal } from './LocalAuthorityChatModal';
import { SafetyCheckModal } from './SafetyCheckModal';
import { TabName } from '@/types';
import { backendApi, safetyCheckApi, SafetyCheckItem, bloodDonationApi } from '@/api';


export interface HomeScreenProps {
  onOpenSettings: () => void;
  onOpenNotifications?: () => void;
  onNavigateToTab?: (tab: TabName, options?: { filter?: 'ALL' | 'HAZARD' | 'SAFE' | 'RELIEF'; areaId?: string }) => void;
  onNavigateToSos?: () => void;
}

interface NewsItem {
  id: string;
  tag: string;
  time: string;
  title: string;
  snippet: string;
  imageUrl: string;
  content?: string;
  sourceUrl?: string;
  sourceName?: string;
}

interface WeatherState {
  city: string;
  temp: string;
  tempRange: string;
  desc: string;
  rainChance: string;
  icon: any;
  isDay: number;
}

// Icon vị trí Bootstrap (bi-geo-alt-fill)
const BootstrapGeoAltFill: React.FC<{ size?: number; color?: string }> = ({
  size = 14,
  color = '#38BDF8',
}) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
    <Path d="M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10m0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6" />
  </Svg>
);

// Icon thời tiết tách nền trong thư mục assets/thoitiet
const WEATHER_ICONS = {
  comay: require('../../../assets/thoitiet/comay.png'),
  maydem: require('../../../assets/thoitiet/maydem.png'),
  dem: require('../../../assets/thoitiet/dem.png'),
  mua: require('../../../assets/thoitiet/mua.png'),
  muadem: require('../../../assets/thoitiet/muadem.png'),
  muagiong: require('../../../assets/thoitiet/muagiong.png'),
  nang: require('../../../assets/thoitiet/nang.png'),
  tuyetroi: require('../../../assets/thoitiet/tuyetroi.png'),
};

const WEATHER_CATEGORY_LABELS: Record<string, string> = {
  du_bao: 'DỰ BÁO',
  canh_bao: 'CẢNH BÁO',
  bao_ap_thap: 'BÃO & ÁP THẤP',
  mua_lu: 'MƯA LŨ',
  nang_nong: 'NẮNG NÓNG',
  ret_dam: 'RÉT ĐẬM',
  khong_khi: 'KHÔNG KHÍ',
  sat_lo: 'SẠT LỞ',
  bao: 'BÃO LỚN',
  thoi_tiet: 'THỜI TIẾT',
  HEAVY_RAIN: 'MƯA LỚN',
  STORM: 'BÃO ÁP THẤP',
  THUNDERSTORM: 'DÔNG SÉT',
  FLASH_FLOOD: 'LŨ QUÉT',
  HIGH_TIDE: 'TRIỀU CƯỜNG',
  GENERAL: 'THỜI TIẾT',
  khac: 'TIN TỨC',
};

function formatNewsCardDate(dateStr?: string | Date | null): string {
  if (!dateStr) return 'Hôm nay';
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(d.getTime())) return 'Hôm nay';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month} ${hours}:${minutes}`;
  } catch {
    return 'Hôm nay';
  }
}

/**
 * Component hiển thị ảnh thumbnail bài viết, tự động chuyển về fallback đẹp mắt khi link lỗi
 */
const NewsThumbnailImage: React.FC<{
  imageUrl?: string;
  tag?: string;
}> = ({ imageUrl, tag }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [imageUrl]);

  if (!imageUrl || hasError) {
    const isAlert =
      tag?.includes('CẢNH BÁO') ||
      tag?.includes('BÃO') ||
      tag?.includes('LŨ') ||
      tag?.includes('SẠT LỞ');
    return (
      <View style={[styles.newsThumbnailPlaceholder, isAlert ? styles.newsThumbnailAlertBg : null]}>
        <Ionicons
          name={isAlert ? 'warning' : 'cloudy'}
          size={24}
          color={isAlert ? '#DC2626' : '#0284C7'}
        />
        <Text
          style={[styles.newsThumbnailPlaceholderText, isAlert ? styles.newsThumbnailAlertText : null]}
          numberOfLines={1}
        >
          {tag || 'THỜI TIẾT'}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: imageUrl }}
      style={styles.newsThumbnail}
      resizeMode="cover"
      onError={() => setHasError(true)}
    />
  );
};

const FEATURED_NEWS: NewsItem[] = [
  {
    id: '1',
    tag: 'TIN TỨC',
    time: '12/10 08:32',
    title: 'Cảnh báo nguy cơ lũ quét, sạt lở đất tại Đà Nẵng, Quảng Ngãi v...',
    snippet: 'TIN CẢNH BÁO THIÊN TAI Cảnh báo nguy cơ...',
    imageUrl:
      'https://images.unsplash.com/photo-1547683905-f686c993aae5?w=500&auto=format&fit=crop&q=80',
    content:
      'Trung tâm Dự báo Khí tượng Thủy văn Quốc gia cảnh báo mưa lớn diện rộng có khả năng gây ngập úng tại các vùng trũng thấp, nguy cơ lũ quét trên các sông suối nhỏ và sạt lở đất trên các sườn dốc tại khu vực miền Trung, đặc biệt là Đà Nẵng, Quảng Nam và Quảng Ngãi.',
  },
  {
    id: '2',
    tag: 'TIN TỨC',
    time: '11/10 08:07',
    title: 'THỜI TIẾT SÁNG NAY 11/10: Bắc Bộ nắng ráo trước đợt mưa mới...',
    snippet: '⛅ Dự báo thời tiết ngày 11/10 tại miền Bắc và...',
    imageUrl:
      'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=500&auto=format&fit=crop&q=80',
    content:
      'Khu vực Bắc Bộ duy trì thời tiết nắng ráo, se lạnh về đêm và sáng sớm trước khi đón đợt không khí lạnh tăng cường gây mưa rào rải rác. Các địa phương chủ động phương án phòng ngừa.',
  },
  {
    id: '3',
    tag: 'TIN TỨC',
    time: '09/10 16:13',
    title: 'CẢNH BÁO GIÓ MẠNH, SÓNG LỚN VÀ MƯA DÔNG TRÊN NHI...',
    snippet: 'Nguy cơ lốc xoáy, gió giật mạnh cấp 7-8, són...',
    imageUrl:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&auto=format&fit=crop&q=80',
    content:
      'Trên vùng biển từ Quảng Trị đến Cà Mau có gió đông bắc mạnh cấp 6, giật cấp 7-8, sóng biển cao từ 2-4m, biển động mạnh. Tàu thuyền hoạt động trên các vùng biển trên cần chú ý an toàn.',
  },
];

/**
 * Ánh xạ mã WMO Weather Code sang mô tả tiếng Việt và icon tương ứng trong assets/thoitiet
 */
function mapWmoToWeather(code: number, isDay: number) {
  // 0: Trời quang, không mây
  if (code === 0) {
    if (isDay === 1) {
      return {
        desc: 'Trời nắng ráo',
        icon: WEATHER_ICONS.nang,
      };
    } else {
      return {
        desc: 'Đêm không mây',
        icon: WEATHER_ICONS.dem,
      };
    }
  }

  // 1, 2, 3: Có mây, nhiều mây
  if (code <= 3) {
    if (isDay === 1) {
      return {
        desc: code === 3 ? 'Trời nhiều mây' : 'Có mây rải rác',
        icon: WEATHER_ICONS.comay,
      };
    } else {
      return {
        desc: 'Đêm nhiều mây',
        icon: WEATHER_ICONS.maydem,
      };
    }
  }

  // 45, 48: Sương mù
  if (code === 45 || code === 48) {
    return {
      desc: 'Sương mù',
      icon: isDay === 1 ? WEATHER_ICONS.comay : WEATHER_ICONS.maydem,
    };
  }

  // 51..67, 80..82: Mưa phùn, mưa rào, mưa vừa đến mưa to
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    let desc = 'Mưa rào nhẹ';
    if (code === 63 || code === 65 || code === 82) desc = 'Mưa to diện rộng';
    else if (code >= 51 && code <= 55) desc = 'Mưa phùn nhẹ';

    return {
      desc,
      icon: isDay === 1 ? WEATHER_ICONS.mua : WEATHER_ICONS.muadem,
    };
  }

  // 71..77, 85, 86: Tuyết
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return {
      desc: 'Tuyết rơi',
      icon: WEATHER_ICONS.tuyetroi,
    };
  }

  // 95, 96, 99: Dông sét, mưa bão
  if (code >= 95) {
    return {
      desc: 'Mưa dông sấm sét',
      icon: WEATHER_ICONS.muagiong,
    };
  }

  // Mặc định
  return {
    desc: isDay === 1 ? 'Thời tiết nắng ráo' : 'Trời đêm mát mẻ',
    icon: isDay === 1 ? WEATHER_ICONS.nang : WEATHER_ICONS.maydem,
  };
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onOpenSettings,
  onOpenNotifications,
  onNavigateToTab,
}) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { unreadCount: unreadNotifCount, refreshNotifications } = useNotifications();
  const [showSOSMap, setShowSOSMap] = useState(false);
  const [showHazardModal, setShowHazardModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatInitialSos, setChatInitialSos] = useState<any | null>(null);
  const [showSafetyCheckModal, setShowSafetyCheckModal] = useState(false);
  const [activeSafetyCheckId, setActiveSafetyCheckId] = useState<string | undefined>(undefined);
  const [activeSafetyCheck, setActiveSafetyCheck] = useState<SafetyCheckItem | null>(null);
  const [unrespondedSafetyCount, setUnrespondedSafetyCount] = useState<number>(0);
  const [myPrimaryResponse, setMyPrimaryResponse] = useState<any>(null);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);

  interface ConfirmModalState {
    visible: boolean;
    icon: React.ReactNode;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    confirmColor?: string;
    isSingleButton?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
  }

  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    visible: false,
    icon: null,
    title: '',
    message: '',
  });

  // Thông tin chính quyền / Ban chỉ huy địa phương gần nhất
  const [nearestAuthority, setNearestAuthority] = useState<{
    name: string;
    department: string;
    phone: string;
    areaName: string;
  } | null>(null);

  // Trạng thái Thời tiết thật từ API Open-Meteo & GPS
  const [weatherData, setWeatherData] = useState<WeatherState>(() => {
    const currentHour = new Date().getHours();
    const isDay = currentHour >= 6 && currentHour < 18 ? 1 : 0;
    return {
      city: 'Đà Nẵng',
      temp: '26°C',
      tempRange: '24° - 28°',
      desc: isDay === 1 ? 'Thời tiết nắng ráo' : 'Trời đêm mát mẻ',
      rainChance: 'Khả năng mưa 63%',
      icon: isDay === 1 ? WEATHER_ICONS.nang : WEATHER_ICONS.maydem,
      isDay,
    };
  });
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);

  // Danh sách tin tức thời tiết thật đã kích hoạt qua thông báo lấy từ CSDL (tối đa 3 bài)
  const [featuredNews, setFeaturedNews] = useState<NewsItem[]>([]);
  const [loadingNews, setLoadingNews] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Gọi API lấy tối đa 3 bài tin tức thời tiết thật từ MongoDB (chỉ lấy bài đã kích hoạt qua thông báo)
  const fetchFeaturedWeatherNews = useCallback(async () => {
    try {
      setLoadingNews(true);
      const res = await backendApi.getWeatherArticles({ limit: 3, status: 'activated' });
      if (res.success && Array.isArray(res.data)) {
        if (res.data.length > 0) {
          const mapped: NewsItem[] = res.data.slice(0, 3).map((article: any) => {
            const rawCat = article.category || article.weatherType || 'khac';
            const tag = WEATHER_CATEGORY_LABELS[rawCat] || 'THỜI TIẾT';
            const time = formatNewsCardDate(
              article.published_at || article.createdAt || article.created_at
            );
            const snippet =
              article.summary?.trim() ||
              (article.content ? article.content.trim().slice(0, 110) + '...' : '');
            const img = (article.imageUrl || article.image_url || '').trim();

            return {
              id: String(article._id || article.id),
              tag,
              time,
              title: article.title || '',
              snippet,
              imageUrl: img,
              content: article.content || article.summary || '',
              sourceUrl: article.source_url || article.articleUrl || '',
              sourceName: article.source_name || article.sourceName || '',
            };
          });
          setFeaturedNews(mapped);
        } else {
          setFeaturedNews([]);
        }
      }
    } catch (err) {
      console.warn('Lỗi khi tải tin tức thời tiết nổi bật từ CSDL:', err);
    } finally {
      setLoadingNews(false);
    }
  }, []);

  // Lấy đợt kiểm tra an toàn đang mở (ACTIVE) cho địa phương người dân
  const [unrespondedBloodCount, setUnrespondedBloodCount] = useState<number>(0);

  const fetchBloodDonationStatus = useCallback(async () => {
    try {
      const res = await bloodDonationApi.getMyStatus();
      if (res.success && res.data) {
        setUnrespondedBloodCount(res.data.unrespondedCount || 0);
      }
    } catch {
      // Ignored
    }
  }, []);

  const fetchActiveSafetyCheck = useCallback(async () => {
    try {
      const res = await safetyCheckApi.getActiveSafetyCheck();
      if (res.success && res.data) {
        setActiveSafetyCheck(res.data.activeCheck || null);
        setMyPrimaryResponse(res.data.myResponse || null);
        const checks = res.data.activeChecks || (res.data.activeCheck ? [res.data.activeCheck] : []);
        const respondedIds = new Set(
          (res.data.myResponses || (res.data.myResponse ? [res.data.myResponse] : [])).map((r: any) =>
            String(r.safetyCheckId)
          )
        );
        const unresponded = checks.filter((c) => !respondedIds.has(String(c._id))).length;
        setUnrespondedSafetyCount(unresponded);
      }
    } catch {
      // Ignored
    }
  }, []);

  // Lắng nghe sự kiện mở hoặc cập nhật kiểm tra an toàn
  useEffect(() => {
    const subOpen = DeviceEventEmitter.addListener('open:safety_check', (data: any) => {
      const targetId = data?.safetyCheckId || data?._id;
      if (targetId) {
        setActiveSafetyCheckId(targetId);
      }
      setShowSafetyCheckModal(true);
      fetchActiveSafetyCheck();
    });
    const subUpdate = DeviceEventEmitter.addListener('safety_check:updated', () => {
      fetchActiveSafetyCheck();
    });
    const subBloodUpdate = DeviceEventEmitter.addListener('blood_donation:updated', () => {
      fetchBloodDonationStatus();
    });
    const subChatOpen = DeviceEventEmitter.addListener('open:local_authority_chat', (data) => {
      if (data && (data._id || data.sosId || data.sosCode)) {
        setChatInitialSos(data);
      }
      setShowChatModal(true);
    });
    void fetchBloodDonationStatus();
    return () => {
      subOpen.remove();
      subUpdate.remove();
      subBloodUpdate.remove();
      subChatOpen.remove();
    };
  }, [fetchActiveSafetyCheck, fetchBloodDonationStatus]);

  // Lấy thông tin Ban chỉ huy / UBND địa phương theo ĐỊA CHỈ của customer
  const fetchNearestAuthority = useCallback(async (fallbackCity?: string) => {
    try {
      let queryArea = '';
      let queryWard = '';
      let queryProvince = '';
      let queryLat: number | undefined = undefined;
      let queryLng: number | undefined = undefined;

      // 1. ƯU TIÊN SỐ 1 TUYỆT ĐỐI: Dựa theo ĐỊA CHỈ của Customer (user.address)
      if (user?.address && user.address.trim()) {
        const fullAddr = user.address.trim();
        queryArea = fullAddr;
        const parts = fullAddr.split(',').map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 3) {
          queryProvince = parts[parts.length - 1];
          queryWard = parts[parts.length - 2];
        } else if (parts.length === 2) {
          queryProvince = parts[1];
          queryWard = parts[0];
        } else {
          queryProvince = fullAddr;
        }

        // Tự động geocode toạ độ địa chỉ của Customer
        try {
          const geoRes = await Location.geocodeAsync(fullAddr);
          if (geoRes && geoRes.length > 0) {
            queryLat = geoRes[0].latitude;
            queryLng = geoRes[0].longitude;
          }
        } catch {}
      } else {
        // 2. CHỈ KHI CUSTOMER CHƯA CÓ ĐỊA CHỈ TRONG HỒ SƠ: Mới fallback sang GPS thiết bị
        queryArea = fallbackCity || '';
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            queryLat = loc.coords.latitude;
            queryLng = loc.coords.longitude;
            const geoList = await Location.reverseGeocodeAsync({ latitude: queryLat, longitude: queryLng });
            if (geoList && geoList.length > 0) {
              const geo = geoList[0];
              queryProvince = geo.region || geo.city || '';
              queryWard = geo.district || geo.subregion || geo.street || geo.name || '';
              queryArea = [queryWard, queryProvince].filter(Boolean).join(', ');
            }
          }
        } catch {}
      }

      if (!queryArea) {
        queryArea = 'Khu vực của bạn';
      }

      const res = await backendApi.getLocalAuthority({
        areaName: queryArea !== 'Khu vực của bạn' ? queryArea : undefined,
        province: queryProvince || undefined,
        ward: queryWard || undefined,
        lat: queryLat,
        lng: queryLng,
        userId: user?._id,
      });

      if (res.success && res.data?.authority) {
        setNearestAuthority({
          name: res.data.authority.name || 'Cán bộ trực ban',
          department: res.data.authority.department || `UBND ${res.data.areaName || queryArea || 'Địa phương'}`,
          phone: res.data.authority.phone || '',
          areaName: res.data.areaName || queryArea || 'Địa chỉ của bạn',
        });
      }
    } catch (err) {
      console.log('[HomeScreen] Lỗi lấy thông tin chính quyền theo địa chỉ customer:', err);
    }
  }, [user?._id, user?.address]);

  // Tự động lấy tọa độ thực tế và gọi API thời tiết thật
  const fetchRealWeather = useCallback(async () => {
    try {
      setIsWeatherLoading(true);

      let lat = 16.0544; // Tọa độ mặc định: Đà Nẵng
      let lon = 108.2022;
      let detectedCity = 'Đà Nẵng';

      // 1. Lấy vị trí GPS của người dùng
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = loc.coords.latitude;
        lon = loc.coords.longitude;
        // Lưu GPS foreground mới nhất
        void backendApi.updateCurrentLocation(lat, lon);

        // Dịch ngược tọa độ GPS thành tên Tỉnh / Thành phố
        const geoList = await Location.reverseGeocodeAsync({
          latitude: lat,
          longitude: lon,
        });
        if (geoList && geoList.length > 0) {
          const place = geoList[0];
          detectedCity =
            place.city ||
            place.subregion ||
            place.region ||
            place.district ||
            'Vị trí hiện tại';
        }
      }

      // 2. Gọi Open-Meteo API lấy dữ liệu thời tiết thời gian thực
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,is_day,precipitation,weather_code&hourly=precipitation_probability&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`
      );
      const json = await res.json();

      if (json && json.current) {
        const code = json.current.weather_code ?? 0;
        const currentHour = new Date().getHours();
        const isDay = json.current.is_day ?? (currentHour >= 6 && currentHour < 18 ? 1 : 0);
        const weatherInfo = mapWmoToWeather(code, isDay);

        const curTemp = Math.round(json.current.temperature_2m);
        const minTemp = json.daily?.temperature_2m_min?.[0]
          ? Math.round(json.daily.temperature_2m_min[0])
          : curTemp - 2;
        const maxTemp = json.daily?.temperature_2m_max?.[0]
          ? Math.round(json.daily.temperature_2m_max[0])
          : curTemp + 2;

        const rainProb =
          json.hourly?.precipitation_probability?.[currentHour] ??
          json.daily?.precipitation_probability_max?.[0] ??
          Math.min(100, Math.round((json.current.precipitation || 0) * 20));

        setWeatherData({
          city: detectedCity,
          temp: `${curTemp}°C`,
          tempRange: `${minTemp}° - ${maxTemp}°`,
          desc: weatherInfo.desc,
          rainChance: `Khả năng mưa ${rainProb}%`,
          icon: weatherInfo.icon,
          isDay,
        });

        // Chỉ khi customer chưa lưu địa chỉ trong hồ sơ, mới cập nhật chính quyền theo GPS hiện tại
        if (!user?.address || !user.address.trim()) {
          void fetchNearestAuthority(detectedCity);
        }
      }
    } catch (err) {
      console.log('Lỗi khi cập nhật thời tiết thực:', err);
    } finally {
      setIsWeatherLoading(false);
    }
  }, [fetchNearestAuthority, user?.address]);

  // Gọi khẩn cấp đến chính quyền địa phương theo địa chỉ customer: Mở trực tiếp màn hình quay số điện thoại
  const handleCallLocalAuthority = () => {
    const hotline = nearestAuthority?.phone;
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

  // Nạp thời tiết, tin tức, đợt kiểm tra an toàn và chính quyền địa phương thực tế khi vào màn hình
  useEffect(() => {
    void fetchRealWeather();
    void fetchFeaturedWeatherNews();
    void fetchActiveSafetyCheck();
    void fetchNearestAuthority();
  }, [fetchRealWeather, fetchFeaturedWeatherNews, fetchActiveSafetyCheck, fetchNearestAuthority]);

  // Kéo xuống để làm mới (Pull-to-refresh)
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      fetchRealWeather(),
      fetchFeaturedWeatherNews(),
      fetchActiveSafetyCheck(),
      fetchBloodDonationStatus(),
      fetchNearestAuthority(),
      refreshNotifications(),
    ]);
    setRefreshing(false);
  }, [fetchRealWeather, fetchFeaturedWeatherNews, fetchActiveSafetyCheck, fetchBloodDonationStatus, fetchNearestAuthority, refreshNotifications]);

  // Cập nhật GPS khi người dùng quay lại app; không bật theo dõi vị trí nền.
  useEffect(() => {
    const syncCurrentLocation = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await backendApi.updateCurrentLocation(
          position.coords.latitude,
          position.coords.longitude
        );
      } catch {
        // Vị trí không bắt buộc để dùng ứng dụng; lần mở app tiếp theo sẽ thử lại.
      }
    };

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncCurrentLocation();
    });
    return () => subscription.remove();
  }, []);

  // Xử lý các nút bấm trong phần Tiện ích nhanh
  const handleUtilityPress = (id: string) => {
    switch (id) {
      case 'map_sos':
        // Bản đồ cần cứu trợ
        setShowSOSMap(true);
        break;

      case 'map_support':
        // Bản đồ điểm hỗ trợ
        if (onNavigateToTab) {
          onNavigateToTab('map', { filter: 'RELIEF' });
        } else {
          setShowSOSMap(true);
        }
        break;

      case 'map_hazard':
        // Bản đồ nơi nguy hiểm: Nhảy đến map và tự động filter ra các điểm nguy hiểm
        if (onNavigateToTab) {
          onNavigateToTab('map', { filter: 'HAZARD' });
        } else {
          setShowSOSMap(true);
        }
        break;

      case 'mark_safe':
        // Mở trực tiếp màn hình Kiểm tra & Báo an toàn
        DeviceEventEmitter.emit('open:safety_check', activeSafetyCheck || {});
        break;

      case 'blood_donation':
        // Mở trực tiếp tiện ích Đăng ký hiến máu & Sự kiện hiến máu
        DeviceEventEmitter.emit('open:blood_donation', {});
        break;

      case 'post_hazard':
        // Đăng cảnh báo / Đóng góp điểm nguy hiểm (PENDING chờ Authority duyệt)
        setShowHazardModal(true);
        break;

      case 'chat_admin':
      case 'chat_local_authority':
        // Chat trực tiếp với chính quyền địa phương qua Socket.IO
        setShowChatModal(true);
        break;

      case 'post_news': {
        // Đăng tin cảnh báo (Admin / Cán bộ)
        const isAuthority =
          user?.roles?.includes('ADMIN') ||
          user?.roles?.includes('LOCAL_AUTHORITY') ||
          user?.roles?.includes('RESCUER');
        if (isAuthority) {
          setConfirmModal({
            visible: true,
            isSingleButton: false,
            icon: (
              <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="bullhorn" size={30} color="#0284C7" />
              </View>
            ),
            title: 'Đăng tin cảnh báo (Ban chỉ huy)',
            message: `Bạn đang đăng nhập với quyền hạn ${user?.roles?.[0] || 'AUTHORITY'}. Bạn có thể gửi thông báo khẩn hoặc báo điểm nguy hiểm đến người dân.`,
            confirmText: 'Báo điểm nguy hiểm',
            cancelText: 'Đóng',
            confirmColor: '#0284C7',
            onConfirm: () => {
              setShowHazardModal(true);
            },
          });
        } else {
          setConfirmModal({
            visible: true,
            isSingleButton: false,
            icon: (
              <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="information-circle" size={34} color="#D97706" />
              </View>
            ),
            title: 'Quyền hạn phát tin',
            message: 'Chức năng phát thanh tin tức chính thức dành cho Cán bộ địa phương (LOCAL_AUTHORITY) và Ban chỉ huy. Người dân có thể dùng nút "Báo điểm nguy hiểm" để gửi tin tức chờ duyệt.',
            confirmText: 'Báo điểm nguy hiểm',
            cancelText: 'Đóng',
            confirmColor: '#D97706',
            onConfirm: () => {
              setShowHazardModal(true);
            },
          });
        }
        break;
      }

      default:
        break;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent={true} {...({ backgroundColor: 'transparent' } as any)} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#0066FF']}
            tintColor="#0066FF"
          />
        }
      >
        {/* ==================== 1. HEADER SECTION ==================== */}
        <View style={styles.headerContainer}>
          <ImageBackground
            source={BACKGROUND_APP_SOURCE}
            style={styles.headerBackground}
            resizeMode="cover"
          >
            <LinearGradient
              colors={['rgba(15, 23, 42, 0.4)', 'rgba(15, 23, 42, 0.78)', 'rgba(15, 23, 42, 0.95)']}
              style={[
                styles.headerGradient,
                { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 36 : 20) },
              ]}
            >
              {/* Thanh điều khiển trên cùng: Gọi khẩn cấp địa phương + Thông báo + Cài đặt */}
              <View style={styles.topBar}>
                <View style={styles.topBarRight}>
                  {/* Nút Gọi Cứu Hộ / Chính Quyền Địa Phương Khẩn Cấp (Nằm ngay cạnh chuông thông báo) */}
                  <TouchableOpacity
                    style={[styles.circleIconButton, styles.phoneCallButton]}
                    onPress={handleCallLocalAuthority}
                    activeOpacity={0.75}
                    accessibilityLabel="Gọi khẩn cấp chính quyền địa phương"
                  >
                    <Ionicons name="call" size={17} color="#22C55E" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.circleIconButton}
                    onPress={() => (onOpenNotifications ? onOpenNotifications() : onNavigateToTab?.('news'))}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
                    {unreadNotifCount > 0 && (
                      <View style={styles.bellBadge}>
                        <Text style={styles.bellBadgeText}>
                          {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Logo & Tiêu đề: HỖ TRỢ CỨU NẠN */}
              <View style={styles.brandRow}>
                <View style={styles.logoBadge}>
                  <LogoSOS style={styles.logoImage} resizeMode="contain" />
                </View>

                <View style={styles.brandTextColumn}>
                  <Text style={styles.brandTitle}>HỖ TRỢ CỨU NẠN</Text>
                  <Text style={styles.brandSubtitle}>
                    Không ai phải đối mặt với thiên tai một mình
                  </Text>
                </View>
              </View>

              {/* Thẻ Thời Tiết Glassmorphic (Cập nhật trực tiếp từ API thời tiết thật) */}
              <TouchableOpacity
                style={styles.weatherCard}
                activeOpacity={0.9}
                onPress={() => {
                  setConfirmModal({
                    visible: true,
                    isSingleButton: true,
                    icon: (
                      <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="partly-sunny" size={32} color="#0284C7" />
                      </View>
                    ),
                    title: `Thời tiết tại ${weatherData.city}`,
                    message: `Nhiệt độ hiện tại: ${weatherData.temp} (Biên độ ${weatherData.tempRange})\n\nTình trạng: ${weatherData.desc}\nKhả năng mưa: ${weatherData.rainChance}\n\nNguồn trích xuất: Cảm biến Khí tượng & Vệ tinh Open-Meteo cập nhật thời gian thực.`,
                    confirmText: 'Đã hiểu',
                    confirmColor: '#0284C7',
                  });
                }}
              >
                <View style={styles.weatherLeft}>
                  {/* Icon thời tiết tương ứng từ folder assets/thoitiet đã xóa nền */}
                  <Image
                    source={weatherData.icon}
                    style={styles.weatherIconImage}
                    resizeMode="contain"
                  />

                  <View style={styles.weatherInfo}>
                    <View style={styles.weatherLocationRow}>
                      <BootstrapGeoAltFill size={15} color="#38BDF8" />
                      <Text style={styles.weatherCity}>{weatherData.city}</Text>
                    </View>
                    <Text style={styles.weatherDesc}>{weatherData.desc}</Text>
                    <Text style={styles.weatherRainChance}>{weatherData.rainChance}</Text>
                  </View>
                </View>

                <View style={styles.weatherRight}>
                  {isWeatherLoading ? (
                    <ActivityIndicator size="small" color="#93C5FD" />
                  ) : (
                    <>
                      <Text style={styles.weatherTemp}>{weatherData.temp}</Text>
                      <Text style={styles.weatherTempRange}>{weatherData.tempRange}</Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            </LinearGradient>
          </ImageBackground>
        </View>

        {/* ==================== 2. NỘI DUNG CHÍNH (NỀN TRẮNG) ==================== */}
        <View style={styles.bodyContainer}>
          {/* Banner Đợt Kiểm Tra An Toàn Đang Hoạt Động */}
          {activeSafetyCheck && (
            <TouchableOpacity
              style={styles.safetyCheckBanner}
              activeOpacity={0.85}
              onPress={() => {
                DeviceEventEmitter.emit('open:safety_check', activeSafetyCheck);
              }}
            >
              <View style={styles.safetyCheckBannerPulse}>
                <Ionicons name="shield-checkmark" size={22} color="#16A34A" />
              </View>
              <View style={styles.safetyCheckBannerInfo}>
                <View style={styles.safetyCheckBadgeRow}>
                  <View style={styles.safetyCheckAlertBadge}>
                    <Text style={styles.safetyCheckAlertText}>XÁC NHẬN AN TOÀN</Text>
                  </View>
                  <View style={styles.safetyCheckScopeBadge}>
                    <Text style={styles.safetyCheckScopeText} numberOfLines={1}>
                      {activeSafetyCheck.areaId?.name || activeSafetyCheck.areaName || 'Toàn khu vực'}
                    </Text>
                  </View>
                  {unrespondedSafetyCount > 0 ? (
                    <View style={styles.safetyCheckPendingBadge}>
                      <Text style={styles.safetyCheckPendingText}>
                        {unrespondedSafetyCount} chưa báo
                      </Text>
                    </View>
                  ) : myPrimaryResponse ? (
                    <View style={styles.safetyCheckDoneBadge}>
                      <Text style={styles.safetyCheckDoneText}>Đã xác nhận</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.safetyCheckBannerTitle} numberOfLines={1}>
                  {activeSafetyCheck.title}
                </Text>
              </View>
              <View style={styles.safetyCheckBannerArrow}>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </View>
            </TouchableOpacity>
          )}
          {/* Section: Tin nổi bật */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Tin nổi bật</Text>
            <TouchableOpacity
              onPress={() => onNavigateToTab?.('news')}
              activeOpacity={0.7}
              style={styles.seeAllButton}
            >
              <Text style={styles.seeAllText}>Xem tất cả</Text>
              <Ionicons name="chevron-forward" size={15} color="#0066FF" />
            </TouchableOpacity>
          </View>

          {/* Danh sách tối đa 3 tin tức thời tiết nổi bật từ CSDL */}
          <View style={styles.newsList}>
            {featuredNews.length > 0 ? (
              featuredNews.slice(0, 3).map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.newsCard}
                  onPress={() => setSelectedNews(item)}
                  activeOpacity={0.75}
                >
                  <NewsThumbnailImage imageUrl={item.imageUrl} tag={item.tag} />

                  <View style={styles.newsContent}>
                    <View style={styles.newsMetaRow}>
                      <View style={styles.newsTagBadge}>
                        <Text style={styles.newsTagText}>{item.tag}</Text>
                      </View>
                      <Text style={styles.newsTimeText}>{item.time}</Text>
                    </View>

                    <Text style={styles.newsTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.newsSnippet} numberOfLines={1}>
                      {item.snippet}
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color="#94A3B8"
                    style={styles.newsChevron}
                  />
                </TouchableOpacity>
              ))
            ) : loadingNews ? (
              <View style={styles.newsEmptyCard}>
                <ActivityIndicator size="small" color="#0066FF" />
                <Text style={styles.newsEmptyText}>Đang tải bản tin thời tiết...</Text>
              </View>
            ) : (
              <View style={styles.newsEmptyCard}>
                <Ionicons name="newspaper-outline" size={26} color="#94A3B8" />
                <Text style={styles.newsEmptyText}>
                  Chưa có bản tin thời tiết nào được kích hoạt qua thông báo
                </Text>
              </View>
            )}
          </View>

          {/* Section: Tiện ích nhanh */}
          <Text style={[styles.sectionTitle, styles.utilitiesTitle]}>Tiện ích nhanh</Text>

          <View style={styles.utilitiesGrid}>
            {/* Hàng 1 */}
            <View style={styles.utilitiesRow}>
              {/* 1. Điểm cần cứu trợ */}
              <TouchableOpacity
                style={styles.utilityItem}
                onPress={() => handleUtilityPress('map_sos')}
                activeOpacity={0.7}
              >
                <View style={styles.utilityIconBoxStandalone}>
                  <Image
                    source={require('../../../assets/appicon/bandocuutro.png')}
                    style={styles.utilityImage}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.utilityLabel}>Điểm{'\n'}cứu trợ</Text>
              </TouchableOpacity>

              {/* 2. Điểm hỗ trợ */}
              <TouchableOpacity
                style={styles.utilityItem}
                onPress={() => handleUtilityPress('map_support')}
                activeOpacity={0.7}
              >
                <View style={styles.utilityIconBoxStandalone}>
                  <Image
                    source={require('../../../assets/appicon/bandodiemcuutro.png')}
                    style={styles.utilityImage}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.utilityLabel}>Điểm{'\n'}hỗ trợ</Text>
              </TouchableOpacity>

              {/* 3. Điểm nguy hiểm */}
              <TouchableOpacity
                style={styles.utilityItem}
                onPress={() => handleUtilityPress('map_hazard')}
                activeOpacity={0.7}
              >
                <View style={styles.utilityIconBoxStandalone}>
                  <Image
                    source={require('../../../assets/appicon/bandodiemnguyhiem.png')}
                    style={styles.utilityImage}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.utilityLabel}>Điểm{'\n'}nguy hiểm</Text>
              </TouchableOpacity>

              {/* 4. Báo an toàn */}
              <TouchableOpacity
                style={styles.utilityItem}
                onPress={() => handleUtilityPress('mark_safe')}
                activeOpacity={0.7}
              >
                <View style={styles.utilityIconBoxStandalone}>
                  <Image
                    source={require('../../../assets/appicon/danhdauantoan.png')}
                    style={styles.utilityImage}
                    resizeMode="contain"
                  />
                  {unrespondedSafetyCount > 0 && (
                    <View style={styles.utilityBadge}>
                      <Text style={styles.utilityBadgeText}>
                        {unrespondedSafetyCount > 9 ? '9+' : unrespondedSafetyCount}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.utilityLabel}>Báo{'\n'}an toàn</Text>
              </TouchableOpacity>
            </View>

            {/* Hàng 2 */}
            <View style={styles.utilitiesRow}>
              {/* 5. Đăng ký hiến máu */}
              <TouchableOpacity
                style={styles.utilityItem}
                onPress={() => handleUtilityPress('blood_donation')}
                activeOpacity={0.7}
              >
                <View style={styles.utilityIconBoxStandalone}>
                  <Image
                    source={require('../../../assets/appicon/dangkihienmau.png')}
                    style={styles.utilityImage}
                    resizeMode="contain"
                  />
                  {unrespondedBloodCount > 0 && (
                    <View style={styles.utilityBadge}>
                      <Text style={styles.utilityBadgeText}>
                        {unrespondedBloodCount > 9 ? '9+' : unrespondedBloodCount}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.utilityLabel}>Đăng ký{'\n'}hiến máu</Text>
              </TouchableOpacity>

              {/* 6. Báo điểm nguy hiểm */}
              <TouchableOpacity
                style={styles.utilityItem}
                onPress={() => handleUtilityPress('post_hazard')}
                activeOpacity={0.7}
              >
                <View style={styles.utilityIconBoxStandalone}>
                  <Image
                    source={require('../../../assets/appicon/donggopdiemnguyhiem.png')}
                    style={styles.utilityImage}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.utilityLabel}>Báo điểm{'\n'}nguy hiểm</Text>
              </TouchableOpacity>

              {/* 7. Nhắn tin địa phương */}
              <TouchableOpacity
                style={styles.utilityItem}
                onPress={() => handleUtilityPress('chat_local_authority')}
                activeOpacity={0.7}
              >
                <View style={styles.utilityIconBoxStandalone}>
                  <Image
                    source={require('../../../assets/appicon/message.png')}
                    style={styles.utilityImage}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.utilityLabel}>Nhắn tin{'\n'}địa phương</Text>
              </TouchableOpacity>

              {/* Khoảng trống căn thẳng cột với hàng trên */}
              <View style={styles.utilityItem} />
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Modal hiển thị Bản đồ Cứu nạn SOS */}
      <Modal visible={showSOSMap} animationType="slide" onRequestClose={() => setShowSOSMap(false)}>
        <SOSMapScreen onClose={() => setShowSOSMap(false)} />
      </Modal>

      {/* Modal Đóng góp điểm nguy hiểm (PENDING chờ Authority duyệt) */}
      <ContributeHazardModal
        visible={showHazardModal}
        onClose={() => setShowHazardModal(false)}
      />

      {/* Modal Đọc chi tiết bài viết tin tức */}
      <Modal
        visible={!!selectedNews}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedNews(null)}
      >
        <View style={styles.newsModalOverlay}>
          <View style={styles.newsModalContent}>
            {selectedNews && (
              <>
                {selectedNews.imageUrl ? (
                  <Image
                    source={{ uri: selectedNews.imageUrl }}
                    style={styles.newsModalImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.newsModalImageFallback}>
                    <Ionicons name="newspaper-outline" size={44} color="#0066FF" />
                  </View>
                )}
                <View style={styles.newsModalBody}>
                  <View style={styles.newsMetaRow}>
                    <View style={styles.newsTagBadge}>
                      <Text style={styles.newsTagText}>{selectedNews.tag}</Text>
                    </View>
                    <Text style={styles.newsTimeText}>{selectedNews.time}</Text>
                  </View>
                  <Text style={styles.newsModalTitle}>{selectedNews.title}</Text>
                  <ScrollView style={styles.newsModalScroll}>
                    <Text style={styles.newsModalParagraph}>
                      {selectedNews.content || selectedNews.snippet}
                    </Text>
                  </ScrollView>
                  {selectedNews.sourceUrl ? (
                    <TouchableOpacity
                      style={styles.newsModalSourceBtn}
                      onPress={() => {
                        if (selectedNews.sourceUrl) {
                          Linking.openURL(selectedNews.sourceUrl).catch(() => { });
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="open-outline" size={15} color="#0066FF" />
                      <Text style={styles.newsModalSourceText}>
                        Đọc bài gốc trên {selectedNews.sourceName || 'nguồn tin'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.newsModalCloseBtn}
                    onPress={() => setSelectedNews(null)}
                  >
                    <Text style={styles.newsModalCloseText}>Đóng bài viết</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal Chat trực tuyến thời gian thực với Ban chỉ huy địa phương */}
      <LocalAuthorityChatModal
        visible={showChatModal}
        onClose={() => {
          setShowChatModal(false);
          setChatInitialSos(null);
        }}
        initialSosData={chatInitialSos}
      />

      {/* Modal Xác nhận Tùy chỉnh (Thay thế hoàn toàn Alert.alert) */}
      <Modal
        visible={confirmModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (confirmModal.onCancel) confirmModal.onCancel();
          setConfirmModal((prev) => ({ ...prev, visible: false }));
        }}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            {confirmModal.icon && (
              <View style={styles.confirmModalIconContainer}>
                {confirmModal.icon}
              </View>
            )}
            <Text style={styles.confirmModalTitle}>{confirmModal.title}</Text>
            <Text style={styles.confirmModalMessage}>{confirmModal.message}</Text>

            <View style={styles.confirmModalActionRow}>
              {!confirmModal.isSingleButton && (
                <TouchableOpacity
                  style={styles.confirmModalBtnCancel}
                  onPress={() => {
                    if (confirmModal.onCancel) confirmModal.onCancel();
                    setConfirmModal((prev) => ({ ...prev, visible: false }));
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.confirmModalBtnCancelText}>
                    {confirmModal.cancelText || 'Hủy bỏ'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.confirmModalBtnConfirm,
                  confirmModal.confirmColor
                    ? { backgroundColor: confirmModal.confirmColor }
                    : null,
                  confirmModal.isSingleButton ? { flex: 1 } : null,
                ]}
                onPress={() => {
                  const onConf = confirmModal.onConfirm;
                  setConfirmModal((prev) => ({ ...prev, visible: false }));
                  if (onConf) onConf();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmModalBtnConfirmText}>
                  {confirmModal.confirmText || 'Xác nhận'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },

  // ==================== HEADER ====================
  headerContainer: {
    width: '100%',
    overflow: 'hidden',
  },
  headerBackground: {
    width: '100%',
  },
  headerGradient: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 8,
  },
  topBarRight: {
    flexDirection: 'row',
    gap: 8,
  },
  circleIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    position: 'relative',
  },
  phoneCallButton: {
    backgroundColor: 'rgba(34, 197, 94, 0.22)',
    borderColor: 'rgba(34, 197, 94, 0.45)',
  },
  bellBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#EF4444',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#0F172A',
  },
  bellBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#10B981',
    overflow: 'hidden',
  },
  logoImage: {
    width: 36,
    height: 36,
  },
  brandTextColumn: {
    flex: 1,
  },
  brandTitle: {
    fontSize: 18.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 11.5,
    color: '#E2E8F0',
    marginTop: 1,
    fontWeight: '400',
  },

  // ==================== WEATHER CARD ====================
  weatherCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  weatherLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  weatherIconImage: {
    width: 36,
    height: 36,
  },
  weatherInfo: {
    flex: 1,
  },
  weatherLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weatherCity: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  weatherDesc: {
    fontSize: 11.5,
    color: '#F1F5F9',
    marginTop: 1,
    fontWeight: '500',
  },
  weatherRainChance: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 1,
  },
  weatherRight: {
    alignItems: 'flex-end',
    minWidth: 64,
  },
  weatherTemp: {
    fontSize: 23,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 26,
  },
  weatherTempRange: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 1,
    textAlign: 'right',
  },

  // ==================== BODY SECTION ====================
  bodyContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
  },
  seeAllText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0066FF',
  },

  // ==================== NEWS LIST ====================
  newsList: {
    gap: 10,
    marginBottom: 20,
  },
  newsCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  newsThumbnail: {
    width: 86,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  newsThumbnailPlaceholder: {
    width: 86,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 4,
  },
  newsThumbnailPlaceholderText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0284C7',
    marginTop: 2,
    textAlign: 'center',
  },
  newsThumbnailAlertBg: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  newsThumbnailAlertText: {
    color: '#DC2626',
  },
  newsContent: {
    flex: 1,
  },
  newsMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  newsTagBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  newsTagText: {
    color: '#0284C7',
    fontSize: 10.5,
    fontWeight: '700',
  },
  newsTimeText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '500',
  },
  newsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F2942',
    lineHeight: 18,
  },
  newsSnippet: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  newsChevron: {
    marginLeft: 2,
  },
  newsEmptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  newsEmptyText: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 18,
  },

  // ==================== TIỆN ÍCH NHANH ====================
  utilitiesTitle: {
    marginBottom: 16,
  },
  utilitiesGrid: {
    gap: 16,
  },
  utilitiesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  utilityItem: {
    width: '23.5%',
    alignItems: 'center',
  },
  utilityIconBox: {
    width: 60,
    height: 60,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  utilityIconBoxStandalone: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  utilityImage: {
    width: 70,
    height: 70,
  },
  utilityLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 14,
  },

  // ==================== NEWS MODAL ====================
  newsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  newsModalContent: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
  },
  newsModalImage: {
    width: '100%',
    height: 180,
    backgroundColor: '#E2E8F0',
  },
  newsModalBody: {
    padding: 18,
  },
  newsModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginVertical: 10,
    lineHeight: 22,
  },
  newsModalScroll: {
    maxHeight: 180,
    marginBottom: 16,
  },
  newsModalParagraph: {
    fontSize: 13.5,
    color: '#334155',
    lineHeight: 20,
  },
  newsModalImageFallback: {
    width: '100%',
    height: 120,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsModalSourceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  newsModalSourceText: {
    color: '#0066FF',
    fontSize: 13,
    fontWeight: '700',
  },
  newsModalCloseBtn: {
    backgroundColor: '#0066FF',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  newsModalCloseText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // ==================== MODAL XÁC NHẬN (THAY THẾ ALERT) ====================
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  confirmModalIconContainer: {
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 10,
  },
  confirmModalMessage: {
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 24,
  },
  confirmModalActionRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  confirmModalBtnCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmModalBtnCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  confirmModalBtnConfirm: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  confirmModalBtnConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ==================== BANNER KIỂM TRA AN TOÀN (TRẮNG - ICON XANH) ====================
  safetyCheckBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  safetyCheckBannerPulse: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  safetyCheckBannerInfo: {
    flex: 1,
  },
  safetyCheckBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  safetyCheckAlertBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  safetyCheckAlertText: {
    color: '#15803D',
    fontSize: 10,
    fontWeight: '800',
  },
  safetyCheckScopeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 140,
  },
  safetyCheckScopeText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '600',
  },
  safetyCheckPendingBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  safetyCheckPendingText: {
    color: '#DC2626',
    fontSize: 10,
    fontWeight: '700',
  },
  safetyCheckDoneBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  safetyCheckDoneText: {
    color: '#16A34A',
    fontSize: 10,
    fontWeight: '700',
  },
  safetyCheckBannerTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  safetyCheckBannerArrow: {
    marginLeft: 8,
  },
  utilityBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    zIndex: 10,
  },
  utilityBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
});
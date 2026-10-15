import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Platform,
  Alert,
  Modal,
  Image,
  ImageBackground,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import { LogoSOS } from '../components/LogoSOS';
import { BACKGROUND_APP_SOURCE } from '../constants/backgroundBase64';
import { SOSMapScreen } from './SOSMapScreen';
import { ContributeHazardModal } from './ContributeHazardModal';
import { TabName } from '../components/BottomNav';
import { backendApi } from '../services/backendApi';

export interface HomeScreenProps {
  onOpenSettings: () => void;
  onNavigateToTab?: (tab: TabName, options?: { filter?: 'ALL' | 'HAZARD' | 'SAFE' | 'RELIEF'; areaId?: string }) => void;
}

interface NewsItem {
  id: string;
  tag: string;
  time: string;
  title: string;
  snippet: string;
  imageUrl: string;
  content?: string;
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
  comay: require('../../assets/thoitiet/comay.png'),
  maydem: require('../../assets/thoitiet/maydem.png'),
  dem: require('../../assets/thoitiet/dem.png'),
  mua: require('../../assets/thoitiet/mua.png'),
  muadem: require('../../assets/thoitiet/muadem.png'),
  muagiong: require('../../assets/thoitiet/muagiong.png'),
  nang: require('../../assets/thoitiet/nang.png'),
  tuyetroi: require('../../assets/thoitiet/tuyetroi.png'),
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
  onNavigateToTab,
}) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [showSOSMap, setShowSOSMap] = useState(false);
  const [showHazardModal, setShowHazardModal] = useState(false);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);

  // Lấy số lượng thông báo chưa đọc từ máy chủ
  useEffect(() => {
    let isMounted = true;
    const fetchUnread = async () => {
      try {
        const res = await backendApi.getNotifications({ isRead: false });
        if (isMounted && res.success && Array.isArray(res.data)) {
          setUnreadNotifCount(res.data.length);
        }
      } catch {
        // Ignored
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

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

  // Tự động lấy tọa độ thực tế và gọi API thời tiết thật
  useEffect(() => {
    let isMounted = true;

    const fetchRealWeather = async () => {
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

        // 2. Gọi Open-Meteo API lấy dữ liệu thời tiết thời gian thực (bao gồm cả dự báo theo giờ và ngày)
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,is_day,precipitation,weather_code&hourly=precipitation_probability&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`
        );
        const json = await res.json();

        if (isMounted && json && json.current) {
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

          // Lấy khả năng mưa theo đúng giờ hiện tại thay vì lấy số cực đại cả ngày
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
        }
      } catch (err) {
        console.log('Lỗi khi cập nhật thời tiết thực:', err);
      } finally {
        if (isMounted) setIsWeatherLoading(false);
      }
    };

    fetchRealWeather();

    return () => {
      isMounted = false;
    };
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
        // Đánh dấu an toàn
        Alert.alert(
          'Đánh dấu an toàn (I’m Safe)',
          'Bạn muốn gửi trạng thái AN TOÀN của mình đến lực lượng cứu hộ và người thân?',
          [
            { text: 'Hủy', style: 'cancel' },
            {
              text: 'Xác nhận an toàn',
              onPress: () => {
                Alert.alert(
                  'Thành công',
                  'Đã cập nhật trạng thái AN TOÀN cho tài khoản ' +
                    (user?.fullName || 'Người dùng') +
                    '. Đội cứu trợ đã ghi nhận vị trí an toàn của bạn!'
                );
              },
            },
          ]
        );
        break;

      case 'blood_donation':
        // Đăng ký hiến máu
        Alert.alert(
          'Đăng ký hiến máu khẩn cấp',
          'Chương trình kết nối nguồn máu tiếp viện cho các bệnh viện vùng thiên tai bão lũ. Bạn có muốn đăng ký tham gia đội ngũ hiến máu tình nguyện?',
          [
            { text: 'Để sau', style: 'cancel' },
            {
              text: 'Đăng ký ngay',
              onPress: () => {
                Alert.alert(
                  'Đã ghi nhận',
                  'Cảm ơn tấm lòng của bạn! Đội ngũ y tế SOS sẽ liên hệ qua số điện thoại ' +
                    (user?.phone || 'của bạn') +
                    ' khi có đợt tiếp nhận máu phù hợp.'
                );
              },
            },
          ]
        );
        break;

      case 'post_hazard':
        // Đăng cảnh báo / Đóng góp điểm nguy hiểm (PENDING chờ Authority duyệt)
        setShowHazardModal(true);
        break;

      case 'chat_admin':
        // Chat với Admin / Trực ban cứu trợ
        Alert.alert(
          'Tổng đài hỗ trợ SOS',
          'Kết nối trực tiếp đường dây nóng khẩn cấp quốc gia:',
          [
            { text: '112 (Tìm kiếm cứu nạn)', onPress: () => {} },
            { text: '114 (Cứu nạn phòng cháy)', onPress: () => {} },
            { text: '115 (Cấp cứu y tế)', onPress: () => {} },
            { text: 'Đóng', style: 'cancel' },
          ]
        );
        break;

      case 'post_news':
        // Đăng tin (Admin)
        const isAuthority =
          user?.roles?.includes('ADMIN') ||
          user?.roles?.includes('LOCAL_AUTHORITY') ||
          user?.roles?.includes('RESCUER');
        if (isAuthority) {
          Alert.alert(
            'Đăng tin cảnh báo (Ban chỉ huy)',
            'Bạn đang đăng nhập với quyền hạn ' +
              (user?.roles?.[0] || 'AUTHORITY') +
              '. Bạn có thể soạn thông báo khẩn hoặc duyệt tin từ Web Dashboard.',
            [
              { text: 'Đóng', style: 'cancel' },
              {
                text: 'Báo điểm nguy hiểm',
                onPress: () => setShowHazardModal(true),
              },
            ]
          );
        } else {
          Alert.alert(
            'Quyền hạn đăng tin',
            'Chức năng phát thanh tin tức chính thức dành cho Cán bộ địa phương (LOCAL_AUTHORITY) và Ban chỉ huy. Người dân có thể dùng nút "Đăng cảnh báo" để gửi tin chờ duyệt.'
          );
        }
        break;

      default:
        break;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
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
              {/* Thanh điều khiển trên cùng: Thông báo + Cài đặt (Phải) */}
              <View style={styles.topBar}>
                <View style={styles.topBarRight}>
                  <TouchableOpacity
                    style={styles.circleIconButton}
                    onPress={() => onNavigateToTab?.('news')}
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

                  <TouchableOpacity
                    style={styles.circleIconButton}
                    onPress={onOpenSettings}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
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
                  Alert.alert(
                    'Thời tiết thực tế',
                    `Vị trí: ${weatherData.city}\nNhiệt độ: ${weatherData.temp} (Biên độ ${weatherData.tempRange})\nTình trạng: ${weatherData.desc}\n${weatherData.rainChance}\n\nNguồn: Cảm biến Khí tượng & Vệ tinh Open-Meteo.`
                  );
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

          {/* Danh sách 3 tin tức nổi bật */}
          <View style={styles.newsList}>
            {FEATURED_NEWS.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.newsCard}
                onPress={() => setSelectedNews(item)}
                activeOpacity={0.75}
              >
                <Image
                  source={{ uri: item.imageUrl }}
                  style={styles.newsThumbnail}
                  resizeMode="cover"
                />

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
            ))}
          </View>

          {/* Section: Tiện ích nhanh */}
          <Text style={[styles.sectionTitle, styles.utilitiesTitle]}>Tiện ích nhanh</Text>

          <View style={styles.utilitiesGrid}>
            {/* Hàng 1 */}
            <View style={styles.utilitiesRow}>
              {/* 1. Bản đồ cần cứu trợ */}
              <TouchableOpacity
                style={styles.utilityItem}
                onPress={() => handleUtilityPress('map_sos')}
                activeOpacity={0.7}
              >
                <View style={styles.utilityIconBoxStandalone}>
                  <Image
                    source={require('../../assets/appicon/bandocuutro.png')}
                    style={styles.utilityImage}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.utilityLabel}>Bản đồ{'\n'}cần cứu trợ</Text>
              </TouchableOpacity>

              {/* 2. Bản đồ điểm hỗ trợ */}
              <TouchableOpacity
                style={styles.utilityItem}
                onPress={() => handleUtilityPress('map_support')}
                activeOpacity={0.7}
              >
                <View style={styles.utilityIconBoxStandalone}>
                  <Image
                    source={require('../../assets/appicon/bandodiemcuutro.png')}
                    style={styles.utilityImage}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.utilityLabel}>Bản đồ{'\n'}điểm hỗ trợ</Text>
              </TouchableOpacity>

              {/* 3. Bản đồ nơi nguy hiểm */}
              <TouchableOpacity
                style={styles.utilityItem}
                onPress={() => handleUtilityPress('map_hazard')}
                activeOpacity={0.7}
              >
                <View style={styles.utilityIconBoxStandalone}>
                  <Image
                    source={require('../../assets/appicon/bandodiemnguyhiem.png')}
                    style={styles.utilityImage}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.utilityLabel}>Bản đồ{'\n'}nơi nguy hiểm</Text>
              </TouchableOpacity>

              {/* 4. Đánh dấu an toàn */}
              <TouchableOpacity
                style={styles.utilityItem}
                onPress={() => handleUtilityPress('mark_safe')}
                activeOpacity={0.7}
              >
                <View style={styles.utilityIconBoxStandalone}>
                  <Image
                    source={require('../../assets/appicon/danhdauantoan.png')}
                    style={styles.utilityImage}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.utilityLabel}>Đánh dấu{'\n'}an toàn</Text>
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
                    source={require('../../assets/appicon/dangkihienmau.png')}
                    style={styles.utilityImage}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.utilityLabel}>Đăng ký{'\n'}hiến máu</Text>
              </TouchableOpacity>

              {/* 6. Đóng góp điểm nguy hiểm */}
              <TouchableOpacity
                style={styles.utilityItem}
                onPress={() => handleUtilityPress('post_hazard')}
                activeOpacity={0.7}
              >
                <View style={styles.utilityIconBoxStandalone}>
                  <Image
                    source={require('../../assets/appicon/donggopdiemnguyhiem.png')}
                    style={styles.utilityImage}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.utilityLabel}>Đóng góp{'\n'}điểm nguy hiểm</Text>
              </TouchableOpacity>

              {/* 7. Chat với Admin */}
              <TouchableOpacity
                style={styles.utilityItem}
                onPress={() => handleUtilityPress('chat_admin')}
                activeOpacity={0.7}
              >
                <View style={[styles.utilityIconBox, { backgroundColor: '#E0F2FE' }]}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={28}
                    color="#0284C7"
                  />
                </View>
                <Text style={styles.utilityLabel}>Chat với{'\n'}Admin</Text>
              </TouchableOpacity>

              {/* 8. Đăng tin (Admin) */}
              <TouchableOpacity
                style={styles.utilityItem}
                onPress={() => handleUtilityPress('post_news')}
                activeOpacity={0.7}
              >
                <View style={[styles.utilityIconBox, { backgroundColor: '#F1F5F9' }]}>
                  <MaterialCommunityIcons
                    name="bullhorn-outline"
                    size={28}
                    color="#64748B"
                  />
                </View>
                <Text style={styles.utilityLabel}>Đăng tin{'\n'}(Admin)</Text>
              </TouchableOpacity>
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
                <Image
                  source={{ uri: selectedNews.imageUrl }}
                  style={styles.newsModalImage}
                  resizeMode="cover"
                />
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
});

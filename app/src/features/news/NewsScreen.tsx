import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  RefreshControl,
  Image,
  Linking,
  Alert,
  DeviceEventEmitter,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NotificationItem } from '@/types';
import { weatherApi, WeatherArticleItem } from '@/api';
import { useNotifications } from '@/context/NotificationContext';
import {
  formatRelativeTime,
  classifyNotification,
  NOTIFICATION_CATEGORIES,
} from '@/utils';

interface NewsScreenProps {
  onNavigateToTab?: (tab: string) => void;
  onOpenSettings?: () => void;
}

type TabKey = 'news' | 'alert' | 'safeLocation' | 'all';

interface TabItem {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// 4 tab tinh gọn: Tin thời tiết (mặc định), Thông báo (thông thường), Điểm an toàn, Tất cả
const TABS: TabItem[] = [
  { key: 'news', label: 'Tin thời tiết', icon: 'partly-sunny-outline' },
  { key: 'alert', label: 'Thông báo', icon: 'notifications-outline' },
  { key: 'safeLocation', label: 'Điểm an toàn', icon: 'shield-checkmark-outline' },
  { key: 'all', label: 'Tất cả', icon: 'layers-outline' },
];

const WEATHER_CATEGORY_LABELS: Record<string, string> = {
  mua_lu: 'Mưa lũ',
  bao: 'Bão & Áp thấp',
  du_bao: 'Dự báo thời tiết',
  canh_bao: 'Cảnh báo thiên tai',
  nang_nong: 'Nắng nóng',
  trieu_cuong: 'Triều cường',
  khac: 'Thời tiết',
};

// Kiểm tra xem 1 thông báo có phải là bài viết thời tiết hay không
function isWeatherNotification(item: NotificationItem): boolean {
  if (item.type === 'WEATHER' || item.type === 'TIN_TUC_THOI') return true;
  if (item.data?.weatherArticleId || item.data?.weatherType || item.data?.isWeather) return true;
  if ((item as any).category === 'WEATHER' || item.data?.category === 'WEATHER') return true;
  if (classifyNotification(item) === 'news') return true;
  return false;
}

function formatDisplayDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffHours = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
    if (diffHours < 24 && diffHours >= 0) {
      return formatRelativeTime(dateStr);
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${mins} ngày ${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

export const NewsScreen: React.FC<NewsScreenProps> = ({
  onNavigateToTab,
  onOpenSettings,
}) => {
  const {
    notifications: liveNotifications,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    isRealtimeConnected,
  } = useNotifications();

  // Mặc định hiển thị tab Tin thời tiết đầu tiên
  const [selectedTab, setSelectedTab] = useState<TabKey>('news');
  const [weatherArticles, setWeatherArticles] = useState<WeatherArticleItem[]>([]);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Tải danh sách bài viết thời tiết đã duyệt thực tế từ CSDL và sắp xếp MỚI NHẤT lên đầu
  const fetchWeatherArticles = useCallback(async () => {
    try {
      setLoadingWeather(true);
      const res = await weatherApi.getWeatherArticles({ status: 'approved', limit: 100 });
      if (res.success && Array.isArray(res.data)) {
        // Luôn sắp xếp bài viết thời tiết mới nhất lên trước
        const sorted = [...res.data].sort((a, b) => {
          const timeA = new Date(a.published_at || a.created_at || a.createdAt || 0).getTime();
          const timeB = new Date(b.published_at || b.created_at || b.createdAt || 0).getTime();
          return timeB - timeA;
        });
        setWeatherArticles(sorted);
      } else {
        setWeatherArticles([]);
      }
    } catch (err) {
      console.warn('Lỗi nạp tin tức thời tiết:', err);
    } finally {
      setLoadingWeather(false);
    }
  }, []);

  useEffect(() => {
    fetchWeatherArticles();
  }, [fetchWeatherArticles]);

  // Khử trùng lặp danh sách thông báo từ server (không dùng dữ liệu mock)
  const uniqueNotifications = useMemo(() => {
    if (!liveNotifications || liveNotifications.length === 0) {
      return [];
    }
    const list: NotificationItem[] = [];
    const seen = new Set<string>();
    for (const item of liveNotifications) {
      const key =
        item.data?.broadcastId ||
        `${item.title?.trim()}_${item.content?.trim()}_${item.createdAt?.slice(0, 16)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(item);
    }
    return list;
  }, [liveNotifications]);

  // Danh sách thông báo KHÔNG chứa bài viết thời tiết
  const nonWeatherNotifications = useMemo(() => {
    return uniqueNotifications.filter((n) => !isWeatherNotification(n));
  }, [uniqueNotifications]);

  // Đếm số lượng thực tế cho từng tab
  const counts = useMemo(() => {
    const normalCount = nonWeatherNotifications.filter(
      (n) => classifyNotification(n) !== 'safeLocation'
    ).length;
    const safeCount = nonWeatherNotifications.filter(
      (n) => classifyNotification(n) === 'safeLocation'
    ).length;
    const weatherTotal = weatherArticles.length;
    const totalAll = weatherArticles.length + nonWeatherNotifications.length;

    return {
      news: weatherTotal,
      alert: normalCount,
      safeLocation: safeCount,
      all: totalAll,
    };
  }, [weatherArticles.length, nonWeatherNotifications]);

  const unreadCount = useMemo(() => {
    return nonWeatherNotifications.filter((n) => !n.isRead).length;
  }, [nonWeatherNotifications]);

  // Lọc dữ liệu hiển thị theo tab được chọn
  const displayData = useMemo(() => {
    if (selectedTab === 'news') {
      // 1. Tab Tin thời tiết: CHỈ hiển thị bài viết thời tiết thực tế từ DB, sắp xếp mới nhất trước
      return {
        articles: weatherArticles,
        notifications: [],
      };
    }

    if (selectedTab === 'alert') {
      // 2. Tab Thông báo: Thông báo thông thường (KHÔNG hiển thị bài viết thời tiết ở đây)
      const normalNotifs = nonWeatherNotifications.filter(
        (n) => classifyNotification(n) !== 'safeLocation'
      );
      return {
        articles: [],
        notifications: normalNotifs,
      };
    }

    if (selectedTab === 'safeLocation') {
      // 3. Tab Điểm an toàn
      const safeNotifs = nonWeatherNotifications.filter(
        (n) => classifyNotification(n) === 'safeLocation'
      );
      return {
        articles: [],
        notifications: safeNotifs,
      };
    }

    // 4. Tab "Tất cả": Bài viết thời tiết mới nhất ở đầu, tiếp theo là các thông báo thông thường
    return {
      articles: weatherArticles,
      notifications: nonWeatherNotifications,
    };
  }, [selectedTab, weatherArticles, nonWeatherNotifications]);

  const totalItemsCount = displayData.articles.length + displayData.notifications.length;

  // Kéo xuống để làm mới (Pull-to-refresh)
  const handlePullRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshNotifications(),
        fetchWeatherArticles(),
      ]);
    } catch (_) {
      // Giữ giao diện ổn định
    } finally {
      setRefreshing(false);
    }
  };

  // Mở liên kết bài báo gốc
  const handleOpenUrl = async (url?: string) => {
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Không thể mở liên kết', 'Đường dẫn bài báo không hợp lệ: ' + url);
      }
    } catch {
      Alert.alert('Không thể mở liên kết', 'Vui lòng kiểm tra lại kết nối mạng hoặc đường dẫn.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ==================== 1. TOP HEADER ==================== */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Bản tin & Thông báo</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusIndicator,
                { backgroundColor: isRealtimeConnected ? '#10B981' : '#F59E0B' },
              ]}
            />
            <Text style={styles.statusText}>
              {isRealtimeConnected ? 'Trực tuyến' : 'Đang kết nối'}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.markAllBtn}
              onPress={() => markAllAsRead()}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-done" size={15} color="#0F172A" />
              <Text style={styles.markAllText}>Đã đọc ({unreadCount})</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => {
              if (onOpenSettings) {
                onOpenSettings();
              } else if (onNavigateToTab) {
                onNavigateToTab('profile');
              }
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="settings-outline" size={19} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ==================== 2. HORIZONTAL TAB SELECTOR ==================== */}
      <View style={styles.tabBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContainer}
        >
          {TABS.map((tab) => {
            const isActive = selectedTab === tab.key;
            const count = counts[tab.key];

            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabChip, isActive && styles.tabChipActive]}
                onPress={() => setSelectedTab(tab.key)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={tab.icon}
                  size={15}
                  color={isActive ? '#FFFFFF' : '#64748B'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.tabChipText, isActive && styles.tabChipTextActive]}>
                  {tab.label}
                </Text>

                <View
                  style={[
                    styles.tabCountBadge,
                    isActive && styles.tabCountBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabCountText,
                      isActive && styles.tabCountTextActive,
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ==================== 3. DANH SÁCH BẢN TIN & THÔNG BÁO ==================== */}
      {totalItemsCount === 0 && !loadingWeather ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handlePullRefresh}
              colors={['#0F172A']}
              tintColor="#0F172A"
            />
          }
        >
          <View style={styles.emptyIconCircle}>
            <Ionicons name="newspaper-outline" size={38} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>Chưa có bản tin nào</Text>
          <Text style={styles.emptyDesc}>
            Hiện tại không có bản tin hoặc thông báo mới trong danh mục này.
          </Text>
          {selectedTab !== 'news' && (
            <TouchableOpacity
              style={styles.emptyResetBtn}
              onPress={() => setSelectedTab('news')}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyResetText}>Về mục Tin thời tiết</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handlePullRefresh}
              colors={['#0F172A']}
              tintColor="#0F172A"
            />
          }
        >
          {/* A. DANH SÁCH BÀI VIẾT THỜI TIẾT (MỚI NHẤT XẾP TRƯỚC, HIỂN THỊ FULL) */}
          {displayData.articles.map((article) => {
            const imageUrl = article.imageUrl || article.image_url;
            const articleUrl = article.articleUrl || article.source_url;
            const sourceName = article.sourceName || article.source_name || 'Bản tin khí tượng';
            const regionText =
              article.area ||
              (Array.isArray(article.regions) && article.regions.length > 0
                ? article.regions.join(', ')
                : null);

            return (
              <View key={article._id} style={styles.card}>
                {/* Dòng tag và thời gian */}
                <View style={styles.cardMetaRow}>
                  <View style={styles.tagBadge}>
                    <Text style={styles.tagBadgeText}>
                      {WEATHER_CATEGORY_LABELS[article.category] || article.category || 'THỜI TIẾT'}
                    </Text>
                  </View>

                  {Boolean(regionText) && (
                    <View style={styles.regionBadge}>
                      <Ionicons name="location-outline" size={12} color="#64748B" />
                      <Text style={styles.regionBadgeText}>{regionText}</Text>
                    </View>
                  )}

                  <Text style={styles.timeMetaText}>
                    {formatDisplayDate(article.published_at || article.created_at)}
                  </Text>
                </View>

                {/* Tiêu đề bài viết: Hiển thị đầy đủ, không cắt dòng */}
                <Text style={styles.newsTitle}>{article.title}</Text>

                {/* Ảnh bài viết nếu có */}
                {Boolean(imageUrl) && (
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.newsImage}
                    resizeMode="cover"
                  />
                )}

                {/* Nội dung đầy đủ: Hiển thị full trực tiếp trên thẻ, không cần nhấn vào */}
                <Text style={styles.newsContent}>
                  {article.content || article.summary}
                </Text>

                {/* Chân thẻ: Nguồn tin & nút mở bài gốc */}
                <View style={styles.cardFooter}>
                  <View style={styles.sourceWrap}>
                    <Ionicons name="globe-outline" size={13} color="#64748B" />
                    <Text style={styles.sourceText}>{sourceName}</Text>
                  </View>

                  {Boolean(articleUrl) && (
                    <TouchableOpacity
                      style={styles.linkButton}
                      onPress={() => handleOpenUrl(articleUrl)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.linkButtonText}>Mở bài viết gốc</Text>
                      <Ionicons name="open-outline" size={12} color="#0F172A" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}

          {/* B. DANH SÁCH THÔNG BÁO BÌNH THƯỜNG (KHÔNG CHỨA BÀI VIẾT THỜI TIẾT) */}
          {displayData.notifications.map((item) => {
            const isBloodDonation =
              item.type === 'BLOOD_DONATION' ||
              item.actionUrl === 'blood_donation' ||
              item.data?.isBloodDonation ||
              item.title?.includes('Hiến Máu');

            const isSafetyCheck =
              item.type === 'SAFETY_CHECK' ||
              item.actionUrl === 'safety_check' ||
              item.data?.isSafetyCheck;

            const isSafeLocation =
              item.type === 'SAFE_LOCATION' ||
              item.data?.safeLocationId;

            const isChat =
              item.type === 'CHAT' ||
              item.actionUrl === 'chat' ||
              item.data?.isChat;

            const imageUrl = item.imageUrl || item.data?.imageUrl;
            const articleUrl = item.articleUrl || item.data?.articleUrl;

            return (
              <View
                key={item._id}
                style={[styles.card, !item.isRead && styles.cardUnreadHighlight]}
              >
                {/* Dòng tag và thời gian: Thông báo bình thường */}
                <View style={styles.cardMetaRow}>
                  <View style={[styles.tagBadge, isChat && { backgroundColor: '#E0F2FE' }]}>
                    <Text style={[styles.tagBadgeText, isChat && { color: '#0284C7' }]}>
                      {isChat
                        ? 'ĐỊA PHƯƠNG PHẢN HỒI'
                        : isBloodDonation
                        ? 'ĐỢT HIẾN MÁU'
                        : isSafetyCheck
                        ? 'XÁC NHẬN AN TOÀN'
                        : isSafeLocation
                        ? 'ĐIỂM AN TOÀN'
                        : 'THÔNG BÁO'}
                    </Text>
                  </View>

                  {Boolean(item.areaName) && (
                    <View style={styles.regionBadge}>
                      <Ionicons name="location-outline" size={12} color="#64748B" />
                      <Text style={styles.regionBadgeText}>{item.areaName}</Text>
                    </View>
                  )}

                  <Text style={styles.timeMetaText}>
                    {formatRelativeTime(item.createdAt)}
                  </Text>
                </View>

                {/* Tiêu đề thông báo: Hiển thị đầy đủ */}
                <Text style={styles.newsTitle}>{item.title}</Text>

                {/* Ảnh nếu có */}
                {Boolean(imageUrl) && (
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.newsImage}
                    resizeMode="cover"
                  />
                )}

                {/* Nội dung thông báo: Hiển thị full trực tiếp */}
                <Text style={styles.newsContent}>{item.content}</Text>

                {/* Các nút thao tác tiện ích trực tiếp trên thẻ */}
                {isBloodDonation && (
                  <>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => {
                        markAsRead(item._id);
                        const eid = item.data?.eventId || (item as any)?.eventId || item.data?.broadcastId;
                        DeviceEventEmitter.emit('open:blood_donation', item.data || { eventId: eid });
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="water-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.actionButtonText}>Đăng ký tham gia hiến máu</Text>
                    </TouchableOpacity>

                    {Boolean(item.data?.googleMapsUrl || item.data?.address) && (
                      <TouchableOpacity
                        style={styles.actionOutlineButton}
                        onPress={() => {
                          const mapUrl =
                            item.data?.googleMapsUrl ||
                            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                              `${item.data?.locationName || ''} ${item.data?.address || ''}`.trim()
                            )}`;
                          Linking.openURL(mapUrl).catch(() => {});
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="navigate-outline" size={15} color="#0F172A" />
                        <Text style={styles.actionOutlineButtonText}>Chỉ đường trên Google Maps</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {isSafetyCheck && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => {
                      markAsRead(item._id);
                      const sid = item.data?.safetyCheckId || (item as any)?.safetyCheckId || item._id;
                      DeviceEventEmitter.emit('open:safety_check', item.data || { safetyCheckId: sid });
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="shield-checkmark-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.actionButtonText}>Xác nhận an toàn ngay</Text>
                  </TouchableOpacity>
                )}

                {isChat && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: '#0284C7' }]}
                    onPress={() => {
                      markAsRead(item._id);
                      if (onNavigateToTab) onNavigateToTab('home');
                      DeviceEventEmitter.emit('open:local_authority_chat', item.data || item);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="chatbubbles-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.actionButtonText}>Mở cuộc trò chuyện ngay</Text>
                  </TouchableOpacity>
                )}

                {(isSafeLocation || item.actionUrl === 'map') && onNavigateToTab && (
                  <TouchableOpacity
                    style={styles.actionOutlineButton}
                    onPress={() => {
                      markAsRead(item._id);
                      onNavigateToTab('map');
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="map-outline" size={15} color="#0F172A" />
                    <Text style={styles.actionOutlineButtonText}>Xem vị trí trên bản đồ</Text>
                  </TouchableOpacity>
                )}

                {/* Chân thẻ: Người gửi */}
                <View style={styles.cardFooter}>
                  <View style={styles.sourceWrap}>
                    <Ionicons name="person-circle-outline" size={14} color="#64748B" />
                    <Text style={styles.sourceText}>
                      {isChat
                        ? item.data?.department ||
                          (item.data?.senderName &&
                          !item.data.senderName.toLowerCase().includes('admin')
                            ? item.data.senderName
                            : 'Ban Chỉ Huy PCTT')
                        : item.sourceName ||
                          item.createdBy?.fullName ||
                          item.data?.senderName ||
                          'Ban chỉ huy SOS'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {Boolean(articleUrl) && (
                      <TouchableOpacity
                        style={styles.linkButton}
                        onPress={() => handleOpenUrl(articleUrl)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.linkButtonText}>Mở bài gốc</Text>
                        <Ionicons name="open-outline" size={12} color="#0F172A" />
                      </TouchableOpacity>
                    )}

                    {!item.isRead && (
                      <TouchableOpacity
                        style={styles.unreadTag}
                        onPress={() => markAsRead(item._id)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.unreadDot} />
                        <Text style={styles.unreadText}>Chưa đọc</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          })}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
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
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 20 : 10,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  statusIndicator: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Thanh chọn Tab ngang
  tabBarWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 10,
  },
  tabBarContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  tabChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tabCountBadge: {
    marginLeft: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
    minWidth: 18,
    alignItems: 'center',
  },
  tabCountBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  tabCountTextActive: {
    color: '#FFFFFF',
  },
  // Danh sách
  listContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  listContent: {
    padding: 16,
  },
  // Thẻ bài viết / thông báo: Giao diện gọn gàng, viền xám nhạt đồng bộ, KHÔNG có viền màu đỏ/xanh cạnh thẻ
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardUnreadHighlight: {
    borderColor: '#CBD5E1',
    backgroundColor: '#FCFDFF',
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  tagBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  regionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  regionBadgeText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
  },
  timeMetaText: {
    fontSize: 11,
    color: '#94A3B8',
    marginLeft: 'auto',
  },
  newsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 23,
    marginBottom: 10,
  },
  newsImage: {
    width: '100%',
    height: 185,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    marginBottom: 12,
  },
  newsContent: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 22,
    marginBottom: 12,
  },
  // Nút hành động nhanh
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0F172A',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginTop: 2,
    marginBottom: 12,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionOutlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginTop: 2,
    marginBottom: 12,
  },
  actionOutlineButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  sourceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    marginRight: 8,
  },
  sourceText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  linkButtonText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  unreadTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#64748B',
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
    backgroundColor: '#F8FAFC',
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyResetBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#0F172A',
  },
  emptyResetText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

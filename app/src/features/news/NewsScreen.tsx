import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  ActivityIndicator,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { weatherApi, WeatherArticleItem } from '@/api';
import { useNotifications } from '@/context/NotificationContext';
import { formatRelativeTime } from '@/utils';

interface NewsScreenProps {
  onNavigateToTab?: (tab: string) => void;
  onOpenSettings?: () => void;
  isActive?: boolean;
}

const WEATHER_CATEGORY_LABELS: Record<string, string> = {
  mua_lu: 'Mưa lũ',
  bao: 'Bão & Áp thấp',
  du_bao: 'Dự báo thời tiết',
  canh_bao: 'Cảnh báo thiên tai',
  nang_nong: 'Nắng nóng',
  trieu_cuong: 'Triều cường',
  khac: 'Thời tiết',
};

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

export const NewsScreen: React.FC<NewsScreenProps> = ({ isActive = false }) => {
  const { isRealtimeConnected } = useNotifications();
  const [weatherArticles, setWeatherArticles] = useState<WeatherArticleItem[]>([]);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const latestRequestIdRef = useRef(0);
  const prevRealtimeConnectedRef = useRef(isRealtimeConnected);

  // Tải danh sách bài viết thời tiết đã duyệt thực tế từ CSDL và sắp xếp MỚI NHẤT lên đầu
  const fetchWeatherArticles = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const reqId = ++latestRequestIdRef.current;
    try {
      if (!silent) {
        setLoadingWeather(true);
      }
      const res = await weatherApi.getWeatherArticles({ status: 'approved', limit: 100 });
      if (reqId !== latestRequestIdRef.current) return;

      if (res.success && Array.isArray(res.data)) {
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
      if (reqId === latestRequestIdRef.current) {
        console.warn('Lỗi nạp tin tức thời tiết:', err);
      }
    } finally {
      if (!silent && reqId === latestRequestIdRef.current) {
        setLoadingWeather(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchWeatherArticles();
  }, [fetchWeatherArticles]);

  useEffect(() => {
    if (isActive) {
      fetchWeatherArticles({ silent: true });
    }
  }, [isActive, fetchWeatherArticles]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('weather:articles_updated', () => {
      fetchWeatherArticles({ silent: true });
    });
    return () => sub.remove();
  }, [fetchWeatherArticles]);

  // Đồng bộ lại ngay khi quay lại app từ background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && isActive) {
        fetchWeatherArticles({ silent: true });
      }
    });
    return () => subscription.remove();
  }, [isActive, fetchWeatherArticles]);

  // Bù dữ liệu ngay khi luồng SSE kết nối lại sau khi gián đoạn
  useEffect(() => {
    const wasConnected = prevRealtimeConnectedRef.current;
    prevRealtimeConnectedRef.current = isRealtimeConnected;
    if (!wasConnected && isRealtimeConnected) {
      fetchWeatherArticles({ silent: true });
    }
  }, [isRealtimeConnected, fetchWeatherArticles]);

  // Dự phòng tự đồng bộ khi SSE tạm ngắt và tab Tin tức đang mở
  useEffect(() => {
    if (!isActive || isRealtimeConnected) return;
    const timer = setInterval(() => {
      fetchWeatherArticles({ silent: true });
    }, 15000);
    return () => clearInterval(timer);
  }, [isActive, isRealtimeConnected, fetchWeatherArticles]);

  // Kéo xuống để làm mới (Pull-to-refresh)
  const handlePullRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchWeatherArticles({ silent: true });
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
          <Text style={styles.headerTitle}>Tin tức thời tiết</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusIndicator,
                { backgroundColor: isRealtimeConnected ? '#10B981' : '#F59E0B' },
              ]}
            />
            <Text style={styles.statusText}>
              {isRealtimeConnected ? 'Trực tuyến' : 'Đang kết nối'}
              {weatherArticles.length > 0 ? ` • ${weatherArticles.length} bài viết` : ''}
            </Text>
          </View>
        </View>
      </View>

      {/* ==================== 2. DANH SÁCH BÀI VIẾT THỜI TIẾT ==================== */}
      {loadingWeather && weatherArticles.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#0F172A" />
          <Text style={[styles.emptyDesc, { marginTop: 14 }]}>
            Đang tải bài viết thời tiết...
          </Text>
        </View>
      ) : weatherArticles.length === 0 ? (
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
            <Ionicons name="partly-sunny-outline" size={38} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>Chưa có bài viết thời tiết nào</Text>
          <Text style={styles.emptyDesc}>
            Hiện tại chưa có bản tin hoặc dự báo thời tiết mới được công bố.
          </Text>
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
          {weatherArticles.map((article) => {
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
                    {formatDisplayDate(article.published_at || article.created_at || article.createdAt)}
                  </Text>
                </View>

                {/* Tiêu đề bài viết */}
                <Text style={styles.newsTitle}>{article.title}</Text>

                {/* Ảnh bài viết nếu có */}
                {Boolean(imageUrl) && (
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.newsImage}
                    resizeMode="cover"
                  />
                )}

                {/* Nội dung bài viết */}
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
  listContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  listContent: {
    padding: 16,
  },
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
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  tagBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
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
});

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Modal,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Image,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NotificationItem } from '@/types';
import { triggerLocalNotification } from '@/services';
import { useNotifications } from '@/context/NotificationContext';
import {
  formatRelativeTime,
  classifyNotification,
  NOTIFICATION_CATEGORIES,
  NotificationCategoryKey,
  NotificationFilterKey,
  SAMPLE_FILTERED_NOTIFICATIONS,
} from '@/utils';

interface NewsScreenProps {
  onNavigateToTab?: (tab: string) => void;
  onOpenSettings?: () => void;
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
    settings,
  } = useNotifications();

  // Bộ lọc danh mục thông báo: 'all' | 'alert' | 'safeLocation' | 'systemNotification' | 'news'
  const [selectedCategory, setSelectedCategory] = useState<NotificationFilterKey>('all');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [refreshing, setRefreshing] = useState(false);

  // Modal chi tiết thông báo
  const [selectedNotif, setSelectedNotif] = useState<NotificationItem | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  // Nguồn dữ liệu kết hợp giữa dữ liệu thật và fallback mẫu
  const notifications = useMemo(() => {
    if (liveNotifications && liveNotifications.length > 0) {
      return liveNotifications;
    }
    return SAMPLE_FILTERED_NOTIFICATIONS;
  }, [liveNotifications]);

  // Khử trùng lặp danh sách
  const uniqueNotifications = useMemo(() => {
    const list: NotificationItem[] = [];
    const seen = new Set<string>();
    for (const item of notifications) {
      const key =
        item.data?.broadcastId ||
        `${item.title?.trim()}_${item.content?.trim()}_${item.createdAt?.slice(0, 16)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(item);
    }
    return list;
  }, [notifications]);

  // Đếm số lượng thông báo theo từng danh mục trong Cài đặt
  const categoryCounts = useMemo(() => {
    const counts: Record<NotificationFilterKey, { total: number; unread: number }> = {
      all: { total: uniqueNotifications.length, unread: 0 },
      alert: { total: 0, unread: 0 },
      safeLocation: { total: 0, unread: 0 },
      systemNotification: { total: 0, unread: 0 },
      news: { total: 0, unread: 0 },
    };

    for (const item of uniqueNotifications) {
      const cat = classifyNotification(item);
      const isUnread = !item.isRead;

      if (isUnread) counts.all.unread += 1;

      if (counts[cat]) {
        counts[cat].total += 1;
        if (isUnread) counts[cat].unread += 1;
      }
    }

    return counts;
  }, [uniqueNotifications]);

  // Danh sách thông báo sau khi lọc theo danh mục & trạng thái
  const filteredList = useMemo(() => {
    return uniqueNotifications.filter((item) => {
      const itemCat = classifyNotification(item);

      // 1. Lọc theo danh mục đã chọn
      if (selectedCategory !== 'all') {
        if (itemCat !== selectedCategory) {
          return false;
        }
      } else {
        // Nếu ở tab "Tất cả", chỉ hiển thị nhóm thông báo đang BẬT trong Cài đặt
        if (settings && settings[itemCat] === false) {
          return false;
        }
      }

      // 2. Lọc theo trạng thái đọc
      if (statusFilter === 'UNREAD') {
        return !item.isRead;
      }

      return true;
    });
  }, [uniqueNotifications, selectedCategory, statusFilter, settings]);

  // Bản tin khẩn cấp nổi bật nhất (nếu có thông báo ALERT chưa đọc và người dùng đang BẬT nhận ALERT)
  const topAlert = useMemo(() => {
    if (settings && settings.alert === false) return null;
    return uniqueNotifications.find(
      (n) => classifyNotification(n) === 'alert' && (n.priority === 'CRITICAL' || !n.isRead)
    );
  }, [uniqueNotifications, settings]);

  // Kéo xuống để làm mới (Pull-to-refresh)
  const handlePullRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshNotifications();
    } catch {
      // Giữ nguyên giao diện mượt mà
    } finally {
      setRefreshing(false);
    }
  };

  // Mở xem chi tiết
  const handleOpenDetail = async (item: NotificationItem) => {
    setSelectedNotif(item);
    setDetailVisible(true);

    if (!item.isRead) {
      await markAsRead(item._id);
    }
  };

  // Thử nghiệm phát chuông thông báo
  const handleTestPush = async (item: NotificationItem) => {
    await triggerLocalNotification({
      title: item.title,
      body: item.content,
      data: { notificationId: item._id, type: item.type },
      priority: item.priority as any,
    });
  };

  // Danh sách các tab danh mục để hiển thị thanh cuộn
  const filterTabs: Array<{
    key: NotificationFilterKey;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    bgColor: string;
  }> = [
    {
      key: 'all',
      label: 'Tất cả',
      icon: 'layers-outline',
      color: '#475569',
      bgColor: '#F1F5F9',
    },
    {
      key: 'alert',
      label: NOTIFICATION_CATEGORIES.alert.shortLabel,
      icon: 'warning-outline',
      color: NOTIFICATION_CATEGORIES.alert.color,
      bgColor: NOTIFICATION_CATEGORIES.alert.bgColor,
    },
    {
      key: 'safeLocation',
      label: NOTIFICATION_CATEGORIES.safeLocation.shortLabel,
      icon: 'shield-checkmark-outline',
      color: NOTIFICATION_CATEGORIES.safeLocation.color,
      bgColor: NOTIFICATION_CATEGORIES.safeLocation.bgColor,
    },
    {
      key: 'systemNotification',
      label: NOTIFICATION_CATEGORIES.systemNotification.shortLabel,
      icon: 'notifications-outline',
      color: NOTIFICATION_CATEGORIES.systemNotification.color,
      bgColor: NOTIFICATION_CATEGORIES.systemNotification.bgColor,
    },
    {
      key: 'news',
      label: NOTIFICATION_CATEGORIES.news.shortLabel,
      icon: 'partly-sunny-outline',
      color: NOTIFICATION_CATEGORIES.news.color,
      bgColor: NOTIFICATION_CATEGORIES.news.bgColor,
    },
  ];

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
          {categoryCounts.all.unread > 0 && (
            <TouchableOpacity
              style={styles.markAllBtn}
              onPress={() => markAllAsRead()}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-done" size={16} color="#0066FF" />
              <Text style={styles.markAllText}>Đọc tất cả</Text>
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
            <Ionicons name="settings-outline" size={20} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ==================== 2. HORIZONTAL CATEGORY FILTER BAR (NHƯ TRONG CÀI ĐẶT) ==================== */}
      <View style={styles.categoryFilterWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryFilterContainer}
        >
          {filterTabs.map((tab) => {
            const isSelected = selectedCategory === tab.key;
            const countInfo = categoryCounts[tab.key];
            const hasUnread = countInfo.unread > 0;

            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.categoryChip,
                  isSelected && styles.categoryChipActive,
                  isSelected && { borderColor: tab.color },
                ]}
                onPress={() => setSelectedCategory(tab.key)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={tab.icon}
                  size={15}
                  color={isSelected ? tab.color : '#64748B'}
                  style={styles.chipIcon}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    isSelected && styles.categoryChipTextActive,
                    isSelected && { color: tab.color },
                  ]}
                >
                  {tab.label}
                </Text>

                {countInfo.total > 0 && (
                  <View
                    style={[
                      styles.categoryCountBadge,
                      isSelected && { backgroundColor: tab.color },
                      hasUnread && !isSelected && styles.unreadCountBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryCountText,
                        isSelected && { color: '#FFFFFF' },
                        hasUnread && !isSelected && { color: '#DC2626' },
                      ]}
                    >
                      {countInfo.total}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ==================== 3. SUB-FILTER ROW (TẤT CẢ / CHƯA ĐỌC) ==================== */}
      <View style={styles.subFilterBar}>
        <View style={styles.pillsRow}>
          <TouchableOpacity
            style={[styles.pillBtn, statusFilter === 'ALL' && styles.pillBtnActive]}
            onPress={() => setStatusFilter('ALL')}
            activeOpacity={0.7}
          >
            <Text style={[styles.pillText, statusFilter === 'ALL' && styles.pillTextActive]}>
              Tất cả ({categoryCounts[selectedCategory]?.total || 0})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pillBtn, statusFilter === 'UNREAD' && styles.pillBtnActive]}
            onPress={() => setStatusFilter('UNREAD')}
            activeOpacity={0.7}
          >
            <Text style={[styles.pillText, statusFilter === 'UNREAD' && styles.pillTextActive]}>
              Chưa đọc ({categoryCounts[selectedCategory]?.unread || 0})
            </Text>
          </TouchableOpacity>
        </View>

        {selectedCategory !== 'all' && (
          <TouchableOpacity
            style={styles.clearFilterBtn}
            onPress={() => setSelectedCategory('all')}
            activeOpacity={0.7}
          >
            <Ionicons name="close-circle" size={14} color="#64748B" />
            <Text style={styles.clearFilterText}>Xóa lọc</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ==================== 4. BANNER CẢNH BÁO NGUY CẤP (NẾU CÓ) ==================== */}
      {topAlert && selectedCategory === 'all' && (
        <TouchableOpacity
          style={styles.criticalBanner}
          onPress={() => handleOpenDetail(topAlert)}
          activeOpacity={0.88}
        >
          <View style={styles.criticalPulseDot} />
          <View style={{ flex: 1 }}>
            <View style={styles.criticalHeaderRow}>
              <Text style={styles.criticalTag}>CẢNH BÁO SOS KHẨN CẤP</Text>
              <Text style={styles.criticalTime}>{formatRelativeTime(topAlert.createdAt)}</Text>
            </View>
            <Text style={styles.criticalTitle} numberOfLines={1}>
              {topAlert.title}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#DC2626" />
        </TouchableOpacity>
      )}

      {/* ==================== 5. DANH SÁCH THÔNG BÁO ==================== */}
      {filteredList.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handlePullRefresh}
              colors={['#0066FF']}
              tintColor="#0066FF"
            />
          }
        >
          <View style={styles.emptyIconCircle}>
            <Ionicons name="notifications-off-outline" size={40} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>Không có thông báo phù hợp</Text>
          <Text style={styles.emptyDesc}>
            {statusFilter === 'UNREAD'
              ? 'Bạn đã đọc tất cả thông báo trong mục này.'
              : 'Hiện tại chưa có thông báo mới trong danh mục đã chọn.'}
          </Text>
          {selectedCategory !== 'all' && (
            <TouchableOpacity
              style={styles.emptyResetBtn}
              onPress={() => {
                setSelectedCategory('all');
                setStatusFilter('ALL');
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyResetText}>Xem tất cả thông báo</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.newsList}
          contentContainerStyle={styles.newsListContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handlePullRefresh}
              colors={['#0066FF']}
              tintColor="#0066FF"
            />
          }
        >
          {filteredList.map((item) => {
            const cat = classifyNotification(item);
            const meta = NOTIFICATION_CATEGORIES[cat] || NOTIFICATION_CATEGORIES.systemNotification;
            const isCritical = item.priority === 'CRITICAL' || item.priority === 'HIGH';
            const imageUrl = item.imageUrl || item.data?.imageUrl;
            const articleUrl = item.articleUrl || item.data?.articleUrl || item.data?.url;
            const sourceName = item.sourceName || item.data?.sourceName;

            return (
              <TouchableOpacity
                key={item._id}
                style={[
                  styles.newsCard,
                  !item.isRead && styles.newsCardUnread,
                  cat === 'alert' && isCritical && styles.newsCardAlertBorder,
                ]}
                onPress={() => handleOpenDetail(item)}
                activeOpacity={0.78}
              >
                {/* Icon danh mục */}
                <View style={[styles.newsIconBox, { backgroundColor: meta.bgColor }]}>
                  <Ionicons name={meta.iconName as any} size={20} color={meta.color} />
                </View>

                {/* Nội dung thông báo */}
                <View style={styles.newsCardBody}>
                  {/* Hàng nhãn: Danh mục, Mức độ, Khu vực & Nguồn tham chiếu */}
                  <View style={styles.tagsRow}>
                    <View
                      style={[
                        styles.badgePill,
                        { backgroundColor: meta.badgeBg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgePillText,
                          { color: meta.badgeTextColor },
                        ]}
                      >
                        {meta.badgeLabel}
                      </Text>
                    </View>

                    {item.priority === 'CRITICAL' && (
                      <View style={styles.badgeCritical}>
                        <Text style={styles.badgeCriticalText}>NGUY CẤP</Text>
                      </View>
                    )}

                    {Boolean(item.areaName) && (
                      <View style={styles.badgeArea}>
                        <Ionicons name="location-sharp" size={10} color="#64748B" />
                        <Text style={styles.badgeAreaText} numberOfLines={1}>
                          {item.areaName}
                        </Text>
                      </View>
                    )}

                    {Boolean(articleUrl) && (
                      <View style={styles.badgeSource}>
                        <Ionicons name="link-outline" size={10} color="#0284C7" />
                        <Text style={styles.badgeSourceText} numberOfLines={1}>
                          {sourceName || 'Bài báo'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Tiêu đề & Tóm tắt kèm Thumbnail ảnh nếu có */}
                  <View style={styles.cardContentRow}>
                    <View style={{ flex: 1, marginRight: imageUrl ? 10 : 0 }}>
                      <Text
                        style={[styles.newsCardTitle, !item.isRead && styles.newsCardTitleUnread]}
                        numberOfLines={2}
                      >
                        {item.title}
                      </Text>

                      <Text style={styles.newsCardSnippet} numberOfLines={2}>
                        {item.content}
                      </Text>
                    </View>

                    {Boolean(imageUrl) && (
                      <Image
                        source={{ uri: imageUrl }}
                        style={styles.newsThumbnail}
                        resizeMode="cover"
                      />
                    )}
                  </View>

                  {/* Hàng thông tin cuối thẻ */}
                  <View style={styles.newsCardFooter}>
                    <View style={styles.senderWrap}>
                      <Ionicons name="person-circle-outline" size={13} color="#94A3B8" />
                      <Text style={styles.senderText} numberOfLines={1}>
                        {sourceName || item.createdBy?.fullName || item.data?.senderName || 'Ban chỉ huy SOS'}
                      </Text>
                    </View>

                    <View style={styles.timeWrap}>
                      <Ionicons name="time-outline" size={12} color="#94A3B8" />
                      <Text style={styles.timeText}>{formatRelativeTime(item.createdAt)}</Text>
                      {!item.isRead && <View style={styles.unreadDot} />}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}

          <View style={{ height: 36 }} />
        </ScrollView>
      )}

      {/* ==================== 6. MODAL XEM CHI TIẾT THÔNG BÁO ==================== */}
      <Modal
        visible={detailVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.detailCard}>
            <View style={styles.modalHandle} />

            {/* Ảnh bài báo minh họa nếu có */}
            {Boolean(selectedNotif?.imageUrl || selectedNotif?.data?.imageUrl) && (
              <Image
                source={{ uri: selectedNotif?.imageUrl || selectedNotif?.data?.imageUrl }}
                style={styles.detailCoverImage}
                resizeMode="cover"
              />
            )}

            {/* Header Modal */}
            <View style={styles.detailHeader}>
              <View style={{ flex: 1 }}>
                {selectedNotif && (
                  <View style={styles.tagsRow}>
                    {(() => {
                      const cat = classifyNotification(selectedNotif);
                      const meta =
                        NOTIFICATION_CATEGORIES[cat] || NOTIFICATION_CATEGORIES.systemNotification;
                      return (
                        <View style={[styles.badgePill, { backgroundColor: meta.badgeBg }]}>
                          <Text style={[styles.badgePillText, { color: meta.badgeTextColor }]}>
                            {meta.badgeLabel}
                          </Text>
                        </View>
                      );
                    })()}

                    {selectedNotif.priority === 'CRITICAL' && (
                      <View style={styles.badgeCritical}>
                        <Text style={styles.badgeCriticalText}>BÁO ĐỘNG ĐỎ</Text>
                      </View>
                    )}
                  </View>
                )}

                <Text style={styles.detailTitle}>{selectedNotif?.title}</Text>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setDetailVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Thông tin metadata */}
            <View style={styles.detailMetaBox}>
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={14} color="#0066FF" />
                <Text style={styles.metaLabel}>Địa bàn:</Text>
                <Text style={styles.metaValue}>{selectedNotif?.areaName || 'Toàn thành phố'}</Text>
              </View>

              <View style={styles.metaRow}>
                <Ionicons name="shield-checkmark-outline" size={14} color="#059669" />
                <Text style={styles.metaLabel}>Cơ quan phát tin:</Text>
                <Text style={styles.metaValue}>
                  {selectedNotif?.createdBy?.fullName ||
                    selectedNotif?.data?.senderName ||
                    'Ban chỉ huy PCTT'}
                </Text>
              </View>

              {Boolean(selectedNotif?.sourceName || selectedNotif?.articleUrl || selectedNotif?.data?.articleUrl) && (
                <View style={styles.metaRow}>
                  <Ionicons name="newspaper-outline" size={14} color="#0284C7" />
                  <Text style={styles.metaLabel}>Nguồn bài báo:</Text>
                  <Text style={styles.metaValue}>
                    {selectedNotif?.sourceName || selectedNotif?.data?.sourceName || 'Bài báo trực tuyến'}
                  </Text>
                </View>
              )}

              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={14} color="#64748B" />
                <Text style={styles.metaLabel}>Thời gian:</Text>
                <Text style={styles.metaValue}>{formatRelativeTime(selectedNotif?.createdAt)}</Text>
              </View>
            </View>

            {/* Nội dung chi tiết */}
            <ScrollView style={styles.detailBodyScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.detailContentText}>{selectedNotif?.content}</Text>

              {/* Hướng dẫn an toàn nếu là cảnh báo khẩn cấp */}
              {selectedNotif && classifyNotification(selectedNotif) === 'alert' && (
                <View style={styles.safetyBox}>
                  <Text style={styles.safetyBoxTitle}>KHUYẾN CÁO AN TOÀN:</Text>
                  <Text style={styles.safetyBoxItem}>• Giữ liên lạc với lực lượng trực ban qua Hotline SOS 112.</Text>
                  <Text style={styles.safetyBoxItem}>• Ngắt nguồn cầu dao điện nếu nước tràn vào nhà.</Text>
                  <Text style={styles.safetyBoxItem}>• Di dời người già, trẻ nhỏ đến Vị trí an toàn gần nhất.</Text>
                </View>
              )}

              {/* Thẻ liên kết bài báo tham chiếu gốc */}
              {Boolean(selectedNotif?.articleUrl || selectedNotif?.data?.articleUrl) && (
                <TouchableOpacity
                  style={styles.articleRefCard}
                  onPress={() => {
                    const url = selectedNotif?.articleUrl || selectedNotif?.data?.articleUrl;
                    if (url) {
                      Linking.openURL(url).catch(() =>
                        Alert.alert('Không thể mở liên kết', 'Vui lòng kiểm tra lại đường dẫn bài báo.')
                      );
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.articleRefIconBox}>
                    <Ionicons name="newspaper" size={22} color="#0066FF" />
                  </View>
                  <View style={styles.articleRefTextBox}>
                    <View style={styles.articleRefTagRow}>
                      <Text style={styles.articleRefTag}>BÀI BÁO THAM CHIẾU GỐC</Text>
                      <Ionicons name="open-outline" size={12} color="#0066FF" />
                    </View>
                    <Text style={styles.articleRefTitle} numberOfLines={1}>
                      {selectedNotif?.sourceName || 'Đọc toàn văn bài báo'}
                    </Text>
                    <Text style={styles.articleRefUrl} numberOfLines={1}>
                      {selectedNotif?.articleUrl || selectedNotif?.data?.articleUrl}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </ScrollView>

            {/* Các nút hành động */}
            <View style={styles.detailActionsRow}>
              <TouchableOpacity
                style={styles.testPushBtn}
                onPress={() => selectedNotif && handleTestPush(selectedNotif)}
                activeOpacity={0.8}
              >
                <Ionicons name="notifications-outline" size={16} color="#0066FF" />
                <Text style={styles.testPushText}>Thử báo ra máy</Text>
              </TouchableOpacity>

              {onNavigateToTab && (
                <TouchableOpacity
                  style={styles.actionBtnPrimary}
                  onPress={() => {
                    setDetailVisible(false);
                    onNavigateToTab('map');
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="map-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.actionBtnPrimaryText}>Xem trên bản đồ</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
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
    paddingTop: Platform.OS === 'android' ? 24 : 10,
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
    backgroundColor: '#EFF6FF',
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066FF',
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Thanh bộ lọc ngang
  categoryFilterWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 10,
  },
  categoryFilterContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  chipIcon: {
    marginRight: 6,
  },
  categoryChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  categoryChipTextActive: {
    fontWeight: '700',
  },
  categoryCountBadge: {
    marginLeft: 6,
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
    minWidth: 18,
    alignItems: 'center',
  },
  unreadCountBadge: {
    backgroundColor: '#FEE2E2',
  },
  categoryCountText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  // Sub-filter bar
  subFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  pillBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
  },
  pillBtnActive: {
    backgroundColor: '#0F172A',
  },
  pillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  clearFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearFilterText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  // Banner cảnh báo khẩn cấp
  criticalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
  },
  criticalPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#DC2626',
  },
  criticalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  criticalTag: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.4,
  },
  criticalTime: {
    fontSize: 10,
    color: '#991B1B',
  },
  criticalTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7F1D1D',
  },
  // Danh sách thông báo
  newsList: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  newsListContent: {
    padding: 16,
    gap: 10,
  },
  newsCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  newsCardUnread: {
    backgroundColor: '#FFFFFF',
    borderColor: '#BFDBFE',
    borderLeftWidth: 3.5,
    borderLeftColor: '#0066FF',
  },
  newsCardAlertBorder: {
    borderLeftWidth: 3.5,
    borderLeftColor: '#DC2626',
  },
  newsIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  newsCardBody: {
    flex: 1,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  badgePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  badgePillText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  badgeCritical: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  badgeCriticalText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#DC2626',
  },
  badgeArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  badgeAreaText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#475569',
    maxWidth: 120,
  },
  badgeSource: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  badgeSourceText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#0284C7',
    maxWidth: 120,
  },
  cardContentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  newsThumbnail: {
    width: 68,
    height: 68,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  newsCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 19,
    marginBottom: 4,
  },
  newsCardTitleUnread: {
    fontWeight: '700',
    color: '#0F172A',
  },
  newsCardSnippet: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748B',
    marginBottom: 8,
  },
  newsCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  senderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  senderText: {
    fontSize: 11,
    color: '#94A3B8',
    maxWidth: 160,
  },
  timeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0066FF',
    marginLeft: 2,
  },
  // Empty State
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    minHeight: 320,
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
    color: '#1E293B',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  emptyResetBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#0066FF',
  },
  emptyResetText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Modal Chi tiết
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '86%',
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  detailCoverImage: {
    width: '100%',
    height: 160,
    borderRadius: 14,
    marginBottom: 14,
    backgroundColor: '#E2E8F0',
  },
  articleRefCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  articleRefIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  articleRefTextBox: {
    flex: 1,
  },
  articleRefTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  articleRefTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0066FF',
    letterSpacing: 0.3,
  },
  articleRefTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E3A8A',
    marginBottom: 2,
  },
  articleRefUrl: {
    fontSize: 11,
    color: '#64748B',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 22,
    marginTop: 6,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailMetaBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  metaValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
    flex: 1,
  },
  detailBodyScroll: {
    maxHeight: 240,
    marginBottom: 16,
  },
  detailContentText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#334155',
  },
  safetyBox: {
    marginTop: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  safetyBoxTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  safetyBoxItem: {
    fontSize: 12,
    lineHeight: 18,
    color: '#991B1B',
  },
  detailActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
  },
  testPushBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  testPushText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0066FF',
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#0066FF',
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { backendApi } from '@/api';
import { NotificationItem } from '@/types';
import {
  registerForPushNotificationsAsync,
  triggerLocalNotification,
} from '@/services';
import { useNotifications } from '@/context/NotificationContext';
import { formatRelativeTime } from '@/utils';

interface NewsScreenProps {
  onNavigateToTab?: (tab: string) => void;
}

// Fallback dữ liệu mẫu khi chưa kết nối máy chủ
const FALLBACK_NEWS: NotificationItem[] = [
  {
    _id: 'sample-instant-1',
    type: 'INSTANT',
    title: 'Cảnh báo ngập lụt khẩn cấp lưu vực Sông Hàn & Ngũ Hành Sơn',
    content:
      'Mực nước sông dâng nhanh trên 0.8m do mưa lớn kéo dài. Toàn bộ người dân vùng trũng thấp khẩn trương ngắt nguồn điện, di dời người già và trẻ nhỏ đến điểm trú ẩn an toàn của phường. Lực lượng cứu hộ đang túc trực ca-nô tại các chốt chính.',
    priority: 'CRITICAL',
    areaName: 'Quận Ngũ Hành Sơn',
    createdBy: {
      _id: 'sample-auth-1',
      fullName: 'Ban Chỉ huy PCTT & TKCN Đà Nẵng',
      roles: ['LOCAL_AUTHORITY'],
    },
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    actionUrl: 'map',
  },
  {
    _id: 'sample-instant-2',
    type: 'INSTANT',
    title: 'Cảnh báo bão đổ bộ sức gió cấp 9-10 tại khu vực ven biển Sơn Trà',
    content:
      'Gió giật mạnh nguy hiểm kèm mưa lớn. Yêu cầu toàn bộ người dân ở yên trong nhà kiên cố, chằng chống cửa nẻo, tuyệt đối không di chuyển trên đường hoặc đứng gần cây to, cột điện cao thế.',
    priority: 'HIGH',
    areaName: 'Quận Sơn Trà',
    createdBy: {
      _id: 'sample-auth-2',
      fullName: 'Trực ban tác chiến PCTT',
      roles: ['LOCAL_AUTHORITY'],
    },
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    actionUrl: 'map',
  },
  {
    _id: 'sample-system-1',
    type: 'SYSTEM',
    title: 'Nâng cấp hệ thống điều phối cứu nạn tự động phiên bản 2.5',
    content:
      'Hệ thống RescueSOS đã bổ sung tính năng tự động quét ca-nô gần nhất và phát thông báo khẩn cấp theo khu vực hành chính. Mọi yêu cầu cứu trợ sẽ được kết nối trực tiếp đến cán bộ địa phương phụ trách.',
    priority: 'NORMAL',
    areaName: 'Toàn thành phố Đà Nẵng',
    createdBy: {
      _id: 'sample-admin-1',
      fullName: 'Quản trị viên Hệ thống SOS',
      roles: ['ADMIN'],
    },
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  },
  {
    _id: 'sample-system-2',
    type: 'SYSTEM',
    title: 'Thông báo danh sách các điểm cấp phát nhu yếu phẩm & nước sạch',
    content:
      'Ban cứu trợ thông báo các điểm tiếp nhận và cấp phát lương khô, nước uống tinh khiết và thuốc men tại các Trạm y tế và Trường học trên địa bàn Hòa Vang, Cẩm Lệ.',
    priority: 'NORMAL',
    areaName: 'Huyện Hòa Vang',
    createdBy: {
      _id: 'sample-auth-3',
      fullName: 'Ủy ban Mặt trận Cứu trợ',
      roles: ['LOCAL_AUTHORITY'],
    },
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
  },
];


export const NewsScreen: React.FC<NewsScreenProps> = ({ onNavigateToTab }) => {
  const {
    notifications: liveNotifications,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    instantUnreadCount,
    systemUnreadCount,
    isRealtimeConnected,
  } = useNotifications();

  // Loại thông báo chính: INSTANT (Tin tức thời) hoặc SYSTEM (Thông báo hệ thống)
  const [activeCategory, setActiveCategory] = useState<'INSTANT' | 'SYSTEM'>('INSTANT');
  const [subFilter, setSubFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Modal chi tiết
  const [selectedNotif, setSelectedNotif] = useState<NotificationItem | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const notifications = liveNotifications.length > 0 ? liveNotifications : FALLBACK_NEWS;


  // Kéo xuống để làm mới (Pull-to-refresh)
  const handlePullRefresh = async () => {
    setRefreshing(true);
    await refreshNotifications();
    setRefreshing(false);
  };

  // Phân loại thông báo: Tin tức thời (INSTANT, ALERT, WEATHER, RESCUE) vs Hệ thống (SYSTEM)
  const isInstantType = (type?: string) => {
    const t = String(type || '').toUpperCase();
    return t === 'INSTANT' || t === 'TIN_TUC_THOI' || t === 'ALERT' || t === 'WEATHER' || t === 'RESCUE';
  };

  const isSystemType = (type?: string) => {
    const t = String(type || '').toUpperCase();
    return t === 'SYSTEM' || t === 'THONG_BAO_HE_THONG';
  };

  // Khử trùng lặp danh sách thông báo
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

  // Danh sách hiển thị sau khi lọc
  const filteredList = useMemo(() => {
    return uniqueNotifications.filter((item) => {
      // Lọc theo Category chính
      const matchCategory =
        activeCategory === 'INSTANT' ? isInstantType(item.type) : isSystemType(item.type);
      if (!matchCategory) return false;

      // Lọc theo subFilter (Tất cả / Chưa đọc)
      if (subFilter === 'UNREAD') {
        return !item.isRead;
      }
      return true;
    });
  }, [uniqueNotifications, activeCategory, subFilter]);

  // Tin khẩn cấp nổi bật nhất (nếu có tin tức thời CRITICAL chưa đọc)
  const topCriticalNews = useMemo(() => {
    return uniqueNotifications.find(
      (n) => isInstantType(n.type) && (n.priority === 'CRITICAL' || n.priority === 'HIGH')
    );
  }, [uniqueNotifications]);

  // Đánh dấu tất cả là đã đọc
  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  // Mở xem chi tiết thông báo
  const handleOpenDetail = async (item: NotificationItem) => {
    setSelectedNotif(item);
    setDetailVisible(true);

    if (!item.isRead) {
      await markAsRead(item._id);
    }
  };

  // Thử nghiệm phát chuông thông báo Local Push ra ngoài app
  const handleTestLocalPush = async (item: NotificationItem) => {
    await triggerLocalNotification({
      title: item.title,
      body: item.content,
      data: { notificationId: item._id, type: item.type },
      priority: item.priority as any,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ==================== 1. TOP HEADER ==================== */}
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.headerBadge}>TRUNG TÂM THÔNG TIN &amp; ĐIỀU HÀNH</Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isRealtimeConnected ? '#DCFCE7' : '#FEF3C7',
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 10,
                gap: 4,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: isRealtimeConnected ? '#16A34A' : '#D97706',
                }}
              />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: isRealtimeConnected ? '#15803D' : '#B45309',
                }}
              >
                {isRealtimeConnected ? 'SSE REALTIME' : 'ĐANG KẾT NỐI'}
              </Text>
            </View>
          </View>
          <Text style={styles.headerTitle}>Bản tin &amp; Thông báo</Text>
        </View>

        {(instantUnreadCount > 0 || systemUnreadCount > 0) && (
          <TouchableOpacity
            style={styles.markAllBtn}
            onPress={handleMarkAllRead}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark-done" size={16} color="#0066FF" />
            <Text style={styles.markAllText}>Đọc tất cả</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ==================== 2. MAIN CATEGORY SWITCHER (2 LOẠI: TIN TỨC THỜI & HỆ THỐNG) ==================== */}
      <View style={styles.categoryBar}>
        {/* Tab 1: Tin tức thời */}
        <TouchableOpacity
          style={[
            styles.categoryTab,
            activeCategory === 'INSTANT' && styles.categoryTabInstantActive,
          ]}
          onPress={() => setActiveCategory('INSTANT')}
          activeOpacity={0.8}
        >
          <View style={styles.categoryIconRow}>
            <Ionicons
              name={activeCategory === 'INSTANT' ? 'flash' : 'flash-outline'}
              size={18}
              color={activeCategory === 'INSTANT' ? '#EF4444' : '#64748B'}
            />
            <Text
              style={[
                styles.categoryTabText,
                activeCategory === 'INSTANT' && styles.categoryTabTextInstantActive,
              ]}
            >
              Tin tức thời
            </Text>
          </View>
          <Text style={styles.categorySubLabel}>Mưa lũ, sạt lở &amp; sơ tán</Text>

          {instantUnreadCount > 0 && (
            <View style={styles.categoryBadgeRed}>
              <Text style={styles.categoryBadgeText}>{instantUnreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Tab 2: Thông báo hệ thống */}
        <TouchableOpacity
          style={[
            styles.categoryTab,
            activeCategory === 'SYSTEM' && styles.categoryTabSystemActive,
          ]}
          onPress={() => setActiveCategory('SYSTEM')}
          activeOpacity={0.8}
        >
          <View style={styles.categoryIconRow}>
            <Ionicons
              name={activeCategory === 'SYSTEM' ? 'notifications' : 'notifications-outline'}
              size={18}
              color={activeCategory === 'SYSTEM' ? '#0066FF' : '#64748B'}
            />
            <Text
              style={[
                styles.categoryTabText,
                activeCategory === 'SYSTEM' && styles.categoryTabTextSystemActive,
              ]}
            >
              Thông báo hệ thống
            </Text>
          </View>
          <Text style={styles.categorySubLabel}>Bảo trì, chính sách &amp; app</Text>

          {systemUnreadCount > 0 && (
            <View style={styles.categoryBadgeBlue}>
              <Text style={styles.categoryBadgeText}>{systemUnreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ==================== 3. SUB-FILTER BAR (TẤT CẢ / CHƯA ĐỌC) ==================== */}
      <View style={styles.subFilterBar}>
        <View style={styles.pillsRow}>
          <TouchableOpacity
            style={[styles.pillBtn, subFilter === 'ALL' && styles.pillBtnActive]}
            onPress={() => setSubFilter('ALL')}
            activeOpacity={0.7}
          >
            <Text style={[styles.pillText, subFilter === 'ALL' && styles.pillTextActive]}>
              Tất cả
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pillBtn, subFilter === 'UNREAD' && styles.pillBtnActive]}
            onPress={() => setSubFilter('UNREAD')}
            activeOpacity={0.7}
          >
            <Text style={[styles.pillText, subFilter === 'UNREAD' && styles.pillTextActive]}>
              Chưa đọc
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.resultsCountText}>
          {filteredList.length} bản tin
        </Text>
      </View>

      {/* ==================== 4. BANNER CẢNH BÁO NGUY CẤP (NẾU CÓ) ==================== */}
      {activeCategory === 'INSTANT' && topCriticalNews && (
        <TouchableOpacity
          style={styles.criticalBanner}
          onPress={() => handleOpenDetail(topCriticalNews)}
          activeOpacity={0.85}
        >
          <View style={styles.criticalPulseDot} />
          <View style={{ flex: 1 }}>
            <View style={styles.criticalHeaderRow}>
              <Text style={styles.criticalTag}>CẢNH BÁO KHẨN CẤP ĐỊA PHƯƠNG</Text>
              <Text style={styles.criticalTime}>{formatRelativeTime(topCriticalNews.createdAt)}</Text>
            </View>
            <Text style={styles.criticalTitle} numberOfLines={1}>
              {topCriticalNews.title}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#991B1B" />
        </TouchableOpacity>
      )}

      {/* ==================== 5. DANH SÁCH BẢN TIN ==================== */}
      {loading && !refreshing ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#0066FF" />
          <Text style={styles.loadingText}>Đang cập nhật bản tin mới nhất...</Text>
        </View>
      ) : filteredList.length === 0 ? (
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
            <Ionicons
              name={activeCategory === 'INSTANT' ? 'shield-checkmark-outline' : 'mail-unread-outline'}
              size={48}
              color="#94A3B8"
            />
          </View>
          <Text style={styles.emptyTitle}>
            {activeCategory === 'INSTANT'
              ? 'Không có cảnh báo khẩn cấp nào'
              : 'Chưa có thông báo hệ thống mới'}
          </Text>
          <Text style={styles.emptyDesc}>
            {activeCategory === 'INSTANT'
              ? 'Khu vực của bạn hiện đang an toàn. Khi có thông báo bão lũ hoặc thiên tai từ chính quyền, bản tin sẽ được đẩy trực tiếp ra ngoài ứng dụng.'
              : 'Các thông báo bảo trì, nâng cấp phần mềm và phân phối cứu trợ sẽ xuất hiện tại đây.'}
          </Text>
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
            const isInstant = isInstantType(item.type);
            const isCritical = item.priority === 'CRITICAL' || item.priority === 'HIGH';

            return (
              <TouchableOpacity
                key={item._id}
                style={[
                  styles.newsCard,
                  !item.isRead && styles.newsCardUnread,
                  isInstant && isCritical && styles.newsCardCriticalBorder,
                ]}
                onPress={() => handleOpenDetail(item)}
                activeOpacity={0.85}
              >
                {/* Cột biểu tượng bên trái */}
                <View
                  style={[
                    styles.newsIconBox,
                    isInstant
                      ? isCritical
                        ? styles.newsIconBoxCritical
                        : styles.newsIconBoxInstant
                      : styles.newsIconBoxSystem,
                  ]}
                >
                  <Ionicons
                    name={
                      isInstant
                        ? isCritical
                          ? 'warning'
                          : 'cloud-done'
                        : 'information-circle'
                    }
                    size={24}
                    color={
                      isInstant
                        ? isCritical
                          ? '#EF4444'
                          : '#EA580C'
                        : '#0066FF'
                    }
                  />
                </View>

                {/* Nội dung bản tin */}
                <View style={styles.newsCardBody}>
                  {/* Hàng nhãn: Loại tin, Mức độ & Khu vực */}
                  <View style={styles.tagsRow}>
                    <View
                      style={[
                        styles.badgePill,
                        isInstant ? styles.badgeInstant : styles.badgeSystem,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgePillText,
                          isInstant ? styles.badgeInstantText : styles.badgeSystemText,
                        ]}
                      >
                        {isInstant ? '⚡ TIN TỨC THỜI' : '📢 HỆ THỐNG'}
                      </Text>
                    </View>

                    {item.priority === 'CRITICAL' && (
                      <View style={styles.badgeCritical}>
                        <Text style={styles.badgeCriticalText}>NGUY CẤP</Text>
                      </View>
                    )}

                    {Boolean(item.areaName) && (
                      <View style={styles.badgeArea}>
                        <Ionicons name="location-sharp" size={10} color="#475569" />
                        <Text style={styles.badgeAreaText} numberOfLines={1}>
                          {item.areaName}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Tiêu đề bản tin */}
                  <Text
                    style={[styles.newsCardTitle, !item.isRead && styles.newsCardTitleUnread]}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>

                  {/* Tóm tắt nội dung */}
                  <Text style={styles.newsCardSnippet} numberOfLines={2}>
                    {item.content}
                  </Text>

                  {/* Hàng thông tin cuối thẻ: Thời gian, Người phát & Chấm đỏ chưa đọc */}
                  <View style={styles.newsCardFooter}>
                    <View style={styles.senderWrap}>
                      <Ionicons name="person-circle-outline" size={13} color="#94A3B8" />
                      <Text style={styles.senderText} numberOfLines={1}>
                        {item.createdBy?.fullName || item.data?.senderName || 'Ban chỉ huy PCTT'}
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

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ==================== 6. MODAL XEM CHI TIẾT BẢN TIN ==================== */}
      <Modal
        visible={detailVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.detailCard}>
            <View style={styles.modalHandle} />

            {/* Header Modal */}
            <View style={styles.detailHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.tagsRow}>
                  <View
                    style={[
                      styles.badgePill,
                      isInstantType(selectedNotif?.type) ? styles.badgeInstant : styles.badgeSystem,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgePillText,
                        isInstantType(selectedNotif?.type)
                          ? styles.badgeInstantText
                          : styles.badgeSystemText,
                      ]}
                    >
                      {isInstantType(selectedNotif?.type) ? '⚡ TIN TỨC THỜI' : '📢 THÔNG BÁO HỆ THỐNG'}
                    </Text>
                  </View>

                  {selectedNotif?.priority === 'CRITICAL' && (
                    <View style={styles.badgeCritical}>
                      <Text style={styles.badgeCriticalText}>BÁO ĐỘNG ĐỎ</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.detailTitle}>{selectedNotif?.title}</Text>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setDetailVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Thông tin metadata: Khu vực + Người phát + Giờ */}
            <View style={styles.detailMetaBox}>
              <View style={styles.metaRow}>
                <Ionicons name="location" size={14} color="#0066FF" />
                <Text style={styles.metaLabel}>Địa bàn áp dụng:</Text>
                <Text style={styles.metaValue}>{selectedNotif?.areaName || 'Toàn thành phố'}</Text>
              </View>

              <View style={styles.metaRow}>
                <Ionicons name="shield-checkmark" size={14} color="#10B981" />
                <Text style={styles.metaLabel}>Cơ quan phát tin:</Text>
                <Text style={styles.metaValue}>
                  {selectedNotif?.createdBy?.fullName || selectedNotif?.data?.senderName || 'Ban chỉ huy PCTT'}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <Ionicons name="time" size={14} color="#64748B" />
                <Text style={styles.metaLabel}>Thời gian phát:</Text>
                <Text style={styles.metaValue}>{formatRelativeTime(selectedNotif?.createdAt)}</Text>
              </View>
            </View>

            {/* Nội dung chi tiết */}
            <ScrollView style={styles.detailBodyScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.detailContentText}>{selectedNotif?.content}</Text>

              {/* Hướng dẫn an toàn bổ sung nếu là tin khẩn cấp */}
              {isInstantType(selectedNotif?.type) && (
                <View style={styles.safetyBox}>
                  <Text style={styles.safetyBoxTitle}>KHUYẾN CÁO AN TOÀN CHO NGƯỜI DÂN:</Text>
                  <Text style={styles.safetyBoxItem}>• Giữ liên lạc với lực lượng trực ban qua Hotline SOS 112.</Text>
                  <Text style={styles.safetyBoxItem}>• Ngắt nguồn cầu dao điện nếu nước tràn vào nền nhà.</Text>
                  <Text style={styles.safetyBoxItem}>• Di dời người già, trẻ nhỏ đến các Điểm trú ẩn &amp; Trạm an toàn đã bố trí.</Text>
                </View>
              )}
            </ScrollView>

            {/* Các nút hành động phía dưới */}
            <View style={styles.detailActionsRow}>
              {/* Nút thử nghiệm phát chuông thông báo điện thoại */}
              <TouchableOpacity
                style={styles.testPushBtn}
                onPress={() => selectedNotif && handleTestLocalPush(selectedNotif)}
                activeOpacity={0.8}
              >
                <Ionicons name="notifications" size={16} color="#0066FF" />
                <Text style={styles.testPushText}>Thử báo ra điện thoại</Text>
              </TouchableOpacity>

              {/* Nút xem bản đồ nếu có liên kết */}
              {onNavigateToTab && (
                <TouchableOpacity
                  style={styles.actionBtnPrimary}
                  onPress={() => {
                    setDetailVisible(false);
                    onNavigateToTab('map');
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="map" size={16} color="#FFFFFF" />
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
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 32 : 12,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0066FF',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066FF',
  },
  categoryBar: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  categoryTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  categoryTabInstantActive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  categoryTabSystemActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
  },
  categoryIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  categoryTabTextInstantActive: {
    color: '#DC2626',
  },
  categoryTabTextSystemActive: {
    color: '#0066FF',
  },
  categorySubLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  categoryBadgeRed: {
    position: 'absolute',
    top: 6,
    right: 8,
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  categoryBadgeBlue: {
    position: 'absolute',
    top: 6,
    right: 8,
    backgroundColor: '#0066FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pillBtn: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
  },
  pillBtnActive: {
    backgroundColor: '#0F172A',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  resultsCountText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  criticalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    gap: 10,
  },
  criticalPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  criticalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  criticalTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  criticalTime: {
    fontSize: 11,
    color: '#991B1B',
  },
  criticalTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7F1D1D',
    marginTop: 2,
  },
  newsList: {
    flex: 1,
  },
  newsListContent: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 12,
  },
  newsCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  newsCardUnread: {
    borderColor: '#BFDBFE',
    backgroundColor: '#F8FAFC',
  },
  newsCardCriticalBorder: {
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  newsIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsIconBoxInstant: {
    backgroundColor: '#FFF7ED',
  },
  newsIconBoxCritical: {
    backgroundColor: '#FEF2F2',
  },
  newsIconBoxSystem: {
    backgroundColor: '#EFF6FF',
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
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeInstant: {
    backgroundColor: '#FEF2F2',
  },
  badgeSystem: {
    backgroundColor: '#EFF6FF',
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  badgeInstantText: {
    color: '#EF4444',
  },
  badgeSystemText: {
    color: '#0066FF',
  },
  badgeCritical: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#EF4444',
  },
  badgeCriticalText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  badgeArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  badgeAreaText: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '600',
  },
  newsCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    lineHeight: 20,
  },
  newsCardTitleUnread: {
    color: '#0F172A',
    fontWeight: '800',
  },
  newsCardSnippet: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 4,
  },
  newsCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
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
    color: '#64748B',
    fontWeight: '500',
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
    backgroundColor: '#EF4444',
    marginLeft: 4,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Modal Chi tiết
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 24,
    marginTop: 6,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailMetaBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    gap: 8,
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
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  detailBodyScroll: {
    maxHeight: 260,
    marginBottom: 16,
  },
  detailContentText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 22,
  },
  safetyBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 4,
  },
  safetyBoxTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B91C1C',
    marginBottom: 4,
  },
  safetyBoxItem: {
    fontSize: 12,
    color: '#7F1D1D',
    lineHeight: 18,
  },
  detailActionsRow: {
    flexDirection: 'row',
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

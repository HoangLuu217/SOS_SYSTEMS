import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Modal,
  TouchableWithoutFeedback,
  RefreshControl,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { PROFILE_THEME } from './theme';
import { NotificationItem } from '@/api';
import {
  formatRelativeTimeVi,
  classifyNotification,
  isWeatherNotification,
  NOTIFICATION_CATEGORIES,
  NotificationFilterKey,
} from '@/utils';
import { useNotifications } from '@/context/NotificationContext';

interface NotificationsScreenProps {
  onBack?: () => void;
  onNavigateToTab?: (tab: string, options?: any) => void;
  onNavigateToProfile?: () => void;
}

type ScreenStateMode = 'populated' | 'empty' | 'loading' | 'error';

const NOTIFICATION_ICON_MAP: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  RESCUE: 'navigation',
  WEATHER: 'cloud-rain',
  ALERT: 'alert-triangle',
  HAZARD: 'alert-triangle',
  SAFE_LOCATION: 'map-pin',
  BLOOD_DONATION: 'heart',
  SAFETY_CHECK: 'shield',
  CHAT: 'message-square',
  SYSTEM: 'bell',
};

const CATEGORY_FILTERS: { key: NotificationFilterKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'alert', label: NOTIFICATION_CATEGORIES.alert.shortLabel },
  { key: 'safeLocation', label: NOTIFICATION_CATEGORIES.safeLocation.shortLabel },
  { key: 'chat', label: NOTIFICATION_CATEGORIES.chat.shortLabel },
  { key: 'systemNotification', label: NOTIFICATION_CATEGORIES.systemNotification.shortLabel },
];

const stripLeadingEmoji = (text?: string): string => {
  const raw = String(text || '').trim();
  const cleaned = raw
    .replace(/^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?\s*)+/u, '')
    .trim();
  return cleaned || raw;
};

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
  onBack,
  onNavigateToTab,
  onNavigateToProfile,
}) => {
  const {
    notifications: realtimeNotifications,
    refreshNotifications,
    markAsRead: markContextNotificationAsRead,
    markAllAsRead: markContextNotificationsAsRead,
    deleteNotification: deleteContextNotification,
    settings,
    updateSetting,
  } = useNotifications();
  // Đồng bộ trực tiếp danh sách thông báo (loại trừ các bài viết thời tiết đã có ở tab Tin tức)
  const notifications = useMemo(
    () => realtimeNotifications.filter((n) => !isWeatherNotification(n)),
    [realtimeNotifications]
  );
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [selectedCategory, setSelectedCategory] = useState<NotificationFilterKey>('all');

  // Quản lý 4 trạng thái giao diện: Populated, Empty, Loading, Error
  const [screenState, setScreenState] = useState<ScreenStateMode>('populated');
  const [refreshing, setRefreshing] = useState(false);

  // Modal actions
  const [selectedNotif, setSelectedNotif] = useState<NotificationItem | null>(null);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [notifToDelete, setNotifToDelete] = useState<NotificationItem | null>(null);

  // Đồng bộ danh sách từ nguồn realtime dùng chung trong app.
  const loadNotifications = async (isPull = false) => {
    if (isPull) setRefreshing(true);

    try {
      await refreshNotifications();
    } catch {
      // Giữ nguyên danh sách hiện tại
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const onRefresh = () => {
    loadNotifications(true);
  };

  // Đọc tất cả thông báo
  const handleMarkAllAsRead = async () => {
    await markContextNotificationsAsRead();
  };

  // Đánh dấu 1 thông báo là đã đọc
  const handleMarkAsRead = async (item: NotificationItem) => {
    if (selectedNotif && selectedNotif._id === item._id) {
      setSelectedNotif({ ...selectedNotif, isRead: true });
    }
    setActionMenuVisible(false);

    await markContextNotificationAsRead(item._id);
  };

  // Mở menu 3 chấm
  const handleOpenMenu = (item: NotificationItem) => {
    setSelectedNotif(item);
    setActionMenuVisible(true);
  };

  // Mở xem chi tiết (tự động đánh dấu đã đọc khi xem)
  const handleOpenDetail = (item: NotificationItem) => {
    if (!item.isRead) {
      handleMarkAsRead(item);
    }
    const isChat = item.type === 'CHAT' || item.actionUrl === 'chat' || item.data?.isChat;
    if (isChat) {
      if (onNavigateToTab) onNavigateToTab('home');
      DeviceEventEmitter.emit('open:local_authority_chat', item.data || item);
      return;
    }
    setSelectedNotif({ ...item, isRead: true });
    setActionMenuVisible(false);
    setDetailModalVisible(true);
  };

  // Yêu cầu xóa
  const handlePromptDelete = (item: NotificationItem) => {
    setActionMenuVisible(false);
    setNotifToDelete(item);
    setDeleteConfirmVisible(true);
  };

  // Xác nhận xóa
  const handleConfirmDelete = async () => {
    if (!notifToDelete) return;
    const targetId = notifToDelete._id;
    setDeleteConfirmVisible(false);
    setNotifToDelete(null);

    await deleteContextNotification(targetId);
  };

  const getDetailActionConfig = (item: NotificationItem | null): { icon: string; label: string } | null => {
    if (!item) return null;
    if (item.actionUrl === 'safety_check' || item.type === 'SAFETY_CHECK' || item.data?.isSafetyCheck) {
      return { icon: 'shield', label: 'Đánh dấu an toàn ngay' };
    }
    if (item.actionUrl === 'chat' || item.type === 'CHAT' || item.data?.isChat) {
      return { icon: 'message-circle', label: 'Mở cuộc trò chuyện ngay' };
    }
    if (item.actionUrl === 'blood_donation' || item.type === 'BLOOD_DONATION' || item.data?.isBloodDonation) {
      return { icon: 'heart', label: 'Xem & Xác nhận đăng ký hiến máu' };
    }
    if (item.type === 'SAFE_LOCATION' || item.data?.safeLocationId) {
      return { icon: 'map-pin', label: 'Xem điểm trú ẩn trên bản đồ' };
    }
    if (item.type === 'HAZARD' || item.data?.hazardReportId) {
      return { icon: 'map', label: 'Xem điểm nguy hiểm trên bản đồ' };
    }
    if (item.actionUrl === 'sos_detail' || item.actionUrl === 'tracking') {
      return { icon: 'navigation', label: 'Xem tiến trình cứu trợ' };
    }
    if (item.actionUrl === 'map') {
      return { icon: 'map', label: 'Xem bản đồ cảnh báo' };
    }
    if (item.actionUrl === 'profile') {
      return { icon: 'user', label: 'Xem hồ sơ chuyên môn' };
    }
    if (item.actionUrl) {
      return { icon: 'arrow-right', label: 'Xem chi tiết' };
    }
    return null;
  };

  // Xử lý nút hành động trong modal chi tiết
  const handleDetailAction = (item: NotificationItem) => {
    setDetailModalVisible(false);
    if (
      item.actionUrl === 'safety_check' ||
      item.type === 'SAFETY_CHECK' ||
      item.data?.isSafetyCheck
    ) {
      const sid = item.data?.safetyCheckId || (item as any).safetyCheckId || item._id;
      DeviceEventEmitter.emit('open:safety_check', { safetyCheckId: sid });
    } else if (
      item.actionUrl === 'blood_donation' ||
      item.type === 'BLOOD_DONATION' ||
      item.data?.isBloodDonation
    ) {
      const eid = item.data?.eventId || (item as any).eventId;
      DeviceEventEmitter.emit('open:blood_donation', { eventId: eid });
    } else if (
      item.actionUrl === 'chat' ||
      item.type === 'CHAT' ||
      item.data?.isChat
    ) {
      if (onNavigateToTab) onNavigateToTab('home');
      DeviceEventEmitter.emit('open:local_authority_chat', item.data || item);
    } else if (item.type === 'SAFE_LOCATION' || item.data?.safeLocationId) {
      if (onNavigateToTab) onNavigateToTab('map', { filter: 'SAFE' });
    } else if (item.type === 'HAZARD' || item.data?.hazardReportId) {
      if (onNavigateToTab) onNavigateToTab('map', { filter: 'HAZARD' });
    } else if (item.actionUrl === 'sos_detail' || item.actionUrl === 'tracking') {
      if (onNavigateToTab) onNavigateToTab('sos');
    } else if (item.actionUrl === 'profile') {
      if (onNavigateToProfile) onNavigateToProfile();
      else if (onNavigateToTab) onNavigateToTab('profile');
    } else if (item.actionUrl === 'map') {
      if (onNavigateToTab) onNavigateToTab('map');
    }
  };

  // Tính số lượng đang bật (theo cài đặt) & số lượng chưa đọc động
  const enabledNotifications = useMemo(() => {
    if (settings.appEnabled === false) return [];
    return notifications.filter((n) => settings[classifyNotification(n)] !== false);
  }, [notifications, settings]);

  const unreadCount = useMemo(() => {
    return enabledNotifications.filter((n) => !n.isRead).length;
  }, [enabledNotifications]);

  // Lọc theo tab & danh mục trong cài đặt
  const displayList = useMemo(() => {
    if (screenState === 'empty') return [];
    return notifications.filter((n) => {
      const cat = classifyNotification(n);

      if (selectedCategory !== 'all') {
        if (cat !== selectedCategory) return false;
      } else {
        // Tab "Tất cả": chỉ hiển thị các nhóm thông báo đang BẬT trong Cài đặt
        if (settings.appEnabled === false || settings[cat] === false) return false;
      }

      if (activeTab === 'unread') {
        return !n.isRead;
      }
      return true;
    });
  }, [notifications, activeTab, selectedCategory, screenState, settings]);

  // Biểu tượng loại thông báo (monochrome, không màu)
  const renderTypeIcon = (type: string, isRead = false) => {
    const iconName = NOTIFICATION_ICON_MAP[type] || 'bell';
    return (
      <View style={[styles.typeIconBox, isRead && styles.typeIconBoxRead]}>
        <Feather name={iconName} size={16} color={isRead ? '#94A3B8' : '#475569'} />
      </View>
    );
  };

  const detailActionConfig = getDetailActionConfig(selectedNotif);
  const disabledSettingKey =
    settings.appEnabled === false
      ? ('appEnabled' as const)
      : selectedCategory !== 'all' && settings[selectedCategory] === false
        ? selectedCategory
        : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" {...({ backgroundColor: '#FFFFFF' } as any)} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onBack ? (
            <TouchableOpacity
              style={styles.backButton}
              onPress={onBack}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              testID="btn-back-notifications"
            >
              <Feather name="arrow-left" size={19} color="#0F172A" />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerIconBox}>
              <Feather name="bell" size={16} color="#475569" />
            </View>
          )}
          <Text style={styles.headerTitle}>Thông báo</Text>
        </View>

        {unreadCount > 0 && screenState === 'populated' && (
          <TouchableOpacity
            style={styles.markAllButton}
            onPress={handleMarkAllAsRead}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            testID="btn-mark-all-read"
          >
            <Feather name="check" size={13} color="#475569" />
            <Text style={styles.markAllText}>Đọc tất cả</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Thanh lọc gọn: Segmented Tất cả / Chưa đọc + Danh mục đơn sắc */}
      <View style={styles.filterToolbar}>
        <View style={styles.tabsContainer}>
          <View style={styles.segmentedTrack}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'all' && styles.tabButtonActive]}
              onPress={() => setActiveTab('all')}
              activeOpacity={0.75}
            >
              <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
                Tất cả
              </Text>
              <View style={[styles.tabCountBadge, activeTab === 'all' && styles.tabCountBadgeActive]}>
                <Text style={[styles.tabCountText, activeTab === 'all' && styles.tabCountTextActive]}>
                  {screenState === 'empty' ? 0 : enabledNotifications.length}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'unread' && styles.tabButtonActive]}
              onPress={() => setActiveTab('unread')}
              activeOpacity={0.75}
            >
              <Text style={[styles.tabText, activeTab === 'unread' && styles.tabTextActive]}>
                Chưa đọc
              </Text>
              {unreadCount > 0 && screenState !== 'empty' && (
                <View style={[styles.tabCountBadge, activeTab === 'unread' && styles.tabCountBadgeActive]}>
                  <Text style={[styles.tabCountText, activeTab === 'unread' && styles.tabCountTextActive]}>
                    {unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {CATEGORY_FILTERS.map((cat) => {
            const isSel = selectedCategory === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.categoryFilterChip, isSel && styles.categoryFilterChipActive]}
                onPress={() => setSelectedCategory(cat.key)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.categoryFilterChipText,
                    isSel && styles.categoryFilterChipTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ========================================================
          1. TRẠNG THÁI ĐANG TẢI (LOADING SKELETON)
         ======================================================== */}
      {screenState === 'loading' ? (
        <View style={styles.skeletonContainer}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <View style={styles.skeletonIcon} />
              <View style={styles.skeletonTextWrap}>
                <View style={styles.skeletonTitle} />
                <View style={styles.skeletonDesc} />
                <View style={styles.skeletonTime} />
              </View>
            </View>
          ))}
        </View>
      ) : screenState === 'error' ? (
        /* ========================================================
            2. TRẠNG THÁI LỖI (ERROR STATE)
           ======================================================== */
        <View style={styles.centerContainer}>
          <View style={styles.errorIconCircle}>
            <Feather name="wifi-off" size={24} color="#475569" />
          </View>
          <Text style={styles.errorTitle}>Không thể tải thông báo</Text>
          <Text style={styles.errorDesc}>
            Vui lòng kiểm tra kết nối mạng và bấm Thử lại để đồng bộ thông tin mới nhất.
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setScreenState('populated')}
            activeOpacity={0.8}
          >
            <Feather name="refresh-cw" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.retryButtonText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : displayList.length === 0 ? (
        /* ========================================================
            3. TRẠNG THÁI TRỐNG (EMPTY STATE)
           ======================================================== */
        <ScrollView
          contentContainerStyle={styles.centerContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#475569']}
              tintColor="#475569"
            />
          }
        >
          <View style={styles.emptyIconCircle}>
            <Feather
              name={settings.appEnabled === false ? 'bell-off' : 'inbox'}
              size={28}
              color="#64748B"
            />
          </View>
          <Text style={styles.emptyTitle}>
            {settings.appEnabled === false ? 'Thông báo ứng dụng đang tắt' : 'Bạn chưa có thông báo'}
          </Text>
          <Text style={styles.emptyDesc}>
            {settings.appEnabled === false
              ? 'Bật lại Thông báo ứng dụng trong Cài đặt thông báo để nhận các cảnh báo và tin nhắn mới.'
              : activeTab === 'unread'
                ? 'Tất cả thông báo điều phối và cảnh báo đều đã được đọc.'
                : 'Các thông báo khẩn cấp, cảnh báo địa bàn, điểm an toàn và cập nhật hệ thống sẽ hiển thị tại đây.'}
          </Text>
          {settings.appEnabled === false && (
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={() => updateSetting('appEnabled', true)}
              activeOpacity={0.8}
            >
              <Text style={styles.restoreButtonText}>Bật lại thông báo ứng dụng</Text>
            </TouchableOpacity>
          )}
          {screenState === 'empty' && (
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={() => setScreenState('populated')}
              activeOpacity={0.8}
            >
              <Text style={styles.restoreButtonText}>Xem thông báo mẫu</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : (
        /* ========================================================
            4. TRẠNG THÁI ĐẦY ĐỦ (POPULATED NOTIFICATIONS LIST)
           ======================================================== */
        <ScrollView
          style={styles.scrollList}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#475569']}
              tintColor="#475569"
            />
          }
        >
          {disabledSettingKey && (
            <View style={styles.categoryDisabledNotice}>
              <View style={styles.categoryDisabledNoticeLeft}>
                <Feather name="bell-off" size={14} color="#475569" />
                <Text style={styles.categoryDisabledNoticeText}>
                  {disabledSettingKey === 'appEnabled'
                    ? 'Bạn đang tắt toàn bộ Thông báo ứng dụng trong Cài đặt.'
                    : 'Bạn đang tắt nhóm thông báo này trong Cài đặt thông báo.'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.categoryReEnableBtn}
                onPress={() => updateSetting(disabledSettingKey, true)}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryReEnableBtnText}>Bật lại</Text>
              </TouchableOpacity>
            </View>
          )}

          {displayList.map((item) => (
            <TouchableOpacity
              key={item._id}
              style={[
                styles.notificationCard,
                !item.isRead ? styles.cardUnread : styles.cardRead,
              ]}
              onPress={() => handleOpenDetail(item)}
              activeOpacity={0.82}
              testID={`notif-card-${item._id}`}
            >
              {/* Type Icon (monochrome) */}
              {renderTypeIcon(item.type, item.isRead)}

              {/* Text Info */}
              <View style={styles.cardContent}>
                <View style={styles.cardTopRow}>
                  <Text
                    style={[styles.cardTitle, !item.isRead && styles.cardTitleUnread]}
                    numberOfLines={1}
                  >
                    {stripLeadingEmoji(item.title)}
                  </Text>
                  {!item.isRead && <View style={styles.unreadDot} />}
                  <TouchableOpacity
                    style={styles.moreButton}
                    onPress={() => handleOpenMenu(item)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    testID={`menu-${item._id}`}
                  >
                    <Feather name="more-vertical" size={15} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                {/* Short preview 2 lines */}
                <Text
                  style={[styles.cardPreview, item.isRead && styles.cardPreviewRead]}
                  numberOfLines={2}
                >
                  {item.content}
                </Text>

                <View style={styles.timeRow}>
                  <Feather name="clock" size={10.5} color="#94A3B8" />
                  <Text style={styles.timeText}>{formatRelativeTimeVi(item.createdAt)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}

          {/* Khoảng cách an toàn phía trên Bottom Navbar */}
          <View style={{ height: 48 }} />
        </ScrollView>
      )}

      {/* ========================================================
          MENU TÙY CHỌN 3 CHẤM (BOTTOM SHEET ACTION MENU)
         ======================================================== */}
      <Modal
        visible={actionMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMenuVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setActionMenuVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.bottomSheetCard}>
                <View style={styles.sheetHandle} />

                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {selectedNotif?.title ? stripLeadingEmoji(selectedNotif.title) : 'Tùy chọn thông báo'}
                </Text>

                {/* Tùy chọn 1: Xem chi tiết */}
                <TouchableOpacity
                  style={styles.sheetOption}
                  onPress={() => selectedNotif && handleOpenDetail(selectedNotif)}
                  activeOpacity={0.7}
                >
                  <View style={styles.sheetIconWrap}>
                    <Feather name="eye" size={17} color="#475569" />
                  </View>
                  <Text style={styles.sheetOptionText}>Xem chi tiết</Text>
                </TouchableOpacity>

                {/* Tùy chọn 2: Đánh dấu đã đọc (chỉ hiện khi chưa đọc) */}
                {selectedNotif && !selectedNotif.isRead && (
                  <TouchableOpacity
                    style={styles.sheetOption}
                    onPress={() => handleMarkAsRead(selectedNotif)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.sheetIconWrap}>
                      <Feather name="check" size={17} color="#475569" />
                    </View>
                    <Text style={styles.sheetOptionText}>Đánh dấu đã đọc</Text>
                  </TouchableOpacity>
                )}

                {/* Tùy chọn 3: Xóa thông báo */}
                <TouchableOpacity
                  style={styles.sheetOption}
                  onPress={() => selectedNotif && handlePromptDelete(selectedNotif)}
                  activeOpacity={0.7}
                >
                  <View style={styles.sheetIconWrap}>
                    <Feather name="trash-2" size={17} color="#475569" />
                  </View>
                  <Text style={styles.sheetOptionText}>Xóa thông báo</Text>
                </TouchableOpacity>

                {/* Nút Hủy */}
                <TouchableOpacity
                  style={styles.sheetCancelButton}
                  onPress={() => setActionMenuVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sheetCancelText}>Hủy</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ========================================================
          MODAL XEM CHI TIẾT THÔNG BÁO (NOTIFICATION DETAIL VIEW)
         ======================================================== */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDetailModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.detailCard}>
                <View style={styles.sheetHandle} />

                <View style={styles.detailHeaderRow}>
                  {selectedNotif && renderTypeIcon(selectedNotif.type)}
                  <View style={styles.detailHeaderTextWrap}>
                    <Text style={styles.detailTitle}>
                      {stripLeadingEmoji(selectedNotif?.title)}
                    </Text>
                    <Text style={styles.detailTime}>
                      {formatRelativeTimeVi(selectedNotif?.createdAt)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setDetailModalVisible(false)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.detailCloseBtn}
                  >
                    <Feather name="x" size={19} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <View style={styles.detailDivider} />

                {/* Nội dung chi tiết đầy đủ */}
                <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
                  <Text style={styles.detailContent}>{selectedNotif?.content}</Text>
                </ScrollView>

                {/* Nút hành động tương ứng khi có liên kết nghiệp vụ */}
                {detailActionConfig && selectedNotif && (
                  <TouchableOpacity
                    style={styles.detailActionButton}
                    onPress={() => handleDetailAction(selectedNotif)}
                    activeOpacity={0.8}
                  >
                    <Feather
                      name={detailActionConfig.icon as any}
                      size={15}
                      color="#FFFFFF"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.detailActionText}>
                      {detailActionConfig.label}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.detailDismissButton}
                  onPress={() => setDetailModalVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.detailDismissText}>Đóng</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ========================================================
          HỘP THOẠI XÁC NHẬN XÓA (DELETE CONFIRMATION DIALOG)
         ======================================================== */}
      <Modal
        visible={deleteConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirmVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDeleteConfirmVisible(false)}>
          <View style={styles.dialogOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.dialogBox}>
                <View style={styles.dialogIconCircle}>
                  <Feather name="trash-2" size={22} color="#475569" />
                </View>
                <Text style={styles.dialogTitle}>Xóa thông báo?</Text>
                <Text style={styles.dialogMessage}>
                  Bạn có chắc chắn muốn xóa thông báo này? Hành động này không thể hoàn tác.
                </Text>

                <View style={styles.dialogButtonRow}>
                  <TouchableOpacity
                    style={styles.dialogCancelBtn}
                    onPress={() => setDeleteConfirmVisible(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dialogCancelText}>Hủy</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.dialogConfirmBtn}
                    onPress={handleConfirmDelete}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dialogConfirmText}>Xóa</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 9,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    gap: 4,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },

  /* Unified Compact Filter Toolbar */
  filterToolbar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabsContainer: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 6,
  },
  segmentedTrack: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 9,
    padding: 3,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5.5,
    borderRadius: 7,
    gap: 5,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  tabCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
  },
  tabCountBadgeActive: {
    backgroundColor: '#0F172A',
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  tabCountTextActive: {
    color: '#FFFFFF',
  },

  /* Category Filter Chips (text-only monochrome) */
  categoryScrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 6,
  },
  categoryFilterChip: {
    paddingVertical: 4.5,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryFilterChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  categoryFilterChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  categoryFilterChipTextActive: {
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* Notification List */
  scrollList: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  cardUnread: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
  },
  cardRead: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  typeIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  typeIconBoxRead: {
    backgroundColor: '#F1F5F9',
    opacity: 0.75,
  },
  cardContent: {
    flex: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#475569',
    flex: 1,
  },
  cardTitleUnread: {
    fontWeight: '700',
    color: '#0F172A',
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0066FF',
  },
  moreButton: {
    width: 24,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPreview: {
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 17.5,
    marginBottom: 5,
  },
  cardPreviewRead: {
    color: '#64748B',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },

  /* Center Container (Empty / Error) */
  centerContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
  },
  restoreButton: {
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#0F172A',
    borderRadius: 10,
  },
  restoreButtonText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  errorIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  errorDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
  },

  /* Skeleton Loading */
  skeletonContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 8,
  },
  skeletonCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  skeletonIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#E2E8F0',
    marginRight: 10,
  },
  skeletonTextWrap: {
    flex: 1,
    gap: 6,
  },
  skeletonTitle: {
    width: '60%',
    height: 12,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
  },
  skeletonDesc: {
    width: '90%',
    height: 10,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
  },
  skeletonTime: {
    width: '28%',
    height: 9,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
  },

  /* Bottom Sheet Action Menu */
  modalOverlay: {
    flex: 1,
    backgroundColor: PROFILE_THEME.colors.overlay,
    justifyContent: 'flex-end',
  },
  bottomSheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: PROFILE_THEME.radius.sheet,
    borderTopRightRadius: PROFILE_THEME.radius.sheet,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  sheetIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetOptionText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  sheetCancelButton: {
    marginTop: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  sheetCancelText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#475569',
  },

  /* Detail Card Modal */
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: PROFILE_THEME.radius.sheet,
    borderTopRightRadius: PROFILE_THEME.radius.sheet,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '80%',
  },
  detailHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  detailHeaderTextWrap: {
    flex: 1,
    marginLeft: 10,
  },
  detailTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  detailTime: {
    fontSize: 11.5,
    color: '#94A3B8',
  },
  detailCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  detailScroll: {
    maxHeight: 220,
    marginBottom: 18,
  },
  detailContent: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 21,
  },
  detailActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    minHeight: 46,
    marginBottom: 8,
  },
  detailActionText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  detailDismissButton: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  detailDismissText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },

  /* Delete Confirmation Dialog */
  dialogOverlay: {
    flex: 1,
    backgroundColor: PROFILE_THEME.colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  dialogBox: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
  },
  dialogIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dialogTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  dialogMessage: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
  },
  dialogButtonRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  dialogCancelBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  dialogConfirmBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  categoryDisabledNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    gap: 8,
  },
  categoryDisabledNoticeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  categoryDisabledNoticeText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
    flex: 1,
  },
  categoryReEnableBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
  },
  categoryReEnableBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
});

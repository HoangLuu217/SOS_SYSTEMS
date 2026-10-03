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
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { PROFILE_THEME } from './theme';
import { backendApi, NotificationItem } from '../../services/backendApi';

interface NotificationsScreenProps {
  onBack?: () => void;
  onNavigateToTab?: (tab: string) => void;
  onNavigateToProfile?: () => void;
}

// Dữ liệu thông báo thực tế cho nhân viên cứu hộ cứu nạn
const INITIAL_RESCUER_NOTIFICATIONS: NotificationItem[] = [
  {
    _id: 'notif-assignment-1',
    type: 'RESCUE',
    title: 'Phân công nhiệm vụ cứu hộ khẩn cấp #SOS-2849',
    content:
      'Bạn được Trung tâm điều phối giao nhiệm vụ ứng cứu 3 người dân bị cô lập do lũ dâng cao tại Thôn An Sơn, Xã Hòa Khương, Huyện Hòa Vang, TP. Đà Nẵng. Phương tiện yêu cầu: Xuồng cứu sinh. Vui lòng phản hồi trạng thái và di chuyển tới vị trí tập kết ngay lập tức.',
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 phút trước
    actionUrl: 'sos_detail',
  },
  {
    _id: 'notif-verification-2',
    type: 'SYSTEM',
    title: 'Kết quả thẩm định hồ sơ cứu hộ chuyên môn',
    content:
      'Chúc mừng Nguyễn Minh An! Hồ sơ năng lực cứu hộ chuyên môn của bạn đã được Ban chỉ huy Phòng chống thiên tai & Tìm kiếm cứu nạn xác minh thành công. Trạng thái: Hồ sơ cứu hộ đã xác minh. Bạn đã đủ điều kiện tiếp nhận và chỉ huy các nhiệm vụ cứu nạn cấp bách.',
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 giờ trước
    actionUrl: 'profile',
  },
  {
    _id: 'notif-weather-3',
    type: 'WEATHER',
    title: 'Cảnh báo thời tiết nguy hiểm: Mưa lũ đặc biệt lớn',
    content:
      'Trung tâm Dự báo Khí tượng Thủy văn Quốc gia phát cảnh báo đỏ: Mưa rất to lượng mưa từ 200 - 380mm gây ngập lụt sâu và nguy cơ sạt lở đất nghiêm trọng tại lưu vực sông Vu Gia - Thu Bồn. Đề nghị toàn bộ đội viên cứu hộ duy trì trạng thái "Sẵn sàng" trực chiến 24/24.',
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), // 5 giờ trước
    actionUrl: 'map',
  },
  {
    _id: 'notif-update-4',
    type: 'ALERT',
    title: 'Cập nhật tình hình sơ tán tại Xã Hòa Tiến',
    content:
      'Đội phản ứng nhanh số 2 đã hoàn tất việc hỗ trợ sơ tán 18 hộ dân vùng trũng thấp ven sông về nhà văn hóa an toàn. Áo phao và nước uống tinh khiết đã được cấp phát đầy đủ.',
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 ngày trước
    actionUrl: 'sos_detail',
  },
  {
    _id: 'notif-system-5',
    type: 'SYSTEM',
    title: 'Kích hoạt tài khoản nhân viên cứu hộ thành công',
    content:
      'Tài khoản cứu hộ của bạn đã được kích hoạt thành công trên hệ thống điều phối cứu nạn RescueSOS. Trạng thái tài khoản: Đang hoạt động.',
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 ngày trước
    actionUrl: 'profile',
  },
];

// Chuyển đổi thời gian hiển thị tiếng Việt tự nhiên
const formatRelativeTimeVi = (dateString?: string) => {
  if (!dateString) return 'Vừa xong';
  const now = new Date();
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Vừa xong';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} phút trước`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} giờ trước`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return 'Hôm qua';
  if (diffInDays < 7) return `${diffInDays} ngày trước`;
  return date.toLocaleDateString('vi-VN');
};

type ScreenStateMode = 'populated' | 'empty' | 'loading' | 'error';

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
  onBack,
  onNavigateToTab,
  onNavigateToProfile,
}) => {
  // Trạng thái danh sách thông báo
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_RESCUER_NOTIFICATIONS);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');

  // Quản lý 4 trạng thái giao diện: Populated, Empty, Loading, Error
  const [screenState, setScreenState] = useState<ScreenStateMode>('populated');
  const [refreshing, setRefreshing] = useState(false);

  // Modal actions
  const [selectedNotif, setSelectedNotif] = useState<NotificationItem | null>(null);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [notifToDelete, setNotifToDelete] = useState<NotificationItem | null>(null);

  // Tải dữ liệu từ backend hoặc fallback danh sách cứu hộ thực tế
  const loadNotifications = async (isPull = false) => {
    if (isPull) setRefreshing(true);

    try {
      const res = await backendApi.getNotifications();
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        setNotifications(res.data);
      }
    } catch {
      // Giữ nguyên dữ liệu cứu hộ mẫu
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
    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    try {
      await backendApi.markAllNotificationsAsRead();
    } catch {
      // Ignored
    }
  };

  // Đánh dấu 1 thông báo là đã đọc
  const handleMarkAsRead = async (item: NotificationItem) => {
    setNotifications((prev) =>
      prev.map((n) => (n._id === item._id ? { ...n, isRead: true } : n))
    );
    if (selectedNotif && selectedNotif._id === item._id) {
      setSelectedNotif({ ...selectedNotif, isRead: true });
    }
    setActionMenuVisible(false);

    try {
      await backendApi.markNotificationAsRead(item._id);
    } catch {
      // Ignored
    }
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
    setNotifications((prev) => prev.filter((n) => n._id !== targetId));
    setDeleteConfirmVisible(false);
    setNotifToDelete(null);

    try {
      await backendApi.deleteNotification(targetId);
    } catch {
      // Ignored
    }
  };

  // Xử lý nút hành động trong modal chi tiết
  const handleDetailAction = (item: NotificationItem) => {
    setDetailModalVisible(false);
    if (item.actionUrl === 'sos_detail' || item.actionUrl === 'tracking') {
      if (onNavigateToTab) onNavigateToTab('sos');
    } else if (item.actionUrl === 'profile') {
      if (onNavigateToProfile) onNavigateToProfile();
      else if (onNavigateToTab) onNavigateToTab('profile');
    } else if (item.actionUrl === 'map') {
      if (onNavigateToTab) onNavigateToTab('map');
    }
  };

  // Tính số lượng chưa đọc động
  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length;
  }, [notifications]);

  // Lọc theo tab
  const displayList = useMemo(() => {
    if (screenState === 'empty') return [];
    if (activeTab === 'unread') {
      return notifications.filter((n) => !n.isRead);
    }
    return notifications;
  }, [notifications, activeTab, screenState]);

  // Biểu tượng loại thông báo cứu hộ
  const renderTypeIcon = (type: string) => {
    switch (type) {
      case 'RESCUE':
        return (
          <View style={[styles.typeIconBox, { backgroundColor: '#EFF6FF' }]}>
            <Feather name="navigation" size={20} color="#2563EB" />
          </View>
        );
      case 'WEATHER':
        return (
          <View style={[styles.typeIconBox, { backgroundColor: '#FEF3C7' }]}>
            <Feather name="cloud-rain" size={20} color="#D97706" />
          </View>
        );
      case 'ALERT':
        return (
          <View style={[styles.typeIconBox, { backgroundColor: '#FEF2F2' }]}>
            <Feather name="alert-triangle" size={20} color={PROFILE_THEME.colors.primary} />
          </View>
        );
      case 'SYSTEM':
      default:
        return (
          <View style={[styles.typeIconBox, { backgroundColor: '#ECFDF5' }]}>
            <Feather name="check-circle" size={20} color="#10B981" />
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={PROFILE_THEME.colors.background} />

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
              <Feather name="arrow-left" size={24} color={PROFILE_THEME.colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerIconBox}>
              <Feather name="bell" size={20} color={PROFILE_THEME.colors.primary} />
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
            <Feather name="check" size={15} color={PROFILE_THEME.colors.primary} />
            <Text style={styles.markAllText}>Đọc tất cả</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Trình chuyển đổi 4 trạng thái giao diện (Populated, Empty, Loading, Error) */}
      <View style={styles.stateBarContainer}>
        <Text style={styles.stateBarLabel}>Trạng thái xem:</Text>
        <View style={styles.statePillsRow}>
          <TouchableOpacity
            style={[styles.statePill, screenState === 'populated' && styles.statePillActive]}
            onPress={() => setScreenState('populated')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.statePillText,
                screenState === 'populated' && styles.statePillTextActive,
              ]}
            >
              Đầy đủ
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statePill, screenState === 'empty' && styles.statePillActive]}
            onPress={() => setScreenState('empty')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.statePillText,
                screenState === 'empty' && styles.statePillTextActive,
              ]}
            >
              Trống
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statePill, screenState === 'loading' && styles.statePillActive]}
            onPress={() => setScreenState('loading')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.statePillText,
                screenState === 'loading' && styles.statePillTextActive,
              ]}
            >
              Đang tải
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statePill, screenState === 'error' && styles.statePillActive]}
            onPress={() => setScreenState('error')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.statePillText,
                screenState === 'error' && styles.statePillTextActive,
              ]}
            >
              Lỗi mạng
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Tabs: Tất cả & Chưa đọc kèm số lượng động */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'all' && styles.tabButtonActive]}
          onPress={() => setActiveTab('all')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
            Tất cả
          </Text>
          <View style={[styles.tabCountBadge, activeTab === 'all' && styles.tabCountBadgeActive]}>
            <Text style={[styles.tabCountText, activeTab === 'all' && styles.tabCountTextActive]}>
              {screenState === 'empty' ? 0 : notifications.length}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'unread' && styles.tabButtonActive]}
          onPress={() => setActiveTab('unread')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'unread' && styles.tabTextActive]}>
            Chưa đọc
          </Text>
          {unreadCount > 0 && screenState !== 'empty' && (
            <View style={[styles.unreadBadge, activeTab === 'unread' && styles.unreadBadgeActive]}>
              <Text
                style={[
                  styles.unreadBadgeText,
                  activeTab === 'unread' && styles.unreadBadgeTextActive,
                ]}
              >
                {unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
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
            <Feather name="wifi-off" size={32} color={PROFILE_THEME.colors.primary} />
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
            <Feather name="refresh-cw" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
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
              colors={[PROFILE_THEME.colors.primary]}
              tintColor={PROFILE_THEME.colors.primary}
            />
          }
        >
          <View style={styles.emptyIconCircle}>
            <Feather name="inbox" size={36} color={PROFILE_THEME.colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Bạn chưa có thông báo</Text>
          <Text style={styles.emptyDesc}>
            {activeTab === 'unread'
              ? 'Tất cả thông báo điều phối và cảnh báo đều đã được đọc.'
              : 'Các thông báo khẩn cấp, phân công nhiệm vụ và cảnh báo thời tiết sẽ hiển thị tại đây.'}
          </Text>
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
              colors={[PROFILE_THEME.colors.primary]}
              tintColor={PROFILE_THEME.colors.primary}
            />
          }
        >
          {displayList.map((item) => (
            <TouchableOpacity
              key={item._id}
              style={[
                styles.notificationCard,
                !item.isRead ? styles.cardUnread : styles.cardRead,
              ]}
              onPress={() => handleOpenDetail(item)}
              activeOpacity={0.85}
              testID={`notif-card-${item._id}`}
            >
              {/* Type Icon */}
              {renderTypeIcon(item.type)}

              {/* Text Info */}
              <View style={styles.cardContent}>
                <View style={styles.cardTopRow}>
                  <Text
                    style={[styles.cardTitle, !item.isRead && styles.cardTitleUnread]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  {!item.isRead && <View style={styles.coralDot} />}
                </View>

                {/* Short preview 2 lines */}
                <Text style={styles.cardPreview} numberOfLines={2}>
                  {item.content}
                </Text>

                <View style={styles.cardBottomRow}>
                  <View style={styles.timeRow}>
                    <Feather name="clock" size={11} color={PROFILE_THEME.colors.textMuted} />
                    <Text style={styles.timeText}>{formatRelativeTimeVi(item.createdAt)}</Text>
                  </View>
                </View>
              </View>

              {/* Nút 3 chấm mở tùy chọn */}
              <TouchableOpacity
                style={styles.moreButton}
                onPress={() => handleOpenMenu(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                testID={`menu-${item._id}`}
              >
                <Feather
                  name="more-vertical"
                  size={18}
                  color={PROFILE_THEME.colors.textSecondary}
                />
              </TouchableOpacity>
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
                  {selectedNotif?.title || 'Tùy chọn thông báo'}
                </Text>

                {/* Tùy chọn 1: Xem chi tiết */}
                <TouchableOpacity
                  style={styles.sheetOption}
                  onPress={() => selectedNotif && handleOpenDetail(selectedNotif)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.sheetIconWrap, { backgroundColor: '#F1F5F9' }]}>
                    <Feather name="eye" size={18} color={PROFILE_THEME.colors.textPrimary} />
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
                    <View
                      style={[
                        styles.sheetIconWrap,
                        { backgroundColor: PROFILE_THEME.colors.successLight },
                      ]}
                    >
                      <Feather name="check" size={18} color={PROFILE_THEME.colors.success} />
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
                  <View
                    style={[
                      styles.sheetIconWrap,
                      { backgroundColor: PROFILE_THEME.colors.primaryLight },
                    ]}
                  >
                    <Feather name="trash-2" size={18} color={PROFILE_THEME.colors.primary} />
                  </View>
                  <Text style={[styles.sheetOptionText, { color: PROFILE_THEME.colors.primary }]}>
                    Xóa thông báo
                  </Text>
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
                    <Text style={styles.detailTitle}>{selectedNotif?.title}</Text>
                    <Text style={styles.detailTime}>
                      {formatRelativeTimeVi(selectedNotif?.createdAt)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setDetailModalVisible(false)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.detailCloseBtn}
                  >
                    <Feather name="x" size={20} color={PROFILE_THEME.colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.detailDivider} />

                {/* Nội dung chi tiết đầy đủ */}
                <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
                  <Text style={styles.detailContent}>{selectedNotif?.content}</Text>
                </ScrollView>

                {/* Nút hành động tương ứng khi có liên kết nghiệp vụ */}
                {selectedNotif?.actionUrl && (
                  <TouchableOpacity
                    style={styles.detailActionButton}
                    onPress={() => handleDetailAction(selectedNotif)}
                    activeOpacity={0.8}
                  >
                    <Feather
                      name={
                        selectedNotif.actionUrl === 'sos_detail'
                          ? 'navigation'
                          : selectedNotif.actionUrl === 'map'
                          ? 'map'
                          : 'arrow-right'
                      }
                      size={16}
                      color="#FFFFFF"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.detailActionText}>
                      {selectedNotif.actionUrl === 'sos_detail'
                        ? 'Xem tiến trình cứu trợ'
                        : selectedNotif.actionUrl === 'map'
                        ? 'Xem bản đồ cảnh báo'
                        : selectedNotif.actionUrl === 'profile'
                        ? 'Xem hồ sơ chuyên môn'
                        : 'Xem chi tiết'}
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
                  <Feather name="trash-2" size={24} color={PROFILE_THEME.colors.primary} />
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
    backgroundColor: PROFILE_THEME.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: PROFILE_THEME.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: PROFILE_THEME.colors.borderLight,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PROFILE_THEME.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  headerIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PROFILE_THEME.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: PROFILE_THEME.colors.textPrimary,
  },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: PROFILE_THEME.colors.primaryLight,
    borderRadius: 14,
    gap: 5,
    minHeight: 36,
  },
  markAllText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: PROFILE_THEME.colors.primary,
  },

  /* State Bar Switcher */
  stateBarContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  stateBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: PROFILE_THEME.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  statePillsRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  statePill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 8,
  },
  statePillActive: {
    backgroundColor: PROFILE_THEME.colors.primary,
  },
  statePillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: PROFILE_THEME.colors.textSecondary,
  },
  statePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  /* Tabs */
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: PROFILE_THEME.colors.card,
    borderWidth: 1,
    borderColor: PROFILE_THEME.colors.border,
    minHeight: 40,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: PROFILE_THEME.colors.primary,
    borderColor: PROFILE_THEME.colors.primary,
  },
  tabText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: PROFILE_THEME.colors.textSecondary,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  tabCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  tabCountBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: PROFILE_THEME.colors.textSecondary,
  },
  tabCountTextActive: {
    color: '#FFFFFF',
  },
  unreadBadge: {
    backgroundColor: PROFILE_THEME.colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
  },
  unreadBadgeActive: {
    backgroundColor: '#FFFFFF',
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: PROFILE_THEME.colors.primary,
  },
  unreadBadgeTextActive: {
    color: PROFILE_THEME.colors.primary,
  },

  /* Notification List */
  scrollList: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: PROFILE_THEME.radius.card,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardUnread: {
    backgroundColor: '#FFF8F8', // subtle coral tint for unread
    borderColor: '#FEE2E2',
  },
  cardRead: {
    backgroundColor: PROFILE_THEME.colors.card, // pure white for read
    borderColor: PROFILE_THEME.colors.borderLight,
  },
  typeIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingRight: 6,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    color: PROFILE_THEME.colors.textPrimary,
    flex: 1,
  },
  cardTitleUnread: {
    fontWeight: '700',
    color: PROFILE_THEME.colors.textPrimary,
  },
  coralDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PROFILE_THEME.colors.primary,
    marginLeft: 6,
  },
  cardPreview: {
    fontSize: 13,
    color: PROFILE_THEME.colors.textSecondary,
    lineHeight: 18.5,
    marginBottom: 8,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 11.5,
    color: PROFILE_THEME.colors.textMuted,
    fontWeight: '500',
  },
  moreButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },

  /* Center Container (Empty / Error) */
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingVertical: 60,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: PROFILE_THEME.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: PROFILE_THEME.colors.border,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: PROFILE_THEME.colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13.5,
    color: PROFILE_THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  restoreButton: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: PROFILE_THEME.colors.primaryLight,
    borderRadius: 12,
  },
  restoreButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: PROFILE_THEME.colors.primary,
  },
  errorIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: PROFILE_THEME.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: PROFILE_THEME.colors.textPrimary,
    marginBottom: 6,
  },
  errorDesc: {
    fontSize: 13.5,
    color: PROFILE_THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PROFILE_THEME.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: PROFILE_THEME.radius.button,
    minHeight: 44,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  /* Skeleton Loading */
  skeletonContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  skeletonCard: {
    flexDirection: 'row',
    backgroundColor: PROFILE_THEME.colors.card,
    borderRadius: PROFILE_THEME.radius.card,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PROFILE_THEME.colors.borderLight,
  },
  skeletonIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
    marginRight: 14,
  },
  skeletonTextWrap: {
    flex: 1,
    gap: 8,
  },
  skeletonTitle: {
    width: '65%',
    height: 14,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
  },
  skeletonDesc: {
    width: '90%',
    height: 12,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
  },
  skeletonTime: {
    width: '30%',
    height: 10,
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
    backgroundColor: PROFILE_THEME.colors.card,
    borderTopLeftRadius: PROFILE_THEME.radius.sheet,
    borderTopRightRadius: PROFILE_THEME.radius.sheet,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PROFILE_THEME.colors.textPrimary,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 48,
    gap: 12,
  },
  sheetIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: PROFILE_THEME.colors.textPrimary,
  },
  sheetCancelButton: {
    marginTop: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: PROFILE_THEME.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  sheetCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: PROFILE_THEME.colors.textSecondary,
  },

  /* Detail Card Modal */
  detailCard: {
    backgroundColor: PROFILE_THEME.colors.card,
    borderTopLeftRadius: PROFILE_THEME.radius.sheet,
    borderTopRightRadius: PROFILE_THEME.radius.sheet,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  detailHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  detailHeaderTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PROFILE_THEME.colors.textPrimary,
    marginBottom: 2,
  },
  detailTime: {
    fontSize: 12,
    color: PROFILE_THEME.colors.textMuted,
  },
  detailCloseBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailDivider: {
    height: 1,
    backgroundColor: PROFILE_THEME.colors.borderLight,
    marginVertical: 16,
  },
  detailScroll: {
    maxHeight: 220,
    marginBottom: 20,
  },
  detailContent: {
    fontSize: 14.5,
    color: PROFILE_THEME.colors.textPrimary,
    lineHeight: 22,
  },
  detailActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PROFILE_THEME.colors.primary,
    borderRadius: PROFILE_THEME.radius.button,
    minHeight: 48,
    marginBottom: 10,
    shadowColor: PROFILE_THEME.colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 2,
  },
  detailActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  detailDismissButton: {
    backgroundColor: '#F1F5F9',
    borderRadius: PROFILE_THEME.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  detailDismissText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: PROFILE_THEME.colors.textSecondary,
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
    backgroundColor: PROFILE_THEME.colors.card,
    borderRadius: PROFILE_THEME.radius.card,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  dialogIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: PROFILE_THEME.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: PROFILE_THEME.colors.textPrimary,
    marginBottom: 8,
  },
  dialogMessage: {
    fontSize: 13.5,
    color: PROFILE_THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  dialogButtonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  dialogCancelBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: PROFILE_THEME.radius.button,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogCancelText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: PROFILE_THEME.colors.textSecondary,
  },
  dialogConfirmBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: PROFILE_THEME.radius.button,
    backgroundColor: PROFILE_THEME.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogConfirmText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

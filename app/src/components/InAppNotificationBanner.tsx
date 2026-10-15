import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNotifications } from '../context/NotificationContext';

interface Props {
  onNavigateToNews?: () => void;
}

export const InAppNotificationBanner: React.FC<Props> = ({ onNavigateToNews }) => {
  const insets = useSafeAreaInsets();
  const { latestEmergencyAlert, dismissEmergencyAlert, markAsRead } = useNotifications();
  const translateY = useRef(new Animated.Value(-140)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (latestEmergencyAlert) {
      // Clear timeout cũ nếu có
      if (timerRef.current) clearTimeout(timerRef.current);

      // Hiệu ứng trượt xuống từ mép trên màn hình
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      // Tự động thu lại sau 9 giây nếu người dùng không tương tác
      timerRef.current = setTimeout(() => {
        handleDismiss();
      }, 9000);
    } else {
      handleDismiss();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [latestEmergencyAlert]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -140,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      dismissEmergencyAlert();
    });
  };

  const handlePress = () => {
    if (latestEmergencyAlert) {
      markAsRead(latestEmergencyAlert._id);
    }
    handleDismiss();
    if (onNavigateToNews) {
      onNavigateToNews();
    }
  };

  if (!latestEmergencyAlert) {
    return null;
  }

  const isInstant =
    latestEmergencyAlert.type === 'INSTANT' ||
    latestEmergencyAlert.type === 'TIN_TUC_THOI' ||
    latestEmergencyAlert.priority === 'CRITICAL' ||
    latestEmergencyAlert.priority === 'HIGH';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top + 6, 14),
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.bannerCard,
          isInstant ? styles.instantCard : styles.systemCard,
        ]}
        onPress={handlePress}
        activeOpacity={0.92}
      >
        <View style={styles.topRow}>
          <View style={styles.badgeRow}>
            <View style={[styles.iconBox, isInstant ? styles.instantIconBox : styles.systemIconBox]}>
              {isInstant ? (
                <MaterialCommunityIcons name="alert-decagram" size={18} color="#FFFFFF" />
              ) : (
                <Ionicons name="megaphone" size={16} color="#FFFFFF" />
              )}
            </View>
            <Text style={[styles.badgeText, isInstant ? styles.instantBadgeText : styles.systemBadgeText]}>
              {isInstant ? '🚨 CẢNH BÁO KHẨN CẤP' : '📢 THÔNG BÁO HỆ THỐNG'}
            </Text>
            {latestEmergencyAlert.areaName ? (
              <Text style={styles.areaTag} numberOfLines={1}>
                • {latestEmergencyAlert.areaName}
              </Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        <Text style={styles.titleText} numberOfLines={1}>
          {latestEmergencyAlert.title}
        </Text>

        <Text style={styles.contentText} numberOfLines={2}>
          {latestEmergencyAlert.content}
        </Text>

        <View style={styles.footerRow}>
          <View style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>Nhấp để xem chi tiết</Text>
            <Ionicons name="arrow-forward" size={14} color="#0066FF" />
          </View>
          <Text style={styles.timeTag}>Vừa xong</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: 14,
    elevation: 25,
  },
  bannerCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  instantCard: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF8F8',
  },
  systemCard: {
    borderColor: '#BFDBFE',
    backgroundColor: '#F8FAFC',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  instantIconBox: {
    backgroundColor: '#EF4444',
  },
  systemIconBox: {
    backgroundColor: '#2563EB',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  instantBadgeText: {
    color: '#DC2626',
  },
  systemBadgeText: {
    color: '#1D4ED8',
  },
  areaTag: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginLeft: 6,
    flexShrink: 1,
  },
  closeBtn: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  titleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
    lineHeight: 20,
  },
  contentText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066FF',
  },
  timeTag: {
    fontSize: 11,
    color: '#94A3B8',
  },
});

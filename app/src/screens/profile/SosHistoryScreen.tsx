import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { backendApi } from '../../services/backendApi';
import { PROFILE_THEME } from './theme';

interface SosHistoryScreenProps {
  onBack: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
  PENDING: { label: 'Chờ tiếp nhận', color: '#D97706', bgColor: '#FEF3C7', icon: 'time-outline' },
  VERIFIED: { label: 'Đã xác minh', color: '#0284C7', bgColor: '#E0F2FE', icon: 'shield-checkmark-outline' },
  ASSIGNED: { label: 'Đã phân công', color: '#7C3AED', bgColor: '#EDE9FE', icon: 'people-outline' },
  ACCEPTED: { label: 'Đã nhận lệnh', color: '#7C3AED', bgColor: '#EDE9FE', icon: 'briefcase-outline' },
  ON_THE_WAY: { label: 'Đang di chuyển', color: '#9333EA', bgColor: '#F3E8FF', icon: 'car-outline' },
  ARRIVED: { label: 'Đã đến nơi', color: '#C026D3', bgColor: '#FAE8FF', icon: 'location-outline' },
  RESCUING: { label: 'Đang cứu hộ', color: '#E11D48', bgColor: '#FFE4E6', icon: 'medical-outline' },
  COMPLETED: { label: 'Hoàn thành', color: '#16A34A', bgColor: '#DCFCE7', icon: 'checkmark-circle-outline' },
  CANCELLED: { label: 'Đã hủy', color: '#DC2626', bgColor: '#FEE2E2', icon: 'close-circle-outline' },
  REJECTED: { label: 'Từ chối', color: '#991B1B', bgColor: '#FEE2E2', icon: 'ban-outline' },
};

const TYPE_CONFIG: Record<string, string> = {
  MEDICAL: '🚑 Y tế khẩn cấp',
  FIRE: '🔥 Hỏa hoạn',
  FLOOD: '🌊 Lũ lụt',
  LANDSLIDE: '⛰️ Sạt lở',
  STORM: '⛈️ Bão/Lốc xoáy',
  ACCIDENT: '💥 Tai nạn',
  MISSING_PERSON: '👤 Lạc đường',
  OTHER: '⚠️ Khác',
};

export const SosHistoryScreen: React.FC<SosHistoryScreenProps> = ({ onBack }) => {
  const [sosList, setSosList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSosHistory = async () => {
    try {
      const res = await backendApi.get('/sos');
      if (res.success && Array.isArray(res.data)) {
        // Sort descending by createdAt
        const sorted = res.data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setSosList(sorted);
      }
    } catch (error) {
      console.error('Lỗi lấy lịch sử SOS:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSosHistory();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSosHistory();
  };

  const renderSosItem = ({ item }: { item: any }) => {
    const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG['PENDING'];
    const typeLabel = TYPE_CONFIG[item.emergencyType] || TYPE_CONFIG['OTHER'];
    const dateStr = new Date(item.createdAt).toLocaleString('vi-VN', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
    });

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.dateText}>{dateStr}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
            <Ionicons name={statusConfig.icon} size={14} color={statusConfig.color} />
            <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.typeText}>{typeLabel}</Text>
          
          <View style={styles.infoRow}>
            <Feather name="map-pin" size={14} color="#64748B" />
            <Text style={styles.infoText} numberOfLines={2}>
              {item.address || 'Đã gửi tọa độ GPS'}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Feather name="users" size={14} color="#64748B" />
            <Text style={styles.infoText}>{item.people} người đang gặp nạn</Text>
          </View>

          {item.description ? (
            <View style={styles.descBox}>
              <Text style={styles.descText} numberOfLines={2}>{item.description}</Text>
            </View>
          ) : null}
        </View>

        {item.status === 'COMPLETED' ? null : (
          <View style={styles.cardFooter}>
            <TouchableOpacity style={styles.detailBtn} activeOpacity={0.7}>
              <Text style={styles.detailBtnText}>Theo dõi cứu hộ</Text>
              <Feather name="chevron-right" size={16} color="#0066FF" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lịch sử báo nạn</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#0066FF" />
        </View>
      ) : (
        <FlatList
          data={sosList}
          keyExtractor={(item) => item._id}
          renderItem={renderSosItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconWrap}>
                <Feather name="shield" size={48} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTitle}>Chưa có dữ liệu</Text>
              <Text style={styles.emptyDesc}>Bạn chưa gửi yêu cầu cứu nạn nào từ hệ thống này.</Text>
            </View>
          }
        />
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
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: PROFILE_THEME.colors.background,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    flexGrow: 1,
    backgroundColor: PROFILE_THEME.colors.background,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: PROFILE_THEME.radius.card,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dateText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardBody: {
    padding: 16,
  },
  typeText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  descBox: {
    marginTop: 8,
    padding: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#CBD5E1',
  },
  descText: {
    fontSize: 13,
    color: '#475569',
    fontStyle: 'italic',
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0066FF',
  },
  emptyBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 22,
  },
});

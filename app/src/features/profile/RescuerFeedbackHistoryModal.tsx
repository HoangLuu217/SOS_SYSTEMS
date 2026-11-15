import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { assignmentApi, type RescuerAssignmentItem } from '@/api';

interface RescuerFeedbackHistoryModalProps {
  visible: boolean;
  onClose: () => void;
}

type SentimentFilter = 'ALL' | 'SATISFIED' | 'NEUTRAL' | 'NEEDS_IMPROVEMENT';

interface FeedbackEntry {
  id: string;
  sosCode: string;
  address: string;
  emergencyType: string;
  citizenName: string;
  sentiment: 'SATISFIED' | 'NEUTRAL' | 'NEEDS_IMPROVEMENT';
  comment: string;
  submittedAt: string;
}

const formatDateTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${hh}:${mm} • ${dd}/${mo}/${yyyy}`;
};

export const RescuerFeedbackHistoryModal: React.FC<RescuerFeedbackHistoryModalProps> = ({
  visible,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [filter, setFilter] = useState<SentimentFilter>('ALL');

  const fetchFeedbacks = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await assignmentApi.getMyAssignments();
      const rawList: RescuerAssignmentItem[] = Array.isArray(res?.data) ? res.data : [];

      const seenSosIds = new Set<string>();
      const parsed: FeedbackEntry[] = [];

      for (const item of rawList) {
        const sos = (item.sosRequestId && typeof item.sosRequestId === 'object'
          ? item.sosRequestId
          : item.sosId && typeof item.sosId === 'object'
          ? item.sosId
          : null) as any;

        const fb = sos?.citizenFeedback;
        if (!fb?.submittedAt) continue;

        const sosKey = String(sos?._id || item._id);
        if (seenSosIds.has(sosKey)) continue;
        seenSosIds.add(sosKey);

        const sentiment: FeedbackEntry['sentiment'] =
          fb.sentiment === 'NEUTRAL'
            ? 'NEUTRAL'
            : fb.sentiment === 'NEEDS_IMPROVEMENT'
            ? 'NEEDS_IMPROVEMENT'
            : 'SATISFIED';

        parsed.push({
          id: item._id,
          sosCode: sos?.sosCode || `SOS-${String(sos?._id || '').slice(-4).toUpperCase()}`,
          address: sos?.address || 'Chưa rõ địa chỉ',
          emergencyType: sos?.emergencyType || 'Cứu hộ khẩn cấp',
          citizenName: sos?.citizenId?.fullName || 'Người dân',
          sentiment,
          comment: (fb.comment || '').trim(),
          submittedAt: fb.submittedAt,
        });
      }

      parsed.sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );
      setEntries(parsed);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setFilter('ALL');
      fetchFeedbacks(false);
    }
  }, [visible]);

  const counts = useMemo(() => {
    let satisfied = 0;
    let neutral = 0;
    let improve = 0;
    for (const e of entries) {
      if (e.sentiment === 'SATISFIED') satisfied += 1;
      else if (e.sentiment === 'NEUTRAL') neutral += 1;
      else improve += 1;
    }
    return {
      all: entries.length,
      satisfied,
      neutral,
      improve,
    };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (filter === 'ALL') return entries;
    return entries.filter((e) => e.sentiment === filter);
  }, [entries, filter]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={styles.container}
        edges={Platform.OS === 'ios' ? ['bottom'] : ['top', 'bottom']}
      >
        <View
          style={[
            styles.header,
            Platform.OS === 'ios' && { paddingTop: Math.max(insets.top, 44) + 8 },
          ]}
        >
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="arrow-left" size={20} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Đánh giá từ người dân</Text>
            <Text style={styles.headerSub}>Tổng hợp phản hồi các ca cứu hộ đã hoàn thành</Text>
          </View>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => fetchFeedbacks(true)}
            activeOpacity={0.7}
          >
            <Feather name="refresh-cw" size={18} color="#0284C7" />
          </TouchableOpacity>
        </View>

        <View style={styles.filterBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScrollContent}
          >
            {(
              [
                { key: 'ALL', label: `Tất cả (${counts.all})` },
                { key: 'SATISFIED', label: `Hài lòng (${counts.satisfied})` },
                { key: 'NEUTRAL', label: `Bình thường (${counts.neutral})` },
                { key: 'NEEDS_IMPROVEMENT', label: `Cần cải thiện (${counts.improve})` },
              ] as const
            ).map((tab) => {
              const active = filter === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(tab.key)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#0284C7" />
            <Text style={styles.loadingText}>Đang tải đánh giá...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchFeedbacks(true)}
                colors={['#0284C7']}
              />
            }
          >
            {filteredEntries.length === 0 ? (
              <View style={styles.emptyBox}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="message-square" size={26} color="#0284C7" />
                </View>
                <Text style={styles.emptyTitle}>Chưa có đánh giá nào</Text>
                <Text style={styles.emptyDesc}>
                  Các phản hồi từ người dân sau khi hoàn thành nhiệm vụ cứu hộ sẽ hiển thị tại đây.
                </Text>
              </View>
            ) : (
              filteredEntries.map((item) => {
                const isSatisfied = item.sentiment === 'SATISFIED';
                const isNeutral = item.sentiment === 'NEUTRAL';
                return (
                  <View key={item.id} style={styles.card}>
                    <View style={styles.cardTopRow}>
                      <View style={styles.codeBadge}>
                        <Text style={styles.codeBadgeText}>{item.sosCode}</Text>
                      </View>
                      <View
                        style={[
                          styles.sentimentPill,
                          isSatisfied
                            ? styles.pillSatisfied
                            : isNeutral
                            ? styles.pillNeutral
                            : styles.pillImprove,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sentimentText,
                            isSatisfied
                              ? styles.textSatisfied
                              : isNeutral
                              ? styles.textNeutral
                              : styles.textImprove,
                          ]}
                        >
                          {isSatisfied
                            ? 'Hài lòng'
                            : isNeutral
                            ? 'Bình thường'
                            : 'Cần cải thiện'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.citizenRow}>
                      Người gửi: <Text style={styles.citizenName}>{item.citizenName}</Text>
                    </Text>

                    <View style={styles.metaRow}>
                      <Feather name="map-pin" size={13} color="#64748B" />
                      <Text style={styles.metaText} numberOfLines={2}>
                        {item.address}
                      </Text>
                    </View>

                    {item.comment ? (
                      <View style={styles.commentBox}>
                        <Text style={styles.commentText}>"{item.comment}"</Text>
                      </View>
                    ) : null}

                    <Text style={styles.timeText}>{formatDateTime(item.submittedAt)}</Text>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  filterBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 10,
  },
  filterScrollContent: {
    paddingHorizontal: 14,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0284C7',
  },
  filterChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#0284C7',
    fontWeight: '700',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13.5,
    color: '#64748B',
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    padding: 14,
    paddingBottom: 28,
    gap: 12,
  },
  emptyBox: {
    marginTop: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  codeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  codeBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  sentimentPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillSatisfied: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  pillNeutral: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  pillImprove: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  sentimentText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  textSatisfied: {
    color: '#0284C7',
  },
  textNeutral: {
    color: '#D97706',
  },
  textImprove: {
    color: '#DC2626',
  },
  citizenRow: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 4,
  },
  citizenName: {
    fontWeight: '700',
    color: '#0F172A',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 2,
  },
  metaText: {
    flex: 1,
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 18,
  },
  commentBox: {
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
  },
  commentText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#334155',
    fontStyle: 'italic',
  },
  timeText: {
    marginTop: 10,
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '600',
    textAlign: 'right',
  },
});


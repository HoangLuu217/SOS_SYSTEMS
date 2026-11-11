import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { safetyCheckApi, SafetyCheckItem, SafetyCheckResponseItem, backendApi } from '@/api';

interface SafetyCheckModalProps {
  visible: boolean;
  onClose: () => void;
  safetyCheckId?: string;
  onSuccess?: () => void;
}

export const SafetyCheckModal: React.FC<SafetyCheckModalProps> = ({
  visible,
  onClose,
  safetyCheckId,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [safetyCheck, setSafetyCheck] = useState<SafetyCheckItem | null>(null);
  const [allChecks, setAllChecks] = useState<SafetyCheckItem[]>([]);
  const [responsesMap, setResponsesMap] = useState<Record<string, SafetyCheckResponseItem>>({});
  const [myResponse, setMyResponse] = useState<SafetyCheckResponseItem | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  const [selectedStatus, setSelectedStatus] = useState<'SAFE' | 'NEED_HELP'>('SAFE');
  const [message, setMessage] = useState<string>('');
  const [peopleCount, setPeopleCount] = useState<number>(1);
  const [createSosRequest, setCreateSosRequest] = useState<boolean>(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationAddress, setLocationAddress] = useState<string>('');

  const applySelectedCheck = (
    target: SafetyCheckItem | null,
    respMap: Record<string, SafetyCheckResponseItem>
  ) => {
    setSafetyCheck(target);
    if (!target) {
      setMyResponse(null);
      setIsEditing(false);
      return;
    }
    const existingResp = respMap[target._id] || null;
    setMyResponse(existingResp);
    if (existingResp) {
      setSelectedStatus(existingResp.status);
      setMessage(existingResp.message || '');
      setPeopleCount(existingResp.peopleCount || 1);
      setIsEditing(false);
    } else {
      setSelectedStatus('SAFE');
      setMessage('');
      setPeopleCount(1);
      setCreateSosRequest(false);
      setIsEditing(true);
    }
  };

  useEffect(() => {
    if (!visible) return;

    let isMounted = true;
    setLoading(true);

    const loadData = async () => {
      try {
        // 1. Luôn lấy đầy đủ danh sách đợt kiểm tra an toàn đang mở
        const activeRes = await safetyCheckApi.getActiveSafetyCheck();
        let checksList: SafetyCheckItem[] = [];
        const respMap: Record<string, SafetyCheckResponseItem> = {};

        if (activeRes.success && activeRes.data) {
          const primary = activeRes.data.activeCheck;
          checksList = activeRes.data.activeChecks || (primary ? [primary] : []);
          if (activeRes.data.myResponses) {
            activeRes.data.myResponses.forEach((r) => {
              respMap[String(r.safetyCheckId)] = r;
            });
          } else if (primary && activeRes.data.myResponse) {
            respMap[String(primary._id)] = activeRes.data.myResponse;
          }
        }

        // Nếu mở từ thông báo có safetyCheckId cụ thể
        let selected: SafetyCheckItem | null = null;
        if (safetyCheckId) {
          selected = checksList.find((c) => String(c._id) === String(safetyCheckId)) || null;
          if (!selected) {
            const detailRes = await safetyCheckApi.getSafetyCheckById(safetyCheckId);
            if (detailRes.success && detailRes.data?.safetyCheck) {
              selected = detailRes.data.safetyCheck;
              checksList = [selected, ...checksList];
              if (detailRes.data.myResponse) {
                respMap[String(selected._id)] = detailRes.data.myResponse;
              }
            }
          }
        }

        if (!selected && checksList.length > 0) {
          // Ưu tiên chọn đợt chưa phản hồi đầu tiên
          selected = checksList.find((c) => !respMap[String(c._id)]) || checksList[0];
        }

        if (isMounted) {
          setAllChecks(checksList);
          setResponsesMap(respMap);
          applySelectedCheck(selected, respMap);
          setLoading(false);
        }

        // 2. Lấy tọa độ GPS thiết bị chạy ngầm
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Promise.race([
              Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
              new Promise<any>((resolve) => setTimeout(() => resolve(null), 3500)),
            ]);
            if (loc && isMounted) {
              const currentLocCoords = {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
              };
              setCoords(currentLocCoords);
              void backendApi.updateCurrentLocation(loc.coords.latitude, loc.coords.longitude);

              Location.reverseGeocodeAsync({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
              })
                .then((geo) => {
                  if (geo && geo.length > 0 && isMounted) {
                    const g = geo[0];
                    const parts = [g.streetNumber, g.street, g.subregion, g.region].filter(Boolean);
                    setLocationAddress(parts.join(', '));
                  }
                })
                .catch(() => {});
            }
          }
        } catch (_) {}
      } catch (err: any) {
        console.warn('Lỗi nạp thông tin kiểm tra an toàn:', err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [visible, safetyCheckId]);

  const handleSelectCampaign = (target: SafetyCheckItem) => {
    applySelectedCheck(target, responsesMap);
  };

  const handleSubmit = async () => {
    if (!safetyCheck?._id) return;

    setSubmitting(true);
    try {
      const payload: any = {
        status: selectedStatus,
        message: message.trim(),
        peopleCount: selectedStatus === 'NEED_HELP' ? peopleCount : 1,
        createSosRequest: selectedStatus === 'NEED_HELP' && createSosRequest,
        address: locationAddress || undefined,
      };

      if (coords) {
        payload.location = {
          coordinates: [coords.longitude, coords.latitude],
        };
      }

      const res = await safetyCheckApi.respondToSafetyCheck(safetyCheck._id, payload);

      if (res.success) {
        const newResp: SafetyCheckResponseItem = res.data?.response || {
          _id: String(Date.now()),
          safetyCheckId: safetyCheck._id,
          userId: '',
          userFullName: '',
          userPhone: '',
          status: selectedStatus,
          message: message.trim(),
          peopleCount: selectedStatus === 'NEED_HELP' ? peopleCount : 1,
          respondedAt: new Date().toISOString(),
        };

        const nextMap = {
          ...responsesMap,
          [safetyCheck._id]: newResp,
        };
        setResponsesMap(nextMap);
        setMyResponse(newResp);
        setIsEditing(false);

        DeviceEventEmitter.emit('safety_check:updated');
        if (onSuccess) onSuccess();
      } else {
        Alert.alert('Không thể gửi', res.message || 'Vui lòng thử lại.');
      }
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể kết nối máy chủ.');
    } finally {
      setSubmitting(false);
    }
  };

  const unrespondedCount = allChecks.filter((c) => !responsesMap[String(c._id)]).length;

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom + 8, 16) }]}>
          {/* Header gọn */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="shield-checkmark" size={20} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>Xác Nhận An Toàn</Text>
                <Text style={styles.headerSubtitle}>
                  {allChecks.length > 0
                    ? `${allChecks.length} đợt kiểm tra • ${
                        unrespondedCount > 0 ? `${unrespondedCount} chưa xác nhận` : 'Đã xác nhận tất cả'
                      }`
                    : 'Kiểm tra an toàn khu vực'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#16A34A" />
              <Text style={styles.loadingText}>Đang tải...</Text>
            </View>
          ) : allChecks.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="checkmark-done-circle" size={48} color="#16A34A" />
              <Text style={styles.emptyTitle}>Khu vực an toàn</Text>
              <Text style={styles.emptyDesc}>Hiện không có đợt kiểm tra an toàn nào đang mở.</Text>
              <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
                <Text style={styles.doneBtnText}>Đóng</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              {/* 1. Danh sách tất cả các đợt kiểm tra đang có */}
              <Text style={styles.sectionTitle}>Danh sách đợt kiểm tra ({allChecks.length})</Text>
              <View style={styles.checkList}>
                {allChecks.map((item) => {
                  const isSelected = item._id === safetyCheck?._id;
                  const resp = responsesMap[String(item._id)];
                  return (
                    <TouchableOpacity
                      key={item._id}
                      style={[styles.checkItem, isSelected && styles.checkItemActive]}
                      onPress={() => handleSelectCampaign(item)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={isSelected ? '#16A34A' : '#94A3B8'}
                      />
                      <View style={styles.checkItemBody}>
                        <Text
                          style={[styles.checkItemTitle, isSelected && styles.checkItemTitleActive]}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        <Text style={styles.checkItemMeta} numberOfLines={1}>
                          {item.areaName || item.areaId?.name || 'Toàn khu vực'}
                        </Text>
                      </View>

                      {resp ? (
                        <View
                          style={[
                            styles.statusTag,
                            resp.status === 'SAFE' ? styles.statusTagSafe : styles.statusTagHelp,
                          ]}
                        >
                          <Ionicons
                            name={resp.status === 'SAFE' ? 'checkmark-circle' : 'alert-circle'}
                            size={12}
                            color={resp.status === 'SAFE' ? '#15803D' : '#DC2626'}
                          />
                          <Text
                            style={[
                              styles.statusTagText,
                              { color: resp.status === 'SAFE' ? '#15803D' : '#DC2626' },
                            ]}
                          >
                            {resp.status === 'SAFE' ? 'An toàn' : 'Cần cứu hộ'}
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.statusTag, styles.statusTagPending]}>
                          <Text style={[styles.statusTagText, { color: '#D97706' }]}>Chưa báo</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 2. Khung phản hồi của đợt đang chọn */}
              {safetyCheck && (
                <View style={styles.responseContainer}>
                  <View style={styles.selectedInfoBox}>
                    <Text style={styles.selectedTitle} numberOfLines={1}>
                      {safetyCheck.title}
                    </Text>
                    {safetyCheck.description ? (
                      <Text style={styles.selectedDesc} numberOfLines={2}>
                        {safetyCheck.description}
                      </Text>
                    ) : null}
                  </View>

                  {/* Nếu ĐÃ PHẢN HỒI và không bấm Cập nhật -> chỉ hiện trạng thái + nút Cập nhật */}
                  {myResponse && !isEditing ? (
                    <View
                      style={[
                        styles.respondedSummaryCard,
                        myResponse.status === 'SAFE'
                          ? styles.respondedSafeCard
                          : styles.respondedHelpCard,
                      ]}
                    >
                      <View style={styles.respondedSummaryLeft}>
                        <Ionicons
                          name={
                            myResponse.status === 'SAFE' ? 'shield-checkmark' : 'alert-circle'
                          }
                          size={22}
                          color={myResponse.status === 'SAFE' ? '#16A34A' : '#DC2626'}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.respondedStatusLabel}>
                            Đã xác nhận:{' '}
                            <Text
                              style={{
                                color: myResponse.status === 'SAFE' ? '#15803D' : '#DC2626',
                                fontWeight: '800',
                              }}
                            >
                              {myResponse.status === 'SAFE'
                                ? 'Tôi an toàn'
                                : `Cần cứu hộ (${myResponse.peopleCount || 1} người)`}
                            </Text>
                          </Text>
                          {myResponse.message ? (
                            <Text style={styles.respondedNoteText} numberOfLines={1}>
                              Ghi chú: {myResponse.message}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.updateToggleBtn}
                        onPress={() => setIsEditing(true)}
                        activeOpacity={0.8}
                      >
                        <Feather name="edit-2" size={13} color="#0F172A" />
                        <Text style={styles.updateToggleBtnText}>Cập nhật</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    /* Khung chọn phản hồi gọn nhẹ */
                    <View style={styles.compactForm}>
                      <View style={styles.statusOptionsRow}>
                        <TouchableOpacity
                          style={[
                            styles.statusBtn,
                            selectedStatus === 'SAFE' && styles.statusBtnSafeActive,
                          ]}
                          onPress={() => setSelectedStatus('SAFE')}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name="shield-checkmark"
                            size={20}
                            color={selectedStatus === 'SAFE' ? '#16A34A' : '#64748B'}
                          />
                          <Text
                            style={[
                              styles.statusBtnText,
                              selectedStatus === 'SAFE' && { color: '#15803D' },
                            ]}
                          >
                            Tôi an toàn
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.statusBtn,
                            selectedStatus === 'NEED_HELP' && styles.statusBtnHelpActive,
                          ]}
                          onPress={() => setSelectedStatus('NEED_HELP')}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name="alert-circle"
                            size={20}
                            color={selectedStatus === 'NEED_HELP' ? '#DC2626' : '#64748B'}
                          />
                          <Text
                            style={[
                              styles.statusBtnText,
                              selectedStatus === 'NEED_HELP' && { color: '#DC2626' },
                            ]}
                          >
                            Cần cứu hộ
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {selectedStatus === 'NEED_HELP' && (
                        <View style={styles.needHelpCompactBox}>
                          <View style={styles.peopleRow}>
                            <Text style={styles.peopleLabel}>Số người:</Text>
                            <View style={styles.peopleBtns}>
                              {[1, 2, 3, 4, 5].map((num) => (
                                <TouchableOpacity
                                  key={num}
                                  style={[
                                    styles.peopleChip,
                                    peopleCount === num && styles.peopleChipActive,
                                  ]}
                                  onPress={() => setPeopleCount(num)}
                                >
                                  <Text
                                    style={[
                                      styles.peopleChipText,
                                      peopleCount === num && styles.peopleChipTextActive,
                                    ]}
                                  >
                                    {num >= 5 ? '5+' : num}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>

                          <TouchableOpacity
                            style={styles.sosCheckRow}
                            onPress={() => setCreateSosRequest(!createSosRequest)}
                            activeOpacity={0.8}
                          >
                            <Ionicons
                              name={createSosRequest ? 'checkbox' : 'square-outline'}
                              size={18}
                              color={createSosRequest ? '#DC2626' : '#64748B'}
                            />
                            <Text style={styles.sosCheckLabel}>Tạo yêu cầu SOS khẩn cấp</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      <TextInput
                        style={styles.compactInput}
                        placeholder="Ghi chú thêm (tùy chọn)..."
                        placeholderTextColor="#94A3B8"
                        value={message}
                        onChangeText={setMessage}
                        maxLength={250}
                      />

                      <View style={styles.compactLocationRow}>
                        <Ionicons name="location" size={14} color="#0284C7" />
                        <Text style={styles.compactLocationText} numberOfLines={1}>
                          {locationAddress ||
                            (coords
                              ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`
                              : 'Đang lấy vị trí GPS...')}
                        </Text>
                      </View>

                      <View style={styles.submitRow}>
                        {myResponse && (
                          <TouchableOpacity
                            style={styles.cancelEditBtn}
                            onPress={() => setIsEditing(false)}
                            disabled={submitting}
                          >
                            <Text style={styles.cancelEditBtnText}>Hủy</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={[
                            styles.submitBtn,
                            selectedStatus === 'SAFE'
                              ? styles.submitBtnSafe
                              : styles.submitBtnHelp,
                            submitting && { opacity: 0.7 },
                          ]}
                          onPress={handleSubmit}
                          disabled={submitting}
                          activeOpacity={0.85}
                        >
                          {submitting ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                          ) : (
                            <Text style={styles.submitBtnText}>
                              {myResponse ? 'Cập nhật' : 'Xác nhận'}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '85%',
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBox: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: '#64748B',
  },
  emptyBox: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 10,
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 16,
  },
  doneBtn: {
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  checkList: {
    gap: 8,
    marginBottom: 14,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  checkItemActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#16A34A',
  },
  checkItemBody: {
    flex: 1,
  },
  checkItemTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  checkItemTitleActive: {
    fontWeight: '700',
    color: '#0F172A',
  },
  checkItemMeta: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusTagSafe: {
    backgroundColor: '#DCFCE7',
  },
  statusTagHelp: {
    backgroundColor: '#FEE2E2',
  },
  statusTagPending: {
    backgroundColor: '#FEF3C7',
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  responseContainer: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
    paddingBottom: 6,
  },
  selectedInfoBox: {
    marginBottom: 10,
  },
  selectedTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  selectedDesc: {
    fontSize: 12.5,
    color: '#475569',
    marginTop: 2,
    lineHeight: 17,
  },
  respondedSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  respondedSafeCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  respondedHelpCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  respondedSummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  respondedStatusLabel: {
    fontSize: 13.5,
    color: '#0F172A',
    fontWeight: '600',
  },
  respondedNoteText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  updateToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  updateToggleBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  compactForm: {
    gap: 10,
  },
  statusOptionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  statusBtnSafeActive: {
    borderColor: '#16A34A',
    backgroundColor: '#F0FDF4',
  },
  statusBtnHelpActive: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  statusBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#475569',
  },
  needHelpCompactBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 8,
  },
  peopleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  peopleLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#991B1B',
  },
  peopleBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  peopleChip: {
    width: 32,
    height: 30,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  peopleChipActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  peopleChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  peopleChipTextActive: {
    color: '#FFFFFF',
  },
  sosCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sosCheckLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#DC2626',
  },
  compactInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0F172A',
  },
  compactLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 4,
  },
  compactLocationText: {
    fontSize: 11.5,
    color: '#64748B',
    flex: 1,
  },
  submitRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  cancelEditBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelEditBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#475569',
  },
  submitBtn: {
    flex: 1,
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnSafe: {
    backgroundColor: '#16A34A',
  },
  submitBtnHelp: {
    backgroundColor: '#DC2626',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

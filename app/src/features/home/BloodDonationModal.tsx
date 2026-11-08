import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  DeviceEventEmitter,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  bloodDonationApi,
  BloodDonationEventItem,
  BloodDonationRegistrationItem,
  ProvinceAreaItem,
} from '@/api/bloodDonation.api';
import { useAuth } from '@/context/AuthContext';

interface BloodDonationModalProps {
  visible: boolean;
  onClose: () => void;
  initialEventId?: string;
  onUpdated?: () => void;
}

const BLOOD_TYPES = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-', 'UNKNOWN'];

export function BloodDonationModal({
  visible,
  onClose,
  initialEventId,
  onUpdated,
}: BloodDonationModalProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'PRE_REGISTER' | 'EVENTS'>('PRE_REGISTER');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Dữ liệu từ server
  const [myPreRegistration, setMyPreRegistration] =
    useState<BloodDonationRegistrationItem | null>(null);
  const [activeEvents, setActiveEvents] = useState<BloodDonationEventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<BloodDonationEventItem | null>(null);
  const [provinces, setProvinces] = useState<ProvinceAreaItem[]>([]);

  // Form ĐK nhận thông báo đợt hiến (gọn)
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [bloodType, setBloodType] = useState('UNKNOWN');
  const [weightKg, setWeightKg] = useState('55');
  const [provinceId, setProvinceId] = useState('');
  const [provinceName, setProvinceName] = useState('');
  const [showProvinceDropdown, setShowProvinceDropdown] = useState(false);
  const [address, setAddress] = useState('');
  const [healthNote, setHealthNote] = useState('Sức khỏe tốt, sẵn sàng tham gia hiến máu');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // Form Xác nhận sự kiện
  const [eventChoice, setEventChoice] = useState<'CONFIRMED' | 'DECLINED'>('CONFIRMED');
  const [eventNote, setEventNote] = useState('');

  const selectEventItem = useCallback(
    (ev: BloodDonationEventItem, preReg: BloodDonationRegistrationItem | null) => {
      setSelectedEvent(ev);
      if (ev.myResponse) {
        setEventChoice(ev.myResponse.status === 'DECLINED' ? 'DECLINED' : 'CONFIRMED');
        setEventNote(ev.myResponse.note || '');
        if (ev.myResponse.bloodType) setBloodType(ev.myResponse.bloodType);
      } else {
        setEventChoice('CONFIRMED');
        setEventNote('');
        if (preReg?.bloodType) setBloodType(preReg.bloodType);
      }
    },
    []
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setFeedbackBanner(null);
    try {
      // Lấy vị trí hiện tại nếu có quyền
      try {
        const { status: perm } = await Location.getForegroundPermissionsAsync();
        if (perm === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setCoords({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      } catch {
        // ignore
      }

      const [res, areaRes] = await Promise.all([
        bloodDonationApi.getMyStatus(),
        bloodDonationApi.getProvinces().catch(() => null),
      ]);

      if (res.success && res.data) {
        const pre = res.data.myPreRegistration;
        const events = Array.isArray(res.data.activeEvents) ? res.data.activeEvents : [];
        const fromAreaApi = Array.isArray(areaRes?.data) ? areaRes!.data : [];
        const provList =
          fromAreaApi.length > 0
            ? fromAreaApi
            : Array.isArray(res.data.provinces)
              ? res.data.provinces
              : [];

        setMyPreRegistration(pre);
        setActiveEvents(events);
        setProvinces(provList);

        // Điền thông tin form từ hồ sơ đã đăng ký hoặc từ user
        const initAddress = pre?.address || (user as any)?.address || '';
        setFullName(pre?.fullName || user?.fullName || '');
        setPhone(pre?.phone || user?.phone || '');
        setBloodType(pre?.bloodType || (user as any)?.citizen?.bloodType || 'UNKNOWN');
        setWeightKg(pre?.weightKg ? String(pre.weightKg) : '55');
        setAddress(initAddress);
        setHealthNote(pre?.healthNote || 'Sức khỏe tốt, sẵn sàng tham gia hiến máu');

        // Xác định Tỉnh/Thành phố đã chọn
        if (pre?.provinceId) {
          setProvinceId(String(pre.provinceId));
          const foundProv = provList.find((p) => p._id === String(pre.provinceId));
          setProvinceName(foundProv?.name || pre.provinceName || '');
        } else if (provList.length > 0) {
          const lowerAddr = initAddress.toLowerCase();
          const matchedProv = provList.find((p) => {
            const clean = p.name.replace(/^(tỉnh|thành phố|tp\.?)\s+/i, '').trim().toLowerCase();
            return clean && (lowerAddr.includes(p.name.toLowerCase()) || lowerAddr.includes(clean));
          });
          if (matchedProv) {
            setProvinceId(matchedProv._id);
            setProvinceName(matchedProv.name);
          } else {
            setProvinceId(provList[0]._id);
            setProvinceName(provList[0].name);
          }
        }

        // Nếu mở từ thông báo có initialEventId -> chuyển sang tab EVENTS và chọn sự kiện đó
        if (initialEventId) {
          setActiveTab('EVENTS');
          const found = events.find((e) => e._id === initialEventId);
          if (found) {
            selectEventItem(found, pre);
          } else {
            // Tải chi tiết sự kiện nếu không nằm trong top active
            const detailRes = await bloodDonationApi.getEventDetail(initialEventId);
            if (detailRes.success && detailRes.data?.event) {
              const evWithResp: BloodDonationEventItem = {
                ...detailRes.data.event,
                myResponse: detailRes.data.myResponse,
              };
              setActiveEvents((prev) => [
                evWithResp,
                ...prev.filter((x) => x._id !== evWithResp._id),
              ]);
              selectEventItem(evWithResp, pre);
            } else if (events[0]) {
              selectEventItem(events[0], pre);
            }
          }
        } else if (events.length > 0 && pre) {
          // Nếu đã đăng ký trước rồi và đang có sự kiện mới -> ưu tiên mở tab Sự kiện
          const firstUnresponded = events.find((e) => !e.myResponse) || events[0];
          selectEventItem(firstUnresponded, pre);
          if (events.some((e) => !e.myResponse)) {
            setActiveTab('EVENTS');
          } else {
            setActiveTab('PRE_REGISTER');
          }
        } else {
          if (events[0]) selectEventItem(events[0], pre);
          setActiveTab('PRE_REGISTER');
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [initialEventId, selectEventItem, user]);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, loadData]);

  // Xử lý ĐK nhận thông báo đợt hiến máu theo Tỉnh/Thành phố
  const handlePreRegister = async () => {
    if (!phone.trim()) {
      setFeedbackBanner({ type: 'error', text: 'Vui lòng nhập số điện thoại liên hệ.' });
      return;
    }
    if (provinces.length > 0 && !provinceId) {
      setFeedbackBanner({
        type: 'error',
        text: 'Vui lòng chọn Tỉnh / Thành phố để nhận thông báo đợt hiến máu đúng khu vực.',
      });
      return;
    }

    setSubmitting(true);
    setFeedbackBanner(null);
    try {
      const res = await bloodDonationApi.registerPending({
        fullName: fullName.trim() || user?.fullName || 'Người dân',
        phone: phone.trim(),
        bloodType,
        weightKg: Number(weightKg) || 55,
        provinceId: provinceId || undefined,
        provinceName: provinceName || undefined,
        address: address.trim(),
        healthNote: healthNote.trim(),
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      });

      if (res.success && res.data) {
        setMyPreRegistration(res.data);
        const savedProvLabel =
          res.data.provinceName || provinceName || res.data.areaName || 'khu vực của bạn';
        setFeedbackBanner({
          type: 'success',
          text: `Đã ĐK nhận thông báo đợt hiến máu tại ${savedProvLabel}!`,
        });
        DeviceEventEmitter.emit('blood_donation:updated');
        onUpdated?.();
      } else {
        setFeedbackBanner({
          type: 'error',
          text: res.message || 'Không thể gửi đăng ký. Vui lòng thử lại.',
        });
      }
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: err?.message || 'Lỗi kết nối máy chủ.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Xử lý hủy đăng ký hiến máu chờ trước (PENDING)
  const handleCancelPreRegister = async () => {
    setSubmitting(true);
    setFeedbackBanner(null);
    try {
      const res = await bloodDonationApi.cancelPreRegistration();
      if (res.success) {
        setMyPreRegistration(null);
        setFeedbackBanner({
          type: 'success',
          text: 'Đã hủy đăng ký hiến máu chờ trước.',
        });
        DeviceEventEmitter.emit('blood_donation:updated');
        onUpdated?.();
      } else {
        setFeedbackBanner({
          type: 'error',
          text: res.message || 'Không thể hủy đăng ký. Vui lòng thử lại.',
        });
      }
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: err?.message || 'Lỗi kết nối máy chủ.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Xử lý hủy đăng ký tham gia tại sự kiện hiến máu
  const handleCancelEventRegistration = async () => {
    if (!selectedEvent) return;
    setSubmitting(true);
    setFeedbackBanner(null);
    try {
      const res = await bloodDonationApi.respondToEvent(selectedEvent._id, {
        status: 'CANCELLED',
        fullName: fullName.trim() || user?.fullName || 'Người dân',
        phone: phone.trim() || user?.phone || '',
        bloodType,
      });

      if (res.success && res.data) {
        const updatedEv: BloodDonationEventItem = {
          ...(res.data.event || selectedEvent),
          myResponse: null,
        };
        setSelectedEvent(updatedEv);
        setActiveEvents((prev) =>
          prev.map((item) => (item._id === updatedEv._id ? updatedEv : item))
        );
        setFeedbackBanner({
          type: 'success',
          text: `Đã hủy đăng ký tham gia đợt hiến máu "${selectedEvent.title}".`,
        });
        DeviceEventEmitter.emit('blood_donation:updated');
        onUpdated?.();
      } else {
        setFeedbackBanner({
          type: 'error',
          text: res.message || 'Không thể hủy đăng ký đợt này.',
        });
      }
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: err?.message || 'Lỗi kết nối máy chủ.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Xử lý xác nhận tham gia tại sự kiện hiến máu cụ thể
  const handleRespondEvent = async () => {
    if (!selectedEvent) return;
    if (!phone.trim()) {
      setFeedbackBanner({ type: 'error', text: 'Vui lòng nhập số điện thoại liên hệ.' });
      return;
    }

    setSubmitting(true);
    setFeedbackBanner(null);
    try {
      const res = await bloodDonationApi.respondToEvent(selectedEvent._id, {
        status: eventChoice,
        fullName: fullName.trim() || user?.fullName || 'Người dân',
        phone: phone.trim(),
        bloodType,
        weightKg: Number(weightKg) || 55,
        preferredTimeSlot: `${selectedEvent.startTime} - ${selectedEvent.endTime}`,
        note: eventNote.trim(),
        address: address.trim(),
      });

      if (res.success && res.data) {
        const updatedReg = res.data.registration;
        const updatedEv: BloodDonationEventItem = {
          ...(res.data.event || selectedEvent),
          myResponse: updatedReg,
        };
        setSelectedEvent(updatedEv);
        setActiveEvents((prev) =>
          prev.map((item) => (item._id === updatedEv._id ? updatedEv : item))
        );
        setFeedbackBanner({
          type: 'success',
          text:
            eventChoice === 'CONFIRMED'
              ? `Đã xác nhận tham gia tại "${selectedEvent.locationName}"!`
              : 'Đã ghi nhận chưa tham gia đợt này.',
        });
        DeviceEventEmitter.emit('blood_donation:updated');
        onUpdated?.();
      } else {
        setFeedbackBanner({
          type: 'error',
          text: res.message || 'Không thể gửi xác nhận. Vui lòng thử lại.',
        });
      }
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: err?.message || 'Lỗi kết nối máy chủ.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const unrespondedCount = activeEvents.filter((e) => !e.myResponse).length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconBox}>
                <Ionicons name="water" size={22} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>Hiến Máu Tình Nguyện</Text>
                <Text style={styles.headerSubtitle}>
                  ĐK nhận thông báo đợt hiến & Xác nhận điểm hiến máu
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Thanh chuyển Tab */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'PRE_REGISTER' && styles.tabItemActive]}
              onPress={() => {
                setActiveTab('PRE_REGISTER');
                setFeedbackBanner(null);
              }}
            >
              <Ionicons
                name="notifications-outline"
                size={16}
                color={activeTab === 'PRE_REGISTER' ? '#0284C7' : '#64748B'}
              />
              <Text
                style={[styles.tabText, activeTab === 'PRE_REGISTER' && styles.tabTextActive]}
              >
                ĐK nhận thông báo
              </Text>
              {myPreRegistration?.status === 'PENDING' && (
                <View style={styles.pendingDot} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'EVENTS' && styles.tabItemActive]}
              onPress={() => {
                setActiveTab('EVENTS');
                setFeedbackBanner(null);
              }}
            >
              <Ionicons
                name="calendar-outline"
                size={16}
                color={activeTab === 'EVENTS' ? '#0284C7' : '#64748B'}
              />
              <Text style={[styles.tabText, activeTab === 'EVENTS' && styles.tabTextActive]}>
                Sự kiện hiến máu ({activeEvents.length})
              </Text>
              {unrespondedCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{unrespondedCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#DC2626" />
              <Text style={styles.loadingText}>Đang tải thông tin hiến máu...</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.body}
              contentContainerStyle={{ paddingBottom: 28 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Thông báo kết quả */}
              {feedbackBanner && (
                <View
                  style={[
                    styles.bannerBox,
                    feedbackBanner.type === 'success'
                      ? styles.bannerSuccess
                      : styles.bannerError,
                  ]}
                >
                  <Ionicons
                    name={
                      feedbackBanner.type === 'success'
                        ? 'checkmark-circle'
                        : 'alert-circle'
                    }
                    size={18}
                    color={feedbackBanner.type === 'success' ? '#16A34A' : '#DC2626'}
                  />
                  <Text
                    style={[
                      styles.bannerText,
                      {
                        color: feedbackBanner.type === 'success' ? '#15803D' : '#B91C1C',
                      },
                    ]}
                  >
                    {feedbackBanner.text}
                  </Text>
                </View>
              )}

              {activeTab === 'PRE_REGISTER' ? (
                /* ================= TAB 1: ĐK NHẬN THÔNG BÁO ĐỢT HIẾN MÁU ================= */
                <View>
                  {/* 1. Chọn Tỉnh / Thành phố từ Area (Dropdown gọn) */}
                  <Text style={styles.inputLabel}>
                    Tỉnh / Thành phố nhận thông báo đợt hiến *
                  </Text>
                  <TouchableOpacity
                    style={styles.dropdownTrigger}
                    activeOpacity={0.75}
                    onPress={() => setShowProvinceDropdown((prev) => !prev)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Ionicons name="location-outline" size={17} color="#DC2626" />
                      <Text
                        style={[
                          styles.dropdownTriggerText,
                          !provinceName && { color: '#94A3B8' },
                        ]}
                        numberOfLines={1}
                      >
                        {provinceName || 'Chọn Tỉnh / Thành phố'}
                      </Text>
                    </View>
                    <Ionicons
                      name={showProvinceDropdown ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="#64748B"
                    />
                  </TouchableOpacity>

                  {showProvinceDropdown && provinces.length > 0 && (
                    <View style={styles.dropdownMenu}>
                      <ScrollView
                        style={{ maxHeight: 170 }}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator
                      >
                        {provinces.map((prov) => {
                          const active = provinceId === prov._id;
                          return (
                            <TouchableOpacity
                              key={prov._id}
                              style={[
                                styles.dropdownOption,
                                active && styles.dropdownOptionActive,
                              ]}
                              onPress={() => {
                                setProvinceId(prov._id);
                                setProvinceName(prov.name);
                                setShowProvinceDropdown(false);
                              }}
                            >
                              <Text
                                style={[
                                  styles.dropdownOptionText,
                                  active && styles.dropdownOptionTextActive,
                                ]}
                              >
                                {prov.name}
                              </Text>
                              {active && (
                                <Ionicons name="checkmark" size={16} color="#DC2626" />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}

                  {/* 2. Chọn nhóm máu */}
                  <Text style={styles.inputLabel}>Nhóm máu của bạn:</Text>
                  <View style={styles.bloodGrid}>
                    {BLOOD_TYPES.map((bt) => {
                      const active = bloodType === bt;
                      return (
                        <TouchableOpacity
                          key={bt}
                          style={[styles.bloodChip, active && styles.bloodChipActive]}
                          onPress={() => setBloodType(bt)}
                        >
                          <Text
                            style={[
                              styles.bloodChipText,
                              active && styles.bloodChipTextActive,
                            ]}
                          >
                            {bt === 'UNKNOWN' ? 'Chưa rõ' : bt}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* 3. Họ tên, SĐT & Cân nặng (gọn trên 2 hàng) */}
                  <View style={styles.rowInputs}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Họ và tên *</Text>
                      <TextInput
                        style={styles.input}
                        value={fullName}
                        onChangeText={setFullName}
                        placeholder="Nhập họ tên"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Số điện thoại *</Text>
                      <TextInput
                        style={styles.input}
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                        placeholder="Số điện thoại"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                  </View>

                  <View style={styles.rowInputs}>
                    <View style={{ width: 95 }}>
                      <Text style={styles.inputLabel}>Cân nặng (kg)</Text>
                      <TextInput
                        style={styles.input}
                        value={weightKg}
                        onChangeText={setWeightKg}
                        keyboardType="numeric"
                        placeholder="55"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Địa chỉ (Phường/Xã)</Text>
                      <TextInput
                        style={styles.input}
                        value={address}
                        onChangeText={setAddress}
                        placeholder="Số nhà, Phường/Xã"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
                    onPress={handlePreRegister}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="notifications" size={18} color="#FFFFFF" />
                        <Text style={styles.submitBtnText}>
                          {myPreRegistration
                            ? 'CẬP NHẬT ĐK NHẬN THÔNG BÁO'
                            : 'ĐK NHẬN THÔNG BÁO ĐỢT HIẾN'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {myPreRegistration && (
                    <TouchableOpacity
                      style={[styles.cancelOutlineBtn, submitting && { opacity: 0.7 }]}
                      onPress={handleCancelPreRegister}
                      disabled={submitting}
                    >
                      <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                      <Text style={styles.cancelOutlineBtnText}>HỦY ĐĂNG KÝ HIẾN MÁU</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                /* ================= TAB 2: SỰ KIỆN HIẾN MÁU & XÁC NHẬN THAM GIA ================= */
                <View>
                  {activeEvents.length === 0 ? (
                    <View style={styles.emptyBox}>
                      <Ionicons name="calendar-clear-outline" size={44} color="#94A3B8" />
                      <Text style={styles.emptyTitle}>
                        Chưa có đợt hiến máu nào đang mở
                      </Text>
                      <Text style={styles.emptySubtitle}>
                        Bạn có thể đăng ký trước ở tab "Đăng ký trước" để nhận thông báo ngay
                        khi địa phương tổ chức sự kiện hiến máu mới.
                      </Text>
                    </View>
                  ) : (
                    <>
                      {/* Danh sách chọn các sự kiện đang mở */}
                      <Text style={styles.sectionLabel}>
                        Chọn sự kiện hiến máu ({activeEvents.length}):
                      </Text>
                      <View style={styles.eventListBox}>
                        {activeEvents.map((ev) => {
                          const isSelected = selectedEvent?._id === ev._id;
                          const respStatus = ev.myResponse?.status;
                          return (
                            <TouchableOpacity
                              key={ev._id}
                              style={[
                                styles.eventSelectorItem,
                                isSelected && styles.eventSelectorItemActive,
                              ]}
                              onPress={() => {
                                selectEventItem(ev, myPreRegistration);
                                setFeedbackBanner(null);
                              }}
                            >
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={[
                                    styles.eventSelectorTitle,
                                    isSelected && { color: '#0369A1' },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {ev.title}
                                </Text>
                                <Text style={styles.eventSelectorMeta} numberOfLines={1}>
                                  📍 {ev.locationName} • 🗓️ {formatDate(ev.eventDate)} (
                                  {ev.startTime} - {ev.endTime})
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.eventRespBadge,
                                  respStatus === 'CONFIRMED' || respStatus === 'COMPLETED'
                                    ? styles.badgeConfirmed
                                    : respStatus === 'DECLINED'
                                      ? styles.badgeDeclined
                                      : styles.badgeUnresponded,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.eventRespBadgeText,
                                    respStatus === 'CONFIRMED' || respStatus === 'COMPLETED'
                                      ? { color: '#15803D' }
                                      : respStatus === 'DECLINED'
                                        ? { color: '#64748B' }
                                        : { color: '#D97706' },
                                  ]}
                                >
                                  {respStatus === 'CONFIRMED' || respStatus === 'COMPLETED'
                                    ? 'Đã đăng ký'
                                    : respStatus === 'DECLINED'
                                      ? 'Từ chối'
                                      : 'Chưa xác nhận'}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Chi tiết sự kiện đang chọn (Thiết kế gọn gàng) */}
                      {selectedEvent && (
                        <View style={styles.eventDetailCard}>
                          <View style={styles.eventHeaderRow}>
                            <Text style={styles.eventDetailTitle} numberOfLines={2}>
                              {selectedEvent.title}
                            </Text>
                            <View style={styles.areaBadge}>
                              <Text style={styles.areaBadgeText}>
                                {selectedEvent.areaName || 'Toàn hệ thống'}
                              </Text>
                            </View>
                          </View>

                          {Boolean(selectedEvent.description) && (
                            <Text style={styles.eventDetailDesc} numberOfLines={2}>
                              {selectedEvent.description}
                            </Text>
                          )}

                          {/* Khung Địa điểm & Ngày giờ gọn gàng */}
                          <View style={styles.infoGrid}>
                            <View style={styles.infoRow}>
                              <Ionicons name="location" size={15} color="#DC2626" style={{ marginTop: 1 }} />
                              <Text style={styles.infoCompactText} numberOfLines={2}>
                                <Text style={styles.infoRowLabel}>Địa điểm: </Text>
                                <Text style={styles.infoRowValue}>{selectedEvent.locationName}</Text>
                                {selectedEvent.address ? (
                                  <Text style={styles.infoRowSub}> ({selectedEvent.address})</Text>
                                ) : null}
                              </Text>
                            </View>

                            <View style={styles.infoRow}>
                              <Ionicons name="time" size={15} color="#0284C7" style={{ marginTop: 1 }} />
                              <Text style={styles.infoCompactText}>
                                <Text style={styles.infoRowLabel}>Thời gian: </Text>
                                <Text style={styles.infoRowValue}>
                                  {formatDate(selectedEvent.eventDate)} • {selectedEvent.startTime} - {selectedEvent.endTime}
                                </Text>
                              </Text>
                            </View>

                            <View style={styles.infoRow}>
                              <Ionicons name="water" size={15} color="#E11D48" style={{ marginTop: 1 }} />
                              <Text style={styles.infoCompactText}>
                                <Text style={styles.infoRowLabel}>Nhóm máu: </Text>
                                <Text style={styles.infoRowValue}>
                                  {!selectedEvent.neededBloodTypes ||
                                  selectedEvent.neededBloodTypes.includes('ALL')
                                    ? 'Tất cả (O, A, B, AB)'
                                    : selectedEvent.neededBloodTypes.join(', ')}
                                </Text>
                              </Text>
                            </View>

                            <View style={styles.infoRow}>
                              <Ionicons name="medkit" size={15} color="#16A34A" style={{ marginTop: 1 }} />
                              <Text style={styles.infoCompactText} numberOfLines={2}>
                                <Text style={styles.infoRowLabel}>Đơn vị: </Text>
                                <Text style={styles.infoRowValue}>
                                  {selectedEvent.organizerName}
                                  {selectedEvent.contactPhone
                                    ? ` (${selectedEvent.contactPhone})`
                                    : ''}
                                </Text>
                              </Text>
                            </View>

                            {Boolean(selectedEvent.requirements) && (
                              <View style={styles.reqBox}>
                                <Text style={styles.reqText} numberOfLines={2}>
                                  <Text style={styles.reqTitle}>📋 Lưu ý: </Text>
                                  {selectedEvent.requirements}
                                </Text>
                              </View>
                            )}
                          </View>

                          {/* Khung xác nhận tham gia của người dân (Gọn 1 hàng) */}
                          <Text style={[styles.sectionLabel, { marginTop: 10, marginBottom: 6 }]}>
                            Xác nhận đăng ký tham gia:
                          </Text>

                          <View style={styles.choiceRow}>
                            <TouchableOpacity
                              style={[
                                styles.choiceCard,
                                eventChoice === 'CONFIRMED' && styles.choiceCardConfirmActive,
                              ]}
                              onPress={() => setEventChoice('CONFIRMED')}
                            >
                              <Ionicons
                                name="checkmark-circle"
                                size={18}
                                color={eventChoice === 'CONFIRMED' ? '#0284C7' : '#94A3B8'}
                              />
                              <Text
                                style={[
                                  styles.choiceCardTitle,
                                  eventChoice === 'CONFIRMED' && { color: '#0369A1' },
                                ]}
                              >
                                ĐĂNG KÝ THAM GIA
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[
                                styles.choiceCard,
                                eventChoice === 'DECLINED' && styles.choiceCardDeclineActive,
                              ]}
                              onPress={() => setEventChoice('DECLINED')}
                            >
                              <Ionicons
                                name="close-circle"
                                size={18}
                                color={eventChoice === 'DECLINED' ? '#475569' : '#94A3B8'}
                              />
                              <Text
                                style={[
                                  styles.choiceCardTitle,
                                  eventChoice === 'DECLINED' && { color: '#334155' },
                                ]}
                              >
                                CHƯA THỂ THAM GIA
                              </Text>
                            </TouchableOpacity>
                          </View>

                          {/* Chọn nhanh nhóm máu nếu đồng ý tham gia */}
                          {eventChoice === 'CONFIRMED' && (
                            <>
                              <Text style={styles.inputLabel}>Nhóm máu của bạn:</Text>
                              <View style={styles.bloodGrid}>
                                {BLOOD_TYPES.map((bt) => {
                                  const active = bloodType === bt;
                                  return (
                                    <TouchableOpacity
                                      key={bt}
                                      style={[
                                        styles.bloodChip,
                                        active && styles.bloodChipActive,
                                      ]}
                                      onPress={() => setBloodType(bt)}
                                    >
                                      <Text
                                        style={[
                                          styles.bloodChipText,
                                          active && styles.bloodChipTextActive,
                                        ]}
                                      >
                                        {bt === 'UNKNOWN' ? 'Chưa rõ' : bt}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </>
                          )}

                          <Text style={styles.inputLabel}>Ghi chú thêm (tùy chọn):</Text>
                          <TextInput
                            style={[styles.input, { marginBottom: 6 }]}
                            value={eventNote}
                            onChangeText={setEventNote}
                            placeholder="VD: Tôi sẽ đến vào khoảng 8h30 sáng..."
                            placeholderTextColor="#94A3B8"
                          />

                          <TouchableOpacity
                            style={[
                              styles.submitBtn,
                              eventChoice === 'DECLINED' && { backgroundColor: '#475569' },
                              submitting && { opacity: 0.7 },
                            ]}
                            onPress={handleRespondEvent}
                            disabled={submitting}
                          >
                            {submitting ? (
                              <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                              <>
                                <Ionicons
                                  name={
                                    eventChoice === 'CONFIRMED'
                                      ? 'heart-circle'
                                      : 'checkmark-done'
                                  }
                                  size={18}
                                  color="#FFFFFF"
                                />
                                <Text style={styles.submitBtnText}>
                                  {selectedEvent.myResponse
                                    ? 'CẬP NHẬT XÁC NHẬN'
                                    : eventChoice === 'CONFIRMED'
                                      ? 'XÁC NHẬN THAM GIA'
                                      : 'KHÔNG THAM GIA ĐỢT NÀY'}
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>

                          {selectedEvent.myResponse && (
                            <TouchableOpacity
                              style={[styles.cancelOutlineBtn, submitting && { opacity: 0.7 }]}
                              onPress={handleCancelEventRegistration}
                              disabled={submitting}
                            >
                              <Ionicons name="close-circle-outline" size={17} color="#DC2626" />
                              <Text style={styles.cancelOutlineBtnText}>
                                HỦY ĐĂNG KÝ ĐỢT HIẾN MÁU NÀY
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    minHeight: '65%',
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 18,
    marginTop: 12,
    marginBottom: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
    gap: 6,
  },
  tabItemActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  pendingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#0284C7',
  },
  tabBadge: {
    backgroundColor: '#0284C7',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748B',
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  bannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  bannerSuccess: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  bannerError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  bannerText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 18,
  },
  statusBannerCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
    marginBottom: 14,
  },
  statusBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statusPillPending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillPendingText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#B45309',
  },
  statusTimeText: {
    fontSize: 12.5,
    color: '#475569',
    fontWeight: '600',
  },
  statusDescText: {
    fontSize: 12.5,
    color: '#78350F',
    lineHeight: 18,
  },
  switchToEventBtn: {
    marginTop: 10,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  switchToEventBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  introCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 13,
    padding: 12,
    marginBottom: 14,
  },
  introTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 4,
  },
  introDesc: {
    fontSize: 12,
    color: '#7F1D1D',
    lineHeight: 17,
  },
  sectionLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  bloodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  bloodChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  bloodChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  bloodChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  bloodChipTextActive: {
    color: '#FFFFFF',
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12.5,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    marginBottom: 8,
  },
  dropdownTrigger: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dropdownTriggerText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    marginTop: -6,
    marginBottom: 12,
    overflow: 'hidden',
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownOptionActive: {
    backgroundColor: '#FEF2F2',
  },
  dropdownOptionText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  dropdownOptionTextActive: {
    color: '#DC2626',
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 11,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  cancelOutlineBtn: {
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    borderRadius: 11,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  cancelOutlineBtnText: {
    color: '#334155',
    fontSize: 12.5,
    fontWeight: '800',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  eventListBox: {
    gap: 6,
    marginBottom: 10,
  },
  eventSelectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    gap: 8,
  },
  eventSelectorItemActive: {
    borderColor: '#0284C7',
    backgroundColor: '#F0F9FF',
  },
  eventSelectorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  eventSelectorMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  eventRespBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeConfirmed: {
    backgroundColor: '#DCFCE7',
  },
  badgeDeclined: {
    backgroundColor: '#F1F5F9',
  },
  badgeUnresponded: {
    backgroundColor: '#FEF3C7',
  },
  eventRespBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  eventDetailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 11,
  },
  eventHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  areaBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  areaBadgeText: {
    color: '#0369A1',
    fontSize: 10.5,
    fontWeight: '700',
  },
  eventDetailTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  eventDetailDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
    marginBottom: 8,
  },
  infoGrid: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  infoCompactText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#0F172A',
  },
  infoRowLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  infoRowValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  infoRowSub: {
    fontSize: 11.5,
    color: '#475569',
  },
  reqBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  reqTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#B45309',
  },
  reqText: {
    fontSize: 11.5,
    color: '#92400E',
    lineHeight: 16,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 9,
  },
  choiceCard: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
  },
  choiceCardConfirmActive: {
    borderColor: '#0284C7',
    backgroundColor: '#F0F9FF',
  },
  choiceCardDeclineActive: {
    borderColor: '#64748B',
    backgroundColor: '#F1F5F9',
  },
  choiceCardTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#475569',
  },
});


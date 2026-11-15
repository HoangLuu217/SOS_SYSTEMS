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
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  bloodDonationApi,
  BloodDonationEventItem,
  BloodDonationHistoryItem,
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
  const [activeTab, setActiveTab] = useState<'PRE_REGISTER' | 'EVENTS' | 'HISTORY'>('PRE_REGISTER');
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
  const [donationHistory, setDonationHistory] = useState<BloodDonationHistoryItem[]>([]);
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
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // Form Xác nhận sự kiện
  const [eventChoice, setEventChoice] = useState<'CONFIRMED' | 'DECLINED'>('CONFIRMED');
  const [eventNote, setEventNote] = useState('');

  const selectEventItem = useCallback(
    (ev: BloodDonationEventItem, preReg: BloodDonationRegistrationItem | null) => {
      setSelectedEvent(ev);
      setEventChoice('CONFIRMED');
      if (ev.myResponse) {
        setEventNote(ev.myResponse.note || '');
        if (ev.myResponse.bloodType) setBloodType(ev.myResponse.bloodType);
      } else {
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
        const history = Array.isArray(res.data.donationHistory) ? res.data.donationHistory : [];
        const fromAreaApi = Array.isArray(areaRes?.data) ? areaRes!.data : [];
        const provList =
          fromAreaApi.length > 0
            ? fromAreaApi
            : Array.isArray(res.data.provinces)
              ? res.data.provinces
              : [];

        setMyPreRegistration(pre);
        setActiveEvents(events);
        setDonationHistory(history);
        setProvinces(provList);

        // Điền thông tin form từ hồ sơ đã đăng ký hoặc từ user
        const initAddress = pre?.address || (user as any)?.address || '';
        setFullName(pre?.fullName || user?.fullName || '');
        setPhone(pre?.phone || user?.phone || '');
        setBloodType(pre?.bloodType || (user as any)?.citizen?.bloodType || 'UNKNOWN');
        setWeightKg(pre?.weightKg ? String(pre.weightKg) : '55');
        setAddress(initAddress);

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
            } else {
              setSelectedEvent(null);
            }
          }
        } else {
          // Mặc định mở thẳng danh sách các sự kiện hiến máu
          setSelectedEvent(null);
          setActiveTab('EVENTS');
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

  // Đồng bộ ngầm trạng thái sự kiện (ví dụ: khi Web đánh dấu "Đã hiến máu")
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(async () => {
      try {
        const statusRes = await bloodDonationApi.getMyStatus();
        if (statusRes.success && statusRes.data) {
          const events = statusRes.data.activeEvents || [];
          setActiveEvents(events);
          if (statusRes.data.myPreRegistration) {
            setMyPreRegistration(statusRes.data.myPreRegistration);
            if (
              statusRes.data.myPreRegistration.bloodType &&
              statusRes.data.myPreRegistration.bloodType !== 'UNKNOWN'
            ) {
              setBloodType(statusRes.data.myPreRegistration.bloodType);
            }
          }
          setSelectedEvent((prev) => {
            if (!prev) return null;
            const updated = events.find((e) => String(e._id) === String(prev._id));
            return updated || prev;
          });
        }
      } catch {
        // ignore silent poll error
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [visible]);

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
        status: 'CONFIRMED',
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
        if (bloodType && bloodType !== 'UNKNOWN') {
          setMyPreRegistration((prev) => (prev ? { ...prev, bloodType } : prev));
        }
        setFeedbackBanner({
          type: 'success',
          text: `Đã đăng ký tham gia tại "${selectedEvent.locationName}"!`,
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

  const upcomingEvents = activeEvents.filter((ev) => ev.myResponse?.status !== 'COMPLETED');
  const historyItems =
    donationHistory.length > 0
      ? donationHistory
      : activeEvents
          .filter((ev) => ev.myResponse?.status === 'COMPLETED')
          .map((ev) => ({
            ...(ev.myResponse as BloodDonationRegistrationItem),
            eventId: {
              _id: ev._id,
              title: ev.title,
              locationName: ev.locationName,
              address: ev.address,
              eventDate: ev.eventDate,
              startTime: ev.startTime,
              endTime: ev.endTime,
              organizerName: ev.organizerName,
            },
          }));

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
                <Text style={styles.headerTitle}>Hiến Máu</Text>
                {activeTab === 'HISTORY' && (
                  <Text style={styles.headerSubtitle}>
                    Lịch sử hiến máu ({historyItems.length})
                  </Text>
                )}
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {historyItems.length > 0 && (
                <TouchableOpacity
                  style={[
                    styles.historyHeaderBtn,
                    activeTab === 'HISTORY' && styles.historyHeaderBtnActive,
                  ]}
                  onPress={() => {
                    setSelectedEvent(null);
                    setFeedbackBanner(null);
                    setActiveTab((prev) => (prev === 'HISTORY' ? 'EVENTS' : 'HISTORY'));
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={activeTab === 'HISTORY' ? 'arrow-back' : 'time-outline'}
                    size={15}
                    color={activeTab === 'HISTORY' ? '#0284C7' : '#475569'}
                  />
                  <Text
                    style={[
                      styles.historyHeaderBtnText,
                      activeTab === 'HISTORY' && { color: '#0284C7' },
                    ]}
                  >
                    {activeTab === 'HISTORY' ? 'Quay lại' : 'Lịch sử'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>
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
                /* ================= CÀI ĐẶT NHẬN THÔNG BÁO ĐỢT HIẾN MÁU ================= */
                <View>
                  <TouchableOpacity
                    style={styles.backToListBtn}
                    onPress={() => {
                      setActiveTab('EVENTS');
                      setFeedbackBanner(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="arrow-back" size={14} color="#0284C7" />
                    <Text style={styles.backToListBtnText}>Quay lại</Text>
                  </TouchableOpacity>

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

                  <View style={styles.preRegActionRow}>
                    {myPreRegistration && (
                      <TouchableOpacity
                        style={[
                          styles.cancelOutlineBtn,
                          styles.preRegActionBtn,
                          submitting && { opacity: 0.7 },
                        ]}
                        onPress={handleCancelPreRegister}
                        disabled={submitting}
                      >
                        <Ionicons name="close-circle-outline" size={17} color="#DC2626" />
                        <Text style={styles.cancelOutlineBtnText} numberOfLines={1}>
                          HỦY ĐĂNG KÝ
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[
                        styles.submitBtn,
                        styles.preRegActionBtn,
                        submitting && { opacity: 0.7 },
                      ]}
                      onPress={handlePreRegister}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <Ionicons name="notifications" size={17} color="#FFFFFF" />
                          <Text style={styles.submitBtnText} numberOfLines={1}>
                            {myPreRegistration
                              ? 'CẬP NHẬT'
                              : 'ĐK NHẬN THÔNG BÁO ĐỢT HIẾN'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : activeTab === 'HISTORY' ? (
                /* ================= LỊCH SỬ HIẾN MÁU ================= */
                <View>
                  <Text style={styles.sectionLabel}>
                    Lịch sử hiến máu ({historyItems.length}):
                  </Text>
                  {historyItems.length === 0 ? (
                    <View style={styles.emptyBox}>
                      <Ionicons name="time-outline" size={44} color="#94A3B8" />
                      <Text style={styles.emptyTitle}>Chưa có lịch sử hiến máu</Text>
                      <Text style={styles.emptySubtitle}>
                        Các đợt bạn đã hoàn thành hiến máu sẽ được lưu tại đây.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 10 }}>
                      {historyItems.map((item) => {
                        const evInfo =
                          typeof item.eventId === 'object' && item.eventId
                            ? item.eventId
                            : null;
                        const matchingActiveEvent = evInfo?._id
                          ? activeEvents.find((e) => e._id === evInfo._id)
                          : undefined;

                        return (
                          <TouchableOpacity
                            key={item._id}
                            style={styles.historyCard}
                            disabled={!matchingActiveEvent}
                            onPress={() => {
                              if (matchingActiveEvent) {
                                setActiveTab('EVENTS');
                                selectEventItem(matchingActiveEvent, myPreRegistration);
                                setFeedbackBanner(null);
                              }
                            }}
                            activeOpacity={matchingActiveEvent ? 0.75 : 1}
                          >
                            <View style={styles.historyCardTop}>
                              <Text style={styles.historyCardTitle}>
                                {evInfo?.title || 'Đợt hiến máu tình nguyện'}
                              </Text>
                              <View style={styles.historyDoneBadge}>
                                <Ionicons name="checkmark-circle" size={12} color="#15803D" />
                                <Text style={styles.historyDoneBadgeText}>Đã hiến máu</Text>
                              </View>
                            </View>
                            <Text style={styles.historyCardMeta}>
                              📍 {evInfo?.locationName || item.areaName || '—'}
                              {evInfo?.address ? ` • ${evInfo.address}` : ''}
                            </Text>
                            <Text style={styles.historyCardMeta}>
                              🗓️ {formatDate(evInfo?.eventDate || item.respondedAt || item.createdAt)}
                              {evInfo?.startTime && evInfo?.endTime
                                ? ` (${evInfo.startTime} - ${evInfo.endTime})`
                                : ''}
                            </Text>
                            <View style={styles.historyMetaRow}>
                              {item.bloodType && item.bloodType !== 'UNKNOWN' && (
                                <View style={styles.historyBloodChip}>
                                  <Text style={styles.historyBloodChipText}>
                                    Nhóm {item.bloodType}
                                  </Text>
                                </View>
                              )}
                              {item.donatedVolumeMl ? (
                                <View style={styles.historyVolChip}>
                                  <Text style={styles.historyVolChipText}>
                                    {item.donatedVolumeMl} ml
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ) : (
                /* ================= TAB 2: SỰ KIỆN HIẾN MÁU & XÁC NHẬN THAM GIA ================= */
                <View>
                  {!selectedEvent ? (
                    <View>
                      {/* Cài đặt thông báo gọn gàng nằm trên */}
                      <TouchableOpacity
                        style={styles.notifSettingsBtn}
                        onPress={() => {
                          setActiveTab('PRE_REGISTER');
                          setFeedbackBanner(null);
                        }}
                        activeOpacity={0.75}
                      >
                        <View style={styles.notifSettingsIconBox}>
                          <Ionicons name="notifications-outline" size={16} color="#0284C7" />
                        </View>
                        <Text style={styles.notifSettingsTitle} numberOfLines={1}>
                          Cài đặt thông báo
                        </Text>
                        {myPreRegistration?.status === 'PENDING' && (
                          <View style={styles.notifActivePill}>
                            <View style={styles.pendingDot} />
                            <Text style={styles.notifActivePillText}>Đã bật</Text>
                          </View>
                        )}
                        <Ionicons name="chevron-forward" size={16} color="#64748B" />
                      </TouchableOpacity>

                      {upcomingEvents.length === 0 ? (
                        <View style={styles.emptyBox}>
                          <Ionicons name="calendar-clear-outline" size={44} color="#94A3B8" />
                          <Text style={styles.emptyTitle}>
                            Chưa có đợt hiến máu nào đang mở
                          </Text>
                          <Text style={styles.emptySubtitle}>
                            Bạn có thể cài đặt thông báo ở trên để nhận tin ngay khi địa phương
                            tổ chức sự kiện hiến máu mới.
                          </Text>
                          {historyItems.length > 0 && (
                            <TouchableOpacity
                              style={styles.historyEmptyBtn}
                              onPress={() => setActiveTab('HISTORY')}
                              activeOpacity={0.75}
                            >
                              <Ionicons name="time-outline" size={15} color="#0284C7" />
                              <Text style={styles.historyEmptyBtnText}>
                                Xem lịch sử ({historyItems.length})
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      ) : (
                        /* CHỈ HIỂN THỊ DANH SÁCH CÁC ĐỢT HIẾN MÁU CHƯA HIẾN */
                        <>
                          <Text style={styles.sectionLabel}>
                            Chọn sự kiện hiến máu để xem chi tiết ({upcomingEvents.length}):
                          </Text>
                          <View style={styles.eventListBox}>
                            {upcomingEvents.map((ev) => {
                              const respStatus = ev.myResponse?.status;
                              return (
                                <TouchableOpacity
                                  key={ev._id}
                                  style={styles.eventSelectorItem}
                                  onPress={() => {
                                    selectEventItem(ev, myPreRegistration);
                                    setFeedbackBanner(null);
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <View style={{ flex: 1 }}>
                                    <Text
                                      style={styles.eventSelectorTitle}
                                      numberOfLines={1}
                                    >
                                      {ev.title}
                                    </Text>
                                    <Text style={styles.eventSelectorMeta} numberOfLines={1}>
                                      📍 {ev.locationName} • 🗓️ {formatDate(ev.eventDate)} ({ev.startTime} - {ev.endTime})
                                    </Text>
                                  </View>
                                  <View
                                    style={[
                                      styles.eventRespBadge,
                                      respStatus === 'CONFIRMED'
                                        ? styles.badgeConfirmed
                                        : respStatus === 'DECLINED'
                                          ? styles.badgeDeclined
                                          : styles.badgeUnresponded,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.eventRespBadgeText,
                                        respStatus === 'CONFIRMED'
                                          ? { color: '#15803D' }
                                          : respStatus === 'DECLINED'
                                            ? { color: '#64748B' }
                                            : { color: '#D97706' },
                                      ]}
                                    >
                                      {respStatus === 'CONFIRMED'
                                        ? 'Đã đăng ký'
                                        : respStatus === 'DECLINED'
                                          ? 'Từ chối'
                                          : 'Chưa xác nhận'}
                                    </Text>
                                  </View>
                                  <Ionicons name="chevron-forward" size={17} color="#94A3B8" />
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </>
                      )}
                    </View>
                  ) : (
                    /* 2. NHẤN VÀO MỚI MỞ TRONG: CHI TIẾT & FORM XÁC NHẬN */
                    <View>
                      <TouchableOpacity
                        style={styles.backToListBtn}
                        onPress={() => {
                          setSelectedEvent(null);
                          setFeedbackBanner(null);
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="arrow-back" size={14} color="#0284C7" />
                        <Text style={styles.backToListBtnText}>Quay lại</Text>
                      </TouchableOpacity>

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
                              <View style={{ flex: 1 }}>
                                <Text style={styles.infoCompactText}>
                                  <Text style={styles.infoRowLabel}>Địa điểm: </Text>
                                  <Text style={styles.infoRowValue}>{selectedEvent.locationName}</Text>
                                </Text>
                                {Boolean((selectedEvent as any).googleMapsUrl || selectedEvent.address) && (
                                  <TouchableOpacity
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      gap: 4,
                                      marginTop: 4,
                                      paddingVertical: 3,
                                      paddingHorizontal: 8,
                                      borderRadius: 6,
                                      backgroundColor: '#EFF6FF',
                                      alignSelf: 'flex-start',
                                    }}
                                    onPress={() => {
                                      const mapUrl =
                                        (selectedEvent as any).googleMapsUrl ||
                                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                          `${selectedEvent.locationName} ${selectedEvent.address || ''}`.trim()
                                        )}`;
                                      Linking.openURL(mapUrl).catch(() => {});
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <Ionicons name="navigate-outline" size={12} color="#0066FF" />
                                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#0066FF' }}>
                                      Chỉ đường Google Maps ↗
                                    </Text>
                                  </TouchableOpacity>
                                )}
                              </View>
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
                          {selectedEvent.myResponse?.status === 'COMPLETED' ? (
                            <View
                              style={{
                                marginTop: 12,
                                padding: 14,
                                borderRadius: 12,
                                backgroundColor: '#ECFDF5',
                                borderWidth: 1,
                                borderColor: '#6EE7B7',
                                alignItems: 'center',
                              }}
                            >
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 6,
                                  marginBottom: 4,
                                }}
                              >
                                <Ionicons name="checkmark-circle" size={22} color="#059669" />
                                <Text
                                  style={{
                                    fontSize: 15,
                                    fontWeight: '700',
                                    color: '#047857',
                                  }}
                                >
                                  Đã hiến máu
                                </Text>
                              </View>
                              <Text
                                style={{
                                  fontSize: 13,
                                  color: '#065F46',
                                  textAlign: 'center',
                                  lineHeight: 18,
                                }}
                              >
                                Cảm ơn nghĩa cử cao đẹp của bạn! Đơn vị tổ chức đã xác nhận bạn hoàn thành hiến máu trong đợt này.
                              </Text>
                              {selectedEvent.myResponse?.bloodType && (
                                <Text
                                  style={{
                                    marginTop: 6,
                                    fontSize: 12.5,
                                    fontWeight: '600',
                                    color: '#047857',
                                  }}
                                >
                                  Nhóm máu ghi nhận:{' '}
                                  {selectedEvent.myResponse.bloodType === 'UNKNOWN'
                                    ? 'Chưa rõ'
                                    : selectedEvent.myResponse.bloodType}
                                  {selectedEvent.myResponse?.donatedVolumeMl
                                    ? ` • Lượng máu đã hiến: ${selectedEvent.myResponse.donatedVolumeMl} ml`
                                    : ''}
                                </Text>
                              )}
                            </View>
                          ) : (
                            <>
                              <Text style={[styles.inputLabel, { marginTop: 10 }]}>
                                Nhóm máu của bạn:
                              </Text>
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

                              <Text style={[styles.inputLabel, { marginTop: 8 }]}>
                                Ghi chú thêm (tùy chọn):
                              </Text>
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
                                      name="heart-circle"
                                      size={18}
                                      color="#FFFFFF"
                                    />
                                    <Text style={styles.submitBtnText}>
                                      {selectedEvent.myResponse
                                        ? 'CẬP NHẬT ĐĂNG KÝ'
                                        : 'XÁC NHẬN THAM GIA'}
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
                            </>
                          )}
                        </View>
                      </View>
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
    marginTop: 2,
  },
  reqTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#D97706',
  },
  reqText: {
    fontSize: 11.5,
    color: '#B45309',
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
  backToListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#F0F9FF',
    alignSelf: 'flex-start',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  backToListBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  preRegActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  preRegActionBtn: {
    flex: 1,
    marginTop: 0,
    paddingHorizontal: 10,
  },
  notifSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  notifSettingsIconBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifSettingsTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  notifActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  notifActivePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  noUpcomingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  noUpcomingText: {
    fontSize: 12.5,
    color: '#64748B',
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  historyBloodChip: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  historyBloodChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  historyVolChip: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  historyVolChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  historyDoneText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#16A34A',
  },
  historyHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  historyHeaderBtnActive: {
    backgroundColor: '#E0F2FE',
    borderColor: '#BAE6FD',
  },
  historyHeaderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  historyEmptyBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  historyEmptyBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284C7',
  },
  historyCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
  },
  historyCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  historyCardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 20,
  },
  historyCardMeta: {
    fontSize: 12.5,
    color: '#475569',
    marginTop: 3,
    lineHeight: 18,
  },
  historyDoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
  },
  historyDoneBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
});


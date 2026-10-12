import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Modal,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { backendApi } from '../services/backendApi';

interface SOSMapScreenProps {
  onClose: () => void;
  initialEmergencyType?: string;
}

export const SOSMapScreen: React.FC<SOSMapScreenProps> = ({ onClose }) => {
  // GPS & Vị trí thực tế từ điện thoại
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [address, setAddress] = useState<string>('Đang định vị GPS...');
  const [loadingMsg, setLoadingMsg] = useState('Đang lấy vị trí GPS từ điện thoại...');
  const [locating, setLocating] = useState(true);
  const [sending, setSending] = useState(false);

  // Ảnh chụp thực địa
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  // Dữ liệu người dân nhập (Khớp 1:1 với Schema CSDL: people, description)
  const [peopleText, setPeopleText] = useState<string>('1');
  const [description, setDescription] = useState<string>('');

  // Ref cho ô nhập mô tả tình trạng
  const descInputRef = useRef<TextInput>(null);

  // Popup xác thực form sang trọng & đẹp mắt
  const [validationModalVisible, setValidationModalVisible] = useState(false);
  const [validationType, setValidationType] = useState<'desc' | 'people' | 'gps'>('desc');

  // Trạng thái tiếp nhận thành công
  const [successData, setSuccessData] = useState<{
    sosCode: string;
    people: number;
    address: string;
    isQuickDispatch: boolean;
    description: string;
    hasImage: boolean;
  } | null>(null);

  // Lấy vị trí GPS thực tế của thiết bị
  const fetchLocation = async () => {
    setLocating(true);
    setLoadingMsg('Đang lấy vị trí GPS chính xác từ điện thoại...');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền GPS', 'Vui lòng cấp quyền vị trí trong Cài đặt để gửi tọa độ cứu nạn chính xác.');
        setLoadingMsg('Bị từ chối quyền GPS');
        setAddress('Không thể truy cập GPS');
        setLocating(false);
        return;
      }

      const currentLoc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation(currentLoc);

      try {
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: currentLoc.coords.latitude,
          longitude: currentLoc.coords.longitude,
        });
        if (geo) {
          const parts = [
            geo.streetNumber,
            geo.street,
            geo.subregion,
            geo.district,
            geo.city || geo.region,
          ].filter(Boolean);
          if (parts.length > 0) {
            setAddress(parts.join(', '));
          } else {
            setAddress(`Tọa độ: ${currentLoc.coords.latitude.toFixed(5)}, ${currentLoc.coords.longitude.toFixed(5)}`);
          }
        }
      } catch {
        setAddress(`Tọa độ: ${currentLoc.coords.latitude.toFixed(4)}, ${currentLoc.coords.longitude.toFixed(4)}`);
      }
    } catch {
      setLoadingMsg('Không thể lấy được GPS. Vui lòng bật vị trí.');
      setAddress('Chưa có GPS - Vui lòng thử lại');
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  // Tăng giảm số người
  const handleAdjustPeople = (delta: number) => {
    const current = parseInt(peopleText, 10) || 1;
    const nextVal = Math.max(1, current + delta);
    setPeopleText(nextVal.toString());
  };

  // Chụp ảnh hiện trường
  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền Camera', 'Vui lòng cấp quyền Camera để chụp ảnh hiện trường ngập.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.25,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
        setImageBase64(result.assets[0].base64 || null);
      }
    } catch (err: any) {
      Alert.alert('Lỗi', 'Không thể mở Camera: ' + err.message);
    }
  };

  // Chọn ảnh từ thư viện
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền Thư viện', 'Vui lòng cấp quyền Thư viện ảnh.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.25,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
        setImageBase64(result.assets[0].base64 || null);
      }
    } catch (err: any) {
      Alert.alert('Lỗi', 'Không thể chọn ảnh: ' + err.message);
    }
  };

  const removeImage = () => {
    setImageUri(null);
    setImageBase64(null);
  };

  // Gửi yêu cầu cứu hộ lên Backend (Lưu trực tiếp vào MongoDB)
  const submitSOS = async (isQuickDispatch: boolean = false) => {
    if (!location) {
      setValidationType('gps');
      setValidationModalVisible(true);
      fetchLocation();
      return;
    }

    const peopleNumber = parseInt(peopleText, 10);
    if (!isQuickDispatch && (isNaN(peopleNumber) || peopleNumber < 1)) {
      setValidationType('people');
      setValidationModalVisible(true);
      return;
    }

    // NÚT XANH: Bắt buộc người dân phải điền mô tả tình trạng thực tế vào form (hiển thị popup tùy chỉnh đẹp mắt)
    if (!isQuickDispatch && !description.trim()) {
      setValidationType('desc');
      setValidationModalVisible(true);
      return;
    }

    setSending(true);
    try {
      const finalAddress =
        address && address !== 'Đang định vị GPS...' && address !== 'Không thể truy cập GPS'
          ? address
          : `Tọa độ GPS [${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}]`;

      const finalDescription = isQuickDispatch
        ? '⚡ BÁO NẠN 1-CHẠM: Tình huống nguy kịch! Nước ngập khẩn cấp, cô lập, cần ca-nô/xuồng cứu hộ ngay lập tức!'
        : description.trim();

      // Tự động phân loại mức độ nguy cấp ngầm
      const isCritical =
        isQuickDispatch ||
        finalDescription.toLowerCase().includes('mái nhà') ||
        finalDescription.toLowerCase().includes('nóc nhà') ||
        finalDescription.toLowerCase().includes('chảy xiết') ||
        finalDescription.toLowerCase().includes('nguy kịch') ||
        finalDescription.toLowerCase().includes('ngang ngực');

      // Payload gửi lên server - Khớp 100% với MongoDB Model
      const payload = {
        location: {
          type: 'Point',
          coordinates: [location.coords.longitude, location.coords.latitude],
        },
        address: finalAddress,
        priority: isCritical ? 'CRITICAL' : 'HIGH',
        emergencyType: 'FLOOD',
        description: finalDescription,
        people: isQuickDispatch ? 1 : peopleNumber,
      };

      const response = await backendApi.post('/sos', payload);

      if (response.success && response.data?._id) {
        const sosId = response.data._id;
        const code = response.data.sosCode || 'SOS-' + sosId.slice(-6).toUpperCase();

        if (imageBase64) {
          try {
            await backendApi.post('/files', {
              sosId,
              base64File: imageBase64,
            });
          } catch (uploadErr) {
            console.warn('Lỗi tải ảnh đính kèm:', uploadErr);
          }
        }

        setSuccessData({
          sosCode: code,
          people: payload.people,
          address: finalAddress,
          isQuickDispatch,
          description: finalDescription,
          hasImage: Boolean(imageBase64),
        });
      } else {
        Alert.alert('Không thể gửi', response.message || 'Chưa gửi được tín hiệu. Vui lòng thử lại!');
      }
    } catch (err: any) {
      Alert.alert(
        'Lỗi kết nối',
        'Không thể kết nối máy chủ cứu nạn. Vui lòng gọi trực tiếp 114 hoặc 115!\n' + (err.message || '')
      );
    } finally {
      setSending(false);
    }
  };

  // MÀN HÌNH BÁO THÀNH CÔNG
  if (successData) {
    const isQuick = successData.isQuickDispatch;
    return (
      <View style={styles.successContainer}>
        <View style={styles.successCard}>
          <View style={styles.successIconOuter}>
            {isQuick ? (
              <Ionicons name="flash" size={72} color="#DC2626" />
            ) : (
              <Ionicons name="checkmark-circle" size={76} color="#0284C7" />
            )}
          </View>

          <Text style={[styles.successTitle, isQuick && { color: '#DC2626' }]}>
            {isQuick ? '⚡ ĐÃ TIẾP NHẬN CỨU NẠN 1-CHẠM!' : '📋 ĐÃ TIẾP NHẬN BIỂU MẪU CỨU HỘ!'}
          </Text>
          <Text style={styles.successSub}>
            {isQuick
              ? 'Tín hiệu NGUY KỊCH đã được phát tới Đội ca-nô/xuồng cứu hộ và Trung tâm điều phối khẩn cấp.'
              : 'Thông tin khai báo chi tiết và tọa độ của bạn đã được chuyển tới Đội cứu nạn gần nhất.'}
          </Text>

          <View style={styles.successDetailsBox}>
            <View style={styles.successDetailRow}>
              <Text style={styles.successDetailLabel}>Mã cứu hộ:</Text>
              <Text style={styles.successDetailCode}>{successData.sosCode}</Text>
            </View>

            <View style={styles.successDetailRow}>
              <Text style={styles.successDetailLabel}>Chế độ gửi:</Text>
              <Text style={[styles.successDetailValue, { color: isQuick ? '#DC2626' : '#0284C7', fontWeight: '800' }]}>
                {isQuick ? '⚡ CỨU NẠN 1-CHẠM (CRITICAL)' : '📋 BIỂU MẪU CHI TIẾT (HIGH)'}
              </Text>
            </View>

            <View style={styles.successDetailRow}>
              <Text style={styles.successDetailLabel}>Số người cần cứu:</Text>
              <Text style={[styles.successDetailValue, { fontWeight: '700' }]}>
                {successData.people} người
              </Text>
            </View>

            {!isQuick && (
              <View style={styles.successDetailRow}>
                <Text style={styles.successDetailLabel}>Tình trạng khai báo:</Text>
                <Text style={styles.successDetailValue} numberOfLines={2}>
                  {successData.description}
                </Text>
              </View>
            )}

            {!isQuick && (
              <View style={styles.successDetailRow}>
                <Text style={styles.successDetailLabel}>Ảnh hiện trường:</Text>
                <Text style={[styles.successDetailValue, { color: successData.hasImage ? '#10B981' : '#64748B' }]}>
                  {successData.hasImage ? '✓ Đã đính kèm ảnh' : 'Không có ảnh'}
                </Text>
              </View>
            )}

            <View style={styles.successDetailRow}>
              <Text style={styles.successDetailLabel}>Vị trí GPS:</Text>
              <Text style={styles.successDetailValue} numberOfLines={2}>
                {successData.address}
              </Text>
            </View>
          </View>

          <View style={styles.emergencyCallGroup}>
            <Text style={styles.emergencyCallGroupTitle}>TRƯỜNG HỢP NƯỚC DÂNG QUÁ NHANH - GỌI NGAY:</Text>
            <View style={styles.callRow}>
              <TouchableOpacity
                style={[styles.callActionBtn, { backgroundColor: '#DC2626' }]}
                onPress={() => Linking.openURL('tel:114')}
                activeOpacity={0.8}
              >
                <Feather name="phone-call" size={16} color="#FFFFFF" />
                <Text style={styles.callActionText}>Gọi 114 (Cứu nạn)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.callActionBtn, { backgroundColor: '#0284C7' }]}
                onPress={() => Linking.openURL('tel:115')}
                activeOpacity={0.8}
              >
                <Feather name="phone-call" size={16} color="#FFFFFF" />
                <Text style={styles.callActionText}>Gọi 115 (Cấp cứu)</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.doneBtnText}>HOÀN TẤT & ĐÓNG</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onClose} activeOpacity={0.7}>
          <Feather name="x" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>CỨU HỘ NGẬP LỤT KHẨN CẤP</Text>
          <Text style={styles.headerSubTitle}>Gửi trực tiếp tới Đội cứu hộ & Ca-nô/Xuồng</Text>
        </View>
        <TouchableOpacity style={styles.reloadGpsBtn} onPress={fetchLocation} activeOpacity={0.7}>
          <Feather name="refresh-cw" size={18} color="#0284C7" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* BANNER BÁO NẠN SIÊU TỐC (Dành cho tình huống nguy cấp ngập nóc nhà) */}
          <TouchableOpacity
            style={styles.quickSosBanner}
            onPress={() => submitSOS(true)}
            activeOpacity={0.88}
          >
            <View style={styles.quickSosLeft}>
              <View style={styles.quickSosPulse}>
                <MaterialCommunityIcons name="alarm-light" size={28} color="#FFFFFF" />
              </View>
            </View>
            <View style={styles.quickSosBody}>
              <Text style={styles.quickSosTitle}>NGẬP NGUY KỊCH</Text>
              <Text style={styles.quickSosDesc}>
                Nước dâng nhanh, không kịp nhập chữ? Bấm ngay để truyền GPS khẩn cấp!
              </Text>
            </View>
          </TouchableOpacity>

          {/* VỊ TRÍ GPS HIỆN TẠI (TỰ ĐỘNG LẤY TỪ ĐIỆN THOẠI) */}
          <View style={styles.gpsCard}>
            <View style={styles.gpsHeader}>
              <View style={styles.gpsTitleRow}>
                <Ionicons name="location" size={18} color="#EF4444" />
                <Text style={styles.gpsSectionTitle}>Vị trí GPS của bạn (Tự động)</Text>
              </View>
              {locating ? (
                <ActivityIndicator size="small" color="#0284C7" />
              ) : (
                <View style={styles.gpsBadge}>
                  <View style={styles.gpsDot} />
                  <Text style={styles.gpsBadgeText}>Đã định vị</Text>
                </View>
              )}
            </View>

            <Text style={styles.gpsAddressText}>{address}</Text>

            {location && (
              <Text style={styles.gpsCoordsText}>
                Tọa độ: {location.coords.latitude.toFixed(5)}, {location.coords.longitude.toFixed(5)} (±{Math.round(location.coords.accuracy || 10)}m)
              </Text>
            )}
          </View>

          {/* MỤC 1: SỐ LƯỢNG NGƯỜI CẦN CỨU */}
          <View style={styles.formCard}>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons name="account-group" size={20} color="#0284C7" />
              <Text style={styles.cardHeading}>1. Số người cần cứu</Text>
            </View>
            <Text style={styles.cardSubText}>
              Nhập số lượng người cần cứu:
            </Text>

            {/* Ô nhập số người có nút trừ / cộng */}
            <View style={styles.peopleInputRow}>
              <TouchableOpacity
                style={styles.counterActionBtn}
                onPress={() => handleAdjustPeople(-1)}
                activeOpacity={0.7}
              >
                <Feather name="minus" size={22} color="#0F172A" />
              </TouchableOpacity>

              <View style={styles.peopleDirectInputBox}>
                <TextInput
                  style={styles.peopleDirectInput}
                  keyboardType="numeric"
                  value={peopleText}
                  onChangeText={setPeopleText}
                  selectTextOnFocus
                  maxLength={4}
                />
                <Text style={styles.peopleDirectUnit}>người</Text>
              </View>

              <TouchableOpacity
                style={styles.counterActionBtn}
                onPress={() => handleAdjustPeople(1)}
                activeOpacity={0.7}
              >
                <Feather name="plus" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>
          </View>

          {/* MỤC 2: MÔ TẢ TÌNH TRẠNG CỤ THỂ CỦA BẠN */}
          <View style={styles.formCard}>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons name="comment-text-outline" size={20} color="#EF4444" />
              <Text style={styles.cardHeading}>2. Tình trạng ngập lụt thực tế</Text>
            </View>
            <Text style={styles.cardSubText}>
              Mô tả tình trạng cụ thể của bạn:
            </Text>

            <TextInput
              ref={descInputRef}
              style={styles.descInput}
              multiline
              numberOfLines={4}
              placeholder="Ví dụ: Nước ngập tầng 1 cao 1m5, đang trèo lên mái nhà, cần xuồng cứu gấp..."
              placeholderTextColor="#94A3B8"
              value={description}
              onChangeText={setDescription}
            />
          </View>

          {/* MỤC 3: ẢNH HIỆN TRƯỜNG THỰC TẾ (Không bắt buộc) */}
          <View style={styles.formCard}>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons name="camera" size={20} color="#059669" />
              <Text style={styles.cardHeading}>3. Ảnh hiện trường (Không bắt buộc)</Text>
            </View>
            <Text style={styles.cardSubText}>
              Chụp ảnh mức nước ngập (bỏ qua nếu nước đang chảy xiết):
            </Text>

            <View style={styles.photoActionsRow}>
              <TouchableOpacity style={styles.photoBtn} onPress={takePhoto} activeOpacity={0.75}>
                <Feather name="camera" size={18} color="#0284C7" />
                <Text style={styles.photoBtnText}>Chụp ảnh nước ngập</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.photoBtn} onPress={pickImage} activeOpacity={0.75}>
                <Feather name="image" size={18} color="#0284C7" />
                <Text style={styles.photoBtnText}>Chọn ảnh từ máy</Text>
              </TouchableOpacity>
            </View>

            {imageUri && (
              <View style={styles.imagePreviewWrap}>
                <Image source={{ uri: imageUri }} style={styles.previewImage} />
                <TouchableOpacity style={styles.removeImgBtn} onPress={removeImage} activeOpacity={0.8}>
                  <Ionicons name="close-circle" size={26} color="#DC2626" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* NÚT GỬI CỨU HỘ TO RÕ RÀNG */}
          <TouchableOpacity
            style={styles.mainSendBtn}
            onPress={() => submitSOS(false)}
            disabled={sending}
            activeOpacity={0.85}
          >
            {sending ? (
              <View style={styles.sendingRow}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.mainSendBtnText}>ĐANG PHÁT TÍN HIỆU CỨU NẠN...</Text>
              </View>
            ) : (
              <View style={styles.sendingRow}>
                <MaterialCommunityIcons name="waves" size={24} color="#FFFFFF" />
                <Text style={styles.mainSendBtnText}>GỬI YÊU CẦU CỨU HỘ NGẬP LỤT</Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* POPUP XÁC THỰC NHẬP FORM HIỆN ĐẠI & ĐẸP MẮT */}
      <Modal
        visible={validationModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setValidationModalVisible(false)}
      >
        <View style={styles.valModalBackdrop}>
          <View style={styles.valModalCard}>
            {/* ICON BADGE */}
            <View
              style={[
                styles.valBadgeWrap,
                validationType === 'desc'
                  ? { backgroundColor: '#EFF6FF', borderColor: '#BAE6FD' }
                  : { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
              ]}
            >
              {validationType === 'desc' ? (
                <MaterialCommunityIcons name="comment-alert" size={36} color="#0284C7" />
              ) : validationType === 'people' ? (
                <MaterialCommunityIcons name="account-alert" size={36} color="#D97706" />
              ) : (
                <MaterialCommunityIcons name="crosshairs-gps" size={36} color="#D97706" />
              )}
            </View>

            {/* TIÊU ĐỀ POPUP */}
            <Text style={styles.valTitle}>
              {validationType === 'desc'
                ? 'Chưa Nhập Tình Trạng Ngập'
                : validationType === 'people'
                ? 'Chưa Nhập Số Người Cần Cứu'
                : 'Chưa Xác Định Tọa Độ GPS'}
            </Text>

            {/* NỘI DUNG MÔ TẢ HƯỚNG DẪN */}
            <Text style={styles.valDesc}>
              {validationType === 'desc'
                ? 'Vui lòng mô tả tình hình thực tế (mức nước ngập, có người già, trẻ nhỏ...) ở Mục 2 để Đội cứu nạn chuẩn bị đúng phương tiện ứng cứu chính xác.'
                : validationType === 'people'
                ? 'Vui lòng nhập số người đang gặp nạn (tối thiểu 1 người) để lực lượng cứu hộ bố trí xuồng hoặc ca-nô đủ chỗ đón.'
                : 'Hệ thống đang dò GPS của bạn. Vui lòng bật vị trí để Đội cứu hộ định vị chính xác địa điểm ngập.'}
            </Text>

            {/* HỘP CẢNH BÁO TÌNH THẾ NGUY CẤP (Dành cho trường hợp đang ngập xiết) */}
            {validationType === 'desc' && (
              <View style={styles.valEmergencyCallout}>
                <View style={styles.valEmergencyHeader}>
                  <MaterialCommunityIcons name="alarm-light" size={16} color="#DC2626" />
                  <Text style={styles.valEmergencyTitle}>TÌNH THẾ NGUY CẤP?</Text>
                </View>
                <Text style={styles.valEmergencyText}>
                  Nếu nước đang dâng xiết, nguy kịch không kịp gõ chữ, hãy bấm "Báo ngập nguy kịch" để đội cứu hộ xuất kích ca-nô ngay!
                </Text>
              </View>
            )}

            {/* CÁC NÚT HÀNH ĐỘNG */}
            {validationType === 'desc' ? (
              <View style={styles.valActionsCol}>
                <TouchableOpacity
                  style={styles.valActionPrimary}
                  activeOpacity={0.85}
                  onPress={() => {
                    setValidationModalVisible(false);
                    setTimeout(() => {
                      descInputRef.current?.focus();
                    }, 200);
                  }}
                >
                  <Feather name="edit-3" size={16} color="#FFFFFF" />
                  <Text style={styles.valActionPrimaryText}>Điền mô tả tình trạng ngay</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.valActionEmergency}
                  activeOpacity={0.85}
                  onPress={() => {
                    setValidationModalVisible(false);
                    submitSOS(true);
                  }}
                >
                  <MaterialCommunityIcons name="alarm-light" size={16} color="#FFFFFF" />
                  <Text style={styles.valActionEmergencyText}>Báo ngập nguy kịch ngay</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.valDismissBtn}
                  activeOpacity={0.7}
                  onPress={() => setValidationModalVisible(false)}
                >
                  <Text style={styles.valDismissText}>Đóng lại</Text>
                </TouchableOpacity>
              </View>
            ) : validationType === 'people' ? (
              <View style={styles.valActionsCol}>
                <TouchableOpacity
                  style={styles.valActionPrimary}
                  activeOpacity={0.85}
                  onPress={() => setValidationModalVisible(false)}
                >
                  <Text style={styles.valActionPrimaryText}>Đã hiểu, tôi sẽ nhập ngay</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.valActionsCol}>
                <TouchableOpacity
                  style={styles.valActionPrimary}
                  activeOpacity={0.85}
                  onPress={() => {
                    setValidationModalVisible(false);
                    fetchLocation();
                  }}
                >
                  <Feather name="refresh-cw" size={16} color="#FFFFFF" />
                  <Text style={styles.valActionPrimaryText}>Lấy lại tọa độ GPS</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 36 : 14,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    padding: 8,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0284C7',
    letterSpacing: 0.5,
  },
  headerSubTitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  reloadGpsBtn: {
    padding: 8,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  quickSosBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  quickSosLeft: {
    marginRight: 12,
  },
  quickSosPulse: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickSosBody: {
    flex: 1,
  },
  quickSosTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  quickSosDesc: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    marginTop: 3,
    lineHeight: 15,
  },
  gpsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  gpsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  gpsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gpsSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 6,
  },
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  gpsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  gpsBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  gpsAddressText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    lineHeight: 20,
  },
  gpsCoordsText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginLeft: 6,
  },
  cardSubText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    marginBottom: 10,
    lineHeight: 17,
  },

  // STYLES CHO MỤC 1: SỐ NGƯỜI
  peopleInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  counterActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  peopleDirectInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#0284C7',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 6,
    marginHorizontal: 14,
    minWidth: 140,
  },
  peopleDirectInput: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0284C7',
    textAlign: 'center',
    minWidth: 60,
  },
  peopleDirectUnit: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0284C7',
    marginLeft: 4,
  },

  // STYLES MÔ TẢ
  descInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
    minHeight: 85,
    textAlignVertical: 'top',
    lineHeight: 20,
  },

  // STYLES ẢNH
  photoActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    paddingVertical: 10,
    marginHorizontal: 4,
  },
  photoBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
    marginLeft: 6,
  },
  imagePreviewWrap: {
    position: 'relative',
    marginBottom: 10,
    alignSelf: 'center',
  },
  previewImage: {
    width: 220,
    height: 140,
    borderRadius: 10,
  },
  removeImgBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
  },

  mainSendBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  sendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mainSendBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginLeft: 8,
  },

  // SUCCESS STYLES
  successContainer: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  successCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  successIconOuter: {
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  successSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 17,
  },
  successDetailsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    width: '100%',
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  successDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  successDetailLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  successDetailCode: {
    fontSize: 14,
    fontWeight: '800',
    color: '#DC2626',
  },
  successDetailValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
    maxWidth: '65%',
    textAlign: 'right',
  },
  emergencyCallGroup: {
    width: '100%',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  emergencyCallGroupTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 8,
  },
  callRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  callActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    marginHorizontal: 3,
  },
  callActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  doneBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingVertical: 13,
    width: '100%',
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  // STYLES CHO POPUP VALIDATION FORM SANG TRỌNG
  valModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  valModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 18,
    width: '100%',
    maxWidth: 370,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  valBadgeWrap: {
    width: 66,
    height: 66,
    borderRadius: 33,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 3,
  },
  valTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  valDesc: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  valEmergencyCallout: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    width: '100%',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    marginBottom: 16,
  },
  valEmergencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  valEmergencyTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
    marginLeft: 4,
  },
  valEmergencyText: {
    fontSize: 11,
    color: '#991B1B',
    lineHeight: 16,
  },
  valActionsCol: {
    width: '100%',
  },
  valActionPrimary: {
    backgroundColor: '#0284C7',
    borderRadius: 12,
    paddingVertical: 13,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  valActionPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 6,
  },
  valActionEmergency: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 12,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 2,
  },
  valActionEmergencyText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 6,
  },
  valDismissBtn: {
    paddingVertical: 7,
    alignItems: 'center',
  },
  valDismissText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
});

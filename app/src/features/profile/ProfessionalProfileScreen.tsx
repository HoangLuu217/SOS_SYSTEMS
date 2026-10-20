import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { backendApi } from '@/api';
import type { RescuerVerificationStatus, RescuerVehicleType } from '@/types';

export const RESCUE_SKILLS = [
  {
    id: 'first_aid',
    label: 'Sơ cứu y tế',
    icon: 'medical-bag',
    desc: 'Băng bó vết thương, hồi sức tim phổi CPR',
  },
  {
    id: 'water_rescue',
    label: 'Cứu hộ vùng nước',
    icon: 'lifebuoy',
    desc: 'Bơi cứu sinh, cứu hộ ngập lụt, nước lũ xiết',
  },
  {
    id: 'search_rescue',
    label: 'Tìm kiếm cứu nạn',
    icon: 'account-search',
    desc: 'Định vị người mất tích, rà soát khu vực cô lập',
  },
  {
    id: 'boat_driver',
    label: 'Lái xuồng cứu sinh',
    icon: 'ferry',
    desc: 'Điều khiển ca-nô, thuyền máy, xuồng hơi vượt lũ',
  },
  {
    id: 'rope_climb',
    label: 'Leo dây & Độ cao',
    icon: 'hiking',
    desc: 'Tiếp cận sườn dốc, sạt lở núi, nhà cao tầng',
  },
  {
    id: 'diving',
    label: 'Lặn cứu hộ',
    icon: 'swim',
    desc: 'Lặn tìm kiếm người & tài sản dưới vùng nước sâu',
  },
  {
    id: 'logistics',
    label: 'Hậu cần & Cấp dưỡng',
    icon: 'truck-delivery',
    desc: 'Vận chuyển lương thực, nước sạch & thuốc men',
  },
];

export const VEHICLE_OPTIONS: Array<{
  id: RescuerVehicleType;
  label: string;
  icon: string;
  desc: string;
}> = [
    {
      id: 'BOAT',
      label: 'Xuồng / Thuyền cứu sinh',
      icon: 'ferry',
      desc: 'Ca-nô, thuyền gắn máy, xuồng hơi cứu trợ lũ lụt',
    },
    {
      id: 'MOTORBIKE',
      label: 'Xe máy cơ động',
      icon: 'motorbike',
      desc: 'Cơ động nhanh qua các ngõ hẻm và địa hình hẹp',
    },
    {
      id: 'TRUCK',
      label: 'Xe tải cứu trợ',
      icon: 'truck',
      desc: 'Chở nhu yếu phẩm số lượng lớn & phao cứu sinh',
    },
    {
      id: 'AMBULANCE',
      label: 'Xe cứu thương',
      icon: 'ambulance',
      desc: 'Chuyên dụng sơ cấp cứu & đưa nạn nhân đi viện',
    },
    {
      id: 'OTHER',
      label: 'Phương tiện khác',
      icon: 'car',
      desc: 'Xe bán tải, ô tô 4-7 chỗ gầm cao chống ngập',
    },
  ];

// Danh sách các địa bàn (Phường/Xã) dự phòng nếu thiết bị ngoại tuyến
const FALLBACK_AREAS = [
  { _id: 'danang_hc_bac', name: 'Phường Hòa Cường Bắc', parentName: 'Quận Hải Châu, TP. Đà Nẵng' },
  { _id: 'danang_hc_nam', name: 'Phường Hòa Cường Nam', parentName: 'Quận Hải Châu, TP. Đà Nẵng' },
  { _id: 'danang_khue_trung', name: 'Phường Khuê Trung', parentName: 'Quận Cẩm Lệ, TP. Đà Nẵng' },
  { _id: 'danang_thach_thang', name: 'Phường Thạch Thang', parentName: 'Quận Hải Châu, TP. Đà Nẵng' },
  { _id: 'danang_an_hai_bac', name: 'Phường An Hải Bắc', parentName: 'Quận Sơn Trà, TP. Đà Nẵng' },
  { _id: 'danang_hoa_khanh_bac', name: 'Phường Hòa Khánh Bắc', parentName: 'Quận Liên Chiểu, TP. Đà Nẵng' },
  { _id: 'danang_my_an', name: 'Phường Mỹ An', parentName: 'Quận Ngũ Hành Sơn, TP. Đà Nẵng' },
  { _id: 'danang_hoa_phong', name: 'Xã Hòa Phong', parentName: 'Huyện Hòa Vang, TP. Đà Nẵng' },
];

interface ProfessionalProfileScreenProps {
  onBack: () => void;
}

export const ProfessionalProfileScreen: React.FC<ProfessionalProfileScreenProps> = ({ onBack }) => {
  const { user } = useAuth();

  // Form states
  const [idNumber, setIdNumber] = useState<string>('');
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [selectedAreaName, setSelectedAreaName] = useState<string>('');
  const [areasList, setAreasList] = useState<any[]>(FALLBACK_AREAS);
  const [showAreaModal, setShowAreaModal] = useState<boolean>(false);
  const [areaSearchQuery, setAreaSearchQuery] = useState<string>('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>(['first_aid', 'water_rescue']);
  const [experience, setExperience] = useState<string>('');
  const [selectedVehicleType, setSelectedVehicleType] = useState<RescuerVehicleType>('BOAT');
  const [agreeTerms, setAgreeTerms] = useState<boolean>(false);

  // Verification status from database
  const [verificationStatus, setVerificationStatus] =
    useState<RescuerVerificationStatus>('NOT_REGISTERED');

  // UI state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [showVehicleModal, setShowVehicleModal] = useState<boolean>(false);

  // 1. Tải hồ sơ thực tế từ Backend khi vào màn hình
  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      try {
        setIsLoading(true);
        const res = await backendApi.getRescuerProfile();
        if (res.success && res.data && isMounted) {
          const rescuer: any = res.data.rescuer || {};
          if (rescuer.idNumber) setIdNumber(rescuer.idNumber);
          if (Array.isArray(rescuer.skills) && rescuer.skills.length > 0) {
            setSelectedSkills(rescuer.skills);
          }
          if (rescuer.experience) setExperience(rescuer.experience);
          if (rescuer.vehicleType) {
            setSelectedVehicleType(rescuer.vehicleType as RescuerVehicleType);
          }
          const anyUser = user as any;
          if (rescuer.areaId) {
            setSelectedAreaId(typeof rescuer.areaId === 'object' ? rescuer.areaId._id : rescuer.areaId);
          } else if (anyUser?.citizen?.areaId || anyUser?.areaId) {
            setSelectedAreaId(anyUser?.citizen?.areaId || anyUser?.areaId);
          }
          if (rescuer.areaName) {
            setSelectedAreaName(rescuer.areaName);
          } else if (anyUser?.citizen?.areaName) {
            setSelectedAreaName(anyUser.citizen.areaName);
          }
          setVerificationStatus(rescuer.verificationStatus || 'NOT_REGISTERED');
          if (rescuer.verificationStatus === 'VERIFIED') {
            setAgreeTerms(true);
          }
        }

        // Tải danh sách địa bàn hành chính từ Backend
        try {
          const areasRes = await backendApi.getAdministrativeAreas();
          if (areasRes.success && Array.isArray(areasRes.data) && areasRes.data.length > 0 && isMounted) {
            const formatted = areasRes.data.map((a: any) => ({
              _id: a._id,
              name: a.name,
              parentName: a.parentId?.name ? `${a.parentId.name}` : undefined,
            }));
            setAreasList(formatted);
          }
        } catch {
          // giữ FALLBACK_AREAS
        }
      } catch (error) {
        console.warn('Lỗi tải hồ sơ cứu hộ:', error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  // Chọn / bỏ chọn kỹ năng
  const handleToggleSkill = (skillId: string) => {
    if (isVerified) return;
    setSelectedSkills((prev) =>
      prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]
    );
  };

  // Chọn phương tiện
  const handleSelectVehicle = (vehicleId: RescuerVehicleType) => {
    if (isVerified) return;
    setSelectedVehicleType(vehicleId);
  };


  // 2. Gửi hồ sơ lưu / nộp đơn đăng ký lên Backend
  const handleSave = async () => {
    if (!idNumber.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập Số Căn cước công dân (CCCD) để định danh.');
      return;
    }
    if (idNumber.trim().length !== 12) {
      Alert.alert('CCCD chưa hợp lệ', 'Số Căn cước công dân (CCCD) phải bao gồm đúng 12 chữ số.');
      return;
    }
    if (!selectedAreaName && !selectedAreaId) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn Địa bàn / Phường, Xã bạn sẵn sàng tác chiến để Ban Chỉ huy địa phương phê duyệt.');
      return;
    }
    if (selectedSkills.length === 0) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn ít nhất 1 kỹ năng cứu hộ chuyên môn.');
      return;
    }
    if (!experience.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tóm tắt kinh nghiệm hoặc chứng chỉ cứu nạn.');
      return;
    }
    if (!agreeTerms) {
      Alert.alert('Xác nhận cam kết', 'Vui lòng tick xác nhận cam kết tình nguyện cứu hộ trước khi gửi hồ sơ.');
      return;
    }

    try {
      setIsSaving(true);
      const res = await backendApi.updateRescuerProfile({
        idNumber: idNumber.trim(),
        skills: selectedSkills,
        experience: experience.trim(),
        vehicleType: selectedVehicleType,
        areaId: selectedAreaId || undefined,
        areaName: selectedAreaName || undefined,
      });

      if (res.success) {
        setVerificationStatus('PENDING');
        try {
          await AsyncStorage.setItem('@sos_just_applied_rescuer', 'true');
        } catch {
          // ignore storage error
        }
        setShowSuccessModal(true);
      } else {
        Alert.alert('Không thể lưu', res.message || 'Lỗi khi cập nhật hồ sơ.');
      }
    } catch (e: any) {
      Alert.alert('Lỗi kết nối', e?.message || 'Không thể kết nối đến máy chủ.');
    } finally {
      setIsSaving(false);
    }
  };

  const isVerified = verificationStatus === 'VERIFIED';
  const selectedVehicleObj =
    VEHICLE_OPTIONS.find((v) => v.id === selectedVehicleType) || VEHICLE_OPTIONS[0];

  // Cấu hình thanh thông báo trạng thái tinh gọn (chỉ hiển thị khi có trạng thái đặc biệt)
  const getStatusAlertConfig = () => {
    switch (verificationStatus) {
      case 'VERIFIED':
        return {
          title: 'Hồ sơ đã được phê duyệt',
          desc: 'Chứng chỉ và năng lực chuyên môn của bạn đã được chính quyền địa phương phê duyệt cấp phép tác chiến.',
          bgColor: '#ECFDF5',
          borderColor: '#A7F3D0',
          textColor: '#065F46',
          icon: 'check-circle-outline',
          iconColor: '#059669',
        };
      case 'PENDING':
        return {
          title: 'Hồ sơ đang chờ thẩm định',
          desc: 'Cán bộ địa phương đang xét duyệt hồ sơ của bạn. Bạn vẫn có thể cập nhật thông tin nếu cần.',
          bgColor: '#FFFBEB',
          borderColor: '#FDE68A',
          textColor: '#92400E',
          icon: 'clock-outline',
          iconColor: '#D97706',
        };
      case 'REJECTED':
        return {
          title: 'Hồ sơ cần bổ sung thông tin',
          desc: 'Hồ sơ chưa đạt yêu cầu. Vui lòng rà soát lại thông tin CCCD hoặc kinh nghiệm và nộp lại.',
          bgColor: '#FEF2F2',
          borderColor: '#FECACA',
          textColor: '#991B1B',
          icon: 'alert-circle-outline',
          iconColor: '#DC2626',
        };
      case 'NOT_REGISTERED':
      default:
        return null;
    }
  };

  const statusAlert = getStatusAlertConfig();

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
            <Feather name="arrow-left" size={20} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Hồ sơ chuyên môn Cứu hộ</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066FF" />
          <Text style={styles.loadingText}>Đang tải hồ sơ cứu hộ chuyên môn...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* 1. Header Navigation Bar (Tối giản, gọn gàng) */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Đăng ký Cứu hộ viên</Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 2. Thanh trạng thái tinh gọn (chỉ hiển thị khi có thông tin cần lưu ý) */}
        {statusAlert && (
          <View
            style={[
              styles.compactStatusAlert,
              { backgroundColor: statusAlert.bgColor, borderColor: statusAlert.borderColor },
            ]}
          >
            <MaterialCommunityIcons
              name={statusAlert.icon as any}
              size={20}
              color={statusAlert.iconColor}
              style={{ marginTop: 1 }}
            />
            <View style={styles.compactAlertTextWrap}>
              <Text style={[styles.compactAlertTitle, { color: statusAlert.textColor }]}>
                {statusAlert.title}
              </Text>
              <Text style={styles.compactAlertDesc}>{statusAlert.desc}</Text>
            </View>
          </View>
        )}

        {/* 3. Thẻ thông tin công dân đăng ký (Applicant Profile Preview) */}
        <View style={styles.applicantCard}>
          <View style={styles.applicantAvatarBox}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.applicantAvatar} />
            ) : (
              <View style={styles.applicantAvatarPlaceholder}>
                <Text style={styles.applicantAvatarText}>
                  {(user?.fullName || 'CD').slice(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.applicantInfo}>
            <View style={styles.applicantNameRow}>
              <Text style={styles.applicantName}>{user?.fullName || 'Người dân'}</Text>
              <View style={styles.applicantBadge}>
                <Text style={styles.applicantBadgeText}>Tài khoản liên kết</Text>
              </View>
            </View>
            <Text style={styles.applicantContact}>
              {user?.phone || 'Chưa có SĐT'} {user?.email ? `• ${user.email}` : ''}
            </Text>
          </View>
        </View>

        {/* 4. Mục 1: Định danh Căn cước công dân (CCCD) */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardHeaderIcon, { backgroundColor: '#EFF6FF' }]}>
              <MaterialCommunityIcons name="card-account-details-outline" size={20} color="#0066FF" />
            </View>
            <View style={styles.cardHeaderTitleCol}>
              <Text style={styles.cardTitle}>Số Căn cước công dân (CCCD)</Text>
            </View>
            {isVerified && (
              <View style={styles.verifiedLockPill}>
                <Feather name="lock" size={11} color="#059669" />
                <Text style={styles.verifiedLockText}>Đã khóa</Text>
              </View>
            )}
          </View>

          {isVerified ? (
            <View style={styles.maskedNumberBox}>
              <Text style={styles.maskedNumberText}>
                {idNumber ? `${idNumber.slice(0, 4)}********${idNumber.slice(-2)}` : '0792********01'}
              </Text>
              <View style={styles.verifiedTag}>
                <Feather name="check-circle" size={13} color="#059669" />
                <Text style={styles.verifiedTagText}>Đã xác minh chính chủ</Text>
              </View>
            </View>
          ) : (
            <View>
              <View
                style={[
                  styles.inputBox,
                  idNumber.length === 12 && styles.inputBoxValid,
                ]}
              >
                <Feather name="hash" size={18} color="#64748B" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.textInput}
                  value={idNumber}
                  onChangeText={(val) => setIdNumber(val.replace(/\D/g, ''))}
                  placeholder="Nhập số CCCD"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  maxLength={12}
                />
                <Text
                  style={[
                    styles.charCounter,
                    idNumber.length === 12 && styles.charCounterComplete,
                  ]}
                >
                  {idNumber.length}/12
                </Text>
              </View>
            </View>
          )}

          <Text style={styles.cardFooterNote}>
            {isVerified
              ? 'Số CCCD đã được cơ quan chức năng địa phương xác thực. Nếu cần thay đổi vui lòng liên hệ Ban Quản trị.'
              : 'Yêu cầu nhập chính xác 12 chữ số trên thẻ CCCD gắn chip để cơ quan đối chiếu khi cấp quyền cứu hộ.'}
          </Text>
        </View>

        {/* 2. Mục 2: Địa bàn đăng ký tác chiến (Phường/Xã trực thuộc) */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardHeaderIcon, { backgroundColor: '#F0F9FF' }]}>
              <MaterialCommunityIcons name="map-marker-radius-outline" size={20} color="#0284C7" />
            </View>
            <View style={styles.cardHeaderTitleCol}>
              <Text style={styles.cardTitle}>Địa bàn đăng ký tác chiến</Text>

            </View>
          </View>

          {/* Ô hiển thị địa bàn đã chọn - Bấm vào để mở Popup */}
          <TouchableOpacity
            style={[
              styles.areaTriggerCard,
              !selectedAreaName && styles.areaTriggerCardEmpty,
              isVerified && { opacity: 0.85 },
            ]}
            onPress={() => !isVerified && setShowAreaModal(true)}
            activeOpacity={0.75}
            disabled={isVerified}
          >
            <View
              style={[
                styles.areaTriggerIconBox,
                !selectedAreaName && { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
              ]}
            >
              <MaterialCommunityIcons
                name="map-marker"
                size={22}
                color={selectedAreaName ? '#0066FF' : '#D97706'}
              />
            </View>
            <View style={styles.areaTriggerInfo}>
              <Text
                style={[
                  styles.areaTriggerLabel,
                  !selectedAreaName && { color: '#B45309' },
                ]}
              >
                {selectedAreaName || 'Chưa chọn Phường / Xã trực thuộc'}
              </Text>
              <Text style={styles.areaTriggerDesc} numberOfLines={1}>
                {selectedAreaName
                  ? 'Địa bàn tiếp nhận thẩm định và phân bổ cứu nạn'
                  : 'Vui lòng chạm để chọn Phường/Xã bạn sẵn sàng hỗ trợ'}
              </Text>
            </View>
            {!isVerified && (
              <View
                style={[
                  styles.changeActionBtn,
                  !selectedAreaName && { borderColor: '#F59E0B' },
                ]}
              >
                <Text
                  style={[
                    styles.changeActionText,
                    !selectedAreaName && { color: '#D97706' },
                  ]}
                >
                  {selectedAreaName ? 'Đổi' : 'Chọn'}
                </Text>
                <Feather
                  name="chevron-down"
                  size={15}
                  color={selectedAreaName ? '#0066FF' : '#D97706'}
                />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* 3. Mục 3: Kỹ năng chuyên môn cứu nạn (Rescue Skills) */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardHeaderIcon, { backgroundColor: '#F0FDF4' }]}>
              <MaterialCommunityIcons name="shield-star-outline" size={20} color="#10B981" />
            </View>
            <View style={styles.cardHeaderTitleCol}>
              <Text style={styles.cardTitle}>Kỹ năng cứu hộ chuyên môn</Text>
              <Text style={styles.cardSubtitle}>
                Chọn các kỹ năng bạn có đủ điều kiện và tự tin tham gia tác chiến
              </Text>
            </View>
            <View style={styles.skillsCountBadge}>
              <Text style={styles.skillsCountText}>{selectedSkills.length} đã chọn</Text>
            </View>
          </View>

          <View style={styles.skillsList}>
            {RESCUE_SKILLS.map((skill) => {
              const isSelected = selectedSkills.includes(skill.id);
              return (
                <TouchableOpacity
                  key={skill.id}
                  style={[
                    styles.skillItem,
                    isSelected && styles.skillItemActive,
                    isVerified && { opacity: 0.8 },
                  ]}
                  onPress={() => handleToggleSkill(skill.id)}
                  activeOpacity={0.75}
                  disabled={isVerified}
                >
                  <View
                    style={[
                      styles.skillIconCircle,
                      isSelected && styles.skillIconCircleActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={skill.icon as any}
                      size={19}
                      color={isSelected ? '#0066FF' : '#64748B'}
                    />
                  </View>
                  <View style={styles.skillInfo}>
                    <Text style={[styles.skillLabel, isSelected && styles.skillLabelActive]}>
                      {skill.label}
                    </Text>
                    <Text style={styles.skillDesc} numberOfLines={2}>
                      {skill.desc}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.checkboxCircle,
                      isSelected && styles.checkboxCircleActive,
                    ]}
                  >
                    {isSelected && <Feather name="check" size={11} color="#FFFFFF" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 6. Mục 3: Phương tiện cơ động sẵn sàng huy động (Vehicle) */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardHeaderIcon, { backgroundColor: '#FFFBEB' }]}>
              <MaterialCommunityIcons name="truck-fast-outline" size={20} color="#D97706" />
            </View>
            <View style={styles.cardHeaderTitleCol}>
              <Text style={styles.cardTitle}>Phương tiện cơ động sẵn sàng</Text>
              <Text style={styles.cardSubtitle}>
                Phương tiện cá nhân bạn có thể tự vận hành khi nhận lệnh huy động
              </Text>
            </View>
          </View>

          {/* Ô hiển thị 1 phương tiện đã chọn - Bấm vào để mở Popup */}
          <TouchableOpacity
            style={[styles.vehicleTriggerCard, isVerified && { opacity: 0.85 }]}
            onPress={() => !isVerified && setShowVehicleModal(true)}
            activeOpacity={0.75}
            disabled={isVerified}
          >
            <View style={styles.vehicleTriggerIconBox}>
              <MaterialCommunityIcons
                name={selectedVehicleObj.icon as any}
                size={22}
                color="#0066FF"
              />
            </View>
            <View style={styles.vehicleTriggerInfo}>
              <Text style={styles.vehicleTriggerLabel}>{selectedVehicleObj.label}</Text>
              <Text style={styles.vehicleTriggerDesc} numberOfLines={1}>
                {selectedVehicleObj.desc}
              </Text>
            </View>
            {!isVerified && (
              <View style={styles.changeActionBtn}>
                <Text style={styles.changeActionText}>Đổi</Text>
                <Feather name="chevron-down" size={15} color="#0066FF" />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* 7. Mục 4: Kinh nghiệm tác chiến & Chứng chỉ cứu nạn */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardHeaderIcon, { backgroundColor: '#F5F3FF' }]}>
              <MaterialCommunityIcons name="certificate-outline" size={20} color="#7C3AED" />
            </View>
            <View style={styles.cardHeaderTitleCol}>
              <Text style={styles.cardTitle}>Kinh nghiệm tác chiến & Chứng chỉ</Text>
              <Text style={styles.cardSubtitle}>
                Mô tả quá trình cứu trợ, số năm kinh nghiệm hoặc chứng nhận chuyên môn
              </Text>
            </View>
          </View>

          <View style={styles.textAreaBox}>
            <TextInput
              style={styles.textArea}
              value={experience}
              onChangeText={setExperience}
              multiline
              numberOfLines={4}
              placeholder="Nhập tóm tắt quá trình kinh nghiệm, đơn vị thiện nguyện từng tham gia, hoặc các chứng nhận cứu nạn, cứu đuối đã có..."
              placeholderTextColor="#94A3B8"
              textAlignVertical="top"
              editable={!isVerified}
            />
          </View>


        </View>

        {/* 8. Mục 5: Cam kết lực lượng tình nguyện (Pledge & Agreement) */}
        <View style={styles.pledgeCard}>
          <TouchableOpacity
            style={styles.pledgeRow}
            onPress={() => !isVerified && setAgreeTerms(!agreeTerms)}
            activeOpacity={0.8}
            disabled={isVerified}
          >
            <View style={[styles.pledgeCheckbox, agreeTerms && styles.pledgeCheckboxActive]}>
              {agreeTerms && <Feather name="check" size={13} color="#FFFFFF" />}
            </View>
            <Text style={styles.pledgeText}>
              Tôi cam kết các thông tin khai báo trên là trung thực và tự nguyện tham gia mạng lưới
              cứu hộ, sẵn sàng chấp hành phân công điều phối của Ban Chỉ huy Phòng chống thiên tai địa
              phương khi có sự cố khẩn cấp.
            </Text>
          </TouchableOpacity>
        </View>

        {/* 9. Nút Lưu / Nộp đơn đăng ký (Bottom Action Button) */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={[
              styles.submitButton,
              isSaving && { opacity: 0.75 },
              !isVerified && !agreeTerms && styles.submitButtonDisabled,
              isVerified && styles.submitButtonVerified,
            ]}
            onPress={handleSave}
            disabled={isSaving || isVerified || !agreeTerms}
            activeOpacity={0.85}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : isVerified ? (
              <>
                <Feather name="check-circle" size={18} color="#FFFFFF" />
                <Text style={styles.submitButtonText}>Hồ sơ đã được phê duyệt</Text>
              </>
            ) : (
              <>
                <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
                <Text style={styles.submitButtonText}>
                  {verificationStatus === 'NOT_REGISTERED'
                    ? 'Nộp đơn đăng ký Cứu hộ viên'
                    : 'Cập nhật lại hồ sơ chuyên môn'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* MODAL: Success Feedback Dialog */}
      {/* Modal Popup chọn Địa bàn tác chiến (Phường/Xã) */}
      <Modal
        visible={showAreaModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAreaModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAreaModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.areaPickerCard}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header Popup */}
            <View style={styles.pickerHeader}>
              <View style={styles.pickerHeaderTitleRow}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: '#F0F9FF', width: 34, height: 34 }]}>
                  <MaterialCommunityIcons name="map-marker" size={19} color="#0284C7" />
                </View>
                <Text style={styles.pickerTitle}>Chọn Phường / Xã trực thuộc</Text>
              </View>
              <TouchableOpacity
                style={styles.pickerCloseBtn}
                onPress={() => setShowAreaModal(false)}
                activeOpacity={0.7}
              >
                <Feather name="x" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.pickerSubtitle}>
              Chọn địa bàn bạn sẵn sàng tham gia tình nguyện cứu hộ khi có lệnh điều phối:
            </Text>

            {/* Ô tìm kiếm nhanh Phường/Xã */}
            <View style={styles.areaSearchBox}>
              <Feather name="search" size={16} color="#94A3B8" />
              <TextInput
                style={styles.areaSearchInput}
                placeholder="Tìm tên Phường, Xã, Quận..."
                placeholderTextColor="#94A3B8"
                value={areaSearchQuery}
                onChangeText={setAreaSearchQuery}
                autoCorrect={false}
              />
              {areaSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setAreaSearchQuery('')}>
                  <Feather name="x-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Danh sách các địa bàn */}
            <ScrollView
              style={{ maxHeight: 320 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {areasList
                .filter((item) => {
                  if (!areaSearchQuery.trim()) return true;
                  const q = areaSearchQuery.toLowerCase();
                  return (
                    item.name?.toLowerCase().includes(q) ||
                    item.parentName?.toLowerCase().includes(q)
                  );
                })
                .map((item) => {
                  const isSelected =
                    selectedAreaId === item._id || selectedAreaName === item.name;
                  return (
                    <TouchableOpacity
                      key={item._id}
                      style={[
                        styles.areaPickerItem,
                        isSelected && styles.areaPickerItemActive,
                      ]}
                      onPress={() => {
                        setSelectedAreaId(item._id);
                        setSelectedAreaName(item.name);
                        setShowAreaModal(false);
                      }}
                      activeOpacity={0.75}
                    >
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text
                          style={[
                            styles.areaItemTitle,
                            isSelected && { color: '#0066FF' },
                          ]}
                        >
                          {item.name}
                        </Text>
                        {item.parentName && (
                          <Text style={styles.areaItemParent}>{item.parentName}</Text>
                        )}
                      </View>
                      <View
                        style={[
                          styles.radioCircle,
                          isSelected && styles.radioCircleActive,
                        ]}
                      >
                        {isSelected && <View style={styles.radioInnerDot} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Modal Popup chọn Phương tiện cơ động */}
      <Modal
        visible={showVehicleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVehicleModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowVehicleModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.vehiclePickerCard}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header Popup */}
            <View style={styles.pickerHeader}>
              <View style={styles.pickerHeaderTitleRow}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: '#EFF6FF', width: 34, height: 34 }]}>
                  <MaterialCommunityIcons name="truck-fast-outline" size={19} color="#0066FF" />
                </View>
                <Text style={styles.pickerTitle}>Chọn phương tiện cơ động</Text>
              </View>
              <TouchableOpacity
                style={styles.pickerCloseBtn}
                onPress={() => setShowVehicleModal(false)}
                activeOpacity={0.7}
              >
                <Feather name="x" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.pickerSubtitle}>
              Chọn phương tiện bạn có thể tự vận hành khi nhận lệnh huy động:
            </Text>

            {/* Danh sách các phương tiện để chọn */}
            <View style={styles.vehiclePickerList}>
              {VEHICLE_OPTIONS.map((item) => {
                const isSelected = selectedVehicleType === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.vehiclePickerItem,
                      isSelected && styles.vehiclePickerItemActive,
                    ]}
                    onPress={() => {
                      handleSelectVehicle(item.id);
                      setShowVehicleModal(false);
                    }}
                    activeOpacity={0.75}
                  >
                    <View
                      style={[
                        styles.vehicleIconBox,
                        isSelected && styles.vehicleIconBoxActive,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={item.icon as any}
                        size={22}
                        color={isSelected ? '#0066FF' : '#64748B'}
                      />
                    </View>
                    <View style={styles.vehicleInfo}>
                      <Text
                        style={[
                          styles.vehicleLabel,
                          isSelected && styles.vehicleLabelActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                      <Text style={styles.vehicleDesc}>{item.desc}</Text>
                    </View>
                    <View
                      style={[
                        styles.radioCircle,
                        isSelected && styles.radioCircleActive,
                      ]}
                    >
                      {isSelected && <View style={styles.radioInnerDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Modal thông báo lưu thành công */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.feedbackCard}>
            <View style={styles.feedbackIconBox}>
              <MaterialCommunityIcons name="check-decagram" size={32} color="#059669" />
            </View>
            <Text style={styles.feedbackTitle}>Gửi hồ sơ thành công!</Text>
            <Text style={styles.feedbackDesc}>
              Thông tin số CCCD, kỹ năng chuyên môn và phương tiện cơ động đã được gửi đến Ban Chỉ
              huy địa phương để đối soát và thẩm định.
            </Text>

            {/* Submitted Summary Box */}
            <View style={styles.feedbackSummaryBox}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>CCCD định danh:</Text>
                <Text style={styles.summaryValue}>
                  {idNumber.slice(0, 4)}****{idNumber.slice(-4)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Địa bàn tiếp nhận:</Text>
                <Text style={[styles.summaryValue, { color: '#0066FF' }]}>
                  {selectedAreaName || 'Theo hồ sơ cư trú'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Kỹ năng tác chiến:</Text>
                <Text style={styles.summaryValue}>{selectedSkills.length} kỹ năng</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Phương tiện:</Text>
                <Text style={styles.summaryValue}>{selectedVehicleObj.label}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.feedbackBtn}
              onPress={() => {
                setShowSuccessModal(false);
                onBack();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.feedbackBtnText}>Xác nhận & Quay lại</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerRightPlaceholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: '#F1F5F9',
  },

  // 2. Compact Status Alert
  compactStatusAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
    gap: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  compactAlertTextWrap: {
    flex: 1,
  },
  compactAlertTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  compactAlertDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },

  // 2. Applicant Card
  applicantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  applicantAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  applicantAvatar: {
    width: 44,
    height: 44,
  },
  applicantAvatarPlaceholder: {
    width: 44,
    height: 44,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applicantAvatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0066FF',
  },
  applicantInfo: {
    flex: 1,
  },
  applicantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  applicantName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  applicantBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  applicantBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  applicantContact: {
    fontSize: 12,
    color: '#64748B',
  },

  // 3. Form Cards General
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  cardHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderTitleCol: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  verifiedLockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  verifiedLockText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  skillsCountBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  skillsCountText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0066FF',
  },

  // CCCD Input
  maskedNumberBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  maskedNumberText: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 1.5,
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  verifiedTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  inputBoxValid: {
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    paddingVertical: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  charCounter: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  charCounterComplete: {
    color: '#059669',
    fontWeight: '700',
  },
  cardFooterNote: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 10,
    lineHeight: 17,
  },

  // Skills List (1 Column)
  skillsList: {
    gap: 9,
  },
  skillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  skillItemActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  skillIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginRight: 10,
  },
  skillIconCircleActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#BFDBFE',
  },
  skillInfo: {
    flex: 1,
  },
  skillLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  skillLabelActive: {
    fontWeight: '700',
    color: '#0066FF',
  },
  skillDesc: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
  },
  checkboxCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginLeft: 8,
  },
  checkboxCircleActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },

  // Selected Area Trigger Card
  areaTriggerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  areaTriggerCardEmpty: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFDF5',
  },
  areaTriggerIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginRight: 12,
  },
  areaTriggerInfo: {
    flex: 1,
  },
  areaTriggerLabel: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  areaTriggerDesc: {
    fontSize: 12,
    color: '#475569',
  },

  // Area Picker Modal
  areaPickerCard: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: 380,
    borderRadius: 22,
    padding: 20,
    maxHeight: '80%',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  areaSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  areaSearchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    paddingVertical: 0,
  },
  areaPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
  },
  areaPickerItemActive: {
    borderColor: '#0066FF',
    backgroundColor: '#EFF6FF',
  },
  areaItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  areaItemParent: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },

  // Selected Vehicle Trigger Card
  vehicleTriggerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  vehicleTriggerIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginRight: 12,
  },
  vehicleTriggerInfo: {
    flex: 1,
  },
  vehicleTriggerLabel: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  vehicleTriggerDesc: {
    fontSize: 12,
    color: '#475569',
  },
  changeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginLeft: 8,
  },
  changeActionText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0066FF',
  },

  // Vehicle Picker Modal
  vehiclePickerCard: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: 380,
    borderRadius: 22,
    padding: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  pickerHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickerTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  pickerSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 14,
  },
  pickerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehiclePickerList: {
    gap: 8,
  },
  vehiclePickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  vehiclePickerItemActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
  },
  vehicleIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginRight: 10,
  },
  vehicleIconBoxActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#BFDBFE',
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  vehicleLabelActive: {
    color: '#0066FF',
    fontWeight: '700',
  },
  vehicleDesc: {
    fontSize: 11.5,
    color: '#64748B',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  radioCircleActive: {
    borderColor: '#0066FF',
  },
  radioInnerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0066FF',
  },

  // Experience & Suggestions
  textAreaBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 12,
  },
  textArea: {
    fontSize: 13.5,
    color: '#0F172A',
    minHeight: 88,
    lineHeight: 20,
  },


  // Pledge Card
  pledgeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  pledgeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  pledgeCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  pledgeCheckboxActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  pledgeText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#475569',
  },

  // Submit Button
  actionContainer: {
    marginBottom: 20,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0066FF',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 50,
  },
  submitButtonDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
    opacity: 0.55,
  },
  submitButtonVerified: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '700',
  },

  // Success Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  feedbackCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    maxWidth: 360,
  },
  feedbackIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  feedbackTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  feedbackDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
  },
  feedbackSummaryBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12.5,
    color: '#64748B',
  },
  summaryValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  feedbackBtn: {
    backgroundColor: '#0066FF',
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  feedbackBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
});

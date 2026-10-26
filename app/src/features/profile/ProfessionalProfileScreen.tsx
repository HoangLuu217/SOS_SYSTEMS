import React, { useState, useEffect, useMemo } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import {
  backendApi,
  provinceApi,
  Province,
  Ward,
  FALLBACK_PROVINCES,
  FALLBACK_WARDS,
} from '@/api';
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
    desc: 'Bơi cứu sinh, cứu hộ ngập lụt, nước xiết',
  },
  {
    id: 'search_rescue',
    label: 'Tìm kiếm cứu nạn',
    icon: 'account-search',
    desc: 'Định vị người mất tích, rà soát cô lập',
  },
  {
    id: 'boat_driver',
    label: 'Lái xuồng cứu sinh',
    icon: 'ferry',
    desc: 'Điều khiển ca-nô, thuyền máy, xuồng hơi',
  },
  {
    id: 'rope_climb',
    label: 'Leo dây & Độ cao',
    icon: 'hiking',
    desc: 'Tiếp cận sườn dốc, sạt lở núi, nhà cao',
  },
  {
    id: 'diving',
    label: 'Lặn cứu hộ',
    icon: 'swim',
    desc: 'Lặn tìm kiếm vùng nước sâu',
  },
  {
    id: 'logistics',
    label: 'Hậu cần & Cấp dưỡng',
    icon: 'truck-delivery',
    desc: 'Vận chuyển lương thực, nước sạch, thuốc men',
  },
];

export const VEHICLE_OPTIONS: Array<{
  id: RescuerVehicleType;
  label: string;
  icon: string;
  shortDesc: string;
}> = [
    {
      id: 'BOAT',
      label: 'Xuồng / Ca-nô',
      icon: 'ferry',
      shortDesc: 'Vượt dòng lũ xiết',
    },
    {
      id: 'MOTORBIKE',
      label: 'Xe máy cơ động',
      icon: 'motorbike',
      shortDesc: 'Luồn lách ngõ hẹp',
    },
    {
      id: 'TRUCK',
      label: 'Xe tải cứu trợ',
      icon: 'truck',
      shortDesc: 'Chở nhu yếu phẩm',
    },
    {
      id: 'AMBULANCE',
      label: 'Xe cứu thương',
      icon: 'ambulance',
      shortDesc: 'Sơ cấp cứu dã chiến',
    },
    {
      id: 'OTHER',
      label: 'Bán tải / Xe khác',
      icon: 'car',
      shortDesc: 'Gầm cao lội nước',
    },
  ];


// Gợi ý kinh nghiệm nhanh cho người dùng chạm điền
const QUICK_EXPERIENCE_TAGS = [
  'Đã học sơ cấp cứu CPR',
  '3 năm kinh nghiệm lái ca-nô',
  'Tình nguyện viên xung kích PCTT',
  'Bơi cứu sinh thành thạo',
];

interface ProfessionalProfileScreenProps {
  onBack: () => void;
}

export const ProfessionalProfileScreen: React.FC<ProfessionalProfileScreenProps> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userData = user as any;
  const initialRescuer = userData?.rescuer || {};
  const initialId = (initialRescuer.idNumber || userData?.idNumber || userData?.citizen?.idNumber || userData?.idCard || '').replace(/\D/g, '');
  const initialAreaStr = initialRescuer.areaName || userData?.citizen?.areaName || userData?.address || '';

  // Form states - Khởi tạo tức thì từ user có sẵn, hiển thị form ngay lập tức 0ms
  const [idNumber, setIdNumber] = useState<string>(initialId);
  const [selectedAreaId, setSelectedAreaId] = useState<string>(() => {
    const idVal = initialRescuer.areaId || userData?.citizen?.areaId || userData?.areaId;
    return typeof idVal === 'object' ? idVal?._id || '' : idVal || '';
  });
  const [selectedAreaName, setSelectedAreaName] = useState<string>(initialAreaStr);
  const [isAreaSheetOpen, setIsAreaSheetOpen] = useState<boolean>(false);

  // 2-Step Province & Ward State
  const [provincesList, setProvincesList] = useState<Province[]>(FALLBACK_PROVINCES);
  const [selectedProvince, setSelectedProvince] = useState<Province | null>(() => {
    if (initialAreaStr) {
      const matchedP = FALLBACK_PROVINCES.find((p) =>
        initialAreaStr.toLowerCase().includes(p.name.toLowerCase().replace('thành phố ', '').replace('tỉnh ', ''))
      );
      if (matchedP) return matchedP;
    }
    return { code: 48, name: 'Thành phố Đà Nẵng' };
  });
  const [provinceSearchQuery, setProvinceSearchQuery] = useState<string>('');
  const [wardsList, setWardsList] = useState<Ward[]>(FALLBACK_WARDS[48] || []);
  const [wardSearchQuery, setWardSearchQuery] = useState<string>('');
  const [selectedWardCode, setSelectedWardCode] = useState<number | null>(null);
  const [selectedWardName, setSelectedWardName] = useState<string>(() => {
    if (initialAreaStr) {
      const parts = initialAreaStr.split(',');
      if (parts.length > 0) return parts[0].trim();
    }
    return '';
  });
  const [areaStep, setAreaStep] = useState<'PROVINCE' | 'WARD'>('PROVINCE');
  const [isLoadingWards, setIsLoadingWards] = useState<boolean>(false);

  const [selectedSkills, setSelectedSkills] = useState<string[]>(() =>
    Array.isArray(initialRescuer.skills) && initialRescuer.skills.length > 0
      ? initialRescuer.skills
      : ['first_aid', 'water_rescue']
  );
  const [selectedVehicleType, setSelectedVehicleType] = useState<RescuerVehicleType>(() =>
    (initialRescuer.vehicleType as RescuerVehicleType) || 'BOAT'
  );
  const [experience, setExperience] = useState<string>(() => initialRescuer.experience || '');
  const [agreeTerms, setAgreeTerms] = useState<boolean>(() => initialRescuer.verificationStatus === 'VERIFIED');

  // Trạng thái phê duyệt
  const [verificationStatus, setVerificationStatus] = useState<RescuerVerificationStatus>(
    () => initialRescuer.verificationStatus || 'NOT_REGISTERED'
  );

  // UI state - Không block màn hình nữa, hiển thị form ngay lập tức!
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [isVehicleSheetOpen, setIsVehicleSheetOpen] = useState<boolean>(false);
  const [isSkillSheetOpen, setIsSkillSheetOpen] = useState<boolean>(false);

  // 1. Tải và đồng bộ ngầm hồ sơ từ Backend (không block màn hình)
  useEffect(() => {
    let isMounted = true;

    const syncProfile = async () => {
      try {
        setIsSyncing(true);
        const res = await backendApi.getRescuerProfile();
        if (res.success && res.data && isMounted) {
          const u = user as any;
          const rescuer: any = res.data.rescuer || u?.rescuer || {};
          const existingId = rescuer.idNumber || u?.idNumber || u?.citizen?.idNumber || u?.idCard;
          if (existingId) setIdNumber(String(existingId).replace(/\D/g, ''));
          if (Array.isArray(rescuer.skills) && rescuer.skills.length > 0) {
            setSelectedSkills(rescuer.skills);
          }
          if (rescuer.experience) setExperience(rescuer.experience);
          if (rescuer.vehicleType) {
            setSelectedVehicleType(rescuer.vehicleType as RescuerVehicleType);
          }
          if (rescuer.areaId) {
            setSelectedAreaId(typeof rescuer.areaId === 'object' ? rescuer.areaId._id : rescuer.areaId);
          } else if (u?.citizen?.areaId || u?.areaId) {
            setSelectedAreaId(u?.citizen?.areaId || u?.areaId);
          }
          const initialAreaStr = rescuer.areaName || u?.citizen?.areaName || u?.address;
          if (initialAreaStr) {
            setSelectedAreaName(initialAreaStr);
            const matchedP = FALLBACK_PROVINCES.find((p) =>
              initialAreaStr.toLowerCase().includes(p.name.toLowerCase().replace('thành phố ', '').replace('tỉnh ', ''))
            );
            if (matchedP) {
              setSelectedProvince(matchedP);
            }
            const parts = initialAreaStr.split(',');
            if (parts.length > 0) {
              setSelectedWardName(parts[0].trim());
            }
          }
          setVerificationStatus(rescuer.verificationStatus || 'NOT_REGISTERED');
          if (rescuer.verificationStatus === 'VERIFIED') {
            setAgreeTerms(true);
          }
        }
      } catch (error) {
        console.warn('Lỗi đồng bộ hồ sơ cứu hộ:', error);
      } finally {
        if (isMounted) setIsSyncing(false);
      }
    };

    syncProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Chỉ tải danh sách Tỉnh/Thành phố toàn quốc khi mở popup chọn địa bàn
  useEffect(() => {
    if (!isAreaSheetOpen) return;
    let isMounted = true;
    const fetchProvinces = async () => {
      try {
        const list = await provinceApi.getProvinces();
        if (isMounted && Array.isArray(list) && list.length > 0) {
          setProvincesList(list);
        }
      } catch (err) {
        console.warn('Lỗi tải tỉnh thành:', err);
      }
    };
    fetchProvinces();
    return () => {
      isMounted = false;
    };
  }, [isAreaSheetOpen]);

  // 3. Chỉ tải danh sách Phường/Xã khi mở popup và ở bước WARD
  useEffect(() => {
    if (!isAreaSheetOpen || areaStep !== 'WARD' || !selectedProvince) return;
    let isMounted = true;
    const fetchWards = async () => {
      setIsLoadingWards(true);
      try {
        const wards = await provinceApi.getWards(selectedProvince.code);
        if (isMounted && Array.isArray(wards) && wards.length > 0) {
          setWardsList(wards);
        } else if (isMounted && FALLBACK_WARDS[selectedProvince.code]) {
          setWardsList(FALLBACK_WARDS[selectedProvince.code]);
        }
      } catch (err) {
        if (isMounted && FALLBACK_WARDS[selectedProvince.code]) {
          setWardsList(FALLBACK_WARDS[selectedProvince.code]);
        }
      } finally {
        if (isMounted) setIsLoadingWards(false);
      }
    };
    fetchWards();
    return () => {
      isMounted = false;
    };
  }, [isAreaSheetOpen, areaStep, selectedProvince?.code]);

  const isVerified = verificationStatus === 'VERIFIED';

  // Toggle kỹ năng
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

  // Chọn Tỉnh / Thành phố
  const handleSelectProvince = (prov: Province) => {
    setSelectedProvince(prov);
    setProvinceSearchQuery('');
    setWardSearchQuery('');
    setSelectedWardCode(null);
    setSelectedWardName('');
    setAreaStep('WARD');
  };

  // Chọn Phường / Xã
  const handleSelectWard = (ward: Ward) => {
    if (isVerified) return;
    const provName = selectedProvince?.name || 'Thành phố Đà Nẵng';
    const fullName = `${ward.name}, ${provName}`;
    setSelectedAreaName(fullName);
    setSelectedAreaId(String(ward.code));
    setSelectedWardCode(ward.code);
    setSelectedWardName(ward.name);
    setIsAreaSheetOpen(false);
    setWardSearchQuery('');
  };

  // Mở Popup chọn địa bàn
  const handleOpenAreaSheet = () => {
    if (isVerified) return;
    if (selectedProvince && selectedWardName) {
      setAreaStep('WARD');
    } else {
      setAreaStep('PROVINCE');
    }
    setIsAreaSheetOpen(true);
  };

  // Thêm nhanh tag kinh nghiệm
  const handleAppendExperience = (tag: string) => {
    if (isVerified) return;
    setExperience((prev) => {
      if (!prev.trim()) return tag;
      if (prev.includes(tag)) return prev;
      return `${prev.trim()}, ${tag}`;
    });
  };

  // Danh sách Tỉnh / Thành phố lọc theo tìm kiếm
  const filteredProvinces = useMemo(() => {
    if (!provinceSearchQuery.trim()) return provincesList;
    const q = provinceSearchQuery.toLowerCase();
    return provincesList.filter((p) => p.name.toLowerCase().includes(q));
  }, [provincesList, provinceSearchQuery]);

  // Danh sách Phường / Xã lọc theo tìm kiếm
  const filteredWards = useMemo(() => {
    if (!wardSearchQuery.trim()) return wardsList;
    const q = wardSearchQuery.toLowerCase();
    return wardsList.filter((w) => w.name.toLowerCase().includes(q));
  }, [wardsList, wardSearchQuery]);

  // Gửi hồ sơ lưu / nộp đơn đăng ký
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
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn Địa bàn / Phường, Xã bạn sẵn sàng tác chiến.');
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
      Alert.alert('Xác nhận cam kết', 'Vui lòng tick xác nhận cam kết tự nguyện cứu hộ trước khi gửi hồ sơ.');
      return;
    }

    try {
      setIsSaving(true);
      const isValidObjectId = (id?: string) => Boolean(id && /^[0-9a-fA-F]{24}$/.test(id));
      const res = await backendApi.updateRescuerProfile({
        idNumber: idNumber.trim(),
        skills: selectedSkills,
        experience: experience.trim(),
        vehicleType: selectedVehicleType,
        areaId: isValidObjectId(selectedAreaId) ? selectedAreaId : undefined,
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

  const selectedVehicleObj =
    VEHICLE_OPTIONS.find((v) => v.id === selectedVehicleType) || VEHICLE_OPTIONS[0];

  // Cấu hình thông báo trạng thái
  const getStatusAlertConfig = () => {
    switch (verificationStatus) {
      case 'VERIFIED':
        return {
          title: 'Hồ sơ đã được phê duyệt',
          desc: 'Chứng chỉ và năng lực của bạn đã được Ban Chỉ huy địa phương phê duyệt cấp quyền tác chiến.',
          bgColor: '#ECFDF5',
          borderColor: '#A7F3D0',
          textColor: '#065F46',
          icon: 'check-circle-outline',
          iconColor: '#059669',
        };
      case 'PENDING':
        return {
          title: 'Hồ sơ đang chờ thẩm định',
          desc: 'Ban Chỉ huy địa phương đang đối soát và duyệt hồ sơ. Bạn vẫn có thể cập nhật thông tin nếu cần.',
          bgColor: '#FFFBEB',
          borderColor: '#FDE68A',
          textColor: '#92400E',
          icon: 'clock-outline',
          iconColor: '#D97706',
        };
      case 'REJECTED':
        return {
          title: 'Hồ sơ cần bổ sung thông tin',
          desc: 'Vui lòng kiểm tra lại CCCD, kỹ năng hoặc thông tin kinh nghiệm và nộp lại hồ sơ.',
          bgColor: '#FEF2F2',
          borderColor: '#FECACA',
          textColor: '#991B1B',
          icon: 'alert-circle-outline',
          iconColor: '#DC2626',
        };
      default:
        return null;
    }
  };

  const statusAlert = getStatusAlertConfig();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* 1. Header Navigation Bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle}>Đăng ký Cứu hộ viên</Text>
        </View>
        <View style={styles.headerRightPlaceholder}>
          {isSyncing && <ActivityIndicator size="small" color="#0066FF" />}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 2. Thanh trạng thái tinh gọn (nếu có) */}
          {statusAlert && (
            <View
              style={[
                styles.statusAlertCard,
                { backgroundColor: statusAlert.bgColor, borderColor: statusAlert.borderColor },
              ]}
            >
              <MaterialCommunityIcons
                name={statusAlert.icon as any}
                size={20}
                color={statusAlert.iconColor}
              />
              <View style={styles.statusAlertTextWrap}>
                <Text style={[styles.statusAlertTitle, { color: statusAlert.textColor }]}>
                  {statusAlert.title}
                </Text>
                <Text style={styles.statusAlertDesc}>{statusAlert.desc}</Text>
              </View>
            </View>
          )}

          {/* 3. Thẻ thông tin ứng viên liên kết (Profile Strip) */}
          <View style={styles.applicantStrip}>
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
                <Text style={styles.applicantName} numberOfLines={1}>
                  {user?.fullName || 'Người dân'}
                </Text>
                <View style={styles.applicantBadge}>
                  <Text style={styles.applicantBadgeText}>Tài khoản liên kết</Text>
                </View>
              </View>
              <Text style={styles.applicantContact} numberOfLines={1}>
                {user?.phone || 'Chưa cập nhật SĐT'} {user?.email ? `• ${user.email}` : ''}
              </Text>
            </View>
          </View>

          {/* 4. KHỐI 1: BENTO CARD - Định danh CCCD & Địa bàn tác chiến */}
          <View style={styles.bentoCard}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: '#EFF6FF' }]}>
                <MaterialCommunityIcons name="card-account-details-outline" size={19} color="#0066FF" />
              </View>
              <View style={styles.cardHeaderTitleCol}>
                <Text style={styles.cardTitle}>1. Định danh & Địa bàn trực thuộc</Text>

              </View>
            </View>

            {/* Ô nhập CCCD */}
            <View style={styles.subFieldGroup}>
              <Text style={styles.fieldLabel}>
                Số Căn cước công dân (CCCD) <Text style={styles.requiredStar}>*</Text>
              </Text>

              {isVerified ? (
                <View style={styles.maskedNumberBox}>
                  <Text style={styles.maskedNumberText}>
                    {idNumber ? `${idNumber.slice(0, 4)}********${idNumber.slice(-2)}` : '0792********01'}
                  </Text>
                  <View style={styles.verifiedTag}>
                    <Feather name="check-circle" size={12} color="#059669" />
                    <Text style={styles.verifiedTagText}>Đã xác thực</Text>
                  </View>
                </View>
              ) : (
                <View
                  style={[
                    styles.inputBox,
                    idNumber.length === 12 && styles.inputBoxValid,
                  ]}
                >
                  <Feather
                    name={idNumber.length === 12 ? 'check-circle' : 'hash'}
                    size={16}
                    color={idNumber.length === 12 ? '#0066FF' : '#64748B'}
                    style={{ marginRight: 8 }}
                  />
                  <TextInput
                    style={styles.textInput}
                    value={idNumber}
                    onChangeText={(val) => setIdNumber(val.replace(/\D/g, ''))}
                    placeholder="Nhập đủ 12 chữ số CCCD"
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
              )}
            </View>

            {/* Địa bàn tác chiến - Bấm để mở Popup nổi (Bottom Sheet) */}
            <View style={[styles.subFieldGroup, { marginTop: 14 }]}>
              <Text style={styles.fieldLabel}>
                Địa bàn sẵn sàng tác chiến <Text style={styles.requiredStar}>*</Text>
              </Text>

              {/* Ô hiển thị Phường/Xã hiện tại - Bấm để mở Bottom Sheet Popup */}
              <TouchableOpacity
                style={[
                  styles.inlineAreaBox,
                  selectedAreaName ? styles.inlineAreaBoxActive : styles.inlineAreaBoxEmpty,
                  isVerified && { opacity: 0.8 },
                ]}
                onPress={handleOpenAreaSheet}
                activeOpacity={0.75}
                disabled={isVerified}
              >
                <MaterialCommunityIcons
                  name="map-marker-radius"
                  size={20}
                  color={selectedAreaName ? '#0066FF' : '#D97706'}
                />
                <Text
                  style={[
                    styles.inlineAreaText,
                    !selectedAreaName && { color: '#94A3B8', fontWeight: '500' },
                  ]}
                  numberOfLines={1}
                >
                  {selectedAreaName || 'Bấm để chọn Tỉnh thành & Phường, Xã'}
                </Text>
                {!isVerified && (
                  <Feather
                    name="chevron-down"
                    size={18}
                    color="#64748B"
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* 5. KHỐI 2: BENTO CARD - Phương tiện cơ động (Hiển thị gọn + Popup nổi dưới màn hình) */}
          <View style={styles.bentoCard}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: '#FFFBEB' }]}>
                <MaterialCommunityIcons name="truck-fast-outline" size={19} color="#D97706" />
              </View>
              <View style={styles.cardHeaderTitleCol}>
                <Text style={styles.cardTitle}>2. Phương tiện cơ động sẵn sàng</Text>
              </View>
            </View>

            {/* Ô hiển thị 1 phương tiện đang chọn - Bấm vào để mở Bottom Sheet Popup */}
            <TouchableOpacity
              style={[styles.vehicleTriggerCard, isVerified && { opacity: 0.85 }]}
              onPress={() => !isVerified && setIsVehicleSheetOpen(true)}
              activeOpacity={0.75}
              disabled={isVerified}
            >
              <MaterialCommunityIcons
                name={selectedVehicleObj.icon as any}
                size={20}
                color="#0066FF"
              />

              <View style={styles.vehicleTriggerInfo}>
                <Text style={styles.vehicleTriggerLabel} numberOfLines={1}>
                  {selectedVehicleObj.label}
                  <Text style={styles.vehicleTriggerDesc}>  •  {selectedVehicleObj.shortDesc}</Text>
                </Text>
              </View>

              {!isVerified && (
                <Feather name="chevron-down" size={18} color="#64748B" />
              )}
            </TouchableOpacity>
          </View>

          {/* 6. KHỐI 3: BENTO CARD - Kỹ năng chuyên môn cứu hộ (Hiển thị gọn + Popup nổi dưới màn hình) */}
          <View style={styles.bentoCard}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: '#F0FDF4' }]}>
                <MaterialCommunityIcons name="shield-star-outline" size={19} color="#10B981" />
              </View>
              <View style={styles.cardHeaderTitleCol}>
                <Text style={styles.cardTitle}>3. Kỹ năng cứu hộ chuyên môn</Text>
              </View>
              <View style={styles.skillsCountBadge}>
                <Text style={styles.skillsCountText}>{selectedSkills.length} đã chọn</Text>
              </View>
            </View>

            {/* Ô hiển thị tóm tắt kỹ năng đã chọn - Bấm vào để mở Bottom Sheet Popup */}
            <TouchableOpacity
              style={[styles.skillTriggerCard, isVerified && { opacity: 0.85 }]}
              onPress={() => !isVerified && setIsSkillSheetOpen(true)}
              activeOpacity={0.75}
              disabled={isVerified}
            >
              <MaterialCommunityIcons name="shield-check" size={20} color="#10B981" />

              <View style={styles.skillTriggerInfo}>
                {selectedSkills.length > 0 ? (
                  <View style={styles.skillSelectedChipsRow}>
                    {selectedSkills.slice(0, 3).map((id) => {
                      const sk = RESCUE_SKILLS.find((s) => s.id === id);
                      return (
                        <View key={id} style={styles.skillMiniChip}>
                          <Text style={styles.skillMiniChipText} numberOfLines={1}>
                            {sk?.label || id}
                          </Text>
                        </View>
                      );
                    })}
                    {selectedSkills.length > 3 && (
                      <View style={styles.skillMoreChip}>
                        <Text style={styles.skillMoreChipText}>+{selectedSkills.length - 3}</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <Text style={styles.skillEmptyText}>Bấm để chọn kỹ năng cứu hộ</Text>
                )}
              </View>

              {!isVerified && (
                <Feather name="chevron-down" size={18} color="#64748B" />
              )}
            </TouchableOpacity>
          </View>

          {/* 7. KHỐI 4: BENTO CARD - Kinh nghiệm tác chiến & Chứng chỉ */}
          <View style={styles.bentoCard}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: '#F5F3FF' }]}>
                <MaterialCommunityIcons name="certificate-outline" size={19} color="#7C3AED" />
              </View>
              <View style={styles.cardHeaderTitleCol}>
                <Text style={styles.cardTitle}>4. Kinh nghiệm & Chứng chỉ</Text>
              </View>
            </View>

            {/* Ô nhập kinh nghiệm */}
            <View style={styles.textAreaBox}>
              <TextInput
                style={styles.textArea}
                value={experience}
                onChangeText={setExperience}
                multiline
                numberOfLines={3}
                placeholder="Nhập tóm tắt quá trình kinh nghiệm, đơn vị thiện nguyện từng tham gia, chứng chỉ cứu nạn đã có..."
                placeholderTextColor="#94A3B8"
                textAlignVertical="top"
                editable={!isVerified}
              />
            </View>

            {/* Quick Experience Tags để tự điền nhanh - Đặt bên dưới ô nhập */}
            {!isVerified && (
              <View style={styles.quickTagsWrapper}>
                <Text style={styles.quickTagsTitle}>Gợi ý nhanh (chạm để thêm):</Text>
                <View style={styles.quickTagsRow}>
                  {QUICK_EXPERIENCE_TAGS.map((tag, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.quickTagBtn}
                      onPress={() => handleAppendExperience(tag)}
                      activeOpacity={0.7}
                    >
                      <Feather name="plus" size={11} color="#0066FF" />
                      <Text style={styles.quickTagBtnText}>{tag}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* 8. KHỐI 5: Cam kết tự nguyện (Pledge & Agreement) */}
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
                Tôi cam kết thông tin khai báo là hoàn toàn trung thực, tự nguyện tham gia mạng lưới cứu
                hộ và sẵn sàng chấp hành lệnh điều phối của Ban Chỉ huy PCTT & TKCN địa phương.
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 9. Nút Lưu / Nộp đơn ghim cố định ở đáy (Sticky Bottom Action Bar) */}
      <View style={[styles.stickyBottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
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
          <LinearGradient
            colors={
              isVerified
                ? ['#059669', '#047857']
                : !agreeTerms
                  ? ['#94A3B8', '#64748B']
                  : ['#0066FF', '#0052CC']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.submitGradient}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : isVerified ? (
              <>
                <Feather name="check-circle" size={18} color="#FFFFFF" />
                <Text style={styles.submitButtonText}>Hồ sơ đã được phê duyệt chính thức</Text>
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
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* 10. Modal phản hồi gửi thành công */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.feedbackCard}>
            <View style={styles.feedbackIconBox}>
              <MaterialCommunityIcons name="check-decagram" size={36} color="#059669" />
            </View>
            <Text style={styles.feedbackTitle}>Gửi hồ sơ thành công!</Text>
            <Text style={styles.feedbackDesc}>
              Thông tin CCCD, kỹ năng và phương tiện cơ động đã được chuyển tới Ban Chỉ huy địa
              phương để thẩm định và đối soát cấp quyền tác chiến.
            </Text>

            {/* Bảng tóm tắt hồ sơ vừa nộp */}
            <View style={styles.feedbackSummaryBox}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>CCCD định danh:</Text>
                <Text style={styles.summaryValue}>
                  {idNumber.slice(0, 4)}****{idNumber.slice(-4)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Địa bàn tác chiến:</Text>
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

      {/* 11. Modal Popup nổi ở dưới màn hình (Bottom Sheet) chọn Tỉnh thành & Phường xã */}
      <Modal
        visible={isAreaSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsAreaSheetOpen(false)}
      >
        <TouchableOpacity
          style={styles.bottomSheetOverlay}
          activeOpacity={1}
          onPress={() => setIsAreaSheetOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.bottomSheetCard, { paddingBottom: Math.max(insets.bottom + 16, 28) }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Thanh gạt trên đầu Bottom Sheet */}
            <View style={styles.sheetHandle} />

            {/* Header Bottom Sheet */}
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetHeaderTitleCol}>
                <View style={styles.sheetTitleWithIcon}>
                  {areaStep === 'WARD' && (
                    <TouchableOpacity
                      style={styles.sheetBackBtn}
                      onPress={() => setAreaStep('PROVINCE')}
                      activeOpacity={0.7}
                    >
                      <Feather name="arrow-left" size={17} color="#0066FF" />
                    </TouchableOpacity>
                  )}
                  <View style={[styles.cardHeaderIcon, { backgroundColor: '#EFF6FF', width: 30, height: 30 }]}>
                    <MaterialCommunityIcons name="map-marker-radius" size={17} color="#0066FF" />
                  </View>
                  <Text style={styles.sheetTitle}>Địa bàn sẵn sàng tác chiến</Text>
                </View>
                <Text style={styles.sheetSubtitle}>
                  {areaStep === 'PROVINCE'
                    ? 'Bước 1: Chọn Tỉnh / Thành phố bạn thường trú'
                    : 'Bước 2: Chọn Phường / Xã bạn sẵn sàng tác chiến'}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.sheetCloseBtn}
                onPress={() => setIsAreaSheetOpen(false)}
                activeOpacity={0.7}
              >
                <Feather name="x" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Thanh điều hướng 2 bước (Step Tabs) */}
            <View style={styles.stepTabsRow}>
              <TouchableOpacity
                style={[styles.stepTab, areaStep === 'PROVINCE' && styles.stepTabActive]}
                onPress={() => setAreaStep('PROVINCE')}
                activeOpacity={0.7}
              >
                <View style={[styles.stepTabBadge, areaStep === 'PROVINCE' && styles.stepTabBadgeActive]}>
                  <Text style={[styles.stepTabBadgeText, areaStep === 'PROVINCE' && styles.stepTabBadgeTextActive]}>1</Text>
                </View>
                <Text style={[styles.stepTabText, areaStep === 'PROVINCE' && styles.stepTabTextActive]} numberOfLines={1}>
                  Tỉnh / Thành phố
                </Text>
              </TouchableOpacity>

              <Feather name="chevron-right" size={15} color="#94A3B8" style={{ marginHorizontal: 3 }} />

              <TouchableOpacity
                style={[
                  styles.stepTab,
                  areaStep === 'WARD' && styles.stepTabActive,
                  !selectedProvince && { opacity: 0.5 },
                ]}
                onPress={() => selectedProvince && setAreaStep('WARD')}
                disabled={!selectedProvince}
                activeOpacity={0.7}
              >
                <View style={[styles.stepTabBadge, areaStep === 'WARD' && styles.stepTabBadgeActive]}>
                  <Text style={[styles.stepTabBadgeText, areaStep === 'WARD' && styles.stepTabBadgeTextActive]}>2</Text>
                </View>
                <Text style={[styles.stepTabText, areaStep === 'WARD' && styles.stepTabTextActive]} numberOfLines={1}>
                  {selectedWardName || 'Phường / Xã'}
                </Text>
              </TouchableOpacity>
            </View>

            {areaStep === 'PROVINCE' ? (
              <>
                {/* Ô tìm kiếm Tỉnh / Thành phố */}
                <View style={styles.sheetSearchInputRow}>
                  <Feather name="search" size={16} color="#94A3B8" />
                  <TextInput
                    style={styles.sheetSearchInput}
                    placeholder="Tìm Tỉnh / Thành phố (Đà Nẵng, Hà Nội...)..."
                    placeholderTextColor="#94A3B8"
                    value={provinceSearchQuery}
                    onChangeText={setProvinceSearchQuery}
                  />
                  {provinceSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setProvinceSearchQuery('')}>
                      <Feather name="x-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Danh sách Tỉnh / Thành phố */}
                <ScrollView
                  style={{ maxHeight: 360 }}
                  contentContainerStyle={styles.areaSheetList}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {filteredProvinces.map((p) => {
                    const isSelected = selectedProvince?.code === p.code;
                    return (
                      <TouchableOpacity
                        key={p.code}
                        style={[styles.areaSheetItem, isSelected && styles.areaSheetItemActive]}
                        onPress={() => handleSelectProvince(p)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.areaSheetIconCircle, isSelected && styles.areaSheetIconCircleActive]}>
                          <MaterialCommunityIcons
                            name="city-variant-outline"
                            size={19}
                            color={isSelected ? '#0066FF' : '#64748B'}
                          />
                        </View>

                        <View style={styles.areaSheetInfo}>
                          <Text style={[styles.areaSheetLabel, isSelected && styles.areaSheetLabelActive]}>
                            {p.name}
                          </Text>
                        </View>

                        <Feather
                          name="chevron-right"
                          size={16}
                          color={isSelected ? '#0066FF' : '#94A3B8'}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            ) : (
              <>
                {/* Ô tìm kiếm Phường / Xã */}
                <View style={styles.sheetSearchInputRow}>
                  <Feather name="search" size={16} color="#94A3B8" />
                  <TextInput
                    style={styles.sheetSearchInput}
                    placeholder="Tìm kiếm Phường / Xã..."
                    placeholderTextColor="#94A3B8"
                    value={wardSearchQuery}
                    onChangeText={setWardSearchQuery}
                  />
                  {wardSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setWardSearchQuery('')}>
                      <Feather name="x-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Danh sách Phường / Xã */}
                {isLoadingWards ? (
                  <View style={styles.loadingWardsBox}>
                    <ActivityIndicator size="small" color="#0066FF" />
                    <Text style={styles.loadingWardsText}>Đang tải danh sách Phường / Xã...</Text>
                  </View>
                ) : (
                  <ScrollView
                    style={{ maxHeight: 360 }}
                    contentContainerStyle={styles.areaSheetList}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    {filteredWards.length > 0 ? (
                      filteredWards.map((w) => {
                        const isSelected = selectedWardCode === w.code || selectedAreaName.includes(w.name);
                        return (
                          <TouchableOpacity
                            key={w.code}
                            style={[styles.areaSheetItem, isSelected && styles.areaSheetItemActive]}
                            onPress={() => handleSelectWard(w)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.areaSheetIconCircle, isSelected && styles.areaSheetIconCircleActive]}>
                              <MaterialCommunityIcons
                                name="map-marker-outline"
                                size={19}
                                color={isSelected ? '#0066FF' : '#64748B'}
                              />
                            </View>

                            <View style={styles.areaSheetInfo}>
                              <Text style={[styles.areaSheetLabel, isSelected && styles.areaSheetLabelActive]}>
                                {w.name}
                              </Text>
                            </View>

                            <View
                              style={[
                                styles.vehicleRadioDot,
                                isSelected && styles.vehicleRadioDotActive,
                              ]}
                            >
                              {isSelected && <View style={styles.vehicleRadioInner} />}
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    ) : (
                      <View style={styles.emptyAreaBox}>
                        <Text style={styles.emptyAreaText}>Không tìm thấy Phường / Xã phù hợp</Text>
                      </View>
                    )}
                  </ScrollView>
                )}
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 12. Modal Popup nổi ở dưới màn hình (Bottom Sheet) chọn Phương tiện */}
      <Modal
        visible={isVehicleSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsVehicleSheetOpen(false)}
      >
        <TouchableOpacity
          style={styles.bottomSheetOverlay}
          activeOpacity={1}
          onPress={() => setIsVehicleSheetOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.bottomSheetCard, { paddingBottom: Math.max(insets.bottom + 16, 28) }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Thanh gạt trên đầu Bottom Sheet */}
            <View style={styles.sheetHandle} />

            {/* Header Bottom Sheet */}
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetHeaderTitleCol}>
                <View style={styles.sheetTitleWithIcon}>
                  <View style={[styles.cardHeaderIcon, { backgroundColor: '#FFFBEB', width: 30, height: 30 }]}>
                    <MaterialCommunityIcons name="truck-fast-outline" size={17} color="#D97706" />
                  </View>
                  <Text style={styles.sheetTitle}>Phương tiện cơ động sẵn sàng</Text>
                </View>
                <Text style={styles.sheetSubtitle}>
                  Chọn phương tiện bạn có thể tự vận hành khi nhận lệnh huy động
                </Text>
              </View>

              <TouchableOpacity
                style={styles.sheetCloseBtn}
                onPress={() => setIsVehicleSheetOpen(false)}
                activeOpacity={0.7}
              >
                <Feather name="x" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Danh sách các phương tiện trong Bottom Sheet */}
            <View style={styles.vehicleSheetList}>
              {VEHICLE_OPTIONS.map((v) => {
                const isSelected = selectedVehicleType === v.id;
                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[
                      styles.vehicleSheetItem,
                      isSelected && styles.vehicleSheetItemActive,
                    ]}
                    onPress={() => {
                      handleSelectVehicle(v.id);
                      setIsVehicleSheetOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.vehicleSheetIconCircle,
                        isSelected && styles.vehicleSheetIconCircleActive,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={v.icon as any}
                        size={19}
                        color={isSelected ? '#0066FF' : '#64748B'}
                      />
                    </View>

                    <View style={styles.vehicleSheetInfo}>
                      <Text
                        style={[
                          styles.vehicleSheetLabel,
                          isSelected && styles.vehicleSheetLabelActive,
                        ]}
                      >
                        {v.label}
                      </Text>
                      <Text style={styles.vehicleSheetDesc}>{v.shortDesc}</Text>
                    </View>

                    <View
                      style={[
                        styles.vehicleRadioDot,
                        isSelected && styles.vehicleRadioDotActive,
                      ]}
                    >
                      {isSelected && <View style={styles.vehicleRadioInner} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      {/* 12. Modal Popup nổi ở dưới màn hình (Bottom Sheet) chọn Kỹ năng chuyên môn */}
      <Modal
        visible={isSkillSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsSkillSheetOpen(false)}
      >
        <TouchableOpacity
          style={styles.bottomSheetOverlay}
          activeOpacity={1}
          onPress={() => setIsSkillSheetOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.bottomSheetCard, { paddingBottom: Math.max(insets.bottom + 16, 28) }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Thanh gạt trên đầu Bottom Sheet */}
            <View style={styles.sheetHandle} />

            {/* Header Bottom Sheet */}
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetHeaderTitleCol}>
                <View style={styles.sheetTitleWithIcon}>
                  <View style={[styles.cardHeaderIcon, { backgroundColor: '#F0FDF4', width: 30, height: 30 }]}>
                    <MaterialCommunityIcons name="shield-star-outline" size={17} color="#10B981" />
                  </View>
                  <Text style={styles.sheetTitle}>Kỹ năng cứu hộ chuyên môn</Text>
                </View>
                <Text style={styles.sheetSubtitle}>
                  Chọn các kỹ năng bạn có đủ điều kiện và tự tin tham gia tác chiến
                </Text>
              </View>

              <TouchableOpacity
                style={styles.sheetCloseBtn}
                onPress={() => setIsSkillSheetOpen(false)}
                activeOpacity={0.7}
              >
                <Feather name="x" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Danh sách kỹ năng trong Bottom Sheet */}
            <ScrollView
              style={{ maxHeight: 360 }}
              contentContainerStyle={styles.skillSheetList}
              showsVerticalScrollIndicator={false}
            >
              {RESCUE_SKILLS.map((skill) => {
                const isSelected = selectedSkills.includes(skill.id);
                return (
                  <TouchableOpacity
                    key={skill.id}
                    style={[
                      styles.skillSheetItem,
                      isSelected && styles.skillSheetItemActive,
                    ]}
                    onPress={() => handleToggleSkill(skill.id)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.skillSheetIconCircle,
                        isSelected && styles.skillSheetIconCircleActive,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={skill.icon as any}
                        size={19}
                        color={isSelected ? '#0066FF' : '#64748B'}
                      />
                    </View>

                    <View style={styles.skillSheetInfo}>
                      <Text
                        style={[
                          styles.skillSheetLabel,
                          isSelected && styles.skillSheetLabelActive,
                        ]}
                      >
                        {skill.label}
                      </Text>
                      <Text style={styles.skillSheetDesc}>{skill.desc}</Text>
                    </View>

                    <View
                      style={[
                        styles.skillCheckCircle,
                        isSelected && styles.skillCheckCircleActive,
                      ]}
                    >
                      {isSelected && <Feather name="check" size={11} color="#FFFFFF" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Nút xác nhận hoàn tất chọn kỹ năng */}
            <TouchableOpacity
              style={styles.sheetConfirmBtn}
              onPress={() => setIsSkillSheetOpen(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.sheetConfirmBtnText}>
                Xác nhận ({selectedSkills.length} kỹ năng đã chọn)
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitleCol: {
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  headerRightPlaceholder: {
    width: 38,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  scrollContent: {
    padding: 14,
  },

  // Status Alert
  statusAlertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  statusAlertTextWrap: {
    flex: 1,
  },
  statusAlertTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  statusAlertDesc: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16,
  },

  // Applicant Strip
  applicantStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    gap: 10,
  },
  applicantAvatarBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  applicantAvatar: {
    width: 40,
    height: 40,
  },
  applicantAvatarPlaceholder: {
    width: 40,
    height: 40,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applicantAvatarText: {
    fontSize: 14,
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
  },
  applicantName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    marginRight: 6,
  },
  applicantBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  applicantBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  applicantContact: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },

  // BENTO CARD GENERAL
  bentoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12,
  },
  cardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderTitleCol: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  subFieldGroup: {
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  requiredStar: {
    color: '#DC2626',
    fontWeight: '700',
  },

  // CCCD Box
  maskedNumberBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  maskedNumberText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    letterSpacing: 1.5,
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verifiedTagText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#059669',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  inputBoxValid: {
    borderColor: '#93C5FD',
    backgroundColor: '#F0F7FF',
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 10,
    fontWeight: '600',
    letterSpacing: 1,
  },
  charCounter: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  charCounterComplete: {
    color: '#0066FF',
    fontWeight: '700',
  },

  // INLINE AREA SELECTOR
  inlineAreaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  inlineAreaBoxActive: {
    backgroundColor: '#F0F7FF',
    borderColor: '#93C5FD',
  },
  inlineAreaBoxEmpty: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  inlineAreaText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },

  // 2-Step Area Navigation
  stepTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  stepTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 6,
  },
  stepTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  stepTabBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTabBadgeActive: {
    backgroundColor: '#0066FF',
  },
  stepTabBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  stepTabBadgeTextActive: {
    color: '#FFFFFF',
  },
  stepTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  stepTabTextActive: {
    color: '#0066FF',
    fontWeight: '700',
  },
  loadingWardsBox: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingWardsText: {
    fontSize: 12,
    color: '#64748B',
  },
  sheetSearchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 8,
    marginBottom: 10,
  },
  sheetSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  areaSheetList: {
    gap: 9,
    paddingVertical: 4,
  },
  areaSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  areaSheetItemActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
  },
  areaSheetIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  areaSheetIconCircleActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#BFDBFE',
  },
  areaSheetInfo: {
    flex: 1,
  },
  areaSheetLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  areaSheetLabelActive: {
    color: '#0066FF',
  },
  areaSheetDesc: {
    fontSize: 11,
    color: '#64748B',
  },
  emptyAreaBox: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyAreaText: {
    fontSize: 12,
    color: '#94A3B8',
  },

  // VEHICLE TRIGGER CARD (Compact on Main Form)
  vehicleTriggerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F7FF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#93C5FD',
    gap: 8,
  },
  vehicleTriggerInfo: {
    flex: 1,
  },
  vehicleTriggerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  vehicleTriggerDesc: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '400',
  },

  // BOTTOM SHEET POPUP (Vehicle Picker)
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  bottomSheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetHeaderTitleCol: {
    flex: 1,
    paddingRight: 12,
  },
  sheetTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  sheetSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
  },
  sheetBackBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleSheetList: {
    gap: 9,
  },
  vehicleSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  vehicleSheetItemActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
  },
  vehicleSheetIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  vehicleSheetIconCircleActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#BFDBFE',
  },
  vehicleSheetInfo: {
    flex: 1,
  },
  vehicleSheetLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  vehicleSheetLabelActive: {
    color: '#0066FF',
  },
  vehicleSheetDesc: {
    fontSize: 11,
    color: '#64748B',
  },
  vehicleRadioDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  vehicleRadioDotActive: {
    borderColor: '#0066FF',
  },
  vehicleRadioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#0066FF',
  },

  skillsCountBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  skillsCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0066FF',
  },

  // SKILL TRIGGER CARD (Compact on Main Form)
  skillTriggerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 8,
  },
  skillTriggerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  skillTriggerInfo: {
    flex: 1,
  },
  skillSelectedChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  skillMiniChip: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  skillMiniChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0066FF',
  },
  skillMoreChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  skillMoreChipText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  skillEmptyText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  skillTriggerHint: {
    fontSize: 11,
    color: '#64748B',
  },

  // SKILLS BOTTOM SHEET
  skillSheetList: {
    gap: 9,
    paddingVertical: 4,
  },
  skillSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  skillSheetItemActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
  },
  skillSheetIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  skillSheetIconCircleActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#BFDBFE',
  },
  skillSheetInfo: {
    flex: 1,
  },
  skillSheetLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  skillSheetLabelActive: {
    color: '#0066FF',
  },
  skillSheetDesc: {
    fontSize: 11,
    color: '#64748B',
  },
  skillCheckCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  skillCheckCircleActive: {
    borderColor: '#0066FF',
    backgroundColor: '#0066FF',
  },
  sheetConfirmBtn: {
    backgroundColor: '#0066FF',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 14,
  },
  sheetConfirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // EXPERIENCE
  quickTagsWrapper: {
    marginTop: 8,
  },
  quickTagsTitle: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 5,
  },
  quickTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickTagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  quickTagBtnText: {
    fontSize: 10.5,
    color: '#0066FF',
    fontWeight: '600',
  },
  textAreaBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  textArea: {
    minHeight: 70,
    fontSize: 12.5,
    color: '#0F172A',
    lineHeight: 18,
  },

  // Pledge Card
  pledgeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  pledgeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  pledgeCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    backgroundColor: '#FFFFFF',
  },
  pledgeCheckboxActive: {
    borderColor: '#0066FF',
    backgroundColor: '#0066FF',
  },
  pledgeText: {
    flex: 1,
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16.5,
  },

  // Sticky Bottom Bar
  stickyBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  submitButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  submitButtonDisabled: {
    opacity: 0.65,
  },
  submitButtonVerified: {},
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    gap: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },

  // Success Feedback Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  feedbackCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  feedbackIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  feedbackTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  feedbackDesc: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  feedbackSummaryBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 7,
    marginBottom: 18,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  summaryValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  feedbackBtn: {
    width: '100%',
    backgroundColor: '#0066FF',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  feedbackBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

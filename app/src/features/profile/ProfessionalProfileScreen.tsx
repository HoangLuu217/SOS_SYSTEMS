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
import { CccdQrScannerModal } from '@/components/CccdQrScannerModal';
import type { ParsedCccdData } from '@/utils/cccdHelper';
import {
  backendApi,
  provinceApi,
  Province,
  Ward,
  FALLBACK_PROVINCES,
  FALLBACK_WARDS,
} from '@/api';
import type { RescuerVerificationStatus } from '@/types';

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
    id: 'firefighting',
    label: 'PCCC & Cứu sập',
    icon: 'fire',
    desc: 'Dập cháy cơ sở, cứu nạn sập đổ, dọn cây gãy đổ',
  },
  {
    id: 'evacuation',
    label: 'Sơ tán người dân',
    icon: 'account-group',
    desc: 'Di dời hộ dân vùng ngập sâu, người yếu thế',
  },
  {
    id: 'communication',
    label: 'Thông tin liên lạc',
    icon: 'radio',
    desc: 'Vận hành bộ đàm, định vị vùng mất sóng',
  },
  {
    id: 'logistics',
    label: 'Hậu cần & Cấp dưỡng',
    icon: 'truck-delivery',
    desc: 'Vận chuyển lương thực, nước sạch, thuốc men',
  },
];

// Gợi ý kinh nghiệm nhanh cho người dùng chạm chọn / bỏ chọn
const QUICK_EXPERIENCE_TAGS = [
  { label: 'Người mới, hỗ trợ', text: 'Người mới, sẵn sàng hỗ trợ' },
  { label: 'Thông thạo địa bàn', text: 'Thông thạo địa hình địa phương' },
  { label: 'Đội xung kích PCTT', text: 'Tình nguyện viên xung kích PCTT' },
  { label: 'Sơ cấp cứu / CPR', text: 'Đã tập huấn sơ cấp cứu / CPR' },
  { label: 'Dân quân / PCCC', text: 'Dân quân / PCCC cơ sở' },
  { label: 'Bơi / Lái xuồng', text: 'Bơi cứu sinh / Lái xuồng' },
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
  const [isSkillSheetOpen, setIsSkillSheetOpen] = useState<boolean>(false);

  // Trạng thái quét mã QR thẻ CCCD gắn chip
  const [isQrScannerOpen, setIsQrScannerOpen] = useState<boolean>(false);
  const [isCccdQrVerified, setIsCccdQrVerified] = useState<boolean>(() => Boolean(initialRescuer.isCccdVerified));
  const [scannedCccdInfo, setScannedCccdInfo] = useState<ParsedCccdData | null>(null);

  const handleScanCccdSuccess = (data: ParsedCccdData) => {
    setIdNumber(data.idNumber);
    setIsCccdQrVerified(true);
    setScannedCccdInfo(data);

    // Gợi ý chọn xã nếu trong địa chỉ thường trú của CCCD có tên xã khớp với danh sách xã hiện tại
    if (data.address && (!selectedWardName || !selectedAreaId)) {
      const addrLower = data.address.toLowerCase();
      const matchedW = wardsList.find((w) => {
        const cleanWName = w.name.toLowerCase().replace(/^(xã|phường|thị trấn)\s+/i, '').trim();
        return addrLower.includes(cleanWName);
      });
      if (matchedW) {
        setSelectedWardCode(matchedW.code);
        setSelectedWardName(matchedW.name);
        setSelectedAreaName(`${matchedW.name}, ${selectedProvince?.name || 'Thành phố Đà Nẵng'}`);
      }
    }
  };

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
          if (rescuer.isCccdVerified) setIsCccdQrVerified(true);
          if (Array.isArray(rescuer.skills) && rescuer.skills.length > 0) {
            setSelectedSkills(rescuer.skills);
          }
          if (rescuer.experience) setExperience(rescuer.experience);
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

  // Chọn / bỏ chọn nhanh tag kinh nghiệm (2 chiều)
  const handleToggleExperienceTag = (tag: string) => {
    if (isVerified) return;
    setExperience((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return tag;

      if (trimmed.includes(tag)) {
        const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(?:^|,\\s*)${escaped}(?=\\s*(?:,|$))`);
        const next = trimmed
          .replace(pattern, '')
          .replace(/^\s*,\s*|\s*,\s*$/g, '')
          .trim();
        if (next !== trimmed) return next;

        return trimmed
          .replace(tag, '')
          .replace(/,\s*,+/g, ',')
          .replace(/^\s*,\s*|\s*,\s*$/g, '')
          .trim();
      }

      return `${trimmed}, ${tag}`;
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
    // 1. Bắt buộc quét mã QR thẻ CCCD nếu chưa được duyệt chính thức
    if (!isVerified) {
      if (!isCccdQrVerified || !idNumber.trim() || idNumber.trim().length !== 12) {
        Alert.alert(
          'Bắt buộc quét mã thẻ CCCD',
          'Để đảm bảo tính định danh chính chủ và an toàn cho Đội cứu hộ, bạn bắt buộc phải quét mã QR trên thẻ CCCD gắn chip.',
          [
            { text: 'Quét mã thẻ ngay', onPress: () => setIsQrScannerOpen(true) },
            { text: 'Đóng', style: 'cancel' },
          ]
        );
        return;
      }
    } else {
      if (!idNumber.trim() || idNumber.trim().length !== 12) {
        Alert.alert('CCCD chưa hợp lệ', 'Số Căn cước công dân (CCCD) phải bao gồm đúng 12 chữ số.');
        return;
      }
    }

    // 2. Bắt buộc chọn địa bàn tác chiến
    if (!selectedAreaName && !selectedAreaId) {
      Alert.alert(
        'Thiếu thông tin địa bàn',
        'Vui lòng chọn Địa bàn / Phường, Xã bạn sẵn sàng cơ động tác chiến cứu hộ.',
        [
          { text: 'Chọn địa bàn ngay', onPress: handleOpenAreaSheet },
          { text: 'Đóng', style: 'cancel' },
        ]
      );
      return;
    }

    // 3. Bắt buộc chọn ít nhất 1 kỹ năng cứu hộ chuyên môn
    if (selectedSkills.length === 0) {
      Alert.alert(
        'Thiếu kỹ năng chuyên môn',
        'Vui lòng chọn ít nhất 1 kỹ năng cứu hộ chuyên môn để Ban Chỉ huy phân loại lực lượng.',
        [
          { text: 'Chọn kỹ năng', onPress: () => setIsSkillSheetOpen(true) },
          { text: 'Đóng', style: 'cancel' },
        ]
      );
      return;
    }

    // 4. Bắt buộc nhập kinh nghiệm / chứng chỉ
    if (!experience.trim()) {
      Alert.alert(
        'Thiếu thông tin kinh nghiệm',
        'Vui lòng nhập tóm tắt kinh nghiệm cứu nạn hoặc chạm vào các gợi ý nhanh bên dưới ô nhập.',
        [{ text: 'Đã hiểu', style: 'default' }]
      );
      return;
    }

    // 5. Bắt buộc cam kết tự nguyện
    if (!agreeTerms) {
      Alert.alert(
        'Xác nhận cam kết tự nguyện',
        'Bạn cần xác nhận cam kết tự nguyện tham gia và chấp hành điều phối của Ban Chỉ huy PCTT & TKCN trước khi gửi đơn.',
        [
          { text: 'Tôi đồng ý & Cam kết', onPress: () => setAgreeTerms(true) },
          { text: 'Xem lại', style: 'cancel' },
        ]
      );
      return;
    }

    try {
      setIsSaving(true);
      const isValidObjectId = (id?: string) => Boolean(id && /^[0-9a-fA-F]{24}$/.test(id));
      const res = await backendApi.updateRescuerProfile({
        idNumber: idNumber.trim(),
        isCccdVerified: isCccdQrVerified,
        skills: selectedSkills,
        experience: experience.trim(),
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

          {/* 3. Thông tin tài khoản liên kết */}
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
              <Text style={styles.applicantName} numberOfLines={1}>
                {user?.fullName || 'Người dân'}
              </Text>
              <Text style={styles.applicantContact} numberOfLines={1}>
                {user?.phone || 'Chưa cập nhật SĐT'} {user?.email ? `• ${user.email}` : ''}
              </Text>
            </View>
            <View style={styles.applicantBadge}>
              <Text style={styles.applicantBadgeText}>Tài khoản liên kết</Text>
            </View>
          </View>

          {/* 4. KHỐI GỘP: HỒ SƠ TÁC CHIẾN (iOS Inset Grouped Style) */}
          <Text style={styles.insetSectionTitle}>HỒ SƠ TÁC CHIẾN</Text>
          <View style={styles.insetGroupCard}>
            {/* Row 1: Số CCCD */}
            <TouchableOpacity
              style={[styles.insetRow, styles.insetRowDivider]}
              onPress={() => setIsQrScannerOpen(true)}
              activeOpacity={0.7}
              disabled={isVerified}
            >
              <Text style={styles.insetRowLabel}>
                Số CCCD <Text style={styles.requiredStar}>*</Text>
              </Text>
              <View style={styles.insetRowRight}>
                {isVerified ? (
                  <>
                    <Text style={styles.insetRowValue} numberOfLines={1}>
                      {idNumber ? `${idNumber.slice(0, 4)}********${idNumber.slice(-2)}` : '0792********01'}
                    </Text>
                    <Feather name="check-circle" size={14} color="#059669" />
                    <Text style={styles.insetRowVerifiedText}>Đã xác thực</Text>
                  </>
                ) : isCccdQrVerified && idNumber ? (
                  <>
                    <Feather name="check-circle" size={14} color="#059669" />
                    <Text style={styles.insetRowValue} numberOfLines={1}>
                      {idNumber}
                    </Text>
                    <Feather name="chevron-right" size={16} color="#94A3B8" />
                  </>
                ) : (
                  <>
                    <MaterialCommunityIcons name="qrcode-scan" size={15} color="#0066FF" />
                    <Text style={styles.insetRowActionText}>Quét mã thẻ</Text>
                    <Feather name="chevron-right" size={16} color="#94A3B8" />
                  </>
                )}
              </View>
            </TouchableOpacity>

            {/* Row 2: Địa bàn tác chiến */}
            <TouchableOpacity
              style={[styles.insetRow, styles.insetRowDivider]}
              onPress={handleOpenAreaSheet}
              activeOpacity={0.7}
              disabled={isVerified}
            >
              <Text style={styles.insetRowLabel}>
                Địa bàn <Text style={styles.requiredStar}>*</Text>
              </Text>
              <View style={styles.insetRowRight}>
                {selectedAreaName ? (
                  <Text style={styles.insetRowValue} numberOfLines={1}>
                    {selectedAreaName}
                  </Text>
                ) : (
                  <Text style={styles.insetRowPlaceholder} numberOfLines={1}>
                    Chọn Tỉnh / Xã
                  </Text>
                )}
                {!isVerified && <Feather name="chevron-right" size={16} color="#94A3B8" />}
              </View>
            </TouchableOpacity>

            {/* Row 3: Kỹ năng cứu hộ */}
            <TouchableOpacity
              style={styles.insetRow}
              onPress={() => !isVerified && setIsSkillSheetOpen(true)}
              activeOpacity={0.7}
              disabled={isVerified}
            >
              <Text style={styles.insetRowLabel}>
                Kỹ năng <Text style={styles.requiredStar}>*</Text>
              </Text>
              <View style={styles.insetRowRight}>
                {selectedSkills.length > 0 ? (
                  <Text style={styles.insetRowValue} numberOfLines={1}>
                    {selectedSkills
                      .map((id) => RESCUE_SKILLS.find((s) => s.id === id)?.label || id)
                      .join(', ')}
                  </Text>
                ) : (
                  <Text style={styles.insetRowPlaceholder} numberOfLines={1}>
                    Chọn kỹ năng
                  </Text>
                )}
                {!isVerified && <Feather name="chevron-right" size={16} color="#94A3B8" />}
              </View>
            </TouchableOpacity>
          </View>

          {/* 5. KINH NGHIỆM & CHỨNG CHỈ */}
          <Text style={styles.insetSectionTitle}>
            KINH NGHIỆM & CHỨNG CHỈ <Text style={styles.requiredStar}>*</Text>
          </Text>
          <View style={styles.insetGroupCard}>
            <TextInput
              style={styles.insetTextArea}
              value={experience}
              onChangeText={setExperience}
              multiline
              numberOfLines={3}
              placeholder="VD: Tham gia đội xung kích xã 2 năm, chứng chỉ sơ cấp cứu... (hoặc chọn nhanh bên dưới)"
              placeholderTextColor="#94A3B8"
              textAlignVertical="top"
              editable={!isVerified}
            />

            {!isVerified && (
              <View style={styles.quickTagsSection}>
                <Text style={styles.quickTagsTitle}>Gợi ý nhanh (chạm để chọn / bỏ chọn)</Text>
                <View style={styles.quickTagsGrid}>
                  {QUICK_EXPERIENCE_TAGS.map((item, idx) => {
                    const isSelected = experience.includes(item.text);
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.quickTagBtn, isSelected && styles.quickTagBtnActive]}
                        onPress={() => handleToggleExperienceTag(item.text)}
                        activeOpacity={0.7}
                      >
                        <Feather
                          name={isSelected ? 'check' : 'plus'}
                          size={12}
                          color={isSelected ? '#0066FF' : '#64748B'}
                        />
                        <Text
                          style={[
                            styles.quickTagBtnText,
                            isSelected && styles.quickTagBtnTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          {/* 6. CAM KẾT TỰ NGUYỆN */}
          <View style={styles.pledgeGroupCard}>
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
                hộ và sẵn sàng chấp hành lệnh điều phối của Ban Chỉ huy PCTT & TKCN địa phương. <Text style={styles.requiredStar}>*</Text>
              </Text>
            </TouchableOpacity>
          </View>
    </ScrollView>
      </KeyboardAvoidingView >

  {/* 9. Nút Lưu / Nộp đơn ghim cố định ở đáy (Sticky Bottom Action Bar) */ }
  < View style = { [styles.stickyBottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]} >
    <TouchableOpacity
      style={[
        styles.submitButton,
        isSaving && { opacity: 0.75 },
        isVerified && styles.submitButtonVerified,
      ]}
      onPress={handleSave}
      disabled={isSaving || isVerified}
      activeOpacity={0.85}
    >
      <LinearGradient
        colors={
          isVerified
            ? ['#059669', '#047857']
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
      </View >

  {/* 10. Modal phản hồi gửi thành công */ }
  < Modal visible = { showSuccessModal } transparent animationType = "fade" >
    <View style={styles.modalOverlay}>
      <View style={styles.feedbackCard}>
        <View style={styles.feedbackIconBox}>
          <MaterialCommunityIcons name="check-decagram" size={36} color="#059669" />
        </View>
        <Text style={styles.feedbackTitle}>Gửi hồ sơ thành công!</Text>
        <Text style={styles.feedbackDesc}>
          Thông tin CCCD, địa bàn, kỹ năng và kinh nghiệm của bạn đã được chuyển tới Ban Chỉ huy
          địa phương để thẩm định và cấp quyền tác chiến.
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
            <Text style={[styles.summaryValue, { color: '#0066FF', maxWidth: '58%' }]} numberOfLines={1}>
              {selectedAreaName || 'Theo hồ sơ cư trú'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Kỹ năng tác chiến:</Text>
            <Text style={styles.summaryValue}>{selectedSkills.length} kỹ năng</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Kinh nghiệm:</Text>
            <Text style={[styles.summaryValue, { maxWidth: '58%' }]} numberOfLines={1}>
              {experience.trim()}
            </Text>
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
      </Modal >

  {/* 11. Modal Popup nổi ở dưới màn hình (Bottom Sheet) chọn Tỉnh thành & Phường xã */ }
  < Modal
visible = { isAreaSheetOpen }
transparent
animationType = "slide"
onRequestClose = {() => setIsAreaSheetOpen(false)}
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
                          styles.radioDot,
                          isSelected && styles.radioDotActive,
                        ]}
                      >
                        {isSelected && <View style={styles.radioInner} />}
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
      </Modal >

  {/* 12. Modal Popup nổi ở dưới màn hình (Bottom Sheet) chọn Kỹ năng chuyên môn */}
  < Modal
visible = { isSkillSheetOpen }
transparent
animationType = "slide"
onRequestClose = {() => setIsSkillSheetOpen(false)}
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
      </Modal >

  {/* 13. Modal Quét mã QR thẻ CCCD gắn chip */ }
  < CccdQrScannerModal
visible = { isQrScannerOpen }
onClose = {() => setIsQrScannerOpen(false)}
onSuccess = { handleScanCccdSuccess }
userFullName = { userData?.fullName || user?.fullName}
      />
    </SafeAreaView >
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F2F4F7',
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
    backgroundColor: '#F2F4F7',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  scrollContent: {
    padding: 16,
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
    marginBottom: 16,
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
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applicantAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  applicantInfo: {
    flex: 1,
  },
  applicantName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  applicantBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
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
    marginTop: 2,
  },

  // INSET GROUPED FORM (Apple iOS / VNeID Minimalist Style)
  insetSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.5,
    marginLeft: 12,
    marginBottom: 6,
    marginTop: 4,
  },
  insetGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
  },
  insetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 50,
    gap: 12,
  },
  insetRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  insetRowLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
    flexShrink: 0,
  },
  insetRowRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  insetRowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    flexShrink: 1,
    textAlign: 'right',
  },
  insetRowPlaceholder: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94A3B8',
    flexShrink: 1,
    textAlign: 'right',
  },
  insetRowActionText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0066FF',
    flexShrink: 0,
  },
  insetRowVerifiedText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#059669',
    flexShrink: 0,
  },
  cardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requiredStar: {
    color: '#DC2626',
    fontWeight: '700',
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

  // BOTTOM SHEET POPUP COMMON STYLES
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
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  radioDotActive: {
    borderColor: '#0066FF',
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#0066FF',
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
  insetTextArea: {
    minHeight: 82,
    fontSize: 13.5,
    color: '#0F172A',
    lineHeight: 19,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  quickTagsSection: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quickTagsTitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginBottom: 6,
  },
  quickTagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  quickTagBtn: {
    width: '48.8%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickTagBtnActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  quickTagBtnText: {
    flex: 1,
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '500',
  },
  quickTagBtnTextActive: {
    color: '#0066FF',
    fontWeight: '600',
  },

  // Pledge Group
  pledgeGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
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

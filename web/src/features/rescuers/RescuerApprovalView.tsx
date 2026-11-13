import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  RefreshCw,
  Eye,
  MapPin,
  Phone,
  Mail,
  FileCheck,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ZoomIn,
  Compass,
  FilterX,
} from 'lucide-react';
import type { User } from '@/types/auth';
import { fetchAdminUsers, verifyRescuer, fetchAdministrativeAreas } from '@/api';
import { domainDService } from '@/services/domainDService';
import { useAdministrativeFilter } from '@/hooks/useAdministrativeFilter';
import { toast } from '@/components/common/toast';
import { onRescuerApplicationSubmitted, onRescuerVerificationChanged } from '@/services/socketService';
import './RescuerApprovalView.css';

export interface RescuerApprovalViewProps {
  user?: User;
}

export type ApplicationStatus =
  | 'PENDING'          // Chờ duyệt
  | 'IN_REVIEW'        // Đang thẩm định
  | 'REQUIRES_UPDATE'  // Yêu cầu bổ sung
  | 'VERIFIED'         // Đã duyệt
  | 'REJECTED';        // Từ chối

export interface ApplicationHistoryItem {
  timestamp: string;
  action: string;
  actor: string;
  detail?: string;
  type?: 'submit' | 'review' | 'update' | 'verified' | 'rejected';
}

export interface RescuerApplicant {
  id: string;
  fullName: string;
  avatarUrl?: string;
  phone: string;
  email: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  // Địa bàn đăng ký
  areaId?: string;
  areaName: string;
  communeName: string;
  districtName: string;
  provinceName: string;
  // Định danh
  idNumber: string;
  idCardFrontUrl?: string;
  idCardBackUrl?: string;
  hasCccdPhotos: boolean;
  isCccdVerified?: boolean;
  // Năng lực cứu hộ
  skills: string[];
  experience: string;
  specialization:
    | 'FLOOD_RESCUE'
    | 'SEARCH_RESCUE'
    | 'MEDICAL_RESCUE'
    | 'FIRE_RESCUE'
    | 'EVACUATION'
    | 'COMMUNICATION'
    | 'LOGISTICS'
    | 'VEHICLE_OP'
    | 'OTHER';
  certificates: string[];
  equipment: string[];
  vehicleType?: string;
  // Trạng thái xử lý
  status: ApplicationStatus;
  submittedAt: string;
  reviewerName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  rejectionReason?: string;
  supplementaryRequest?: string;
  history: ApplicationHistoryItem[];
}

// Danh mục nhãn kỹ năng chuẩn hóa tiếng Việt đồng bộ với ứng dụng di động
const SKILL_LABELS: Record<string, string> = {
  first_aid: 'Sơ cứu y tế',
  water_rescue: 'Cứu hộ vùng nước',
  search_rescue: 'Tìm kiếm cứu nạn',
  boat_driver: 'Lái xuồng cứu sinh',
  rope_climb: 'Leo dây & Độ cao',
  diving: 'Lặn cứu hộ',
  firefighting: 'PCCC & Cứu sập',
  evacuation: 'Sơ tán người dân',
  communication: 'Thông tin liên lạc',
  logistics: 'Hậu cần & Cấp dưỡng',
  // Tương thích ngược
  relief_logistics: 'Tiếp tế lương thực',
  vehicle_op: 'Lái xe tải gầm cao',
};

const getApplicantInitials = (fullName?: string): string => {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (fullName || 'CH').slice(0, 2).toUpperCase();
};

export const RescuerApprovalView: React.FC<RescuerApprovalViewProps> = ({ user }) => {
  // 1. Phân quyền và Địa bàn Local Authority vs Admin
  const activeOfficer = domainDService.getActiveOfficer();

  const isAdmin = Boolean(
    user?.roles?.includes('ADMIN') ||
    (user as any)?.role === 'ADMIN'
  );

  const userAreaId =
    user?.authority?.areaId ||
    (user?.authority as any)?.administrativeAreaId ||
    (user?.authority as any)?.jurisdictionAreaId ||
    activeOfficer?.jurisdictionAreaId;

  const userAreaName =
    user?.authority?.areaName ||
    (user?.authority as any)?.jurisdictionAreaName ||
    activeOfficer?.jurisdictionAreaName ||
    '';

  // Tên đơn vị hành chính xã/phường phụ trách
  const localCommuneName = useMemo(() => {
    return (userAreaName || '').split(',')[0].trim();
  }, [userAreaName]);

  const cleanLocalCommune = useMemo(() => {
    if (isAdmin) return '';
    return localCommuneName.replace(/^(phường|xã|thị trấn|quận|huyện)\s+/i, '').trim().toLowerCase();
  }, [isAdmin, localCommuneName]);

  // 2. States dữ liệu
  const [applicants, setApplicants] = useState<RescuerApplicant[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshSpin, setRefreshSpin] = useState(false);
  // Hook bộ lọc hành chính toàn quốc từ API
  const {
    provinces,
    provincesLoading,
    selectedProvince,
    setSelectedProvince,
    wards,
    wardsLoading,
    selectedAreaId: areaFilter,
    setSelectedAreaId: setAreaFilter,
    isApplicantInTargetArea,
  } = useAdministrativeFilter({
    isAdmin,
    userAreaId,
    userAreaName,
  });

  // 3. States bộ lọc
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [specFilter, setSpecFilter] = useState<string>('ALL');

  const hasActiveFilters = Boolean(
    (isAdmin && (selectedProvince !== 'ALL' || areaFilter !== 'ALL')) ||
    (!isAdmin && areaFilter !== 'ALL') ||
    statusFilter !== 'ALL' ||
    specFilter !== 'ALL' ||
    searchQuery.trim() !== ''
  );

  const handleClearFilters = useCallback(() => {
    if (isAdmin) {
      setSelectedProvince('ALL');
    }
    setAreaFilter('ALL');
    setStatusFilter('ALL');
    setSpecFilter('ALL');
    setSearchQuery('');
    setCurrentPage(1);
  }, [isAdmin, setSelectedProvince, setAreaFilter]);

  // 4. Phân trang
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // 5. Drawer & Modals
  const [selectedApplicant, setSelectedApplicant] = useState<RescuerApplicant | null>(null);
  const [isDrawerClosing, setIsDrawerClosing] = useState(false);

  // Modals hành động
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReasonText, setRejectionReasonText] = useState('');
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [revokeReasonText, setRevokeReasonText] = useState('');
  const [isSupplementModalOpen, setIsSupplementModalOpen] = useState(false);
  const [supplementaryText, setSupplementaryText] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Modal xem ảnh CCCD phóng to
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string } | null>(null);

  // Mở drawer chi tiết
  const handleOpenDetail = (app: RescuerApplicant) => {
    setIsDrawerClosing(false);
    setSelectedApplicant(app);
  };

  // Đóng drawer
  const handleCloseDetail = useCallback(() => {
    if (isDrawerClosing) return;
    setIsDrawerClosing(true);
    setTimeout(() => {
      setSelectedApplicant(null);
      setIsDrawerClosing(false);
    }, 200);
  }, [isDrawerClosing]);

  // Phím Esc để đóng drawer & modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoomedImage) {
          setZoomedImage(null);
        } else if (isApproveModalOpen) {
          setIsApproveModalOpen(false);
        } else if (isRevokeModalOpen) {
          setIsRevokeModalOpen(false);
        } else if (isRejectModalOpen) {
          setIsRejectModalOpen(false);
        } else if (isSupplementModalOpen) {
          setIsSupplementModalOpen(false);
        } else if (selectedApplicant && !isDrawerClosing) {
          handleCloseDetail();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    zoomedImage,
    isApproveModalOpen,
    isRejectModalOpen,
    isSupplementModalOpen,
    selectedApplicant,
    isDrawerClosing,
    handleCloseDetail,
  ]);

  // Nạp dữ liệu từ backend và đồng bộ với danh sách mẫu
  const loadApplicants = useCallback(async () => {
    try {
      setLoading(true);
      const [usersRes] = await Promise.allSettled([
        fetchAdminUsers({ role: 'RESCUER', limit: '100' }),
        fetchAdministrativeAreas(),
      ]);

      // Dữ liệu khu vực hành chính được quản lý tập trung qua useAdministrativeFilter

      let dbUsers: any[] = [];
      if (usersRes.status === 'fulfilled') {
        const val: any = usersRes.value;
        if (Array.isArray(val)) {
          dbUsers = val;
        } else if (Array.isArray(val?.data?.users)) {
          dbUsers = val.data.users;
        } else if (Array.isArray(val?.data)) {
          dbUsers = val.data;
        } else if (Array.isArray(val?.users)) {
          dbUsers = val.users;
        }
      } else {
        console.error('Lỗi khi fetchAdminUsers:', (usersRes as any).reason);
      }

      if (dbUsers.length > 0) {
        // Chuẩn hóa người dùng từ DB sang định dạng RescuerApplicant
        const transformed: RescuerApplicant[] = dbUsers.map((u: any, idx: number) => {
          const rawStatus = u.rescuer?.verificationStatus || u.verificationStatus || 'PENDING';
          let appStatus: ApplicationStatus = 'PENDING';
          if (rawStatus === 'VERIFIED') appStatus = 'VERIFIED';
          else if (rawStatus === 'REJECTED') appStatus = 'REJECTED';
          else if (rawStatus === 'IN_REVIEW') appStatus = 'IN_REVIEW';
          else if (rawStatus === 'REQUIRES_UPDATE') appStatus = 'REQUIRES_UPDATE';

          const skillsList = Array.isArray(u.rescuer?.skills)
            ? u.rescuer.skills
            : Array.isArray(u.skills)
              ? u.skills
              : [];

          let spec: RescuerApplicant['specialization'] = 'OTHER';
          const skillsJoined = skillsList.join(' ').toLowerCase();
          if (skillsJoined.includes('water') || skillsJoined.includes('boat') || skillsJoined.includes('flood')) {
            spec = 'FLOOD_RESCUE';
          } else if (skillsJoined.includes('search') || skillsJoined.includes('diving')) {
            spec = 'SEARCH_RESCUE';
          } else if (skillsJoined.includes('first_aid') || skillsJoined.includes('y tế')) {
            spec = 'MEDICAL_RESCUE';
          } else if (skillsJoined.includes('fire') || skillsJoined.includes('pccc')) {
            spec = 'FIRE_RESCUE';
          } else if (skillsJoined.includes('evacuation')) {
            spec = 'EVACUATION';
          } else if (skillsJoined.includes('communication')) {
            spec = 'COMMUNICATION';
          } else if (skillsJoined.includes('logistics')) {
            spec = 'LOGISTICS';
          } else if (skillsJoined.includes('truck') || skillsJoined.includes('vehicle')) {
            spec = 'VEHICLE_OP';
          }

          const cccdFront = u.rescuer?.idCardFrontUrl || u.idCardFrontUrl || '';
          const cccdBack = u.rescuer?.idCardBackUrl || u.idCardBackUrl || '';

          const resolvedAreaName = u.rescuer?.areaName || u.areaName || (typeof u.address === 'string' ? u.address : '') || userAreaName || '';
          const resolvedCommune = u.rescuer?.communeName || (resolvedAreaName ? resolvedAreaName.split(',')[0]?.trim() : '');

          return {
            id: u._id || u.id || `db-app-${idx}`,
            fullName: u.fullName || u.name || '',
            avatarUrl: u.avatarUrl || '',
            phone: u.phone || '',
            email: u.email || '',
            dateOfBirth: u.dateOfBirth ? new Date(u.dateOfBirth).toLocaleDateString('vi-VN') : '',
            gender: u.gender === 'FEMALE' ? 'Nữ' : (u.gender === 'MALE' ? 'Nam' : ''),
            address: u.address || u.rescuer?.address || '',
            areaId: u.rescuer?.areaId || u.areaId || '',
            areaName: resolvedAreaName,
            communeName: resolvedCommune,
            districtName: (typeof u.rescuer?.districtName === 'string' ? u.rescuer.districtName : '') || (resolvedAreaName.includes('Cẩm Lệ') ? 'Quận Cẩm Lệ' : (resolvedAreaName.includes('Hòa Vang') ? 'Huyện Hòa Vang' : '')),
            provinceName: (typeof u.rescuer?.provinceName === 'string' ? u.rescuer.provinceName : '') || (resolvedAreaName.includes('Đà Nẵng') ? 'Thành phố Đà Nẵng' : ''),
            idNumber: u.rescuer?.idNumber || u.idNumber || '',
            idCardFrontUrl: cccdFront,
            idCardBackUrl: cccdBack,
            hasCccdPhotos: Boolean(cccdFront || cccdBack),
            isCccdVerified: Boolean(u.rescuer?.isCccdVerified || u.isCccdVerified),
            skills: skillsList,
            experience: u.rescuer?.experience || u.experience || '',
            specialization: spec,
            certificates: Array.isArray(u.rescuer?.certificates) ? u.rescuer.certificates : [],
            equipment: Array.isArray(u.rescuer?.equipment) ? u.rescuer.equipment : [],
            vehicleType: u.rescuer?.vehicleType || undefined,
            status: appStatus,
            submittedAt: u.createdAt || new Date().toISOString(),
            reviewerName: u.rescuer?.reviewerName || (appStatus === 'VERIFIED' ? 'Ban Chỉ Huy PCTT' : undefined),
            reviewedAt: u.rescuer?.reviewedAt || undefined,
            reviewNotes: u.rescuer?.notes || undefined,
            rejectionReason: u.rescuer?.rejectionReason || undefined,
            history: [
              {
                timestamp: new Date(u.createdAt || Date.now()).toLocaleString('vi-VN'),
                action: 'Nộp hồ sơ trực tuyến',
                actor: u.fullName || 'Ứng viên',
                type: 'submit',
              },
            ],
          };
        });

        // 100% dữ liệu thật từ DB, không mock, không fallback
        setApplicants(transformed);
      } else {
        setApplicants([]);
      }
    } catch (e) {
      console.warn('Lỗi tải danh sách hồ sơ cứu hộ:', e);
      setApplicants([]);
    } finally {
      setLoading(false);
    }
  }, [userAreaName]);

  useEffect(() => {
    loadApplicants();
  }, [loadApplicants]);

  // Realtime Socket.IO: Lắng nghe đơn đăng ký mới & thay đổi trạng thái duyệt
  useEffect(() => {
    const unsubApp = onRescuerApplicationSubmitted((newApplicant) => {
      if (newApplicant?._id) {
        toast.info(`Có hồ sơ đăng ký cứu hộ mới: ${newApplicant.fullName || 'Công dân'}`, 'Đăng ký mới');
        loadApplicants();
      }
    });

    const unsubVer = onRescuerVerificationChanged((data) => {
      if (data?.userId) {
        loadApplicants();
      }
    });

    return () => {
      unsubApp();
      unsubVer();
    };
  }, [loadApplicants]);

  const handleRefresh = async () => {
    setRefreshSpin(true);
    await loadApplicants();
    setTimeout(() => setRefreshSpin(false), 500);
    toast.success('Đã làm mới danh sách hồ sơ cứu hộ');
  };

  // 6. Danh sách hồ sơ được phân quyền hiển thị theo Actor:
  // - Nếu là cán bộ Local Authority (!isAdmin): CHỈ hiển thị hồ sơ thuộc địa phương quản lý
  // - Nếu là Admin (isAdmin): Giữ nguyên xem toàn bộ hồ sơ trên toàn hệ thống
  const authorizedApplicants = useMemo(() => {
    if (isAdmin) return applicants;

    const targetAreaId = userAreaId ? String(userAreaId) : '';
    const targetCommune = (localCommuneName || userAreaName || '')
      .toLowerCase()
      .replace(/^(phường|xã|thị trấn|quận|huyện)\s+/i, '')
      .trim();

    if (!targetAreaId && !targetCommune) return applicants;

    const normalizeStr = (s: string) =>
      s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const normTarget = normalizeStr(targetCommune);

    return applicants.filter((app) => {
      // 1. Khớp theo ID địa bàn
      if (targetAreaId && app.areaId && String(app.areaId) === targetAreaId) {
        return true;
      }

      // 2. Khớp theo tên xã/phường phụ trách (hỗ trợ cả có dấu và không dấu Unicode)
      const appLocation = `${app.communeName || ''} ${app.areaName || ''} ${app.address || ''}`.toLowerCase();
      if (cleanLocalCommune && appLocation.includes(cleanLocalCommune)) {
        return true;
      }

      if (targetCommune && appLocation.includes(targetCommune)) {
        return true;
      }

      if (normTarget) {
        const normApp = normalizeStr(appLocation);
        if (normApp.includes(normTarget)) return true;
      }

      return false;
    });
  }, [applicants, isAdmin, cleanLocalCommune, localCommuneName, userAreaName, userAreaId]);

  // Thống kê KPI trên danh sách hồ sơ được phân quyền
  const stats = useMemo(() => {
    const total = authorizedApplicants.length;
    const pending = authorizedApplicants.filter((a) => a.status === 'PENDING' || a.status === 'IN_REVIEW').length;
    const verified = authorizedApplicants.filter((a) => a.status === 'VERIFIED').length;
    const requiresUpdate = authorizedApplicants.filter((a) => a.status === 'REQUIRES_UPDATE').length;
    const rejected = authorizedApplicants.filter((a) => a.status === 'REJECTED').length;

    return { total, pending, verified, requiresUpdate, rejected };
  }, [authorizedApplicants]);

  // 7. Lọc & Tìm kiếm danh sách từ authorizedApplicants
  const filteredApplicants = useMemo(() => {
    return authorizedApplicants
      .filter((app) => {
        // Tìm kiếm
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = (app.fullName || '').toLowerCase().includes(q);
          const matchPhone = (app.phone || '').includes(q);
          const matchCccd = (app.idNumber || '').toLowerCase().includes(q);
          const matchEmail = (app.email || '').toLowerCase().includes(q);
          if (!matchName && !matchPhone && !matchCccd && !matchEmail) return false;
        }

        // Bộ lọc trạng thái
        if (statusFilter !== 'ALL') {
          if (statusFilter === 'PENDING') {
            if (app.status !== 'PENDING') return false;
          } else if (statusFilter === 'IN_REVIEW') {
            if (app.status !== 'IN_REVIEW') return false;
          } else if (statusFilter === 'REQUIRES_UPDATE') {
            if (app.status !== 'REQUIRES_UPDATE') return false;
          } else if (statusFilter === 'VERIFIED') {
            if (app.status !== 'VERIFIED') return false;
          } else if (statusFilter === 'REJECTED') {
            if (app.status !== 'REJECTED') return false;
          }
        }

        // Bộ lọc chuyên môn
        if (specFilter !== 'ALL' && app.specialization !== specFilter) {
          return false;
        }

        // Bộ lọc địa bàn (hỗ trợ phân cấp Tỉnh/TP -> Xã/Phường từ API)
        if (!isApplicantInTargetArea(app)) return false;

        return true;
      })
      .sort((a, b) => {
        // Ưu tiên hồ sơ CHỜ DUYỆT & ĐANG THẨM ĐỊNH lên đầu
        const priorityOrder: Record<ApplicationStatus, number> = {
          PENDING: 1,
          IN_REVIEW: 2,
          REQUIRES_UPDATE: 3,
          VERIFIED: 4,
          REJECTED: 5,
        };
        const pA = priorityOrder[a.status] || 9;
        const pB = priorityOrder[b.status] || 9;
        if (pA !== pB) return pA - pB;

        // Nếu cùng trạng thái, hồ sơ mới gửi hoặc chờ lâu sắp xếp theo thời gian
        return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      });
  }, [authorizedApplicants, searchQuery, statusFilter, specFilter, isApplicantInTargetArea]);

  // Phân trang
  const totalPages = Math.ceil(filteredApplicants.length / pageSize) || 1;
  const paginatedApplicants = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredApplicants.slice(start, start + pageSize);
  }, [filteredApplicants, currentPage, pageSize]);

  // 8. Xử lý nghiệp vụ: Phê duyệt hồ sơ
  const handleConfirmApproval = async () => {
    if (!selectedApplicant) return;
    try {
      setSubmittingAction(true);
      await verifyRescuer(selectedApplicant.id, 'VERIFIED');

      const updatedHistory: ApplicationHistoryItem = {
        timestamp: new Date().toLocaleString('vi-VN'),
        action: 'Phê duyệt tư cách Cứu hộ viên',
        actor: user?.fullName || 'Cán bộ Ban Chỉ huy địa phương',
        detail: 'Đã xác nhận tư cách Cứu hộ viên hợp lệ trên hệ thống SOS SYSTEMS',
        type: 'verified',
      };

      setApplicants((prev) =>
        prev.map((a) =>
          a.id === selectedApplicant.id
            ? {
              ...a,
              status: 'VERIFIED',
              reviewedAt: new Date().toLocaleString('vi-VN'),
              reviewerName: user?.fullName || 'Cán bộ Ban Chỉ huy địa phương',
              history: [updatedHistory, ...a.history],
            }
            : a
        )
      );

      if (selectedApplicant) {
        setSelectedApplicant((prev) =>
          prev
            ? {
              ...prev,
              status: 'VERIFIED',
              reviewedAt: new Date().toLocaleString('vi-VN'),
              reviewerName: user?.fullName || 'Cán bộ Ban Chỉ huy địa phương',
              history: [updatedHistory, ...prev.history],
            }
            : null
        );
      }

      setIsApproveModalOpen(false);
      toast.success(
        `Đã phê duyệt tư cách Cứu hộ viên cho ${selectedApplicant.fullName}!`,
        'Phê duyệt thành công'
      );
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi phê duyệt hồ sơ', 'Lỗi thao tác');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Xử lý nghiệp vụ: Yêu cầu bổ sung thông tin
  const handleConfirmSupplement = async () => {
    if (!selectedApplicant || !supplementaryText.trim()) {
      toast.error('Vui lòng nhập nội dung thông tin hoặc giấy tờ cần bổ sung');
      return;
    }
    try {
      setSubmittingAction(true);

      const updatedHistory: ApplicationHistoryItem = {
        timestamp: new Date().toLocaleString('vi-VN'),
        action: 'Yêu cầu bổ sung thông tin',
        actor: user?.fullName || 'Cán bộ Local Authority',
        detail: supplementaryText.trim(),
        type: 'update',
      };

      setApplicants((prev) =>
        prev.map((a) =>
          a.id === selectedApplicant.id
            ? {
              ...a,
              status: 'REQUIRES_UPDATE',
              supplementaryRequest: supplementaryText.trim(),
              reviewerName: user?.fullName || 'Cán bộ Local Authority',
              history: [updatedHistory, ...a.history],
            }
            : a
        )
      );

      if (selectedApplicant) {
        setSelectedApplicant((prev) =>
          prev
            ? {
              ...prev,
              status: 'REQUIRES_UPDATE',
              supplementaryRequest: supplementaryText.trim(),
              reviewerName: user?.fullName || 'Cán bộ Local Authority',
              history: [updatedHistory, ...prev.history],
            }
            : null
        );
      }

      setIsSupplementModalOpen(false);
      setSupplementaryText('');
      toast.info(
        `Đã gửi yêu cầu bổ sung hồ sơ tới ứng viên ${selectedApplicant.fullName}`,
        'Đã ghi nhận yêu cầu'
      );
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } finally {
      setSubmittingAction(false);
    }
  };

  // Xử lý nghiệp vụ: Từ chối hồ sơ
  const handleConfirmRejection = async () => {
    if (!selectedApplicant || !rejectionReasonText.trim()) {
      toast.error('Vui lòng nhập lý do từ chối hồ sơ');
      return;
    }
    try {
      setSubmittingAction(true);
      await verifyRescuer(selectedApplicant.id, 'REJECTED', rejectionReasonText.trim());

      const updatedHistory: ApplicationHistoryItem = {
        timestamp: new Date().toLocaleString('vi-VN'),
        action: 'Từ chối hồ sơ đăng ký',
        actor: user?.fullName || 'Cán bộ Ban Chỉ huy địa phương',
        detail: rejectionReasonText.trim(),
        type: 'rejected',
      };

      setApplicants((prev) =>
        prev.map((a) =>
          a.id === selectedApplicant.id
            ? {
              ...a,
              status: 'REJECTED',
              rejectionReason: rejectionReasonText.trim(),
              reviewedAt: new Date().toLocaleString('vi-VN'),
              reviewerName: user?.fullName || 'Cán bộ Ban Chỉ huy địa phương',
              history: [updatedHistory, ...a.history],
            }
            : a
        )
      );

      if (selectedApplicant) {
        setSelectedApplicant((prev) =>
          prev
            ? {
              ...prev,
              status: 'REJECTED',
              rejectionReason: rejectionReasonText.trim(),
              reviewedAt: new Date().toLocaleString('vi-VN'),
              reviewerName: user?.fullName || 'Cán bộ Ban Chỉ huy địa phương',
              history: [updatedHistory, ...prev.history],
            }
            : null
        );
      }

      setIsRejectModalOpen(false);
      setRejectionReasonText('');
      toast.warning(
        `Đã từ chối hồ sơ của ${selectedApplicant.fullName}`,
        'Từ chối hồ sơ'
      );
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi từ chối hồ sơ', 'Lỗi thao tác');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Xử lý nghiệp vụ: Thu hồi tư cách Cứu hộ viên
  const handleConfirmRevoke = async () => {
    if (!selectedApplicant || !revokeReasonText.trim()) {
      toast.error('Vui lòng nhập lý do thu hồi quyền cứu hộ');
      return;
    }
    try {
      setSubmittingAction(true);
      await verifyRescuer(selectedApplicant.id, 'REJECTED', revokeReasonText.trim());

      const updatedHistory: ApplicationHistoryItem = {
        timestamp: new Date().toLocaleString('vi-VN'),
        action: 'Thu hồi tư cách Cứu hộ viên',
        actor: user?.fullName || 'Cán bộ Local Authority',
        detail: revokeReasonText.trim(),
        type: 'rejected',
      };

      setApplicants((prev) =>
        prev.map((a) =>
          a.id === selectedApplicant.id
            ? {
              ...a,
              status: 'REJECTED',
              rejectionReason: revokeReasonText.trim(),
              reviewedAt: new Date().toLocaleString('vi-VN'),
              reviewerName: user?.fullName || 'Cán bộ Local Authority',
              history: [updatedHistory, ...a.history],
            }
            : a
        )
      );

      if (selectedApplicant) {
        setSelectedApplicant((prev) =>
          prev
            ? {
              ...prev,
              status: 'REJECTED',
              rejectionReason: revokeReasonText.trim(),
              reviewedAt: new Date().toLocaleString('vi-VN'),
              reviewerName: user?.fullName || 'Cán bộ Local Authority',
              history: [updatedHistory, ...prev.history],
            }
            : null
        );
      }

      setIsRevokeModalOpen(false);
      setRevokeReasonText('');
      toast.success(
        `Đã thu hồi tư cách Cứu hộ viên của ${selectedApplicant.fullName} thành công!`,
        'Thu hồi quyền hoàn tất'
      );
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi thu hồi quyền', 'Lỗi thao tác');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Hàm tính toán thời gian chờ
  const renderWaitTimeBadge = (submittedAt: string, status: ApplicationStatus) => {
    if (status === 'VERIFIED' || status === 'REJECTED') return null;

    const diffHours = Math.round((Date.now() - new Date(submittedAt).getTime()) / (3600 * 1000));
    if (diffHours < 24) {
      return (
        <span className="ra-wait-badge new" title="Hồ sơ mới gửi trong vòng 24 giờ">
          <Clock size={11} />
          Mới gửi ({diffHours}h)
        </span>
      );
    } else if (diffHours >= 48) {
      const days = Math.floor(diffHours / 24);
      return (
        <span className="ra-wait-badge urgent" title="Hồ sơ đã chờ xử lý hơn 48 giờ">
          <AlertCircle size={11} />
          Chờ {days} ngày ({diffHours}h)
        </span>
      );
    } else {
      return (
        <span className="ra-wait-badge normal">
          <Clock size={11} />
          Chờ {diffHours}h
        </span>
      );
    }
  };

  // Che số CCCD hiển thị trong danh sách: 048092***891
  const maskCccd = (cccd: string) => {
    if (!cccd || cccd.length < 8) return cccd || 'Chưa cung cấp';
    const first = cccd.slice(0, 6);
    const last = cccd.slice(-3);
    return `${first}***${last}`;
  };

  return (
    <div className="rescuer-approval-container">


      {/* 3. KHU VỰC QUẢN LÝ DANH SÁCH HỒ SƠ */}
      <section className="ra-table-card">
        {/* Toolbar */}
        <div className="ra-toolbar">
          <div className="ra-toolbar-controls">
            {/* Bộ lọc địa bàn: Dành riêng cho Quản trị viên (Admin) chọn phân cấp Tỉnh/TP -> Xã/Phường */}
            {isAdmin && (
              <>
                {/* 0A. Lọc theo Tỉnh / Thành phố: Dành cho Admin quản lý Toàn quốc */}
                {/* 0A. Lọc theo Tỉnh / Thành phố: Gọi từ API Open-API Việt Nam */}
                <select
                  className="ra-filter-select"
                  value={selectedProvince}
                  onChange={(e) => {
                    setSelectedProvince(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    minWidth: 175,
                    fontWeight: 700,
                    borderColor: selectedProvince !== 'ALL' ? '#0284c7' : undefined,
                    background: selectedProvince !== 'ALL' ? '#f0f9ff' : undefined,
                    color: selectedProvince !== 'ALL' ? '#0369a1' : undefined,
                  }}
                  title="Bước 1: Chọn Tỉnh / Thành phố (API)"
                >
                  <option value="ALL">
                    {provincesLoading ? '⏳ Đang tải Tỉnh / TP...' : `🌐 Tất cả Tỉnh / TP (${provinces.length})`}
                  </option>
                  {provinces.map((prov) => (
                    <option key={prov.id || prov.name} value={prov.name}>
                      🏙️ {prov.name}
                    </option>
                  ))}
                </select>

                {/* 0B. Lọc theo Quận / Huyện / Xã / Phường: Gọi từ API Wards */}
                <select
                  className="ra-filter-select"
                  value={areaFilter}
                  onChange={(e) => {
                    setAreaFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    minWidth: 185,
                    fontWeight: 700,
                    borderColor: areaFilter !== 'ALL' ? '#0284c7' : undefined,
                    background: areaFilter !== 'ALL' ? '#f0f9ff' : undefined,
                    color: areaFilter !== 'ALL' ? '#0369a1' : undefined,
                  }}
                  title="Bước 2: Chọn Quận / Huyện / Xã / Phường"
                >
                  <option value="ALL">
                    {wardsLoading
                      ? '⏳ Đang tải xã, phường từ API...'
                      : selectedProvince === 'ALL'
                      ? `📍 Tất cả địa bàn (${wards.length})`
                      : `📍 Tất cả xã / phường (${wards.length})`}
                  </option>
                  {wards.map((ward) => (
                    <option key={ward.id} value={ward.id}>
                      {ward.type === 'DISTRICT' ? '🏛️' : '📍'} {ward.name} {ward.code ? `(${ward.code})` : ''}
                    </option>
                  ))}
                </select>
              </>
            )}

            {/* Bộ lọc trạng thái */}
            <select
              className="ra-filter-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="PENDING">Chờ duyệt ({stats.pending})</option>
              <option value="IN_REVIEW">Đang thẩm định</option>
              <option value="REQUIRES_UPDATE">Yêu cầu bổ sung ({stats.requiresUpdate})</option>
              <option value="VERIFIED">Đã duyệt ({stats.verified})</option>
              <option value="REJECTED">Từ chối ({stats.rejected})</option>
            </select>

            {/* Bộ lọc chuyên môn */}
            <select
              className="ra-filter-select"
              value={specFilter}
              onChange={(e) => {
                setSpecFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">Tất cả chuyên môn</option>
              <option value="FLOOD_RESCUE">Thủy bộ vượt lũ</option>
              <option value="SEARCH_RESCUE">Tìm kiếm &amp; Cứu nạn</option>
              <option value="MEDICAL_RESCUE">Sơ cấp cứu y tế</option>
              <option value="FIRE_RESCUE">PCCC &amp; Cứu sập</option>
              <option value="EVACUATION">Sơ tán người dân</option>
              <option value="COMMUNICATION">Thông tin liên lạc</option>
              <option value="LOGISTICS">Hậu cần &amp; Tiếp tế</option>
              <option value="VEHICLE_OP">Vận hành phương tiện</option>
              <option value="OTHER">Chuyên môn khác</option>
            </select>

            {/* Ô tìm kiếm */}
            <div className="ra-search-box">
              <Search size={15} className="ra-search-icon" />
              <input
                type="text"
                className="ra-search-input"
                placeholder="Tìm theo họ tên, số điện thoại, CCCD..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
              {searchQuery && (
                <button
                  className="ra-search-clear"
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  title="Xóa tìm kiếm"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Nút xóa lọc nhanh */}
            {hasActiveFilters && (
              <button
                type="button"
                className="ra-clear-filter-btn"
                onClick={handleClearFilters}
                title="Xóa toàn bộ bộ lọc hồ sơ và đặt lại ban đầu"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#dc2626',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                <FilterX size={14} />
                <span>Xóa lọc</span>
              </button>
            )}

            <button
              className="ra-refresh-btn"
              onClick={handleRefresh}
              title="Làm mới dữ liệu từ máy chủ"
              disabled={refreshSpin}
              style={{ marginLeft: 'auto' }}
            >
              <RefreshCw size={14} className={refreshSpin ? 'spin' : ''} />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* 4. BẢNG DỮ LIỆU */}
        <div className="ra-table-wrap">
          {loading ? (
            <div style={{ padding: '20px 0' }}>
              <div className="ra-skeleton-row" />
              <div className="ra-skeleton-row" />
              <div className="ra-skeleton-row" />
              <div className="ra-skeleton-row" />
              <div className="ra-skeleton-row" />
            </div>
          ) : paginatedApplicants.length === 0 ? (
            <div className="ra-state-container">
              {stats.pending === 0 && statusFilter === 'PENDING' ? (
                <>
                  <div className="ra-state-icon success">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="ra-state-title">Không còn hồ sơ chờ duyệt</h3>
                  <p className="ra-state-desc">
                    Tất cả hồ sơ đăng ký Cứu hộ viên trong địa bàn đã được thẩm định xong.
                  </p>
                </>
              ) : (
                <>
                  <div className="ra-state-icon empty">
                    <Search size={32} />
                  </div>
                  <h3 className="ra-state-title">Không tìm thấy hồ sơ phù hợp</h3>
                  <p className="ra-state-desc">
                    Vui lòng thử điều chỉnh lại bộ lọc trạng thái, từ khóa tìm kiếm hoặc bấm &ldquo;Đặt lại&rdquo;.
                  </p>
                  <button
                    className="ra-btn ra-btn-secondary"
                    style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={handleClearFilters}
                  >
                    <FilterX size={14} />
                    <span>Xóa lọc</span>
                  </button>
                </>
              )}
            </div>
          ) : (
            <table className="ra-table">
              <thead>
                <tr>
                  <th style={{ width: '24%' }}>ỨNG VIÊN</th>
                  <th style={{ width: '16%' }}>ĐỊNH DANH</th>
                  <th style={{ width: '18%' }}>ĐỊA BÀN ĐĂNG KÝ</th>
                  <th style={{ width: '18%' }}>CHUYÊN MÔN CỨU HỘ</th>
                  <th style={{ width: '14%' }}>NGÀY ĐĂNG KÝ</th>
                  <th style={{ width: '14%' }}>TRẠNG THÁI</th>
                  <th style={{ width: '8%', textAlign: 'center' }}>THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {paginatedApplicants.map((app) => {
                  const isPending = app.status === 'PENDING' || app.status === 'IN_REVIEW';
                  return (
                    <tr
                      key={app.id}
                      className={`ra-clickable-row ${isPending ? 'row-pending' : ''} ${selectedApplicant?.id === app.id ? 'row-selected' : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleOpenDetail(app); }}
                      style={{ cursor: 'pointer' }}
                      title="Bấm để xem chi tiết hồ sơ thẩm định của ứng viên này"
                    >
                      {/* 1. Ứng viên */}
                      <td>
                        <div className="ra-candidate-cell">
                          <div className="ra-candidate-avatar">
                            {app.avatarUrl ? (
                              <img src={app.avatarUrl} alt={app.fullName} />
                            ) : (
                              getApplicantInitials(app.fullName)
                            )}
                          </div>
                          <div className="ra-candidate-meta">
                            <span className="ra-candidate-name">{app.fullName}</span>
                            <div className="ra-candidate-contact">
                              <span>
                                <Phone size={11} /> {app.phone}
                              </span>
                              {app.email && (
                                <span title={app.email}>
                                  <Mail size={11} /> {app.email.includes('@') ? app.email.split('@')[0] : app.email}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Định danh */}
                      <td>
                        <div className="ra-identity-meta">
                          <span className="ra-cccd-masked" title="Số CCCD được mã hóa bảo mật">
                            {maskCccd(app.idNumber)}
                          </span>
                          {app.isCccdVerified ? (
                            <span className="ra-doc-status-badge has-doc" style={{ background: '#ECFDF5', color: '#059669', borderColor: '#A7F3D0' }}>
                              <CheckCircle2 size={11} /> Đã quét mã thẻ
                            </span>
                          ) : app.hasCccdPhotos ? (
                            <span className="ra-doc-status-badge has-doc">
                              <FileCheck size={11} /> Đã tải CCCD
                            </span>
                          ) : (
                            <span className="ra-doc-status-badge no-doc">
                              <AlertCircle size={11} /> Tự nhập tay
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 3. Địa bàn đăng ký */}
                      <td>
                        <div className="ra-area-cell">
                          <span className="ra-area-commune">
                            {app.communeName || (app.areaName ? app.areaName.split(',')[0] : '') || 'Địa bàn cư trú'}
                          </span>
                          <span className="ra-area-district">
                            {app.districtName || 'Thành phố Đà Nẵng'}
                          </span>
                        </div>
                      </td>

                      {/* 4. Chuyên môn cứu hộ */}
                      <td>
                        <div className="ra-skills-list">
                          {app.skills.slice(0, 2).map((sk) => {
                            let tagClass = '';
                            if (sk === 'water_rescue' || sk === 'boat_driver') tagClass = 'flood';
                            else if (sk === 'first_aid') tagClass = 'medical';
                            else if (sk === 'firefighting') tagClass = 'fire';

                            return (
                              <span key={sk} className={`ra-skill-tag ${tagClass}`}>
                                {SKILL_LABELS[sk] || sk}
                              </span>
                            );
                          })}
                          {app.skills.length > 2 && (
                            <span
                              className="ra-skill-tag-more"
                              title={app.skills.slice(2).map((s) => SKILL_LABELS[s] || s).join(', ')}
                            >
                              +{app.skills.length - 2} kỹ năng
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. Ngày đăng ký */}
                      <td>
                        <div className="ra-date-cell">
                          <span className="ra-date-text">
                            {new Date(app.submittedAt).toLocaleDateString('vi-VN')}
                          </span>
                          {renderWaitTimeBadge(app.submittedAt, app.status)}
                        </div>
                      </td>

                      {/* 6. Trạng thái */}
                      <td>
                        {app.status === 'PENDING' && (
                          <span className="ra-status-badge pending">
                            <Clock size={12} /> Chờ duyệt
                          </span>
                        )}
                        {app.status === 'IN_REVIEW' && (
                          <span className="ra-status-badge in_review">
                            <Compass size={12} /> Đang thẩm định
                          </span>
                        )}
                        {app.status === 'REQUIRES_UPDATE' && (
                          <span className="ra-status-badge requires_update">
                            <AlertTriangle size={12} /> Yêu cầu bổ sung
                          </span>
                        )}
                        {app.status === 'VERIFIED' && (
                          <span className="ra-status-badge verified">
                            <CheckCircle2 size={12} /> Đã duyệt
                          </span>
                        )}
                        {app.status === 'REJECTED' && (
                          <span className="ra-status-badge rejected">
                            <XCircle size={12} /> Từ chối
                          </span>
                        )}
                      </td>

                      {/* 7. Thao tác (Chỉ mở chi tiết xem xét, không duyệt trực tiếp trên bảng) */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="ra-view-btn"
                          onClick={() => handleOpenDetail(app)}
                          title="Mở hồ sơ chi tiết để thẩm định và ra quyết định"
                        >
                          <Eye size={13} />
                          <span>Xem hồ sơ</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 5. PHÂN TRANG */}
        <div className="ra-pagination">
          <div className="ra-pagination-left">
            <span>
              Hiển thị{' '}
              <strong>
                {filteredApplicants.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}
              </strong>{' '}
              -{' '}
              <strong>
                {Math.min(currentPage * pageSize, filteredApplicants.length)}
              </strong>{' '}
              trên tổng số <strong>{filteredApplicants.length}</strong> hồ sơ
            </span>

            <select
              className="ra-page-size-select"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={10}>10 dòng / trang</option>
              <option value={20}>20 dòng / trang</option>
              <option value={50}>50 dòng / trang</option>
            </select>
          </div>

          <div className="ra-pagination-nav">
            <button
              className="ra-page-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              title="Trang trước"
            >
              <ChevronLeft size={14} />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => {
              if (
                pg === 1 ||
                pg === totalPages ||
                (pg >= currentPage - 1 && pg <= currentPage + 1)
              ) {
                return (
                  <button
                    key={pg}
                    className={`ra-page-btn ${pg === currentPage ? 'active' : ''}`}
                    onClick={() => setCurrentPage(pg)}
                  >
                    {pg}
                  </button>
                );
              }
              return null;
            })}

            <button
              className="ra-page-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              title="Trang sau"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* 6. SLIDE-OVER DRAWER CHI TIẾT HỒ SƠ (740px) */}
      {selectedApplicant && (
        <div className="ra-drawer-backdrop" onClick={handleCloseDetail}>
          <div
            className={`ra-drawer ${isDrawerClosing ? 'closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Drawer */}
            <div className="ra-drawer-header">
              <div className="ra-drawer-title-wrap">
                <h3 className="ra-drawer-title">CHI TIẾT HỒ SƠ CỨU HỘ VIÊN</h3>
                {selectedApplicant.status === 'PENDING' && (
                  <span className="ra-status-badge pending">Chờ duyệt</span>
                )}
                {selectedApplicant.status === 'IN_REVIEW' && (
                  <span className="ra-status-badge in_review">Đang thẩm định</span>
                )}
                {selectedApplicant.status === 'REQUIRES_UPDATE' && (
                  <span className="ra-status-badge requires_update">Yêu cầu bổ sung</span>
                )}
                {selectedApplicant.status === 'VERIFIED' && (
                  <span className="ra-status-badge verified">Đã duyệt</span>
                )}
                {selectedApplicant.status === 'REJECTED' && (
                  <span className="ra-status-badge rejected">Từ chối</span>
                )}
              </div>

              <button
                className="ra-drawer-close-btn"
                onClick={handleCloseDetail}
                title="Đóng (ESC)"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body Drawer — Phương án 1: Tối giản phẳng (Linear / Apple Inset) */}
            <div className="ra-drawer-body ra-drawer-body--minimal">
              {/* 1. Hero Summary Card */}
              <div className="ra-hero-summary">
                <div className="ra-hero-top">
                  <div className="ra-hero-avatar">
                    {selectedApplicant.avatarUrl ? (
                      <img src={selectedApplicant.avatarUrl} alt={selectedApplicant.fullName} />
                    ) : (
                      <span>{getApplicantInitials(selectedApplicant.fullName)}</span>
                    )}
                  </div>
                  <div className="ra-hero-info">
                    <div className="ra-hero-name-row">
                      <h4 className="ra-hero-name">{selectedApplicant.fullName}</h4>
                      <span className="ra-hero-role-pill">
                        {selectedApplicant.status === 'VERIFIED'
                          ? 'Cứu hộ viên địa phương'
                          : 'Ứng viên Cứu hộ viên'}
                      </span>
                    </div>
                    <div className="ra-hero-meta-row">
                      {[selectedApplicant.gender, selectedApplicant.dateOfBirth]
                        .filter(Boolean)
                        .length > 0 && (
                        <span>
                          {[selectedApplicant.gender, selectedApplicant.dateOfBirth]
                            .filter(Boolean)
                            .join(' • ')}
                        </span>
                      )}
                      <span>
                        <Phone size={12} /> {selectedApplicant.phone || 'Chưa cập nhật'}
                      </span>
                      {selectedApplicant.email && (
                        <span>
                          <Mail size={12} /> {selectedApplicant.email}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="ra-area-chip" title="Địa bàn đăng ký hoạt động cứu hộ">
                    <MapPin size={12} />
                    {selectedApplicant.areaName || 'Chưa rõ địa bàn'}
                  </span>
                </div>

                {selectedApplicant.address &&
                  selectedApplicant.address.trim() !== '' &&
                  selectedApplicant.address.trim() !== selectedApplicant.areaName.trim() && (
                    <>
                      <div className="ra-flat-divider" />
                      <div className="ra-hero-address-row">
                        <span className="ra-kv-label">Nơi cư trú thường trú:</span>
                        <span className="ra-hero-address-val">{selectedApplicant.address}</span>
                      </div>
                    </>
                  )}
              </div>

              {/* 2. Định danh & Tiếp nhận */}
              <div className="ra-inset-section">
                <div className="ra-inset-label">Định danh &amp; Tiếp nhận</div>
                <div className="ra-inset-card">
                  <div className="ra-flat-grid-2">
                    <div className="ra-kv-item">
                      <span className="ra-kv-label">Số thẻ CCCD</span>
                      <span className="ra-kv-value cccd-number">
                        {selectedApplicant.idNumber || 'Chưa cập nhật'}
                      </span>
                    </div>
                    <div className="ra-kv-item">
                      <span className="ra-kv-label">Ngày nộp hồ sơ</span>
                      <span className="ra-kv-value">
                        {new Date(selectedApplicant.submittedAt).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  </div>

                  <div className="ra-flat-divider" />

                  <div className="ra-flat-grid-2">
                    <div className="ra-kv-item">
                      <span className="ra-kv-label">Địa bàn đăng ký hoạt động</span>
                      <span className="ra-kv-value" style={{ color: '#15803d' }}>
                        {selectedApplicant.areaName || 'Chưa có thông tin địa bàn'}
                      </span>
                    </div>
                    <div className="ra-kv-item">
                      <span className="ra-kv-label">
                        {selectedApplicant.status === 'VERIFIED' || selectedApplicant.status === 'REJECTED'
                          ? 'Cán bộ thẩm định'
                          : 'Đơn vị tiếp nhận địa phương'}
                      </span>
                      <span className="ra-kv-value">
                        {selectedApplicant.status === 'VERIFIED' || selectedApplicant.status === 'REJECTED'
                          ? selectedApplicant.reviewerName || 'Ban Chỉ huy địa phương'
                          : localCommuneName
                          ? `Ban Chỉ huy ${localCommuneName}`
                          : userAreaName || 'Ban Chỉ huy địa phương'}
                      </span>
                    </div>
                  </div>

                  {(selectedApplicant.idCardFrontUrl || selectedApplicant.idCardBackUrl) && (
                    <>
                      <div className="ra-flat-divider" />
                      <div className="ra-cccd-images">
                        {selectedApplicant.idCardFrontUrl && (
                          <div className="ra-cccd-card">
                            <div className="ra-cccd-card-top">
                              <span className="ra-cccd-label">Ảnh CCCD Mặt trước</span>
                              <span className="ra-doc-chip has">Đã đính kèm</span>
                            </div>
                            <div
                              className="ra-cccd-preview"
                              onClick={() =>
                                setZoomedImage({
                                  url: selectedApplicant.idCardFrontUrl!,
                                  title: `CCCD Mặt trước - ${selectedApplicant.fullName}`,
                                })
                              }
                            >
                              <img src={selectedApplicant.idCardFrontUrl} alt="CCCD Mặt trước" />
                              <div className="ra-cccd-zoom-overlay">
                                <ZoomIn size={16} /> Bấm để phóng to
                              </div>
                            </div>
                          </div>
                        )}

                        {selectedApplicant.idCardBackUrl && (
                          <div className="ra-cccd-card">
                            <div className="ra-cccd-card-top">
                              <span className="ra-cccd-label">Ảnh CCCD Mặt sau</span>
                              <span className="ra-doc-chip has">Đã đính kèm</span>
                            </div>
                            <div
                              className="ra-cccd-preview"
                              onClick={() =>
                                setZoomedImage({
                                  url: selectedApplicant.idCardBackUrl!,
                                  title: `CCCD Mặt sau - ${selectedApplicant.fullName}`,
                                })
                              }
                            >
                              <img src={selectedApplicant.idCardBackUrl} alt="CCCD Mặt sau" />
                              <div className="ra-cccd-zoom-overlay">
                                <ZoomIn size={16} /> Bấm để phóng to
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 3. Năng lực & Kinh nghiệm thực địa */}
              <div className="ra-inset-section">
                <div className="ra-inset-label">Năng lực &amp; Kinh nghiệm thực địa</div>
                <div className="ra-inset-card">
                  <div className="ra-kv-item">
                    <span className="ra-kv-label">Kỹ năng cứu hộ đã đăng ký</span>
                    <div className="ra-skills-list-wrap">
                      {selectedApplicant.skills.length > 0 ? (
                        selectedApplicant.skills.map((sk) => (
                          <span key={sk} className="ra-skill-tag flood">
                            {SKILL_LABELS[sk] || sk}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: 13, color: '#94a3b8' }}>Chưa cập nhật kỹ năng cụ thể</span>
                      )}
                    </div>
                  </div>

                  <div className="ra-flat-divider" />

                  <div className="ra-kv-item">
                    <span className="ra-kv-label">Kinh nghiệm &amp; Chứng chỉ thực địa</span>
                    <div className="ra-experience-box">
                      {selectedApplicant.experience || 'Chưa cung cấp mô tả kinh nghiệm thực địa.'}
                    </div>
                  </div>

                  {((selectedApplicant.certificates && selectedApplicant.certificates.length > 0) ||
                    (selectedApplicant.equipment && selectedApplicant.equipment.length > 0)) && (
                    <>
                      <div className="ra-flat-divider" />
                      <div className="ra-flat-grid-2">
                        {selectedApplicant.certificates && selectedApplicant.certificates.length > 0 && (
                          <div className="ra-kv-item">
                            <span className="ra-kv-label">Chứng chỉ / Bằng cấp</span>
                            <ul className="ra-bullet-list">
                              {selectedApplicant.certificates.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {selectedApplicant.equipment && selectedApplicant.equipment.length > 0 && (
                          <div className="ra-kv-item">
                            <span className="ra-kv-label">Thiết bị cá nhân</span>
                            <ul className="ra-bullet-list">
                              {selectedApplicant.equipment.map((eq, i) => (
                                <li key={i}>{eq}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 4. Tiến trình xử lý */}
              <div className="ra-inset-section">
                <div className="ra-inset-label">Tiến trình thẩm định</div>
                <div className="ra-inset-card">
                  {selectedApplicant.supplementaryRequest && (
                    <div className="ra-feedback-box warning" style={{ marginBottom: 12 }}>
                      <span className="ra-feedback-title">Nội dung yêu cầu bổ sung:</span>
                      <p className="ra-feedback-content">{selectedApplicant.supplementaryRequest}</p>
                    </div>
                  )}

                  {selectedApplicant.rejectionReason && (
                    <div className="ra-feedback-box danger" style={{ marginBottom: 12 }}>
                      <span className="ra-feedback-title">Lý do từ chối:</span>
                      <p className="ra-feedback-content">{selectedApplicant.rejectionReason}</p>
                    </div>
                  )}

                  <div className="ra-timeline" style={{ marginTop: 2 }}>
                    {selectedApplicant.history.map((h, i) => (
                      <div key={i} className="ra-timeline-item">
                        <div
                          className={`ra-timeline-dot ${h.type === 'verified'
                              ? 'green'
                              : h.type === 'rejected'
                                ? 'red'
                                : h.type === 'update'
                                  ? 'orange'
                                  : ''
                            }`}
                        />
                        <span className="ra-timeline-action">{h.action}</span>
                        <span className="ra-timeline-meta">
                          {h.timestamp} • {h.actor}
                        </span>
                        {h.detail && <div className="ra-timeline-detail">{h.detail}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky Action Footer */}
            <div className="ra-drawer-footer">
              {selectedApplicant.status === 'VERIFIED' ? (
                <div className="ra-verified-footer-wrap">
                  <div className="ra-resolved-banner verified" style={{ flex: 1 }}>
                    <CheckCircle2 size={18} />
                    <span>
                      Hồ sơ đã được phê duyệt tư cách Cứu hộ viên. Ứng viên đủ điều kiện hoạt động
                      và tham gia Đội cứu hộ trên địa bàn.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="ra-btn ra-btn-danger ra-revoke-btn"
                    onClick={() => {
                      setRevokeReasonText('');
                      setIsRevokeModalOpen(true);
                    }}
                    title="Thu hồi tư cách Cứu hộ viên và chuyển về vai trò Người dân"
                    disabled={submittingAction}
                  >
                    <XCircle size={15} />
                    <span>Thu hồi quyền cứu hộ</span>
                  </button>
                </div>
              ) : selectedApplicant.status === 'REJECTED' ? (
                <div className="ra-resolved-banner rejected">
                  <XCircle size={18} />
                  <span>
                    Hồ sơ đã bị từ chối / thu hồi quyền. Lý do: {selectedApplicant.rejectionReason || 'Không đủ điều kiện tiêu chuẩn.'}
                  </span>
                </div>
              ) : (
                <div className="ra-actions-row">
                  {/* Nút từ chối */}
                  <button
                    className="ra-btn ra-btn-danger"
                    onClick={() => {
                      setRejectionReasonText('');
                      setIsRejectModalOpen(true);
                    }}
                    disabled={submittingAction}
                  >
                    <XCircle size={15} />
                    <span>Từ chối hồ sơ</span>
                  </button>



                  {/* Nút phê duyệt chính */}
                  <button
                    className="ra-btn ra-btn-primary"
                    onClick={() => setIsApproveModalOpen(true)}
                    disabled={submittingAction}
                  >
                    <CheckCircle2 size={15} />
                    <span>Phê duyệt hồ sơ</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL XÁC NHẬN PHÊ DUYỆT */}
      {isApproveModalOpen && selectedApplicant && (
        <div className="ra-modal-backdrop" onClick={() => setIsApproveModalOpen(false)}>
          <div className="ra-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ra-modal-header success">
              <CheckCircle2 size={20} />
              <h3 className="ra-modal-title">Xác nhận phê duyệt hồ sơ cứu hộ</h3>
            </div>
            <div className="ra-modal-body">
              <p>
                Bạn đang chuẩn bị phê duyệt tư cách Cứu hộ viên chính thức cho ứng viên:
              </p>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '12px 16px',
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1e3a8a' }}>
                  {selectedApplicant.fullName}
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                  Số CCCD: {selectedApplicant.idNumber} • SĐT: {selectedApplicant.phone}
                </div>
                <div style={{ fontSize: 12.5, color: '#15803d', marginTop: 4, fontWeight: 600 }}>
                  Địa bàn: {selectedApplicant.areaName}
                </div>
              </div>

              <div
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 12.5,
                  color: '#1d4ed8',
                  lineHeight: 1.4,
                }}
              >
                <strong>Cam kết thẩm quyền:</strong> Quyết định này xác nhận thông tin định danh và năng
                lực cứu hộ đã được Local Authority thẩm tra hợp lệ. Không tự động điều phối ứng viên
                vào bất kỳ Đội cứu hộ nào.
              </div>
            </div>
            <div className="ra-modal-footer">
              <button
                className="ra-btn ra-btn-secondary"
                onClick={() => setIsApproveModalOpen(false)}
                disabled={submittingAction}
              >
                Hủy bỏ
              </button>
              <button
                className="ra-btn ra-btn-primary"
                onClick={handleConfirmApproval}
                disabled={submittingAction}
              >
                {submittingAction ? 'Đang lưu...' : 'Xác nhận phê duyệt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL YÊU CẦU BỔ SUNG */}
      {isSupplementModalOpen && selectedApplicant && (
        <div className="ra-modal-backdrop" onClick={() => setIsSupplementModalOpen(false)}>
          <div className="ra-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ra-modal-header warning">
              <AlertTriangle size={20} />
              <h3 className="ra-modal-title">Yêu cầu bổ sung hồ sơ cứu hộ</h3>
            </div>
            <div className="ra-modal-body">
              <p>
                Ứng viên: <strong>{selectedApplicant.fullName}</strong>
                <br />
                Vui lòng chỉ rõ những tài liệu, thông tin hoặc hình ảnh CCCD còn thiếu cần ứng viên cập
                nhật lại:
              </p>

              <textarea
                className="ra-modal-textarea"
                placeholder="Ví dụ: Hình ảnh mặt sau CCCD bị mờ, vui lòng chụp lại rõ nét; bổ sung bản sao chứng chỉ sơ cứu y tế..."
                value={supplementaryText}
                onChange={(e) => setSupplementaryText(e.target.value)}
              />
            </div>
            <div className="ra-modal-footer">
              <button
                className="ra-btn ra-btn-secondary"
                onClick={() => setIsSupplementModalOpen(false)}
                disabled={submittingAction}
              >
                Hủy bỏ
              </button>
              <button
                className="ra-btn ra-btn-warning"
                onClick={handleConfirmSupplement}
                disabled={submittingAction || !supplementaryText.trim()}
              >
                {submittingAction ? 'Đang gửi...' : 'Gửi yêu cầu bổ sung'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8.5. MODAL THU HỒI QUYỀN CỨU HỘ VIÊN */}
      {isRevokeModalOpen && selectedApplicant && (
        <div className="ra-modal-backdrop" onClick={() => setIsRevokeModalOpen(false)}>
          <div className="ra-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ra-modal-header danger">
              <XCircle size={20} />
              <h3 className="ra-modal-title">Thu hồi quyền Cứu hộ viên</h3>
            </div>
            <div className="ra-modal-body">
              <div className="ra-modal-alert danger">
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong>Cảnh báo quan trọng:</strong> Ứng viên{' '}
                  <strong>{selectedApplicant.fullName}</strong> sẽ bị thu hồi toàn bộ tư cách cứu hộ,
                  rút khỏi mọi Đội cứu hộ đang tham gia và tài khoản lập tức chuyển về vai trò <strong>Người dân (CITIZEN)</strong>.
                </div>
              </div>
              <p style={{ marginTop: 14, marginBottom: 6, fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                Lý do thu hồi quyền (bắt buộc):
              </p>
              <textarea
                className="ra-modal-textarea"
                placeholder="Ví dụ: Vi phạm quy chế điều hành cứu hộ / Chuyển nơi cư trú / Không đủ điều kiện sức khỏe / Tự nguyện xin rút..."
                value={revokeReasonText}
                onChange={(e) => setRevokeReasonText(e.target.value)}
                rows={3}
                autoFocus
              />
            </div>
            <div className="ra-modal-footer">
              <button
                className="ra-btn ra-btn-secondary"
                onClick={() => setIsRevokeModalOpen(false)}
                disabled={submittingAction}
              >
                Hủy bỏ
              </button>
              <button
                className="ra-btn ra-btn-danger"
                style={{ background: '#dc2626', color: '#ffffff', borderColor: '#dc2626' }}
                onClick={handleConfirmRevoke}
                disabled={submittingAction || !revokeReasonText.trim()}
              >
                {submittingAction ? 'Đang xử lý...' : 'Xác nhận thu hồi quyền'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. MODAL TỪ CHỐI HỒ SƠ */}
      {isRejectModalOpen && selectedApplicant && (
        <div className="ra-modal-backdrop" onClick={() => setIsRejectModalOpen(false)}>
          <div className="ra-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ra-modal-header danger">
              <XCircle size={20} />
              <h3 className="ra-modal-title">Từ chối hồ sơ đăng ký cứu hộ</h3>
            </div>
            <div className="ra-modal-body">
              <p>
                Bạn đang thực hiện từ chối hồ sơ của ứng viên{' '}
                <strong>{selectedApplicant.fullName}</strong>.
                <br />
                <strong>Bắt buộc:</strong> Ghi rõ lý do từ chối để lưu vào nhật ký kiểm toán và thông
                báo tới ứng viên:
              </p>

              <textarea
                className="ra-modal-textarea"
                placeholder="Ví dụ: Thông tin CCCD không trùng khớp cơ sở dữ liệu dân cư; chưa đáp ứng tiêu chuẩn sức khỏe và kỹ năng an toàn tối thiểu..."
                value={rejectionReasonText}
                onChange={(e) => setRejectionReasonText(e.target.value)}
              />
            </div>
            <div className="ra-modal-footer">
              <button
                className="ra-btn ra-btn-secondary"
                onClick={() => setIsRejectModalOpen(false)}
                disabled={submittingAction}
              >
                Hủy bỏ
              </button>
              <button
                className="ra-btn ra-btn-danger"
                style={{ background: '#dc2626', color: '#ffffff', borderColor: '#dc2626' }}
                onClick={handleConfirmRejection}
                disabled={submittingAction || !rejectionReasonText.trim()}
              >
                {submittingAction ? 'Đang xử lý...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. MODAL PHÓNG TO ẢNH CCCD */}
      {zoomedImage && (
        <div className="ra-modal-backdrop" onClick={() => setZoomedImage(null)}>
          <div className="ra-zoom-modal-card" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 18px',
                borderBottom: '1px solid #e2e8f0',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 14 }}>{zoomedImage.title}</span>
              <button
                className="ra-drawer-close-btn"
                onClick={() => setZoomedImage(null)}
                title="Đóng (ESC)"
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: 16, display: 'flex', justifyContent: 'center', background: '#0f172a' }}>
              <img src={zoomedImage.url} alt={zoomedImage.title} className="ra-zoom-img" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield,
  Search,
  Users,
  Truck,
  RefreshCw,
  MapPin,
  CheckCircle2,
  X,
  Loader2,
  Eye,
  PlusCircle,
  FileCheck,
  Check,
  CreditCard,
  Sailboat,
  Bike,
  ShieldCheck,
  Clock,
  Radio,
  Flame,
  HeartPulse,
  Compass,
  History,
  Info,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Trash2,
  AlertTriangle,
  Package,
  LifeBuoy,
  Wrench,
  UserPlus,
  UserMinus,
  Crown,
} from 'lucide-react';
import type { RescueTeamItem, AdministrativeAreaItem } from '@/types/dashboard';
import type { User } from '@/types/auth';
import {
  fetchRescueTeams,
  fetchAdminUsers,
  verifyRescuer,
  fetchAdministrativeAreas,
  updateRescueTeamStatus,
  updateTeamMemberStatus,
  createRescueTeam,
  createVehicle,
  deleteRescueTeam,
  addTeamMember,
  removeTeamMember,
  changeTeamLeader,
} from '@/api';
import { domainDService } from '@/services/domainDService';
import { getRolePrefix } from '@/services/appRouter';
import { toast } from '@/components/common/toast';
import { onRescuerApplicationSubmitted, onRescuerVerificationChanged, onRescueTeamsUpdated } from '@/services/socketService';
import '@/features/sos/SosRequestsView.css';
import './RescuerApprovalView.css';
import './RescuersView.css';

export interface RescuersViewProps {
  mode?: 'operations' | 'admin';
  onOpenMap?: (sosId?: any) => void;
  user?: User;
}

// Chuyên môn cứu hộ chuẩn
export type RescueSpecialization =
  | 'FLOOD_RESCUE'
  | 'SEARCH_RESCUE'
  | 'MEDICAL_RESCUE'
  | 'FIRE_RESCUE'
  | 'GENERAL_RESCUE';

// Trạng thái vận hành của đội cứu hộ
export type OperationalStatus = 'READY' | 'ON_MISSION' | 'LIMITED' | 'INACTIVE';

interface TeamMemberDetail {
  _id: string;
  rescuerId: string;
  fullName: string;
  phone: string;
  email?: string;
  role: 'LEADER' | 'MEMBER';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  isVerified: boolean;
  availabilityStatus: 'AVAILABLE' | 'BUSY' | 'AWAY';
  skills: string[];
  joinedAt?: string;
}

export interface TeamEquipmentDetail {
  id: string;
  name: string;
  category: 'SAFETY' | 'COMMUNICATION' | 'MEDICAL' | 'SEARCH' | 'TOOL';
  categoryLabel: string;
  quantity: number;
  unit: string;
  status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE';
  condition: string;
  notes?: string;
}

interface TeamVehicleDetail {
  _id: string;
  plateNumber: string;
  type: 'BOAT' | 'AMBULANCE' | 'TRUCK' | 'MOTORBIKE' | 'OTHER';
  capacity: number;
  status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE';
  name?: string;
  notes?: string;
}

interface TeamMissionDetail {
  id: string;
  sosCode: string;
  location: string;
  status: 'ASSIGNED' | 'EN_ROUTE' | 'ON_SCENE' | 'COMPLETED' | 'CANCELLED';
  assignedAt: string;
  missionType: string;
  description: string;
  peopleCount?: number;
}

interface TeamActivityLog {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  detail: string;
}

export interface EnrichedRescueTeam extends RescueTeamItem {
  operationalStatus: OperationalStatus;
  specialization: RescueSpecialization;
  areaName: string;
  assignedSector?: string;
  leaderName: string;
  leaderPhone: string;
  totalMembersCount: number;
  availableMembersCount: number;
  pendingMembersCount: number;
  totalVehiclesCount: number;
  availableVehiclesCount: number;
  vehicleTypeBreakdown: string;
  activeMissions: TeamMissionDetail[];
  allMissions: TeamMissionDetail[];
  detailedMembers: TeamMemberDetail[];
  detailedVehicles: TeamVehicleDetail[];
  detailedEquipments: TeamEquipmentDetail[];
  totalEquipmentCount: number;
  activityLogs: TeamActivityLog[];
  headquartersAddress?: string;
  readinessScore?: number;
}

const SPECIALIZATION_LABELS: Record<RescueSpecialization, string> = {
  FLOOD_RESCUE: 'Thủy bộ vượt lũ',
  SEARCH_RESCUE: 'Tìm kiếm và cứu nạn',
  MEDICAL_RESCUE: 'Y tế cứu thương',
  FIRE_RESCUE: 'PCCC và cứu nạn cứu hộ',
  GENERAL_RESCUE: 'Cứu hộ tổng hợp',
};

const OPERATIONAL_STATUS_LABELS: Record<OperationalStatus, { label: string; color: string; desc: string }> = {
  READY: {
    label: 'Sẵn sàng',
    color: 'ready',
    desc: 'Đủ điều kiện nhận lệnh tác chiến mới',
  },
  ON_MISSION: {
    label: 'Đang thực hiện nhiệm vụ',
    color: 'on_mission',
    desc: 'Đang triển khai cứu hộ tại hiện trường',
  },
  LIMITED: {
    label: 'Hạn chế hoạt động',
    color: 'limited',
    desc: 'Thiếu nhân lực hoặc phương tiện bảo dưỡng',
  },
  INACTIVE: {
    label: 'Ngừng hoạt động',
    color: 'inactive',
    desc: 'Tạm đình chỉ hoặc giải thể',
  },
};

const SKILL_LABELS: Record<string, string> = {
  first_aid: 'Sơ cứu y tế',
  water_rescue: 'Cứu hộ vùng nước',
  search_rescue: 'Tìm kiếm cứu nạn',
  boat_driver: 'Lái xuồng vượt lũ',
  rope_climb: 'Leo dây & Độ cao',
  diving: 'Lặn cứu hộ',
  logistics: 'Hậu cần & Tiếp tế',
  evacuation: 'Sơ tán người dân',
  firefighting: 'PCCC & CNCH',
  relief_logistics: 'Tiếp tế lương thực',
  communication: 'Thông tin liên lạc',
  technical_rescue: 'Cứu hộ kỹ thuật cao',
};

const VEHICLE_LABELS: Record<string, string> = {
  BOAT: 'Ca-nô / Xuồng máy',
  MOTORBIKE: 'Xe máy cơ động',
  TRUCK: 'Xe bán tải / Tải',
  AMBULANCE: 'Xe cứu thương',
  OTHER: 'Phương tiện đặc chủng',
};

// Nhãn danh mục Trang thiết bị chuẩn từ MongoDB
const EQUIPMENT_CATEGORY_LABELS: Record<string, string> = {
  LIFE_VEST: 'Bảo hộ & Cứu sinh',
  LIFE_SAVING: 'Cứu sinh vùng nước',
  MEDICAL_KIT: 'Y tế & Cấp cứu',
  MEDICAL_DEVICE: 'Thiết bị y tế',
  COMMUNICATION: 'Thông tin liên lạc',
  LIGHTING: 'Chiếu sáng dã chiến',
  ROPE_TOOL: 'Dây & Cứu nạn',
  TOOL: 'Dụng cụ cứu hộ',
  VEHICLE_ACCESSORY: 'Phụ kiện phương tiện',
  SHELTER: 'Lều bạt dã chiến',
  PPE: 'Bảo hộ cá nhân',
  FOOD_WATER: 'Lương thực & Nước',
  WATER_PURIFICATION: 'Lọc nước & Khử khuẩn',
  MEDICAL_SUPPLY: 'Dược phẩm & Vật tư',
  FUEL: 'Nhiên liệu',
  HYGIENE: 'Vệ sinh & Nhu yếu',
  OTHER: 'Trang thiết bị khác',
};

export const RescuersView: React.FC<RescuersViewProps> = ({
  mode: initialMode = 'operations',
  onOpenMap: _onOpenMap,
  user,
}) => {
  const [currentMode, setCurrentMode] = useState<'operations' | 'admin'>(initialMode);

  useEffect(() => {
    setCurrentMode(initialMode);
  }, [initialMode]);

  const [rawTeams, setRawTeams] = useState<RescueTeamItem[]>([]);
  const [rescuers, setRescuers] = useState<any[]>([]);
  const [areas, setAreas] = useState<AdministrativeAreaItem[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('ALL');
  const [loading, setLoading] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [specFilter, setSpecFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Modal & Drawer State
  const [selectedTeamDetail, setSelectedTeamDetail] = useState<EnrichedRescueTeam | null>(null);
  const [isDrawerClosing, setIsDrawerClosing] = useState(false);
  const [detailActiveTab, setDetailActiveTab] = useState<'overview' | 'members' | 'vehicles' | 'equipment' | 'missions' | 'history'>('overview');
  const [selectedApplicantDetail, setSelectedApplicantDetail] = useState<any | null>(null);
  const [teamToDelete, setTeamToDelete] = useState<EnrichedRescueTeam | null>(null);
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [isJoinRequestsModalOpen, setIsJoinRequestsModalOpen] = useState(false);

  // Quản lý Thành viên trong Đội (Thêm / Bổ nhiệm / Xóa)
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [selectedRescuerToAdd, setSelectedRescuerToAdd] = useState('');
  const [memberRoleToAdd, setMemberRoleToAdd] = useState<'MEMBER' | 'LEADER'>('MEMBER');
  const [isSubmittingAddMember, setIsSubmittingAddMember] = useState(false);

  const [memberToRemove, setMemberToRemove] = useState<{
    teamId: string;
    teamName: string;
    rescuerId: string;
    rescuerName: string;
    role: string;
  } | null>(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);

  const [memberToPromote, setMemberToPromote] = useState<{
    teamId: string;
    teamName: string;
    rescuerId: string;
    rescuerName: string;
  } | null>(null);
  const [isPromotingLeader, setIsPromotingLeader] = useState(false);

  // Mở drawer mượt mà
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const handleOpenTeamDetail = useCallback((team: EnrichedRescueTeam, tab: 'overview' | 'members' | 'vehicles' | 'equipment' | 'missions' | 'history' = 'overview') => {
    setIsDrawerClosing(false);
    setSelectedTeamDetail(team);
    setDetailActiveTab(tab);
  }, []);

  // Quản lý trạng thái hoạt động của Đội cứu hộ (Tạm dừng / Kích hoạt)
  const handleUpdateTeamStatus = async (teamId: string, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') => {
    try {
      setActionInProgress(teamId);
      const res = await updateRescueTeamStatus(teamId, status);
      if (res.success) {
        toast.success(
          status === 'ACTIVE'
            ? 'Đã kích hoạt đội cứu hộ! Đội đã sẵn sàng nhận lệnh tác chiến.'
            : 'Đã chuyển đội cứu hộ sang trạng thái tạm ngưng hoạt động!',
          'Thành công'
        );
        setSelectedTeamDetail((prev) => {
          if (prev && prev._id === teamId) {
            return {
              ...prev,
              status,
              operationalStatus: status === 'ACTIVE' ? 'READY' : 'INACTIVE',
            };
          }
          return prev;
        });
        await loadData();
      } else {
        toast.error(res.message || 'Không thể cập nhật trạng thái đội', 'Lỗi thao tác');
      }
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi cập nhật trạng thái đội', 'Lỗi kết nối');
    } finally {
      setActionInProgress(null);
    }
  };

  // Phê duyệt hoặc Từ chối thành viên xin vào đội
  const handleUpdateMemberStatus = async (teamId: string, rescuerId: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      const actionKey = `${teamId}-${rescuerId}`;
      setActionInProgress(actionKey);
      const res = await updateTeamMemberStatus(teamId, rescuerId, status);
      if (res.success) {
        toast.success(
          status === 'APPROVED'
            ? 'Đã phê duyệt thành viên vào đội cứu hộ!'
            : 'Đã từ chối đơn xin gia nhập đội của cứu hộ viên!',
          'Thành công'
        );
        setSelectedTeamDetail((prev) => {
          if (prev && prev._id === teamId) {
            let updatedMembers = [...prev.detailedMembers];
            if (status === 'APPROVED') {
              updatedMembers = updatedMembers.map((m) =>
                m.rescuerId === rescuerId ? { ...m, status: 'APPROVED' } : m
              );
            } else {
              updatedMembers = updatedMembers.filter((m) => m.rescuerId !== rescuerId);
            }
            const pendingCount = updatedMembers.filter((m) => m.status === 'PENDING').length;
            const availableCount = updatedMembers.filter((m) => m.status !== 'PENDING' && m.availabilityStatus === 'AVAILABLE').length;
            const totalCount = updatedMembers.filter((m) => m.status !== 'PENDING').length;
            return {
              ...prev,
              detailedMembers: updatedMembers,
              totalMembersCount: totalCount,
              availableMembersCount: availableCount,
              pendingMembersCount: pendingCount,
            };
          }
          return prev;
        });
        await loadData();
      } else {
        toast.error(res.message || 'Không thể xét duyệt thành viên', 'Lỗi thao tác');
      }
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi xét duyệt thành viên', 'Lỗi kết nối');
    } finally {
      setActionInProgress(null);
    }
  };

  // Xóa / giải thể đội cứu hộ (sử dụng Custom Modal chuyên nghiệp)
  const handleDeleteTeam = (team: EnrichedRescueTeam) => {
    setTeamToDelete(team);
  };

  const handleConfirmDelete = async () => {
    if (!teamToDelete) return;

    try {
      setActionInProgress(teamToDelete._id);
      const res = await deleteRescueTeam(teamToDelete._id);
      if (res && (res as any).success === false) {
        throw new Error((res as any).message || 'Không thể xóa đội cứu hộ');
      }

      toast.success(`Đã giải thể và xóa đội "${teamToDelete.name}" thành công!`, 'Xóa đội cứu hộ');
      setTeamToDelete(null);
      handleCloseTeamDetail();
      await loadData();
    } catch (err: any) {
      console.error('Lỗi khi xóa đội cứu hộ:', err);
      toast.error(err.message || 'Có lỗi xảy ra khi xóa đội cứu hộ!', 'Lỗi');
    } finally {
      setActionInProgress(null);
    }
  };

  // Đóng drawer mượt mà kèm hiệu ứng slide out sang phải
  const handleCloseTeamDetail = useCallback(() => {
    if (isDrawerClosing) return;
    setIsDrawerClosing(true);
    setTimeout(() => {
      setSelectedTeamDetail(null);
      setIsDrawerClosing(false);
    }, 260);
  }, [isDrawerClosing]);

  // Điều hướng nhanh sang module Phương tiện & Vật tư (tự động lọc theo đội cứu hộ đang mở)
  const handleNavigateToResources = (tab: 'VEHICLES' | 'SUPPLIES' = 'VEHICLES') => {
    if (!selectedTeamDetail) return;
    const prefix = getRolePrefix(user || null);
    const targetUrl = `${prefix}/resources?teamId=${selectedTeamDetail._id}&tab=${tab}`;
    setSelectedTeamDetail(null);
    window.history.pushState(null, '', targetUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  // Phím Esc để đóng drawer nhanh & mượt
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedTeamDetail && !isDrawerClosing) {
        handleCloseTeamDetail();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTeamDetail, isDrawerClosing, handleCloseTeamDetail]);

  // Phân quyền: Cán bộ địa phương (Local Authority) vs Admin
  const activeOfficer = domainDService.getActiveOfficer();
  const isAdmin = Boolean(
    user?.roles?.includes('ADMIN') ||
    (user as any)?.role === 'ADMIN' ||
    activeOfficer?.role === 'ADMIN'
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

  // Form thêm đội cứu hộ mới
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamSpec, setNewTeamSpec] = useState<RescueSpecialization>('FLOOD_RESCUE');
  const [newTeamLeader, setNewTeamLeader] = useState('');
  const [selectedLeaderId, setSelectedLeaderId] = useState('');
  const [newTeamPhone, setNewTeamPhone] = useState('');
  const [newTeamArea, setNewTeamArea] = useState(userAreaName || '');
  const [newTeamBase, setNewTeamBase] = useState('');
  const [newTeamMembersCount, setNewTeamMembersCount] = useState(1);
  const [newVehicleType, setNewVehicleType] = useState<'BOAT' | 'AMBULANCE' | 'TRUCK' | 'MOTORBIKE'>('BOAT');
  const [newVehiclePlate, setNewVehiclePlate] = useState('');
  const [newVehicleCapacity, setNewVehicleCapacity] = useState(6);
  const [newTeamNotes, setNewTeamNotes] = useState('');

  const [filterSameCommuneOnly, setFilterSameCommuneOnly] = useState(true);

  // Danh sách Cứu hộ viên đã thẩm định đủ điều kiện làm Đội trưởng chỉ huy
  const leaderCandidates = useMemo(() => {
    const list: {
      id: string;
      fullName: string;
      phone: string;
      skills?: string;
      verified: boolean;
      areaName?: string;
      isSameCommune?: boolean;
      assignedTeamName?: string | null;
    }[] = [];
    const seenPhones = new Set<string>();

    const cleanCurrentCommune = (newTeamArea || userAreaName || '')
      .toLowerCase()
      .replace(/^(phường|xã|thị trấn)\s+/i, '')
      .split(',')[0]
      .trim();

    // 1. Lấy từ danh sách cứu hộ viên thực tế của hệ thống
    rescuers.forEach((r: any) => {
      const p = r.phone || '';
      const name = r.fullName || r.name || '';
      if (!name) return;
      if (p && seenPhones.has(p)) return;
      if (p) seenPhones.add(p);
      const isVerified = r.rescuer?.verificationStatus === 'VERIFIED' || r.verificationStatus === 'VERIFIED';
      const skillsArr = r.rescuer?.skills || r.skills || [];
      const skillsList = Array.isArray(skillsArr) ? skillsArr : (skillsArr ? [skillsArr] : []);
      const skillsStr = skillsList.map((s: string) => SKILL_LABELS[s] || s).join(', ');
      const rArea = r.rescuer?.areaName || r.areaName || r.address || '';
      const rAreaClean = rArea.toLowerCase();
      const isSame = cleanCurrentCommune ? rAreaClean.includes(cleanCurrentCommune) : false;

      // Kiểm tra xem nhân sự này đã thuộc biên chế của một Đội cứu hộ nào chưa
      const rescuerIdStr = String(r._id || r.id);
      const assignedTeam = rawTeams.find((t) => {
        const lId = typeof t.leaderId === 'object' ? (t.leaderId as any)?._id : t.leaderId;
        if (lId && String(lId) === rescuerIdStr) return true;
        if (Array.isArray(t.members)) {
          return t.members.some((m: any) => {
            const mId = typeof m.rescuerId === 'object' ? m.rescuerId?._id : m.rescuerId;
            return String(mId) === rescuerIdStr && (m.status === 'APPROVED' || !m.status);
          });
        }
        return false;
      });

      list.push({
        id: r._id || r.id || `usr-${name}`,
        fullName: name,
        phone: p,
        skills: skillsStr,
        verified: isVerified,
        areaName: rArea || '',
        isSameCommune: isSame,
        assignedTeamName: assignedTeam ? assignedTeam.name : null,
      });
    });

    return list;
  }, [rescuers, rawTeams, newTeamArea, userAreaName]);

  // Danh sách Cứu hộ viên hiển thị theo bộ lọc cùng xã
  const displayedLeaderCandidates = useMemo(() => {
    if (!filterSameCommuneOnly) return leaderCandidates;
    const sameList = leaderCandidates.filter((c) => c.isSameCommune);
    return sameList.length > 0 ? sameList : leaderCandidates;
  }, [leaderCandidates, filterSameCommuneOnly]);

  // Xử lý khi chọn Chỉ huy Đội trưởng -> Tự động điền SĐT trực ban
  const handleSelectLeader = (leaderId: string) => {
    const found = leaderCandidates.find((c) => c.id === leaderId);
    if (found?.assignedTeamName) {
      toast.warning(
        `Cứu hộ viên ${found.fullName} đã thuộc biên chế của đội "${found.assignedTeamName}". Mỗi người chỉ được thuộc 1 đội duy nhất!`,
        'Nhân sự đã có đội'
      );
      return;
    }
    setSelectedLeaderId(leaderId);
    if (found) {
      setNewTeamLeader(found.fullName);
      setNewTeamPhone(found.phone);
    } else {
      setNewTeamLeader('');
      setNewTeamPhone('');
    }
  };

  const managedArea = useMemo(() => {
    if (isAdmin) return null;
    if (userAreaId) {
      const byId = areas.find((a) => a._id === userAreaId || a.code === userAreaId);
      if (byId) return byId;
    }
    if (userAreaName) {
      const cleanUser = userAreaName.toLowerCase().replace(/^(phường|xã|quận|huyện)\s+/i, '').trim();
      const byName = areas.find((a) => {
        const cleanArea = a.name.toLowerCase().replace(/^(phường|xã|quận|huyện)\s+/i, '').trim();
        return cleanUser && (cleanArea.includes(cleanUser) || cleanUser.includes(cleanArea));
      });
      if (byName) return byName;
    }
    return null;
  }, [areas, isAdmin, userAreaId, userAreaName]);

  const effectiveAreaId = !isAdmin
    ? (managedArea?._id || userAreaId || (userAreaName ? userAreaName : 'ALL'))
    : selectedAreaId;

  useEffect(() => {
    if (!isAdmin && managedArea?._id) {
      setSelectedAreaId(managedArea._id);
    } else if (user?.authority?.areaId) {
      setSelectedAreaId(user.authority.areaId);
    }
  }, [isAdmin, managedArea, user?.authority?.areaId]);

  const refreshData = () => {
    setLoading(true);
    setRefreshIndex((p) => p + 1);
  };

  // Nạp dữ liệu từ backend hoặc fallback
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const areaParam = effectiveAreaId !== 'ALL' ? effectiveAreaId : undefined;
      const [teamsRes, rescuersRes, areasRes] = await Promise.allSettled([
        fetchRescueTeams({ areaId: areaParam, limit: 100 }),
        fetchAdminUsers({ role: 'RESCUER', limit: '100' }),
        fetchAdministrativeAreas(),
      ]);

      if (areasRes.status === 'fulfilled' && areasRes.value.success && Array.isArray(areasRes.value.data)) {
        setAreas(areasRes.value.data);
      }

      if (teamsRes.status === 'fulfilled' && teamsRes.value.success && Array.isArray(teamsRes.value.data)) {
        setRawTeams(teamsRes.value.data);
      } else {
        setRawTeams([]);
      }

      if (rescuersRes.status === 'fulfilled' && rescuersRes.value.success && rescuersRes.value.data?.users) {
        setRescuers(rescuersRes.value.data.users);
      }
    } catch (e) {
      console.warn('Lỗi tải dữ liệu cứu hộ từ DB:', e);
      setRawTeams([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveAreaId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshIndex]);

  // Realtime Socket.IO events
  useEffect(() => {
    const unsubApp = onRescuerApplicationSubmitted((newApplicant) => {
      if (newApplicant?._id) {
        setRescuers((prev) => {
          const exists = prev.some((r) => r._id === newApplicant._id);
          if (exists) return prev;
          return [newApplicant, ...prev];
        });
        toast.info(
          `Có hồ sơ đăng ký cứu hộ mới từ: ${newApplicant.fullName || 'Công dân'}`,
          'Đăng ký mới'
        );
      }
    });

    const unsubVer = onRescuerVerificationChanged((data) => {
      if (data?.userId) {
        setRescuers((prev) =>
          prev.map((r) => {
            if (r._id === data.userId) {
              return {
                ...r,
                rescuer: {
                  ...r.rescuer,
                  verificationStatus: data.status,
                },
              };
            }
            return r;
          })
        );
      }
    });

    const unsubTeams = onRescueTeamsUpdated(() => {
      loadData();
    });

    return () => {
      unsubApp();
      unsubVer();
      unsubTeams();
    };
  }, [loadData]);

  // Tính toán dữ liệu chuẩn hóa EnrichedRescueTeam cho từng đội trực tiếp từ DB
  const enrichedTeams: EnrichedRescueTeam[] = useMemo(() => {
    return rawTeams.map((rawTeam) => {
      // Tên đội chuẩn hóa từ DB
      const teamDisplayName = (rawTeam.name || '').trim();

      // Phân vùng phụ trách cụ thể
      const assignedSector = (rawTeam as any).assignedSector || rawTeam.description || '';

      const teamName = teamDisplayName;
      const leaderObj = typeof rawTeam.leaderId === 'object' && rawTeam.leaderId !== null ? rawTeam.leaderId : null;
      const leaderName = leaderObj?.fullName || '';
      const leaderPhone = leaderObj?.phone || '';

      // Chuyên môn
      let specialization: RescueSpecialization = 'GENERAL_RESCUE';
      const rawType = (rawTeam.type || '').toUpperCase();
      if (rawType.includes('FLOOD') || teamName.toLowerCase().includes('ca-nô') || teamName.toLowerCase().includes('lũ')) {
        specialization = 'FLOOD_RESCUE';
      } else if (rawType.includes('FIRE') || teamName.toLowerCase().includes('pccc') || teamName.toLowerCase().includes('sập')) {
        specialization = 'FIRE_RESCUE';
      } else if (rawType.includes('MEDICAL') || teamName.toLowerCase().includes('y tế') || teamName.toLowerCase().includes('thương')) {
        specialization = 'MEDICAL_RESCUE';
      } else if (rawType.includes('SEARCH') || teamName.toLowerCase().includes('tìm kiếm') || teamName.toLowerCase().includes('sạt lở')) {
        specialization = 'SEARCH_RESCUE';
      }

      // Địa bàn
      const areaObj = typeof rawTeam.areaId === 'object' && rawTeam.areaId !== null ? rawTeam.areaId : null;
      const areaName = (areaObj as any)?.name || (rawTeam as any).areaName || '';

      // Thành viên & Quân số từ DB
      const membersList = Array.isArray(rawTeam.members) ? rawTeam.members : [];
      let pendingMembersCount = 0;
      let availableMembersCount = 0;

      const detailedMembers: TeamMemberDetail[] = membersList.map((m: any, mIdx: number) => {
        const rescuerObj = typeof m.rescuerId === 'object' && m.rescuerId !== null ? m.rescuerId : null;
        const actualRescuerId = rescuerObj?._id || (typeof m.rescuerId === 'string' ? m.rescuerId : m._id || String(mIdx));
        const name = rescuerObj?.fullName || m.fullName || (mIdx === 0 && leaderName ? leaderName : '');
        const phone = rescuerObj?.phone || m.phone || (mIdx === 0 && leaderPhone ? leaderPhone : '');
        const email = rescuerObj?.email || m.email || '';
        const currentLeaderId = rawTeam.leaderId
          ? String(typeof rawTeam.leaderId === 'object' ? (rawTeam.leaderId as any)?._id : rawTeam.leaderId)
          : null;
        const isLeaderOfTeam = currentLeaderId
          ? String(actualRescuerId) === currentLeaderId
          : m.role === 'LEADER';
        const role: 'LEADER' | 'MEMBER' = isLeaderOfTeam ? 'LEADER' : 'MEMBER';
        const memberStatus: 'PENDING' | 'APPROVED' | 'REJECTED' = m.status || 'APPROVED';
        const isVerified = rescuerObj?.rescuer?.verificationStatus === 'VERIFIED' || rescuerObj?.isVerified === true;

        let availabilityStatus: 'AVAILABLE' | 'BUSY' | 'AWAY' = 'AVAILABLE';
        if (m.availabilityStatus) {
          availabilityStatus = m.availabilityStatus;
        } else if (rescuerObj?.rescuer?.availabilityStatus) {
          availabilityStatus = rescuerObj.rescuer.availabilityStatus === 'BUSY' ? 'BUSY' : 'AVAILABLE';
        }

        if (memberStatus === 'PENDING') {
          pendingMembersCount++;
        } else if (availabilityStatus === 'AVAILABLE') {
          availableMembersCount++;
        }

        const rawSkills = rescuerObj?.rescuer?.skills || m.skills || [];
        const skills = Array.isArray(rawSkills) && rawSkills.length > 0
          ? rawSkills.map((s: string) => SKILL_LABELS[s] || s)
          : [];

        const joinedAt = m.joinedAt ? new Date(m.joinedAt).toLocaleDateString('vi-VN') : undefined;

        return {
          _id: rescuerObj?._id || m._id || String(mIdx),
          rescuerId: String(actualRescuerId),
          fullName: name,
          phone,
          email,
          role,
          status: memberStatus,
          isVerified,
          availabilityStatus,
          skills,
          joinedAt,
        };
      });

      const totalMembersCount = detailedMembers.filter((m) => m.status !== 'PENDING').length;

      // Phương tiện & Năng lực từ DB
      const vehiclesList = Array.isArray(rawTeam.vehicles) ? rawTeam.vehicles : [];
      const totalVehiclesCount = vehiclesList.length;
      let availableVehiclesCount = 0;
      const detailedVehicles: TeamVehicleDetail[] = vehiclesList.map((v: any, vIdx: number) => {
        const plate = v.plateNumber || v.plate || '';
        const type = v.type || 'OTHER';
        const capacity = typeof v.capacity === 'number' ? v.capacity : parseInt(v.capacity, 10) || 0;
        const status = v.status || 'AVAILABLE';
        if (status === 'AVAILABLE') availableVehiclesCount++;

        const resolvedName = v.name || plate || VEHICLE_LABELS[type] || 'Phương tiện';
        const resolvedNotes = v.description || v.notes || '';

        return {
          _id: v._id || String(vIdx),
          plateNumber: plate,
          type,
          capacity,
          status,
          name: resolvedName,
          notes: resolvedNotes,
        };
      });

      // Tóm tắt breakdown phương tiện
      const boatCount = detailedVehicles.filter((v) => v.type === 'BOAT').length;
      const truckCount = detailedVehicles.filter((v) => v.type === 'TRUCK').length;
      const ambulanceCount = detailedVehicles.filter((v) => v.type === 'AMBULANCE').length;
      const bikeCount = detailedVehicles.filter((v) => v.type === 'MOTORBIKE').length;

      const breakdownParts: string[] = [];
      if (boatCount > 0) breakdownParts.push(`${boatCount} ca-nô/xuồng`);
      if (truckCount > 0) breakdownParts.push(`${truckCount} xe tải/bán tải`);
      if (ambulanceCount > 0) breakdownParts.push(`${ambulanceCount} xe cứu thương`);
      if (bikeCount > 0) breakdownParts.push(`${bikeCount} xe máy`);
      const vehicleTypeBreakdown = breakdownParts.length > 0 ? breakdownParts.join(', ') : (totalVehiclesCount > 0 ? `${totalVehiclesCount} phương tiện` : 'Chưa có phương tiện');

      // Nhiệm vụ đang chạy (Active missions) chuẩn xác từ DB (nếu có trường assignments gắn kèm trên đội)
      const rawTeamAssignments = Array.isArray((rawTeam as any).assignments)
        ? (rawTeam as any).assignments
        : Array.isArray((rawTeam as any).activeMissions)
          ? (rawTeam as any).activeMissions
          : [];

      const activeMissions: TeamMissionDetail[] = rawTeamAssignments.map((a: any) => ({
        id: a._id || a.id || '',
        sosCode: a.sosCode || (a.sosRequestId ? `SOS #${String(a.sosRequestId).slice(-4)}` : a._id || ''),
        location: a.location || a.locationName || '',
        status: a.status || 'ASSIGNED',
        assignedAt: a.assignedAt ? new Date(a.assignedAt).toLocaleString('vi-VN') : '',
        missionType: a.missionType || a.emergencyType || '',
        description: a.note || a.description || '',
        peopleCount: a.peopleCount ?? a.affectedPeople ?? 0,
      }));

      // Tính toán Trạng thái vận hành thực tế
      let operationalStatus: OperationalStatus = 'READY';
      if (rawTeam.status === 'INACTIVE' || rawTeam.status === 'SUSPENDED') {
        operationalStatus = 'INACTIVE';
      } else if (activeMissions.length > 0) {
        operationalStatus = 'ON_MISSION';
      } else if (
        (totalMembersCount > 0 && availableMembersCount === 0) ||
        (totalVehiclesCount > 0 && availableVehiclesCount === 0) ||
        detailedVehicles.some((v) => v.status === 'MAINTENANCE' && availableVehiclesCount < 1)
      ) {
        operationalStatus = 'LIMITED';
      } else {
        operationalStatus = 'READY';
      }

      // Điểm sẵn sàng tác chiến tính toán tự động từ số liệu thực tế DB
      let readinessScore = 100;
      if (operationalStatus === 'INACTIVE') {
        readinessScore = 0;
      } else {
        const memberRatio = totalMembersCount > 0 ? availableMembersCount / totalMembersCount : 1;
        const vehicleRatio = totalVehiclesCount > 0 ? availableVehiclesCount / totalVehiclesCount : 1;
        readinessScore = Math.round((memberRatio * 50) + (vehicleRatio * 50));
      }

      const activityLogs: TeamActivityLog[] = Array.isArray((rawTeam as any).activityLogs)
        ? (rawTeam as any).activityLogs.map((l: any, lIdx: number) => ({
          id: l._id || l.id || `log-${lIdx}`,
          timestamp: l.timestamp || (l.createdAt ? new Date(l.createdAt).toLocaleString('vi-VN') : ''),
          action: l.action || '',
          actor: l.actor || '',
          detail: l.detail || l.description || '',
        }))
        : [];

      return {
        ...rawTeam,
        name: teamDisplayName,
        assignedSector,
        operationalStatus,
        specialization,
        areaName,
        leaderName,
        leaderPhone,
        totalMembersCount,
        availableMembersCount,
        pendingMembersCount,
        totalVehiclesCount,
        availableVehiclesCount,
        vehicleTypeBreakdown,
        activeMissions,
        allMissions: activeMissions,
        detailedMembers,
        detailedVehicles,
        activityLogs,
        // 100% Trang thiết bị thực tế từ cơ sở dữ liệu MongoDB (không mock, không fallback)
        detailedEquipments: (Array.isArray((rawTeam as any).equipments) ? (rawTeam as any).equipments : []).map((e: any, eIdx: number) => ({
          id: e._id || `eq-${eIdx}`,
          name: e.name || 'Trang thiết bị',
          category: e.category || 'OTHER',
          categoryLabel: EQUIPMENT_CATEGORY_LABELS[e.category] || 'Trang bị cứu hộ',
          quantity: typeof e.quantity === 'number' ? e.quantity : parseInt(e.quantity, 10) || 1,
          unit: e.unit || 'cái',
          status: e.status || 'AVAILABLE',
          condition: e.serialNumber ? `Số hiệu: ${e.serialNumber}` : (e.note || 'Trang thiết bị chuẩn PCTT'),
          notes: e.note || '',
        })),
        totalEquipmentCount: (Array.isArray((rawTeam as any).equipments) ? (rawTeam as any).equipments : []).reduce(
          (acc: number, curr: any) => acc + (typeof curr.quantity === 'number' ? curr.quantity : parseInt(curr.quantity, 10) || 1),
          0
        ),
        headquartersAddress:
          (typeof rawTeam.authorityId === 'object' && rawTeam.authorityId?.name)
            ? rawTeam.authorityId.name
            : (rawTeam.description || ''),
        readinessScore,
      };
    });
  }, [rawTeams]);

  // Tự động đồng bộ thông tin đội đang mở trong Drawer khi enrichedTeams cập nhật lại
  useEffect(() => {
    if (selectedTeamDetail?._id) {
      const freshTeam = enrichedTeams.find((t) => t._id === selectedTeamDetail._id);
      if (freshTeam) {
        setSelectedTeamDetail(freshTeam);
      }
    }
  }, [enrichedTeams, selectedTeamDetail?._id]);

  // Danh sách cứu hộ viên hợp lệ để kết nạp vào đội đang mở drawer
  const availableRescuersToAdd = useMemo(() => {
    if (!selectedTeamDetail) return [];
    const currentMemberIds = new Set(
      selectedTeamDetail.detailedMembers.map((m) => String(m.rescuerId || m._id))
    );
    return leaderCandidates.filter((cand) => !currentMemberIds.has(String(cand.id)));
  }, [selectedTeamDetail, leaderCandidates]);

  // Danh sách các đội cứu hộ thuộc phạm vi phụ trách của cán bộ địa phương (hoặc tất cả nếu là Admin)
  const authorizedTeams = useMemo(() => {
    return enrichedTeams.filter((team) => {
      if (!isAdmin && (managedArea || userAreaName || userAreaId)) {
        const targetAreaId = managedArea?._id || userAreaId;
        const targetAreaName = (userAreaName || managedArea?.name || '')
          .toLowerCase()
          .replace(/^(phường|xã|quận|huyện)\s+/i, '')
          .trim();

        const teamAreaName = (team.areaName || '').toLowerCase();
        const teamNameLower = (team.name || '').toLowerCase();

        const matchId = targetAreaId && (team.areaId === targetAreaId || (team.areaId as any)?._id === targetAreaId);
        const matchName = Boolean(
          targetAreaName &&
          (teamAreaName.includes(targetAreaName) ||
            targetAreaName.includes(teamAreaName) ||
            teamNameLower.includes(targetAreaName))
        );

        if (!matchId && !matchName) return false;
      }
      return true;
    });
  }, [enrichedTeams, isAdmin, managedArea, userAreaName, userAreaId]);

  // Danh sách toàn bộ yêu cầu xin gia nhập các đội cứu hộ cần địa phương phê duyệt
  const allPendingJoinRequests = useMemo(() => {
    const list: Array<{
      teamId: string;
      teamName: string;
      memberId: string;
      rescuerId: string;
      fullName: string;
      phone: string;
      email?: string;
      skills: string[];
      isVerified: boolean;
      joinedAt?: string;
    }> = [];

    authorizedTeams.forEach((team) => {
      (team.detailedMembers || []).forEach((m) => {
        if (m.status === 'PENDING') {
          list.push({
            teamId: team._id,
            teamName: team.name,
            memberId: m._id,
            rescuerId: m.rescuerId,
            fullName: m.fullName,
            phone: m.phone,
            email: m.email,
            skills: m.skills,
            isVerified: m.isVerified,
            joinedAt: m.joinedAt,
          });
        }
      });
    });

    return list;
  }, [authorizedTeams]);

  // Operational KPI Counts (Tính toán thực từ authorizedTeams thuộc phạm vi quản lý)
  const pendingMembersTotal = allPendingJoinRequests.length;

  // Bộ lọc chuyên môn, trạng thái và từ khóa tìm kiếm
  const filteredTeams = useMemo(() => {
    return authorizedTeams.filter((team) => {
      // 1. Lọc theo chuyên môn
      if (specFilter !== 'ALL' && team.specialization !== specFilter) return false;

      // 2. Lọc theo từ khóa tìm kiếm
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const tName = team.name.toLowerCase();
        const lName = team.leaderName.toLowerCase();
        const lPhone = team.leaderPhone.toLowerCase();
        const aName = team.areaName.toLowerCase();
        const specName = SPECIALIZATION_LABELS[team.specialization].toLowerCase();
        const hasMember = team.detailedMembers.some((m) => m.fullName.toLowerCase().includes(q));

        return (
          tName.includes(q) ||
          lName.includes(q) ||
          lPhone.includes(q) ||
          aName.includes(q) ||
          specName.includes(q) ||
          hasMember
        );
      }

      return true;
    });
  }, [authorizedTeams, specFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredTeams.length / pageSize));
  const paginatedTeams = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTeams.slice(start, start + pageSize);
  }, [filteredTeams, currentPage, pageSize]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setSpecFilter('ALL');
    setSelectedAreaId('ALL');
    setCurrentPage(1);
  };

  const [isSubmittingTeam, setIsSubmittingTeam] = useState(false);

  // Tạo đội cứu hộ mới và lưu vào cơ sở dữ liệu MongoDB
  const handleCreateTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) {
      toast.warning('Vui lòng nhập tên đội cứu hộ!', 'Thiếu thông tin');
      return;
    }
    if (!selectedLeaderId) {
      toast.warning('Vui lòng chọn Cứu hộ viên đảm nhiệm Đội trưởng chỉ huy!', 'Thiếu thông tin');
      return;
    }

    const chosenLeader = leaderCandidates.find((c) => c.id === selectedLeaderId);
    if (chosenLeader?.assignedTeamName) {
      toast.warning(
        `Cứu hộ viên "${chosenLeader.fullName}" hiện đã thuộc biên chế của đội "${chosenLeader.assignedTeamName}". Mỗi người chỉ được thuộc 1 đội cứu hộ duy nhất!`,
        'Ràng buộc 1 đội cứu hộ'
      );
      return;
    }

    try {
      setIsSubmittingTeam(true);

      const targetAreaId =
        (effectiveAreaId && effectiveAreaId !== 'ALL' && effectiveAreaId.length === 24)
          ? effectiveAreaId
          : (managedArea?._id || user?.authority?.areaId);

      const payload = {
        name: newTeamName.trim(),
        type: newTeamSpec,
        leaderId: selectedLeaderId,
        areaId: targetAreaId,
        authorityId: user?.authority?.organizationId,
        description: newTeamBase.trim() || `Đội cứu hộ do ${newTeamLeader.trim() || 'chỉ huy'} phụ trách ${newTeamArea.trim() || 'địa bàn'}`,
        members: [
          {
            rescuerId: selectedLeaderId,
            role: 'LEADER',
          },
        ],
      };

      const res = await createRescueTeam(payload);
      if (!res.success && !(res as any)._id && !(res as any).data) {
        throw new Error(res.message || 'Không thể tạo đội cứu hộ trên hệ thống');
      }

      const createdTeam = res.data || (res as any);

      // Nếu có nhập phương tiện ban đầu, tạo và liên kết với đội mới tạo
      if (newVehiclePlate.trim() && createdTeam?._id) {
        try {
          await createVehicle({
            teamId: createdTeam._id,
            type: newVehicleType,
            plateNumber: newVehiclePlate.trim().toUpperCase(),
            capacity: newVehicleCapacity,
            status: 'AVAILABLE',
            description: newTeamNotes.trim() || `Phương tiện ban đầu của ${newTeamName.trim()}`,
          });
        } catch (vehErr) {
          console.warn('Lỗi thêm phương tiện ban đầu:', vehErr);
        }
      }

      toast.success(`Đã thành lập thành công đội: ${newTeamName.trim()}`, 'Tạo đội cứu hộ');
      setIsCreateTeamOpen(false);
      setNewTeamName('');
      setSelectedLeaderId('');
      setNewTeamLeader('');
      setNewTeamPhone('');
      setNewVehiclePlate('');
      setNewTeamNotes('');

      // Tải lại danh sách từ cơ sở dữ liệu
      await loadData();
    } catch (err: any) {
      console.error('Lỗi khi tạo đội cứu hộ:', err);
      toast.error(err.message || 'Có lỗi xảy ra khi tạo đội cứu hộ trên hệ thống!', 'Lỗi');
    } finally {
      setIsSubmittingTeam(false);
    }
  };

  // Thêm / Kết nạp thành viên mới vào đội cứu hộ
  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamDetail) return;
    if (!selectedRescuerToAdd) {
      toast.warning('Vui lòng chọn Cứu hộ viên để kết nạp vào đội!', 'Thiếu thông tin');
      return;
    }

    const chosen = leaderCandidates.find((c) => c.id === selectedRescuerToAdd);
    if (chosen?.assignedTeamName) {
      toast.warning(
        `Cứu hộ viên "${chosen.fullName}" hiện đã thuộc biên chế của đội "${chosen.assignedTeamName}". Mỗi người chỉ được thuộc 1 đội cứu hộ duy nhất!`,
        'Ràng buộc 1 đội cứu hộ'
      );
      return;
    }

    try {
      setIsSubmittingAddMember(true);
      const hasLeaderAlready = Boolean(
        selectedTeamDetail.leaderId ||
        selectedTeamDetail.detailedMembers.some((m) => m.role === 'LEADER')
      );
      const finalRoleToAdd: 'MEMBER' | 'LEADER' = hasLeaderAlready ? 'MEMBER' : memberRoleToAdd;

      const res = await addTeamMember(selectedTeamDetail._id, selectedRescuerToAdd, finalRoleToAdd);

      if (!res.success && !(res as any).data && !(res as any)._id) {
        throw new Error(res.message || 'Không thể kết nạp thành viên vào đội');
      }

      if (!hasLeaderAlready && finalRoleToAdd === 'LEADER') {
        try {
          await changeTeamLeader(selectedTeamDetail._id, selectedRescuerToAdd);
        } catch (leadErr) {
          console.warn('Lỗi bổ nhiệm đội trưởng khi thêm thành viên:', leadErr);
        }
      }

      toast.success(
        `Đã kết nạp cứu hộ viên "${chosen?.fullName || 'mới'}" vào đội ${selectedTeamDetail.name}!`,
        'Kết nạp thành công'
      );
      setIsAddMemberModalOpen(false);
      setSelectedRescuerToAdd('');
      setMemberRoleToAdd('MEMBER');
      await loadData();
    } catch (err: any) {
      console.error('Lỗi khi kết nạp thành viên:', err);
      toast.error(err.message || 'Có lỗi xảy ra khi kết nạp thành viên vào đội!', 'Lỗi');
    } finally {
      setIsSubmittingAddMember(false);
    }
  };

  // Xác nhận xóa thành viên khỏi đội
  const handleConfirmRemoveMember = async () => {
    if (!memberToRemove) return;
    try {
      setIsRemovingMember(true);
      const res = await removeTeamMember(memberToRemove.teamId, memberToRemove.rescuerId);
      if (!res.success && !(res as any).data && !(res as any)._id) {
        throw new Error(res.message || 'Không thể xóa thành viên khỏi đội');
      }

      toast.success(
        `Đã đưa cứu hộ viên "${memberToRemove.rescuerName}" ra khỏi biên chế đội ${memberToRemove.teamName}!`,
        'Thành công'
      );
      setMemberToRemove(null);
      await loadData();
    } catch (err: any) {
      console.error('Lỗi khi xóa thành viên:', err);
      toast.error(err.message || 'Không thể xóa thành viên khỏi đội!', 'Lỗi');
    } finally {
      setIsRemovingMember(false);
    }
  };

  // Xác nhận bổ nhiệm thành viên làm Đội trưởng mới
  const handleConfirmPromoteLeader = async () => {
    if (!memberToPromote) return;
    try {
      setIsPromotingLeader(true);
      const res = await changeTeamLeader(memberToPromote.teamId, memberToPromote.rescuerId);
      if (!res.success && !(res as any).data && !(res as any)._id) {
        throw new Error(res.message || 'Không thể bổ nhiệm đội trưởng');
      }

      toast.success(
        `Đã bổ nhiệm cứu hộ viên "${memberToPromote.rescuerName}" làm Đội trưởng mới của đội!`,
        'Bổ nhiệm thành công'
      );
      setMemberToPromote(null);
      await loadData();
    } catch (err: any) {
      console.error('Lỗi khi bổ nhiệm đội trưởng:', err);
      toast.error(err.message || 'Không thể bổ nhiệm đội trưởng!', 'Lỗi');
    } finally {
      setIsPromotingLeader(false);
    }
  };

  // Helper render huy hiệu chuyên môn
  const renderSpecializationBadge = (spec: RescueSpecialization) => {
    switch (spec) {
      case 'FLOOD_RESCUE':
        return (
          <span className="spec-badge flood">
            <Sailboat size={12} />
            <span>Thủy bộ vượt lũ</span>
          </span>
        );
      case 'SEARCH_RESCUE':
        return (
          <span className="spec-badge search">
            <Compass size={12} />
            <span>Tìm kiếm &amp; Sạt lở</span>
          </span>
        );
      case 'MEDICAL_RESCUE':
        return (
          <span className="spec-badge medical">
            <HeartPulse size={12} />
            <span>Y tế cứu thương</span>
          </span>
        );
      case 'FIRE_RESCUE':
        return (
          <span className="spec-badge fire">
            <Flame size={12} />
            <span>PCCC &amp; CNCH</span>
          </span>
        );
      default:
        return (
          <span className="spec-badge general">
            <Shield size={12} />
            <span>Cứu hộ tổng hợp</span>
          </span>
        );
    }
  };

  // Helper render huy hiệu trạng thái vận hành
  const renderOperationalStatus = (status: OperationalStatus) => {
    const meta = OPERATIONAL_STATUS_LABELS[status] || OPERATIONAL_STATUS_LABELS.READY;
    return (
      <span className={`operational-status-pill ${meta.color}`}>
        <span
          className={`pulse-dot ${status === 'READY'
            ? 'green'
            : status === 'ON_MISSION'
              ? 'amber'
              : status === 'LIMITED'
                ? 'red'
                : 'gray'
            }`}
        />
        <span>{meta.label}</span>
      </span>
    );
  };

  // Xử lý phê duyệt cứu hộ viên (Admin mode)
  const handleVerifyRescuer = async (userId: string, status: 'VERIFIED' | 'REJECTED') => {
    try {
      setVerifyingId(userId);
      await verifyRescuer(userId, status);
      setRescuers((prev) =>
        prev.map((r) => {
          if (r._id === userId) {
            return {
              ...r,
              rescuer: {
                ...r.rescuer,
                verificationStatus: status,
              },
            };
          }
          return r;
        })
      );
      toast.success(
        `Đã cập nhật trạng thái cứu hộ viên thành: ${status === 'VERIFIED' ? 'Đã Xác Minh' : 'Đã Từ Chối'}!`,
        'Phê duyệt thành công'
      );
    } catch (err: any) {
      toast.error(err?.message || 'Không thể cập nhật trạng thái cứu hộ viên', 'Thao tác thất bại');
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="rescuers-executive-container oceanic-executive-theme">
      {currentMode === 'operations' ? (
        <>
          {/* ======================================================== */}
          {/* GỘP CHUNG: TIÊU ĐỀ LỰC LƯỢNG + BỘ LỌC + BẢNG TRONG 1 CARD */}
          {/* ======================================================== */}
          <section className="ra-table-card">
            {/* Toolbar bộ lọc theo chuẩn Duyệt hồ sơ */}
            <div className="ra-toolbar">
              <div className="ra-toolbar-controls">
                {/* Ô tìm kiếm */}
                <div className="ra-search-box">
                  <Search size={15} className="ra-search-icon" />
                  <input
                    type="text"
                    className="ra-search-input"
                    placeholder="Tìm theo tên đội, đội trưởng hoặc chuyên môn..."
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
                  <option value="FIRE_RESCUE">PCCC &amp; CNCH</option>
                  <option value="MEDICAL_RESCUE">Y tế cứu thương</option>
                  <option value="SEARCH_RESCUE">Tìm kiếm cứu nạn</option>
                </select>

                {/* Bộ lọc địa bàn: Chỉ hiển thị khi là Admin quản lý nhiều địa phương */}
                {isAdmin && (
                  <select
                    className="ra-filter-select"
                    value={selectedAreaId}
                    onChange={(e) => {
                      setSelectedAreaId(e.target.value);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="ALL">Tất cả địa bàn</option>
                    {areas.map((area) => (
                      <option key={area._id} value={area._id}>
                        {area.name} ({area.code})
                      </option>
                    ))}
                  </select>
                )}

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {pendingMembersTotal > 0 && (
                    <button
                      type="button"
                      className="coordination-action-btn warning"
                      onClick={() => setIsJoinRequestsModalOpen(true)}
                      title="Xét duyệt đơn xin gia nhập Đội cứu hộ của người cứu trợ"
                      style={{
                        background: '#fef3c7',
                        borderColor: '#f59e0b',
                        color: '#b45309',
                        fontWeight: 700,
                        fontSize: 12.5,
                        padding: '6px 12px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        borderRadius: 6,
                        border: '1px solid #f59e0b',
                        cursor: 'pointer',
                      }}
                    >
                      <UserCheck size={14} />
                      <span>Duyệt TV ({pendingMembersTotal})</span>
                    </button>
                  )}

                  <button
                    className="ra-refresh-btn"
                    onClick={refreshData}
                    title="Cập nhật danh sách mới nhất"
                    disabled={loading}
                  >
                    <RefreshCw size={14} className={loading ? 'spin' : ''} />
                    <span>Làm mới</span>
                  </button>

                  <button
                    type="button"
                    className="coordination-action-btn primary"
                    onClick={() => setIsCreateTeamOpen(true)}
                    style={{
                      background: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '7px 14px',
                      fontWeight: 600,
                      fontSize: 13,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                    }}
                  >
                    <PlusCircle size={15} />
                    <span>+ Thêm đội cứu hộ</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Bảng dữ liệu theo chuẩn ra-table */}
            <div className="ra-table-wrap">
              {loading && filteredTeams.length === 0 ? (
                <div style={{ padding: '20px 0' }}>
                  <div className="ra-skeleton-row" />
                  <div className="ra-skeleton-row" />
                  <div className="ra-skeleton-row" />
                </div>
              ) : paginatedTeams.length === 0 ? (
                <div className="ra-state-container">
                  <div className="ra-state-icon empty">
                    <Shield size={32} />
                  </div>
                  <h3 className="ra-state-title">Không tìm thấy đội cứu hộ nào phù hợp</h3>
                  <p className="ra-state-desc">
                    Vui lòng thử điều chỉnh lại bộ lọc chuyên môn hoặc từ khóa tìm kiếm.
                  </p>
                  <button
                    className="ra-btn ra-btn-secondary"
                    style={{ marginTop: 14 }}
                    onClick={handleClearFilters}
                  >
                    Đặt lại bộ lọc
                  </button>
                </div>
              ) : (
                <table className="ra-table">
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>TÊN ĐỘI &amp; CHUYÊN MÔN</th>
                      <th style={{ width: '16%' }}>CHỈ HUY ĐỘI</th>
                      <th style={{ width: '18%' }}>PHÂN VÙNG PHỤ TRÁCH</th>
                      <th style={{ width: '13%' }}>NHÂN LỰC</th>
                      <th style={{ width: '13%' }}>PHƯƠNG TIỆN</th>
                      <th style={{ width: '10%' }}>NHIỆM VỤ HIỆN TẠI</th>
                      <th style={{ width: '5%', textAlign: 'center' }}>THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTeams.map((team) => {
                      const hasActiveMission = team.activeMissions && team.activeMissions.length > 0;
                      const primaryMission = hasActiveMission ? team.activeMissions[0] : null;

                      let specClass = '';
                      if (team.specialization === 'FLOOD_RESCUE') specClass = 'flood';
                      else if (team.specialization === 'SEARCH_RESCUE') specClass = 'search';
                      else if (team.specialization === 'MEDICAL_RESCUE') specClass = 'medical';
                      else if (team.specialization === 'FIRE_RESCUE') specClass = 'fire';

                      return (
                        <tr
                          key={team._id}
                          onClick={() => handleOpenTeamDetail(team)}
                          style={{ cursor: 'pointer' }}
                          title="Bấm để mở hồ sơ chi tiết và phân công của đội này"
                        >
                          {/* Cột 1: Tên đội & Chuyên môn */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
                                {team.name}
                              </span>
                              <div>
                                <span className={'ra-skill-tag ' + specClass}>
                                  {SPECIALIZATION_LABELS[team.specialization] || team.specialization}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Cột 2: Chỉ huy đội */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>
                                {team.leaderName || 'Chưa phân công'}
                              </span>
                              {team.leaderPhone ? (
                                <a
                                  href={team.leaderPhone.startsWith('0') ? 'tel:' + team.leaderPhone : undefined}
                                  className="leader-phone-pill"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Gọi nhanh cho Đội trưởng"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    fontSize: 11.5,
                                    color: '#0284c7',
                                    background: '#f0f9ff',
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    width: 'fit-content',
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                  }}
                                >
                                  <span>SĐT: {team.leaderPhone}</span>
                                </a>
                              ) : (
                                <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Chưa có SĐT</span>
                              )}
                            </div>
                          </td>

                          {/* Cột 3: Phân vùng phụ trách */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                                <MapPin size={13} color="#0284c7" style={{ flexShrink: 0 }} />
                                <span>{team.assignedSector || team.areaName || 'Địa bàn phụ trách'}</span>
                              </div>
                              <span style={{ fontSize: 11, color: '#64748b', paddingLeft: 18, fontWeight: 500 }}>
                                Trực thuộc địa bàn quản lý
                              </span>
                            </div>
                          </td>

                          {/* Cột 4: Nhân lực */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, color: '#0284c7' }}>
                                <Users size={14} />
                                <span>{team.totalMembersCount} cán bộ</span>
                              </div>
                              <span style={{ fontSize: 11.5, fontWeight: 600, color: team.availableMembersCount > 0 ? '#15803d' : '#dc2626' }}>
                                ({team.availableMembersCount} sẵn sàng)
                              </span>
                              {team.pendingMembersCount > 0 && (
                                <button
                                  type="button"
                                  className="pending-members-badge"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenTeamDetail(team, 'members');
                                  }}
                                  title="Bấm để xem danh sách cứu hộ viên xin gia nhập đội"
                                  style={{
                                    background: '#fef3c7',
                                    border: '1px solid #f59e0b',
                                    color: '#b45309',
                                    borderRadius: 4,
                                    padding: '2px 6px',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    width: 'fit-content',
                                  }}
                                >
                                  +{team.pendingMembersCount} chờ duyệt
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Cột 5: Phương tiện */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#0284c7' }}>
                                <Truck size={14} color="#0284c7" />
                                <span>{team.totalVehiclesCount} phương tiện</span>
                              </div>
                              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                                {team.vehicleTypeBreakdown}
                              </span>
                            </div>
                          </td>

                          {/* Cột 6: Nhiệm vụ hiện tại */}
                          <td>
                            {hasActiveMission && primaryMission ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <span className="active-mission-pill" title={primaryMission.description}>
                                  <Radio size={11} className="animate-pulse" />
                                  <span>{primaryMission.sosCode}</span>
                                </span>
                                {team.activeMissions.length > 1 && (
                                  <span style={{ fontSize: 10.5, color: '#b45309', fontWeight: 700 }}>
                                    +{team.activeMissions.length - 1} nhiệm vụ khác
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="no-mission-pill">Chưa có nhiệm vụ</span>
                            )}
                          </td>

                          {/* Cột 7: Thao tác */}
                          <td onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                              {team.pendingMembersCount > 0 && (
                                <button
                                  type="button"
                                  className="coordination-action-btn warning compact"
                                  style={{ background: '#fffbeb', borderColor: '#f59e0b', color: '#b45309', fontSize: 11.5, padding: '4px 8px', fontWeight: 700 }}
                                  onClick={() => handleOpenTeamDetail(team, 'members')}
                                  title={'Đội này có ' + team.pendingMembersCount + ' cứu hộ viên chờ duyệt gia nhập'}
                                >
                                  <UserCheck size={12} />
                                  <span>Duyệt TV ({team.pendingMembersCount})</span>
                                </button>
                              )}
                              <button
                                type="button"
                                className="ra-view-btn"
                                onClick={() => handleOpenTeamDetail(team)}
                                title="Xem hồ sơ chi tiết và phân công của đội này"
                              >
                                <Eye size={13} />
                                <span>Chi tiết</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Phân trang theo chuẩn ra-pagination */}
            <div className="ra-pagination">
              <div className="ra-pagination-left">
                <span>
                  Hiển thị{' '}
                  <strong>
                    {filteredTeams.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}
                  </strong>{' '}
                  -{' '}
                  <strong>
                    {Math.min(currentPage * pageSize, filteredTeams.length)}
                  </strong>{' '}
                  trên tổng số <strong>{filteredTeams.length}</strong> đội
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
                        className={'ra-page-btn ' + (pg === currentPage ? 'active' : '')}
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
        </>
      ) : (
        /* GIAO DIỆN XÁC MINH CỨU HỘ VIÊN (ADMIN MODE) */
        <div className="executive-table-card">
          <div className="executive-table-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileCheck size={18} color="#0284C7" />
                <span style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>
                  HỒ SƠ ĐĂNG KÝ CỨU HỘ VIÊN
                </span>
                <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>
                  ({rescuers.length} hồ sơ)
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="executive-search-input-wrap">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Tìm hồ sơ cứu hộ, địa bàn, CCCD, SĐT..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="coordination-action-btn outline"
                onClick={refreshData}
                title="Cập nhật danh sách mới nhất"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span>Làm mới</span>
              </button>
            </div>
          </div>

          <div className="executive-table-scroll">
            <table className="executive-table">
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>Ứng Viên &amp; Liên Hệ</th>
                  <th style={{ width: '15%' }}>Định Danh CCCD</th>
                  <th style={{ width: '18%' }}>Địa Bàn Đăng Ký</th>
                  <th style={{ width: '18%' }}>Kỹ Năng Cứu Nạn</th>
                  <th style={{ width: '12%' }}>Trạng Thái</th>
                  <th style={{ width: '12%', textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {rescuers.map((r) => (
                  <tr
                    key={r._id}
                    className="executive-table-row"
                    onClick={(e) => { e.stopPropagation(); setSelectedApplicantDetail(r); }}
                    style={{ cursor: 'pointer' }}
                    title="Bấm để xem hồ sơ thẩm định"
                  >
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, color: '#0F172A' }}>{r.fullName}</span>
                        <span style={{ fontSize: 12, color: '#64748B' }}>{r.phone}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#475569' }}>
                        {r.rescuer?.idNumber || 'Chưa cập nhật'}
                      </span>
                    </td>
                    <td>
                      <span>{r.rescuer?.areaName || r.address || 'Chưa cập nhật'}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: '#0284C7', fontWeight: 600 }}>
                        {(r.rescuer?.skills || []).join(', ') || 'Chưa cập nhật'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`rescuer-status-badge ${r.rescuer?.verificationStatus === 'VERIFIED' ? 'available' : 'busy'
                          }`}
                      >
                        {r.rescuer?.verificationStatus === 'VERIFIED' ? 'Đã duyệt' : 'Chờ duyệt'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="coordination-action-btn compact outline"
                        onClick={() => setSelectedApplicantDetail(r)}
                      >
                        <Eye size={12} />
                        <span>Xem</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. TEAM DETAIL DRAWER / MODAL (5 TABS)                  */}
      {/* ======================================================== */}
      {selectedTeamDetail && (
        <div
          className={`team-drawer-backdrop ${isDrawerClosing ? 'closing' : 'open'}`}
          onClick={handleCloseTeamDetail}
        >
          <div
            className={`team-drawer-container ${isDrawerClosing ? 'closing' : 'open'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="team-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="kpi-icon-squircle blue" style={{ width: 44, height: 44 }}>
                  <Shield size={22} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0F172A' }}>
                      {selectedTeamDetail.name}
                    </h3>
                    {renderSpecializationBadge(selectedTeamDetail.specialization)}
                  </div>

                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {selectedTeamDetail.status === 'ACTIVE' ? (
                  <button
                    type="button"
                    className="coordination-action-btn outline compact"
                    onClick={() => handleUpdateTeamStatus(selectedTeamDetail._id, 'INACTIVE')}
                    disabled={actionInProgress === selectedTeamDetail._id}
                    title="Tạm ngưng hoạt động của đội"
                    style={{ fontSize: 11.5, color: '#DC2626', borderColor: '#FECACA' }}
                  >
                    Tạm dừng đội
                  </button>
                ) : (
                  <button
                    type="button"
                    className="coordination-action-btn primary compact"
                    onClick={() => handleUpdateTeamStatus(selectedTeamDetail._id, 'ACTIVE')}
                    disabled={actionInProgress === selectedTeamDetail._id}
                    title="Kích hoạt lại đội sẵn sàng tác chiến"
                    style={{ fontSize: 11.5 }}
                  >
                    Kích hoạt đội
                  </button>
                )}
                <button
                  type="button"
                  className="coordination-action-btn outline compact"
                  onClick={() => handleDeleteTeam(selectedTeamDetail)}
                  disabled={actionInProgress === selectedTeamDetail._id}
                  title="Giải thể và xóa đội cứu hộ này"
                  style={{ fontSize: 11.5, color: '#DC2626', borderColor: '#FECACA', background: '#FEF2F2' }}
                >
                  <Trash2 size={13} />
                  <span>Xóa đội</span>
                </button>
                <button
                  type="button"
                  className="executive-toggle-btn"
                  onClick={handleCloseTeamDetail}
                  title="Đóng hồ sơ (Esc)"
                >
                  <X size={16} />
                </button>
              </div>
            </div>


            {/* 5 Tabs Navigation Bar */}
            <div className="team-drawer-tabs-bar">
              <button
                type="button"
                className={`team-drawer-tab-btn ${detailActiveTab === 'overview' ? 'active' : ''}`}
                onClick={() => setDetailActiveTab('overview')}
              >
                <Info size={14} />
                <span>Tổng quan</span>
              </button>

              <button
                type="button"
                className={`team-drawer-tab-btn ${detailActiveTab === 'members' ? 'active' : ''}`}
                onClick={() => setDetailActiveTab('members')}
              >
                <Users size={14} />
                <span>Thành viên</span>
                <span className="team-drawer-tab-count">{selectedTeamDetail.totalMembersCount}</span>
                {selectedTeamDetail.pendingMembersCount > 0 && (
                  <span className="tab-pending-badge" title="Có thành viên chờ duyệt">
                    {selectedTeamDetail.pendingMembersCount} chờ
                  </span>
                )}
              </button>

              <button
                type="button"
                className={`team-drawer-tab-btn ${detailActiveTab === 'vehicles' ? 'active' : ''}`}
                onClick={() => setDetailActiveTab('vehicles')}
              >
                <Truck size={14} />
                <span>Phương tiện</span>
                <span className="team-drawer-tab-count">{selectedTeamDetail.totalVehiclesCount}</span>
              </button>

              <button
                type="button"
                className={`team-drawer-tab-btn ${detailActiveTab === 'equipment' ? 'active' : ''}`}
                onClick={() => setDetailActiveTab('equipment')}
              >
                <Package size={14} />
                <span>Trang thiết bị</span>
                <span className="team-drawer-tab-count">{selectedTeamDetail.detailedEquipments?.length || 0}</span>
              </button>

              <button
                type="button"
                className={`team-drawer-tab-btn ${detailActiveTab === 'missions' ? 'active' : ''}`}
                onClick={() => setDetailActiveTab('missions')}
              >
                <Compass size={14} />
                <span>Nhiệm vụ</span>
                <span className="team-drawer-tab-count">{selectedTeamDetail.allMissions.length}</span>
              </button>

              <button
                type="button"
                className={`team-drawer-tab-btn ${detailActiveTab === 'history' ? 'active' : ''}`}
                onClick={() => setDetailActiveTab('history')}
              >
                <History size={14} />
                <span>Lịch sử hoạt động</span>
              </button>
            </div>

            {/* Drawer Body Content */}
            <div className="team-drawer-content">
              {/* TAB 1: TỔNG QUAN */}
              {detailActiveTab === 'overview' && (
                <>
                  {selectedTeamDetail.pendingMembersCount > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: '#FFFBEB',
                        border: '1px solid #FCD34D',
                        borderRadius: 10,
                        marginBottom: 16,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Clock size={18} color="#D97706" />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>
                            Đội có {selectedTeamDetail.pendingMembersCount} yêu cầu xin gia nhập đang chờ địa phương phê duyệt
                          </div>
                          <div style={{ fontSize: 12, color: '#B45309' }}>
                            Chuyển qua tab "Thành viên" để xem hồ sơ và phê duyệt hoặc từ chối kết nạp.
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="coordination-action-btn primary compact"
                        onClick={() => setDetailActiveTab('members')}
                        style={{ background: '#D97706', borderColor: '#D97706', fontSize: 12, whiteSpace: 'nowrap' }}
                      >
                        Xem và duyệt ngay
                      </button>
                    </div>
                  )}

                  {/* 4 Stat Cards */}
                  <div className="drawer-stat-grid">
                    <div className="drawer-stat-card">
                      <span className="drawer-stat-label">Tổng quân số</span>
                      <span className="drawer-stat-val">{selectedTeamDetail.totalMembersCount} cán bộ</span>
                      <span className="drawer-stat-hint">{selectedTeamDetail.availableMembersCount} sẵn sàng</span>
                    </div>

                    <div className="drawer-stat-card">
                      <span className="drawer-stat-label">Phương tiện</span>
                      <span className="drawer-stat-val">{selectedTeamDetail.totalVehiclesCount} chiếc</span>
                      <span className="drawer-stat-hint">{selectedTeamDetail.availableVehiclesCount} sẵn sàng</span>
                    </div>

                    <div className="drawer-stat-card" style={{ cursor: 'pointer' }} onClick={() => setDetailActiveTab('equipment')}>
                      <span className="drawer-stat-label">Trang thiết bị</span>
                      <span className="drawer-stat-val">{selectedTeamDetail.detailedEquipments?.length || 0} danh mục</span>
                      <span className="drawer-stat-hint" style={{ color: '#0284C7' }}>
                        {selectedTeamDetail.totalEquipmentCount || 0} đơn vị sẵn sàng ↗
                      </span>
                    </div>

                    <div className="drawer-stat-card">
                      <span className="drawer-stat-label">Nhiệm vụ đang chạy</span>
                      <span className="drawer-stat-val">{selectedTeamDetail.activeMissions.length} ca</span>
                      <span className="drawer-stat-hint">
                        {selectedTeamDetail.activeMissions.length > 0 ? 'Đang tác chiến' : 'Chưa có ca'}
                      </span>
                    </div>

                    <div className="drawer-stat-card">
                      <span className="drawer-stat-label">Trạng thái</span>
                      <div style={{ marginTop: 4 }}>
                        {renderOperationalStatus(selectedTeamDetail.operationalStatus)}
                      </div>
                    </div>
                  </div>

                  {/* Thông tin chỉ huy & Trụ sở */}
                  <div className="dossier-card">
                    <div className="dossier-card-title">
                      <Shield size={14} color="#0284C7" />
                      <span>Thông tin tổ chức &amp; Trực chiến</span>
                    </div>
                    <div className="dossier-item">
                      <span className="dossier-item-label">Chỉ huy Đội trưởng</span>
                      <span className="dossier-item-value">{selectedTeamDetail.leaderName || 'Chưa phân công'}</span>
                    </div>
                    <div className="dossier-item">
                      <span className="dossier-item-label">Số điện thoại khẩn cấp</span>
                      <span className="dossier-item-value">
                        {selectedTeamDetail.leaderPhone ? (
                          <a href={`tel:${selectedTeamDetail.leaderPhone}`} style={{ color: '#0284C7', textDecoration: 'none' }}>
                            {selectedTeamDetail.leaderPhone}
                          </a>
                        ) : (
                          'Chưa cập nhật'
                        )}
                      </span>
                    </div>
                    <div className="dossier-item">
                      <span className="dossier-item-label">Phân vùng phụ trách</span>
                      <span className="dossier-item-value">
                        {selectedTeamDetail.assignedSector
                          ? (selectedTeamDetail.areaName ? `${selectedTeamDetail.assignedSector} (${selectedTeamDetail.areaName})` : selectedTeamDetail.assignedSector)
                          : (selectedTeamDetail.areaName || 'Địa bàn phụ trách')}
                      </span>
                    </div>
                    <div className="dossier-item">
                      <span className="dossier-item-label">Trụ sở trực chiến / Tập kết</span>
                      <span className="dossier-item-value">{selectedTeamDetail.headquartersAddress || 'Chưa cập nhật'}</span>
                    </div>
                    <div className="dossier-item">
                      <span className="dossier-item-label">Cơ cấu phương tiện</span>
                      <span className="dossier-item-value">{selectedTeamDetail.vehicleTypeBreakdown}</span>
                    </div>
                    <div className="dossier-item">
                      <span className="dossier-item-label">Trang thiết bị chuyên dụng</span>
                      <span className="dossier-item-value" style={{ color: '#0F172A', fontWeight: 600 }}>
                        {selectedTeamDetail.detailedEquipments?.map((eq) => `${eq.name} (${eq.quantity} ${eq.unit})`).slice(0, 3).join(', ')}
                        {(selectedTeamDetail.detailedEquipments?.length || 0) > 3 ? `, +${(selectedTeamDetail.detailedEquipments?.length || 0) - 3} trang bị khác...` : ''}
                      </span>
                    </div>
                  </div>

                  {/* Active Mission Preview Card */}
                  {selectedTeamDetail.activeMissions.length > 0 ? (
                    <div className="drawer-mission-card active-mission">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="active-mission-pill">
                            <Radio size={12} className="animate-pulse" />
                            <span>{selectedTeamDetail.activeMissions[0].sosCode}</span>
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>
                            {selectedTeamDetail.activeMissions[0].missionType}
                          </span>
                        </div>
                        <span className="operational-status-pill on_mission">Đang thực địa</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>
                        {selectedTeamDetail.activeMissions[0].description}
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#64748B' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <MapPin size={13} color="#0284C7" />
                          <span>{selectedTeamDetail.activeMissions[0].location}</span>
                        </div>
                        <button
                          type="button"
                          className="coordination-action-btn compact outline"
                          onClick={() => setDetailActiveTab('missions')}
                        >
                          <span>Xem chi tiết nhiệm vụ</span>
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '14px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, color: '#64748B' }}>
                      🛡️ Hiện tại đội chưa tiếp nhận nhiệm vụ mới. Đội sẵn sàng nhận lệnh điều phối cứu nạn khi có yêu cầu khẩn cấp.
                    </div>
                  )}
                </>
              )}

              {/* TAB 2: THÀNH VIÊN */}
              {detailActiveTab === 'members' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* DANH SÁCH ỨNG VIÊN CHỜ DUYỆT GIA NHẬP ĐỘI */}
                  {selectedTeamDetail.detailedMembers.filter((m) => m.status === 'PENDING').length > 0 && (
                    <div className="pending-members-section">
                      <div className="pending-members-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Clock size={16} color="#D97706" />
                          <span style={{ fontWeight: 800, fontSize: 13.5, color: '#92400E' }}>
                            Yêu cầu xin gia nhập đội chờ địa phương phê duyệt (
                            {selectedTeamDetail.detailedMembers.filter((m) => m.status === 'PENDING').length}
                            )
                          </span>
                        </div>
                        <span style={{ fontSize: 11.5, color: '#B45309', fontWeight: 500 }}>
                          Cứu hộ viên đã nộp đơn đăng ký tham gia đội này
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                        {selectedTeamDetail.detailedMembers
                          .filter((m) => m.status === 'PENDING')
                          .map((member) => (
                            <div key={member._id} className="drawer-member-card pending">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div className="applicant-avatar" style={{ width: 42, height: 42, fontSize: 14, background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}>
                                  {member.fullName[0]?.toUpperCase() || 'U'}
                                </div>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>
                                      {member.fullName}
                                    </span>
                                    <span className="member-role-badge pending">
                                      Ứng tuyển vào đội
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                    <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>SĐT:</span>
                                    <a href={`tel:${member.phone}`} style={{ fontSize: 12.5, color: '#0284C7', textDecoration: 'none', fontWeight: 700 }}>
                                      {member.phone || 'Chưa có SĐT'}
                                    </a>
                                    {member.joinedAt && (
                                      <span style={{ fontSize: 11.5, color: '#94A3B8', marginLeft: 6 }}>
                                        • Ngày nộp: {member.joinedAt}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B', whiteSpace: 'nowrap' }}>
                                      Kỹ năng:
                                    </span>
                                    <span style={{ fontSize: 12, color: '#334155', fontWeight: 500 }}>
                                      {member.skills && member.skills.length > 0 ? member.skills.join(', ') : 'Chưa cập nhật'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                                <span className={`verification-status-pill ${member.isVerified ? 'verified' : 'unverified'}`}>
                                  <ShieldCheck size={12} />
                                  <span>{member.isVerified ? 'Cứu hộ viên hợp lệ' : 'Chưa duyệt tư cách'}</span>
                                </span>

                                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                  <button
                                    type="button"
                                    className="member-action-btn reject"
                                    onClick={() => handleUpdateMemberStatus(selectedTeamDetail._id, member.rescuerId, 'REJECTED')}
                                    disabled={actionInProgress === `${selectedTeamDetail._id}-${member.rescuerId}`}
                                    title="Từ chối yêu cầu gia nhập của cứu hộ viên này"
                                  >
                                    <X size={12} />
                                    <span>Từ chối</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="member-action-btn approve"
                                    onClick={() => handleUpdateMemberStatus(selectedTeamDetail._id, member.rescuerId, 'APPROVED')}
                                    disabled={actionInProgress === `${selectedTeamDetail._id}-${member.rescuerId}`}
                                    title="Chấp thuận kết nạp cứu hộ viên vào đội này"
                                  >
                                    <Check size={12} />
                                    <span>Duyệt vào đội</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* DANH SÁCH THÀNH VIÊN CHÍNH THỨC */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
                        Thành viên chính thức ({selectedTeamDetail.detailedMembers.filter((m) => m.status !== 'PENDING').length})
                      </span>
                      <button
                        type="button"
                        className="coordination-action-btn primary compact"
                        onClick={() => {
                          setSelectedRescuerToAdd('');
                          setMemberRoleToAdd('MEMBER');
                          setIsAddMemberModalOpen(true);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          padding: '6px 12px',
                          borderRadius: 8,
                          cursor: 'pointer',
                        }}
                      >
                        <UserPlus size={14} />
                        <span>Kết nạp thành viên</span>
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {selectedTeamDetail.detailedMembers
                        .filter((m) => m.status !== 'PENDING')
                        .map((member) => {
                          const isLeader = member.role === 'LEADER';
                          return (
                            <div key={member._id} className="drawer-member-card">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                                <div className="applicant-avatar" style={{ width: 40, height: 40, fontSize: 14 }}>
                                  {member.fullName[0]?.toUpperCase()}
                                </div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>
                                      {member.fullName}
                                    </span>
                                    <span className={`member-role-badge ${member.role.toLowerCase()}`}>
                                      {isLeader ? 'Đội trưởng' : 'Thành viên'}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                    <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>SĐT:</span>
                                    <a href={`tel:${member.phone}`} style={{ fontSize: 12.5, color: '#0284C7', textDecoration: 'none', fontWeight: 700 }}>
                                      {member.phone}
                                    </a>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B', whiteSpace: 'nowrap' }}>
                                      Kỹ năng:
                                    </span>
                                    <span style={{ fontSize: 12, color: '#334155', fontWeight: 500, lineHeight: 1.5 }}>
                                      {member.skills && member.skills.length > 0 ? member.skills.join(', ') : 'Chưa cập nhật'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span className={`verification-status-pill ${member.isVerified ? 'verified' : 'unverified'}`}>
                                    <ShieldCheck size={12} />
                                    <span>{member.isVerified ? 'Đã xác minh' : 'Chưa duyệt'}</span>
                                  </span>

                                  <span className={`availability-status-pill ${member.availabilityStatus.toLowerCase()}`}>
                                    <span className="live-dot" style={{ width: 5, height: 5 }} />
                                    <span>
                                      {member.availabilityStatus === 'AVAILABLE'
                                        ? 'Sẵn sàng'
                                        : member.availabilityStatus === 'BUSY'
                                          ? 'Đang tác chiến'
                                          : 'Tạm vắng / Nghỉ'}
                                    </span>
                                  </span>
                                </div>

                                {/* Các nút Thao tác CRUD thành viên */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                  {!isLeader && (
                                    <button
                                      type="button"
                                      className="coordination-action-btn compact outline"
                                      onClick={() =>
                                        setMemberToPromote({
                                          teamId: selectedTeamDetail._id,
                                          teamName: selectedTeamDetail.name,
                                          rescuerId: member.rescuerId || member._id,
                                          rescuerName: member.fullName,
                                        })
                                      }
                                      title="Bổ nhiệm cứu hộ viên này làm Đội trưởng chỉ huy"
                                      style={{
                                        fontSize: 11.5,
                                        padding: '4px 8px',
                                        color: '#B45309',
                                        borderColor: '#FDE68A',
                                        background: '#FFFBEB',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <Crown size={12} color="#D97706" />
                                      <span>Lên Đội trưởng</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    className="coordination-action-btn compact outline"
                                    onClick={() =>
                                      setMemberToRemove({
                                        teamId: selectedTeamDetail._id,
                                        teamName: selectedTeamDetail.name,
                                        rescuerId: member.rescuerId || member._id,
                                        rescuerName: member.fullName,
                                        role: member.role,
                                      })
                                    }
                                    title="Xóa thành viên khỏi biên chế đội cứu hộ"
                                    style={{
                                      fontSize: 11.5,
                                      padding: '4px 8px',
                                      color: '#DC2626',
                                      borderColor: '#FECACA',
                                      background: '#FEF2F2',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <UserMinus size={12} color="#DC2626" />
                                    <span>Xóa khỏi đội</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB TRANG THIẾT BỊ BIÊN CHẾ */}
              {detailActiveTab === 'equipment' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Summary banner */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CheckCircle2 size={18} color="#16A34A" />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>
                          Biên chế đầy đủ {selectedTeamDetail.detailedEquipments?.length || 0} danh mục trang thiết bị chuyên dụng
                        </div>
                        <div style={{ fontSize: 12, color: '#15803D' }}>
                          Tổng cộng {selectedTeamDetail.totalEquipmentCount || 0} đơn vị trang bị đạt chuẩn sẵn sàng tác chiến bão lũ PCTT.
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="coordination-action-btn outline compact"
                      onClick={() => handleNavigateToResources('SUPPLIES')}
                      title="Mở màn hình Phương tiện & Vật tư và tự động lọc khí tài của đội này"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        padding: '6px 12px',
                        background: '#FFFFFF',
                        borderColor: '#86EFAC',
                        color: '#15803D',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        borderRadius: 6,
                        boxShadow: '0 1px 2px rgba(22, 101, 52, 0.08)',
                      }}
                    >
                      <Package size={13} />
                      <span>Xem kho vật tư của đội</span>
                      <ExternalLink size={12} />
                    </button>
                  </div>

                  {/* List of Equipments */}
                  {(selectedTeamDetail.detailedEquipments?.length || 0) === 0 ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 10 }}>
                      <Package size={36} color="#94A3B8" style={{ margin: '0 auto 10px', display: 'block' }} />
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#475569' }}>
                        Đội hiện chưa được cấp phát trang thiết bị từ Kho dự trữ địa phương
                      </div>
                      <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 4 }}>
                        Trang thiết bị cấp phát từ module Phương tiện &amp; Vật tư sẽ tự động hiển thị tại đây theo dữ liệu thực từ MongoDB.
                      </div>
                      <button
                        type="button"
                        className="coordination-action-btn outline compact"
                        onClick={() => handleNavigateToResources('SUPPLIES')}
                        style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <ExternalLink size={13} />
                        <span>Cấp phát từ Kho Phương tiện &amp; Vật tư</span>
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                      {selectedTeamDetail.detailedEquipments?.map((eq, eIdx) => {
                        const isSafety = eq.category === 'SAFETY';
                        const isMedical = eq.category === 'MEDICAL';
                        const isComms = eq.category === 'COMMUNICATION';

                        return (
                          <div
                            key={eq.id || eIdx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '12px 16px',
                              background: '#FFFFFF',
                              border: '1px solid #E2E8F0',
                              borderRadius: 10,
                              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div
                                style={{
                                  width: 40,
                                  height: 40,
                                  borderRadius: 10,
                                  background: isSafety ? '#EFF6FF' : isMedical ? '#FEF2F2' : isComms ? '#F0FDF4' : '#F8FAFC',
                                  color: isSafety ? '#0284C7' : isMedical ? '#DC2626' : isComms ? '#16A34A' : '#64748B',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                {isSafety && <LifeBuoy size={20} />}
                                {isMedical && <HeartPulse size={20} />}
                                {isComms && <Radio size={20} />}
                                {!isSafety && !isMedical && !isComms && <Wrench size={20} />}
                              </div>

                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>
                                    {eq.name}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      padding: '2px 8px',
                                      borderRadius: 4,
                                      background: '#F1F5F9',
                                      color: '#475569',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {eq.categoryLabel}
                                  </span>
                                </div>
                                <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>
                                  Quy cách: {eq.condition}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                              <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: 15, fontWeight: 800, color: '#0284C7' }}>
                                  {eq.quantity}
                                </span>
                                <span style={{ fontSize: 12, color: '#64748B', marginLeft: 4 }}>
                                  {eq.unit}
                                </span>
                              </div>

                              <span
                                style={{
                                  padding: '3px 9px',
                                  borderRadius: 9999,
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                  background: '#DCFCE7',
                                  color: '#166534',
                                  border: '1px solid #BBF7D0',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A' }} />
                                Sẵn sàng
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: PHƯƠNG TIỆN */}
              {detailActiveTab === 'vehicles' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Thanh điều hướng sang module Phương tiện & Vật tư */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: '#F0F9FF',
                      border: '1px solid #BAE6FD',
                      borderRadius: 10,
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 8,
                          background: '#E0F2FE',
                          color: '#0284C7',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Truck size={20} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0369A1' }}>
                          Biên chế phương tiện ({selectedTeamDetail.detailedVehicles.length} phương tiện)
                        </div>
                        <div style={{ fontSize: 12, color: '#0284C7' }}>
                          Quản lý, điều động và bảo dưỡng phương tiện của đội
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="coordination-action-btn primary compact"
                      onClick={() => handleNavigateToResources('VEHICLES')}
                      title="Mở màn hình Phương tiện & Vật tư và tự động lọc phương tiện của đội này"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12.5,
                        padding: '7px 14px',
                        borderRadius: 8,
                        background: '#0284C7',
                        borderColor: '#0284C7',
                        color: '#FFFFFF',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 1px 2px rgba(2, 132, 199, 0.25)',
                      }}
                    >
                      <Truck size={14} />
                      <span>Xem kho phương tiện &amp; vật tư</span>
                      <ExternalLink size={13} />
                    </button>
                  </div>

                  {selectedTeamDetail.detailedVehicles.length === 0 ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 10 }}>
                      <Truck size={36} color="#94A3B8" style={{ margin: '0 auto 10px', display: 'block' }} />
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#475569' }}>
                        Đội hiện chưa được biên chế phương tiện
                      </div>
                      <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 4 }}>
                        Bạn có thể chuyển sang module Phương tiện &amp; Vật tư để cấp phát xe hoặc ca-nô cho đội này.
                      </div>
                      <button
                        type="button"
                        className="coordination-action-btn outline compact"
                        onClick={() => handleNavigateToResources('VEHICLES')}
                        style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <ExternalLink size={13} />
                        <span>Mở module Phương tiện &amp; Vật tư</span>
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {selectedTeamDetail.detailedVehicles.map((veh) => {
                        const isBoat = veh.type === 'BOAT';
                        const isBike = veh.type === 'MOTORBIKE';
                        const isAmbulance = veh.type === 'AMBULANCE';
                        const isTruck = veh.type === 'TRUCK';

                        return (
                          <div key={veh._id} className="drawer-vehicle-card">
                            <div className="drawer-vehicle-main-row">
                              <div className={`drawer-vehicle-icon-squircle ${veh.type.toLowerCase()}`}>
                                {isBoat && <Sailboat size={20} />}
                                {isBike && <Bike size={20} />}
                                {isAmbulance && <HeartPulse size={20} />}
                                {isTruck && <Truck size={20} />}
                                {!isBoat && !isBike && !isAmbulance && !isTruck && <Compass size={20} />}
                              </div>

                              <div className="drawer-vehicle-info-col">
                                <div className="drawer-vehicle-header-line">
                                  <div className="drawer-vehicle-title-wrap">
                                    <span className="vehicle-plate-box">{veh.plateNumber}</span>
                                    <span className="drawer-vehicle-name-text">{veh.name}</span>
                                  </div>

                                  <span
                                    className={`operational-status-pill ${veh.status === 'AVAILABLE'
                                      ? 'ready'
                                      : veh.status === 'IN_USE'
                                        ? 'on_mission'
                                        : veh.status === 'MAINTENANCE'
                                          ? 'limited'
                                          : 'inactive'
                                      }`}
                                  >
                                    <span
                                      className={`pulse-dot ${veh.status === 'AVAILABLE'
                                        ? 'green'
                                        : veh.status === 'IN_USE'
                                          ? 'amber'
                                          : 'red'
                                        }`}
                                    />
                                    <span>
                                      {veh.status === 'AVAILABLE'
                                        ? 'Sẵn sàng'
                                        : veh.status === 'IN_USE'
                                          ? 'Đang tác chiến'
                                          : veh.status === 'MAINTENANCE'
                                            ? 'Đang bảo trì'
                                            : 'Ngừng hoạt động'}
                                    </span>
                                  </span>
                                </div>

                                <div className="drawer-vehicle-specs-row">
                                  <span className="vehicle-spec-chip type-chip">
                                    {VEHICLE_LABELS[veh.type] || veh.type}
                                  </span>
                                  <span className="vehicle-spec-chip capacity-chip">
                                    <Users size={12} />
                                    <span>Sức chở: <strong>{veh.capacity} người</strong></span>
                                  </span>
                                </div>
                              </div>
                            </div>

                            {veh.notes && (
                              <div className="vehicle-desc-callout">
                                <span className="callout-indicator" />
                                <span className="callout-text">{veh.notes}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: NHIỆM VỤ */}
              {detailActiveTab === 'missions' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                      Lịch sử phân công cứu nạn ({selectedTeamDetail.allMissions.length} ca)
                    </span>
                    <button
                      type="button"
                      className="coordination-action-btn primary compact"
                      onClick={() => {
                        setSelectedTeamDetail(null);
                        window.history.pushState(null, '', '/localauthor/coordination');
                        window.dispatchEvent(new PopStateEvent('popstate'));
                      }}
                      title="Mở phân hệ điều phối tác chiến"
                    >
                      <ExternalLink size={12} />
                      <span>Mở module điều phối cứu hộ</span>
                    </button>
                  </div>

                  {selectedTeamDetail.allMissions.length === 0 ? (
                    <div className="operations-empty-state" style={{ padding: '30px 20px' }}>
                      <Compass size={32} color="#94A3B8" />
                      <p style={{ margin: '8px 0 0', fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                        Chưa có nhiệm vụ nào được phân công
                      </p>
                      <p style={{ margin: 0, fontSize: 12.5, color: '#64748B' }}>
                        Đội đang trực chiến sẵn sàng tiếp nhận yêu cầu SOS cứu hộ thực địa.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {selectedTeamDetail.allMissions.map((mission) => (
                        <div
                          key={mission.id}
                          className={`drawer-mission-card ${mission.status === 'ON_SCENE' ? 'active-mission' : ''}`}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="active-mission-pill">
                                <span>{mission.sosCode}</span>
                              </span>
                              <span style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>
                                {mission.missionType}
                              </span>
                            </div>
                            <span
                              className={`operational-status-pill ${mission.status === 'COMPLETED' ? 'ready' : 'on_mission'
                                }`}
                            >
                              {mission.status === 'COMPLETED' ? 'Đã hoàn thành' : 'Đang tác chiến'}
                            </span>
                          </div>

                          <p style={{ margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
                            {mission.description}
                          </p>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#64748B', borderTop: '1px solid #F1F5F9', paddingTop: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <MapPin size={13} color="#0284C7" />
                              <span>{mission.location}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={13} />
                              <span>Thời gian: {mission.assignedAt}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* TAB 5: LỊCH SỬ HOẠT ĐỘNG */}
              {detailActiveTab === 'history' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                      Nhật ký sự kiện &amp; Thay đổi biên chế
                    </span>
                    <span style={{ fontSize: 12, color: '#64748B' }}>Dòng thời gian tác chiến</span>
                  </div>

                  {selectedTeamDetail.activityLogs.length === 0 ? (
                    <div className="operations-empty-state" style={{ padding: '30px 20px' }}>
                      <Clock size={32} color="#94A3B8" />
                      <p style={{ margin: '8px 0 0', fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                        Chưa có nhật ký hoạt động
                      </p>
                      <p style={{ margin: 0, fontSize: 12.5, color: '#64748B' }}>
                        Các sự kiện biên chế lực lượng và điều động sẽ được ghi nhận tại đây khi có phát sinh.
                      </p>
                    </div>
                  ) : (
                    <div className="audit-timeline">
                      {selectedTeamDetail.activityLogs.map((log) => (
                        <div key={log.id} className="audit-timeline-item">
                          <div className="audit-timeline-dot" />
                          <span className="audit-timeline-date">{log.timestamp}</span>
                          <span className="audit-timeline-title">{log.action}</span>
                          <p className="audit-timeline-desc" style={{ margin: 0 }}>
                            {log.detail}
                          </p>
                          {log.actor && <span className="audit-timeline-actor">Bởi: {log.actor}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="team-drawer-footer">
              <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>
                Mã đội: {selectedTeamDetail._id} • Cập nhật lúc {new Date().toLocaleTimeString('vi-VN')}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="coordination-action-btn outline"
                  onClick={() => handleDeleteTeam(selectedTeamDetail)}
                  disabled={actionInProgress === selectedTeamDetail._id}
                  style={{ color: '#DC2626', borderColor: '#FECACA', background: '#FEF2F2' }}
                  title="Giải thể và xóa đội cứu hộ này"
                >
                  <Trash2 size={14} />
                  <span>Xóa đội cứu hộ</span>
                </button>
                <button
                  type="button"
                  className="coordination-action-btn primary"
                  onClick={handleCloseTeamDetail}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. MODAL TẠO ĐỘI CỨU HỘ MỚI                             */}
      {/* ======================================================== */}
      {isCreateTeamOpen && (
        <div className="executive-modal-backdrop" onClick={() => setIsCreateTeamOpen(false)}>
          <div
            className="executive-modal-card"
            style={{ maxWidth: 640, width: '92%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="executive-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="executive-icon-squircle">
                  <PlusCircle size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                    Thêm Đội Cứu Hộ Địa Phương Mới
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>
                    Thiết lập lực lượng cứu nạn, phân công chỉ huy và biên chế phương tiện
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="executive-toggle-btn"
                onClick={() => setIsCreateTeamOpen(false)}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleCreateTeamSubmit}>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '72vh', overflowY: 'auto' }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 5 }}>
                    Tên Đội Cứu Hộ *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Đội Ca-nô Cứu Nạn Vượt Lũ 02"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #CBD5E1',
                      borderRadius: 6,
                      fontSize: 13,
                      outline: 'none',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 5 }}>
                      Chuyên Môn Tác Chiến *
                    </label>
                    <select
                      value={newTeamSpec}
                      onChange={(e) => setNewTeamSpec(e.target.value as RescueSpecialization)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #CBD5E1',
                        borderRadius: 6,
                        fontSize: 13,
                        outline: 'none',
                        background: '#FFFFFF',
                      }}
                    >
                      <option value="FLOOD_RESCUE">Thủy bộ vượt lũ</option>
                      <option value="SEARCH_RESCUE">Tìm kiếm và cứu nạn</option>
                      <option value="MEDICAL_RESCUE">Y tế cứu thương</option>
                      <option value="FIRE_RESCUE">PCCC và cứu nạn cứu hộ</option>
                      <option value="GENERAL_RESCUE">Cứu hộ tổng hợp</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 5 }}>
                      Địa Bàn Phụ Trách
                    </label>
                    <input
                      type="text"
                      disabled={!isAdmin}
                      value={newTeamArea}
                      onChange={(e) => setNewTeamArea(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #CBD5E1',
                        borderRadius: 6,
                        fontSize: 13,
                        outline: 'none',
                        background: !isAdmin ? '#F8FAFC' : '#FFFFFF',
                        color: !isAdmin ? '#64748B' : '#0F172A',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>
                        Chỉ Huy Đội Trưởng *
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#0284C7', cursor: 'pointer', fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={filterSameCommuneOnly}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setFilterSameCommuneOnly(checked);
                            if (checked && selectedLeaderId) {
                              const found = leaderCandidates.find((c) => c.id === selectedLeaderId);
                              if (found && !found.isSameCommune) {
                                setSelectedLeaderId('');
                                setNewTeamLeader('');
                                setNewTeamPhone('');
                              }
                            }
                          }}
                          style={{ accentColor: '#0284C7', cursor: 'pointer' }}
                        />
                        <span>Chỉ nhân sự cùng xã</span>
                      </label>
                    </div>

                    <select
                      required
                      value={selectedLeaderId}
                      onChange={(e) => handleSelectLeader(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #CBD5E1',
                        borderRadius: 6,
                        fontSize: 13,
                        outline: 'none',
                        background: '#FFFFFF',
                        color: selectedLeaderId ? '#0F172A' : '#64748B',
                        cursor: 'pointer',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                      }}
                    >
                      <option value="">-- Chọn Cứu hộ viên --</option>
                      {displayedLeaderCandidates.map((cand) => (
                        <option
                          key={cand.id}
                          value={cand.id}
                          disabled={!!cand.assignedTeamName}
                          style={{
                            color: cand.assignedTeamName ? '#94A3B8' : '#0F172A',
                            background: cand.assignedTeamName ? '#F8FAFC' : '#FFFFFF',
                          }}
                        >
                          {cand.fullName} {cand.assignedTeamName ? `(⚠️ Đã thuộc: ${cand.assignedTeamName})` : ''}
                        </option>
                      ))}
                    </select>


                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 5 }}>
                      Số Điện Thoại Trực Ban *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="Tự động điền theo Đội trưởng"
                      value={newTeamPhone}
                      onChange={(e) => setNewTeamPhone(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #CBD5E1',
                        borderRadius: 6,
                        fontSize: 13,
                        outline: 'none',
                        background: newTeamPhone ? '#F0F9FF' : '#FFFFFF',
                        color: '#0F172A',
                        fontWeight: newTeamPhone ? 700 : 400,
                      }}
                    />

                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 5 }}>
                      Trụ Sở / Điểm Tập Kết
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Trụ sở BCH PCTT / Điểm tập kết cứu hộ..."
                      value={newTeamBase}
                      onChange={(e) => setNewTeamBase(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #CBD5E1',
                        borderRadius: 6,
                        fontSize: 13,
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 5 }}>
                      Quân Số Biên Chế
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={50}
                      value={newTeamMembersCount}
                      onChange={(e) => setNewTeamMembersCount(parseInt(e.target.value) || 4)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #CBD5E1',
                        borderRadius: 6,
                        fontSize: 13,
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {/* Biên chế phương tiện ban đầu */}
                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 800, color: '#0F172A', display: 'block', marginBottom: 8 }}>
                    ⚓ Biên Chế Phương Tiện Ban Đầu
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Loại phương tiện</span>
                      <select
                        value={newVehicleType}
                        onChange={(e) => setNewVehicleType(e.target.value as any)}
                        style={{
                          width: '100%',
                          marginTop: 4,
                          padding: '6px 10px',
                          border: '1px solid #CBD5E1',
                          borderRadius: 6,
                          fontSize: 12.5,
                        }}
                      >
                        <option value="BOAT">Ca-nô / Xuồng máy</option>
                        <option value="TRUCK">Xe bán tải / Tải</option>
                        <option value="AMBULANCE">Xe cứu thương</option>
                        <option value="MOTORBIKE">Xe máy cơ động</option>
                      </select>
                    </div>

                    <div>
                      <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Biển số / Mã định danh</span>
                      <input
                        type="text"
                        value={newVehiclePlate}
                        onChange={(e) => setNewVehiclePlate(e.target.value)}
                        placeholder="VD: 43A-0123 / Cano-01"
                        style={{
                          width: '100%',
                          marginTop: 4,
                          padding: '6px 10px',
                          border: '1px solid #CBD5E1',
                          borderRadius: 6,
                          fontSize: 12.5,
                        }}
                      />
                    </div>

                    <div>
                      <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Sức chở (người)</span>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={newVehicleCapacity}
                        onChange={(e) => setNewVehicleCapacity(parseInt(e.target.value) || 6)}
                        style={{
                          width: '100%',
                          marginTop: 4,
                          padding: '6px 10px',
                          border: '1px solid #CBD5E1',
                          borderRadius: 6,
                          fontSize: 12.5,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 5 }}>
                    Ghi Chú Năng Lực &amp; Trang Thiết Bị Chuyên Dụng
                  </label>
                  <textarea
                    rows={2}
                    value={newTeamNotes}
                    onChange={(e) => setNewTeamNotes(e.target.value)}
                    placeholder="VD: Được trang bị 20 áo phao, tời kéo 500kg, máy phát điện dã chiến..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #CBD5E1',
                      borderRadius: 6,
                      fontSize: 13,
                      outline: 'none',
                      resize: 'none',
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  padding: '14px 24px',
                  borderTop: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                  borderBottomLeftRadius: 16,
                  borderBottomRightRadius: 16,
                }}
              >
                <button
                  type="button"
                  className="coordination-action-btn outline"
                  onClick={() => setIsCreateTeamOpen(false)}
                >
                  Hủy
                </button>
                <button type="submit" className="coordination-action-btn primary" disabled={isSubmittingTeam}>
                  {isSubmittingTeam ? <Loader2 size={14} className="ra-spin" /> : <CheckCircle2 size={14} />}
                  <span>{isSubmittingTeam ? 'Đang lưu vào hệ thống...' : 'Xác nhận tạo đội cứu hộ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL XÁC NHẬN GIẢI THỂ / XÓA ĐỘI CỨU HỘ               */}
      {/* ======================================================== */}
      {teamToDelete && (
        <div className="executive-modal-backdrop" onClick={() => !actionInProgress && setTeamToDelete(null)}>
          <div
            className="executive-modal-card"
            style={{ maxWidth: 460, width: '92%', borderRadius: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '20px 24px 16px',
                borderBottom: '1px solid #F1F5F9',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: '#FEF2F2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#DC2626',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                  Xác nhận giải thể đội cứu hộ
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>
                  Thao tác này sẽ xóa đội khỏi danh sách tác chiến
                </p>
              </div>
              <button
                type="button"
                className="executive-toggle-btn"
                onClick={() => setTeamToDelete(null)}
                disabled={!!actionInProgress}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#334155', lineHeight: 1.5 }}>
                Bạn có chắc chắn muốn giải thể và xóa đội <strong style={{ color: '#0F172A' }}>"{teamToDelete.name}"</strong> khỏi hệ thống không?
              </p>

              <div
                style={{
                  background: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}
              >
                <Info size={16} color="#D97706" style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#92400E', lineHeight: 1.45 }}>
                  <strong>Lưu ý:</strong> Mọi phương tiện trực thuộc (nếu có) sẽ được tự động thu hồi về <strong>Kho dự trữ địa phương</strong> để tiếp tục sẵn sàng điều phối.
                </span>
              </div>
            </div>

            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid #F1F5F9',
                background: '#F8FAFC',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                borderBottomLeftRadius: 16,
                borderBottomRightRadius: 16,
              }}
            >
              <button
                type="button"
                className="coordination-action-btn outline"
                onClick={() => setTeamToDelete(null)}
                disabled={!!actionInProgress}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="coordination-action-btn primary"
                onClick={handleConfirmDelete}
                disabled={!!actionInProgress}
                style={{
                  background: '#DC2626',
                  borderColor: '#DC2626',
                  color: '#FFFFFF',
                  boxShadow: '0 1px 2px rgba(220, 38, 38, 0.2)',
                }}
              >
                {actionInProgress ? (
                  <>
                    <Loader2 size={14} className="ra-spin" />
                    <span>Đang giải thể...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Xác nhận giải thể</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 7. MODAL THẨM ĐỊNH CHI TIẾT HỒ SƠ CỨU HỘ VIÊN (ADMIN)   */}
      {/* ======================================================== */}
      {selectedApplicantDetail && (
        <div className="executive-modal-backdrop" onClick={() => setSelectedApplicantDetail(null)}>
          <div
            className="executive-modal-card"
            style={{ maxWidth: 640, width: '92%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="executive-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="applicant-avatar" style={{ width: 44, height: 44, fontSize: 16 }}>
                  {(selectedApplicantDetail.fullName || 'CH')[0]?.toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                    {selectedApplicantDetail.fullName || 'Người dân đăng ký'}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span
                      className={`rescuer-status-badge ${selectedApplicantDetail.rescuer?.verificationStatus === 'VERIFIED'
                        ? 'available'
                        : 'busy'
                        }`}
                    >
                      {selectedApplicantDetail.rescuer?.verificationStatus === 'VERIFIED'
                        ? 'Đã duyệt chính thức'
                        : 'Đang chờ thẩm định'}
                    </span>
                    <span style={{ fontSize: 12, color: '#64748B' }}>
                      ID: {selectedApplicantDetail._id?.slice(-8)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="executive-toggle-btn"
                onClick={() => setSelectedApplicantDetail(null)}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="dossier-card">
                <div className="dossier-card-title">
                  <CreditCard size={14} color="#0284C7" />
                  <span>Thông Tin Định Danh</span>
                </div>
                <div className="dossier-item">
                  <span className="dossier-item-label">Số CCCD</span>
                  <span className="dossier-item-value">{selectedApplicantDetail.rescuer?.idNumber || 'Chưa cung cấp'}</span>
                </div>
                <div className="dossier-item">
                  <span className="dossier-item-label">Số điện thoại</span>
                  <span className="dossier-item-value">{selectedApplicantDetail.phone || 'Chưa cung cấp'}</span>
                </div>
                <div className="dossier-item">
                  <span className="dossier-item-label">Địa bàn đăng ký</span>
                  <span className="dossier-item-value">
                    {selectedApplicantDetail.rescuer?.areaName || selectedApplicantDetail.address || 'Chưa cung cấp'}
                  </span>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid #E2E8F0',
                background: '#F8FAFC',
                display: 'flex',
                justifyContent: 'space-between',
                borderBottomLeftRadius: 16,
                borderBottomRightRadius: 16,
              }}
            >
              <button
                type="button"
                className="coordination-action-btn outline"
                onClick={() => setSelectedApplicantDetail(null)}
              >
                Đóng
              </button>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="coordination-action-btn danger-outline"
                  onClick={() => handleVerifyRescuer(selectedApplicantDetail._id, 'REJECTED')}
                  disabled={verifyingId === selectedApplicantDetail._id}
                >
                  <X size={13} />
                  <span>Từ chối</span>
                </button>
                <button
                  type="button"
                  className="coordination-action-btn success"
                  onClick={() => handleVerifyRescuer(selectedApplicantDetail._id, 'VERIFIED')}
                  disabled={verifyingId === selectedApplicantDetail._id}
                >
                  <Check size={13} />
                  <span>Phê duyệt</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL DUYỆT YÊU CẦU XIN GIA NHẬP ĐỘI CỨU HỘ           */}
      {/* ======================================================== */}
      {isJoinRequestsModalOpen && (
        <div className="executive-modal-backdrop" onClick={() => setIsJoinRequestsModalOpen(false)}>
          <div
            className="executive-modal-card"
            style={{ maxWidth: 760, width: '94%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="executive-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserCheck size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                    Yêu cầu xin gia nhập Đội cứu hộ trên địa bàn
                  </h3>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    Thẩm định và xét duyệt đơn xin gia nhập của người cứu trợ vào các đội cứu hộ trực thuộc
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="executive-toggle-btn"
                onClick={() => setIsJoinRequestsModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {allPendingJoinRequests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748B' }}>
                  <CheckCircle2 size={42} color="#16A34A" style={{ margin: '0 auto 12px' }} />
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
                    Không có yêu cầu nào đang chờ phê duyệt
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    Toàn bộ đơn đăng ký gia nhập đội cứu hộ trên địa bàn đã được xử lý xong.
                  </div>
                </div>
              ) : (
                allPendingJoinRequests.map((req) => (
                  <div
                    key={`${req.teamId}-${req.rescuerId}`}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: 12,
                      padding: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
                      <div
                        className="applicant-avatar"
                        style={{ width: 44, height: 44, fontSize: 16, background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}
                      >
                        {req.fullName[0]?.toUpperCase() || 'U'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: 14.5, color: '#0F172A' }}>
                            {req.fullName}
                          </span>
                          <span className={`verification-status-pill ${req.isVerified ? 'verified' : 'unverified'}`}>
                            <ShieldCheck size={12} />
                            <span>{req.isVerified ? 'Cứu hộ viên hợp lệ' : 'Chưa duyệt tư cách'}</span>
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#64748B', flexWrap: 'wrap' }}>
                          <span>SĐT: <strong style={{ color: '#0284C7' }}>{req.phone || 'Chưa cập nhật'}</strong></span>
                          {req.email && <span>• Email: <strong>{req.email}</strong></span>}
                          {req.joinedAt && <span>• Ngày gửi: <strong>{req.joinedAt}</strong></span>}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                            Nguyện vọng gia nhập:
                          </span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: '#EFF6FF',
                              border: '1px solid #BFDBFE',
                              color: '#1D4ED8',
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            <Shield size={12} />
                            {req.teamName}
                          </span>
                        </div>

                        {req.skills && req.skills.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11.5, color: '#64748B', fontWeight: 600 }}>Kỹ năng:</span>
                            {req.skills.map((skill, sIdx) => (
                              <span
                                key={sIdx}
                                style={{
                                  background: '#F1F5F9',
                                  color: '#475569',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                }}
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', minWidth: 140 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          className="member-action-btn reject"
                          onClick={() => handleUpdateMemberStatus(req.teamId, req.rescuerId, 'REJECTED')}
                          disabled={actionInProgress === `${req.teamId}-${req.rescuerId}`}
                          title="Từ chối yêu cầu gia nhập của cứu hộ viên này"
                        >
                          <X size={13} />
                          <span>Từ chối</span>
                        </button>
                        <button
                          type="button"
                          className="member-action-btn approve"
                          onClick={() => handleUpdateMemberStatus(req.teamId, req.rescuerId, 'APPROVED')}
                          disabled={actionInProgress === `${req.teamId}-${req.rescuerId}`}
                          title="Chấp thuận kết nạp cứu hộ viên vào đội này"
                        >
                          {actionInProgress === `${req.teamId}-${req.rescuerId}` ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Check size={13} />
                          )}
                          <span>Duyệt vào đội</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div
              style={{
                padding: '12px 24px',
                borderTop: '1px solid #E2E8F0',
                background: '#F8FAFC',
                display: 'flex',
                justifyContent: 'flex-end',
                borderBottomLeftRadius: 16,
                borderBottomRightRadius: 16,
              }}
            >
              <button
                type="button"
                className="coordination-action-btn outline"
                onClick={() => setIsJoinRequestsModalOpen(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 8. MODAL KẾT NẠP THÀNH VIÊN VÀO ĐỘI CỨU HỘ               */}
      {/* ======================================================== */}
      {isAddMemberModalOpen && selectedTeamDetail && (
        <div
          className="executive-modal-backdrop"
          onClick={() => !isSubmittingAddMember && setIsAddMemberModalOpen(false)}
        >
          <div
            className="executive-modal-card"
            style={{ maxWidth: 540, width: '92%', borderRadius: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="executive-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: '#EFF6FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0284C7',
                    flexShrink: 0,
                  }}
                >
                  <UserPlus size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                    Kết nạp thành viên vào đội cứu hộ
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>
                    Đội: <strong style={{ color: '#0F172A' }}>{selectedTeamDetail.name}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="executive-toggle-btn"
                onClick={() => setIsAddMemberModalOpen(false)}
                disabled={isSubmittingAddMember}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddMemberSubmit}>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Chọn Cứu hộ viên kết nạp <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <select
                    value={selectedRescuerToAdd}
                    onChange={(e) => setSelectedRescuerToAdd(e.target.value)}
                    required
                    disabled={isSubmittingAddMember}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #CBD5E1',
                      fontSize: 13,
                      color: '#0F172A',
                      background: '#FFFFFF',
                      outline: 'none',
                    }}
                  >
                    <option value="">-- Chọn cứu hộ viên sẵn sàng --</option>
                    {availableRescuersToAdd.map((cand) => (
                      <option
                        key={cand.id}
                        value={cand.id}
                        disabled={!!cand.assignedTeamName}
                        style={{ color: cand.assignedTeamName ? '#94A3B8' : '#0F172A' }}
                      >
                        {cand.fullName} ({cand.phone})
                        {cand.assignedTeamName
                          ? ` ⛔ [Đang thuộc: ${cand.assignedTeamName}]`
                          : ' ✅ [Chưa có đội]'}
                        {cand.skills ? ` - ${cand.skills}` : ''}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: 11.5, color: '#64748B', marginTop: 4, display: 'block' }}>
                    Danh sách hiển thị các Cứu hộ viên đã duyệt. Cứu hộ viên đã có đội sẽ bị khóa chọn.
                  </span>
                </div>

                {selectedTeamDetail.leaderId || selectedTeamDetail.detailedMembers.some((m) => m.role === 'LEADER') ? (
                  <div
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: 8,
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>
                        Vai trò kết nạp:
                      </span>
                      <span className="member-role-badge member" style={{ fontSize: 11, padding: '3px 8px' }}>
                        Thành viên tác chiến
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: '#64748B' }}>
                      Đội trưởng hiện tại: <strong style={{ color: '#0F172A' }}>{selectedTeamDetail.leaderName || 'Đã có chỉ huy'}</strong>
                    </span>
                  </div>
                ) : (
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                      Vai trò nhiệm vụ ban đầu
                    </label>
                    <select
                      value={memberRoleToAdd}
                      onChange={(e) => setMemberRoleToAdd(e.target.value as any)}
                      disabled={isSubmittingAddMember}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #CBD5E1',
                        fontSize: 13,
                        color: '#0F172A',
                        background: '#FFFFFF',
                        outline: 'none',
                      }}
                    >
                      <option value="MEMBER">Thành viên tác chiến (MEMBER)</option>
                      <option value="LEADER">Đội trưởng chỉ huy (LEADER)</option>
                    </select>
                  </div>
                )}

                <div
                  style={{
                    background: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    borderRadius: 8,
                    padding: '10px 14px',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  <Info size={16} color="#16A34A" style={{ marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#166534', lineHeight: 1.45 }}>
                    <strong>Quy định tác chiến:</strong> Mỗi người chỉ được biên chế vào duy nhất 1 đội cứu hộ trong hệ thống để tránh chồng chéo nhiệm vụ và đảm bảo tính sẵn sàng cứu trợ tức thì.
                  </span>
                </div>
              </div>

              <div
                style={{
                  padding: '14px 24px',
                  borderTop: '1px solid #F1F5F9',
                  background: '#F8FAFC',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                  borderBottomLeftRadius: 16,
                  borderBottomRightRadius: 16,
                }}
              >
                <button
                  type="button"
                  className="coordination-action-btn outline"
                  onClick={() => setIsAddMemberModalOpen(false)}
                  disabled={isSubmittingAddMember}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="coordination-action-btn primary"
                  disabled={isSubmittingAddMember || !selectedRescuerToAdd}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {isSubmittingAddMember ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Đang kết nạp...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={14} />
                      <span>Xác nhận kết nạp</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 9. MODAL XÁC NHẬN XÓA THÀNH VIÊN KHỎI ĐỘI                 */}
      {/* ======================================================== */}
      {memberToRemove && (
        <div
          className="executive-modal-backdrop"
          onClick={() => !isRemovingMember && setMemberToRemove(null)}
        >
          <div
            className="executive-modal-card"
            style={{ maxWidth: 480, width: '92%', borderRadius: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="executive-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: '#FEF2F2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#DC2626',
                    flexShrink: 0,
                  }}
                >
                  <UserMinus size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                    Xác nhận đưa nhân sự rời đội
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>
                    Đội: <strong style={{ color: '#0F172A' }}>{memberToRemove.teamName}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="executive-toggle-btn"
                onClick={() => setMemberToRemove(null)}
                disabled={isRemovingMember}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {memberToRemove.role === 'LEADER' &&
                selectedTeamDetail &&
                selectedTeamDetail.detailedMembers.filter((m) => m.status !== 'PENDING').length > 1 ? (
                <div
                  style={{
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: 8,
                    padding: '12px 14px',
                    marginBottom: 14,
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  <AlertTriangle size={18} color="#DC2626" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ fontSize: 12.5, color: '#991B1B', lineHeight: 1.5 }}>
                    <strong>Không thể xóa Đội trưởng:</strong> Đội hiện vẫn còn các thành viên khác. Quy định hệ thống yêu cầu bạn phải <strong>Bổ nhiệm Đội trưởng mới</strong> trước khi cho Đội trưởng hiện tại rời khỏi đội.
                  </div>
                </div>
              ) : (
                <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#334155', lineHeight: 1.5 }}>
                  Bạn có chắc chắn muốn đưa cứu hộ viên <strong style={{ color: '#0F172A' }}>"{memberToRemove.rescuerName}"</strong> ra khỏi biên chế của đội <strong style={{ color: '#0F172A' }}>"{memberToRemove.teamName}"</strong> không?
                </p>
              )}

              <div
                style={{
                  background: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}
              >
                <Info size={16} color="#D97706" style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#92400E', lineHeight: 1.45 }}>
                  Sau khi rời khỏi đội, cứu hộ viên này sẽ trở về trạng thái tự do và sẵn sàng để kết nạp vào đội cứu hộ khác khi cần.
                </span>
              </div>
            </div>

            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid #F1F5F9',
                background: '#F8FAFC',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                borderBottomLeftRadius: 16,
                borderBottomRightRadius: 16,
              }}
            >
              <button
                type="button"
                className="coordination-action-btn outline"
                onClick={() => setMemberToRemove(null)}
                disabled={isRemovingMember}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="coordination-action-btn primary"
                onClick={handleConfirmRemoveMember}
                disabled={
                  isRemovingMember ||
                  (memberToRemove.role === 'LEADER' &&
                    Boolean(selectedTeamDetail && selectedTeamDetail.detailedMembers.filter((m) => m.status !== 'PENDING').length > 1))
                }
                style={{
                  background: '#DC2626',
                  borderColor: '#DC2626',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {isRemovingMember ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <>
                    <UserMinus size={14} />
                    <span>Xác nhận xóa</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 10. MODAL XÁC NHẬN BỔ NHIỆM ĐỘI TRƯỞNG MỚI               */}
      {/* ======================================================== */}
      {memberToPromote && (
        <div
          className="executive-modal-backdrop"
          onClick={() => !isPromotingLeader && setMemberToPromote(null)}
        >
          <div
            className="executive-modal-card"
            style={{ maxWidth: 480, width: '92%', borderRadius: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="executive-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: '#FEF3C7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#D97706',
                    flexShrink: 0,
                  }}
                >
                  <Crown size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                    Bổ nhiệm Đội trưởng chỉ huy
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>
                    Đội: <strong style={{ color: '#0F172A' }}>{memberToPromote.teamName}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="executive-toggle-btn"
                onClick={() => setMemberToPromote(null)}
                disabled={isPromotingLeader}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#334155', lineHeight: 1.5 }}>
                Bạn có chắc chắn muốn bổ nhiệm cứu hộ viên <strong style={{ color: '#0F172A' }}>"{memberToPromote.rescuerName}"</strong> làm <strong style={{ color: '#D97706' }}>Đội trưởng chỉ huy mới</strong> của đội không?
              </p>

              <div
                style={{
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}
              >
                <Info size={16} color="#2563EB" style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#1E40AF', lineHeight: 1.45 }}>
                  Sau khi bổ nhiệm, cán bộ này sẽ chịu trách nhiệm chính tiếp nhận lệnh điều phối và phân công nhiệm vụ cho toàn đội. Đội trưởng hiện tại (nếu có) sẽ được chuyển về làm thành viên thường.
                </span>
              </div>
            </div>

            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid #F1F5F9',
                background: '#F8FAFC',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                borderBottomLeftRadius: 16,
                borderBottomRightRadius: 16,
              }}
            >
              <button
                type="button"
                className="coordination-action-btn outline"
                onClick={() => setMemberToPromote(null)}
                disabled={isPromotingLeader}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="coordination-action-btn primary"
                onClick={handleConfirmPromoteLeader}
                disabled={isPromotingLeader}
                style={{
                  background: '#D97706',
                  borderColor: '#D97706',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {isPromotingLeader ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Đang bổ nhiệm...</span>
                  </>
                ) : (
                  <>
                    <Crown size={14} />
                    <span>Xác nhận bổ nhiệm</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

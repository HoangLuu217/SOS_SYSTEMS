import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Truck,
  LifeBuoy,
  RefreshCw,
  Search,
  X,
  AlertTriangle,
  Eye,
  Check,
  Phone,
  MapPin,
  PlusCircle,
  Trash2,
  LogOut,
  ArrowRightLeft,
  Bike,
  Wrench,
  Pencil,
  Minus,
  Plus,
  Calendar,
  Package,
  Send,
  PackageCheck,
} from 'lucide-react';
import type { VehicleItem, RescueTeamItem, AdministrativeAreaItem } from '@/types/dashboard';
import type { User } from '@/types/auth';
import {
  fetchVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  fetchRescueTeams,
  fetchAdministrativeAreas,
  fetchEquipments,
  createEquipment,
  updateEquipment,
  transferEquipment,
  consumeEquipment,
  batchConsumeEquipments,
  updateEquipmentStatus,
  deleteEquipment,
  type EquipmentItem,
} from '@/api';
import { domainDService } from '@/services/domainDService';
import { toast } from '@/components/common/toast';
import '@/features/sos/SosRequestsView.css';
import './ResourcesView.css';

export interface ResourcesViewProps {
  vehicles?: VehicleItem[];
  rescueTeams?: RescueTeamItem[];
  onOpenMap?: (sosId?: any) => void;
  user?: User;
}

export const STANDARD_EQUIPMENT_CATALOG = [
  { name: 'Áo phao cứu sinh', category: 'LIFE_VEST', unit: 'chiếc' },
  { name: 'Bộ đàm vô tuyến dã chiến', category: 'COMMUNICATION', unit: 'cái' },
  { name: 'Túi sơ cứu y tế dã chiến', category: 'MEDICAL_KIT', unit: 'túi' },
  { name: 'Đèn pin cứu hộ siêu sáng', category: 'LIGHTING', unit: 'cái' },
  { name: 'Dây thừng cứu hộ 50m', category: 'ROPE_TOOL', unit: 'cuộn' },
  { name: 'Máy cưa xích cứu hộ', category: 'TOOL', unit: 'chiếc' },
];

export const STANDARD_CONSUMABLE_CATALOG = [
  { name: 'Lương khô quân đội 702', category: 'FOOD_WATER', unit: 'thùng', minThreshold: 30 },
  { name: 'Nước suối đóng chai 500ml', category: 'FOOD_WATER', unit: 'thùng (24 chai)', minThreshold: 50 },
  { name: 'Bình nước tinh khiết 20L', category: 'FOOD_WATER', unit: 'bình', minThreshold: 20 },
  { name: 'Viên khử khuẩn lọc nước Aquatabs', category: 'WATER_PURIFICATION', unit: 'hộp', minThreshold: 25 },
  { name: 'Bông băng gạc tiệt trùng', category: 'MEDICAL_SUPPLY', unit: 'hộp', minThreshold: 40 },
  { name: 'Thuốc sát trùng Povidone Iodine', category: 'MEDICAL_SUPPLY', unit: 'chai', minThreshold: 30 },
  { name: 'Thuốc hạ sốt Paracetamol 500mg', category: 'MEDICAL_SUPPLY', unit: 'hộp', minThreshold: 30 },
  { name: 'Xăng RON 95 (ca-nô & máy nổ)', category: 'FUEL', unit: 'can 20L', minThreshold: 20 },
  { name: 'Áo mưa tiện lợi dã chiến', category: 'HYGIENE', unit: 'gói', minThreshold: 50 },
  { name: 'Pin đại D/AA dã chiến', category: 'HYGIENE', unit: 'vỉ', minThreshold: 30 },
];

export const generateRandomEquipmentSerial = (category?: string) => {
  const prefixMap: Record<string, string> = {
    LIFE_VEST: 'AP',
    COMMUNICATION: 'BD',
    MEDICAL_KIT: 'YT',
    LIGHTING: 'DP',
    ROPE_TOOL: 'DT',
    TOOL: 'CX',
  };
  const prefix = (category && prefixMap[category]) || 'KT';
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `LÔ-${prefix}-${randomNum}`;
};

export const ResourcesView: React.FC<ResourcesViewProps> = ({
  vehicles: propVehicles = [],
  rescueTeams: propTeams = [],
  user,
}) => {
  const [vehicles, setVehicles] = useState<VehicleItem[]>(propVehicles);
  const [rescueTeams, setRescueTeams] = useState<RescueTeamItem[]>(propTeams);
  const [equipments, setEquipments] = useState<EquipmentItem[]>([]);
  const [equipmentsLoading, setEquipmentsLoading] = useState(false);
  const [areas, setAreas] = useState<AdministrativeAreaItem[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('ALL');
  const [resourceTab, setResourceTab] = useState<'VEHICLES' | 'SUPPLIES' | 'CONSUMABLES'>('VEHICLES');
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshIndex, setRefreshIndex] = useState(0);

  // Phân quyền: Cán bộ địa phương (Local) chỉ xem phương tiện/vật tư của địa bàn mình quản lý, Admin xem tất cả
  const activeOfficer = domainDService.getActiveOfficer();
  const isAdmin = user?.roles?.includes('ADMIN') || (user as any)?.role === 'ADMIN' || activeOfficer?.role === 'ADMIN';

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

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<string>('ALL');
  const [vehicleTeamFilter, setVehicleTeamFilter] = useState<string>('ALL');
  const [supplyCategoryFilter, setSupplyCategoryFilter] = useState<string>('ALL');
  const [supplyTeamFilter, setSupplyTeamFilter] = useState<string>('DEPOT');
  const [consumableCategoryFilter, setConsumableCategoryFilter] = useState<string>('ALL');
  const [consumableTeamFilter, setConsumableTeamFilter] = useState<string>('DEPOT');

  // Modals
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleItem | null>(null);
  const [isCreateVehicleOpen, setIsCreateVehicleOpen] = useState(false);

  // New vehicle form state
  const [newPlate, setNewPlate] = useState('');
  const [newType, setNewType] = useState<'BOAT' | 'AMBULANCE' | 'TRUCK' | 'MOTORBIKE' | 'OTHER'>('BOAT');
  const [newCapacity, setNewCapacity] = useState<number>(6);
  const [newTeamId, setNewTeamId] = useState<string>('');
  const [newDescription, setNewDescription] = useState('');
  const [isSubmittingVehicle, setIsSubmittingVehicle] = useState(false);

  // Equipment dispatch / create form state
  const [isCreateEquipmentOpen, setIsCreateEquipmentOpen] = useState(false);
  const [eqTeamId, setEqTeamId] = useState<string>('');
  const [eqName, setEqName] = useState<string>('');
  const [customEqName, setCustomEqName] = useState<string>('');
  const [eqCategory, setEqCategory] = useState<string>('LIFE_VEST');
  const [eqSupplyType, setEqSupplyType] = useState<'DURABLE' | 'CONSUMABLE'>('DURABLE');
  const [eqSerialNumber, setEqSerialNumber] = useState<string>('');
  const [eqQuantity, setEqQuantity] = useState<number>(1);
  const [eqUnit, setEqUnit] = useState<string>('chiếc');
  const [eqReceivedAt, setEqReceivedAt] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [eqMinThreshold, setEqMinThreshold] = useState<number>(20);
  const [eqNote, setEqNote] = useState<string>('');
  const [isSubmittingEquipment, setIsSubmittingEquipment] = useState(false);

  // Consume / Dispatch Relief Supply Modal State
  const [consumeTarget, setConsumeTarget] = useState<EquipmentItem | null>(null);
  const [consumeQuantity, setConsumeQuantity] = useState<number>(1);
  const [consumeDestination, setConsumeDestination] = useState<string>('');
  const [consumeNote, setConsumeNote] = useState<string>('');
  const [isConsuming, setIsConsuming] = useState<boolean>(false);

  // Batch Consume Relief Supplies Modal State (Phiếu xuất cấp cứu trợ tổng hợp)
  interface BatchConsumeItem {
    equipmentId: string;
    quantity: number;
  }
  const [isBatchConsumeOpen, setIsBatchConsumeOpen] = useState<boolean>(false);
  const [batchDestination, setBatchDestination] = useState<string>('');
  const [batchRecipientName, setBatchRecipientName] = useState<string>('');
  const [batchNote, setBatchNote] = useState<string>('');
  const [batchItems, setBatchItems] = useState<BatchConsumeItem[]>([]);
  const [batchDispatchMode, setBatchDispatchMode] = useState<'ASSIGN_TEAM' | 'DIRECT'>('ASSIGN_TEAM');
  const [batchTeamId, setBatchTeamId] = useState<string>('');
  const [batchPriority, setBatchPriority] = useState<string>('HIGH');
  const [isSubmittingBatchConsume, setIsSubmittingBatchConsume] = useState<boolean>(false);

  // Custom Action / Delete Confirmation Modal State
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'UNASSIGN_VEHICLE' | 'DELETE_VEHICLE' | 'EQUIPMENT';
    id: string;
    name: string;
    teamName?: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Transfer / Assign Vehicle Modal State
  const [transferVehicleTarget, setTransferVehicleTarget] = useState<VehicleItem | null>(null);
  const [transferNewTeamId, setTransferNewTeamId] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [transferVehicleError, setTransferVehicleError] = useState<string>('');

  // Equipment Detail Modal State
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentItem | null>(null);

  // Transfer / Reassign Equipment Modal State
  const [transferEquipmentTarget, setTransferEquipmentTarget] = useState<EquipmentItem | null>(null);
  const [transferEquipmentTeamId, setTransferEquipmentTeamId] = useState<string>('');
  const [transferEquipmentQuantity, setTransferEquipmentQuantity] = useState<number>(1);
  const [transferEquipmentNote, setTransferEquipmentNote] = useState<string>('');
  const [isTransferringEquipment, setIsTransferringEquipment] = useState<boolean>(false);
  const [transferEquipmentErrors, setTransferEquipmentErrors] = useState<{ team?: string; quantity?: string }>({});

  // Edit Equipment Modal State
  const [editEquipmentTarget, setEditEquipmentTarget] = useState<EquipmentItem | null>(null);
  const [editEqQuantity, setEditEqQuantity] = useState<number>(1);
  const [editEqStatus, setEditEqStatus] = useState<string>('AVAILABLE');
  const [editEqSerialNumber, setEditEqSerialNumber] = useState<string>('');
  const [editEqReceivedAt, setEditEqReceivedAt] = useState<string>('');
  const [editEqNote, setEditEqNote] = useState<string>('');
  const [isUpdatingEquipment, setIsUpdatingEquipment] = useState<boolean>(false);

  const refreshData = () => setRefreshIndex((p) => p + 1);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const areaParam = effectiveAreaId !== 'ALL' ? effectiveAreaId : undefined;
      const [vehRes, teamRes, areasRes] = await Promise.allSettled([
        fetchVehicles({ areaId: areaParam, limit: 100 }),
        fetchRescueTeams({ areaId: areaParam, limit: 100 }),
        fetchAdministrativeAreas(),
      ]);

      if (areasRes.status === 'fulfilled' && areasRes.value.success && Array.isArray(areasRes.value.data)) {
        setAreas(areasRes.value.data);
      }
      if (vehRes.status === 'fulfilled' && vehRes.value.success && Array.isArray(vehRes.value.data)) {
        setVehicles(vehRes.value.data);
      } else {
        setVehicles([]);
      }
      if (teamRes.status === 'fulfilled' && teamRes.value.success && Array.isArray(teamRes.value.data)) {
        setRescueTeams(teamRes.value.data);
      } else {
        setRescueTeams([]);
      }
    } catch (e) {
      console.warn('Loi tai tai nguyen:', e);
      setVehicles([]);
    } finally {
      setLoading(false);
    }

    // Load equipment rieng biet (khong block vehicles)
    try {
      setEquipmentsLoading(true);
      const areaParam = effectiveAreaId !== 'ALL' ? effectiveAreaId : undefined;
      const eqRes = await fetchEquipments(areaParam ? { areaId: areaParam, limit: '200' } : { limit: '200' });
      if (eqRes.success && Array.isArray(eqRes.data)) {
        setEquipments(eqRes.data);
      } else {
        setEquipments([]);
      }
    } catch (e) {
      console.warn('Loi tai vat tu:', e);
      setEquipments([]);
    } finally {
      setEquipmentsLoading(false);
    }
  }, [effectiveAreaId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshIndex]);

  const rawVehicles = vehicles;

  // Resolve each vehicle strictly by team (yêu cầu: phương tiện phải get theo thằng team)
  const vehiclesWithTeam = useMemo(() => {
    return rawVehicles.map((v) => {
      let matchedTeam: RescueTeamItem | undefined = undefined;

      if (typeof v.teamId === 'object' && v.teamId) {
        matchedTeam = v.teamId as any;
      } else if (typeof v.teamId === 'string' && v.teamId) {
        matchedTeam = rescueTeams.find((t) => t._id === v.teamId);
      }

      if (!matchedTeam && v.teamId) {
        matchedTeam = rescueTeams.find((t) =>
          t.vehicles?.some((tv: any) => tv._id === v._id || tv.plateNumber === v.plateNumber)
        );
      }

      return {
        ...v,
        assignedTeam: matchedTeam,
      };
    });
  }, [rawVehicles, rescueTeams]);

  // KPI Metrics
  const boatsCount = useMemo(
    () => rawVehicles.filter((v) => v.type === 'BOAT' || v.plateNumber.includes('SEA') || v.plateNumber.includes('CL')).length,
    [rawVehicles]
  );

  const ambulancesCount = useMemo(
    () => rawVehicles.filter((v) => v.type === 'AMBULANCE').length,
    [rawVehicles]
  );

  const trucksCount = useMemo(
    () => rawVehicles.filter((v) => v.type === 'TRUCK').length,
    [rawVehicles]
  );

  const motorbikesCount = useMemo(
    () => rawVehicles.filter((v) => v.type === 'MOTORBIKE').length,
    [rawVehicles]
  );

  const othersCount = useMemo(
    () =>
      rawVehicles.filter(
        (v) =>
          v.type === 'OTHER' ||
          (!['BOAT', 'AMBULANCE', 'TRUCK', 'MOTORBIKE'].includes(v.type) &&
            !v.plateNumber.includes('SEA') &&
            !v.plateNumber.includes('CL'))
      ).length,
    [rawVehicles]
  );

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return vehiclesWithTeam.filter((v) => {
      // 1. Phân quyền địa phương: Nếu không phải Admin, chỉ hiển thị phương tiện thuộc đội của địa bàn quản lý hoặc phương tiện kho tổng dự trữ
      if (!isAdmin && (managedArea || userAreaName || userAreaId)) {
        const team = v.assignedTeam;
        const hasTeam = Boolean(team || v.teamId);
        // Nếu phương tiện đã được biên chế vào một đội cứu hộ, kiểm tra xem đội đó có thuộc địa bàn quản lý không
        if (hasTeam) {
          const targetAreaId = managedArea?._id || userAreaId;
          const targetAreaName = (userAreaName || managedArea?.name || '')
            .toLowerCase()
            .replace(/^(phường|xã|quận|huyện)\s+/i, '')
            .trim();

          const teamAreaObj = typeof team?.areaId === 'object' && team?.areaId !== null ? team.areaId : null;
          const teamAreaId = teamAreaObj?._id || team?.areaId;
          const teamAreaName = (teamAreaObj?.name || (team as any)?.areaName || '').toLowerCase();
          const teamNameLower = (team?.name || '').toLowerCase();

          const matchId = targetAreaId && (teamAreaId === targetAreaId || teamAreaId === managedArea?.code);
          const matchParentChild = Boolean(
            ((teamAreaObj as any)?.parentId && ((teamAreaObj as any).parentId === targetAreaId || (teamAreaObj as any).parentId === managedArea?._id)) ||
            (managedArea?.parentId && (managedArea.parentId === teamAreaId || managedArea.parentId === (teamAreaObj as any)?._id))
          );
          const matchName = Boolean(
            targetAreaName &&
            (teamAreaName.includes(targetAreaName) ||
              targetAreaName.includes(teamAreaName) ||
              teamNameLower.includes(targetAreaName))
          );

          if (!matchId && !matchParentChild && !matchName) return false;
        }
        // Nếu không có đội (Kho tổng dự trữ / Chưa biên chế), luôn cho phép hiển thị để cán bộ địa phương thấy và điều chuyển
      }

      // 2. Lọc theo loại phương tiện (Tất cả, Ca-nô/Xuồng, Xe cấp cứu, Xe tải 4x4, Xe máy, Khác)
      if (vehicleTypeFilter !== 'ALL') {
        if (vehicleTypeFilter === 'BOAT') {
          const isBoat = v.type === 'BOAT' || v.plateNumber.includes('SEA') || v.plateNumber.includes('CL');
          if (!isBoat) return false;
        } else if (vehicleTypeFilter === 'OTHER') {
          const isOther =
            v.type === 'OTHER' ||
            (!['BOAT', 'AMBULANCE', 'TRUCK', 'MOTORBIKE'].includes(v.type) &&
              !v.plateNumber.includes('SEA') &&
              !v.plateNumber.includes('CL'));
          if (!isOther) return false;
        } else if (v.type !== vehicleTypeFilter) {
          return false;
        }
      }

      if (vehicleTeamFilter !== 'ALL') {
        if (vehicleTeamFilter === 'UNASSIGNED') {
          if (v.assignedTeam || v.teamId) return false;
        } else {
          const teamId = v.assignedTeam?._id || (typeof v.teamId === 'object' && v.teamId ? (v.teamId as any)._id : v.teamId);
          if (teamId !== vehicleTeamFilter) return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const teamName = (v.assignedTeam?.name || '').toLowerCase();
        const leaderObj = typeof v.assignedTeam?.leaderId === 'object' ? v.assignedTeam?.leaderId : null;
        const leaderName = (leaderObj?.fullName || '').toLowerCase();
        const plate = (v.plateNumber || '').toLowerCase();
        const desc = (v.description || '').toLowerCase();
        return plate.includes(q) || teamName.includes(q) || leaderName.includes(q) || desc.includes(q);
      }
      return true;
    });
  }, [vehiclesWithTeam, vehicleTypeFilter, vehicleTeamFilter, searchQuery, isAdmin, managedArea, userAreaId, userAreaName]);


  // Durable equipments (Khí tài tác chiến tái sử dụng)
  const durableEquipments = useMemo(() => {
    return equipments.filter((eq) => eq.supplyType !== 'CONSUMABLE');
  }, [equipments]);

  // Consumable supplies (Vật tư tiêu hao / Cứu trợ)
  const consumableEquipments = useMemo(() => {
    return equipments.filter((eq) => eq.supplyType === 'CONSUMABLE');
  }, [equipments]);

  // Filtered durable equipments
  const filteredEquipments = useMemo(() => {
    return durableEquipments.filter((eq) => {
      // 1. Lọc theo đơn vị biên chế (Kho tổng dự trữ hoặc theo đội)
      if (supplyTeamFilter !== 'ALL') {
        const tId = typeof eq.teamId === 'object' && eq.teamId ? (eq.teamId as any)._id : eq.teamId;
        if (supplyTeamFilter === 'DEPOT') {
          if (tId) return false;
        } else {
          if (String(tId) !== String(supplyTeamFilter)) return false;
        }
      }

      // 2. Lọc theo đúng 1 danh mục chuẩn
      if (supplyCategoryFilter !== 'ALL') {
        if (eq.category !== supplyCategoryFilter) return false;
      }

      // 3. Tìm kiếm từ khóa
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const teamName = (typeof eq.teamId === 'object' ? eq.teamId?.name : '').toLowerCase();
        return eq.name.toLowerCase().includes(q) || teamName.includes(q) || (eq.serialNumber || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [durableEquipments, supplyTeamFilter, supplyCategoryFilter, searchQuery]);

  // Filtered consumable supplies
  const filteredConsumables = useMemo(() => {
    return consumableEquipments.filter((eq) => {
      // 1. Lọc theo kho / đơn vị
      if (consumableTeamFilter !== 'ALL') {
        const tId = typeof eq.teamId === 'object' && eq.teamId ? (eq.teamId as any)._id : eq.teamId;
        if (consumableTeamFilter === 'DEPOT') {
          if (tId) return false;
        } else {
          if (String(tId) !== String(consumableTeamFilter)) return false;
        }
      }

      // 2. Lọc theo danh mục vật tư tiêu hao
      if (consumableCategoryFilter !== 'ALL') {
        if (eq.category !== consumableCategoryFilter) return false;
      }

      // 3. Tìm kiếm
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const teamName = (typeof eq.teamId === 'object' ? eq.teamId?.name : '').toLowerCase();
        return (
          eq.name.toLowerCase().includes(q) ||
          teamName.includes(q) ||
          (eq.serialNumber || '').toLowerCase().includes(q) ||
          (eq.note || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [consumableEquipments, consumableTeamFilter, consumableCategoryFilter, searchQuery]);



  // Handle Add Vehicle
  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlate.trim()) {
      toast.warning('Vui lòng nhập biển số / định danh phương tiện');
      return;
    }

    const matchedTeam = rescueTeams.find((t) => t._id === newTeamId);

    try {
      setIsSubmittingVehicle(true);
      const res = await createVehicle({
        teamId: matchedTeam ? matchedTeam._id : undefined,
        type: newType,
        plateNumber: newPlate.toUpperCase().trim(),
        capacity: Number(newCapacity) || 4,
        description: newDescription.trim() || 'Phương tiện cứu nạn biên chế mới',
        status: 'AVAILABLE',
      });

      if (res.success && res.data) {
        setVehicles((prev) => [res.data, ...prev]);
      } else {
        const created: VehicleItem = {
          _id: `veh-${Date.now()}`,
          plateNumber: newPlate.toUpperCase().trim(),
          type: newType,
          capacity: Number(newCapacity) || 4,
          status: 'AVAILABLE',
          description: newDescription.trim() || 'Phương tiện cứu nạn biên chế mới',
          teamId: matchedTeam ? ({
            _id: matchedTeam._id,
            name: matchedTeam.name,
            leaderId: matchedTeam.leaderId,
          } as any) : undefined,
        };
        setVehicles((prev) => [created, ...prev]);
      }

      setIsCreateVehicleOpen(false);
      setNewPlate('');
      setNewDescription('');
      refreshData();
      toast.success(
        matchedTeam
          ? `Đã thêm phương tiện vào biên chế đội "${matchedTeam.name}" thành công!`
          : 'Đã thêm phương tiện vào Kho tổng dự trữ thành công!',
        'Biên chế thành công'
      );
    } catch (err: any) {
      toast.error(err?.message || 'Không thể tạo phương tiện mới');
    } finally {
      setIsSubmittingVehicle(false);
    }
  };

  // Handle Transfer / Reassign Vehicle
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferVehicleTarget) return;

    if (!transferNewTeamId || transferNewTeamId.trim() === '') {
      setTransferVehicleError('Vui lòng chọn đội cứu hộ hoặc kho tổng tiếp nhận xe');
      toast.warning('Vui lòng chọn đội cứu hộ hoặc kho tổng tiếp nhận xe', 'Chưa chọn đơn vị tiếp nhận');
      return;
    }
    setTransferVehicleError('');

    try {
      setIsTransferring(true);
      const targetTeamId = transferNewTeamId === 'NONE' || !transferNewTeamId ? null : transferNewTeamId;
      const res = await updateVehicle(transferVehicleTarget._id, { teamId: targetTeamId });
      if (res.success) {
        setVehicles((prev) =>
          prev.map((v) =>
            v._id === transferVehicleTarget._id
              ? { ...v, teamId: targetTeamId ? (targetTeamId as any) : undefined }
              : v
          )
        );
        if (selectedVehicle?._id === transferVehicleTarget._id) {
          setSelectedVehicle((prev) =>
            prev ? { ...prev, teamId: targetTeamId ? (targetTeamId as any) : undefined } : null
          );
        }
        const assignedTeam = rescueTeams.find((t) => t._id === targetTeamId);
        toast.success(
          targetTeamId && assignedTeam
            ? `Đã điều chuyển phương tiện "${transferVehicleTarget.plateNumber}" sang đội "${assignedTeam.name}"!`
            : `Đã chuyển phương tiện "${transferVehicleTarget.plateNumber}" về Kho tổng dự trữ!`,
          'Điều chuyển thành công'
        );
        setTransferVehicleTarget(null);
        setTransferNewTeamId('');
        setTransferVehicleError('');
      } else {
        toast.error(res.message || 'Không thể điều chuyển phương tiện');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi điều chuyển phương tiện');
    } finally {
      setIsTransferring(false);
    }
  };

  // Handle Create / Dispatch Equipment
  const handleCreateEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = eqName === 'CUSTOM' ? customEqName.trim() : eqName.trim();
    if (!finalName) {
      toast.warning('Vui lòng chọn hoặc nhập tên trang thiết bị');
      return;
    }

    const matchedTeam = rescueTeams.find((t) => t._id === eqTeamId);

    try {
      setIsSubmittingEquipment(true);
      const res = await createEquipment({
        teamId: matchedTeam ? matchedTeam._id : ('' as any),
        name: finalName,
        category: eqCategory,
        supplyType: eqSupplyType,
        minThreshold: eqSupplyType === 'CONSUMABLE' ? Number(eqMinThreshold) || 20 : undefined,
        serialNumber: eqSerialNumber.trim() ? eqSerialNumber.trim().toUpperCase() : undefined,
        quantity: Number(eqQuantity) || 1,
        unit: eqUnit.trim() || 'chiếc',
        status: 'AVAILABLE',
        receivedAt: eqReceivedAt ? new Date(eqReceivedAt).toISOString() : new Date().toISOString(),
        note: eqNote.trim() || undefined,
      });

      if (res.success && res.data) {
        setEquipments((prev) => [res.data, ...prev]);
        refreshData();
        toast.success(
          matchedTeam
            ? `Đã thêm "${finalName}" vào biên chế đội "${matchedTeam.name}" thành công!`
            : `Đã nhập "${finalName}" vào Kho tổng dự trữ thành công!`,
          'Nhập kho thành công'
        );
        setIsCreateEquipmentOpen(false);
        setEqName('');
        setCustomEqName('');
        setEqSerialNumber('');
        setEqNote('');
        setEqReceivedAt(new Date().toISOString().split('T')[0]);
        setEqQuantity(1);
      } else {
        toast.error(res.message || 'Không thể thêm trang thiết bị mới');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi thêm trang thiết bị mới');
    } finally {
      setIsSubmittingEquipment(false);
    }
  };

  // Handle Consume / Dispatch Relief Supply (Xuất cấp cứu trợ)
  const handleConfirmConsume = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consumeTarget) return;

    const qty = Number(consumeQuantity);
    if (!qty || qty <= 0 || qty > consumeTarget.quantity) {
      toast.warning(`Số lượng xuất phải từ 1 đến ${consumeTarget.quantity} ${consumeTarget.unit}`);
      return;
    }

    try {
      setIsConsuming(true);
      const res = await consumeEquipment(consumeTarget._id, {
        quantity: qty,
        destination: consumeDestination.trim() || undefined,
        note: consumeNote.trim() || undefined,
      });

      if (res.success && res.data) {
        setEquipments((prev) =>
          prev.map((eq) => (eq._id === consumeTarget._id ? res.data : eq))
        );
        toast.success(
          `Đã xuất cấp ${qty} ${consumeTarget.unit} "${consumeTarget.name}" cứu trợ thành công!`,
          'Xuất cấp hoàn tất'
        );
        setConsumeTarget(null);
        setConsumeDestination('');
        setConsumeNote('');
      } else {
        toast.error(res.message || 'Không thể xuất cấp vật tư cứu trợ');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi xuất cấp vật tư');
    } finally {
      setIsConsuming(false);
    }
  };

  // Mở modal Phiếu xuất cứu trợ tổng hợp (nhiều mặt hàng)
  const handleOpenBatchConsumeModal = () => {
    const available = consumableEquipments.filter((e) => e.quantity > 0);
    if (available.length === 0) {
      toast.warning('Hiện không có mặt hàng cứu trợ nào còn tồn kho để xuất cấp');
      return;
    }
    setBatchDestination('');
    setBatchRecipientName('');
    setBatchNote('');
    setBatchDispatchMode('ASSIGN_TEAM');
    setBatchPriority('HIGH');
    if (rescueTeams.length > 0) {
      setBatchTeamId(rescueTeams[0]._id);
    } else {
      setBatchTeamId('');
    }
    setBatchItems([
      {
        equipmentId: available[0]._id,
        quantity: Math.min(10, available[0].quantity),
      },
    ]);
    setIsBatchConsumeOpen(true);
  };

  const handleAddBatchItem = () => {
    const available = consumableEquipments.filter((e) => e.quantity > 0);
    const selectedIds = new Set(batchItems.map((bi) => bi.equipmentId));
    const nextItem = available.find((e) => !selectedIds.has(e._id)) || available[0];
    if (nextItem) {
      setBatchItems((prev) => [
        ...prev,
        { equipmentId: nextItem._id, quantity: Math.min(10, nextItem.quantity) },
      ]);
    }
  };

  const handleRemoveBatchItem = (index: number) => {
    setBatchItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateBatchItem = (index: number, patch: Partial<BatchConsumeItem>) => {
    setBatchItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item, ...patch };
        const eq = consumableEquipments.find((e) => e._id === updated.equipmentId);
        if (eq) {
          updated.quantity = Math.min(eq.quantity, Math.max(1, Number(updated.quantity) || 1));
        }
        return updated;
      })
    );
  };

  const handleConfirmBatchConsume = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchDestination.trim()) {
      toast.warning('Vui lòng nhập điểm tiếp nhận cứu trợ / khu vực ngập lụt');
      return;
    }
    if (batchDispatchMode === 'ASSIGN_TEAM' && !batchTeamId) {
      toast.warning('Vui lòng chọn Đội cứu hộ nhận lệnh vận chuyển tiếp tế');
      return;
    }
    if (batchItems.length === 0) {
      toast.warning('Vui lòng chọn ít nhất 1 mặt hàng vào phiếu xuất cấp');
      return;
    }

    for (let i = 0; i < batchItems.length; i++) {
      const bi = batchItems[i];
      const eq = consumableEquipments.find((e) => e._id === bi.equipmentId);
      if (!eq) {
        toast.warning('Có mặt hàng không hợp lệ trong danh sách');
        return;
      }
      const qty = Number(bi.quantity);
      if (!qty || qty <= 0) {
        toast.warning(`Số lượng xuất cho "${eq.name}" phải lớn hơn 0`);
        return;
      }
      if (qty > eq.quantity) {
        toast.warning(`"${eq.name}" chỉ còn tồn kho ${eq.quantity} ${eq.unit}, không đủ để xuất ${qty}`);
        return;
      }
    }

    try {
      setIsSubmittingBatchConsume(true);
      const res = await batchConsumeEquipments({
        destination: batchDestination.trim(),
        recipientName: batchRecipientName.trim() || undefined,
        note: batchNote.trim() || undefined,
        teamId: batchDispatchMode === 'ASSIGN_TEAM' ? batchTeamId : undefined,
        priority: batchDispatchMode === 'ASSIGN_TEAM' ? batchPriority : undefined,
        items: batchItems.map((bi) => ({ equipmentId: bi.equipmentId, quantity: Number(bi.quantity) })),
      });

      const updatedList: EquipmentItem[] = Array.isArray(res.data)
        ? res.data
        : (res.data?.updatedEquipments || []);

      if (res.success && updatedList.length > 0) {
        const updatedMap = new Map(updatedList.map((eq) => [eq._id, eq]));
        setEquipments((prev) => prev.map((eq) => updatedMap.get(eq._id) || eq));

        const teamObj = rescueTeams.find((t) => t._id === batchTeamId);
        if (batchDispatchMode === 'ASSIGN_TEAM' && teamObj) {
          toast.success(
            `Đã xuất kho ${updatedList.length} mặt hàng & Tạo lệnh điều phối cho "${teamObj.name}" thành công!`,
            'Xuất cấp & Điều phối hoàn tất'
          );
        } else {
          toast.success(
            `Đã xuất cấp trực tiếp thành công ${updatedList.length} mặt hàng cứu trợ tới "${batchDestination.trim()}"!`,
            'Phiếu xuất cấp hoàn tất'
          );
        }
        setIsBatchConsumeOpen(false);
        setBatchItems([]);
        setBatchDestination('');
        setBatchRecipientName('');
        setBatchNote('');
      } else {
        toast.error(res.message || 'Không thể tạo phiếu xuất cấp cứu trợ tổng hợp');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi xuất cấp cứu trợ tổng hợp');
    } finally {
      setIsSubmittingBatchConsume(false);
    }
  };

  // Quick Status Update for Equipment
  const handleQuickUpdateEquipmentStatus = async (id: string, status: string) => {
    try {
      const res = await updateEquipmentStatus(id, status);
      if (res.success) {
        setEquipments((prev) =>
          prev.map((eq) => (eq._id === id ? { ...eq, status: status as any } : eq))
        );
        toast.success('Đã cập nhật trạng thái vật tư thành công');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi cập nhật trạng thái vật tư');
    }
  };

  // Thực thi rút khỏi đội hoặc xóa vĩnh viễn (được gọi từ Custom Confirm Modal, không dùng alert/confirm của browser)
  const handleExecuteDelete = async () => {
    if (!deleteConfirmTarget) return;
    const { type, id, name, teamName } = deleteConfirmTarget;

    try {
      setIsDeleting(true);
      if (type === 'UNASSIGN_VEHICLE') {
        // Rút xe khỏi đội: Cập nhật teamId = null, KHÔNG XÓA XE
        const res = await updateVehicle(id, { teamId: null });
        if (res.success) {
          setVehicles((prev) =>
            prev.map((v) => (v._id === id ? { ...v, teamId: undefined } : v))
          );
          if (selectedVehicle?._id === id) {
            setSelectedVehicle((prev) => (prev ? { ...prev, teamId: undefined } : null));
          }
          toast.success(
            `Đã rút phương tiện "${name}" khỏi ${teamName ? `đội ${teamName}` : 'đội cứu hộ'} và chuyển về Kho tổng dự trữ!`,
            'Rút biên chế thành công'
          );
        } else {
          toast.error(res.message || 'Không thể rút phương tiện khỏi đội');
        }
      } else if (type === 'DELETE_VEHICLE') {
        // Xóa vĩnh viễn xe khỏi DB
        const res = await deleteVehicle(id);
        if (res.success) {
          setVehicles((prev) => prev.filter((v) => v._id !== id));
          if (selectedVehicle?._id === id) setSelectedVehicle(null);
          toast.success(`Đã xóa vĩnh viễn phương tiện "${name}" khỏi hệ thống!`);
        } else {
          toast.error(res.message || 'Không thể xóa phương tiện');
        }
      } else {
        // Xóa vật tư
        const res = await deleteEquipment(id);
        if (res.success) {
          setEquipments((prev) => prev.filter((eq) => eq._id !== id));
          if (selectedEquipment?._id === id) setSelectedEquipment(null);
          toast.success(`Đã xóa vật tư "${name}" khỏi biên chế`);
        } else {
          toast.error(res.message || 'Không thể xóa vật tư');
        }
      }
      setDeleteConfirmTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi thực hiện thao tác');
    } finally {
      setIsDeleting(false);
    }
  };

  // Open Edit Equipment Modal
  const handleOpenEditEquipment = (eq: EquipmentItem) => {
    setEditEquipmentTarget(eq);
    setEditEqQuantity(eq.quantity);
    setEditEqStatus(eq.status);
    setEditEqSerialNumber(eq.serialNumber || '');
    setEditEqReceivedAt(eq.receivedAt ? eq.receivedAt.split('T')[0] : eq.createdAt ? eq.createdAt.split('T')[0] : '');
    setEditEqNote(eq.note || '');
  };

  // Submit Edit Equipment
  const handleSaveEditEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEquipmentTarget) return;

    try {
      setIsUpdatingEquipment(true);
      const res = await updateEquipment(editEquipmentTarget._id, {
        quantity: Number(editEqQuantity) || 1,
        status: editEqStatus,
        serialNumber: editEqSerialNumber.trim() ? editEqSerialNumber.trim().toUpperCase() : undefined,
        receivedAt: editEqReceivedAt ? new Date(editEqReceivedAt).toISOString() : undefined,
        note: editEqNote.trim() || undefined,
      });

      if (res.success && res.data) {
        setEquipments((prev) =>
          prev.map((eq) => (eq._id === editEquipmentTarget._id ? res.data : eq))
        );
        if (selectedEquipment?._id === editEquipmentTarget._id) {
          setSelectedEquipment(res.data);
        }
        toast.success(`Đã cập nhật trang thiết bị "${editEquipmentTarget.name}" thành công!`);
        setEditEquipmentTarget(null);
      } else {
        toast.error(res.message || 'Không thể cập nhật trang thiết bị');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi cập nhật trang thiết bị');
    } finally {
      setIsUpdatingEquipment(false);
    }
  };

  // Handle Transfer Equipment
  const handleExecuteTransferEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferEquipmentTarget) return;

    const newErrors: { team?: string; quantity?: string } = {};

    if (!transferEquipmentTeamId || transferEquipmentTeamId.trim() === '') {
      newErrors.team = 'Vui lòng chọn đơn vị tiếp nhận bàn giao';
    }

    const qty = Number(transferEquipmentQuantity);
    if (!qty || isNaN(qty) || qty <= 0) {
      newErrors.quantity = 'Số lượng bàn giao phải lớn hơn 0';
    } else if (qty > transferEquipmentTarget.quantity) {
      newErrors.quantity = `Số lượng không được vượt quá cơ số hiện có (${transferEquipmentTarget.quantity})`;
    }

    if (Object.keys(newErrors).length > 0) {
      setTransferEquipmentErrors(newErrors);
      if (newErrors.team) {
        toast.warning(newErrors.team, 'Chưa chọn đơn vị tiếp nhận');
      } else if (newErrors.quantity) {
        toast.warning(newErrors.quantity, 'Số lượng không hợp lệ');
      }
      return;
    }

    setTransferEquipmentErrors({});

    try {
      setIsTransferringEquipment(true);
      const targetTeam = transferEquipmentTeamId === 'NONE' ? null : transferEquipmentTeamId;
      const res = await transferEquipment(transferEquipmentTarget._id, {
        targetTeamId: targetTeam,
        quantity: qty,
        note: transferEquipmentNote.trim() || undefined,
      });

      if (res.success) {
        const destName = targetTeam
          ? (rescueTeams.find((t) => t._id === targetTeam)?.name || 'Đội cứu hộ')
          : 'Kho Tổng / Dự Trữ';
        toast.success(
          `Đã bàn giao ${qty} ${transferEquipmentTarget.unit} "${transferEquipmentTarget.name}" sang "${destName}" thành công!`,
          'Bàn giao hoàn tất'
        );
        setTransferEquipmentTarget(null);
        setTransferEquipmentTeamId('');
        setTransferEquipmentQuantity(1);
        setTransferEquipmentNote('');
        setTransferEquipmentErrors({});
        if (selectedEquipment?._id === transferEquipmentTarget._id) {
          setSelectedEquipment(null);
        }
        refreshData();
      } else {
        toast.error(res.message || 'Không thể điều chuyển trang thiết bị');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi điều chuyển trang thiết bị');
    } finally {
      setIsTransferringEquipment(false);
    }
  };

  return (
    <div className="resources-executive-container oceanic-executive-theme">
      {/* 1. HEADER CARD TỔNG QUAN TÀI NGUYÊN (CHUẨN OCEANIC EXECUTIVE) */}
      <div className="executive-overview-container">
        <div className="executive-overview-header" style={{ marginBottom: 0 }}>
          <div className="executive-header-left">
            <div className="executive-segmented-pill">
              <button
                type="button"
                className={`segment-btn ${resourceTab === 'VEHICLES' ? 'active' : ''}`}
                onClick={() => {
                  setResourceTab('VEHICLES');
                  setSearchQuery('');
                }}
              >
                Phương Tiện ({rawVehicles.length})
              </button>
              <button
                type="button"
                className={`segment-btn ${resourceTab === 'SUPPLIES' ? 'active' : ''}`}
                onClick={() => {
                  setResourceTab('SUPPLIES');
                  setSearchQuery('');
                }}
              >
                Trang Thiết Bị ({durableEquipments.length})
              </button>
              <button
                type="button"
                className={`segment-btn ${resourceTab === 'CONSUMABLES' ? 'active' : ''}`}
                onClick={() => {
                  setResourceTab('CONSUMABLES');
                  setSearchQuery('');
                }}
              >
                Vật Tư Cứu Trợ ({consumableEquipments.length})
              </button>
            </div>

            {/* Bộ lọc địa phương cho Admin nếu có */}
            {isAdmin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={14} style={{ color: '#0284c7' }} />
                <select
                  value={selectedAreaId}
                  onChange={(e) => {
                    setSelectedAreaId(e.target.value);
                    setVehicleTeamFilter('ALL');
                  }}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: '#0f172a',
                    outline: 'none',
                    height: 34,
                    cursor: 'pointer',
                  }}
                  title="Lọc phương tiện & nguồn lực theo từng địa phương (Quyền Admin)"
                >
                  <option value="ALL">📍 Toàn thành phố / Tất cả địa bàn</option>
                  {areas.map((area) => (
                    <option key={area._id} value={area._id}>
                      {area.name} ({area.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="executive-header-right">
            <button
              type="button"
              className="coordination-action-btn outline"
              onClick={refreshData}
              title="Cập nhật dữ liệu mới nhất"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>

            {resourceTab === 'VEHICLES' ? (
              <button
                type="button"
                className="coordination-action-btn primary"
                onClick={() => setIsCreateVehicleOpen(true)}
              >
                <PlusCircle size={15} />
                <span>Thêm Phương Tiện Mới</span>
              </button>
            ) : resourceTab === 'CONSUMABLES' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="coordination-action-btn outline"
                  style={{ borderColor: '#0284c7', color: '#0284c7', background: '#f0f9ff' }}
                  onClick={handleOpenBatchConsumeModal}
                  title="Xuất cùng lúc nhiều loại nhu yếu phẩm cho điểm sơ tán hoặc chuyến xe"
                >
                  <PackageCheck size={15} />
                  <span>Tạo Phiếu Xuất Cứu Trợ</span>
                </button>

                <button
                  type="button"
                  className="coordination-action-btn primary"
                  onClick={() => {
                    setEqTeamId('');
                    setEqSupplyType('CONSUMABLE');
                    setEqName(STANDARD_CONSUMABLE_CATALOG[0].name);
                    setEqCategory(STANDARD_CONSUMABLE_CATALOG[0].category);
                    setEqUnit(STANDARD_CONSUMABLE_CATALOG[0].unit);
                    setEqMinThreshold(STANDARD_CONSUMABLE_CATALOG[0].minThreshold);
                    setCustomEqName('');
                    setEqQuantity(50);
                    setEqSerialNumber(`LÔ-VT-${Date.now().toString().slice(-4)}`);
                    setEqNote('');
                    setEqReceivedAt(new Date().toISOString().split('T')[0]);
                    setIsCreateEquipmentOpen(true);
                  }}
                >
                  <PlusCircle size={15} />
                  <span>Nhập Kho Vật Tư Cứu Trợ</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="coordination-action-btn primary"
                onClick={() => {
                  setEqTeamId('');
                  setEqSupplyType('DURABLE');
                  setEqName(STANDARD_EQUIPMENT_CATALOG[0].name);
                  setEqCategory(STANDARD_EQUIPMENT_CATALOG[0].category);
                  setEqUnit(STANDARD_EQUIPMENT_CATALOG[0].unit);
                  setCustomEqName('');
                  setEqQuantity(1);
                  setEqSerialNumber(generateRandomEquipmentSerial(STANDARD_EQUIPMENT_CATALOG[0].category));
                  setEqNote('');
                  setEqReceivedAt(new Date().toISOString().split('T')[0]);
                  setIsCreateEquipmentOpen(true);
                }}
              >
                <PlusCircle size={15} />
                <span>Thêm Trang Thiết Bị Mới</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. BẢNG DỮ LIỆU CHÍNH (PHƯƠNG TIỆN HOẶC VẬT TƯ) */}
      <div className="executive-table-card">
        {/* Toolbar: Bộ lọc tab + Selector đội + Ô tìm kiếm */}
        <div className="executive-table-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {resourceTab === 'VEHICLES' ? (
              <>
                <div className="executive-triage-pills">
                  <button
                    type="button"
                    className={`triage-btn btn-all ${vehicleTypeFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => setVehicleTypeFilter('ALL')}
                  >
                    Tất cả ({rawVehicles.length})
                  </button>
                  <button
                    type="button"
                    className={`triage-btn ${vehicleTypeFilter === 'BOAT' ? 'active' : ''}`}
                    onClick={() => setVehicleTypeFilter('BOAT')}
                  >
                    <span className="dot-mini blue" />
                    Ca-nô / Xuồng ({boatsCount})
                  </button>
                  <button
                    type="button"
                    className={`triage-btn ${vehicleTypeFilter === 'AMBULANCE' ? 'active' : ''}`}
                    onClick={() => setVehicleTypeFilter('AMBULANCE')}
                  >
                    <span className="dot-mini red" />
                    Xe cấp cứu ({ambulancesCount})
                  </button>
                  <button
                    type="button"
                    className={`triage-btn ${vehicleTypeFilter === 'TRUCK' ? 'active' : ''}`}
                    onClick={() => setVehicleTypeFilter('TRUCK')}
                  >
                    <span className="dot-mini yellow" />
                    Xe tải 4x4 ({trucksCount})
                  </button>
                  <button
                    type="button"
                    className={`triage-btn ${vehicleTypeFilter === 'MOTORBIKE' ? 'active' : ''}`}
                    onClick={() => setVehicleTypeFilter('MOTORBIKE')}
                  >
                    <span className="dot-mini purple" style={{ background: '#8b5cf6' }} />
                    Xe máy cơ động ({motorbikesCount})
                  </button>
                  <button
                    type="button"
                    className={`triage-btn ${vehicleTypeFilter === 'OTHER' ? 'active' : ''}`}
                    onClick={() => setVehicleTypeFilter('OTHER')}
                  >
                    <span className="dot-mini gray" style={{ background: '#64748b' }} />
                    Đặc chủng khác ({othersCount})
                  </button>
                </div>

                {/* Dropdown lọc theo Đội cứu hộ (yêu cầu cốt lõi) */}
                <select
                  value={vehicleTeamFilter}
                  onChange={(e) => setVehicleTeamFilter(e.target.value)}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: '#0f172a',
                    outline: 'none',
                    height: 34,
                  }}
                  title="Lọc phương tiện theo từng đội cứu hộ biên chế"
                >
                  <option value="ALL">🏢 Tất cả các Đội cứu hộ ({rawVehicles.length} phương tiện)</option>
                  <option value="UNASSIGNED">📦 Kho tổng / Chưa biên chế đội nào</option>
                  {rescueTeams.map((team) => (
                    <option key={team._id} value={team._id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </>
            ) : resourceTab === 'CONSUMABLES' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div className="executive-triage-pills">
                  <button
                    type="button"
                    className={`triage-btn btn-all ${consumableCategoryFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => setConsumableCategoryFilter('ALL')}
                  >
                    Tất cả ({consumableEquipments.length})
                  </button>
                  <button
                    type="button"
                    className={`triage-btn ${consumableCategoryFilter === 'FOOD_WATER' ? 'active' : ''}`}
                    onClick={() => setConsumableCategoryFilter('FOOD_WATER')}
                  >
                    <span className="dot-mini green" /> Lương thực &amp; Nước
                  </button>
                  <button
                    type="button"
                    className={`triage-btn ${consumableCategoryFilter === 'WATER_PURIFICATION' ? 'active' : ''}`}
                    onClick={() => setConsumableCategoryFilter('WATER_PURIFICATION')}
                  >
                    <span className="dot-mini blue" /> Lọc nước
                  </button>
                  <button
                    type="button"
                    className={`triage-btn ${consumableCategoryFilter === 'MEDICAL_SUPPLY' ? 'active' : ''}`}
                    onClick={() => setConsumableCategoryFilter('MEDICAL_SUPPLY')}
                  >
                    <span className="dot-mini red" /> Y tế &amp; Dược phẩm
                  </button>
                  <button
                    type="button"
                    className={`triage-btn ${consumableCategoryFilter === 'FUEL' ? 'active' : ''}`}
                    onClick={() => setConsumableCategoryFilter('FUEL')}
                  >
                    <span className="dot-mini yellow" /> Nhiên liệu
                  </button>
                  <button
                    type="button"
                    className={`triage-btn ${consumableCategoryFilter === 'HYGIENE' ? 'active' : ''}`}
                    onClick={() => setConsumableCategoryFilter('HYGIENE')}
                  >
                    <span className="dot-mini purple" /> Vệ sinh &amp; Nhu yếu
                  </button>

                  <div style={{ width: 1, height: 18, background: '#cbd5e1', margin: '0 4px' }} />

                  {/* Lọc theo Kho hoặc Đội */}
                  <select
                    value={consumableTeamFilter}
                    onChange={(e) => setConsumableTeamFilter(e.target.value)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#0f172a',
                      outline: 'none',
                      cursor: 'pointer',
                      height: 28,
                    }}
                    title="Lọc vị trí lưu trữ vật tư cứu trợ"
                  >
                    <option value="DEPOT">📦 Kho Tổng / Dự Trữ ({consumableEquipments.filter(e => !e.teamId || (typeof e.teamId === 'object' && !(e.teamId as any)._id)).length} mục)</option>
                    <option value="ALL">🏢 Toàn bộ đơn vị ({consumableEquipments.length} mục)</option>
                    {rescueTeams.map((team) => (
                      <option key={team._id} value={team._id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div className="executive-triage-pills">
                  <button
                    type="button"
                    className={`triage-btn btn-all ${supplyCategoryFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => setSupplyCategoryFilter('ALL')}
                  >
                    Tất cả
                  </button>
                  <button
                    type="button"
                    className={`triage-btn ${supplyCategoryFilter === 'LIFE_VEST' ? 'active' : ''}`}
                    onClick={() => setSupplyCategoryFilter('LIFE_VEST')}
                  >
                    <span className="dot-mini blue" /> Áo phao
                  </button>
                  <button
                    type="button"
                    className={`triage-btn ${supplyCategoryFilter === 'MEDICAL_KIT' ? 'active' : ''}`}
                    onClick={() => setSupplyCategoryFilter('MEDICAL_KIT')}
                  >
                    <span className="dot-mini red" /> Túi sơ cứu
                  </button>
                  <button
                    type="button"
                    className={`triage-btn ${supplyCategoryFilter === 'COMMUNICATION' ? 'active' : ''}`}
                    onClick={() => setSupplyCategoryFilter('COMMUNICATION')}
                  >
                    <span className="dot-mini blue" /> Bộ đàm
                  </button>
                  <button
                    type="button"
                    className={`triage-btn ${supplyCategoryFilter === 'LIGHTING' ? 'active' : ''}`}
                    onClick={() => setSupplyCategoryFilter('LIGHTING')}
                  >
                    <span className="dot-mini yellow" /> Đèn pin
                  </button>
                  <button
                    type="button"
                    className={`triage-btn ${supplyCategoryFilter === 'ROPE_TOOL' ? 'active' : ''}`}
                    onClick={() => setSupplyCategoryFilter('ROPE_TOOL')}
                  >
                    <span className="dot-mini blue" /> Dây cứu hộ
                  </button>
                  <button
                    type="button"
                    className={`triage-btn ${supplyCategoryFilter === 'TOOL' ? 'active' : ''}`}
                    onClick={() => setSupplyCategoryFilter('TOOL')}
                  >
                    <span className="dot-mini gray" style={{ background: '#64748b' }} /> Máy cưa &amp; Công cụ
                  </button>

                  <div style={{ width: 1, height: 18, background: '#cbd5e1', margin: '0 4px' }} />

                  {/* Lọc nhanh theo Kho hoặc từng Đội */}
                  <select
                    value={supplyTeamFilter}
                    onChange={(e) => setSupplyTeamFilter(e.target.value)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#0f172a',
                      outline: 'none',
                      cursor: 'pointer',
                      height: 28,
                    }}
                    title="Chọn lọc trang thiết bị trong Kho tổng hoặc theo đội"
                  >
                    <option value="DEPOT">📦 Kho Tổng / Dự Trữ ({durableEquipments.filter(e => !e.teamId || (typeof e.teamId === 'object' && !(e.teamId as any)._id)).length} mục)</option>
                    <option value="ALL">🏢 Toàn bộ đơn vị ({durableEquipments.length} mục)</option>
                    {rescueTeams.map((team) => (
                      <option key={team._id} value={team._id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="executive-search-input-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder={
                  resourceTab === 'VEHICLES'
                    ? 'Tìm biển số, đội phụ trách, chỉ huy...'
                    : resourceTab === 'CONSUMABLES'
                      ? 'Tìm lương thực, nước, thuốc men, điểm lưu kho...'
                      : 'Tìm tên vật tư, trang thiết bị, vị trí...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button type="button" className="clear-search-btn" onClick={() => setSearchQuery('')}>
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* BẢNG NỘI DUNG CUỘN NỘI BỘ (CHỈ CUỘN NỘI BỘ BẢNG) */}
        <div className="executive-table-scroll">
          {resourceTab === 'VEHICLES' ? (
            /* BẢNG PHƯƠNG TIỆN BIÊN CHẾ THEO ĐỘI */
            <table className="executive-table">
              <thead>
                <tr>
                  <th style={{ width: '18%' }}>Biển Số &amp; Định Danh</th>
                  <th style={{ width: '15%' }}>Loại Phương Tiện</th>
                  <th style={{ width: '28%' }}>Đội Cứu Hộ Tiếp Nhận &amp; Chỉ Huy</th>
                  <th style={{ width: '14%' }}>Sức Chở &amp; Tải Trọng</th>
                  <th style={{ width: '13%' }}>Trạng Thái</th>
                  <th style={{ width: '12%', textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredVehicles.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '50px 20px' }}>
                      <AlertTriangle size={32} style={{ color: '#94a3b8', margin: '0 auto 8px', display: 'block' }} />
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                        Không tìm thấy phương tiện nào phù hợp với bộ lọc
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredVehicles.map((v) => {
                    const team = v.assignedTeam;
                    const isUnassigned = !team;
                    const teamName = team?.name || '📦 Kho Tổng / Chưa Biên Chế';
                    const leaderObj = typeof team?.leaderId === 'object' && team?.leaderId !== null ? team?.leaderId : null;
                    const leaderName = leaderObj?.fullName || (isUnassigned ? 'Kho Quản Lý SOS' : 'Chưa phân công');
                    const leaderPhone = leaderObj?.phone || '';
                    const areaName = typeof team?.areaId === 'object' && team?.areaId !== null ? (team?.areaId as any)?.name : (isUnassigned ? 'Kho Dự Trữ' : 'Địa bàn chung');

                    const typeLabel =
                      v.type === 'BOAT'
                        ? 'Ca-nô / Xuồng lội nước'
                        : v.type === 'AMBULANCE'
                          ? 'Xe cấp cứu dã chiến'
                          : v.type === 'TRUCK'
                            ? 'Xe tải tác chiến 4x4'
                            : v.type === 'MOTORBIKE'
                              ? 'Xe máy cơ động ngõ hẻm'
                              : 'Phương tiện đặc chủng khác';

                    return (
                      <tr
                        key={v._id}
                        className="executive-table-row"
                        onClick={() => setSelectedVehicle(v)}
                        style={{ cursor: 'pointer' }}
                        title="Bấm để xem hồ sơ kỹ thuật chi tiết phương tiện"
                      >
                        {/* Cột 1: Biển số & Định danh */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="code-mono-bold">{v.plateNumber}</span>
                          </div>
                        </td>

                        {/* Cột 2: Loại phương tiện */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#1e293b', fontSize: 13, fontWeight: 500 }}>
                            <span style={{ color: '#64748b', display: 'flex', alignItems: 'center' }}>
                              {v.type === 'BOAT' ? (
                                <LifeBuoy size={14} />
                              ) : v.type === 'MOTORBIKE' ? (
                                <Bike size={14} />
                              ) : v.type === 'OTHER' ? (
                                <Wrench size={14} />
                              ) : (
                                <Truck size={14} />
                              )}
                            </span>
                            <span>{typeLabel}</span>
                          </div>
                        </td>

                        {/* Cột 3: Đội cứu hộ tiếp nhận & quản lý */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="team-title-bold" style={{ color: isUnassigned ? '#d97706' : undefined }}>
                                {teamName}
                              </span>
                              {isUnassigned && (
                                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#b45309', fontWeight: 700 }}>
                                  DỰ TRỮ
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="leader-title-bold">{leaderName}</span>
                              {leaderPhone && (
                                <a
                                  href={`tel:${leaderPhone}`}
                                  className="leader-phone-pill"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Gọi nhanh cho Đội trưởng quản lý xe"
                                >
                                  <Phone size={11} />
                                  <span>{leaderPhone}</span>
                                </a>
                              )}
                            </div>
                            <span style={{ fontSize: 11.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <MapPin size={11} color="#0284c7" />
                              {areaName}
                            </span>
                          </div>
                        </td>

                        {/* Cột 4: Sức chở */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontWeight: 800, color: '#0284c7', fontSize: 13.5 }}>
                              {v.capacity} Người / Cứu nạn
                            </span>
                            <span style={{ fontSize: 11.5, color: '#64748b' }}>
                              {v.type === 'BOAT' ? 'Động cơ thủy 60HP' : 'Dẫn động 4x4 vượt lũ'}
                            </span>
                          </div>
                        </td>

                        {/* Cột 5: Trạng thái */}
                        <td>
                          <span className="resource-status-badge available">
                            <span className="live-dot" style={{ width: 5, height: 5 }} />
                            Sẵn sàng cơ động
                          </span>
                        </td>

                        {/* Cột 6: Thao tác */}
                        <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <button
                              type="button"
                              className="coordination-action-btn outline"
                              onClick={() => setSelectedVehicle(v)}
                              title="Xem hồ sơ chi tiết phương tiện"
                            >
                              <Eye size={12} />
                              <span>Hồ sơ xe</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : resourceTab === 'CONSUMABLES' ? (
            /* BẢNG VẬT TƯ CỨU TRỢ & NHU YẾU PHẨM */
            <table className="executive-table">
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Nhu Yếu Phẩm / Mặt Hàng</th>
                  <th style={{ width: '20%' }}>Vị Trí Lưu Kho</th>
                  <th style={{ width: '24%' }}>Tồn Kho &amp; Mức An Toàn</th>
                  <th style={{ width: '16%' }}>Mã Lô Nhập</th>
                  <th style={{ width: '12%', textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {equipmentsLoading ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                      Đang tải dữ liệu vật tư cứu trợ...
                    </td>
                  </tr>
                ) : filteredConsumables.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '50px 20px' }}>
                      <Package size={32} style={{ color: '#94a3b8', margin: '0 auto 8px', display: 'block' }} />
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                        Chưa có vật tư cứu trợ nào trong kho
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64748b' }}>
                        Nhấp nút "Nhập Kho Vật Tư Cứu Trợ" ở trên để bổ sung lương thực, nước uống, thuốc men cứu trợ
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredConsumables.map((item) => {
                    const teamObj = typeof item.teamId === 'object' ? item.teamId : null;
                    const teamName = teamObj?.name || '—';
                    const minTh = item.minThreshold || 20;
                    const isLow = item.quantity <= minTh;
                    const isWarning = !isLow && item.quantity <= minTh * 2;
                    const percent = Math.min(100, Math.round((item.quantity / Math.max(item.quantity, minTh * 3)) * 100));

                    const categoryBadge: Record<string, { label: string }> = {
                      FOOD_WATER: { label: 'Lương thực & Nước uống' },
                      WATER_PURIFICATION: { label: 'Lọc nước & Khử khuẩn' },
                      MEDICAL_SUPPLY: { label: 'Dược phẩm & Y tế' },
                      FUEL: { label: 'Nhiên liệu dã chiến' },
                      HYGIENE: { label: 'Nhu yếu phẩm & Vệ sinh' },
                    };
                    const catInfo = categoryBadge[item.category] || { label: 'Vật tư cứu trợ' };

                    return (
                      <tr
                        key={item._id}
                        className="executive-table-row"
                        onClick={() => setSelectedEquipment(item)}
                        style={{ cursor: 'pointer' }}
                        title="Bấm để xem hồ sơ chi tiết vật tư"
                      >
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontWeight: 800, fontSize: 13.5, color: '#0f172a' }}>
                              {item.name}
                            </span>
                            <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 500 }}>
                              Phân loại: <span style={{ color: '#334155', fontWeight: 600 }}>{catInfo.label}</span>
                            </span>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 12.5, color: teamObj ? '#334155' : '#b45309', fontWeight: 600 }}>
                            {teamObj ? teamName : '📦 Kho Tổng / Dự Trữ'}
                          </span>
                        </td>
                        <td>
                          <div className="stock-meter-wrap">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                              <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 13.5 }}>
                                {item.quantity} {item.unit}
                              </span>
                              <span className={`stock-status-pill ${isLow ? 'danger' : isWarning ? 'warning' : 'safe'}`}>
                                {isLow ? '🔴 Cạn kho' : isWarning ? '🟡 Sắp hết' : '🟢 Dồi dào'}
                              </span>
                            </div>
                            <div className="stock-meter-track">
                              <div
                                className={`stock-meter-fill ${isLow ? 'danger' : isWarning ? 'warning' : 'safe'}`}
                                style={{ width: `${Math.max(8, percent)}%` }}
                              />
                            </div>
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>
                              Ngưỡng an toàn: ≥ {minTh} {item.unit}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#0f172a', fontWeight: 700 }}>
                              {item.serialNumber || '—'}
                            </span>
                            <span style={{ fontSize: 10.5, color: '#64748b' }}>
                              {item.receivedAt ? `Nhập: ${new Date(item.receivedAt).toLocaleDateString('vi-VN')}` : 'Đợt chuẩn'}
                            </span>
                          </div>
                        </td>
                        <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <button
                              type="button"
                              className="coordination-action-btn primary"
                              style={{ padding: '4px 8px', fontSize: 11.5 }}
                              onClick={() => {
                                setConsumeTarget(item);
                                setConsumeQuantity(Math.min(10, Math.max(1, item.quantity)));
                                setConsumeDestination('');
                                setConsumeNote('');
                              }}
                              disabled={item.quantity <= 0}
                              title="Xuất cấp cứu trợ trực tiếp cho người dân hoặc hiện trường"
                            >
                              <Send size={11} />
                              <span>Xuất cấp</span>
                            </button>
                            <button
                              type="button"
                              className="coordination-action-btn outline"
                              style={{ padding: '4px 8px', fontSize: 11.5 }}
                              onClick={() => setSelectedEquipment(item)}
                              title="Xem chi tiết hồ sơ vật tư"
                            >
                              <Eye size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            /* BẢNG TRANG THIẾT BỊ & KHO KHÍ TÀI DỰ TRỮ - DỮ LIỆU THỰC TỪ API */
            <table className="executive-table">
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Tên Trang Thiết Bị</th>
                  <th style={{ width: '22%' }}>Đơn Vị Quản Lý</th>
                  <th style={{ width: '12%' }}>Số Lượng</th>
                  <th style={{ width: '18%' }}>Mã Lô &amp; Đợt Nhập</th>
                  <th style={{ width: '10%' }}>Trạng Thái</th>
                  <th style={{ width: '10%', textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {equipmentsLoading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                      Đang tải dữ liệu trang thiết bị...
                    </td>
                  </tr>
                ) : filteredEquipments.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '50px 20px' }}>
                      <AlertTriangle size={32} style={{ color: '#94a3b8', margin: '0 auto 8px', display: 'block' }} />
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                        Chưa có trang thiết bị nào trong kho
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64748b' }}>
                        Nhấp nút "Thêm Trang Thiết Bị Mới" ở trên để nhập kho và bàn giao trang thiết bị
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredEquipments.map((eq) => {
                    const teamObj = typeof eq.teamId === 'object' ? eq.teamId : null;
                    const teamName = teamObj?.name || '—';
                    const statusColor: Record<string, string> = {
                      AVAILABLE: '#059669',
                      IN_USE: '#0284c7',
                      BORROWED: '#0284c7',
                      MAINTENANCE: '#d97706',
                      LOST: '#dc2626',
                      DAMAGED: '#9333ea',
                      EXPIRED: '#64748b',
                    };
                    return (
                      <tr
                        key={eq._id}
                        className="executive-table-row"
                        onClick={() => setSelectedEquipment(eq)}
                        style={{ cursor: 'pointer' }}
                        title="Bấm để xem chi tiết trang thiết bị"
                      >
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontWeight: 800, fontSize: 13.5, color: '#0f172a' }}>
                              {eq.name}
                            </span>
                            <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 500 }}>
                              Quy cách: <span style={{ color: '#334155', fontWeight: 600 }}>Quản lý theo lô nhập kho</span>
                            </span>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 12.5, color: teamObj ? '#334155' : '#b45309', fontWeight: 600 }}>
                            {teamObj ? teamName : '📦 Kho Tổng / Dự Trữ'}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 13.5 }}>
                            {eq.quantity} {eq.unit === 'cai' ? 'cái' : eq.unit}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 12, color: eq.serialNumber ? '#0f172a' : '#94a3b8', fontWeight: eq.serialNumber ? 700 : 400 }}>
                              {eq.serialNumber ? (eq.serialNumber.startsWith('LÔ-') || eq.serialNumber.startsWith('LO-') ? eq.serialNumber : `Lô: ${eq.serialNumber}`) : '—'}
                            </span>
                            <span style={{ fontSize: 11, color: '#0284c7', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                              <Calendar size={11} color="#0284c7" />
                              {eq.receivedAt || eq.createdAt
                                ? `Nhập: ${new Date(eq.receivedAt || eq.createdAt!).toLocaleDateString('vi-VN')}`
                                : 'Đợt chuẩn'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <select
                            value={eq.status}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleQuickUpdateEquipmentStatus(eq._id, e.target.value)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              fontWeight: 700,
                              color: statusColor[eq.status] || '#64748b',
                              background: '#f8fafc',
                              border: `1px solid ${statusColor[eq.status] || '#cbd5e1'}55`,
                              cursor: 'pointer',
                              outline: 'none',
                            }}
                            title="Thay đổi trạng thái vật tư"
                          >
                            <option value="AVAILABLE">🟢 Sẵn sàng</option>
                            <option value="IN_USE">🔵 Đang dùng</option>
                            <option value="BORROWED">📤 Xuất cấp</option>
                            <option value="MAINTENANCE">🟡 Bảo dưỡng</option>
                            <option value="DAMAGED">🟣 Hư hỏng</option>
                            <option value="LOST">🔴 Báo mất</option>
                            <option value="EXPIRED">⚪ Hết hạn</option>
                          </select>
                        </td>
                        {/* Cột 8: Thao tác */}
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <button
                              type="button"
                              className="coordination-action-btn outline"
                              onClick={() => setSelectedEquipment(eq)}
                              title="Xem chi tiết trang thiết bị"
                            >
                              <Eye size={12} />
                              <span>Hồ sơ</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL 1: XEM CHI TIẾT PHƯƠNG TIỆN */}
      {selectedVehicle && (
        <div className="executive-modal-backdrop" onClick={() => setSelectedVehicle(null)}>
          <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="executive-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div>
                  <h3 className="executive-modal-title">Hồ Sơ Kỹ Thuật Phương Tiện</h3>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                    Biển số: {selectedVehicle.plateNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="executive-modal-close"
                onClick={() => setSelectedVehicle(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="executive-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 12,
                  background: '#f8fafc',
                  padding: 14,
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    Loại phương tiện
                  </span>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 13.5, marginTop: 2 }}>
                    {selectedVehicle.type === 'BOAT'
                      ? 'Ca-nô / Xuồng lội nước'
                      : selectedVehicle.type === 'AMBULANCE'
                        ? 'Xe cấp cứu dã chiến'
                        : selectedVehicle.type === 'TRUCK'
                          ? 'Xe tải tác chiến lội nước 4x4'
                          : selectedVehicle.type === 'MOTORBIKE'
                            ? 'Xe máy cơ động ngõ hẻm'
                            : 'Phương tiện đặc chủng khác'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    Sức chở tối đa
                  </span>
                  <div style={{ fontWeight: 800, color: '#0284c7', fontSize: 13.5, marginTop: 2 }}>
                    {selectedVehicle.capacity} Người / Cứu hộ
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    Tình trạng kỹ thuật
                  </span>
                  <div style={{ marginTop: 4 }}>
                    <span className="resource-status-badge available">
                      Sẵn sàng xuất kích
                    </span>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    Đơn vị biên chế
                  </span>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, marginTop: 2 }}>
                    {selectedVehicle.assignedTeam?.name ||
                      (typeof selectedVehicle.teamId === 'object' && selectedVehicle.teamId
                        ? (selectedVehicle.teamId as any).name
                        : rescueTeams.find((t) => t._id === selectedVehicle.teamId)?.name || '📦 Kho Tổng / Chưa Biên Chế')}
                  </div>
                </div>
              </div>

              <div>
                <label className="executive-modal-label">Trang bị chuyên dụng kèm theo</label>
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 13,
                    color: '#334155',
                    lineHeight: 1.5,
                  }}
                >
                  {selectedVehicle.description || 'Chưa có ghi chú trang bị kèm theo.'}
                </div>
              </div>
            </div>

            <div className="executive-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* Rút khỏi đội nếu đang thuộc đội */}
                {(selectedVehicle.assignedTeam || selectedVehicle.teamId) && (
                  <button
                    type="button"
                    className="coordination-action-btn outline"
                    onClick={() => {
                      const tName =
                        selectedVehicle.assignedTeam?.name ||
                        rescueTeams.find((t) => t._id === selectedVehicle.teamId)?.name;
                      setDeleteConfirmTarget({
                        type: 'UNASSIGN_VEHICLE',
                        id: selectedVehicle._id,
                        name: selectedVehicle.plateNumber,
                        teamName: tName,
                      });
                    }}
                    style={{ color: '#d97706', borderColor: '#fde68a' }}
                    title="Rút xe ra khỏi đội về Kho tổng dự trữ (Không xóa xe)"
                  >
                    <LogOut size={14} />
                    <span>Rút Khỏi Đội (Về Kho)</span>
                  </button>
                )}
                {/* Điều chuyển / Biên chế */}
                <button
                  type="button"
                  className="coordination-action-btn outline"
                  onClick={() => {
                    setTransferVehicleTarget(selectedVehicle);
                    setTransferNewTeamId(
                      selectedVehicle.assignedTeam?._id ||
                      (typeof selectedVehicle.teamId === 'string' ? selectedVehicle.teamId : '') ||
                      ''
                    );
                  }}
                  style={{ color: '#0284c7', borderColor: '#bae6fd' }}
                  title="Điều chuyển hoặc biên chế xe"
                >
                  <ArrowRightLeft size={14} />
                  <span>
                    {selectedVehicle.assignedTeam || selectedVehicle.teamId
                      ? 'Điều Chuyển Đội'
                      : 'Biên Chế Vào Đội'}
                  </span>
                </button>
                {/* Xóa vĩnh viễn */}
                <button
                  type="button"
                  className="coordination-action-btn outline"
                  onClick={() =>
                    setDeleteConfirmTarget({
                      type: 'DELETE_VEHICLE',
                      id: selectedVehicle._id,
                      name: selectedVehicle.plateNumber,
                    })
                  }
                  style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                  title="Xóa vĩnh viễn phương tiện (Thanh lý tài sản)"
                >
                  <Trash2 size={14} />
                  <span>Xóa Vĩnh Viễn</span>
                </button>
              </div>
              <button
                type="button"
                className="coordination-action-btn primary"
                onClick={() => setSelectedVehicle(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: THÊM PHƯƠNG TIỆN MỚI */}
      {isCreateVehicleOpen && (
        <div className="executive-modal-backdrop" onClick={() => setIsCreateVehicleOpen(false)}>
          <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="executive-modal-header">
              <div>
                <h3 className="executive-modal-title">Thêm Phương Tiện Cơ Động Mới</h3>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                  Đăng ký phương tiện cứu hộ vào cơ số quản lý tác chiến
                </p>
              </div>
              <button
                type="button"
                className="executive-modal-close"
                onClick={() => setIsCreateVehicleOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateVehicle}>
              <div className="executive-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="executive-modal-field">
                  <label className="executive-modal-label">Biển số / Định danh phương tiện (*)</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: 43C-888.99 hoặc 43-CANO-02"
                    className="executive-modal-input"
                    value={newPlate}
                    onChange={(e) => setNewPlate(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Chủng loại</label>
                    <select
                      className="executive-modal-select"
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as any)}
                    >
                      <option value="BOAT">Ca-nô / Xuồng cứu nạn</option>
                      <option value="AMBULANCE">Xe cấp cứu dã chiến</option>
                      <option value="TRUCK">Xe tải lội nước 4x4</option>
                      <option value="MOTORBIKE">Xe máy cơ động ngõ hẻm</option>
                      <option value="OTHER">Phương tiện đặc chủng khác</option>
                    </select>
                  </div>

                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Sức chở tối đa (Người)</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      className="executive-modal-input"
                      value={newCapacity}
                      onChange={(e) => setNewCapacity(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="executive-modal-field">
                  <label className="executive-modal-label">Đội cứu hộ tiếp nhận &amp; quản lý</label>
                  <select
                    className="executive-modal-select"
                    value={newTeamId}
                    onChange={(e) => setNewTeamId(e.target.value)}
                  >
                    <option value="">📦 Kho tổng dự trữ (Chưa biên chế vào đội nào)</option>
                    {rescueTeams.map((team) => (
                      <option key={team._id} value={team._id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="executive-modal-field">
                  <label className="executive-modal-label">Mô tả trang bị chuyên dụng</label>
                  <textarea
                    rows={3}
                    placeholder="Mô tả công suất máy, tời kéo cứu nạn, ống thở chống ngập, bình oxy..."
                    className="executive-modal-textarea"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="executive-modal-footer">
                <button
                  type="button"
                  className="coordination-action-btn outline"
                  onClick={() => setIsCreateVehicleOpen(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingVehicle}
                  className="coordination-action-btn primary"
                >
                  <Check size={15} />
                  <span>{isSubmittingVehicle ? 'Đang lưu...' : 'Lưu & Kích Hoạt'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: THÊM TRANG THIẾT BỊ / NHẬP KHO VẬT TƯ TIÊU HAO */}
      {isCreateEquipmentOpen && (
        <div className="executive-modal-backdrop" onClick={() => setIsCreateEquipmentOpen(false)}>
          <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
            <div className="executive-modal-header" style={{
              background: '#f0f9ff',
              borderBottom: '1px solid #bae6fd'
            }}>
              <div>
                <h3 className="executive-modal-title" style={{ color: '#0369a1' }}>
                  {eqSupplyType === 'CONSUMABLE' ? '📦 Nhập Kho Vật Tư Cứu Trợ' : '🛡️ Thêm Trang Thiết Bị Mới'}
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: '#0284c7' }}>
                  {eqSupplyType === 'CONSUMABLE'
                    ? 'Nhập mới cơ số lương thực, nước sạch, dược phẩm, nhiên liệu phục vụ cứu trợ'
                    : 'Nhập mới cơ số trang bị cứu hộ chuyên dụng cho Đội hoặc lưu Kho tổng dự trữ'}
                </p>
              </div>
              <button
                type="button"
                className="executive-modal-close"
                onClick={() => setIsCreateEquipmentOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateEquipment}>
              <div className="executive-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Bộ chọn phân loại: Khí tài vs Vật tư tiêu hao */}
                <div style={{
                  display: 'flex',
                  gap: 8,
                  padding: 4,
                  background: '#f1f5f9',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0'
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      setEqSupplyType('DURABLE');
                      setEqName(STANDARD_EQUIPMENT_CATALOG[0].name);
                      setEqCategory(STANDARD_EQUIPMENT_CATALOG[0].category);
                      setEqUnit(STANDARD_EQUIPMENT_CATALOG[0].unit);
                      setEqQuantity(1);
                      setEqSerialNumber(generateRandomEquipmentSerial(STANDARD_EQUIPMENT_CATALOG[0].category));
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: eqSupplyType === 'DURABLE' ? '#ffffff' : 'transparent',
                      color: eqSupplyType === 'DURABLE' ? '#0284c7' : '#64748b',
                      boxShadow: eqSupplyType === 'DURABLE' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    🛡️ Trang Thiết Bị Dùng Lâu Dài
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEqSupplyType('CONSUMABLE');
                      setEqName(STANDARD_CONSUMABLE_CATALOG[0].name);
                      setEqCategory(STANDARD_CONSUMABLE_CATALOG[0].category);
                      setEqUnit(STANDARD_CONSUMABLE_CATALOG[0].unit);
                      setEqMinThreshold(STANDARD_CONSUMABLE_CATALOG[0].minThreshold);
                      setEqQuantity(50);
                      setEqSerialNumber(`LÔ-VT-${Date.now().toString().slice(-4)}`);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: eqSupplyType === 'CONSUMABLE' ? '#ffffff' : 'transparent',
                      color: eqSupplyType === 'CONSUMABLE' ? '#0284c7' : '#64748b',
                      boxShadow: eqSupplyType === 'CONSUMABLE' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    📦 Vật Tư Cứu Trợ
                  </button>
                </div>

                {/* 1. Chọn đội tiếp nhận hoặc Kho tổng */}
                <div className="executive-modal-field">
                  <label className="executive-modal-label">
                    {eqSupplyType === 'CONSUMABLE' ? 'Kho lưu trữ / Đơn vị phụ trách xuất cấp (*)' : 'Đơn vị tiếp nhận &amp; chịu trách nhiệm (*)'}
                  </label>
                  <select
                    className="executive-modal-select"
                    value={eqTeamId}
                    onChange={(e) => setEqTeamId(e.target.value)}
                  >
                    <option value="">
                      {eqSupplyType === 'CONSUMABLE'
                        ? '📦 Kho tổng dự trữ (Mặc định - Trung tâm Tiếp nhận &amp; Điều phối)'
                        : '📦 Kho tổng dự trữ (Trung tâm Tiếp nhận &amp; Bàn giao trang thiết bị)'}
                    </option>
                    {rescueTeams.map((team) => (
                      <option key={team._id} value={team._id}>
                        🏢 {team.name} ({typeof team.areaId === 'object' && team.areaId ? (team.areaId as any).name : 'Toàn Tỉnh'})
                      </option>
                    ))}
                  </select>
                  <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#64748b', lineHeight: 1.4 }}>
                    {eqSupplyType === 'CONSUMABLE'
                      ? '💡 Mặc định lưu Kho tổng để điều phối chung; chỉ chọn Đội nếu hàng cứu trợ được chuyển thẳng đến trạm dã chiến của đội đó.'
                      : '💡 Chọn Đội tiếp nhận trực tiếp hoặc lưu Kho tổng dự trữ để sẵn sàng điều chuyển khi có lệnh.'}
                  </p>
                </div>

                {/* 2. Loại hàng hóa theo catalog chuẩn */}
                <div className="executive-modal-field">
                  <label className="executive-modal-label" style={{ fontWeight: 700 }}>
                    {eqSupplyType === 'CONSUMABLE' ? 'Danh mục vật tư cứu trợ chuẩn (*)' : 'Loại Trang Thiết Bị (*)'}
                  </label>
                  {eqSupplyType === 'CONSUMABLE' ? (
                    <select
                      className="executive-modal-select"
                      value={eqName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEqName(val);
                        const matched = STANDARD_CONSUMABLE_CATALOG.find((item) => item.name === val);
                        if (matched) {
                          setEqCategory(matched.category);
                          setEqUnit(matched.unit);
                          setEqMinThreshold(matched.minThreshold);
                          setEqSerialNumber(`LÔ-VT-${Date.now().toString().slice(-4)}`);
                        }
                      }}
                      required
                    >
                      {STANDARD_CONSUMABLE_CATALOG.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name} (ĐVT: {item.unit} | Ngưỡng an toàn: ≥ {item.minThreshold})
                        </option>
                      ))}
                      <option value="CUSTOM">➕ Khác (Nhập mặt hàng cứu trợ khác)...</option>
                    </select>
                  ) : (
                    <select
                      className="executive-modal-select"
                      value={eqName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEqName(val);
                        const matched = STANDARD_EQUIPMENT_CATALOG.find((item) => item.name === val);
                        if (matched) {
                          setEqCategory(matched.category);
                          setEqUnit(matched.unit);
                          setEqSerialNumber(generateRandomEquipmentSerial(matched.category));
                        } else if (val === 'CUSTOM') {
                          setEqSerialNumber(generateRandomEquipmentSerial('KT'));
                        }
                      }}
                      required
                    >
                      {STANDARD_EQUIPMENT_CATALOG.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name} ({item.unit})
                        </option>
                      ))}
                      <option value="CUSTOM">➕ Khác (Nhập thiết bị tùy chỉnh)...</option>
                    </select>
                  )}
                </div>

                {/* Nếu chọn nhập tùy chỉnh */}
                {eqName === 'CUSTOM' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                    <div className="executive-modal-field">
                      <label className="executive-modal-label" style={{ fontWeight: 700 }}>
                        Tên mặt hàng mới (*)
                      </label>
                      <input
                        type="text"
                        className="executive-modal-input"
                        placeholder={eqSupplyType === 'CONSUMABLE' ? 'VD: Chăn giữ nhiệt, Sữa đặc...' : 'VD: Phao bè cứu sinh, Máy phát điện...'}
                        value={customEqName}
                        onChange={(e) => setCustomEqName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="executive-modal-field">
                      <label className="executive-modal-label" style={{ fontWeight: 700 }}>
                        Đơn vị tính (*)
                      </label>
                      <input
                        type="text"
                        className="executive-modal-input"
                        placeholder="VD: thùng, cái, hộp..."
                        value={eqUnit}
                        onChange={(e) => setEqUnit(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                )}

                {/* 3. Cơ số số lượng & Ngưỡng báo động tồn kho (Consumable) hoặc Ngày nhập kho (Khí tài) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700 }}>
                      Số lượng nhập {eqUnit ? `(${eqUnit})` : ''} (*)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={99999}
                      required
                      className="executive-modal-input"
                      value={eqQuantity}
                      onChange={(e) => setEqQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    />
                  </div>

                  {eqSupplyType === 'CONSUMABLE' ? (
                    <div className="executive-modal-field">
                      <label className="executive-modal-label" style={{ fontWeight: 700 }}>
                        Ngưỡng báo động tồn kho (Min) (*)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={9999}
                        required
                        className="executive-modal-input"
                        value={eqMinThreshold}
                        onChange={(e) => setEqMinThreshold(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        placeholder="VD: 20"
                        title="Hệ thống cảnh báo đỏ khi lượng tồn dưới mức này"
                      />
                    </div>
                  ) : (
                    <div className="executive-modal-field">
                      <label className="executive-modal-label" style={{ fontWeight: 700 }}>
                        Ngày nhập kho / Tiếp nhận (*)
                      </label>
                      <input
                        type="date"
                        required
                        className="executive-modal-input"
                        value={eqReceivedAt}
                        onChange={(e) => setEqReceivedAt(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* 4. Ngày nhập kho & Mã lô hàng */}
                <div style={{ display: 'grid', gridTemplateColumns: eqSupplyType === 'CONSUMABLE' ? '1fr 1fr' : '1fr', gap: 12 }}>
                  {eqSupplyType === 'CONSUMABLE' && (
                    <div className="executive-modal-field">
                      <label className="executive-modal-label" style={{ fontWeight: 700 }}>
                        Ngày nhập kho / Tiếp nhận (*)
                      </label>
                      <input
                        type="date"
                        required
                        className="executive-modal-input"
                        value={eqReceivedAt}
                        onChange={(e) => setEqReceivedAt(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700 }}>
                      Mã lô hàng / Số sê-ri đợt nhập
                    </label>
                    <input
                      type="text"
                      className="executive-modal-input"
                      value={eqSerialNumber}
                      onChange={(e) => setEqSerialNumber(e.target.value)}
                      style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
                      placeholder={eqSupplyType === 'CONSUMABLE' ? 'VD: LÔ-LK-202610...' : 'VD: LÔ-AP-6772...'}
                    />
                  </div>
                </div>

                {/* 6. Ghi chú kỹ thuật / bảo quản */}
                <div className="executive-modal-field">
                  <label className="executive-modal-label">
                    {eqSupplyType === 'CONSUMABLE' ? 'Hướng dẫn bảo quản & Điều kiện lưu kho' : 'Thông số kỹ thuật & Hướng dẫn sử dụng'}
                  </label>
                  <textarea
                    rows={2}
                    placeholder={eqSupplyType === 'CONSUMABLE'
                      ? 'VD: Bảo quản nơi khô ráo, nhiệt độ dưới 30°C, ưu tiên xuất trước cho vùng cô lập...'
                      : 'VD: Động cơ xăng 2 thì, áp lực phao đạt chuẩn SOLAS 150N, pin dùng 36 tiếng liên tục...'}
                    className="executive-modal-textarea"
                    value={eqNote}
                    onChange={(e) => setEqNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="executive-modal-footer">
                <button
                  type="button"
                  className="coordination-action-btn outline"
                  onClick={() => setIsCreateEquipmentOpen(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEquipment}
                  className="coordination-action-btn primary"
                >
                  <Check size={15} />
                  <span>
                    {isSubmittingEquipment
                      ? 'Đang nhập kho...'
                      : eqSupplyType === 'CONSUMABLE'
                        ? 'Xác Nhận Nhập Kho Vật Tư Cứu Trợ'
                        : 'Xác Nhận Thêm Trang Thiết Bị'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL 4: HỘP THOẠI XÁC NHẬN RÚT KHỎI ĐỘI HOẶC XÓA TÀI SẢN (CUSTOM UI THAY THẾ ALERT/CONFIRM CỦA TRÌNH DUYỆT) */}
      {deleteConfirmTarget && (
        <div className="executive-modal-backdrop" onClick={() => !isDeleting && setDeleteConfirmTarget(null)}>
          <div
            className="executive-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 460, borderRadius: 16, overflow: 'hidden' }}
          >
            <div
              className="executive-modal-header"
              style={{
                borderBottom: deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' ? '1px solid #fef3c7' : '1px solid #fee2e2',
                background: deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' ? '#fffbeb' : '#fff5f5',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' ? '#fef3c7' : '#fef2f2',
                    border: deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' ? '1px solid #fde68a' : '1px solid #fecaca',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' ? '#b45309' : '#dc2626',
                    flexShrink: 0,
                  }}
                >
                  {deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' ? <LogOut size={18} /> : <AlertTriangle size={18} />}
                </div>
                <div>
                  <h3
                    className="executive-modal-title"
                    style={{
                      color: deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' ? '#92400e' : '#991b1b',
                      fontSize: 16,
                    }}
                  >
                    {deleteConfirmTarget.type === 'UNASSIGN_VEHICLE'
                      ? 'Rút Phương Tiện Ra Khỏi Đội'
                      : deleteConfirmTarget.type === 'DELETE_VEHICLE'
                        ? 'Xác Nhận Xóa Vĩnh Viễn Phương Tiện'
                        : 'Xác Nhận Xóa Vật Tư'}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' ? '#b45309' : '#b91c1c',
                    }}
                  >
                    {deleteConfirmTarget.type === 'UNASSIGN_VEHICLE'
                      ? 'Chuyển phương tiện về Kho tổng dự trữ (Không xóa khỏi hệ thống)'
                      : 'Loại bỏ vĩnh viễn tài sản khỏi cơ sở dữ liệu'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="executive-modal-close"
                onClick={() => !isDeleting && setDeleteConfirmTarget(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="executive-modal-body" style={{ padding: '20px 24px', fontSize: 13.5, color: '#334155', lineHeight: 1.6 }}>
              {deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' ? (
                <>
                  Bạn có chắc chắn muốn rút phương tiện <strong style={{ color: '#0f172a' }}>"{deleteConfirmTarget.name}"</strong> ra khỏi {deleteConfirmTarget.teamName ? <strong>đội "{deleteConfirmTarget.teamName}"</strong> : 'đội cứu hộ'} không?
                  <div
                    style={{
                      marginTop: 12,
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: '#fefce8',
                      border: '1px solid #fef08a',
                      fontSize: 12,
                      color: '#854d0e',
                      lineHeight: 1.5,
                    }}
                  >
                    💡 <strong>Phương tiện sẽ không bị xóa:</strong> Xe sẽ được bảo lưu an toàn trong hệ thống và chuyển về trạng thái <strong>"📦 Kho Tổng / Chưa Biên Chế"</strong>. Bạn có thể điều chuyển xe sang bất kỳ đội cứu hộ nào khác sau này.
                  </div>
                </>
              ) : (
                <>
                  Bạn có chắc chắn muốn xóa vĩnh viễn {deleteConfirmTarget.type === 'DELETE_VEHICLE' ? 'phương tiện' : 'vật tư'}{' '}
                  <strong style={{ color: '#0f172a' }}>"{deleteConfirmTarget.name}"</strong> khỏi hệ thống?
                  <div
                    style={{
                      marginTop: 12,
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      fontSize: 12,
                      color: '#991b1b',
                      lineHeight: 1.5,
                    }}
                  >
                    ⚠️ <strong>Cảnh báo xóa vĩnh viễn:</strong> Toàn bộ dữ liệu của tài sản này sẽ bị xóa hoàn toàn khỏi cơ sở dữ liệu và không thể hoàn tác.
                  </div>
                </>
              )}
            </div>

            <div className="executive-modal-footer" style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                disabled={isDeleting}
                className="coordination-action-btn outline"
                onClick={() => setDeleteConfirmTarget(null)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isDeleting}
                className="coordination-action-btn primary"
                onClick={handleExecuteDelete}
                style={{
                  background: deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' ? '#d97706' : '#dc2626',
                  borderColor: deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' ? '#d97706' : '#dc2626',
                }}
              >
                {deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' ? <LogOut size={14} /> : <Trash2 size={14} />}
                <span>
                  {isDeleting
                    ? 'Đang xử lý...'
                    : deleteConfirmTarget.type === 'UNASSIGN_VEHICLE'
                      ? 'Xác Nhận Rút Về Kho'
                      : 'Xác Nhận Xóa Vĩnh Viễn'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: ĐIỀU CHUYỂN / BIÊN CHẾ PHƯƠNG TIỆN VÀO ĐỘI CỨU HỘ */}
      {transferVehicleTarget && (
        <div className="executive-modal-backdrop" onClick={() => !isTransferring && setTransferVehicleTarget(null)}>
          <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, borderRadius: 16 }}>
            <div className="executive-modal-header" style={{ borderBottom: '1px solid #e0f2fe', background: '#f0f9ff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: '#e0f2fe',
                    border: '1px solid #bae6fd',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0284c7',
                    flexShrink: 0,
                  }}
                >
                  <ArrowRightLeft size={18} />
                </div>
                <div>
                  <h3 className="executive-modal-title" style={{ color: '#0369a1', fontSize: 16 }}>
                    Điều Chuyển / Biên Chế Phương Tiện
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, color: '#0284c7' }}>
                    Xe: <strong>{transferVehicleTarget.plateNumber}</strong> ({transferVehicleTarget.type})
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="executive-modal-close"
                onClick={() => !isTransferring && setTransferVehicleTarget(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleExecuteTransfer} noValidate>
              <div className="executive-modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="executive-modal-field">
                  <label className="executive-modal-label" style={{ fontWeight: 700, color: transferVehicleError ? '#ef4444' : '#0f172a' }}>
                    Đội cứu hộ tiếp nhận biên chế (*)
                  </label>
                  <select
                    className="executive-modal-select"
                    value={transferNewTeamId}
                    onChange={(e) => {
                      setTransferNewTeamId(e.target.value);
                      if (transferVehicleError) setTransferVehicleError('');
                    }}
                    style={{
                      border: transferVehicleError ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                      backgroundColor: transferVehicleError ? '#fef2f2' : '#ffffff',
                      boxShadow: transferVehicleError ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : undefined,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <option value="">-- Chọn đội cứu hộ tiếp nhận xe --</option>
                    <option value="NONE">📦 Kho tổng dự trữ (Không trực thuộc đội nào)</option>
                    {rescueTeams.map((team) => (
                      <option key={team._id} value={team._id}>
                        {team.name} ({typeof team.areaId === 'object' && team.areaId ? (team.areaId as any).name : 'Toàn Tỉnh'})
                      </option>
                    ))}
                  </select>
                  {transferVehicleError && (
                    <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <AlertTriangle size={14} />
                      <span>{transferVehicleError}</span>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                    color: '#64748b',
                    lineHeight: 1.5,
                  }}
                >
                  ℹ️ Khi điều chuyển, phương tiện sẽ xuất hiện trong danh sách xe cơ động của đội mới và được Đội trưởng quản lý trực tiếp.
                </div>
              </div>

              <div className="executive-modal-footer" style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  disabled={isTransferring}
                  className="coordination-action-btn outline"
                  onClick={() => setTransferVehicleTarget(null)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isTransferring}
                  className="coordination-action-btn primary"
                  style={{ background: '#0284c7', borderColor: '#0284c7', cursor: isTransferring ? 'not-allowed' : 'pointer' }}
                >
                  <Check size={14} />
                  <span>{isTransferring ? 'Đang cập nhật...' : 'Xác Nhận Biên Chế'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: XEM HỒ SƠ CHI TIẾT KHÍ TÀI */}
      {selectedEquipment && (
        <div className="executive-modal-backdrop" onClick={() => setSelectedEquipment(null)}>
          <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="executive-modal-header">
              <div>
                <h3 className="executive-modal-title">Hồ Sơ Trang Thiết Bị</h3>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                  {selectedEquipment.serialNumber ? `Mã định danh: ${selectedEquipment.serialNumber}` : 'Trang thiết bị dã chiến'}
                </p>
              </div>
              <button
                type="button"
                className="executive-modal-close"
                onClick={() => setSelectedEquipment(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="executive-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 12,
                  background: '#f8fafc',
                  padding: 14,
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    Tên trang bị
                  </span>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14, marginTop: 2 }}>
                    {selectedEquipment.name}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    Mã lô hàng / Số sê-ri
                  </span>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, marginTop: 2, fontFamily: 'monospace' }}>
                    {selectedEquipment.serialNumber || '— (Trang thiết bị dã chiến)'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    Ngày nhập kho / Tiếp nhận
                  </span>
                  <div style={{ fontWeight: 700, color: '#0284c7', fontSize: 13, marginTop: 2 }}>
                    {selectedEquipment.receivedAt || selectedEquipment.createdAt
                      ? new Date(selectedEquipment.receivedAt || selectedEquipment.createdAt!).toLocaleDateString('vi-VN')
                      : '—'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    Cơ số đợt này
                  </span>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14, marginTop: 2 }}>
                    {selectedEquipment.quantity} {selectedEquipment.unit === 'cai' ? 'cái' : selectedEquipment.unit}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    Đơn vị biên chế quản lý
                  </span>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, marginTop: 2 }}>
                    {typeof selectedEquipment.teamId === 'object' && selectedEquipment.teamId
                      ? (selectedEquipment.teamId as any).name
                      : rescueTeams.find((t) => t._id === selectedEquipment.teamId)?.name || '📦 Kho Tổng / Dự Trữ'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    Trạng thái trực chiến
                  </span>
                  <div style={{ marginTop: 2, fontWeight: 700, fontSize: 13, color: '#059669' }}>
                    {selectedEquipment.status === 'AVAILABLE' ? '🟢 Sẵn sàng trong kho' :
                      selectedEquipment.status === 'IN_USE' ? '🔵 Đang sử dụng' :
                        selectedEquipment.status === 'BORROWED' ? '📤 Đã xuất cấp' :
                          selectedEquipment.status === 'MAINTENANCE' ? '🟡 Đang bảo dưỡng' :
                            selectedEquipment.status === 'DAMAGED' ? '🟣 Hư hỏng' :
                              selectedEquipment.status === 'LOST' ? '🔴 Báo mất' : '⚪ Hết hạn'}
                  </div>
                </div>

                {selectedEquipment.supplyType === 'CONSUMABLE' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                      Ngưỡng báo động tồn kho
                    </span>
                    <div style={{ fontWeight: 700, color: selectedEquipment.quantity <= (selectedEquipment.minThreshold || 20) ? '#dc2626' : '#15803d', fontSize: 13, marginTop: 2 }}>
                      ≥ {selectedEquipment.minThreshold || 20} {selectedEquipment.unit} (Hiện tồn: {selectedEquipment.quantity})
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="executive-modal-label">
                  {selectedEquipment.supplyType === 'CONSUMABLE' ? 'Hướng dẫn bảo quản & Điều kiện lưu kho' : 'Thông số kỹ thuật & Hướng dẫn bảo quản'}
                </label>
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 13,
                    color: '#334155',
                    lineHeight: 1.5,
                  }}
                >
                  {selectedEquipment.note || 'Chưa có ghi chú thông số kỹ thuật.'}
                </div>
              </div>
            </div>

            <div className="executive-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selectedEquipment.supplyType === 'CONSUMABLE' && selectedEquipment.quantity > 0 && (
                  <button
                    type="button"
                    className="coordination-action-btn primary"
                    onClick={() => {
                      const currentEq = selectedEquipment;
                      setSelectedEquipment(null);
                      setConsumeTarget(currentEq);
                      setConsumeQuantity(Math.min(currentEq.quantity, 10));
                      setConsumeDestination('');
                      setConsumeNote('');
                    }}
                    title="Xuất cấp trực tiếp cho người dân hoặc điểm ngập"
                  >
                    <Send size={13} />
                    <span>Xuất Cấp Cứu Trợ</span>
                  </button>
                )}

                {selectedEquipment.supplyType !== 'CONSUMABLE' && (
                  <button
                    type="button"
                    className="coordination-action-btn outline"
                    onClick={() => {
                      const currentEq = selectedEquipment;
                      setSelectedEquipment(null);
                      setTransferEquipmentTarget(currentEq);
                      setTransferEquipmentTeamId('');
                      setTransferEquipmentQuantity(currentEq.quantity);
                      setTransferEquipmentNote('');
                      setTransferEquipmentErrors({});
                    }}
                    title="Điều chuyển cho đội khác hoặc thu hồi về kho tổng"
                  >
                    <ArrowRightLeft size={13} />
                    <span>Bàn Giao / Điều Chuyển</span>
                  </button>
                )}

                <button
                  type="button"
                  className="coordination-action-btn outline"
                  onClick={() => {
                    const currentEq = selectedEquipment;
                    setSelectedEquipment(null);
                    handleOpenEditEquipment(currentEq);
                  }}
                  title="Chỉnh sửa số lượng hoặc thông tin trang thiết bị"
                >
                  <Pencil size={13} />
                  <span>Chỉnh Sửa</span>
                </button>

                <button
                  type="button"
                  className="coordination-action-btn outline"
                  style={{ color: '#dc2626', borderColor: '#fecaca' }}
                  onClick={() => {
                    const currentEq = selectedEquipment;
                    setSelectedEquipment(null);
                    setDeleteConfirmTarget({ type: 'EQUIPMENT', id: currentEq._id, name: currentEq.name });
                  }}
                  title="Xóa trang thiết bị này"
                >
                  <Trash2 size={13} />
                  <span>Xóa</span>
                </button>
              </div>

              <button
                type="button"
                className="coordination-action-btn primary"
                onClick={() => setSelectedEquipment(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: ĐIỀU CHUYỂN / BÀN GIAO KHÍ TÀI (HỖ TRỢ CHỌN SỐ LƯỢNG) */}
      {transferEquipmentTarget && (() => {
        const currentTId = typeof transferEquipmentTarget.teamId === 'object' && transferEquipmentTarget.teamId
          ? (transferEquipmentTarget.teamId as any)._id
          : transferEquipmentTarget.teamId;
        const currentOwnerName = typeof transferEquipmentTarget.teamId === 'object' && transferEquipmentTarget.teamId
          ? (transferEquipmentTarget.teamId as any).name
          : rescueTeams.find((t) => t._id === transferEquipmentTarget.teamId)?.name || '📦 Kho Tổng / Dự Trữ';
        const isFromDepot = !currentTId;
        const maxQty = transferEquipmentTarget.quantity;
        const selectedQty = Math.min(maxQty, Math.max(1, Number(transferEquipmentQuantity) || 1));
        const remainingQty = maxQty - selectedQty;

        return (
          <div className="executive-modal-backdrop" onClick={() => !isTransferringEquipment && setTransferEquipmentTarget(null)}>
            <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, borderRadius: 16 }}>
              <div className="executive-modal-header" style={{ borderBottom: '1px solid #e0f2fe', background: '#f0f9ff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: '#e0f2fe',
                      border: '1px solid #bae6fd',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0284c7',
                      flexShrink: 0,
                    }}
                  >
                    <ArrowRightLeft size={19} />
                  </div>
                  <div>
                    <h3 className="executive-modal-title" style={{ color: '#0369a1', fontSize: 16 }}>
                      Điều Chuyển / Bàn Giao Trang Thiết Bị
                    </h3>
                    <p style={{ margin: 0, fontSize: 12, color: '#0284c7' }}>
                      Trang thiết bị: <strong>{transferEquipmentTarget.name}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="executive-modal-close"
                  onClick={() => !isTransferringEquipment && setTransferEquipmentTarget(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleExecuteTransferEquipment} noValidate>
                <div className="executive-modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Tóm tắt nguồn điều chuyển */}
                  <div
                    style={{
                      fontSize: 13,
                      color: '#475569',
                      background: '#f8fafc',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <span>
                      Đơn vị hiện tại: <strong style={{ color: '#0f172a' }}>{currentOwnerName}</strong>
                    </span>
                    <span>
                      Khả dụng: <strong style={{ color: '#0284c7', fontSize: 14 }}>{maxQty} {transferEquipmentTarget.unit}</strong>
                    </span>
                  </div>

                  {/* 1. Chọn đơn vị tiếp nhận */}
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 13, color: transferEquipmentErrors.team ? '#ef4444' : '#0f172a' }}>
                      Đơn vị tiếp nhận (*)
                    </label>
                    <select
                      className="executive-modal-select"
                      value={transferEquipmentTeamId}
                      onChange={(e) => {
                        setTransferEquipmentTeamId(e.target.value);
                        if (transferEquipmentErrors.team) {
                          setTransferEquipmentErrors((prev) => ({ ...prev, team: undefined }));
                        }
                      }}
                      style={{
                        border: transferEquipmentErrors.team ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                        backgroundColor: transferEquipmentErrors.team ? '#fef2f2' : '#ffffff',
                        boxShadow: transferEquipmentErrors.team ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : undefined,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <option value="">-- Chọn đơn vị tiếp nhận --</option>
                      {!isFromDepot && (
                        <option value="NONE">📦 Kho tổng dự trữ (Thu hồi về kho)</option>
                      )}
                      {rescueTeams
                        .filter((team) => String(team._id) !== String(currentTId))
                        .map((team) => (
                          <option key={team._id} value={team._id}>
                            🏢 {team.name} ({typeof team.areaId === 'object' && team.areaId ? (team.areaId as any).name : 'Toàn Xã'})
                          </option>
                        ))}
                    </select>
                    {transferEquipmentErrors.team && (
                      <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <AlertTriangle size={14} />
                        <span>{transferEquipmentErrors.team}</span>
                      </div>
                    )}
                  </div>

                  {/* 2. Số lượng điều chuyển */}
                  <div className="executive-modal-field" style={{ gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 13, margin: 0, color: transferEquipmentErrors.quantity ? '#ef4444' : '#0f172a' }}>
                        Số lượng điều chuyển (*)
                      </label>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        Tối đa: <strong style={{ color: '#0284c7' }}>{maxQty}</strong> {transferEquipmentTarget.unit}
                      </span>
                    </div>

                    {/* Hộp nhập số lượng tích hợp liền mạch (Unified Input Bar) */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        border: transferEquipmentErrors.quantity ? '1.5px solid #ef4444' : '1.5px solid #cbd5e1',
                        borderRadius: 10,
                        background: transferEquipmentErrors.quantity ? '#fef2f2' : '#ffffff',
                        boxShadow: transferEquipmentErrors.quantity ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : undefined,
                        padding: '4px 8px 4px 14px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="number"
                        min={1}
                        max={maxQty}
                        value={transferEquipmentQuantity}
                        onChange={(e) => {
                          const rawVal = e.target.value;
                          if (rawVal === '') {
                            setTransferEquipmentQuantity('' as any);
                          } else {
                            const val = parseInt(rawVal, 10);
                            setTransferEquipmentQuantity(isNaN(val) ? ('' as any) : val);
                          }
                          if (transferEquipmentErrors.quantity) {
                            setTransferEquipmentErrors((prev) => ({ ...prev, quantity: undefined }));
                          }
                        }}
                        style={{
                          flex: 1,
                          border: 'none',
                          outline: 'none',
                          fontSize: 16,
                          fontWeight: 700,
                          color: '#0f172a',
                          background: 'transparent',
                          padding: '6px 0',
                          minWidth: 60,
                        }}
                      />

                      <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginRight: 12 }}>
                        {transferEquipmentTarget.unit}
                      </span>

                      {/* Nút trừ / cộng gọn trong hộp */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          type="button"
                          disabled={selectedQty <= 1}
                          onClick={() => {
                            setTransferEquipmentQuantity(Math.max(1, selectedQty - 1));
                            if (transferEquipmentErrors.quantity) {
                              setTransferEquipmentErrors((prev) => ({ ...prev, quantity: undefined }));
                            }
                          }}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            border: '1px solid #e2e8f0',
                            background: selectedQty <= 1 ? '#f8fafc' : '#f1f5f9',
                            color: selectedQty <= 1 ? '#cbd5e1' : '#334155',
                            cursor: selectedQty <= 1 ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Giảm 1"
                        >
                          <Minus size={13} />
                        </button>

                        <button
                          type="button"
                          disabled={selectedQty >= maxQty}
                          onClick={() => {
                            setTransferEquipmentQuantity(Math.min(maxQty, selectedQty + 1));
                            if (transferEquipmentErrors.quantity) {
                              setTransferEquipmentErrors((prev) => ({ ...prev, quantity: undefined }));
                            }
                          }}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            border: '1px solid #e2e8f0',
                            background: selectedQty >= maxQty ? '#f8fafc' : '#f1f5f9',
                            color: selectedQty >= maxQty ? '#cbd5e1' : '#334155',
                            cursor: selectedQty >= maxQty ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Tăng 1"
                        >
                          <Plus size={13} />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setTransferEquipmentQuantity(maxQty);
                            if (transferEquipmentErrors.quantity) {
                              setTransferEquipmentErrors((prev) => ({ ...prev, quantity: undefined }));
                            }
                          }}
                          style={{
                            padding: '5px 10px',
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontWeight: 700,
                            border: selectedQty === maxQty ? '1px solid #0284c7' : '1px solid #bae6fd',
                            background: selectedQty === maxQty ? '#0284c7' : '#e0f2fe',
                            color: selectedQty === maxQty ? '#ffffff' : '#0369a1',
                            cursor: 'pointer',
                            marginLeft: 4,
                            transition: 'all 0.15s ease',
                          }}
                          title="Chọn toàn bộ số lượng"
                        >
                          Tất cả
                        </button>
                      </div>
                    </div>

                    {transferEquipmentErrors.quantity && (
                      <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <AlertTriangle size={14} />
                        <span>{transferEquipmentErrors.quantity}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginTop: 2 }}>
                      <span style={{ color: remainingQty === 0 ? '#b45309' : '#15803d', fontWeight: 600 }}>
                        📦 Còn lại tại nguồn: <strong>{remainingQty} {transferEquipmentTarget.unit}</strong>
                      </span>
                      {maxQty > 1 && (
                        <span style={{ color: '#64748b' }}>
                          Bàn giao: <strong>{selectedQty}/{maxQty}</strong> {transferEquipmentTarget.unit}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 3. Lý do điều chuyển */}
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 13 }}>
                      Lý do điều chuyển <span style={{ fontWeight: 400, color: '#94a3b8' }}>(tùy chọn)</span>
                    </label>
                    <input
                      type="text"
                      className="executive-modal-input"
                      placeholder="VD: Cấp phát tăng cường ứng phó bão lũ..."
                      value={transferEquipmentNote}
                      onChange={(e) => setTransferEquipmentNote(e.target.value)}
                    />
                  </div>
                </div>

                <div className="executive-modal-footer" style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                  <button
                    type="button"
                    disabled={isTransferringEquipment}
                    className="coordination-action-btn outline"
                    onClick={() => setTransferEquipmentTarget(null)}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isTransferringEquipment}
                    className="coordination-action-btn primary"
                    style={{ background: '#0284c7', borderColor: '#0284c7', cursor: isTransferringEquipment ? 'not-allowed' : 'pointer' }}
                  >
                    <Check size={14} />
                    <span>{isTransferringEquipment ? 'Đang bàn giao...' : `Xác Nhận Bàn Giao (${selectedQty} ${transferEquipmentTarget.unit})`}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* MODAL 8: CHỈNH SỬA KHÍ TÀI */}
      {editEquipmentTarget && (
        <div className="executive-modal-backdrop" onClick={() => !isUpdatingEquipment && setEditEquipmentTarget(null)}>
          <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="executive-modal-header">
              <div>
                <h3 className="executive-modal-title">Cập Nhật Thông Tin Trang Thiết Bị</h3>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                  {editEquipmentTarget.name} ({editEquipmentTarget.serialNumber || 'Không có sê-ri'})
                </p>
              </div>
              <button
                type="button"
                className="executive-modal-close"
                onClick={() => !isUpdatingEquipment && setEditEquipmentTarget(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditEquipment}>
              <div className="executive-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Số lượng ({editEquipmentTarget.unit}) (*)</label>
                    <input
                      type="number"
                      min={0}
                      max={9999}
                      required
                      className="executive-modal-input"
                      value={editEqQuantity}
                      onChange={(e) => setEditEqQuantity(Number(e.target.value))}
                    />
                  </div>

                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Ngày nhập kho / Tiếp nhận</label>
                    <input
                      type="date"
                      className="executive-modal-input"
                      value={editEqReceivedAt}
                      onChange={(e) => setEditEqReceivedAt(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Mã lô hàng / Số sê-ri</label>
                    <input
                      type="text"
                      className="executive-modal-input"
                      value={editEqSerialNumber}
                      onChange={(e) => setEditEqSerialNumber(e.target.value)}
                      style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
                      placeholder="VD: LÔ-AP-6772..."
                    />
                  </div>

                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Trạng thái kỹ thuật</label>
                    <select
                      className="executive-modal-select"
                      value={editEqStatus}
                      onChange={(e) => setEditEqStatus(e.target.value)}
                    >
                      <option value="AVAILABLE">🟢 Sẵn sàng trong kho</option>
                      <option value="IN_USE">🔵 Đang sử dụng</option>
                      <option value="BORROWED">📤 Đã xuất cấp</option>
                      <option value="MAINTENANCE">🟡 Đang bảo dưỡng</option>
                      <option value="DAMAGED">🟣 Hư hỏng kỹ thuật</option>
                      <option value="LOST">🔴 Thất lạc / Báo mất</option>
                      <option value="EXPIRED">⚪ Hết hạn sử dụng</option>
                    </select>
                  </div>
                </div>

                <div className="executive-modal-field">
                  <label className="executive-modal-label">Ghi chú thông số &amp; tình trạng chi tiết</label>
                  <textarea
                    rows={3}
                    className="executive-modal-textarea"
                    value={editEqNote}
                    onChange={(e) => setEditEqNote(e.target.value)}
                    placeholder="Nhập thông số kỹ thuật, hướng dẫn bảo quản..."
                  />
                </div>
              </div>

              <div className="executive-modal-footer">
                <button
                  type="button"
                  disabled={isUpdatingEquipment}
                  className="coordination-action-btn outline"
                  onClick={() => setEditEquipmentTarget(null)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingEquipment}
                  className="coordination-action-btn primary"
                >
                  <Check size={14} />
                  <span>{isUpdatingEquipment ? 'Đang lưu...' : 'Lưu Thay Đổi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 9: XUẤT CẤP VẬT TƯ CỨU TRỢ DÂN SINH */}
      {consumeTarget && (() => {
        const maxQty = consumeTarget.quantity;
        const currentQty = Math.min(maxQty, Math.max(1, Number(consumeQuantity) || 1));
        const remainingQty = maxQty - currentQty;
        const ownerName = typeof consumeTarget.teamId === 'object' && consumeTarget.teamId
          ? (consumeTarget.teamId as any).name
          : rescueTeams.find((t) => t._id === consumeTarget.teamId)?.name || '📦 Kho Tổng Cứu Trợ SOS';

        return (
          <div className="executive-modal-backdrop" onClick={() => !isConsuming && setConsumeTarget(null)}>
            <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540, borderRadius: 16 }}>
              <div className="executive-modal-header" style={{ borderBottom: '1px solid #bae6fd', background: '#f0f9ff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: '#e0f2fe',
                      border: '1px solid #bae6fd',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0284c7',
                      flexShrink: 0,
                    }}
                  >
                    <Send size={18} />
                  </div>
                  <div>
                    <h3 className="executive-modal-title" style={{ color: '#0369a1', fontSize: 16 }}>
                      Xuất Cấp Cứu Trợ Dân Sinh Khẩn Cấp
                    </h3>
                    <p style={{ margin: 0, fontSize: 12, color: '#0284c7' }}>
                      Xuất kho trực tiếp cho người dân ngập lụt, cô lập hoặc điểm tập kết cứu nạn
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="executive-modal-close"
                  onClick={() => !isConsuming && setConsumeTarget(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleConfirmConsume}>
                <div className="executive-modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Tóm tắt mặt hàng đang xuất */}
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: 10,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>
                        {consumeTarget.name}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                        Lô hàng: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>{consumeTarget.serialNumber || 'Không có mã'}</span> • Kho: <strong>{ownerName}</strong>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                        Tồn kho khả dụng
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#0284c7' }}>
                        {maxQty} <span style={{ fontSize: 13, fontWeight: 600 }}>{consumeTarget.unit}</span>
                      </div>
                    </div>
                  </div>

                  {/* 1. Chọn số lượng xuất cấp */}
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 13 }}>
                      Số lượng xuất cấp ({consumeTarget.unit}) (*)
                    </label>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: 10,
                        padding: '4px 10px',
                        background: '#ffffff',
                      }}
                    >
                      <input
                        type="number"
                        min={1}
                        max={maxQty}
                        value={currentQty}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setConsumeQuantity(isNaN(val) ? 1 : Math.min(maxQty, Math.max(1, val)));
                        }}
                        style={{
                          border: 'none',
                          outline: 'none',
                          flex: 1,
                          fontSize: 16,
                          fontWeight: 800,
                          color: '#0f172a',
                          background: 'transparent',
                          padding: '6px 0',
                          minWidth: 60,
                        }}
                      />

                      <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginRight: 12 }}>
                        {consumeTarget.unit}
                      </span>

                      {/* Nút cộng trừ & nút tắt nhanh */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <button
                          type="button"
                          disabled={currentQty <= 1}
                          onClick={() => setConsumeQuantity(Math.max(1, currentQty - 1))}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            border: '1px solid #e2e8f0',
                            background: currentQty <= 1 ? '#f8fafc' : '#f1f5f9',
                            color: currentQty <= 1 ? '#cbd5e1' : '#334155',
                            cursor: currentQty <= 1 ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Giảm 1"
                        >
                          <Minus size={13} />
                        </button>

                        <button
                          type="button"
                          disabled={currentQty >= maxQty}
                          onClick={() => setConsumeQuantity(Math.min(maxQty, currentQty + 1))}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            border: '1px solid #e2e8f0',
                            background: currentQty >= maxQty ? '#f8fafc' : '#f1f5f9',
                            color: currentQty >= maxQty ? '#cbd5e1' : '#334155',
                            cursor: currentQty >= maxQty ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Tăng 1"
                        >
                          <Plus size={13} />
                        </button>

                        {/* Presets */}
                        {maxQty >= 10 && (
                          <button
                            type="button"
                            onClick={() => setConsumeQuantity(Math.min(maxQty, 10))}
                            style={{
                              padding: '5px 8px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              fontWeight: 700,
                              border: currentQty === 10 ? '1px solid #0284c7' : '1px solid #e2e8f0',
                              background: currentQty === 10 ? '#0284c7' : '#f1f5f9',
                              color: currentQty === 10 ? '#ffffff' : '#334155',
                              cursor: 'pointer',
                            }}
                          >
                            10
                          </button>
                        )}
                        {maxQty >= 50 && (
                          <button
                            type="button"
                            onClick={() => setConsumeQuantity(Math.min(maxQty, 50))}
                            style={{
                              padding: '5px 8px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              fontWeight: 700,
                              border: currentQty === 50 ? '1px solid #0284c7' : '1px solid #e2e8f0',
                              background: currentQty === 50 ? '#0284c7' : '#f1f5f9',
                              color: currentQty === 50 ? '#ffffff' : '#334155',
                              cursor: 'pointer',
                            }}
                          >
                            50
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setConsumeQuantity(maxQty)}
                          style={{
                            padding: '5px 10px',
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontWeight: 700,
                            border: currentQty === maxQty ? '1px solid #0284c7' : '1px solid #bae6fd',
                            background: currentQty === maxQty ? '#0284c7' : '#f0f9ff',
                            color: currentQty === maxQty ? '#ffffff' : '#0369a1',
                            cursor: 'pointer',
                            marginLeft: 2,
                            transition: 'all 0.15s ease',
                          }}
                          title="Xuất toàn bộ cơ số còn lại"
                        >
                          Tất cả
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginTop: 4 }}>
                      <span style={{ color: remainingQty === 0 ? '#dc2626' : remainingQty <= (consumeTarget.minThreshold || 20) ? '#d97706' : '#15803d', fontWeight: 600 }}>
                        📦 Còn lại trong kho: <strong>{remainingQty} {consumeTarget.unit}</strong> {remainingQty === 0 ? '(Sẽ hết kho)' : remainingQty <= (consumeTarget.minThreshold || 20) ? '⚠️ (Dưới ngưỡng tồn)' : ''}
                      </span>
                      <span style={{ color: '#64748b' }}>
                        Tỷ lệ xuất: <strong>{Math.round((currentQty / maxQty) * 100)}%</strong>
                      </span>
                    </div>
                  </div>

                  {/* 2. Nơi tiếp nhận cứu trợ */}
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 13 }}>
                      Điểm tiếp nhận cứu trợ / Khu vực ngập lụt (*)
                    </label>
                    <input
                      type="text"
                      required
                      className="executive-modal-input"
                      placeholder="VD: Thôn An Trạch (Xã Hòa Tiến), Điểm sơ tán Trường THCS Nguyễn Du, Khu vực Cẩm Lệ..."
                      value={consumeDestination}
                      onChange={(e) => setConsumeDestination(e.target.value)}
                    />
                  </div>

                  {/* 3. Ghi chú điều phối / Biên bản bàn giao */}
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 13 }}>
                      Ghi chú / Người đại diện nhận hàng <span style={{ fontWeight: 400, color: '#94a3b8' }}>(tùy chọn)</span>
                    </label>
                    <textarea
                      rows={2}
                      className="executive-modal-textarea"
                      placeholder="VD: Trưởng thôn Nguyễn Văn A tiếp nhận (SĐT: 0912.xxx.xxx), cấp phát cho 45 hộ dân bị chia cắt..."
                      value={consumeNote}
                      onChange={(e) => setConsumeNote(e.target.value)}
                    />
                  </div>
                </div>

                <div className="executive-modal-footer" style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                  <button
                    type="button"
                    disabled={isConsuming}
                    className="coordination-action-btn outline"
                    onClick={() => setConsumeTarget(null)}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isConsuming}
                    className="coordination-action-btn primary"
                    style={{ cursor: isConsuming ? 'not-allowed' : 'pointer' }}
                  >
                    <Send size={14} />
                    <span>{isConsuming ? 'Đang xuất cấp...' : `Xác Nhận Xuất Cấp (${currentQty} ${consumeTarget.unit})`}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
      {/* MODAL 10: PHIẾU XUẤT CẤP CỨU TRỢ TỔNG HỢP (XUẤT NHIỀU MẶT HÀNG CÙNG LÚC) */}
      {isBatchConsumeOpen && (() => {
        const availableConsumables = consumableEquipments.filter((e) => e.quantity > 0);

        return (
          <div className="executive-modal-backdrop" onClick={() => !isSubmittingBatchConsume && setIsBatchConsumeOpen(false)}>
            <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, width: '95%', borderRadius: 16 }}>
              <div className="executive-modal-header" style={{ borderBottom: '1px solid #bae6fd', background: '#f0f9ff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: '#e0f2fe',
                      border: '1px solid #bae6fd',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0284c7',
                      flexShrink: 0,
                    }}
                  >
                    <PackageCheck size={19} />
                  </div>
                  <div>
                    <h3 className="executive-modal-title" style={{ color: '#0369a1', fontSize: 16 }}>
                      Phiếu Xuất Cấp Cứu Trợ Tổng Hợp
                    </h3>
                    <p style={{ margin: 0, fontSize: 12, color: '#0284c7' }}>
                      Xuất cùng lúc nhiều loại nhu yếu phẩm cho chuyến xe cứu trợ hoặc điểm sơ tán
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="executive-modal-close"
                  onClick={() => !isSubmittingBatchConsume && setIsBatchConsumeOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleConfirmBatchConsume}>
                <div className="executive-modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '72vh', overflowY: 'auto', overflowX: 'hidden' }}>
                  {/* 1. Chọn phương thức xuất cấp (Top-level Decision) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, width: '100%', boxSizing: 'border-box' }}>
                    <div
                      onClick={() => setBatchDispatchMode('ASSIGN_TEAM')}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 12,
                        border: batchDispatchMode === 'ASSIGN_TEAM' ? '2px solid #0284c7' : '1px solid #e2e8f0',
                        background: batchDispatchMode === 'ASSIGN_TEAM' ? '#f0f9ff' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        minWidth: 0,
                        width: '100%',
                        boxSizing: 'border-box',
                        transition: 'all 0.15s ease',
                        boxShadow: batchDispatchMode === 'ASSIGN_TEAM' ? '0 2px 6px rgba(2, 132, 199, 0.12)' : 'none',
                      }}
                    >
                      <div style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: batchDispatchMode === 'ASSIGN_TEAM' ? '#0284c7' : '#f1f5f9',
                        color: batchDispatchMode === 'ASSIGN_TEAM' ? '#ffffff' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <Truck size={19} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: batchDispatchMode === 'ASSIGN_TEAM' ? '#0369a1' : '#0f172a' }}>
                          Điều động Đội cứu hộ tiếp tế
                        </div>
                        <div style={{ fontSize: 11.5, color: batchDispatchMode === 'ASSIGN_TEAM' ? '#0284c7' : '#64748b', marginTop: 2, lineHeight: 1.35 }}>
                          Đội cơ động chuyển hàng đến điểm ngập, theo dõi trên bản đồ
                        </div>
                      </div>
                    </div>

                    <div
                      onClick={() => setBatchDispatchMode('DIRECT')}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 12,
                        border: batchDispatchMode === 'DIRECT' ? '2px solid #0284c7' : '1px solid #e2e8f0',
                        background: batchDispatchMode === 'DIRECT' ? '#f0f9ff' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        minWidth: 0,
                        width: '100%',
                        boxSizing: 'border-box',
                        transition: 'all 0.15s ease',
                        boxShadow: batchDispatchMode === 'DIRECT' ? '0 2px 6px rgba(2, 132, 199, 0.12)' : 'none',
                      }}
                    >
                      <div style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: batchDispatchMode === 'DIRECT' ? '#0284c7' : '#f1f5f9',
                        color: batchDispatchMode === 'DIRECT' ? '#ffffff' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <PackageCheck size={19} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: batchDispatchMode === 'DIRECT' ? '#0369a1' : '#0f172a' }}>
                          Xuất cấp trực tiếp tại kho
                        </div>
                        <div style={{ fontSize: 11.5, color: batchDispatchMode === 'DIRECT' ? '#0284c7' : '#64748b', marginTop: 2, lineHeight: 1.35 }}>
                          Người dân hoặc đoàn xe bên ngoài tự đến nhận tại kho
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. Thông tin tiếp nhận & Điều phối chi tiết */}
                  {batchDispatchMode === 'ASSIGN_TEAM' ? (
                    <div style={{
                      padding: '16px',
                      borderRadius: 12,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      width: '100%',
                      boxSizing: 'border-box',
                    }}>
                      {/* Hàng 1: Đội cứu hộ (Full Width để hiển thị trọn vẹn tên đội dài) */}
                      <div className="executive-modal-field">
                        <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 12.5, color: '#0f172a' }}>
                          Đội cứu hộ tiếp nhận nhiệm vụ (*)
                        </label>
                        <select
                          required
                          className="executive-modal-select"
                          value={batchTeamId}
                          onChange={(e) => setBatchTeamId(e.target.value)}
                          style={{ background: '#ffffff', fontWeight: 600, width: '100%' }}
                        >
                          <option value="">-- Chọn Đội cứu hộ nhận lệnh tiếp tế --</option>
                          {rescueTeams.map((t) => {
                            const areaName = typeof t.areaId === 'object' && t.areaId ? (t.areaId as any).name : '';
                            
                            let leaderName = '';
                            let leaderPhone = '';
                            if (typeof t.leaderId === 'object' && t.leaderId) {
                              leaderName = (t.leaderId as any).fullName || (t.leaderId as any).name || '';
                              leaderPhone = (t.leaderId as any).phone || '';
                            } else if (Array.isArray(t.members) && t.members.length > 0) {
                              const leaderMember = t.members.find((m) => m.role === 'LEADER') || t.members[0];
                              const rescuerObj = typeof leaderMember?.rescuerId === 'object' ? (leaderMember.rescuerId as any) : null;
                              leaderName = rescuerObj?.fullName || rescuerObj?.name || '';
                              leaderPhone = rescuerObj?.phone || '';
                            }

                            const leaderText = leaderName
                              ? ` • Đội trưởng: ${leaderName}${leaderPhone ? ` (${leaderPhone})` : ''}`
                              : '';
                            return (
                              <option key={t._id} value={t._id}>
                                {t.name} {areaName ? `(${areaName})` : ''}{leaderText}
                              </option>
                            );
                          })}
                        </select>
                        {batchTeamId && (() => {
                          const chosenTeam = rescueTeams.find((t) => t._id === batchTeamId);
                          if (!chosenTeam) return null;
                          let lName = '';
                          let lPhone = '';
                          if (typeof chosenTeam.leaderId === 'object' && chosenTeam.leaderId) {
                            lName = (chosenTeam.leaderId as any).fullName || (chosenTeam.leaderId as any).name || '';
                            lPhone = (chosenTeam.leaderId as any).phone || '';
                          } else if (Array.isArray(chosenTeam.members) && chosenTeam.members.length > 0) {
                            const leaderMember = chosenTeam.members.find((m) => m.role === 'LEADER') || chosenTeam.members[0];
                            const rescuerObj = typeof leaderMember?.rescuerId === 'object' ? (leaderMember.rescuerId as any) : null;
                            lName = rescuerObj?.fullName || rescuerObj?.name || '';
                            lPhone = rescuerObj?.phone || '';
                          }
                          return (
                            <div style={{ marginTop: 5, fontSize: 11.5, color: '#0284c7', display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span>👤 Đội trưởng tiếp nhận: <strong style={{ color: '#0f172a' }}>{lName || 'Chưa chỉ định'}</strong></span>
                              {lPhone && <span>• SĐT: <strong style={{ color: '#0f172a' }}>{lPhone}</strong></span>}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Hàng 2: Địa điểm tiếp tế / Khu vực ngập lụt */}
                      <div className="executive-modal-field">
                        <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 12.5, color: '#0f172a' }}>
                          Địa điểm tiếp tế / Khu vực ngập lụt (*)
                        </label>
                        <input
                          type="text"
                          required
                          className="executive-modal-input"
                          placeholder="VD: Điểm sơ tán Trường THCS Nguyễn Du, Thôn An Trạch (xã Hòa Tiến)..."
                          value={batchDestination}
                          onChange={(e) => setBatchDestination(e.target.value)}
                          style={{ background: '#ffffff', width: '100%' }}
                        />
                      </div>

                      {/* Hàng 3: 2 cột cân đối: Người liên hệ | Ghi chú phương tiện */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%', boxSizing: 'border-box' }}>
                        <div className="executive-modal-field">
                          <label className="executive-modal-label" style={{ fontSize: 12 }}>
                            Người liên hệ / SĐT <span style={{ color: '#94a3b8' }}>(tùy chọn)</span>
                          </label>
                          <input
                            type="text"
                            className="executive-modal-input"
                            placeholder="VD: Thầy Trần Văn B - 0912.xxx.xxx"
                            value={batchRecipientName}
                            onChange={(e) => setBatchRecipientName(e.target.value)}
                            style={{ background: '#ffffff', width: '100%' }}
                          />
                        </div>

                        <div className="executive-modal-field">
                          <label className="executive-modal-label" style={{ fontSize: 12 }}>
                            Phương tiện / Ghi chú xe <span style={{ color: '#94a3b8' }}>(tùy chọn)</span>
                          </label>
                          <input
                            type="text"
                            className="executive-modal-input"
                            placeholder="VD: Ca nô 02 / Xe tải 2.5T đợt 1..."
                            value={batchNote}
                            onChange={(e) => setBatchNote(e.target.value)}
                            style={{ background: '#ffffff', width: '100%' }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      padding: '16px',
                      borderRadius: 12,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      width: '100%',
                      boxSizing: 'border-box',
                    }}>
                      <div className="executive-modal-field">
                        <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 12.5, color: '#0f172a' }}>
                          Địa bàn / Điểm cần tiếp nhận cứu trợ (*)
                        </label>
                        <input
                          type="text"
                          required
                          className="executive-modal-input"
                          placeholder="VD: Thôn An Trạch, xã Hòa Tiến (hoặc Đoàn cứu trợ Tỉnh bạn)..."
                          value={batchDestination}
                          onChange={(e) => setBatchDestination(e.target.value)}
                          style={{ background: '#ffffff', width: '100%' }}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%', boxSizing: 'border-box' }}>
                        <div className="executive-modal-field">
                          <label className="executive-modal-label" style={{ fontSize: 12 }}>
                            Người đại diện nhận hàng <span style={{ color: '#94a3b8' }}>(tùy chọn)</span>
                          </label>
                          <input
                            type="text"
                            className="executive-modal-input"
                            placeholder="VD: Nguyễn Văn A (Trưởng thôn)..."
                            value={batchRecipientName}
                            onChange={(e) => setBatchRecipientName(e.target.value)}
                            style={{ background: '#ffffff', width: '100%' }}
                          />
                        </div>

                        <div className="executive-modal-field">
                          <label className="executive-modal-label" style={{ fontSize: 12 }}>
                            Số điện thoại / Biển số xe nhận <span style={{ color: '#94a3b8' }}>(tùy chọn)</span>
                          </label>
                          <input
                            type="text"
                            className="executive-modal-input"
                            placeholder="VD: 0912.xxx.xxx hoặc Xe 43C-123.45..."
                            value={batchNote}
                            onChange={(e) => setBatchNote(e.target.value)}
                            style={{ background: '#ffffff', width: '100%' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. Danh mục các mặt hàng xuất cấp */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: '#0f172a' }}>
                        Danh mục vật tư xuất kho ({batchItems.length} loại mặt hàng)
                      </span>
                      <button
                        type="button"
                        onClick={handleAddBatchItem}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#0284c7',
                          background: '#e0f2fe',
                          border: '1px solid #bae6fd',
                          padding: '4px 10px',
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                      >
                        <Plus size={13} />
                        <span>Thêm mặt hàng</span>
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {batchItems.map((bi, idx) => {
                        const currentEq = consumableEquipments.find((e) => e._id === bi.equipmentId);
                        const maxStock = currentEq ? currentEq.quantity : 0;
                        const unitName = currentEq ? currentEq.unit : 'đơn vị';
                        const teamObj = typeof currentEq?.teamId === 'object' && currentEq?.teamId ? (currentEq.teamId as any).name : null;
                        const locText = teamObj ? teamObj : 'Kho Tổng';

                        return (
                          <div
                            key={idx}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #e2e8f0',
                              borderRadius: 12,
                              padding: '10px 14px',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                              width: '100%',
                              boxSizing: 'border-box',
                            }}
                          >
                            {/* Hàng 1: Số thứ tự + Chọn mặt hàng vật tư + Nút xóa */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                              <span style={{
                                width: 24,
                                height: 24,
                                borderRadius: 6,
                                background: '#e0f2fe',
                                color: '#0369a1',
                                fontSize: 11.5,
                                fontWeight: 800,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}>
                                {idx + 1}
                              </span>

                              {/* Dropdown chọn mặt hàng */}
                              <select
                                value={bi.equipmentId}
                                onChange={(e) => handleUpdateBatchItem(idx, { equipmentId: e.target.value })}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  height: 38,
                                  borderRadius: 8,
                                  border: '1px solid #cbd5e1',
                                  background: '#f8fafc',
                                  padding: '0 10px',
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: '#0f172a',
                                  outline: 'none',
                                  cursor: 'pointer',
                                }}
                              >
                                {availableConsumables.map((eq) => {
                                  const eqTeam = typeof eq.teamId === 'object' && eq.teamId ? (eq.teamId as any).name : null;
                                  const eqLoc = eqTeam ? eqTeam : 'Kho Tổng';
                                  return (
                                    <option key={eq._id} value={eq._id}>
                                      {eq.name} — (Tồn: {eq.quantity} {eq.unit} • {eqLoc})
                                    </option>
                                  );
                                })}
                              </select>

                              {/* Nút xóa dòng */}
                              <button
                                type="button"
                                disabled={batchItems.length <= 1}
                                onClick={() => handleRemoveBatchItem(idx)}
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: 8,
                                  border: batchItems.length <= 1 ? '1px solid #e2e8f0' : '1px solid #fee2e2',
                                  background: batchItems.length <= 1 ? '#f8fafc' : '#fef2f2',
                                  color: batchItems.length <= 1 ? '#94a3b8' : '#dc2626',
                                  cursor: batchItems.length <= 1 ? 'not-allowed' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  opacity: batchItems.length <= 1 ? 0.35 : 1,
                                }}
                                title={batchItems.length <= 1 ? 'Phiếu xuất cần ít nhất 1 mặt hàng' : 'Xóa mặt hàng này khỏi phiếu'}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>

                            {/* Hàng 2: Tồn kho & Vị trí | Bộ chọn số lượng xuất */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingLeft: 34,
                              flexWrap: 'wrap',
                              gap: 10,
                            }}>
                              {/* Thông tin tồn kho */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
                                <span style={{
                                  background: '#f0fdf4',
                                  color: '#15803d',
                                  border: '1px solid #bbf7d0',
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  fontWeight: 700,
                                  fontSize: 11.5,
                                }}>
                                  Tồn kho: {maxStock} {unitName}
                                </span>
                                <span>•</span>
                                <span>Vị trí: <strong style={{ color: '#334155' }}>{locText}</strong></span>
                              </div>

                              {/* Bộ điều khiển số lượng */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Số lượng xuất:</span>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: 8,
                                    background: '#ffffff',
                                    height: 32,
                                    padding: '0 4px',
                                    gap: 2,
                                  }}
                                >
                                  <button
                                    type="button"
                                    disabled={bi.quantity <= 1}
                                    onClick={() => handleUpdateBatchItem(idx, { quantity: Math.max(1, bi.quantity - 1) })}
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: 4,
                                      border: 'none',
                                      background: bi.quantity <= 1 ? 'transparent' : '#f1f5f9',
                                      color: bi.quantity <= 1 ? '#cbd5e1' : '#334155',
                                      cursor: bi.quantity <= 1 ? 'not-allowed' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    <Minus size={11} />
                                  </button>

                                  <input
                                    type="number"
                                    min={1}
                                    max={maxStock}
                                    value={bi.quantity}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      handleUpdateBatchItem(idx, { quantity: isNaN(val) ? 1 : Math.min(maxStock, Math.max(1, val)) });
                                    }}
                                    style={{
                                      width: 48,
                                      border: 'none',
                                      outline: 'none',
                                      textAlign: 'center',
                                      fontWeight: 800,
                                      fontSize: 13,
                                      color: '#0f172a',
                                      background: 'transparent',
                                    }}
                                  />

                                  <button
                                    type="button"
                                    disabled={bi.quantity >= maxStock}
                                    onClick={() => handleUpdateBatchItem(idx, { quantity: Math.min(maxStock, bi.quantity + 1) })}
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: 4,
                                      border: 'none',
                                      background: bi.quantity >= maxStock ? 'transparent' : '#f1f5f9',
                                      color: bi.quantity >= maxStock ? '#cbd5e1' : '#334155',
                                      cursor: bi.quantity >= maxStock ? 'not-allowed' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    <Plus size={11} />
                                  </button>
                                </div>

                                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0369a1' }}>
                                  {unitName}
                                </span>

                                {maxStock > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateBatchItem(idx, { quantity: maxStock })}
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: bi.quantity === maxStock ? '#15803d' : '#0284c7',
                                      background: bi.quantity === maxStock ? '#dcfce7' : '#f0f9ff',
                                      border: bi.quantity === maxStock ? '1px solid #86efac' : '1px solid #bae6fd',
                                      borderRadius: 6,
                                      padding: '2px 8px',
                                      cursor: 'pointer',
                                      marginLeft: 2,
                                    }}
                                    title="Chọn xuất toàn bộ tồn kho hiện có"
                                  >
                                    Tối đa
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="executive-modal-footer" style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                  <button
                    type="button"
                    disabled={isSubmittingBatchConsume}
                    className="coordination-action-btn outline"
                    onClick={() => setIsBatchConsumeOpen(false)}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingBatchConsume}
                    className="coordination-action-btn primary"
                    style={{ background: '#0284c7', borderColor: '#0284c7', cursor: isSubmittingBatchConsume ? 'not-allowed' : 'pointer' }}
                  >
                    <PackageCheck size={15} />
                    <span>
                      {isSubmittingBatchConsume
                        ? 'Đang xử lý...'
                        : batchDispatchMode === 'ASSIGN_TEAM'
                        ? `Lập Lệnh Điều Phối & Xuất Kho (${batchItems.length} mặt hàng)`
                        : `Xác Nhận Xuất Cấp Tại Kho (${batchItems.length} mặt hàng)`}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default ResourcesView;

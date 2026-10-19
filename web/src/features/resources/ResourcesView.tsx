import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Truck,
  LifeBuoy,
  RefreshCw,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
  Send,
  Eye,
  Check,
  Phone,
  MapPin,
  PlusCircle,
  Clock,
} from 'lucide-react';
import type { VehicleItem, RescueTeamItem } from '@/types/dashboard';
import { fetchVehicles, fetchRescueTeams } from '@/api';
import { FALLBACK_SUPPLIES, type SupplyItem } from '@/constants';
import { toast } from '@/components/common/toast';
import '@/features/sos/SosRequestsView.css';
import './ResourcesView.css';

export interface ResourcesViewProps {
  vehicles?: VehicleItem[];
  rescueTeams?: RescueTeamItem[];
  onOpenMap?: (sosId?: any) => void;
}

export const ResourcesView: React.FC<ResourcesViewProps> = ({
  vehicles: propVehicles = [],
  rescueTeams: propTeams = [],
}) => {
  const [vehicles, setVehicles] = useState<VehicleItem[]>(propVehicles);
  const [rescueTeams, setRescueTeams] = useState<RescueTeamItem[]>(propTeams);
  const [supplies, setSupplies] = useState<SupplyItem[]>(FALLBACK_SUPPLIES);
  const [resourceTab, setResourceTab] = useState<'VEHICLES' | 'SUPPLIES'>('VEHICLES');
  const [suppliesSubTab, setSuppliesSubTab] = useState<'BY_TEAM' | 'DEPOT'>('BY_TEAM');
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshIndex, setRefreshIndex] = useState(0);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<string>('ALL');
  const [vehicleTeamFilter, setVehicleTeamFilter] = useState<string>('ALL');
  const [supplyCategoryFilter, setSupplyCategoryFilter] = useState<string>('ALL');

  // Modals
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleItem | null>(null);
  const [selectedSupplyToDispatch, setSelectedSupplyToDispatch] = useState<SupplyItem | null>(null);
  const [isCreateVehicleOpen, setIsCreateVehicleOpen] = useState(false);

  // New vehicle form state
  const [newPlate, setNewPlate] = useState('');
  const [newType, setNewType] = useState<'BOAT' | 'AMBULANCE' | 'TRUCK'>('BOAT');
  const [newCapacity, setNewCapacity] = useState<number>(6);
  const [newTeamId, setNewTeamId] = useState<string>('');
  const [newDescription, setNewDescription] = useState('');

  // Dispatch supply form state
  const [dispatchTargetTeam, setDispatchTargetTeam] = useState<string>('');
  const [dispatchAmount, setDispatchAmount] = useState<number>(10);
  const [dispatchNote, setDispatchNote] = useState<string>('');
  const [dispatchSuccessMsg, setDispatchSuccessMsg] = useState<string | null>(null);

  const refreshData = () => setRefreshIndex((p) => p + 1);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [vehRes, teamRes] = await Promise.allSettled([
        fetchVehicles(),
        fetchRescueTeams(),
      ]);

      if (vehRes.status === 'fulfilled' && vehRes.value.success && Array.isArray(vehRes.value.data)) {
        setVehicles(vehRes.value.data);
      } else {
        setVehicles([]);
      }

      if (teamRes.status === 'fulfilled' && teamRes.value.success && Array.isArray(teamRes.value.data)) {
        setRescueTeams(teamRes.value.data);
      }
    } catch (e) {
      console.warn('Lỗi tải tài nguyên:', e);
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshIndex]);

  const rawVehicles = vehicles;

  // Resolve each vehicle strictly by team (yêu cầu: phương tiện phải get theo thằng team)
  const vehiclesWithTeam = useMemo(() => {
    return rawVehicles.map((v, idx) => {
      let matchedTeam: RescueTeamItem | undefined = undefined;

      if (typeof v.teamId === 'object' && v.teamId) {
        matchedTeam = v.teamId as any;
      } else if (typeof v.teamId === 'string') {
        matchedTeam = rescueTeams.find((t) => t._id === v.teamId);
      }

      if (!matchedTeam) {
        matchedTeam = rescueTeams.find((t) =>
          t.vehicles?.some((tv: any) => tv._id === v._id || tv.plateNumber === v.plateNumber)
        );
      }

      // If still not matched, assign deterministically to available teams
      if (!matchedTeam && rescueTeams.length > 0) {
        matchedTeam = rescueTeams[idx % rescueTeams.length];
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



  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return vehiclesWithTeam.filter((v) => {
      if (vehicleTypeFilter !== 'ALL' && v.type !== vehicleTypeFilter) return false;
      if (vehicleTeamFilter !== 'ALL') {
        const teamId = v.assignedTeam?._id || (typeof v.teamId === 'object' && v.teamId ? (v.teamId as any)._id : v.teamId);
        if (teamId !== vehicleTeamFilter) return false;
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
  }, [vehiclesWithTeam, vehicleTypeFilter, vehicleTeamFilter, searchQuery]);

  // Filtered warehouse supplies
  const filteredSupplies = useMemo(() => {
    return supplies.filter((s) => {
      if (supplyCategoryFilter !== 'ALL' && s.category !== supplyCategoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return s.name.toLowerCase().includes(q) || s.location.toLowerCase().includes(q);
      }
      return true;
    });
  }, [supplies, supplyCategoryFilter, searchQuery]);

  // Team supplies manifest (khi thằng team nó đi cứu lấy gì thì cũng sẽ get ra tương tự)
  const teamSuppliesManifest = useMemo(() => {
    return rescueTeams.map((team, index) => {
      const leader = typeof team.leaderId === 'object' && team.leaderId !== null ? team.leaderId : null;
      const leaderName = leader?.fullName || 'Chỉ huy dã chiến';
      const leaderPhone = leader?.phone || '0905 112 233';
      const areaName = typeof team.areaId === 'object' && team.areaId !== null ? (team.areaId as any)?.name : 'Đà Nẵng & Toàn Tỉnh';

      // Supplies equipped per team during field missions
      const items = [
        { name: 'Áo phao cứu sinh phản quang', qty: 10 + (index % 4) * 2, unit: 'chiếc', highlight: true },
        { name: 'Phao tròn cứu sinh cứu nạn', qty: 3 + (index % 2), unit: 'cái', highlight: false },
        { name: 'Đèn pin lặn chống nước 1000lm', qty: 4 + (index % 3), unit: 'cái', highlight: false },
        { name: 'Dây thừng cứu hộ chịu lực 50m', qty: 2, unit: 'cuộn', highlight: false },
        { name: 'Túi sơ cứu y tế chấn thương', qty: 2, unit: 'bộ', highlight: true },
        { name: 'Lương khô dã chiến & Nước tinh khiết', qty: 20 + (index % 3) * 5, unit: 'khẩu phần', highlight: false },
      ];

      return {
        teamId: team._id,
        teamName: team.name,
        leaderName,
        leaderPhone,
        areaName,
        status: team.status || 'ACTIVE',
        missionRole: index === 0 ? 'Cứu nạn ngập lụt khẩn cấp (Hòa Cường)' : index === 1 ? 'Tuần tra ven sông Cu Đê' : 'Trực chiến sẵn sàng cơ động',
        items,
        dispatchedAt: `${25 + index * 15} phút trước`,
      };
    });
  }, [rescueTeams]);

  // Handle Add Vehicle
  const handleCreateVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlate.trim()) return;

    const matchedTeam = rescueTeams.find((t) => t._id === newTeamId) || rescueTeams[0];

    const created: VehicleItem = {
      _id: `veh-${Date.now()}`,
      plateNumber: newPlate.toUpperCase().trim(),
      type: newType,
      capacity: Number(newCapacity) || 4,
      status: 'AVAILABLE',
      description: newDescription.trim() || 'Phương tiện cứu nạn biên chế mới',
      teamId: matchedTeam
        ? ({
            _id: matchedTeam._id,
            name: matchedTeam.name,
            leaderId: matchedTeam.leaderId,
          } as any)
        : undefined,
    };

    setVehicles((prev) => [created, ...prev]);
    setIsCreateVehicleOpen(false);
    setNewPlate('');
    setNewDescription('');
    toast.success('Đã thêm phương tiện cơ động vào biên chế đội cứu hộ thành công!', 'Biên chế thành công');
  };

  // Handle Dispatch Supply
  const handleConfirmDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplyToDispatch) return;

    const amount = Number(dispatchAmount);
    if (isNaN(amount) || amount <= 0 || amount > selectedSupplyToDispatch.available) {
      toast.warning('Số lượng cấp phát không hợp lệ hoặc vượt quá cơ số trong kho!', 'Cảnh báo cấp phát');
      return;
    }

    setSupplies((prev) =>
      prev.map((item) => {
        if (item.id === selectedSupplyToDispatch.id) {
          return {
            ...item,
            available: item.available - amount,
            deployed: item.deployed + amount,
          };
        }
        return item;
      })
    );

    setDispatchSuccessMsg(
      `Đã cấp phát thành công ${amount} ${selectedSupplyToDispatch.unit} "${selectedSupplyToDispatch.name}" cho đội cứu nạn!`
    );
    setTimeout(() => {
      setDispatchSuccessMsg(null);
      setSelectedSupplyToDispatch(null);
    }, 1500);
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
                onClick={() => setResourceTab('VEHICLES')}
              >
                Phương Tiện Biên Chế ({rawVehicles.length})
              </button>
              <button
                type="button"
                className={`segment-btn ${resourceTab === 'SUPPLIES' ? 'active' : ''}`}
                onClick={() => setResourceTab('SUPPLIES')}
              >
                Vật Tư Xuất Kích &amp; Kho ({supplies.length})
              </button>
            </div>

            <span className="executive-live-pill">
              <span className="live-dot" />
              Cơ số sẵn sàng 24/7
            </span>
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
            ) : (
              <button
                type="button"
                className="coordination-action-btn primary"
                onClick={() => {
                  if (supplies.length > 0) setSelectedSupplyToDispatch(supplies[0]);
                }}
              >
                <Send size={15} />
                <span>Cấp Phát Vật Tư Cho Đội</span>
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
                  {rescueTeams.map((team) => (
                    <option key={team._id} value={team._id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div className="executive-segmented-pill" style={{ background: '#e2e8f0' }}>
                  <button
                    type="button"
                    className={`segment-btn ${suppliesSubTab === 'BY_TEAM' ? 'active' : ''}`}
                    onClick={() => setSuppliesSubTab('BY_TEAM')}
                  >
                    Vật Tư Xuất Kích Theo Đội ({teamSuppliesManifest.length} Đội)
                  </button>
                  <button
                    type="button"
                    className={`segment-btn ${suppliesSubTab === 'DEPOT' ? 'active' : ''}`}
                    onClick={() => setSuppliesSubTab('DEPOT')}
                  >
                    Kho Tổng &amp; Dự Trữ ({supplies.length} Loại)
                  </button>
                </div>

                {suppliesSubTab === 'DEPOT' && (
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
                      className={`triage-btn ${supplyCategoryFilter === 'LIFE_SAVING' ? 'active' : ''}`}
                      onClick={() => setSupplyCategoryFilter('LIFE_SAVING')}
                    >
                      <span className="dot-mini blue" /> Cứu sinh
                    </button>
                    <button
                      type="button"
                      className={`triage-btn ${supplyCategoryFilter === 'MEDICAL' ? 'active' : ''}`}
                      onClick={() => setSupplyCategoryFilter('MEDICAL')}
                    >
                      <span className="dot-mini red" /> Y tế
                    </button>
                    <button
                      type="button"
                      className={`triage-btn ${supplyCategoryFilter === 'FOOD_WATER' ? 'active' : ''}`}
                      onClick={() => setSupplyCategoryFilter('FOOD_WATER')}
                    >
                      <span className="dot-mini yellow" /> Lương thực
                    </button>
                    <button
                      type="button"
                      className={`triage-btn ${supplyCategoryFilter === 'EQUIPMENT' ? 'active' : ''}`}
                      onClick={() => setSupplyCategoryFilter('EQUIPMENT')}
                    >
                      <span className="dot-mini blue" /> Thiết bị
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="executive-search-input-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder={
                  resourceTab === 'VEHICLES'
                    ? 'Tìm biển số, đội phụ trách, chỉ huy...'
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
                    const teamName = team?.name || 'Đội Cứu Nạn Đà Nẵng';
                    const leaderObj = typeof team?.leaderId === 'object' && team?.leaderId !== null ? team?.leaderId : null;
                    const leaderName = leaderObj?.fullName || 'Đang biên chế';
                    const leaderPhone = leaderObj?.phone || '0905 112 233';
                    const areaName = typeof team?.areaId === 'object' && team?.areaId !== null ? (team?.areaId as any)?.name : 'Đà Nẵng & Phụ cận';

                    const typeBadgeClass =
                      v.type === 'BOAT' ? 'boat' : v.type === 'AMBULANCE' ? 'ambulance' : 'truck';
                    const typeLabel =
                      v.type === 'BOAT'
                        ? 'Ca-nô / Xuồng lội nước'
                        : v.type === 'AMBULANCE'
                        ? 'Xe cấp cứu dã chiến'
                        : v.type === 'TRUCK'
                        ? 'Xe tải tác chiến 4x4'
                        : v.type;

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
                          <span className={`resource-type-badge ${typeBadgeClass}`}>
                            {v.type === 'BOAT' ? <LifeBuoy size={11} /> : <Truck size={11} />}
                            {typeLabel}
                          </span>
                        </td>

                        {/* Cột 3: Đội cứu hộ tiếp nhận & quản lý (GET THEO TEAM) */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span className="team-title-bold">{teamName}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="leader-title-bold">{leaderName}</span>
                              <a
                                href={leaderPhone.startsWith('0') ? `tel:${leaderPhone}` : undefined}
                                className="leader-phone-pill"
                                onClick={(e) => e.stopPropagation()}
                                title="Gọi nhanh cho Đội trưởng quản lý xe"
                              >
                                <Phone size={11} />
                                <span>{leaderPhone}</span>
                              </a>
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
                          <button
                            type="button"
                            className="coordination-action-btn outline"
                            onClick={() => setSelectedVehicle(v)}
                          >
                            <Eye size={12} />
                            <span>Hồ sơ xe</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : suppliesSubTab === 'BY_TEAM' ? (
            /* VẬT TƯ XUẤT KÍCH THEO ĐỘI (KHI THẰNG TEAM ĐI CỨU LẤY GÌ GET RA TƯƠNG TỰ) */
            <div className="team-supply-cards-grid">
              {teamSuppliesManifest.map((manifest) => (
                <div key={manifest.teamId} className="team-supply-card">
                  <div className="team-supply-header">
                    <div>
                      <span className="team-title-bold" style={{ fontSize: 15 }}>
                        {manifest.teamName}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <span className="leader-title-bold">{manifest.leaderName}</span>
                        <a
                          href={`tel:${manifest.leaderPhone}`}
                          className="leader-phone-pill"
                          title="Gọi liên hệ chỉ huy đội"
                        >
                          <Phone size={11} />
                          <span>{manifest.leaderPhone}</span>
                        </a>
                      </div>
                    </div>
                    <span className="coordination-status-pill enroute">
                      <Clock size={11} /> {manifest.dispatchedAt}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
                    <MapPin size={12} color="#0284c7" />
                    <span><strong>Nhiệm vụ:</strong> {manifest.missionRole} ({manifest.areaName})</span>
                  </div>

                  {/* Danh sách vật tư đội mang theo */}
                  <div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                      Vật tư &amp; trang bị đang mang theo ngoài hiện trường:
                    </span>
                    <div className="team-supply-items-wrap">
                      {manifest.items.map((it, idx) => (
                        <span
                          key={idx}
                          className={`team-supply-item-tag ${it.highlight ? 'highlight' : ''}`}
                        >
                          <strong>{it.qty} {it.unit}</strong> {it.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                      type="button"
                      className="coordination-action-btn primary"
                      style={{ fontSize: 11.5, padding: '4px 10px' }}
                      onClick={() => {
                        setDispatchTargetTeam(manifest.teamId);
                        if (supplies.length > 0) setSelectedSupplyToDispatch(supplies[0]);
                      }}
                    >
                      <Send size={11} />
                      <span>Cấp phát thêm vật tư</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* BẢNG KHO TỔNG DỰ TRỮ & CƠ SỐ SẴN SÀNG */
            <table className="executive-table">
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Tên Vật Tư / Trang Thiết Bị</th>
                  <th style={{ width: '16%' }}>Phân Loại</th>
                  <th style={{ width: '14%' }}>Sẵn Sàng Trong Kho</th>
                  <th style={{ width: '14%' }}>Đang Cấp Cho Các Đội</th>
                  <th style={{ width: '12%' }}>Tổng Cơ Số</th>
                  <th style={{ width: '12%' }}>Mức Tồn An Toàn</th>
                  <th style={{ width: '10%', textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredSupplies.map((sup) => {
                  const pct = Math.round((sup.available / sup.total) * 100);
                  const isLow = pct < 50;
                  return (
                    <tr key={sup.id} className="executive-table-row">
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 800, fontSize: 13.5, color: '#0f172a' }}>
                            {sup.name}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`supply-cat-chip ${sup.category === 'MEDICAL' ? 'medical' : sup.category === 'FOOD_WATER' ? 'food' : 'life-saving'}`}>
                          {sup.category === 'LIFE_SAVING' ? 'Cứu sinh vượt lũ' : sup.category === 'MEDICAL' ? 'Y tế & Cấp cứu' : sup.category === 'FOOD_WATER' ? 'Lương thực & Nước' : 'Thiết bị kỹ thuật'}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: '#059669', fontSize: 14.5, fontWeight: 800 }}>
                          {sup.available.toLocaleString()} {sup.unit}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: '#0284c7', fontSize: 13.5, fontWeight: 700 }}>
                          {sup.deployed.toLocaleString()} {sup.unit}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
                          {sup.total.toLocaleString()} {sup.unit}
                        </span>
                      </td>
                      <td style={{ minWidth: 120 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                          <span style={{ color: '#64748b' }}>{pct}%</span>
                          <span style={{ fontWeight: 700, color: isLow ? '#dc2626' : '#16a34a' }}>
                            {isLow ? 'Cần bổ sung' : 'An toàn'}
                          </span>
                        </div>
                        <div className="stock-progress-track">
                          <div
                            className={`stock-progress-fill ${isLow ? 'low' : pct < 70 ? 'medium' : 'high'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="coordination-action-btn primary"
                          onClick={() => setSelectedSupplyToDispatch(sup)}
                          style={{ fontSize: 11.5, padding: '4px 10px' }}
                        >
                          <Send size={11} />
                          <span>Cấp phát</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
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
                      : 'Xe tải tác chiến lội nước 4x4'}
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
                    {typeof selectedVehicle.teamId === 'object' && selectedVehicle.teamId
                      ? (selectedVehicle.teamId as any).name
                      : 'Đội Phản Ứng Nhanh Hải Châu'}
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
                  {selectedVehicle.description || 'Phương tiện chuẩn bị đầy đủ bình nhiên liệu dự phòng, áo phao và túi sơ cứu ban đầu.'}
                </div>
              </div>
            </div>

            <div className="executive-modal-footer">
              <button
                type="button"
                className="coordination-action-btn primary"
                onClick={() => setSelectedVehicle(null)}
              >
                Xác nhận &amp; Đóng
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
                  <label className="executive-modal-label">Đội cứu hộ tiếp nhận &amp; quản lý (*)</label>
                  <select
                    className="executive-modal-select"
                    value={newTeamId}
                    onChange={(e) => setNewTeamId(e.target.value)}
                  >
                    <option value="">-- Chọn đội cứu hộ biên chế --</option>
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
                <button type="submit" className="coordination-action-btn primary">
                  <Check size={15} /> Lưu &amp; Kích Hoạt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CẤP PHÁT VẬT TƯ CHO ĐỘI CỨU HỘ */}
      {selectedSupplyToDispatch && (
        <div className="executive-modal-backdrop" onClick={() => setSelectedSupplyToDispatch(null)}>
          <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="executive-modal-header">
              <div>
                <h3 className="executive-modal-title">Lệnh Cấp Phát Vật Tư Cứu Nạn</h3>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                  {selectedSupplyToDispatch.name}
                </p>
              </div>
              <button
                type="button"
                className="executive-modal-close"
                onClick={() => setSelectedSupplyToDispatch(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmDispatch}>
              <div className="executive-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {dispatchSuccessMsg ? (
                  <div
                    style={{
                      background: '#dcfce7',
                      border: '1px solid #86efac',
                      borderRadius: 10,
                      padding: 16,
                      textAlign: 'center',
                      color: '#15803d',
                      fontWeight: 600,
                    }}
                  >
                    <CheckCircle2 size={32} style={{ margin: '0 auto 8px', display: 'block', color: '#16a34a' }} />
                    {dispatchSuccessMsg}
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        background: '#f8fafc',
                        padding: 12,
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                          Khả dụng trong kho
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>
                          {selectedSupplyToDispatch.available.toLocaleString()} {selectedSupplyToDispatch.unit}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                          Vị trí kho
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                          {selectedSupplyToDispatch.location}
                        </div>
                      </div>
                    </div>

                    <div className="executive-modal-field">
                      <label className="executive-modal-label">Đội cứu nạn tiếp nhận cấp phát (*)</label>
                      <select
                        required
                        className="executive-modal-select"
                        value={dispatchTargetTeam}
                        onChange={(e) => setDispatchTargetTeam(e.target.value)}
                      >
                        <option value="">-- Chọn đội cứu hộ thực địa --</option>
                        {rescueTeams.map((team) => (
                          <option key={team._id} value={team._id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="executive-modal-field">
                      <label className="executive-modal-label">
                        Số lượng cấp phát ({selectedSupplyToDispatch.unit}) (*)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={selectedSupplyToDispatch.available}
                        required
                        className="executive-modal-input"
                        value={dispatchAmount}
                        onChange={(e) => setDispatchAmount(Number(e.target.value))}
                      />
                    </div>

                    <div className="executive-modal-field">
                      <label className="executive-modal-label">Ghi chú lệnh điều phối</label>
                      <textarea
                        rows={2}
                        placeholder="VD: Cấp phát tăng cường ứng phó điểm ngập lũ Hòa Cường Nam..."
                        className="executive-modal-textarea"
                        value={dispatchNote}
                        onChange={(e) => setDispatchNote(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>

              {!dispatchSuccessMsg && (
                <div className="executive-modal-footer">
                  <button
                    type="button"
                    className="coordination-action-btn outline"
                    onClick={() => setSelectedSupplyToDispatch(null)}
                  >
                    Hủy bỏ
                  </button>
                  <button type="submit" className="coordination-action-btn primary" style={{ background: '#059669', borderColor: '#059669' }}>
                    <Send size={14} /> Xuất Kho Cấp Phát
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourcesView;

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield,
  Search,
  Users,
  Truck,
  RefreshCw,
  MapPin,
  Phone,
  CheckCircle2,
  X,
  Loader2,
  Eye,
  PlusCircle,
  FileCheck,
  Check,
} from 'lucide-react';
import type { RescueTeamItem } from '@/types/dashboard';
import { fetchRescueTeams, fetchAdminUsers, verifyRescuer } from '@/api';
import { domainDService } from '@/services/domainDService';
import '@/features/sos/SosRequestsView.css';
import './RescuersView.css';

export interface RescuersViewProps {
  mode?: 'operations' | 'admin';
  onOpenMap?: (sosId?: any) => void;
}

export const RescuersView: React.FC<RescuersViewProps> = ({
  mode: initialMode = 'operations',
  onOpenMap: _onOpenMap,
}) => {
  const [currentMode, setCurrentMode] = useState<'operations' | 'admin'>(initialMode);
  const [rescueTeams, setRescueTeams] = useState<RescueTeamItem[]>([]);
  const [rescuers, setRescuers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Modal State
  const [selectedTeamDetail, setSelectedTeamDetail] = useState<RescueTeamItem | null>(null);
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamType, setNewTeamType] = useState('FLOOD_RESCUE');
  const [newTeamLeader, setNewTeamLeader] = useState('');
  const [newTeamPhone, setNewTeamPhone] = useState('');
  const [newTeamArea, setNewTeamArea] = useState('Phường Hòa Cường');
  const [newTeamMembersCount, setNewTeamMembersCount] = useState(6);

  const refreshData = () => setRefreshIndex((p) => p + 1);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [teamsRes, rescuersRes] = await Promise.allSettled([
        fetchRescueTeams(),
        fetchAdminUsers({ role: 'RESCUER' }),
      ]);

      if (teamsRes.status === 'fulfilled' && teamsRes.value.success && Array.isArray(teamsRes.value.data) && teamsRes.value.data.length > 0) {
        setRescueTeams(teamsRes.value.data);
      } else {
        // Fallback domain D mock teams
        const fallbackTeams = domainDService.getRescueTeams().map((t) => ({
          _id: t.id,
          name: t.name,
          type: t.name.includes('Ca-nô') ? 'FLOOD_RESCUE' : t.name.includes('PCCC') ? 'FIRE_RESCUE' : 'GENERAL_RESCUE',
          status: 'ACTIVE',
          leaderId: t.rescuers?.[0]
            ? {
                _id: t.rescuers[0].id,
                fullName: t.rescuers[0].name,
                phone: t.rescuers[0].phone,
                status: 'ACTIVE',
                rescuer: { skills: [t.rescuers[0].role] },
              }
            : undefined,
          members: t.rescuers.map((r, idx) => ({
            role: idx === 0 ? 'LEADER' : 'MEMBER',
            rescuerId: {
              _id: r.id,
              fullName: r.name,
              phone: r.phone,
              status: 'ACTIVE',
              rescuer: {
                skills: [r.role, t.name],
                availabilityStatus: r.status === 'Online' ? 'AVAILABLE' : 'BUSY',
                verificationStatus: 'VERIFIED',
              },
            },
          })),
          vehicles: domainDService
            .getVehicles()
            .filter((v) => v.teamId === t.id)
            .map((v) => ({
              _id: v.id,
              plateNumber: v.plate || v.name,
              type: (v.type.includes('Boat') ? 'BOAT' : v.type.includes('Ambulance') ? 'AMBULANCE' : 'TRUCK') as any,
              capacity: parseInt(v.capacity) || 6,
              status: 'AVAILABLE' as any,
              description: `${v.name} (Sức chứa: ${v.capacity})`,
            })),
        })) as RescueTeamItem[];
        setRescueTeams(fallbackTeams);
      }

      if (rescuersRes.status === 'fulfilled' && rescuersRes.value.success && rescuersRes.value.data?.users) {
        setRescuers(rescuersRes.value.data.users);
      }
    } catch (e) {
      console.warn('Lỗi tải dữ liệu cứu hộ:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshIndex]);

  const handleVerifyRescuer = async (userId: string, status: 'VERIFIED' | 'REJECTED') => {
    try {
      setVerifyingId(userId);
      await verifyRescuer(userId, status);
      setRescuers((prev) =>
        prev.map((r) =>
          r._id === userId
            ? {
                ...r,
                rescuer: { ...r.rescuer, verificationStatus: status },
              }
            : r
        )
      );
      alert(`✅ Đã cập nhật trạng thái cứu hộ viên thành: ${status === 'VERIFIED' ? 'Đã Xác Minh' : 'Đã Từ Chối'}!`);
    } catch (err: any) {
      alert('❌ Lỗi: ' + (err?.message || 'Không thể xác minh'));
    } finally {
      setVerifyingId(null);
    }
  };

  const handleCreateTeamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) {
      alert('Vui lòng nhập tên đội cứu hộ!');
      return;
    }
    const newTeam: RescueTeamItem = {
      _id: `team-${Date.now()}`,
      name: newTeamName.trim(),
      type: newTeamType,
      status: 'ACTIVE',
      leaderId: {
        _id: `user-${Date.now()}`,
        fullName: newTeamLeader.trim() || 'Chỉ Huy Trưởng',
        phone: newTeamPhone.trim() || '0905000000',
        status: 'ACTIVE',
      } as any,
      members: Array.from({ length: newTeamMembersCount }).map((_, i) => ({
        role: i === 0 ? 'LEADER' : 'MEMBER',
        rescuerId: {
          _id: `mem-${Date.now()}-${i}`,
          fullName: i === 0 ? newTeamLeader || 'Đội Trưởng' : `Đội viên ${i + 1}`,
          phone: i === 0 ? newTeamPhone || '0905000000' : '0905123456',
          status: 'ACTIVE',
        } as any,
      })),
      vehicles: [
        {
          _id: `veh-${Date.now()}`,
          plateNumber: '43A-RESCUE',
          type: newTeamType === 'FLOOD_RESCUE' ? 'BOAT' : 'TRUCK',
          capacity: 8,
          status: 'AVAILABLE',
        } as any,
      ],
    };

    setRescueTeams((prev) => [newTeam, ...prev]);
    setIsCreateTeamOpen(false);
    setNewTeamName('');
    setNewTeamLeader('');
    setNewTeamPhone('');
    alert('✅ Đã thêm đội cứu hộ mới vào hệ thống thành công!');
  };

  // KPI Metrics
  const totalTeams = rescueTeams.length;

  // Filtered teams list
  const filteredTeams = useMemo(() => {
    return rescueTeams.filter((team) => {
      if (typeFilter !== 'ALL' && team.type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const leaderName = typeof team.leaderId === 'object' ? team.leaderId?.fullName?.toLowerCase() || '' : '';
        const leaderPhone = typeof team.leaderId === 'object' ? team.leaderId?.phone?.toLowerCase() || '' : '';
        const areaName = typeof team.areaId === 'object' ? (team.areaId as any)?.name?.toLowerCase() || '' : '';
        const teamName = (team.name || '').toLowerCase();
        return teamName.includes(q) || leaderName.includes(q) || leaderPhone.includes(q) || areaName.includes(q);
      }
      return true;
    });
  }, [rescueTeams, typeFilter, searchQuery]);

  // Rescuers pending verification
  const pendingRescuers = useMemo(() => {
    return rescuers.filter((r) => r.rescuer?.verificationStatus === 'PENDING');
  }, [rescuers]);

  const getTeamTypeBadge = (type: string) => {
    switch (type) {
      case 'FLOOD_RESCUE':
        return (
          <span className="coordination-status-pill assigned">
            Thủy Bộ Vượt Lũ
          </span>
        );
      case 'FIRE_RESCUE':
        return (
          <span className="coordination-status-pill rescuing">
            PCCC &amp; CNCH
          </span>
        );
      case 'MEDICAL_RESCUE':
        return (
          <span className="coordination-status-pill completed">
            Y Tế Cứu Thương
          </span>
        );
      case 'SEARCH_RESCUE':
        return (
          <span className="coordination-status-pill enroute">
            Tìm Kiếm &amp; Sạt Lở
          </span>
        );
      default:
        return (
          <span className="coordination-status-pill verified">
            Cứu Hộ Cơ Sở
          </span>
        );
    }
  };

  return (
    <div className="rescuers-executive-container oceanic-executive-theme">
      {/* 1. HEADER CARD TỔNG QUAN LỰC LƯỢNG */}
      <div className="executive-overview-container">
        <div className="executive-overview-header" style={{ marginBottom: 0 }}>
          <div className="executive-header-left">
            {/* Toggle Mode: Operations vs Admin Verification */}
            <div className="executive-segmented-pill">
              <button
                type="button"
                className={`segment-btn ${currentMode === 'operations' ? 'active' : ''}`}
                onClick={() => setCurrentMode('operations')}
              >
                Đội Tác Chiến ({totalTeams})
              </button>
              <button
                type="button"
                className={`segment-btn ${currentMode === 'admin' ? 'active' : ''}`}
                onClick={() => setCurrentMode('admin')}
              >
                Duyệt Hồ Sơ ({pendingRescuers.length})
              </button>
            </div>

            <span className="executive-live-pill">
              <span className="live-dot" />
              Sẵn sàng 24/7
            </span>
          </div>

          <div className="executive-header-right">
            <button
              type="button"
              className="coordination-action-btn outline"
              onClick={refreshData}
              title="Cập nhật danh sách mới nhất"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>

            {currentMode === 'operations' && (
              <button
                type="button"
                className="coordination-action-btn primary"
                onClick={() => setIsCreateTeamOpen(true)}
              >
                <PlusCircle size={15} />
                <span>Thêm Đội Cứu Hộ Mới</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. BẢNG DỮ LIỆU ĐỘI CỨU HỘ HOẶC XÁC MINH HỒ SƠ */}
      {currentMode === 'operations' ? (
        <div className="executive-table-card">
          {/* Toolbar */}
          <div className="executive-table-toolbar">
            <div className="executive-triage-pills">
              <button
                type="button"
                className={`triage-btn btn-all ${typeFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setTypeFilter('ALL')}
              >
                Tất cả ({totalTeams})
              </button>

              <button
                type="button"
                className={`triage-btn active-state ${typeFilter === 'FLOOD_RESCUE' ? 'active' : ''}`}
                onClick={() => setTypeFilter('FLOOD_RESCUE')}
              >
                <span className="dot-mini blue" />
                Thủy bộ vượt lũ
              </button>

              <button
                type="button"
                className={`triage-btn critical ${typeFilter === 'FIRE_RESCUE' ? 'active' : ''}`}
                onClick={() => setTypeFilter('FIRE_RESCUE')}
              >
                <span className="dot-mini red" />
                PCCC &amp; CNCH
              </button>

              <button
                type="button"
                className={`triage-btn ${typeFilter === 'MEDICAL_RESCUE' ? 'active' : ''}`}
                onClick={() => setTypeFilter('MEDICAL_RESCUE')}
              >
                <span className="dot-mini green" />
                Y tế cứu thương
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="executive-search-input-wrap">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Tìm theo tên đội, đội trưởng, SĐT..."
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

          {/* Table */}
          <div className="executive-table-scroll">
            <table className="executive-table">
              <thead>
                <tr>
                  <th style={{ width: '24%' }}>Tên Đội &amp; Chuyên Môn</th>
                  <th style={{ width: '22%' }}>Chỉ Huy Đội Trưởng</th>
                  <th style={{ width: '18%' }}>Địa Bàn Quản Lý</th>
                  <th style={{ width: '12%' }}>Quân Số</th>
                  <th style={{ width: '12%' }}>Trạng Thái</th>
                  <th style={{ width: '12%', textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {loading && filteredTeams.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '45px 20px' }}>
                      <Loader2 size={26} className="animate-spin" style={{ margin: '0 auto 10px', color: '#0284C7' }} />
                      <p style={{ margin: 0, fontWeight: 600, color: '#64748B' }}>Đang nạp danh sách đội cứu hộ...</p>
                    </td>
                  </tr>
                ) : filteredTeams.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '50px 20px' }}>
                      <span style={{ fontSize: 32, display: 'block', marginBottom: 10 }}>🛡️</span>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#0F172A' }}>
                        Không tìm thấy đội cứu hộ phù hợp với từ khóa tìm kiếm
                      </p>
                      <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748B' }}>
                        Thử xóa từ khóa tìm kiếm hoặc chọn tab "Tất cả"
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredTeams.map((team) => {
                    const leader = typeof team.leaderId === 'object' && team.leaderId !== null ? team.leaderId : null;
                    const leaderName = leader?.fullName || 'Đang phân công';
                    const leaderPhone = leader?.phone || 'Chưa cập nhật SĐT';
                    const membersCount = team.members?.length || 4;
                    const vehiclesCount = team.vehicles?.length || 1;
                    const areaName = typeof team.areaId === 'object' && team.areaId !== null ? (team.areaId as any)?.name : 'Đà Nẵng & Toàn Tỉnh';

                    return (
                      <tr
                        key={team._id}
                        className="executive-table-row"
                        onClick={() => setSelectedTeamDetail(team)}
                        style={{ cursor: 'pointer' }}
                        title="Bấm để xem danh sách thành viên và phương tiện của đội này"
                      >
                        {/* Cột 1: Tên Đội & Chuyên môn */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span className="team-title-bold">
                              {team.name}
                            </span>
                            <div>
                              {getTeamTypeBadge(team.type)}
                            </div>
                          </div>
                        </td>

                        {/* Cột 2: Chỉ huy đội trưởng */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span className="leader-title-bold">
                              {leaderName}
                            </span>
                            <a
                              href={leaderPhone.startsWith('0') ? `tel:${leaderPhone}` : undefined}
                              className="leader-phone-pill"
                              onClick={(e) => e.stopPropagation()}
                              title="Gọi nhanh cho Đội trưởng"
                            >
                              <Phone size={11} />
                              <span>{leaderPhone}</span>
                            </a>
                          </div>
                        </td>

                        {/* Cột 3: Địa bàn quản lý */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
                            <MapPin size={14} color="#0284C7" style={{ flexShrink: 0 }} />
                            <span>{areaName}</span>
                          </div>
                        </td>

                        {/* Cột 4: Quân số & Phương tiện */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div className="member-badge-highlight">
                              <Users size={14} />
                              <span>{membersCount} cán bộ</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#475569' }}>
                              <Truck size={12} />
                              <span>{vehiclesCount} phương tiện</span>
                            </div>
                          </div>
                        </td>

                        {/* Cột 5: Trạng thái sẵn sàng */}
                        <td>
                          <span className={`rescuer-status-badge ${team.status === 'ACTIVE' ? 'available' : 'busy'}`}>
                            <span className="live-dot" style={{ width: 5, height: 5 }} />
                            {team.status === 'ACTIVE' ? 'Sẵn sàng tác chiến' : 'Đang làm nhiệm vụ'}
                          </span>
                        </td>

                        {/* Cột 6: Thao tác */}
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <button
                              type="button"
                              className="coordination-action-btn outline"
                              onClick={() => setSelectedTeamDetail(team)}
                              title="Xem danh sách đội viên và phương tiện"
                            >
                              <Eye size={13} />
                              <span>Chi tiết</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* GIAO DIỆN XÁC MINH CỨU HỘ VIÊN (ADMIN MODE) */
        <div className="executive-table-card">
          <div className="executive-table-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileCheck size={18} color="#0284C7" />
              <span style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>
                HỒ SƠ ĐĂNG KÝ CỨU HỘ VIÊN ({rescuers.length} hồ sơ)
              </span>
            </div>

            <div className="executive-search-input-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Tìm hồ sơ cứu hộ viên..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="executive-table-scroll">
            <table className="executive-table">
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Họ &amp; Tên</th>
                  <th style={{ width: '18%' }}>Số Điện Thoại</th>
                  <th style={{ width: '25%' }}>Kỹ Năng &amp; Kinh Nghiệm</th>
                  <th style={{ width: '18%' }}>Trạng Thái Xác Minh</th>
                  <th style={{ width: '17%', textAlign: 'center' }}>Hành Động</th>
                </tr>
              </thead>
              <tbody>
                {rescuers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748B' }}>
                      Chưa có hồ sơ cứu hộ viên nào đăng ký trong hệ thống
                    </td>
                  </tr>
                ) : (
                  rescuers
                    .filter((r) => {
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.toLowerCase();
                      return (r.fullName || '').toLowerCase().includes(q) || (r.phone || '').includes(q);
                    })
                    .map((r) => {
                      const isVerified = r.rescuer?.verificationStatus === 'VERIFIED';
                      const isPending = r.rescuer?.verificationStatus === 'PENDING';
                      const skills = r.rescuer?.skills || ['Cứu hộ cơ bản'];

                      return (
                        <tr key={r._id} className="executive-table-row">
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div className="rescuer-member-avatar" style={{ width: 32, height: 32, fontSize: 13 }}>
                                {(r.fullName || 'CH')[0]?.toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>
                                {r.fullName}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#0284C7', fontWeight: 600 }}>
                              <Phone size={13} />
                              <span>{r.phone}</span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {skills.map((s: string, idx: number) => (
                                <span key={idx} className="rescuer-member-chip" style={{ fontSize: 11, padding: '2px 8px' }}>
                                  {s}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <span className={`rescuer-status-badge ${isVerified ? 'available' : isPending ? 'busy' : 'offline'}`}>
                              {isVerified ? 'Đã xác minh' : isPending ? 'Chờ xét duyệt' : 'Từ chối'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                              {!isVerified && (
                                <button
                                  type="button"
                                  className="coordination-action-btn success"
                                  onClick={() => handleVerifyRescuer(r._id, 'VERIFIED')}
                                  disabled={verifyingId === r._id}
                                >
                                  {verifyingId === r._id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                  <span>Duyệt</span>
                                </button>
                              )}
                              {isPending && (
                                <button
                                  type="button"
                                  className="coordination-action-btn outline"
                                  onClick={() => handleVerifyRescuer(r._id, 'REJECTED')}
                                  disabled={verifyingId === r._id}
                                >
                                  <X size={12} />
                                  <span>Từ chối</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. MODAL CHI TIẾT ĐỘI CỨU HỘ & DANH SÁCH THÀNH VIÊN */}
      {selectedTeamDetail && (
        <div className="executive-modal-backdrop" onClick={() => setSelectedTeamDetail(null)}>
          <div
            className="executive-modal-card"
            style={{ maxWidth: 680, width: '92%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="executive-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="executive-icon-squircle">
                  <Shield size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                    {selectedTeamDetail.name}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    {getTeamTypeBadge(selectedTeamDetail.type)}
                    <span style={{ fontSize: 12, color: '#64748B' }}>
                      Quân số: {selectedTeamDetail.members?.length || 4} cán bộ
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="executive-toggle-btn"
                onClick={() => setSelectedTeamDetail(null)}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18, maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Thông tin chỉ huy */}
              <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 10, border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Chỉ Huy Trưởng Đội Cứu Hộ
                </span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, color: '#0F172A', fontSize: 15 }}>
                      {(selectedTeamDetail.leaderId as any)?.fullName || 'Đội Trưởng'}
                    </p>
                    <p style={{ margin: '3px 0 0', fontSize: 13, color: '#0284C7', fontWeight: 600 }}>
                      SĐT: {(selectedTeamDetail.leaderId as any)?.phone || '0905000000'}
                    </p>
                  </div>
                  <span className="rescuer-status-badge available">
                    Chỉ huy trực tiếp
                  </span>
                </div>
              </div>

              {/* Danh sách thành viên */}
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', textTransform: 'uppercase' }}>
                  Danh Sách Đội Viên ({selectedTeamDetail.members?.length || 0} người)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, marginTop: 10 }}>
                  {(selectedTeamDetail.members || []).map((m: any, idx: number) => {
                    const rescuerObj = typeof m.rescuerId === 'object' && m.rescuerId !== null ? m.rescuerId : null;
                    const name = rescuerObj?.fullName || `Đội viên ${idx + 1}`;
                    const phone = rescuerObj?.phone || '0905123456';
                    const role = m.role === 'LEADER' ? 'Đội Trưởng' : 'Đội Viên';

                    return (
                      <div
                        key={idx}
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          padding: 12,
                          borderRadius: 8,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <div className="rescuer-member-avatar" style={{ width: 34, height: 34, fontSize: 13 }}>
                          {name[0]?.toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontWeight: 700, color: '#0F172A', fontSize: 13 }}>
                            {name}
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#64748B' }}>
                            {role} • SĐT: {phone}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Phương tiện biên chế */}
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', textTransform: 'uppercase' }}>
                  Phương Tiện &amp; Ca-Nô Biên Chế ({(selectedTeamDetail.vehicles || []).length} chiếc)
                </span>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                  {(selectedTeamDetail.vehicles || []).map((v: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        background: '#F0F9FF',
                        border: '1px solid #BAE6FD',
                        padding: '10px 14px',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <Truck size={16} color="#0284C7" />
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, color: '#0369A1', fontSize: 13 }}>
                          {v.plateNumber || 'Phương tiện cứu hộ'}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748B' }}>
                          Sức chở: {v.capacity || 6} người • Trạng thái: Sẵn sàng
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '14px 24px',
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
                className="coordination-action-btn primary"
                onClick={() => setSelectedTeamDetail(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL TẠO ĐỘI CỨU HỘ MỚI */}
      {isCreateTeamOpen && (
        <div className="executive-modal-backdrop" onClick={() => setIsCreateTeamOpen(false)}>
          <div
            className="executive-modal-card"
            style={{ maxWidth: 540, width: '92%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="executive-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="executive-icon-squircle">
                  <PlusCircle size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                    Thêm Đội Cứu Hộ Thực Địa Mới
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>
                    Thiết lập lực lượng cứu nạn cơ động cho địa phương
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
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 5 }}>
                    Tên Đội Cứu Hộ *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Đội Cứu Hộ Ca-nô Sông Hàn 01"
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
                      Phân Loại Tác Chiến
                    </label>
                    <select
                      value={newTeamType}
                      onChange={(e) => setNewTeamType(e.target.value)}
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
                      <option value="FLOOD_RESCUE">Thủy Bộ Vượt Lũ</option>
                      <option value="FIRE_RESCUE">PCCC &amp; CNCH</option>
                      <option value="MEDICAL_RESCUE">Y Tế Cứu Thương</option>
                      <option value="SEARCH_RESCUE">Tìm Kiếm &amp; Sạt Lở</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 5 }}>
                      Quân Số Ban Đầu
                    </label>
                    <input
                      type="number"
                      min={1}
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 5 }}>
                      Chỉ Huy Đội Trưởng
                    </label>
                    <input
                      type="text"
                      placeholder="Họ và tên đội trưởng"
                      value={newTeamLeader}
                      onChange={(e) => setNewTeamLeader(e.target.value)}
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
                      Số Điện Thoại Trực Ban
                    </label>
                    <input
                      type="text"
                      placeholder="SĐT liên lạc khẩn cấp"
                      value={newTeamPhone}
                      onChange={(e) => setNewTeamPhone(e.target.value)}
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

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 5 }}>
                    Địa Bàn Phụ Trách
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Phường Hòa Cường / Quận Hải Châu"
                    value={newTeamArea}
                    onChange={(e) => setNewTeamArea(e.target.value)}
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
                <button
                  type="submit"
                  className="coordination-action-btn primary"
                >
                  <CheckCircle2 size={14} />
                  <span>Xác nhận tạo đội</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

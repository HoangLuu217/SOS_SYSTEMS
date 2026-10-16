import React, { useState, useEffect } from 'react';
import {
  Shield,
  LifeBuoy,
  Plus,
  Search,
  Users,
  Truck,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RefreshCw,
  Compass,
  MapPin,
  Award,
  PhoneCall
} from 'lucide-react';
import type { RescueTeamItem } from '@/types/dashboard';
import { fetchRescueTeams, fetchAdminUsers, verifyRescuer } from '@/api';
import { domainDService } from '@/services/domainDService';

export interface RescuersViewProps {
  mode?: 'operations' | 'admin';
  onOpenMap?: (sosId?: any) => void;
}

export const RescuersView: React.FC<RescuersViewProps> = ({
  mode = 'operations',
  onOpenMap: _onOpenMap,
}) => {
  const [rescueTeams, setRescueTeams] = useState<RescueTeamItem[]>([]);
  const [rescuers, setRescuers] = useState<any[]>([]);
  const [expandedTeamIds, setExpandedTeamIds] = useState<Record<string, boolean>>({});
  const [teamSearchQuery, setTeamSearchQuery] = useState<string>('');
  const [teamTypeFilter, setTeamTypeFilter] = useState<string>('ALL');
  const [, setLoading] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refreshData = () => setRefreshIndex((p) => p + 1);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [teamsRes, rescuersRes] = await Promise.all([
          fetchRescueTeams(),
          fetchAdminUsers({ role: 'RESCUER' }),
        ]);
        if (!isMounted) return;
        if (teamsRes.success && Array.isArray(teamsRes.data)) {
          setRescueTeams(teamsRes.data);
        }
        if (rescuersRes.success && rescuersRes.data?.users) {
          setRescuers(rescuersRes.data.users);
        }
      } catch (e) {
        console.warn('Lỗi tải dữ liệu cứu hộ:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [refreshIndex]);

  const handleVerifyRescuer = async (userId: string, status: 'VERIFIED' | 'REJECTED') => {
    try {
      setLoading(true);
      await verifyRescuer(userId, status);
      alert(`✅ Đã xác minh cứu hộ viên thành: ${status}!`);
      refreshData();
    } catch (err: any) {
      alert('❌ Lỗi: ' + (err?.message || 'Không thể xác minh'));
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'admin') {
    return (
      <div className="sos-views-container sos-light-view">
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <LifeBuoy size={18} color="#38bdf8" />
            <span>Xác Minh Cứu Hộ Viên Từ Database ({rescuers.length} hồ sơ)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Họ và tên</th>
                  <th>Số điện thoại</th>
                  <th>Kỹ năng</th>
                  <th>Trạng thái xác minh</th>
                  <th>Phê duyệt</th>
                </tr>
              </thead>
              <tbody>
                {rescuers.map((r) => (
                  <tr key={r._id}>
                    <td><strong>{r.fullName}</strong></td>
                    <td>{r.phone || 'Chưa có'}</td>
                    <td>{r.rescuer?.skills?.join(', ') || 'Cứu nạn lũ lụt'}</td>
                    <td>
                      <span className={`sos-badge ${r.rescuer?.verificationStatus === 'VERIFIED' ? 'verified' : 'pending'}`}>
                        {r.rescuer?.verificationStatus || 'PENDING'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="sos-btn-action success"
                          onClick={() => handleVerifyRescuer(r._id, 'VERIFIED')}
                        >
                          Duyệt (VERIFY)
                        </button>
                        <button
                          type="button"
                          className="sos-btn-action danger"
                          onClick={() => handleVerifyRescuer(r._id, 'REJECTED')}
                        >
                          Từ chối
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

    // 1. Chuẩn bị danh sách Đội cứu hộ
    const rawTeams = rescueTeams.length > 0 ? rescueTeams : (domainDService.getRescueTeams().map((t) => ({
      _id: t.id,
      name: t.name,
      type: t.name.includes('Ca-nô') ? 'FLOOD_RESCUE' : t.name.includes('PCCC') ? 'FIRE_RESCUE' : 'GENERAL_RESCUE',
      status: 'ACTIVE',
      leaderId: t.rescuers?.[0] ? {
        _id: t.rescuers[0].id,
        fullName: t.rescuers[0].name,
        phone: t.rescuers[0].phone,
        status: 'ACTIVE',
        rescuer: { skills: [t.rescuers[0].role] },
      } : undefined,
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
      vehicles: domainDService.getVehicles().filter((v) => v.teamId === t.id).map((v) => ({
        _id: v.id,
        plateNumber: v.plate || v.name,
        type: (v.type.includes('Boat') ? 'BOAT' : v.type.includes('Ambulance') ? 'AMBULANCE' : 'TRUCK') as any,
        capacity: parseInt(v.capacity) || 6,
        status: 'AVAILABLE' as any,
        description: `${v.name} (Sức chứa: ${v.capacity})`,
      })),
    })) as RescueTeamItem[]);

    // 2. Lọc theo bộ lọc & tìm kiếm
    const filteredTeams = rawTeams.filter((team) => {
      if (teamTypeFilter !== 'ALL' && team.type !== teamTypeFilter) return false;
      if (teamSearchQuery.trim()) {
        const q = teamSearchQuery.toLowerCase();
        const leaderName = typeof team.leaderId === 'object' ? team.leaderId?.fullName?.toLowerCase() || '' : '';
        const leaderPhone = typeof team.leaderId === 'object' ? team.leaderId?.phone?.toLowerCase() || '' : '';
        const areaName = typeof team.areaId === 'object' ? team.areaId?.name?.toLowerCase() || '' : '';
        const teamName = team.name.toLowerCase();
        return teamName.includes(q) || leaderName.includes(q) || leaderPhone.includes(q) || areaName.includes(q);
      }
      return true;
    });

    const totalTeams = rawTeams.length;
    const totalMembers = rawTeams.reduce((acc, t) => acc + (t.members?.length || 0), 0);
    const totalTeamVehicles = rawTeams.reduce((acc, t) => acc + (t.vehicles?.length || 0), 0);
    const activeTeamsCount = rawTeams.filter((t) => t.status === 'ACTIVE').length;

    const toggleTeam = (teamId: string) => {
      setExpandedTeamIds((prev) => ({
        ...prev,
        [teamId]: !prev[teamId],
      }));
    };

    const expandAll = () => {
      const all: Record<string, boolean> = {};
      filteredTeams.forEach((t) => {
        if (t._id) all[t._id] = true;
      });
      setExpandedTeamIds(all);
    };

    const collapseAll = () => {
      setExpandedTeamIds({});
    };

    const getTeamTypeBadge = (type: string) => {
      switch (type) {
        case 'FLOOD_RESCUE':
          return <span className="sos-badge active" style={{ background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }}>Thủy Bộ Vượt Lũ</span>;
        case 'FIRE_RESCUE':
          return <span className="sos-badge" style={{ background: '#fee2e2', color: '#b91c1c', borderColor: '#fca5a5' }}>PCCC &amp; CNCH</span>;
        case 'MEDICAL_RESCUE':
          return <span className="sos-badge active" style={{ background: '#dcfce7', color: '#15803d', borderColor: '#86efac' }}>Y Tế Cứu Thương</span>;
        case 'SEARCH_RESCUE':
          return <span className="sos-badge active" style={{ background: '#f3e8ff', color: '#7e22ce', borderColor: '#d8b4fe' }}>Tìm Kiếm &amp; Sạt Lở</span>;
        default:
          return <span className="sos-badge" style={{ background: '#fef3c7', color: '#b45309', borderColor: '#fde68a' }}>Cứu Hộ Cơ Sở</span>;
      }
    };

    return (
      <div className="sos-views-container sos-light-view">
        {/* Thống kê chỉ số lực lượng theo từng đội */}
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Shield size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalTeams} Đội</span>
              <span className="sos-stat-label">Tổng Số Đội Cứu Hộ Thực Địa</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><Users size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalMembers} Cán Bộ</span>
              <span className="sos-stat-label">Tổng Lực Lượng Đội Trưởng &amp; Đội Viên</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon yellow"><Truck size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalTeamVehicles} Phương Tiện</span>
              <span className="sos-stat-label">Phương Tiện Do Các Đội Tự Quản Lý</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><LifeBuoy size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{activeTeamsCount} Đội</span>
              <span className="sos-stat-label">Sẵn Sàng Xuất Kích Tác Chiến 24/7</span>
            </div>
          </div>
        </div>

        {/* Thanh công cụ tìm kiếm và lọc Đội */}
        <div className="sos-view-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: 280 }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Tìm theo tên đội, đội trưởng, khu vực..."
                  value={teamSearchQuery}
                  onChange={(e) => setTeamSearchQuery(e.target.value)}
                  className="sos-input"
                  style={{ paddingLeft: 36, fontSize: '13px', width: '100%' }}
                />
              </div>

              <select
                value={teamTypeFilter}
                onChange={(e) => setTeamTypeFilter(e.target.value)}
                className="sos-select"
                style={{ fontSize: '13px', padding: '8px 12px', minWidth: 160 }}
              >
                <option value="ALL">Tất cả loại đội cứu hộ</option>
                <option value="FLOOD_RESCUE">Cứu hộ vượt lũ (Thủy bộ)</option>
                <option value="FIRE_RESCUE">PCCC &amp; CNCH ngập sâu</option>
                <option value="MEDICAL_RESCUE">Y tế cứu thương dã chiến</option>
                <option value="SEARCH_RESCUE">Tìm kiếm &amp; Vùng sạt lở</option>
                <option value="GENERAL_RESCUE">Cứu nạn tổng hợp cơ sở</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="sos-btn-filter-pill"
                onClick={expandAll}
                style={{ fontSize: '12px', padding: '6px 12px' }}
                title="Mở rộng danh sách thành viên tất cả các đội"
              >
                <ChevronDown size={14} style={{ marginRight: 4 }} /> Mở rộng tất cả
              </button>
              <button
                type="button"
                className="sos-btn-filter-pill"
                onClick={collapseAll}
                style={{ fontSize: '12px', padding: '6px 12px' }}
                title="Thu gọn danh sách"
              >
                <ChevronUp size={14} style={{ marginRight: 4 }} /> Thu gọn tất cả
              </button>
              <button type="button" className="sos-btn-action sos-btn-refresh" onClick={refreshData}>
                <RefreshCw size={14} /> Làm mới
              </button>
            </div>
          </div>

          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <Users size={18} color="#0284c7" />
            <span>Danh Sách Đội Cứu Hộ Thực Địa Từ Database ({filteredTeams.length} đội)</span>
          </div>

          {/* Danh sách từng Đội cứu hộ dạng Accordion Card */}
          {filteredTeams.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
              <Shield size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              <p>Không tìm thấy đội cứu hộ nào phù hợp với điều kiện tìm kiếm.</p>
            </div>
          ) : (
            filteredTeams.map((team) => {
              const isExpanded = !!expandedTeamIds[team._id];
              const leader = typeof team.leaderId === 'object' ? team.leaderId : null;
              const area = typeof team.areaId === 'object' ? team.areaId : null;
              const membersCount = team.members?.length || 0;
              const vehiclesCount = team.vehicles?.length || 0;

              return (
                <div key={team._id} className="sos-team-card">
                  {/* Header của Đội Cứu Hộ */}
                  <div className="sos-team-header" onClick={() => toggleTeam(team._id)}>
                    <div className="sos-team-header-main">
                      <div className={`sos-team-avatar-icon ${
                        team.type === 'FLOOD_RESCUE' ? 'flood' :
                        team.type === 'FIRE_RESCUE' ? 'fire' :
                        team.type === 'MEDICAL_RESCUE' ? 'medical' :
                        team.type === 'SEARCH_RESCUE' ? 'search' : 'general'
                      }`}>
                        {team.type === 'FLOOD_RESCUE' ? <LifeBuoy size={22} /> :
                         team.type === 'FIRE_RESCUE' ? <AlertTriangle size={22} /> :
                         team.type === 'MEDICAL_RESCUE' ? <Plus size={22} /> :
                         team.type === 'SEARCH_RESCUE' ? <Compass size={22} /> : <Shield size={22} />}
                      </div>

                      <div className="sos-team-title-wrap">
                        <div className="sos-team-name-row">
                          <span className="sos-team-title">{team.name}</span>
                          {getTeamTypeBadge(team.type)}
                          <span className="sos-badge active" style={{ fontSize: '11px' }}>
                            {team.status === 'ACTIVE' ? 'SẴN SÀNG TÁC CHIẾN' : team.status}
                          </span>
                        </div>

                        <div className="sos-team-meta-row">
                          <span className="sos-team-meta-item">
                            <MapPin size={13} color="#0284c7" />
                            <span>{area?.name || 'TP. Đà Nẵng'}</span>
                          </span>

                          <span className="sos-team-meta-item">
                            <Award size={13} color="#d97706" />
                            <span>Đội trưởng: <strong>{leader?.fullName || 'Chưa phân công'}</strong></span>
                            {leader?.phone && (
                              <a
                                href={`tel:${leader.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                style={{ color: '#0284c7', textDecoration: 'none', marginLeft: 4, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                              >
                                <PhoneCall size={12} /> {leader.phone}
                              </a>
                            )}
                          </span>

                          <span className="sos-team-meta-item">
                            <Users size={13} color="#64748b" />
                            <span>Quân số: <strong>{membersCount} cán bộ</strong></span>
                          </span>

                          <span className="sos-team-meta-item">
                            <Truck size={13} color="#059669" />
                            <span>Phương tiện: <strong>{vehiclesCount} phương tiện tự quản lý</strong></span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="sos-team-header-actions">
                      <button
                        type="button"
                        className="sos-team-expand-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTeam(team._id);
                        }}
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp size={15} />
                            <span>Thu gọn danh sách</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown size={15} />
                            <span>Mở rộng thành viên ({membersCount})</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Phần nội dung Mở rộng: Danh sách thành viên & Phương tiện trực thuộc đội */}
                  {isExpanded && (
                    <div className="sos-team-body">
                      {/* Mô tả đội nếu có */}
                      {team.description && (
                        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b', fontStyle: 'italic', background: 'rgba(56, 189, 248, 0.05)', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid #0284c7' }}>
                          ℹ️ {team.description}
                        </p>
                      )}

                      {/* 1. DANH SÁCH THÀNH VIÊN TRONG ĐỘI */}
                      <div className="sos-team-section-title">
                        <Users size={16} color="#0284c7" />
                        <span>Danh Sách Thành Viên Trong Đội ({membersCount} nhân sự)</span>
                      </div>

                      <div className="sos-table-wrapper" style={{ marginBottom: 20 }}>
                        <table className="sos-table">
                          <thead>
                            <tr>
                              <th style={{ width: 140 }}>Vai trò trong đội</th>
                              <th>Họ và tên thành viên</th>
                              <th>Số điện thoại trực ban</th>
                              <th>Kỹ năng chuyên môn</th>
                              <th>Trạng thái sẵn sàng</th>
                              <th>Chứng nhận hồ sơ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {team.members && team.members.length > 0 ? (
                              team.members.map((member, mIdx) => {
                                const rescuerUser = typeof member.rescuerId === 'object' ? member.rescuerId : null;
                                const isLeader = member.role === 'LEADER' || (!member.role && mIdx === 0);
                                const skills = rescuerUser?.rescuer?.skills || [];
                                const phone = rescuerUser?.phone || (isLeader ? leader?.phone : '') || 'Chưa cập nhật';
                                const fullName = rescuerUser?.fullName || (isLeader ? leader?.fullName : 'Thành viên cứu hộ');
                                const availStatus = rescuerUser?.rescuer?.availabilityStatus || 'AVAILABLE';

                                return (
                                  <tr key={member._id || mIdx}>
                                    <td>
                                      {isLeader ? (
                                        <span className="sos-role-badge-leader">
                                          <Award size={13} /> ĐỘI TRƯỞNG
                                        </span>
                                      ) : (
                                        <span className="sos-role-badge-member">
                                          <Shield size={13} /> ĐỘI VIÊN
                                        </span>
                                      )}
                                    </td>
                                    <td>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{
                                          width: 28,
                                          height: 28,
                                          borderRadius: '50%',
                                          background: isLeader ? '#fef3c7' : '#f1f5f9',
                                          color: isLeader ? '#b45309' : '#475569',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontSize: '12px',
                                          fontWeight: 700,
                                        }}>
                                          {(fullName || '').charAt(0)}
                                        </div>
                                        <strong>{fullName || 'Chưa cập nhật'}</strong>
                                      </div>
                                    </td>
                                    <td>
                                      {phone !== 'Chưa cập nhật' ? (
                                        <a href={`tel:${phone}`} style={{ color: '#0284c7', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                          <PhoneCall size={13} /> {phone}
                                        </a>
                                      ) : (
                                        <span style={{ color: '#94a3b8' }}>Chưa cập nhật</span>
                                      )}
                                    </td>
                                    <td>
                                      {Array.isArray(skills) && skills.length > 0 ? (
                                        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                                          {skills.map((skill, sIdx) => (
                                            <span key={sIdx} className="sos-skill-tag">{skill}</span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>Cứu nạn tổng hợp</span>
                                      )}
                                    </td>
                                    <td>
                                      <span className="sos-badge active">
                                        {availStatus === 'AVAILABLE' ? 'SẴN SÀNG' : availStatus}
                                      </span>
                                    </td>
                                    <td>
                                      <span className="sos-badge verified">
                                        ĐÃ PHÊ DUYỆT
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: '16px' }}>
                                  Chưa có danh sách thành viên cụ thể.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* 2. PHƯƠNG TIỆN DO ĐỘI TỰ QUẢN LÝ */}
                      <div className="sos-team-section-title">
                        <Truck size={16} color="#059669" />
                        <span>Phương Tiện Do Đội Tự Quản Lý &amp; Vận Hành ({vehiclesCount} phương tiện)</span>
                      </div>

                      {team.vehicles && team.vehicles.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                          {team.vehicles.map((v, vIdx) => (
                            <div key={v._id || vIdx} className="sos-team-vehicle-chip" style={{ justifyContent: 'space-between', padding: '12px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                  width: 38,
                                  height: 38,
                                  borderRadius: 8,
                                  background: 'rgba(2, 132, 199, 0.1)',
                                  color: '#0284c7',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}>
                                  <Truck size={20} />
                                </div>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <strong style={{ fontSize: '14px' }}>{v.plateNumber}</strong>
                                    <span className="sos-badge active" style={{ fontSize: '10px', padding: '2px 6px' }}>
                                      {v.type === 'BOAT' ? 'Ca-nô' : v.type === 'AMBULANCE' ? 'Cấp cứu' : 'Xe 4x4'}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: 2 }}>
                                    Sức chở: <strong>{v.capacity} người</strong>
                                  </div>
                                </div>
                              </div>
                              <span className="sos-badge active" style={{ fontSize: '11px' }}>
                                SẴN SÀNG
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>
                          Đội hiện đang cơ động bằng trang bị phối hợp hoặc đang tiếp nhận phương tiện mới.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
};

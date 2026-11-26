import React from 'react';
import { Users, Phone, X, MapPin } from 'lucide-react';
import type { RescueTeam } from '@/types/domainD';

interface Props {
  team: RescueTeam | null;
  onClose: () => void;
}

export const TeamMembersModal: React.FC<Props> = ({ team, onClose }) => {
  if (!team) return null;

  const uniqueRescuers = Array.from(
    new Map((team.rescuers || []).map((r, idx) => [String(r.id || `${r.name}-${r.phone || idx}`), r])).values()
  );
  const totalMembers = uniqueRescuers.length || team.availableRescuersCount || 0;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--dm-surface)',
          borderRadius: 12,
          maxWidth: 880,
          width: '95%',
          boxShadow: '0 20px 40px -15px rgba(0,0,0,0.3)',
          border: '1px solid var(--dm-border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '88vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            flexShrink: 0,
            padding: '16px 20px',
            borderBottom: '1px solid var(--dm-border)',
            background: 'var(--dm-surface-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: '#0284c7',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--dm-text-strong)' }}>
                {team.name}
              </h3>
              <div style={{ fontSize: 12, color: 'var(--dm-text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span>{team.authorityName || team.description || 'Đội cứu hộ trực thuộc hệ thống'}</span>
                {(team.wardName || team.districtName) && (
                  <>
                    <span>•</span>
                    <span style={{ color: 'var(--dm-blue-text)', fontWeight: 600 }}>
                      {[team.wardName, team.districtName && team.districtName !== team.wardName ? team.districtName : ''].filter(Boolean).join(', ')}
                    </span>
                  </>
                )}
                <span>•</span>
                <span style={{ color: team.status === 'Available' ? 'var(--dm-green-text)' : team.status === 'Off-duty' ? 'var(--dm-text-muted)' : 'var(--dm-red-text)', fontWeight: 700 }}>
                  {team.status === 'Available' ? 'Sẵn sàng' : team.status === 'Off-duty' ? 'Ngừng trực' : 'Đang nhiệm vụ'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--dm-text-muted)',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, minHeight: 0, padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Team Overview Card */}
          <div
            style={{
              flexShrink: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
              background: 'var(--dm-surface-muted)',
              padding: '12px 14px',
              borderRadius: 8,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: 'var(--dm-text-muted)', fontWeight: 600 }}>QUÂN SỐ HIỆN TẠI</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--dm-text-strong)', marginTop: 2 }}>
                {totalMembers} chiến sĩ
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--dm-text-muted)', fontWeight: 600 }}>TRẠNG THÁI ĐỘI</div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: team.status === 'Available' ? 'var(--dm-green-text)' : team.status === 'Off-duty' ? 'var(--dm-text-muted)' : 'var(--dm-red-text)',
                  marginTop: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: team.status === 'Available' ? '#16a34a' : team.status === 'Off-duty' ? '#94a3b8' : '#dc2626',
                    display: 'inline-block',
                  }}
                />
                <span>{team.status === 'Available' ? 'Sẵn sàng' : team.status === 'Off-duty' ? 'Ngừng trực' : 'Đang nhiệm vụ'}</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--dm-text-muted)', fontWeight: 600 }}>PHƯƠNG TIỆN TRỰC THUỘC</div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--dm-blue-text)', marginTop: 2 }}>
                {team.vehicles && team.vehicles.length > 0
                  ? team.vehicles.map((v) => v.plate || v.name).join(', ')
                  : 'Chưa gán phương tiện'}
              </div>
            </div>
          </div>

          {/* Member Table */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flexShrink: 0, fontSize: 13, fontWeight: 800, color: 'var(--dm-text-strong)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              Danh sách cán bộ chiến sĩ trong đội ({totalMembers})
            </div>

            <div style={{ border: '1px solid var(--dm-border)', borderRadius: 8, overflowX: 'auto', background: 'var(--dm-surface)' }}>
              <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'var(--dm-surface-subtle)', borderBottom: '1px solid var(--dm-border)', color: 'var(--dm-text-muted)', fontSize: 11.5, fontWeight: 700 }}>
                    <th style={{ padding: '9px 12px', width: 45, textAlign: 'center', whiteSpace: 'nowrap' }}>STT</th>
                    <th style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>Họ và tên</th>
                    <th style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>Nhiệm vụ / Vai trò</th>
                    <th style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>Điện thoại liên hệ</th>
                    <th style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>Vị trí GPS / Tọa độ</th>
                    <th style={{ padding: '9px 12px', width: 115, textAlign: 'center', whiteSpace: 'nowrap' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {uniqueRescuers.length > 0 ? (
                    uniqueRescuers.map((rescuer, idx) => {
                      const isLeader =
                        idx === 0 ||
                        rescuer.role.toLowerCase().includes('trưởng') ||
                        rescuer.role.toLowerCase().includes('chỉ huy') ||
                        rescuer.role.toLowerCase().includes('leader');
                      return (
                        <tr
                          key={rescuer.id || idx}
                          style={{
                            borderBottom: idx !== uniqueRescuers.length - 1 ? '1px solid var(--dm-border)' : 'none',
                            background: isLeader ? 'rgba(2, 132, 199, 0.03)' : '#ffffff',
                          }}
                        >
                          <td style={{ padding: '10px 12px', color: 'var(--dm-text-muted)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>
                            #{idx + 1}
                          </td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <strong style={{ color: 'var(--dm-text-strong)', fontSize: 13, whiteSpace: 'nowrap' }}>{rescuer.name}</strong>
                              {isLeader && (
                                <span
                                  style={{
                                    fontSize: 9.5,
                                    fontWeight: 800,
                                    color: 'var(--dm-blue-text)',
                                    background: 'rgba(2, 132, 199, 0.1)',
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  CHỈ HUY
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--dm-text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                            {rescuer.role}
                          </td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            {rescuer.phone ? (
                              <a
                                href={`tel:${rescuer.phone}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  color: 'var(--dm-blue-text)',
                                  fontWeight: 700,
                                  textDecoration: 'none',
                                  background: 'rgba(2, 132, 199, 0.08)',
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <Phone size={12} />
                                <span>{rescuer.phone}</span>
                              </a>
                            ) : (
                              <span style={{ color: 'var(--dm-text-muted)', fontSize: 12 }}>Chưa cập nhật</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            {rescuer.coordinates ? (
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  background: 'var(--dm-green-bg)',
                                  border: '1px solid var(--dm-green-border)',
                                  padding: '2.5px 7px',
                                  borderRadius: 5,
                                  fontSize: 11,
                                  color: 'var(--dm-green-text)',
                                  fontWeight: 700,
                                  fontFamily: 'monospace',
                                }}
                                title={`Tọa độ GPS: ${rescuer.coordinates.lat.toFixed(5)}, ${rescuer.coordinates.lng.toFixed(5)}`}
                              >
                                <MapPin size={11} color="#16a34a" />
                                <span>{rescuer.coordinates.lat.toFixed(4)}, {rescuer.coordinates.lng.toFixed(4)}</span>
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  background: 'var(--dm-surface-subtle)',
                                  border: '1px solid var(--dm-border)',
                                  padding: '2.5px 7px',
                                  borderRadius: 5,
                                  fontSize: 11,
                                  color: 'var(--dm-text-muted)',
                                  fontWeight: 600,
                                }}
                              >
                                <MapPin size={11} color="#94a3b8" />
                                <span>Chưa cập nhật GPS</span>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 4,
                                padding: '3px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                                color: rescuer.status === 'Online' ? 'var(--dm-green-text)' : 'var(--dm-text-secondary)',
                                background: rescuer.status === 'Online' ? 'var(--dm-green-bg)' : 'var(--dm-surface-muted)',
                                border: `1px solid ${rescuer.status === 'Online' ? 'var(--dm-green-border)' : 'var(--dm-border)'}`,
                              }}
                            >
                              {rescuer.status === 'Online' ? 'Trực tuyến' : rescuer.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ padding: 16, textAlign: 'center', color: 'var(--dm-text-muted)' }}>
                        Chưa có danh sách thành viên chi tiết
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            flexShrink: 0,
            padding: '12px 20px',
            borderTop: '1px solid var(--dm-border)',
            background: 'var(--dm-surface-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--dm-text-muted)' }}>
            Tổng số: <strong style={{ color: 'var(--dm-text-strong)' }}>{totalMembers}</strong> thành viên trực chiến
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

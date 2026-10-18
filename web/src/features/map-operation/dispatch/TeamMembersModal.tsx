import React from 'react';
import { Users, Phone, X } from 'lucide-react';
import type { RescueTeam } from '@/types/domainD';

interface Props {
  team: RescueTeam | null;
  onClose: () => void;
}

export const TeamMembersModal: React.FC<Props> = ({ team, onClose }) => {
  if (!team) return null;

  const totalMembers = team.rescuers?.length || team.availableRescuersCount || 4;

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
          background: '#ffffff',
          borderRadius: 12,
          maxWidth: 620,
          width: '100%',
          boxShadow: '0 20px 40px -15px rgba(0,0,0,0.3)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
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
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                {team.name}
              </h3>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Đơn vị trực thuộc cứu hộ khẩn cấp</span>
                <span>•</span>
                <span style={{ color: '#16a34a', fontWeight: 700 }}>Trực chiến 24/7</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
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
        <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Team Overview Card */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
              background: '#f1f5f9',
              padding: '12px 14px',
              borderRadius: 8,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>QUÂN SỐ HIỆN TẠI</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                {totalMembers} chiến sĩ
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>TRẠNG THÁI TRỰC</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#16a34a', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                <span>Sẵn sàng</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>THỜI GIAN ĐÁP ỨNG</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0284c7', marginTop: 2 }}>
                ~5 - 7 phút
              </div>
            </div>
          </div>

          {/* Member Table */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              Danh sách cán bộ chiến sĩ trong đội ({totalMembers})
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 11.5, fontWeight: 700 }}>
                    <th style={{ padding: '8px 12px', width: 45 }}>STT</th>
                    <th style={{ padding: '8px 12px' }}>Họ và tên</th>
                    <th style={{ padding: '8px 12px' }}>Nhiệm vụ / Vai trò</th>
                    <th style={{ padding: '8px 12px' }}>Điện thoại liên hệ</th>
                    <th style={{ padding: '8px 12px', width: 95 }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {team.rescuers && team.rescuers.length > 0 ? (
                    team.rescuers.map((rescuer, idx) => {
                      const isLeader =
                        idx === 0 ||
                        rescuer.role.toLowerCase().includes('trưởng') ||
                        rescuer.role.toLowerCase().includes('chỉ huy') ||
                        rescuer.role.toLowerCase().includes('leader');
                      return (
                        <tr
                          key={rescuer.id || idx}
                          style={{
                            borderBottom: idx !== team.rescuers.length - 1 ? '1px solid #f1f5f9' : 'none',
                            background: isLeader ? 'rgba(2, 132, 199, 0.03)' : '#ffffff',
                          }}
                        >
                          <td style={{ padding: '10px 12px', color: '#94a3b8', fontWeight: 600 }}>
                            #{idx + 1}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <strong style={{ color: '#0f172a', fontSize: 13 }}>{rescuer.name}</strong>
                              {isLeader && (
                                <span
                                  style={{
                                    fontSize: 9.5,
                                    fontWeight: 800,
                                    color: '#0284c7',
                                    background: 'rgba(2, 132, 199, 0.1)',
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                  }}
                                >
                                  CHỈ HUY
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#475569', fontWeight: 500 }}>
                            {rescuer.role}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <a
                              href={`tel:${rescuer.phone}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                color: '#0284c7',
                                fontWeight: 700,
                                textDecoration: 'none',
                                background: 'rgba(2, 132, 199, 0.08)',
                                padding: '3px 8px',
                                borderRadius: 4,
                                fontSize: 12,
                              }}
                            >
                              <Phone size={12} />
                              <span>{rescuer.phone}</span>
                            </a>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 7px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                color: rescuer.status === 'Online' ? '#15803d' : '#475569',
                                background: rescuer.status === 'Online' ? '#dcfce7' : '#f1f5f9',
                                border: `1px solid ${rescuer.status === 'Online' ? '#bbf7d0' : '#e2e8f0'}`,
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
                      <td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>
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
            padding: '12px 20px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 18px',
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

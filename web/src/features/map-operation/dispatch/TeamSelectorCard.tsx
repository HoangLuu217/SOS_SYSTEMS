import React from 'react';
import { Check, Users } from 'lucide-react';
import type { RescueTeam } from '@/types/domainD';

interface Props {
  team: RescueTeam;
  isSelected: boolean;
  isRecommended: boolean;
  vehicleSpec: string;
  etaText: string;
  teamDisplayName: string;
  onToggle: () => void;
  onViewMembers: () => void;
}

export const TeamSelectorCard: React.FC<Props> = ({
  team,
  isSelected,
  isRecommended,
  vehicleSpec,
  etaText,
  teamDisplayName,
  onToggle,
  onViewMembers,
}) => {
  const leadRescuer = team.rescuers?.[0];
  const memberCount = team.rescuers?.length || team.availableRescuersCount || 4;

  return (
    <div
      onClick={onToggle}
      style={{
        padding: '11px 13px',
        borderRadius: 9,
        border: isSelected ? '2px solid #0284c7' : '1px solid var(--sos-border)',
        background: isSelected ? 'rgba(2, 132, 199, 0.06)' : 'var(--sos-surface)',
        boxShadow: isSelected ? '0 3px 10px rgba(2, 132, 199, 0.12)' : '0 1px 2px rgba(0,0,0,0.03)',
        cursor: 'pointer',
        transition: 'all 0.14s ease',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 9 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, minWidth: 0, flex: 1 }}>
          {/* Multi-selection Checkbox */}
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              border: `2px solid ${isSelected ? '#0284c7' : '#94a3b8'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: 2,
              background: isSelected ? '#0284c7' : 'transparent',
              color: '#ffffff',
              transition: 'all 0.12s ease',
            }}
          >
            {isSelected && <Check size={13} strokeWidth={3} />}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a', lineHeight: 1.35 }}>
                {teamDisplayName}
              </span>
              {isRecommended && (
                <span
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    fontSize: 9.5,
                    fontWeight: 800,
                    padding: '1px 6px',
                    borderRadius: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.2px',
                    display: 'inline-block',
                  }}
                >
                  Khuyến nghị
                </span>
              )}
            </div>

            <div style={{ fontSize: 12, color: '#334155', marginTop: 3 }}>
              Chỉ huy: <strong style={{ color: '#0f172a', fontWeight: 700 }}>{leadRescuer?.name || 'Trưởng đội'}</strong> ({memberCount} chiến sĩ)
            </div>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
              Phương tiện: <strong style={{ color: '#475569', fontWeight: 600 }}>{vehicleSpec}</strong>
            </div>

            {/* Nút Xem Chi Tiết Thành Viên */}
            <div style={{ marginTop: 6 }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewMembers();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: '#0284c7',
                  background: 'rgba(2, 132, 199, 0.08)',
                  border: '1px solid rgba(2, 132, 199, 0.25)',
                  borderRadius: 5,
                  padding: '3px 8px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(2, 132, 199, 0.16)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(2, 132, 199, 0.08)')}
              >
                <Users size={12} />
                <span>Xem chi tiết thành viên ({memberCount})</span>
              </button>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              background: '#dcfce7',
              color: '#15803d',
              padding: '2px 7px',
              borderRadius: 4,
              border: '1px solid #86efac',
              letterSpacing: '0.2px',
            }}
          >
            SẴN SÀNG
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>
            {etaText}
          </span>
        </div>
      </div>
    </div>
  );
};

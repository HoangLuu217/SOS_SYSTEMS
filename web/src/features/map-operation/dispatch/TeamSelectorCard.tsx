import React from 'react';
import { Check } from 'lucide-react';
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

  // Tách mã đội (nếu nằm trong dấu ngoặc) để hiển thị thành tag xám nhỏ gọn, tránh rớt 3 dòng
  const { title: cleanTeamName, codeTag } = (() => {
    const match = teamDisplayName.match(/^(.*?)(?:\s*\(([^)]+)\))?$/);
    if (match && match[2]) {
      return { title: match[1].trim(), codeTag: match[2].trim() };
    }
    return { title: teamDisplayName, codeTag: (team as any).code || '' };
  })();

  return (
    <div
      onClick={onToggle}
      style={{
        padding: '10px 12px',
        borderRadius: 9,
        border: isSelected ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
        background: isSelected ? '#eff6ff' : '#ffffff',
        boxShadow: isSelected ? '0 3px 12px -2px rgba(37, 99, 235, 0.18)' : '0 1px 3px rgba(0,0,0,0.04)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
      }}
    >
      {/* HÀNG 1: MỤC CHÍNH - CHECKBOX + TÊN ĐỘI & HUY HIỆU TRẠNG THÁI */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          {/* Checkbox chọn đội */}
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: `2px solid ${isSelected ? '#2563eb' : '#94a3b8'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              background: isSelected ? '#2563eb' : '#ffffff',
              color: '#ffffff',
              transition: 'all 0.12s ease',
            }}
          >
            {isSelected && <Check size={12} strokeWidth={3} />}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', lineHeight: 1.3 }}>
              {cleanTeamName}
            </span>
            {codeTag && (
              <span
                style={{
                  background: '#f1f5f9',
                  color: '#475569',
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: 4,
                  border: '1px solid #e2e8f0',
                  whiteSpace: 'nowrap',
                }}
              >
                {codeTag}
              </span>
            )}
          </div>
        </div>

        {/* Khuyến nghị & Trạng thái */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {isRecommended && (
            <span
              style={{
                background: '#fef3c7',
                color: '#b45309',
                border: '1px solid #fde68a',
                fontSize: 9.5,
                fontWeight: 800,
                padding: '2px 5px',
                borderRadius: 4,
                letterSpacing: '0.2px',
                whiteSpace: 'nowrap',
              }}
            >
              ★ KHUYẾN NGHỊ
            </span>
          )}
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              background: '#dcfce7',
              color: '#15803d',
              border: '1px solid #bbf7d0',
              padding: '2px 6px',
              borderRadius: 4,
              letterSpacing: '0.2px',
              whiteSpace: 'nowrap',
            }}
          >
            SẴN SÀNG
          </span>
        </div>
      </div>

      {/* HÀNG 2: THÔNG SỐ TÁC CHIẾN - KHOẢNG CÁCH & PHƯƠNG TIỆN */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {/* Hộp chỉ số thời gian & khoảng cách nổi bật */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            padding: '2px 7px',
            borderRadius: 5,
            color: '#1d4ed8',
            fontSize: 11.5,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          <span>⏱</span>
          <span>{etaText}</span>
        </div>

        {/* Phương tiện & Sức chứa */}
        <div
          style={{
            fontSize: 11.5,
            color: '#334155',
            fontWeight: 700,
            flex: 1,
            minWidth: 0,
            textAlign: 'right',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={vehicleSpec}
        >
          <span>Phương tiện: </span>
          <strong style={{ color: '#0f172a', fontWeight: 800 }}>{vehicleSpec}</strong>
        </div>
      </div>

      {/* HÀNG 3: MỤC PHỤ - CHỈ HUY & LINK XEM THÀNH VIÊN DẠNG GỌN */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px dashed #e2e8f0',
          paddingTop: 6,
          fontSize: 11,
          color: '#64748b',
        }}
      >
        <div>
          <span>Chỉ huy: </span>
          <strong style={{ color: '#1e293b', fontWeight: 700 }}>{leadRescuer?.name || 'Trưởng đội'}</strong>
          <span style={{ color: '#64748b', marginLeft: 4 }}>({memberCount} chiến sĩ)</span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onViewMembers();
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: '#2563eb',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
        >
          <span>Xem thành viên</span>
          <span style={{ fontSize: 9 }}>⌄</span>
        </button>
      </div>
    </div>
  );
};

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
  isBusy?: boolean;
  busyMissionCode?: string;
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
  isBusy,
  busyMissionCode,
  onToggle,
  onViewMembers,
}) => {
  const leadRescuer = team.rescuers?.[0];
  const memberCount = team.rescuers?.length || team.availableRescuersCount || 4;

  // Tách mã đội (nếu nằm trong dấu ngoặc) để hiển thị thành tag xám nhỏ gọn, tránh rớt dòng
  const { title: cleanTeamName, codeTag } = (() => {
    const match = teamDisplayName.match(/^(.*?)(?:\s*\(([^)]+)\))?$/);
    if (match && match[2]) {
      return { title: match[1].trim(), codeTag: match[2].trim() };
    }
    return { title: teamDisplayName, codeTag: (team as any).code || '' };
  })();

  const handleClick = () => {
    if (isBusy) {
      alert(`Đội cứu hộ "${cleanTeamName}" đang thực hiện nhiệm vụ khác${busyMissionCode ? ` (${busyMissionCode})` : ''}. Theo quy định tác chiến, mỗi đội chỉ được phép làm 1 nhiệm vụ tại một thời điểm!`);
      return;
    }
    onToggle();
  };

  return (
    <div
      onClick={handleClick}
      title={isBusy ? `Đội đang thực hiện nhiệm vụ${busyMissionCode ? ` (${busyMissionCode})` : ''}. Vui lòng chờ hoàn thành.` : undefined}
      style={{
        padding: '9px 12px',
        borderRadius: 9,
        border: isBusy
          ? '1.5px dashed #cbd5e1'
          : isSelected
          ? '2px solid #0284c7'
          : '1.5px solid #e2e8f0',
        background: isBusy ? '#f8fafc' : isSelected ? '#f0f9ff' : '#ffffff',
        opacity: isBusy ? 0.65 : 1,
        boxShadow: isSelected && !isBusy ? '0 3px 12px -2px rgba(2, 132, 199, 0.2)' : '0 1px 3px rgba(0,0,0,0.04)',
        cursor: isBusy ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {/* HÀNG 1: CHECKBOX + TÊN ĐỘI + CODE TAG + KHUYẾN NGHỊ + TRẠNG THÁI */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1 }}>
          {/* Checkbox chọn đội */}
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: `2px solid ${isBusy ? '#cbd5e1' : isSelected ? '#0284c7' : '#94a3b8'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              background: isBusy ? '#e2e8f0' : isSelected ? '#0284c7' : '#ffffff',
              color: '#ffffff',
              transition: 'all 0.12s ease',
            }}
          >
            {isSelected && !isBusy && <Check size={12} strokeWidth={3} />}
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
            {isRecommended && (
              <span
                style={{
                  background: '#fef3c7',
                  color: '#b45309',
                  border: '1px solid #fde68a',
                  fontSize: 9.5,
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: 4,
                  letterSpacing: '0.2px',
                  whiteSpace: 'nowrap',
                }}
              >
                ★ KHUYẾN NGHỊ
              </span>
            )}
          </div>
        </div>

        {/* Trạng thái sẵn sàng hoặc đang bận nhiệm vụ */}
        {isBusy ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              background: '#fee2e2',
              color: '#dc2626',
              border: '1px solid #fca5a5',
              padding: '2px 6px',
              borderRadius: 4,
              letterSpacing: '0.2px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {busyMissionCode ? `BẬN (${busyMissionCode})` : 'BẬN NHIỆM VỤ'}
          </span>
        ) : (
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              background: '#dcfce7',
              color: '#15803d',
              border: '1px solid #86efac',
              padding: '2px 6px',
              borderRadius: 4,
              letterSpacing: '0.2px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            SẴN SÀNG
          </span>
        )}
      </div>

      {/* HÀNG 2: THÔNG SỐ TÁC CHIẾN - KHOẢNG CÁCH (ETA) & PHƯƠNG TIỆN */}
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
            color: '#0369a1',
            fontSize: 11,
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
            fontWeight: 600,
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
          <strong style={{ color: '#0f172a', fontWeight: 700 }}>{vehicleSpec}</strong>
        </div>
      </div>

      {/* HÀNG 3: CHỈ HUY & LINK XEM THÀNH VIÊN GỌN GÀNG */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px dashed #e2e8f0',
          paddingTop: 5,
          fontSize: 11,
          color: '#64748b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span>Chỉ huy:</span>
          <strong style={{ color: '#1e293b', fontWeight: 700 }}>{leadRescuer?.name || 'Trưởng đội'}</strong>
          <span style={{ color: '#64748b' }}>• {memberCount} chiến sĩ</span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onViewMembers();
          }}
          style={{
            background: 'rgba(2, 132, 199, 0.08)',
            border: '1px solid rgba(2, 132, 199, 0.25)',
            borderRadius: 5,
            padding: '2px 7px',
            color: '#0284c7',
            fontSize: 10.5,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(2, 132, 199, 0.18)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(2, 132, 199, 0.08)')}
        >
          <Users size={11} />
          <span>Thành viên ({memberCount})</span>
        </button>
      </div>
    </div>
  );
};

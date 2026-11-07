import React, { useState } from 'react';
import { Check, Users, AlertTriangle, X } from 'lucide-react';
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
  const [isBusyModalOpen, setIsBusyModalOpen] = useState(false);

  const { title: cleanTeamName, codeTag } = (() => {
    const match = teamDisplayName.match(/^(.*?)(?:\s*\(([^)]+)\))?$/);
    if (match && match[2]) {
      return { title: match[1].trim(), codeTag: match[2].trim() };
    }
    return { title: teamDisplayName, codeTag: (team as any).code || '' };
  })();

  const handleClick = () => {
    if (isBusy) {
      setIsBusyModalOpen(true);
      return;
    }
    onToggle();
  };

  return (
    <>
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
        alignItems: 'flex-start',
        gap: 8,
      }}
    >
      {/* CỘT TRÁI: Checkbox chọn đội */}
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
          marginTop: 2,
          background: isBusy ? '#e2e8f0' : isSelected ? '#0284c7' : '#ffffff',
          color: '#ffffff',
          transition: 'all 0.12s ease',
        }}
      >
        {isSelected && !isBusy && <Check size={12} strokeWidth={3} />}
      </div>

      {/* CỘT PHẢI: TOÀN BỘ NỘI DUNG CĂN THẲNG HÀNG BÊN PHẢI CHECKBOX */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* HÀNG 1: TÊN ĐỘI + CODE TAG + KHUYẾN NGHỊ + TRẠNG THÁI */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', lineHeight: 1.35 }}>
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            rowGap: 4,
          }}
        >
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

          {/* Phương tiện & Biển số xe - Hiển thị toàn bộ, căn trái liền mạch */}
          <div
            style={{
              fontSize: 11.5,
              color: '#334155',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              flexWrap: 'wrap',
              lineHeight: 1.35,
            }}
            title={vehicleSpec}
          >
            <span style={{ color: '#64748b' }}>Phương tiện:</span>
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
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
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
    </div>

    {/* Modal Cảnh Báo Quy Định Tác Chiến (Thay thế hoàn toàn window.alert mặc định của trình duyệt) */}
    {isBusyModalOpen && (
      <div
        className="sos-modal-overlay"
        onClick={(e) => {
          e.stopPropagation();
          setIsBusyModalOpen(false);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001,
          padding: 16,
        }}
      >
        <div
          className="sos-modal-window"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            width: 440,
            maxWidth: '92vw',
            backgroundColor: '#ffffff',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header Modal */}
          <div
            style={{
              background: 'linear-gradient(to right, #fffbeb, #fef3c7)',
              borderBottom: '1.5px solid #fde68a',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  backgroundColor: '#fef3c7',
                  border: '1px solid #fde68a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#d97706',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={19} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 900, color: '#92400e', letterSpacing: '-0.2px' }}>
                  QUY ĐỊNH TÁC CHIẾN CỨU HỘ
                </h3>
                <div style={{ fontSize: 11.5, color: '#b45309', fontWeight: 600, marginTop: 1 }}>
                  Đội cứu hộ đang thực hiện nhiệm vụ khác
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsBusyModalOpen(false)}
              style={{
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#ffffff',
                border: '1px solid #fde68a',
                borderRadius: 6,
                color: '#78350f',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Đóng"
            >
              <X size={15} />
            </button>
          </div>

          {/* Body Modal */}
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1.5px solid #e2e8f0',
                borderRadius: 10,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 900, color: '#0f172a' }}>
                {cleanTeamName}
              </div>
              {busyMissionCode ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ color: '#64748b', fontWeight: 600 }}>Đang tác chiến ca:</span>
                  <span
                    style={{
                      fontWeight: 900,
                      color: '#dc2626',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      padding: '1.5px 7px',
                      borderRadius: 4,
                      letterSpacing: '0.2px',
                    }}
                  >
                    {busyMissionCode}
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Đội đang trong nhiệm vụ cứu nạn khác ngoài hiện trường.
                </div>
              )}
            </div>

            <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.55 }}>
              Theo quy định tác chiến, mỗi đội cứu hộ chỉ được phép phụ trách <strong style={{ color: '#0f172a' }}>01 nhiệm vụ tại một thời điểm</strong> để đảm bảo an toàn tuyệt đối cho người dân và tập trung tối đa nguồn lực tiếp cận.
            </div>
          </div>

          {/* Footer Modal */}
          <div
            style={{
              padding: '12px 20px',
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              onClick={() => setIsBusyModalOpen(false)}
              style={{
                padding: '8px 22px',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)',
                transition: 'all 0.15s ease',
              }}
            >
              ĐÃ HIỂU
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
};

import React, { useState } from 'react';
import {
  Check,
  Users,
  AlertTriangle,
  X,
  Sparkles,
  Ship,
  Ambulance,
  Truck,
  Ban,
  Clock,
  User,
} from 'lucide-react';
import type { RescueTeam } from '@/types/domainD';

export type VehicleCategory = 'BOAT' | 'AMBULANCE' | 'TRUCK' | 'NONE';

interface Props {
  team: RescueTeam;
  isSelected: boolean;
  isRecommended: boolean;
  teamTypeLabel?: string;
  matchReasons?: string[];
  warnings?: string[];
  vehicleSpec: string;
  vehicleCategory?: VehicleCategory;
  hideWardBadge?: boolean;
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
  teamTypeLabel,
  matchReasons,
  warnings,
  vehicleSpec,
  vehicleCategory = 'BOAT',
  hideWardBadge = false,
  etaText,
  teamDisplayName,
  isBusy,
  busyMissionCode,
  onToggle,
  onViewMembers,
}) => {
  const leadRescuer = team.rescuers?.[0];
  const memberCount = team.rescuers?.length ?? team.availableRescuersCount ?? 0;

  // Tách mã đội (nếu nằm trong dấu ngoặc) để hiển thị thành tag xám nhỏ gọn, tránh rớt dòng
  const [isBusyModalOpen, setIsBusyModalOpen] = useState(false);

  const { title: cleanTeamName, codeTag } = (() => {
    const match = teamDisplayName.match(/^(.*?)(?:\s*\(([^)]+)\))?$/);
    if (match && match[2]) {
      return { title: match[1].trim(), codeTag: team.code || match[2].trim() };
    }
    return { title: teamDisplayName, codeTag: team.code || '' };
  })();

  const handleClick = () => {
    if (isBusy) {
      setIsBusyModalOpen(true);
      return;
    }
    onToggle();
  };

  const sanitizeReasonText = (raw: string) =>
    raw
      .replace(/\(\s*[a-f0-9]{24}\s*\)/gi, '')
      .replace(/\b[a-f0-9]{24}\b/gi, '')
      .replace(/\bFLOOD_RESCUE\b/g, 'cứu hộ lũ')
      .replace(/\bWATER_RESCUE\b/g, 'đường thủy')
      .replace(/\bMEDICAL_RESCUE\b/g, 'y tế')
      .replace(/\bEVACUATION\b/g, 'sơ tán')
      .replace(/\bSEARCH_RESCUE\b/g, 'tìm kiếm CN')
      .replace(/\bLOGISTICS\b/g, 'hậu cần')
      .replace(/\bFIRE_RESCUE\b/g, 'PCCC')
      .replace(/\s{2,}/g, ' ')
      .trim();

  const hasValidEta = Boolean(etaText && !etaText.toLowerCase().includes('chưa có eta'));
  const allReasons = Array.from(new Set((matchReasons || []).map(sanitizeReasonText).filter(Boolean)));
  const allWarnings = Array.from(new Set((warnings || []).map(sanitizeReasonText).filter(Boolean)));
  const showWardBadge = Boolean(
    !hideWardBadge &&
      team.wardName &&
      !cleanTeamName.toLowerCase().includes(team.wardName.toLowerCase())
  );

  const renderVehicleIcon = () => {
    if (vehicleCategory === 'NONE') {
      return <Ban size={13} style={{ color: 'var(--dm-text-muted)', flexShrink: 0 }} />;
    }
    if (vehicleCategory === 'AMBULANCE') {
      return <Ambulance size={13.5} style={{ color: 'var(--dm-blue-text)', flexShrink: 0 }} />;
    }
    if (vehicleCategory === 'TRUCK') {
      return <Truck size={13.5} style={{ color: 'var(--dm-blue-text)', flexShrink: 0 }} />;
    }
    return <Ship size={13.5} style={{ color: 'var(--dm-blue-text)', flexShrink: 0 }} />;
  };

  return (
    <>
    <div
      onClick={handleClick}
      title={isBusy ? `Đội đang thực hiện nhiệm vụ${busyMissionCode ? ` (${busyMissionCode})` : ''}. Vui lòng chờ hoàn thành.` : undefined}
      style={{
        padding: '9px 11px',
        borderRadius: 9,
        border: isBusy
          ? '1.5px dashed var(--dm-border-strong)'
          : isSelected
          ? '2px solid #0284c7'
          : isRecommended
          ? '1.5px solid #a5b4fc'
          : '1.5px solid var(--dm-border)',
        background: isBusy ? 'var(--dm-surface-subtle)' : isSelected ? 'var(--dm-blue-bg)' : isRecommended ? '#fafaff' : 'var(--dm-surface)',
        opacity: isBusy ? 0.65 : 1,
        boxShadow: isSelected && !isBusy ? '0 2px 8px -2px rgba(2, 132, 199, 0.2)' : '0 1px 2px rgba(0,0,0,0.03)',
        cursor: isBusy ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      {/* CỘT TRÁI: Checkbox chọn đội */}
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          border: `2px solid ${isBusy ? 'var(--dm-border-strong)' : isSelected ? '#0284c7' : 'var(--dm-border-strong)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
          background: isBusy ? 'var(--dm-surface-hover)' : isSelected ? '#0284c7' : 'var(--dm-surface)',
          color: '#ffffff',
          transition: 'all 0.12s ease',
        }}
      >
        {isSelected && !isBusy && <Check size={12} strokeWidth={3} />}
      </div>

      {/* CỘT PHẢI: NỘI DUNG RÕ RÀNG 3-4 DÒNG */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* HÀNG 1: TÊN ĐỘI + TRẠNG THÁI */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, rowGap: 3, minWidth: 0, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: 'var(--dm-text-strong)',
                lineHeight: 1.3,
              }}
              title={cleanTeamName}
            >
              {cleanTeamName}
            </span>
            {codeTag && (
              <span
                style={{
                  background: 'var(--dm-surface-muted)',
                  color: 'var(--dm-text-secondary)',
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '1.5px 6px',
                  borderRadius: 4,
                  border: '1px solid var(--dm-border)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {codeTag}
              </span>
            )}
            {showWardBadge && (
              <span
                style={{
                  background: 'var(--dm-blue-bg)',
                  color: 'var(--dm-blue-text)',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '1.5px 6px',
                  borderRadius: 4,
                  border: '1px solid var(--dm-blue-border)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {team.wardName}
              </span>
            )}
          </div>

          {isBusy ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                background: 'var(--dm-red-bg)',
                color: 'var(--dm-red-text)',
                border: '1px solid var(--dm-red-border)',
                padding: '2px 7px',
                borderRadius: 4,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {busyMissionCode ? `BẬN (${busyMissionCode})` : 'BẬN'}
            </span>
          ) : team.status === 'Off-duty' ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                background: 'var(--dm-surface-muted)',
                color: 'var(--dm-text-muted)',
                border: '1px solid var(--dm-border-strong)',
                padding: '2px 7px',
                borderRadius: 4,
                letterSpacing: '0.2px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              NGỪNG TRỰC
            </span>
          ) : (
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                background: 'var(--dm-green-bg)',
                color: 'var(--dm-green-text)',
                border: '1px solid var(--dm-green-border)',
                padding: '2px 7px',
                borderRadius: 4,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              SẴN SÀNG
            </span>
          )}
        </div>

        {/* HÀNG 2: METADATA GỌN (AI ĐỀ XUẤT + CHUYÊN MÔN • PHƯƠNG TIỆN • ETA) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--dm-text-secondary)', lineHeight: 1.35 }}>
          {isRecommended && (
            <span
              style={{
                background: 'var(--dm-purple-bg)',
                color: 'var(--dm-purple-text)',
                border: '1px solid var(--dm-purple-border)',
                fontSize: 11,
                fontWeight: 800,
                padding: '1px 6px',
                borderRadius: 4,
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Sparkles size={11} style={{ color: '#4f46e5', flexShrink: 0 }} />
              <span>AI đề xuất</span>
            </span>
          )}
          {teamTypeLabel && (
            <span style={{ color: 'var(--dm-text-secondary)', fontWeight: 700, fontSize: 12 }}>
              {teamTypeLabel} •
            </span>
          )}
          <span
            style={{ color: 'var(--dm-text-strong)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            title={vehicleSpec}
          >
            {renderVehicleIcon()}
            <span>{vehicleSpec}</span>
          </span>
          {hasValidEta && (
            <span
              style={{ color: 'var(--dm-blue-text)', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3 }}
            >
              <span style={{ color: '#cbd5e1' }}>•</span>
              <Clock size={12} style={{ flexShrink: 0 }} />
              <span>{etaText}</span>
            </span>
          )}
        </div>

        {/* HÀNG 3: LÝ DO & CẢNH BÁO CHI TIẾT ĐẦY ĐỦ */}
        {(allReasons.length > 0 || allWarnings.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {allReasons.map((reason, idx) => (
              <div
                key={`reason-${idx}`}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--dm-blue-text)',
                  lineHeight: 1.4,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 5,
                  minWidth: 0,
                }}
              >
                <Check size={12.5} style={{ color: 'var(--dm-blue-text)', flexShrink: 0, marginTop: 2 }} />
                <span style={{ wordBreak: 'break-word' }}>{reason}</span>
              </div>
            ))}
            {allWarnings.map((warning, idx) => (
              <div
                key={`warn-${idx}`}
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: 'var(--dm-amber-text)',
                  lineHeight: 1.4,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 5,
                  minWidth: 0,
                }}
              >
                <AlertTriangle size={12} style={{ color: 'var(--dm-amber-text)', flexShrink: 0, marginTop: 2 }} />
                <span style={{ wordBreak: 'break-word' }}>{warning}</span>
              </div>
            ))}
          </div>
        )}

        {/* HÀNG 4: CHỈ HUY & XEM ĐỘI */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px dashed var(--dm-border)',
            paddingTop: 5,
            fontSize: 12,
            color: 'var(--dm-text-muted)',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <User size={12.5} style={{ color: 'var(--dm-text-muted)', flexShrink: 0 }} />
            <span>Chỉ huy:</span>
            <strong style={{ color: 'var(--dm-text-body)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {leadRescuer?.name || 'Trưởng đội'}
            </strong>
            <span>({memberCount} người)</span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewMembers();
            }}
            style={{
              background: 'rgba(2, 132, 199, 0.08)',
              border: '1px solid rgba(2, 132, 199, 0.22)',
              borderRadius: 5,
              padding: '2px 8px',
              color: 'var(--dm-blue-text)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
            }}
          >
            <Users size={12.5} />
            <span>Xem đội →</span>
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
            backgroundColor: 'var(--dm-surface)',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
            border: '1px solid var(--dm-border)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header Modal */}
          <div
            style={{
              background: 'linear-gradient(to right, #fffbeb, #fef3c7)',
              borderBottom: '1.5px solid var(--dm-amber-border)',
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
                  backgroundColor: 'var(--dm-amber-bg)',
                  border: '1px solid var(--dm-amber-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--dm-amber-text)',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={19} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 900, color: 'var(--dm-amber-text)', letterSpacing: '-0.2px' }}>
                  QUY ĐỊNH TÁC CHIẾN CỨU HỘ
                </h3>
                <div style={{ fontSize: 11.5, color: 'var(--dm-amber-text)', fontWeight: 600, marginTop: 1 }}>
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
                background: 'var(--dm-surface)',
                border: '1px solid var(--dm-amber-border)',
                borderRadius: 6,
                color: 'var(--dm-amber-text)',
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
                backgroundColor: 'var(--dm-surface-subtle)',
                border: '1.5px solid var(--dm-border)',
                borderRadius: 10,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 900, color: 'var(--dm-text-strong)' }}>
                {cleanTeamName}
              </div>
              {busyMissionCode ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ color: 'var(--dm-text-muted)', fontWeight: 600 }}>Đang tác chiến ca:</span>
                  <span
                    style={{
                      fontWeight: 900,
                      color: 'var(--dm-red-text)',
                      backgroundColor: 'var(--dm-red-bg)',
                      border: '1px solid var(--dm-red-border)',
                      padding: '1.5px 7px',
                      borderRadius: 4,
                      letterSpacing: '0.2px',
                    }}
                  >
                    {busyMissionCode}
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--dm-text-muted)' }}>
                  Đội đang trong nhiệm vụ cứu nạn khác ngoài hiện trường.
                </div>
              )}
            </div>

            <div style={{ fontSize: 13, color: 'var(--dm-text-secondary)', lineHeight: 1.55 }}>
              Theo quy định tác chiến, mỗi đội cứu hộ chỉ được phép phụ trách <strong style={{ color: 'var(--dm-text-strong)' }}>01 nhiệm vụ tại một thời điểm</strong> để đảm bảo an toàn tuyệt đối cho người dân và tập trung tối đa nguồn lực tiếp cận.
            </div>
          </div>

          {/* Footer Modal */}
          <div
            style={{
              padding: '12px 20px',
              backgroundColor: 'var(--dm-surface-subtle)',
              borderTop: '1px solid var(--dm-border)',
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

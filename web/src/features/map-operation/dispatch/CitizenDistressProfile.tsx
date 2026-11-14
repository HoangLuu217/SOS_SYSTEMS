import React, { useState } from 'react';
import { Phone, MapPin, Maximize2, X, ChevronDown, ChevronUp, MessageSquareText, Package, Plus, Minus, Users, AlertCircle } from 'lucide-react';
import type { SosRequest } from '@/types/domainD';
import type { EquipmentItem } from '@/api/equipment.api';

interface Props {
  selectedSos: SosRequest;
  allocatedSupplies?: Record<string, number>;
  onAllocatedSuppliesChange?: (supplies: Record<string, number>) => void;
  areaSupplies?: EquipmentItem[];
  isLoadingSupplies?: boolean;
}

export const CitizenDistressProfile: React.FC<Props> = ({
  selectedSos,
  allocatedSupplies: propAllocatedSupplies,
  onAllocatedSuppliesChange,
  areaSupplies = [],
  isLoadingSupplies = false,
}) => {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isDetailExpanded, setIsDetailExpanded] = useState(false);
  const [isSuppliesExpanded, setIsSuppliesExpanded] = useState(false);
  const [hoveredSupplyId, setHoveredSupplyId] = useState<string | null>(null);

  // Danh sách vật tư đã cấp / phân bổ cho ca cứu nạn này
  const [internalSupplies, setInternalSupplies] = useState<Record<string, number>>({});

  const allocatedSupplies = propAllocatedSupplies ?? internalSupplies;

  const commitSupplies = (next: Record<string, number>) => {
    if (onAllocatedSuppliesChange) {
      onAllocatedSuppliesChange(next);
    } else {
      setInternalSupplies(next);
    }
  };

  const handleUpdateSupply = (supplyId: string, delta: number, maxAvailable = 999999) => {
    const current = allocatedSupplies[supplyId] || 0;
    const nextVal = Math.min(maxAvailable, Math.max(0, current + delta));
    const copy = { ...allocatedSupplies };
    if (nextVal === 0) {
      delete copy[supplyId];
    } else {
      copy[supplyId] = nextVal;
    }
    commitSupplies(copy);
  };

  const handleSetSupplyQuantity = (supplyId: string, rawVal: string, maxAvailable = 999999) => {
    const cleanNum = rawVal.replace(/[^0-9]/g, '');
    const num = cleanNum === '' ? 0 : parseInt(cleanNum, 10);
    const valid = Math.min(maxAvailable, Math.max(0, num));
    const copy = { ...allocatedSupplies };
    if (valid === 0) {
      delete copy[supplyId];
    } else {
      copy[supplyId] = valid;
    }
    commitSupplies(copy);
  };

  // Xác định danh sách đối tượng ưu tiên từ dữ liệu thực tế của ca SOS
  const priorityList = (() => {
    if (Array.isArray(selectedSos.priorityGroups) && selectedSos.priorityGroups.length > 0) {
      return selectedSos.priorityGroups;
    }
    const desc = (selectedSos.description || "") + " " + (selectedSos.title || "");
    if (desc.includes("[Đối tượng ưu tiên:")) {
      const match = desc.match(/\[Đối tượng ưu tiên:\s*([^\]]+)\]/);
      if (match && match[1]) {
        return match[1].split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
    const keywords: string[] = [];
    if (/người già|người cao tuổi/i.test(desc)) keywords.push("Người già");
    if (/trẻ nhỏ|trẻ em|em bé|sơ sinh/i.test(desc)) keywords.push("Trẻ em");
    if (/mang thai|bầu|thai phụ/i.test(desc)) keywords.push("Phụ nữ có thai");
    if (/khuyết tật|tàn tật|liệt/i.test(desc)) keywords.push("Người khuyết tật");
    if (/bệnh nặng|thở oxy|tai biến/i.test(desc)) keywords.push("Bệnh nhân nặng");
    if (/hộ nghèo|gia đình khó khăn|hộ khó khăn/i.test(desc)) keywords.push("Hộ gia đình khó khăn");
    return keywords;
  })();

  const secondaryTagLabel =
    priorityList.length > 0
      ? priorityList.join(', ')
      : selectedSos.affectedPeople > 1
        ? 'Hộ gia đình'
        : null;

  const hasExtraDetail = Boolean(selectedSos.description || selectedSos.imageUrl);

  const uniformBoxStyle: React.CSSProperties = {
    minWidth: 0,
    minHeight: 32,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    padding: '6px 8px',
    borderRadius: 6,
    fontSize: 11.5,
    fontWeight: 700,
    lineHeight: 1.3,
    border: '1px solid #e2e8f0',
    boxSizing: 'border-box',
  };

  return (
    <>
      <div
        style={{
          padding: '8px 11px',
          background: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)',
        }}
      >
        {/* Section 0: Mã SOS, loại sự cố & thời gian */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            paddingBottom: 5,
            borderBottom: '1px dashed #e2e8f0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 15,
                fontWeight: 900,
                fontFamily: 'var(--sos-font-mono, monospace)',
                fontVariantNumeric: 'tabular-nums',
                color: '#0f172a',
                letterSpacing: '-0.3px',
              }}
            >
              {selectedSos.sosCode}
            </span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: 'var(--sos-primary, #0284c7)',
                background: 'var(--sos-primary-soft, #e0f2fe)',
                border: '1px solid var(--sos-primary-border, #7dd3fc)',
                padding: '1px 6px',
                borderRadius: 4,
              }}
            >
              {selectedSos.emergencyType}
            </span>
          </div>
          <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600, flexShrink: 0 }}>
            • {selectedSos.timeAgo || 'Vừa xong'}
          </span>
        </div>

        {/* Section 1: Tên người dân & Số điện thoại đường dây nóng trên 1 hàng */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 15, letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedSos.citizenName}
          </div>

          <a
            href={`tel:${selectedSos.citizenPhone}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              color: '#1e293b',
              fontWeight: 700,
              textDecoration: 'none',
              background: '#f8fafc',
              padding: '4px 9px',
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              fontSize: 12,
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
            title="Gọi trực tiếp cho người dân"
          >
            <Phone size={12} style={{ color: '#475569' }} />
            <span>{selectedSos.citizenPhone}</span>
          </a>
        </div>

        {/* Section 2: Vị trí hiện trường */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <MapPin size={14} style={{ color: '#64748b', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', lineHeight: 1.35, wordBreak: 'break-word' }}>
            {selectedSos.locationName}
          </div>
        </div>

        {/* Section 3: Hai ô thông tin nạn nhân kích thước đều nhau & không cắt chữ */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: secondaryTagLabel ? '1fr 1fr' : '1fr',
            alignItems: 'stretch',
            gap: 6,
          }}
        >
          <div
            style={{
              ...uniformBoxStyle,
              background: '#f8fafc',
              color: '#0f172a',
            }}
            title={`${selectedSos.affectedPeople} người gặp nạn`}
          >
            <Users size={12.5} style={{ color: '#475569', flexShrink: 0 }} />
            <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'center' }}>
              {selectedSos.affectedPeople} người gặp nạn
            </span>
          </div>

          {secondaryTagLabel && (
            <div
              style={{
                ...uniformBoxStyle,
                background: '#f8fafc',
                color: '#334155',
              }}
              title={`Đối tượng ưu tiên: ${secondaryTagLabel}`}
            >
              <AlertCircle size={12.5} style={{ color: '#64748b', flexShrink: 0 }} />
              <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'center' }}>
                {secondaryTagLabel}
              </span>
            </div>
          )}
        </div>

        {/* Section 5: Buttons Action Bar - Bằng kích thước với hàng ô phía trên */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: hasExtraDetail ? '1fr 1fr' : '1fr',
            alignItems: 'stretch',
            gap: 6,
          }}
        >
          {hasExtraDetail && (
            <button
              type="button"
              onClick={() => {
                setIsDetailExpanded((prev) => !prev);
                if (!isDetailExpanded) setIsSuppliesExpanded(false);
              }}
              style={{
                ...uniformBoxStyle,
                background: isDetailExpanded ? '#f1f5f9' : '#ffffff',
                border: isDetailExpanded ? '1px solid #94a3b8' : '1px solid #e2e8f0',
                cursor: 'pointer',
                color: isDetailExpanded ? '#0f172a' : '#334155',
                transition: 'all 0.15s ease',
              }}
              title="Nhấn để xem lời nhắn chi tiết từ hiện trường"
            >
              <MessageSquareText size={12.5} style={{ color: isDetailExpanded ? '#0f172a' : '#64748b', flexShrink: 0 }} />
              <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'center' }}>
                {isDetailExpanded ? 'Thu gọn lời nhắn' : 'Xem lời nhắn & ảnh'}
              </span>
              {isDetailExpanded ? <ChevronUp size={12} style={{ flexShrink: 0 }} /> : <ChevronDown size={12} style={{ flexShrink: 0 }} />}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setIsSuppliesExpanded((prev) => !prev);
              if (!isSuppliesExpanded) setIsDetailExpanded(false);
            }}
            style={{
              ...uniformBoxStyle,
              background: isSuppliesExpanded ? '#f1f5f9' : '#ffffff',
              border: isSuppliesExpanded ? '1px solid #94a3b8' : '1px solid #e2e8f0',
              cursor: 'pointer',
              color: isSuppliesExpanded ? '#0f172a' : '#334155',
              transition: 'all 0.15s ease',
            }}
            title="Quản lý vật tư và trang thiết bị cấp phát cho ca cứu nạn"
          >
            <Package size={12.5} style={{ color: isSuppliesExpanded ? '#0f172a' : '#64748b', flexShrink: 0 }} />
            <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'center' }}>
              {isSuppliesExpanded ? 'Đóng kho vật tư' : 'Cấp vật tư'}
            </span>
            {isSuppliesExpanded ? <ChevronUp size={12} style={{ flexShrink: 0 }} /> : <ChevronDown size={12} style={{ flexShrink: 0 }} />}
          </button>
        </div>

        {/* Nội dung sổ ra: Lời nhắn hiện trường & Ảnh */}
        {isDetailExpanded && hasExtraDetail && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              animation: 'fadeIn 0.2s ease-in-out',
            }}
          >
            {selectedSos.description && (
              <div
                style={{
                  padding: '8px 11px',
                  background: '#f8fafc',
                  borderLeft: '3px solid #64748b',
                  borderRadius: '0 6px 6px 0',
                  borderTop: '1px solid #e2e8f0',
                  borderRight: '1px solid #e2e8f0',
                  borderBottom: '1px solid #e2e8f0',
                }}
              >
                <div
                  style={{
                    fontStyle: 'italic',
                    color: '#1e293b',
                    lineHeight: 1.45,
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  "{selectedSos.description}"
                </div>
              </div>
            )}

            {/* Ảnh hiện trường xác minh (nếu có) */}
            {selectedSos.imageUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                <div
                  onClick={() => setIsLightboxOpen(true)}
                  style={{
                    width: 58,
                    height: 40,
                    borderRadius: 6,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: '1.5px solid #cbd5e1',
                    flexShrink: 0,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}
                  title="Bấm để xem ảnh phóng to"
                >
                  <img
                    src={selectedSos.imageUrl}
                    alt="Hiện trường"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsLightboxOpen(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: '#0284c7',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Maximize2 size={13} />
                  <span>Xem ảnh hiện trường (Phóng to)</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Nội dung sổ ra: Danh sách Thêm Vật Tư (Lấy từ kho vật tư qua) */}
        {isSuppliesExpanded && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '8px 10px',
              animation: 'fadeIn 0.2s ease-in-out',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>
                Kho vật tư cứu trợ &amp; PCTT:
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto', paddingRight: 2 }}>
              {isLoadingSupplies ? (
              <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 11.5, color: '#64748b' }}>
                Đang kiểm tra kho vật tư khu vực...
              </div>
            ) : areaSupplies.length === 0 ? (
              <div style={{ padding: '12px 0', textAlign: 'center', fontSize: 11.5, color: '#94a3b8', fontStyle: 'italic' }}>
                Kho khu vực hiện chưa có trang thiết bị/vật tư khả dụng.
              </div>
            ) : (
              areaSupplies.map((supply) => {
                const sId = supply._id || (supply as any).id;
                const qty = allocatedSupplies[sId] || 0;
                const maxAvailable = supply.quantity || 0;
                const isHovered = hoveredSupplyId === sId;
                return (
                    <div
                      key={sId}
                      onMouseEnter={() => setHoveredSupplyId(sId)}
                      onMouseLeave={() => setHoveredSupplyId(null)}
                      style={{
                        display: 'flex',
                        alignItems: isHovered ? 'flex-start' : 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        background: isHovered ? (qty > 0 ? '#e0f2fe' : '#f8fafc') : qty > 0 ? '#f0f9ff' : '#ffffff',
                        border: isHovered ? '1.5px solid #0284c7' : qty > 0 ? '1px solid #bae6fd' : '1px solid #e2e8f0',
                        boxShadow: isHovered ? '0 4px 12px rgba(2, 132, 199, 0.12)' : '0 1px 2px rgba(0,0,0,0.03)',
                        padding: '6px 9px',
                        borderRadius: 7,
                        fontSize: 11.5,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          title={`${supply.name} • Tồn kho: ${supply.quantity} ${supply.unit} (${supply.supplyType === 'CONSUMABLE' ? 'Tiêu hao' : 'Tái sử dụng'})`}
                          style={{
                            fontWeight: 700,
                            color: isHovered ? '#0284c7' : '#0f172a',
                            fontSize: 12,
                            lineHeight: 1.35,
                            wordBreak: 'break-word',
                            display: isHovered ? 'block' : '-webkit-box',
                            WebkitLineClamp: isHovered ? 'unset' : 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: isHovered ? 'visible' : 'hidden',
                            transition: 'color 0.15s ease',
                          }}
                        >
                          {supply.name}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>Kho còn: <strong style={{ color: supply.quantity > 0 ? '#0f172a' : '#ef4444' }}>{supply.quantity} {supply.unit}</strong></span>
                          <span>•</span>
                          <span style={{ color: supply.supplyType === 'CONSUMABLE' ? '#ea580c' : '#0284c7', fontWeight: 600 }}>
                            {supply.supplyType === 'CONSUMABLE' ? 'Tiêu hao' : 'Tái sử dụng'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, marginTop: isHovered ? 2 : 0, transition: 'margin 0.15s ease' }}>
                      <button
                        type="button"
                        onClick={() => handleUpdateSupply(sId, -1, maxAvailable)}
                        disabled={qty <= 0}
                        title="Giảm số lượng"
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 4,
                          border: '1px solid #cbd5e1',
                          background: qty <= 0 ? '#f1f5f9' : '#ffffff',
                          cursor: qty <= 0 ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: qty <= 0 ? '#94a3b8' : '#0f172a',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Minus size={11} />
                      </button>

                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={qty === 0 ? '' : qty}
                        placeholder="0"
                        title={`Tối đa trong kho: ${maxAvailable} ${supply.unit}`}
                        onChange={(e) => handleSetSupplyQuantity(sId, e.target.value, maxAvailable)}
                        style={{
                          width: 44,
                          height: 24,
                          textAlign: 'center',
                          fontWeight: 800,
                          fontSize: 12,
                          color: qty > 0 ? '#0284c7' : '#64748b',
                          background: '#ffffff',
                          border: qty >= maxAvailable && maxAvailable > 0
                            ? '1.5px solid #f59e0b'
                            : qty > 0
                            ? '1.5px solid #0284c7'
                            : '1px solid #cbd5e1',
                          borderRadius: 4,
                          outline: 'none',
                          padding: '0 2px',
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => handleUpdateSupply(sId, 1, maxAvailable)}
                        disabled={qty >= maxAvailable}
                        title={qty >= maxAvailable ? `Kho chỉ còn tối đa ${maxAvailable} ${supply.unit}` : 'Tăng số lượng'}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 4,
                          border: qty >= maxAvailable ? '1px solid #cbd5e1' : '1px solid #0284c7',
                          background: qty >= maxAvailable ? '#f1f5f9' : '#0284c7',
                          cursor: qty >= maxAvailable ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: qty >= maxAvailable ? '#94a3b8' : '#ffffff',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          </div>
        )}
      </div>

      {/* Lightbox Zoom Modal */}
      {isLightboxOpen && selectedSos.imageUrl && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: 720,
              width: '100%',
              borderRadius: 8,
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              background: '#090d16',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'rgba(15, 23, 42, 0.95)',
                color: '#ffffff',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700 }}>
                Ảnh hiện trường: {selectedSos.sosCode}
              </span>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#090d16' }}>
              <img
                src={selectedSos.imageUrl}
                alt="Hiện trường"
                style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain' }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

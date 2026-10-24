import React, { useState } from 'react';
import { Phone, MapPin, Maximize2, X, ChevronDown, ChevronUp, MessageSquareText, Package, Plus, Minus } from 'lucide-react';
import type { SosRequest } from '@/types/domainD';
import { FALLBACK_SUPPLIES } from '@/constants';

interface Props {
  selectedSos: SosRequest;
  allocatedSupplies?: Record<string, number>;
  onAllocatedSuppliesChange?: (supplies: Record<string, number>) => void;
}

export const CitizenDistressProfile: React.FC<Props> = ({
  selectedSos,
  allocatedSupplies: propAllocatedSupplies,
  onAllocatedSuppliesChange,
}) => {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isDetailExpanded, setIsDetailExpanded] = useState(false);
  const [isSuppliesExpanded, setIsSuppliesExpanded] = useState(false);

  // Danh sách vật tư đã cấp / phân bổ cho ca cứu nạn này (lấy từ kho vật tư qua)
  const [internalSupplies, setInternalSupplies] = useState<Record<string, number>>(() => {
    // Khởi tạo vật tư mặc định cần thiết dựa theo số người gặp nạn
    const count = Math.max(1, selectedSos.affectedPeople || 2);
    return {
      'sup-01': count, // Áo phao theo đầu người
      'sup-03': 1,     // 1 Túi sơ cứu y tế
      'sup-04': Math.ceil(count / 2), // Nước uống tiệt trùng
    };
  });

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

  const hasExtraDetail = Boolean(selectedSos.description || selectedSos.imageUrl);
  const totalSuppliesUnits = Object.values(allocatedSupplies).reduce((a, b) => a + b, 0);

  // Chuỗi tóm tắt yêu cầu tiếp tế
  const suppliesSummaryText = (() => {
    const activeEntries = Object.entries(allocatedSupplies).filter(([_, qty]) => qty > 0);
    if (activeEntries.length === 0) return 'Chưa yêu cầu thêm vật tư';
    return activeEntries
      .map(([id, qty]) => {
        const item = FALLBACK_SUPPLIES.find((s) => s.id === id);
        return `${item?.name.split(' ')[0] || 'Vật tư'} (${qty} ${item?.unit || 'món'})`;
      })
      .join(', ');
  })();

  return (
    <>
      <div
        style={{
          padding: '10px 12px',
          background: '#ffffff',
          border: '1.5px solid #cbd5e1',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
          boxShadow: '0 1px 4px rgba(15, 23, 42, 0.05)',
        }}
      >
        {/* Section 1: Tên người dân & Số điện thoại đường dây nóng trên 1 hàng */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontWeight: 900, color: '#0f172a', fontSize: 15, letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedSos.citizenName}
          </div>

          <a
            href={`tel:${selectedSos.citizenPhone}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              color: '#0284c7',
              fontWeight: 800,
              textDecoration: 'none',
              background: '#f0f9ff',
              padding: '3.5px 9px',
              borderRadius: 6,
              border: '1px solid #bae6fd',
              fontSize: 12,
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
            title="Gọi trực tiếp cho người dân"
          >
            <Phone size={12} style={{ color: '#0284c7' }} />
            <span>{selectedSos.citizenPhone}</span>
          </a>
        </div>

        {/* Section 2: Vị trí hiện trường khẩn cấp với ghim đỏ (bỏ nhãn thừa) */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <MapPin size={15} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1e293b', lineHeight: 1.35, wordBreak: 'break-word' }}>
            {selectedSos.locationName}
          </div>
        </div>

        {/* Section 3: Gom 2 huy hiệu nạn nhân trên cùng 1 hàng ngang */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* Huy hiệu chính (Đỏ) */}
          <span
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              padding: '2.5px 8px',
              borderRadius: 5,
              fontWeight: 900,
              color: '#dc2626',
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>🚨</span>
            <span>{selectedSos.affectedPeople} người gặp nạn</span>
          </span>

          {/* Huy hiệu phụ (Cam/Vàng) - Bỏ dấu ngoặc đơn thừa */}
          {selectedSos.affectedPeople > 1 && (
            <span
              style={{
                background: '#fefce8',
                border: '1px solid #fde68a',
                color: '#b45309',
                fontSize: 11.5,
                fontWeight: 800,
                padding: '2.5px 8px',
                borderRadius: 5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>👴👶</span>
              <span>Người cao tuổi, trẻ nhỏ</span>
            </span>
          )}
        </div>

        {/* Section 4: Mục Yêu Cầu Tiếp Tế Lương Thực / Vật Tư (Nền xám nhạt trung tính) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            padding: '4px 8px',
          }}
        >
          <Package size={13} style={{ color: '#64748b', flexShrink: 0 }} />
          <div style={{ fontSize: 11.5, color: '#475569', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 600 }}>Tiếp tế: </span>
            <span style={{ color: '#334155', fontWeight: 700 }}>{suppliesSummaryText}</span>
          </div>
        </div>

        {/* Section 5: Buttons Action Bar - Nằm gọn trên 1 dòng duy nhất không rớt chữ */}
        <div style={{ display: 'flex', gap: 6 }}>
          {hasExtraDetail && (
            <button
              type="button"
              onClick={() => {
                setIsDetailExpanded((prev) => !prev);
                if (!isDetailExpanded) setIsSuppliesExpanded(false);
              }}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                padding: '5px 6px',
                background: isDetailExpanded ? '#f0f9ff' : '#ffffff',
                border: isDetailExpanded ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 800,
                color: isDetailExpanded ? '#0369a1' : '#334155',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
              title="Nhấn để xem lời nhắn chi tiết từ hiện trường"
            >
              <MessageSquareText size={12.5} style={{ color: isDetailExpanded ? '#0284c7' : '#64748b', flexShrink: 0 }} />
              <span style={{ whiteSpace: 'nowrap' }}>{isDetailExpanded ? 'Thu gọn lời nhắn' : 'Xem lời nhắn & ảnh'}</span>
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
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: '5px 6px',
              background: isSuppliesExpanded ? '#f0fdf4' : '#ffffff',
              border: isSuppliesExpanded ? '1.5px solid #16a34a' : '1px solid #e2e8f0',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 800,
              color: isSuppliesExpanded ? '#15803d' : '#334155',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
            title="Quản lý vật tư và trang thiết bị cấp phát cho ca cứu nạn"
          >
            <Package size={12.5} style={{ color: isSuppliesExpanded ? '#16a34a' : '#64748b', flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap' }}>
              {isSuppliesExpanded ? 'Đóng kho vật tư' : `Vật tư cấp (${totalSuppliesUnits})`}
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
                  borderLeft: '3.5px solid #ef4444',
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
              <span style={{ fontSize: 10.5, color: '#64748b' }}>Nhập số hoặc bấm +/-</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 160, overflowY: 'auto' }}>
              {FALLBACK_SUPPLIES.slice(0, 5).map((supply) => {
                const qty = allocatedSupplies[supply.id] || 0;
                return (
                  <div
                    key={supply.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: qty > 0 ? '#f0f9ff' : '#ffffff',
                      border: qty > 0 ? '1px solid #bae6fd' : '1px solid #e2e8f0',
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: 11.5,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
                      <div style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {supply.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>
                        Kho còn: {supply.available} {supply.unit}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => handleUpdateSupply(supply.id, -1, supply.available)}
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
                        title={`Tối đa trong kho: ${supply.available} ${supply.unit}`}
                        onChange={(e) => handleSetSupplyQuantity(supply.id, e.target.value, supply.available)}
                        style={{
                          width: 44,
                          height: 24,
                          textAlign: 'center',
                          fontWeight: 800,
                          fontSize: 12,
                          color: qty > 0 ? '#0284c7' : '#64748b',
                          background: '#ffffff',
                          border: qty >= supply.available && supply.available > 0
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
                        onClick={() => handleUpdateSupply(supply.id, 1, supply.available)}
                        disabled={qty >= supply.available}
                        title={qty >= supply.available ? `Kho chỉ còn tối đa ${supply.available} ${supply.unit}` : 'Tăng số lượng'}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 4,
                          border: qty >= supply.available ? '1px solid #cbd5e1' : '1px solid #0284c7',
                          background: qty >= supply.available ? '#f1f5f9' : '#0284c7',
                          cursor: qty >= supply.available ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: qty >= supply.available ? '#94a3b8' : '#ffffff',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
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

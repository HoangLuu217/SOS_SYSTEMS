import React, { useState } from 'react';
import { Phone, MapPin, Maximize2, X, ChevronDown, ChevronUp, MessageSquareText, Package, Plus, Minus, Users } from 'lucide-react';
import type { SosRequest } from '@/types/domainD';
import type { EquipmentItem } from '@/api/equipment.api';
import { formatPriorityGroupLabel } from '@/features/hazards';

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
      return selectedSos.priorityGroups.map(formatPriorityGroupLabel).filter(Boolean);
    }
    const desc = (selectedSos.description || "") + " " + (selectedSos.title || "");
    if (desc.includes("[Đối tượng ưu tiên:")) {
      const match = desc.match(/\[Đối tượng ưu tiên:\s*([^\]]+)\]/);
      if (match && match[1]) {
        return match[1].split(",").map((s) => formatPriorityGroupLabel(s)).filter(Boolean);
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
  const allocatedCount = Object.values(allocatedSupplies || {}).filter((qty) => Number(qty) > 0).length;
  const emergencyTypeViLabel = ({
    FLOOD: 'Ngập lụt',
    MEDICAL: 'Cấp cứu y tế',
    LANDSLIDE: 'Sạt lở đất',
    EVACUATION: 'Sơ tán',
    FOOD: 'Lương thực',
    RELIEF: 'Cứu trợ',
    FIRE: 'Hỏa hoạn',
    RESCUE: 'Cứu nạn',
    STORM: 'Bão lũ',
    ACCIDENT: 'Tai nạn',
    MISSING_PERSON: 'Tìm kiếm',
    POLICE: 'An ninh',
    OTHER: 'Khác',
  } as Record<string, string>)[String(selectedSos.emergencyType || '').toUpperCase()] || selectedSos.emergencyType;
  const cleanLocationName = (() => {
    const raw = selectedSos.locationName || '';
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const deduped: string[] = [];
    for (const p of parts) {
      if (!deduped.some((existing) => existing.toLowerCase() === p.toLowerCase())) {
        deduped.push(p);
      }
    }
    return deduped.join(', ') || raw;
  })();
  const needsManualPriorityAlert =
    selectedSos.priority === 'UNASSESSED' ||
    selectedSos.aiAssessment?.status === 'PENDING' ||
    selectedSos.aiAssessment?.status === 'FAILED' ||
    selectedSos.aiAssessment?.status === 'UNAVAILABLE';

  const uniformBoxStyle: React.CSSProperties = {
    minWidth: 0,
    minHeight: 34,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 7,
    fontSize: 12.5,
    fontWeight: 700,
    lineHeight: 1.3,
    border: '1px solid var(--dm-border)',
    boxSizing: 'border-box',
  };

  return (
    <>
      <div
        style={{
          padding: '8px 12px 9px 12px',
          background: 'var(--dm-surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
        }}
      >
              {/* Hàng 1: Tên người dân + Loại sự cố & Địa điểm (trái) | Nút SĐT đường dây nóng (phải) */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 800,
                      color: 'var(--dm-text-strong)',
                      fontSize: 17,
                      letterSpacing: '-0.2px',
                      lineHeight: 1.3,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}
                    title={selectedSos.citizenName}
                  >
                    {selectedSos.citizenName}
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--dm-blue-text)',
                      background: 'var(--dm-blue-bg)',
                      border: '1px solid var(--dm-blue-border)',
                      padding: '2px 9px',
                      borderRadius: 999,
                      lineHeight: 1.35,
                      flexShrink: 0,
                    }}
                  >
                    {emergencyTypeViLabel}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: 'var(--dm-text-secondary)',
                    lineHeight: 1.35,
                    minWidth: 0,
                  }}
                  title={cleanLocationName}
                >
                  <MapPin size={14} style={{ color: 'var(--dm-blue-text)', flexShrink: 0 }} />
                  <span style={{ minWidth: 0 }}>{cleanLocationName}</span>
                </div>
              </div>

            <a
              href={`tel:${selectedSos.citizenPhone}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                color: 'var(--dm-text-strong)',
                fontWeight: 700,
                textDecoration: 'none',
                background: 'var(--dm-surface-subtle)',
                padding: '5px 10px',
                borderRadius: 7,
                border: '1px solid var(--dm-border-strong)',
                fontSize: 12.5,
                flexShrink: 0,
                marginTop: 1,
                transition: 'all 0.15s ease',
              }}
              title="Gọi trực tiếp cho người dân"
            >
              <Phone size={12.5} style={{ color: 'var(--dm-text-secondary)' }} />
              <span>{selectedSos.citizenPhone}</span>
            </a>
          </div>

              {/* Hàng 2: Bảng thông số 2 ô cân đối (Nạn nhân | Đối tượng ưu tiên) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(112px, auto) 1fr',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    background: 'var(--dm-surface-subtle)',
                    border: '1px solid var(--dm-border)',
                    borderRadius: 7,
                    padding: '5px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                  title={`${selectedSos.affectedPeople} người gặp nạn`}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: 'var(--dm-text-muted)',
                      letterSpacing: '0.35px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Nạn nhân
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 12.5,
                      fontWeight: 800,
                      color: 'var(--dm-text-strong)',
                    }}
                  >
                    <Users size={13} style={{ color: 'var(--dm-text-secondary)', flexShrink: 0 }} />
                    <span>{selectedSos.affectedPeople} người</span>
                  </span>
                </div>

                <div
                  style={{
                    background: 'var(--dm-surface-subtle)',
                    border: '1px solid var(--dm-border)',
                    borderRadius: 7,
                    padding: '5px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    minWidth: 0,
                  }}
                  title={secondaryTagLabel ? `Đối tượng ưu tiên: ${secondaryTagLabel}` : 'Không có nhóm ưu tiên đặc biệt'}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: 'var(--dm-text-muted)',
                      letterSpacing: '0.35px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Đối tượng ưu tiên
                  </span>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: secondaryTagLabel ? 700 : 600,
                      color: secondaryTagLabel ? 'var(--dm-text-strong)' : 'var(--dm-text-muted)',
                      lineHeight: 1.3,
                    }}
                  >
                    {secondaryTagLabel || 'Không ghi nhận'}
                  </span>
                </div>
              </div>

              {/* Chỉ hiện thông báo ngắn nếu SOS chưa có phân loại AI / đang phân tích */}
              {needsManualPriorityAlert && (
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--dm-text-secondary)',
                    background: 'var(--dm-surface)',
                    border: '1px solid var(--dm-border-strong)',
                    borderRadius: 6,
                    padding: '5px 9px',
                  }}
                >
                  {selectedSos.aiAssessment?.status === 'PENDING'
                    ? 'AI đang phân tích mức độ ưu tiên của ca SOS...'
                    : 'Chưa có phân loại AI — cán bộ kiểm tra lời nhắn để xác định mức ưu tiên.'}
                </div>
              )}

              {/* Hàng 4: Buttons Action Bar */}
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
                      background: isDetailExpanded ? 'var(--dm-surface-hover)' : 'var(--dm-surface)',
                      border: isDetailExpanded ? '1px solid var(--dm-border-strong)' : '1px solid var(--dm-border-strong)',
                      cursor: 'pointer',
                      color: isDetailExpanded ? 'var(--dm-text-strong)' : 'var(--dm-text-secondary)',
                      transition: 'all 0.15s ease',
                    }}
                    title="Nhấn để xem lời nhắn chi tiết từ hiện trường"
                  >
                    <MessageSquareText size={13} style={{ color: isDetailExpanded ? 'var(--dm-text-strong)' : 'var(--dm-text-muted)', flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'center' }}>
                      {isDetailExpanded ? 'Thu gọn lời nhắn' : 'Xem lời nhắn & ảnh'}
                    </span>
                    {isDetailExpanded ? <ChevronUp size={13} style={{ flexShrink: 0 }} /> : <ChevronDown size={13} style={{ flexShrink: 0 }} />}
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
                    background: isSuppliesExpanded ? 'var(--dm-surface-hover)' : 'var(--dm-surface)',
                    border: isSuppliesExpanded
                      ? '1px solid var(--dm-border-strong)'
                      : allocatedCount > 0
                        ? '1px solid #64748b'
                        : '1px solid var(--dm-border-strong)',
                    cursor: 'pointer',
                    color: allocatedCount > 0 || isSuppliesExpanded ? 'var(--dm-text-strong)' : 'var(--dm-text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                  title="Quản lý vật tư và trang thiết bị cấp phát cho ca cứu nạn"
                >
                  <Package size={13} style={{ color: allocatedCount > 0 || isSuppliesExpanded ? 'var(--dm-text-strong)' : 'var(--dm-text-muted)', flexShrink: 0 }} />
                  <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'center' }}>
                    {isSuppliesExpanded
                      ? 'Đóng kho vật tư'
                      : allocatedCount > 0
                        ? `Cấp vật tư (${allocatedCount})`
                        : 'Cấp vật tư'}
                  </span>
                  {isSuppliesExpanded ? <ChevronUp size={13} style={{ flexShrink: 0 }} /> : <ChevronDown size={13} style={{ flexShrink: 0 }} />}
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
                        background: 'var(--dm-surface-subtle)',
                        borderLeft: '3px solid #64748b',
                        borderRadius: '0 6px 6px 0',
                        borderTop: '1px solid var(--dm-border)',
                        borderRight: '1px solid var(--dm-border)',
                        borderBottom: '1px solid var(--dm-border)',
                      }}
                    >
                      <div
                        style={{
                          fontStyle: 'italic',
                          color: 'var(--dm-text-body)',
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
                          border: '1.5px solid var(--dm-border-strong)',
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
                          color: 'var(--dm-blue-text)',
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
                    background: 'var(--dm-surface-subtle)',
                    border: '1px solid var(--dm-border-strong)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    animation: 'fadeIn 0.2s ease-in-out',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--dm-text-secondary)', textTransform: 'uppercase' }}>
                      Kho vật tư cứu trợ &amp; PCTT:
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto', paddingRight: 2 }}>
                    {isLoadingSupplies ? (
                      <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 11.5, color: 'var(--dm-text-muted)' }}>
                        Đang kiểm tra kho vật tư khu vực...
                      </div>
                    ) : areaSupplies.length === 0 ? (
                      <div style={{ padding: '12px 0', textAlign: 'center', fontSize: 11.5, color: 'var(--dm-text-muted)', fontStyle: 'italic' }}>
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
                              background: isHovered ? (qty > 0 ? 'var(--dm-blue-bg)' : 'var(--dm-surface-subtle)') : qty > 0 ? 'var(--dm-blue-bg)' : 'var(--dm-surface)',
                              border: isHovered ? '1.5px solid #0284c7' : qty > 0 ? '1px solid var(--dm-blue-border)' : '1px solid var(--dm-border)',
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
                                  color: isHovered ? 'var(--dm-blue-text)' : 'var(--dm-text-strong)',
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
                              <div style={{ fontSize: 10.5, color: 'var(--dm-text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span>Kho còn: <strong style={{ color: supply.quantity > 0 ? 'var(--dm-text-strong)' : '#ef4444' }}>{supply.quantity} {supply.unit}</strong></span>
                                <span>•</span>
                                <span style={{ color: supply.supplyType === 'CONSUMABLE' ? 'var(--dm-orange-text)' : 'var(--dm-blue-text)', fontWeight: 600 }}>
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
                                  border: '1px solid var(--dm-border-strong)',
                                  background: qty <= 0 ? 'var(--dm-surface-muted)' : 'var(--dm-surface)',
                                  cursor: qty <= 0 ? 'not-allowed' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: qty <= 0 ? 'var(--dm-text-muted)' : 'var(--dm-text-strong)',
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
                                  color: qty > 0 ? 'var(--dm-blue-text)' : 'var(--dm-text-muted)',
                                  background: 'var(--dm-surface)',
                                  border: qty >= maxAvailable && maxAvailable > 0
                                    ? '1.5px solid #f59e0b'
                                    : qty > 0
                                      ? '1.5px solid #0284c7'
                                      : '1px solid var(--dm-border-strong)',
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
                                  border: qty >= maxAvailable ? '1px solid var(--dm-border-strong)' : '1px solid #0284c7',
                                  background: qty >= maxAvailable ? 'var(--dm-surface-muted)' : '#0284c7',
                                  cursor: qty >= maxAvailable ? 'not-allowed' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: qty >= maxAvailable ? 'var(--dm-text-muted)' : '#ffffff',
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

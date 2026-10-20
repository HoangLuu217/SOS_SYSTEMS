import React, { useState } from 'react';
import { Phone, MapPin, Maximize2, X } from 'lucide-react';
import type { SosRequest } from '@/types/domainD';

interface Props {
  selectedSos: SosRequest;
}

export const CitizenDistressProfile: React.FC<Props> = ({ selectedSos }) => {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  return (
    <>
      <div
        style={{
          padding: '11px 13px',
          background: '#ffffff',
          border: '1.5px solid #cbd5e1',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
          boxShadow: '0 2px 6px -1px rgba(0, 0, 0, 0.05)',
        }}
      >
        {/* Section 1: Tên người dân & Số điện thoại đường dây nóng */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>
              Người Dân Gặp Nạn
            </div>
            <span style={{ fontWeight: 900, color: '#0f172a', fontSize: 17, letterSpacing: '-0.2px' }}>
              {selectedSos.citizenName}
            </span>
          </div>

          <a
            href={`tel:${selectedSos.citizenPhone}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: '#0284c7',
              fontWeight: 800,
              textDecoration: 'none',
              background: '#f0f9ff',
              padding: '6px 12px',
              borderRadius: 8,
              border: '1.5px solid #bae6fd',
              fontSize: 13.5,
              transition: 'all 0.15s ease',
            }}
            title="Gọi trực tiếp cho người dân"
          >
            <Phone size={15} style={{ color: '#0284c7' }} />
            <span>{selectedSos.citizenPhone}</span>
          </a>
        </div>

        {/* Divider 1 */}
        <div style={{ height: 1, background: '#e2e8f0', margin: '2px 0' }} />

        {/* Section 2: Vị trí hiện trường khẩn cấp */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <MapPin size={18} style={{ color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 2 }}>
              Vị Trí Cứu Trợ (Hiện Trường)
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: '#0f172a', lineHeight: 1.45 }}>
              {selectedSos.locationName}
            </div>
          </div>
        </div>

        {/* Divider 2 */}
        <div style={{ height: 1, background: '#e2e8f0', margin: '2px 0' }} />

        {/* Section 3: Số lượng người & Đối tượng tổn thương */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                background: '#fef2f2',
                border: '1.5px solid #fecaca',
                padding: '4px 10px',
                borderRadius: 7,
                fontWeight: 900,
                color: '#dc2626',
                fontSize: 14.5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span>🚨</span>
              <span>{selectedSos.affectedPeople} người gặp nạn</span>
            </span>
          </div>

          {selectedSos.affectedPeople > 1 && (
            <span style={{ color: '#475569', fontSize: 13, fontWeight: 700 }}>
              (Bao gồm người cao tuổi, trẻ nhỏ)
            </span>
          )}
        </div>

        {/* Section 4: Mô tả chi tiết tình huống hiện trường */}
        {selectedSos.description && (
          <div
            style={{
              padding: '11px 14px',
              background: '#f8fafc',
              borderLeft: '4px solid #ef4444',
              borderRadius: '0 8px 8px 0',
              borderTop: '1px solid #e2e8f0',
              borderRight: '1px solid #e2e8f0',
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>
              Lời Nhắn Hiện Trường
            </div>
            <div
              style={{
                fontStyle: 'italic',
                color: '#1e293b',
                lineHeight: 1.55,
                fontSize: 13.5,
                fontWeight: 600,
              }}
            >
              "{selectedSos.description}"
            </div>
          </div>
        )}

        {/* Section 5: Ảnh hiện trường xác minh (nếu có) */}
        {selectedSos.imageUrl && (
          <>
            <div style={{ height: 1, background: '#e2e8f0', margin: '2px 0' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                onClick={() => setIsLightboxOpen(true)}
                style={{
                  width: 68,
                  height: 48,
                  borderRadius: 8,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: '1.5px solid #cbd5e1',
                  flexShrink: 0,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
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
                  color: '#2563eb',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Maximize2 size={15} />
                <span>Xem ảnh hiện trường (Phóng to)</span>
              </button>
            </div>
          </>
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

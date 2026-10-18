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
          padding: '13px 15px',
          background: 'var(--sos-surface)',
          border: '1px solid var(--sos-border)',
          borderRadius: 8,
          fontSize: 13,
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
        }}
      >
        {/* Row 1: Citizen Name + Direct hotline call */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 15 }}>
            {selectedSos.citizenName}
          </span>
          <a
            href={`tel:${selectedSos.citizenPhone}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              color: '#0f172a',
              fontWeight: 700,
              textDecoration: 'none',
              background: 'var(--sos-surface-subtle)',
              padding: '4px 9px',
              borderRadius: 5,
              border: '1px solid var(--sos-border)',
              fontSize: 12,
            }}
          >
            <Phone size={13} style={{ color: '#0284c7' }} />
            <span>{selectedSos.citizenPhone}</span>
          </a>
        </div>

        {/* Row 2: Location snippet */}
        <div style={{ color: '#1e293b', lineHeight: 1.4, fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 5 }}>
          <MapPin size={15} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
          <span><strong style={{ fontWeight: 700, color: '#0f172a' }}>{selectedSos.locationName}</strong></span>
        </div>

        {/* Row 3: Casualties and Vulnerabilities summary */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--sos-text-secondary)' }}>
          <span style={{ fontWeight: 800, color: '#dc2626', fontSize: 13.5 }}>
            {selectedSos.affectedPeople} người gặp nạn
          </span>
          {selectedSos.affectedPeople > 1 && (
            <span style={{ color: 'var(--sos-text-muted)', fontSize: 12, fontWeight: 500 }}>
              (Bao gồm người cao tuổi, trẻ nhỏ)
            </span>
          )}
        </div>

        {/* Row 4: Narrative Description */}
        {selectedSos.description && (
          <div
            style={{
              padding: '8px 11px',
              background: 'var(--sos-surface-subtle)',
              borderLeft: '3px solid #dc2626',
              fontStyle: 'italic',
              color: '#334155',
              lineHeight: 1.45,
              borderRadius: '0 6px 6px 0',
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            "{selectedSos.description}"
          </div>
        )}

        {/* Row 5: Photo Attachment */}
        {selectedSos.imageUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 2 }}>
            <div
              onClick={() => setIsLightboxOpen(true)}
              style={{
                width: 58,
                height: 42,
                borderRadius: 6,
                overflow: 'hidden',
                cursor: 'pointer',
                border: '1px solid var(--sos-border)',
                flexShrink: 0,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
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
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Maximize2 size={13} />
              <span>Xem ảnh hiện trường (Zoom phóng to)</span>
            </button>
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

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface PhotoLightboxState {
  images: string[];
  activeIndex: number;
  title?: string;
}

interface PhotoLightboxModalProps {
  state: PhotoLightboxState | null;
  onClose: () => void;
}

export const PhotoLightboxModal: React.FC<PhotoLightboxModalProps> = ({ state, onClose }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const images = state?.images?.filter(Boolean) || [];
  const hasMultiple = images.length > 1;
  const currentUrl = images[activeIndex] || images[0] || '';

  useEffect(() => {
    if (!state) return;
    const bounded = Math.max(0, Math.min(state.activeIndex || 0, Math.max(0, images.length - 1)));
    setActiveIndex(bounded);
  }, [state, images.length]);

  useEffect(() => {
    if (!state) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (hasMultiple && e.key === 'ArrowLeft') {
        setActiveIndex((prev) => (prev - 1 + images.length) % images.length);
      } else if (hasMultiple && e.key === 'ArrowRight') {
        setActiveIndex((prev) => (prev + 1) % images.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, hasMultiple, images.length, onClose]);

  if (!state || images.length === 0) return null;

  const handlePrev = () => {
    setActiveIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev + 1) % images.length);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 20,
      }}
      onClick={onClose}
    >
      {/* Top Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '92vw',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          color: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {hasMultiple && (
            <span
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.16)',
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {activeIndex + 1} / {images.length}
            </span>
          )}
          {state.title && (
            <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{state.title}</span>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          title="Đóng xem ảnh (Esc)"
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Main Image + Nav Arrows */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: '92vw',
          maxHeight: hasMultiple ? '76vh' : '86vh',
          width: '100%',
        }}
      >
        {hasMultiple && (
          <button
            type="button"
            onClick={handlePrev}
            title="Ảnh trước (←)"
            aria-label="Ảnh trước"
            style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              backgroundColor: 'rgba(15, 23, 42, 0.78)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 2,
            }}
          >
            <ChevronLeft size={22} />
          </button>
        )}

        <img
          src={currentUrl}
          alt={state.title || `Ảnh ${activeIndex + 1}`}
          style={{
            maxWidth: '88vw',
            maxHeight: hasMultiple ? '74vh' : '84vh',
            objectFit: 'contain',
            borderRadius: 10,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            backgroundColor: '#0f172a',
          }}
        />

        {hasMultiple && (
          <button
            type="button"
            onClick={handleNext}
            title="Ảnh tiếp theo (→)"
            aria-label="Ảnh tiếp theo"
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              backgroundColor: 'rgba(15, 23, 42, 0.78)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 2,
            }}
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip */}
      {hasMultiple && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: 14,
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            maxWidth: '90vw',
            padding: '4px 6px',
          }}
        >
          {images.map((imgUrl, idx) => (
            <button
              key={`${imgUrl}-${idx}`}
              type="button"
              onClick={() => setActiveIndex(idx)}
              style={{
                width: 54,
                height: 54,
                padding: 0,
                borderRadius: 8,
                overflow: 'hidden',
                border: idx === activeIndex ? '2px solid #38bdf8' : '2px solid rgba(255, 255, 255, 0.25)',
                opacity: idx === activeIndex ? 1 : 0.6,
                cursor: 'pointer',
                background: '#0f172a',
                flexShrink: 0,
              }}
            >
              <img
                src={imgUrl}
                alt={`Ảnh thu nhỏ ${idx + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};


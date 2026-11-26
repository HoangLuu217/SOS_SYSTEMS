import React from 'react';
import { ImagePlus, X } from 'lucide-react';
import type { PendingUploadImage } from '@/utils/imageUpload';

export interface MultiImageUploaderProps {
  inputId: string;
  label?: string;
  existingUrls?: string[];
  onRemoveExisting?: (url: string) => void;
  pendingImages: PendingUploadImage[];
  onAddFiles: (files: FileList | null) => void;
  onRemovePending: (id: string) => void;
  onPreviewImage?: (url: string, images: string[], index: number) => void;
  disabled?: boolean;
}

/**
 * Thành phần chọn, xem trước và gỡ bỏ 1 hoặc nhiều hình ảnh cho modal tạo/chỉnh sửa
 */
export const MultiImageUploader: React.FC<MultiImageUploaderProps> = ({
  inputId,
  label = 'Hình ảnh địa điểm',
  existingUrls = [],
  onRemoveExisting,
  pendingImages,
  onAddFiles,
  onRemovePending,
  onPreviewImage,
  disabled,
}) => {
  const totalCount = existingUrls.length + pendingImages.length;
  const allPreviewUrls = [
    ...existingUrls,
    ...pendingImages.map((img) => img.previewUrl),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <label htmlFor={inputId} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-strong)' }}>
          {label} ({totalCount} ảnh)
        </label>
        <span style={{ fontSize: '11.5px', color: 'var(--dm-text-muted)' }}>
          Chọn 1 hoặc nhiều ảnh (JPG, PNG, WEBP)
        </span>
      </div>

      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        multiple
        disabled={disabled}
        onChange={(e) => {
          onAddFiles(e.target.files);
          e.target.value = '';
        }}
        style={{ display: 'none' }}
      />

      <label
        htmlFor={disabled ? undefined : inputId}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '10px 12px',
          border: '1.5px dashed var(--dm-border-strong)',
          borderRadius: '8px',
          background: disabled ? 'var(--dm-surface-muted)' : 'var(--dm-surface-subtle)',
          color: disabled ? 'var(--dm-text-muted)' : 'var(--dm-text-secondary)',
          fontSize: '12.5px',
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'border-color 0.15s ease, background 0.15s ease',
        }}
      >
        <ImagePlus size={18} color={disabled ? '#94a3b8' : '#0284c7'} />
        <span>Chọn ảnh từ máy để tải lên (có thể chọn nhiều ảnh)</span>
      </label>

      {totalCount > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))',
            gap: '8px',
            marginTop: '8px',
          }}
        >
          {existingUrls.map((url, idx) => (
            <div
              key={`existing-${url}-${idx}`}
              style={{
                position: 'relative',
                aspectRatio: '1 / 1',
                borderRadius: '6px',
                overflow: 'hidden',
                border: '1px solid var(--dm-border)',
                background: 'var(--dm-surface-subtle)',
              }}
            >
              <img
                src={url}
                alt={`Ảnh hiện có ${idx + 1}`}
                onClick={() => onPreviewImage?.(url, allPreviewUrls, idx)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  cursor: onPreviewImage ? 'zoom-in' : 'default',
                  display: 'block',
                }}
              />
              {onRemoveExisting && !disabled && (
                <button
                  type="button"
                  title="Xóa ảnh này"
                  onClick={() => onRemoveExisting(url)}
                  style={{
                    position: 'absolute',
                    top: '3px',
                    right: '3px',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(15, 23, 42, 0.72)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}

          {pendingImages.map((img, idx) => (
            <div
              key={img.id}
              style={{
                position: 'relative',
                aspectRatio: '1 / 1',
                borderRadius: '6px',
                overflow: 'hidden',
                border: '1px solid var(--dm-blue-border)',
                background: 'var(--dm-blue-bg)',
              }}
            >
              <img
                src={img.previewUrl}
                alt={`Ảnh mới ${idx + 1}`}
                onClick={() => onPreviewImage?.(img.previewUrl, allPreviewUrls, existingUrls.length + idx)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  cursor: onPreviewImage ? 'zoom-in' : 'default',
                  display: 'block',
                }}
              />
              {!disabled && (
                <button
                  type="button"
                  title="Bỏ ảnh này"
                  onClick={() => onRemovePending(img.id)}
                  style={{
                    position: 'absolute',
                    top: '3px',
                    right: '3px',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(15, 23, 42, 0.72)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

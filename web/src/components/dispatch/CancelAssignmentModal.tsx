import { useState } from 'react';
import type { FormEvent } from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sosCode: string;
  onConfirmCancel: (reason: string) => void;
}

export const CancelAssignmentModal = ({
  isOpen,
  onClose,
  sosCode,
  onConfirmCancel,
}: Props) => {
  const [reason, setReason] = useState('Chuyển phương án sang lực lượng chuyên trách khác');

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    onConfirmCancel(reason.trim());
    onClose();
  };

  return (
    <div
      className="sos-modal-overlay"
      style={{ zIndex: 10000 }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="sos-modal-window"
        style={{ width: 480 }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sos-modal-header" style={{ borderBottomColor: '#fecaca' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626' }}>
            <AlertTriangle size={18} />
            <h3 className="sos-modal-title" style={{ color: '#dc2626', fontSize: 15, fontWeight: 700 }}>
              Xác nhận hủy điều động
            </h3>
          </div>
          <button
            type="button"
            className="sos-modal-close-icon"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="sos-modal-content">
            <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, margin: 0 }}>
              Bạn có chắc chắn muốn hủy phân công đội cứu hộ cho yêu cầu{' '}
              <strong>{sosCode}</strong>? Sự cố sẽ chuyển về trạng thái{' '}
              <span style={{ color: '#059669', fontWeight: 700 }}>ĐÃ XÁC MINH</span> để sẵn sàng điều phối lại.
            </p>

            <div className="form-group" style={{ marginTop: 14 }}>
              <label className="form-label" style={{ fontWeight: 600, color: '#1e293b' }}>
                Lý do hủy điều động *
              </label>
              <textarea
                className="form-textarea"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập lý do cụ thể (ví dụ: Tuyến đường ngập sâu ca-nô không tiếp cận được, nạn nhân đã được ứng cứu tại chỗ, chuyển quân sự hỗ trợ...)"
                required
              />
            </div>
          </div>

          <div className="sos-modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
            >
              Giữ điều động
            </button>
            <button
              type="submit"
              className="btn-cancel-assign"
              style={{ flex: 'none', padding: '0 18px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Trash2 size={14} />
              <span>Xác nhận hủy</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


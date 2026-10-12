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
  const [reason, setReason] = useState('Incident escalated to specialized military marine unit');

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    onConfirmCancel(reason.trim());
    onClose();
  };

  return (
    <div className="sos-modal-overlay">
      <div className="sos-modal-window" style={{ width: 460 }}>
        <div className="sos-modal-header" style={{ borderBottomColor: '#fecaca' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626' }}>
            <AlertTriangle size={18} />
            <h3 className="sos-modal-title" style={{ color: '#dc2626' }}>
              Cancel Mission Assignment
            </h3>
          </div>
          <button type="button" className="sos-modal-close-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="sos-modal-content">
            <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
              Are you sure you want to cancel the active rescue assignment for{' '}
              <strong>{sosCode}</strong>? The incident will revert to{' '}
              <span style={{ color: '#059669', fontWeight: 600 }}>VERIFIED</span> status and
              require re-dispatching.
            </p>

            <div className="form-group" style={{ marginTop: 6 }}>
              <label className="form-label">Official Cancellation Reason *</label>
              <textarea
                className="form-textarea"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="State the operational reason for cancellation (e.g., inaccessible water route, victim rescued by local citizens, re-routing to military force)..."
                required
              />
            </div>
          </div>

          <div className="sos-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Keep Assignment
            </button>
            <button
              type="submit"
              className="btn-cancel-assign"
              style={{ flex: 'none', padding: '0 16px' }}
            >
              <Trash2 size={14} />
              Confirm Cancellation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

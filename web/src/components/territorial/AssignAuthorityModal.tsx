import { useState } from 'react';
import type { FormEvent } from 'react';
import { X, Shield, CheckCircle2 } from 'lucide-react';
import type { AdministrativeArea, AuthorityOrganization } from '../../types/domainD';

interface Props {
  area: AdministrativeArea | null;
  authorities: AuthorityOrganization[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (areaId: string, authorityId: string) => void;
}

export const AssignAuthorityModal = ({
  area,
  authorities,
  isOpen,
  onClose,
  onSubmit,
}: Props) => {
  const [selectedAuthorityId, setSelectedAuthorityId] = useState(
    area?.assignedAuthorityId || (authorities[0]?.id ?? '')
  );

  if (!isOpen || !area) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedAuthorityId) return;
    onSubmit(area.id, selectedAuthorityId);
    onClose();
  };

  return (
    <div className="sos-modal-overlay">
      <div className="sos-modal-window">
        <div className="sos-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={18} style={{ color: '#0f172a' }} />
            <h3 className="sos-modal-title">
              {area.assignedAuthorityId ? 'Reassign Authority' : 'Assign Authority'} – {area.name}
            </h3>
          </div>
          <button type="button" className="sos-modal-close-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="sos-modal-content">
            <div style={{ fontSize: 13, color: 'var(--sos-text-secondary)', marginBottom: 6 }}>
              Select the primary authority organization responsible for emergency response, disaster management, and rescue team dispatch in <strong>{area.name}</strong> ({area.code}).
            </div>

            <div className="form-group">
              <label className="form-label">Authority Organization *</label>
              <select
                className="form-select"
                value={selectedAuthorityId}
                onChange={(e) => setSelectedAuthorityId(e.target.value)}
                required
              >
                {authorities.map((auth) => (
                  <option key={auth.id} value={auth.id}>
                    {auth.name} — [{auth.type}] ({auth.code})
                  </option>
                ))}
              </select>
            </div>

            {selectedAuthorityId && (
              <div
                style={{
                  padding: 12,
                  background: 'var(--sos-surface-subtle)',
                  borderRadius: 6,
                  border: '1px solid var(--sos-border)',
                  fontSize: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {(() => {
                  const a = authorities.find((x) => x.id === selectedAuthorityId);
                  if (!a) return null;
                  return (
                    <>
                      <div><strong>Address:</strong> {a.address}</div>
                      <div><strong>Direct Dispatch Line:</strong> {a.phone}</div>
                      <div><strong>Official Email:</strong> {a.email}</div>
                      <div><strong>Active Rescue Teams:</strong> {a.activeRescueTeams || 3} units</div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="sos-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary-action">
              <CheckCircle2 size={15} />
              Confirm Assignment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

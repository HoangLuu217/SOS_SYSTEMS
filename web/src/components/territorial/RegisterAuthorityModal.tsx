import { useState } from 'react';
import type { FormEvent } from 'react';
import { X, Building2, CheckCircle2 } from 'lucide-react';
import type {
  AdministrativeArea,
  AuthorityOrganization,
  AuthorityOrganizationType,
  AuthorityStatus,
} from '../../types/domainD';

interface Props {
  areas: AdministrativeArea[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<AuthorityOrganization, 'id' | 'activeRescueTeams'>) => void;
}

const ORG_TYPES: { value: AuthorityOrganizationType; label: string }[] = [
  { value: 'DISASTER_RESPONSE', label: 'Disaster Response (PCTT & TKCN)' },
  { value: 'LOCAL_AUTHORITY', label: 'Local Authority (UBND / Civil Defense)' },
  { value: 'FIRE_DEPARTMENT', label: 'Fire & Rescue Department (PCCC)' },
  { value: 'POLICE', label: 'Police Force (Cong An)' },
  { value: 'RESCUE_CENTER', label: 'Rescue Center (Trung tam Cuu nan)' },
  { value: 'MILITARY', label: 'Military Defense (Ban Chi huy Quan su)' },
  { value: 'MEDICAL', label: 'Medical Emergency (Cap cuu 115)' },
  { value: 'OTHER', label: 'Other Operational Entity' },
];

export const RegisterAuthorityModal = ({ areas, isOpen, onClose, onSubmit }: Props) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<AuthorityOrganizationType>('DISASTER_RESPONSE');
  const [code, setCode] = useState('');
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<AuthorityStatus>('ACTIVE');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter only ward/district areas
  const assignableAreas = areas.filter((a) => a.type === 'WARD' || a.type === 'DISTRICT');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter the organization name.');
      return;
    }
    if (!code.trim()) {
      setError('Please enter a unique organization code.');
      return;
    }

    const matchedArea = areas.find((a) => a.id === selectedAreaId);

    onSubmit({
      name: name.trim(),
      type,
      code: code.trim().toUpperCase(),
      areaId: selectedAreaId || null,
      administrativeAreaId: selectedAreaId || null,
      areaIds: selectedAreaId ? [selectedAreaId] : [],
      areaNames: matchedArea ? [matchedArea.name] : [],
      address: address.trim() || 'Central Emergency Center, Da Nang',
      phone: phone.trim() || '0236-3822-114',
      email: email.trim() || `${code.toLowerCase().replace(/[^a-z0-9]/g, '')}@danang.gov.vn`,
      status,
    });

    onClose();
  };

  return (
    <div className="sos-modal-overlay">
      <div className="sos-modal-window">
        <div className="sos-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={18} style={{ color: '#0f172a' }} />
            <h3 className="sos-modal-title">Register Authority Organization</h3>
          </div>
          <button type="button" className="sos-modal-close-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="sos-modal-content">
            {error && (
              <div
                style={{
                  padding: '8px 12px',
                  background: 'var(--sos-red-light)',
                  border: '1px solid var(--sos-red-border)',
                  borderRadius: 6,
                  color: 'var(--sos-red)',
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Organization Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Hai Chau District Civil Defense Command"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Organization Type *</label>
                <select
                  className="form-select"
                  value={type}
                  onChange={(e) => setType(e.target.value as AuthorityOrganizationType)}
                >
                  {ORG_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Unique Code *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. AUTH-HC-CD03"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Assigned Administrative Area</label>
              <select
                className="form-select"
                value={selectedAreaId}
                onChange={(e) => setSelectedAreaId(e.target.value)}
              >
                <option value="">-- Select Administrative Area (Optional) --</option>
                {assignableAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    [{a.type}] {a.name} ({a.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">HQ Address</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. 124 Bach Dang, Hai Chau, Da Nang"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Contact Phone</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 0236-3822-114"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Official Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. authority@danang.gov.vn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Operational Status</label>
              <select
                className="form-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as AuthorityStatus)}
              >
                <option value="ACTIVE">ACTIVE (Operational)</option>
                <option value="INACTIVE">INACTIVE (Standby / Off-duty)</option>
              </select>
            </div>
          </div>

          <div className="sos-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary-action" style={{ minWidth: 160 }}>
              <CheckCircle2 size={15} />
              Register Organization
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

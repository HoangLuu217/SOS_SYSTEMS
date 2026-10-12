import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { X, MapPin, CheckCircle2 } from 'lucide-react';
import type { AdministrativeArea, AdministrativeAreaStatus } from '../../types/domainD';

interface Props {
  area: AdministrativeArea | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (id: string, updates: Partial<AdministrativeArea>) => void;
}

export const EditAreaModal = ({ area, isOpen, onClose, onSubmit }: Props) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [boundaryRef, setBoundaryRef] = useState('');
  const [areaKm2, setAreaKm2] = useState<number>(0);
  const [population, setPopulation] = useState<number>(0);
  const [status, setStatus] = useState<AdministrativeAreaStatus>('ACTIVE');

  useEffect(() => {
    if (area) {
      setName(area.name);
      setCode(area.code);
      setBoundaryRef(area.boundaryRef || '');
      setAreaKm2(area.areaKm2 || 0);
      setPopulation(area.population || 0);
      setStatus(area.status || 'ACTIVE');
    }
  }, [area]);

  if (!isOpen || !area) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(area.id, {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      boundaryRef: boundaryRef.trim(),
      areaKm2: Number(areaKm2) || 0,
      population: Number(population) || 0,
      status,
    });
    onClose();
  };

  return (
    <div className="sos-modal-overlay">
      <div className="sos-modal-window">
        <div className="sos-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={18} style={{ color: '#0f172a' }} />
            <h3 className="sos-modal-title">Edit Administrative Area – {area.name}</h3>
          </div>
          <button type="button" className="sos-modal-close-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="sos-modal-content">
            <div className="form-group">
              <label className="form-label">Area Name *</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Area Code *</label>
                <input
                  type="text"
                  className="form-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Boundary Reference</label>
                <input
                  type="text"
                  className="form-input"
                  value={boundaryRef}
                  onChange={(e) => setBoundaryRef(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Geographic Area (km²)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={areaKm2}
                  onChange={(e) => setAreaKm2(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Registered Population</label>
                <input
                  type="number"
                  className="form-input"
                  value={population}
                  onChange={(e) => setPopulation(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Governance Status</label>
              <select
                className="form-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as AdministrativeAreaStatus)}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
          </div>

          <div className="sos-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary-action">
              <CheckCircle2 size={15} />
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

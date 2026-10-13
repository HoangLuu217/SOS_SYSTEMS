import { useState } from 'react';
import type { FormEvent } from 'react';
import { X, RefreshCw, CheckCircle2 } from 'lucide-react';
import type { RescueTeam, Vehicle } from '../../types/domainD';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  rescueTeams: RescueTeam[];
  vehicles: Vehicle[];
  currentTeamId: string;
  currentRescuerId: string;
  currentVehicleId: string;
  onSubmit: (params: {
    rescueTeamId: string;
    rescueTeamName: string;
    rescuerId: string;
    rescuerName: string;
    rescuerRole: string;
    vehicleId: string;
    vehicleName: string;
    vehicleCapacity: string;
  }) => void;
}

export const ReassignModal = ({
  isOpen,
  onClose,
  rescueTeams,
  vehicles,
  currentTeamId,
  currentRescuerId,
  currentVehicleId,
  onSubmit,
}: Props) => {
  const [selectedTeamId, setSelectedTeamId] = useState(currentTeamId || rescueTeams[0]?.id || '');

  const availableTeams = rescueTeams;
  const activeTeam = availableTeams.find((t) => t.id === selectedTeamId) || availableTeams[0];

  const availableRescuers = activeTeam?.rescuers || [];
  const [selectedRescuerId, setSelectedRescuerId] = useState(
    currentRescuerId || availableRescuers[0]?.id || ''
  );

  const teamVehicles = vehicles.filter((v) => v.teamId === selectedTeamId);
  const fallbackVehicles = teamVehicles.length > 0 ? teamVehicles : vehicles;
  const [selectedVehicleId, setSelectedVehicleId] = useState(
    currentVehicleId || fallbackVehicles[0]?.id || ''
  );

  if (!isOpen) return null;

  const handleTeamChange = (teamId: string) => {
    setSelectedTeamId(teamId);
    const newTeam = rescueTeams.find((t) => t.id === teamId);
    if (newTeam && newTeam.rescuers.length > 0) {
      setSelectedRescuerId(newTeam.rescuers[0].id);
    }
    const newVehicles = vehicles.filter((v) => v.teamId === teamId);
    if (newVehicles.length > 0) {
      setSelectedVehicleId(newVehicles[0].id);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const team = rescueTeams.find((t) => t.id === selectedTeamId);
    const rescuer = team?.rescuers.find((r) => r.id === selectedRescuerId);
    const vehicle = vehicles.find((v) => v.id === selectedVehicleId);

    if (!team || !rescuer || !vehicle) return;

    onSubmit({
      rescueTeamId: team.id,
      rescueTeamName: team.name,
      rescuerId: rescuer.id,
      rescuerName: rescuer.name,
      rescuerRole: rescuer.role,
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      vehicleCapacity: vehicle.capacity,
    });
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
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sos-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={18} style={{ color: '#0f172a' }} />
            <h3 className="sos-modal-title">Điều chỉnh đội cứu hộ</h3>
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
            <div style={{ fontSize: 13, color: 'var(--sos-text-secondary)', marginBottom: 8 }}>
              Thay đổi đội cứu hộ, cán bộ chỉ huy thực địa hoặc phương tiện cơ động cho yêu cầu này.
            </div>

            <div className="form-group">
              <label className="form-label">Bước 1: Chọn Đội cứu hộ *</label>
              <select
                className="form-select"
                value={selectedTeamId}
                onChange={(e) => handleTeamChange(e.target.value)}
              >
                {rescueTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.availableRescuersCount} cán bộ sẵn sàng)
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Bước 2: Cán bộ chỉ huy / phụ trách *</label>
              <select
                className="form-select"
                value={selectedRescuerId}
                onChange={(e) => setSelectedRescuerId(e.target.value)}
              >
                {availableRescuers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.role} [{r.status}]
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Bước 3: Phương tiện cứu hộ *</label>
              <select
                className="form-select"
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
              >
                {fallbackVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.type}) — Tải trọng: {v.capacity}
                  </option>
                ))}
              </select>
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
              Đóng
            </button>
            <button type="submit" className="btn-primary-action">
              <CheckCircle2 size={15} />
              <span>Xác nhận điều chuyển</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

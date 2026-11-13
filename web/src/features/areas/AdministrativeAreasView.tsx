import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2,
  Search,
  CheckCircle2,
  MapPin,
  X,
  UserCheck,
  UserX,
  Loader2,
} from 'lucide-react';
import type { AdministrativeAreaItem } from '@/types/dashboard';
import {
  fetchAreaManagers,
  type AreaManagerInfo,
} from '@/api';
import {
  fetchProvinceSubUnitsService,
  type ProvinceSubUnitItem,
} from '@/services/geoapifyBoundariesService';
import './AdministrativeAreasView.css';

export interface AdministrativeAreasViewProps {
  onOpenMap?: (sosId?: any) => void;
  areas?: AdministrativeAreaItem[];
  user?: any;
}

const DA_NANG_PROVINCE_NAME = 'Thành phố Đà Nẵng';
const DA_NANG_PROVINCE_PLACE_ID = 'prov-48';
const DA_NANG_PROVINCE_CODE = 48;

export const AdministrativeAreasView: React.FC<AdministrativeAreasViewProps> = ({
  onOpenMap: _onOpenMap,
  areas: _propAreas = [],
}) => {
  const [subUnits, setSubUnits] = useState<ProvinceSubUnitItem[]>([]);
  const [subUnitsLoading, setSubUnitsLoading] = useState(true);
  const [subUnitTypeFilter, setSubUnitTypeFilter] = useState<'ALL' | 'WARD' | 'COMMUNE' | 'SPECIAL'>('ALL');
  const [subUnitManagerFilter, setSubUnitManagerFilter] = useState<'ALL' | 'MANAGED' | 'UNMANAGED'>('ALL');
  const [subUnitSearchQuery, setSubUnitSearchQuery] = useState('');
  const [areaManagers, setAreaManagers] = useState<Record<string, AreaManagerInfo>>({});

  const loadDaNangAreas = useCallback(async () => {
    try {
      setSubUnitsLoading(true);
      const [units, mgrRes] = await Promise.all([
        fetchProvinceSubUnitsService(
          DA_NANG_PROVINCE_PLACE_ID,
          DA_NANG_PROVINCE_NAME,
          DA_NANG_PROVINCE_CODE
        ).catch(() => []),
        fetchAreaManagers().catch(() => ({ success: false, data: {} })),
      ]);

      setSubUnits(Array.isArray(units) ? units : []);
      if (mgrRes && mgrRes.success && mgrRes.data) {
        setAreaManagers(mgrRes.data);
      }
    } catch (e) {
      console.warn('Lỗi tải danh sách phường/xã TP. Đà Nẵng:', e);
    } finally {
      setSubUnitsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDaNangAreas();
  }, [loadDaNangAreas]);

  const getSubUnitManager = useCallback(
    (u: ProvinceSubUnitItem): AreaManagerInfo | null => {
      if (!areaManagers || Object.keys(areaManagers).length === 0) return null;

      const fullName = (u.name || '').toLowerCase().trim();
      if (areaManagers[fullName]) return areaManagers[fullName];

      const shortName = fullName
        .replace(/^(quận|huyện|thị xã|thành phố|tp\.|phường|xã|đặc khu|thị trấn)\s+/i, '')
        .trim();
      if (shortName && areaManagers[shortName]) return areaManagers[shortName];

      if (u.id && areaManagers[u.id]) return areaManagers[u.id];
      if (u.code && areaManagers[u.code.toLowerCase()]) return areaManagers[u.code.toLowerCase()];

      for (const key of Object.keys(areaManagers)) {
        if (key && shortName && (key.includes(shortName) || shortName.includes(key))) {
          return areaManagers[key];
        }
      }

      return null;
    },
    [areaManagers]
  );

  const stats = useMemo(() => {
    const managedCount = subUnits.filter((u) => getSubUnitManager(u) !== null).length;
    const wardCount = subUnits.filter((u) => u.type === 'WARD').length;
    const communeCount = subUnits.filter((u) => u.type === 'COMMUNE' || u.type === 'TOWN').length;
    const specialCount = subUnits.filter(
      (u) => u.type !== 'WARD' && u.type !== 'COMMUNE' && u.type !== 'TOWN'
    ).length;

    return {
      total: subUnits.length,
      managedCount,
      unmanagedCount: subUnits.length - managedCount,
      wardCount,
      communeCount,
      specialCount,
    };
  }, [subUnits, getSubUnitManager]);

  const filteredSubUnits = useMemo(() => {
    return subUnits.filter((u) => {
      const mgr = getSubUnitManager(u);
      if (subUnitManagerFilter === 'MANAGED' && !mgr) return false;
      if (subUnitManagerFilter === 'UNMANAGED' && mgr) return false;

      if (subUnitTypeFilter === 'WARD' && u.type !== 'WARD') return false;
      if (subUnitTypeFilter === 'COMMUNE' && u.type !== 'COMMUNE' && u.type !== 'TOWN') return false;
      if (
        subUnitTypeFilter === 'SPECIAL' &&
        (u.type === 'WARD' || u.type === 'COMMUNE' || u.type === 'TOWN')
      ) {
        return false;
      }

      if (subUnitSearchQuery.trim()) {
        const q = subUnitSearchQuery.toLowerCase();
        const matchName =
          (u.name || '').toLowerCase().includes(q) || (u.code || '').toLowerCase().includes(q);
        const matchMgr = mgr
          ? (mgr.managerName || '').toLowerCase().includes(q) ||
            (mgr.phone || '').includes(q) ||
            (mgr.department || '').toLowerCase().includes(q)
          : false;
        return matchName || matchMgr;
      }

      return true;
    });
  }, [subUnits, getSubUnitManager, subUnitManagerFilter, subUnitTypeFilter, subUnitSearchQuery]);

  return (
    <div className="sos-views-container sos-light-view administrative-areas-container">
      <div className="sos-view-card administrative-areas-card">
        <div className="sos-view-card-header">
          <div>
            <div className="sos-view-card-title">
              <Building2 size={18} color="#0284c7" />
              <span>
                Phường / Xã Trực Thuộc: {DA_NANG_PROVINCE_NAME} ({filteredSubUnits.length}/{subUnits.length} địa bàn)
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#0369a1',
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                <MapPin size={11} />
                Phạm vi hoạt động: TP. Đà Nẵng (VN-DN)
              </span>
              <span>Danh mục các phường, xã và cán bộ trực ban phụ trách địa bàn</span>
            </div>
          </div>

          <div className="areas-filters-row">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="areas-triage-group">
                <button
                  type="button"
                  className={`areas-triage-btn ${subUnitManagerFilter === 'ALL' && subUnitTypeFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => {
                    setSubUnitManagerFilter('ALL');
                    setSubUnitTypeFilter('ALL');
                  }}
                >
                  Tất cả ({stats.total})
                </button>
                <button
                  type="button"
                  className={`areas-triage-btn ${subUnitManagerFilter === 'MANAGED' ? 'active' : ''}`}
                  onClick={() =>
                    setSubUnitManagerFilter(subUnitManagerFilter === 'MANAGED' ? 'ALL' : 'MANAGED')
                  }
                >
                  <UserCheck size={13} />
                  <span>Đã có cán bộ ({stats.managedCount})</span>
                </button>
                <button
                  type="button"
                  className={`areas-triage-btn ${subUnitManagerFilter === 'UNMANAGED' ? 'active' : ''}`}
                  onClick={() =>
                    setSubUnitManagerFilter(subUnitManagerFilter === 'UNMANAGED' ? 'ALL' : 'UNMANAGED')
                  }
                >
                  <UserX size={13} />
                  <span>Chưa phân công ({stats.unmanagedCount})</span>
                </button>
              </div>

              <div className="areas-triage-group">
                <button
                  type="button"
                  className={`areas-triage-btn ${subUnitTypeFilter === 'WARD' ? 'active' : ''}`}
                  onClick={() => setSubUnitTypeFilter(subUnitTypeFilter === 'WARD' ? 'ALL' : 'WARD')}
                >
                  Phường ({stats.wardCount})
                </button>
                <button
                  type="button"
                  className={`areas-triage-btn ${subUnitTypeFilter === 'COMMUNE' ? 'active' : ''}`}
                  onClick={() =>
                    setSubUnitTypeFilter(subUnitTypeFilter === 'COMMUNE' ? 'ALL' : 'COMMUNE')
                  }
                >
                  Xã ({stats.communeCount})
                </button>
                {stats.specialCount > 0 && (
                  <button
                    type="button"
                    className={`areas-triage-btn ${subUnitTypeFilter === 'SPECIAL' ? 'active' : ''}`}
                    onClick={() =>
                      setSubUnitTypeFilter(subUnitTypeFilter === 'SPECIAL' ? 'ALL' : 'SPECIAL')
                    }
                  >
                    Đặc khu / Khác ({stats.specialCount})
                  </button>
                )}
              </div>
            </div>

            <div className="areas-search-wrap">
              <Search size={15} className="areas-search-icon" />
              <input
                type="text"
                className="areas-search-input"
                placeholder="Tìm phường, xã hoặc cán bộ phụ trách..."
                value={subUnitSearchQuery}
                onChange={(e) => setSubUnitSearchQuery(e.target.value)}
              />
              {subUnitSearchQuery && (
                <button
                  type="button"
                  className="areas-clear-search-btn"
                  onClick={() => setSubUnitSearchQuery('')}
                  title="Xóa tìm kiếm"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="sos-table-wrapper administrative-areas-table-wrapper">
          <table className="sos-table">
            <thead>
              <tr>
                <th style={{ width: '24%' }}>Tên đơn vị (Phường / Xã)</th>
                <th style={{ width: '16%', textAlign: 'center' }}>Cấp hành chính</th>
                <th style={{ width: '42%' }}>Địa phương quản lý</th>
                <th style={{ width: '18%', textAlign: 'center' }}>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {subUnitsLoading && subUnits.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    <Loader2
                      size={24}
                      className="animate-spin"
                      style={{ margin: '0 auto 8px auto', display: 'block', color: '#0284c7' }}
                    />
                    Đang tải danh sách phường, xã trực thuộc Thành phố Đà Nẵng...
                  </td>
                </tr>
              ) : filteredSubUnits.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    Không có phường / xã nào phù hợp với bộ lọc tìm kiếm.
                  </td>
                </tr>
              ) : (
                filteredSubUnits.map((u) => {
                  const isDistrict = u.type === 'DISTRICT';
                  const isCommune = u.type === 'COMMUNE';
                  const isTown = u.type === 'TOWN';

                  let typeLabel = 'Phường';
                  let typeBadgeClass = 'green';
                  if (isDistrict) {
                    if (u.name.startsWith('Đặc khu')) typeLabel = 'Đặc khu';
                    else if (u.name.startsWith('Quận')) typeLabel = 'Quận';
                    else if (u.name.startsWith('Huyện')) typeLabel = 'Huyện';
                    else if (u.name.startsWith('Thành phố') || u.name.startsWith('TP')) typeLabel = 'Thành phố';
                    else if (u.name.startsWith('Thị xã')) typeLabel = 'Thị xã';
                    else typeLabel = 'Quận / Huyện';
                    typeBadgeClass = 'yellow';
                  } else if (isCommune) {
                    typeLabel = 'Xã';
                    typeBadgeClass = 'blue';
                  } else if (isTown) {
                    typeLabel = 'Thị trấn';
                    typeBadgeClass = 'purple';
                  }

                  const mgr = getSubUnitManager(u);

                  return (
                    <tr key={u.id} style={{ height: '56px' }}>
                      <td>
                        <span
                          style={{
                            color: '#0f172a',
                            fontSize: '13.5px',
                            fontWeight: 600,
                          }}
                        >
                          {u.name}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className={`sos-badge ${typeBadgeClass}`}
                          style={{ fontSize: '11.5px', padding: '3px 10px', fontWeight: 600, whiteSpace: 'nowrap', borderRadius: '6px' }}
                        >
                          {typeLabel}
                        </span>
                      </td>
                      <td>
                        {mgr ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>
                                {mgr.managerName}
                              </span>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '10.5px',
                                  fontWeight: 600,
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  background: '#dcfce7',
                                  color: '#15803d',
                                  border: '1px solid #bbf7d0',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <CheckCircle2 size={10} color="#15803d" />
                                Đã có quản lý
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: '12px',
                                color: '#64748b',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                flexWrap: 'wrap',
                              }}
                            >
                              <span>{mgr.position || mgr.department || 'Cán bộ phụ trách'}</span>
                              {mgr.phone && (
                                <span style={{ color: '#0284c7', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  • {mgr.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 500, color: '#64748b', fontSize: '13px' }}>
                                Chưa có cán bộ quản lý
                              </span>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '10.5px',
                                  fontWeight: 600,
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  background: '#fef2f2',
                                  color: '#b91c1c',
                                  border: '1px solid #fecaca',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <UserX size={10} color="#b91c1c" />
                                Chưa phân công
                              </span>
                            </div>
                            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                              Chưa gán tài khoản địa phương phụ trách
                            </div>
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5.5px',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#15803d',
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            padding: '4px 9px',
                            borderRadius: '6px',
                            whiteSpace: 'nowrap',
                            letterSpacing: '0.2px',
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
                          HOẠT ĐỘNG
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdministrativeAreasView;

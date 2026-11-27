import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2,
  Search,
  CheckCircle2,
  MapPin,
  X,
  UserCheck,
  UserX,
} from 'lucide-react';
import { SyncLogoLoader } from '@/components/common/SyncLogoLoader';
import type { AdministrativeAreaItem } from '@/types/dashboard';
import {
  fetchAreaManagers,
  type AreaManagerInfo,
} from '@/api';
import {
  fetchProvinceSubUnitsService,
  type ProvinceSubUnitItem,
} from '@/services/geoapifyBoundariesService';
import { toast } from '@/components/common/toast';
import {
  ExcelExportButton,
  TableBulkActionBar,
  TableRowCheckbox,
  TableSelectAllCheckbox,
  useTableSelection,
} from '@/components/common/TableBulkKit';
import { exportTableToExcel } from '@/utils/tableExcelExport';
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

  const areaSelection = useTableSelection(filteredSubUnits.map((u) => u.id));

  const handleExportAreasExcel = (onlySelected = false) => {
    const targetRows = onlySelected
      ? filteredSubUnits.filter((u) => areaSelection.selectedIds.has(u.id))
      : filteredSubUnits;
    if (targetRows.length === 0) {
      toast.warning('Không có dữ liệu địa bàn để xuất Excel.');
      return;
    }
    exportTableToExcel({
      title: 'DANH MỤC ĐỊA BÀN HÀNH CHÍNH TP. ĐÀ NẴNG',
      subtitle: onlySelected
        ? `Xuất ${targetRows.length} địa bàn đã chọn`
        : `Tổng hợp ${targetRows.length} phường / xã trực thuộc`,
      sheetName: 'Dia ban hanh chinh',
      fileNamePrefix: 'Dia_ban_Da_Nang',
      columns: [
        { header: 'STT', width: 6, align: 'center' },
        { header: 'Tên đơn vị', width: 28 },
        { header: 'Cấp hành chính', width: 16, align: 'center' },
        { header: 'Cán bộ phụ trách', width: 26 },
        { header: 'Chức vụ / Đơn vị', width: 30 },
        { header: 'Số điện thoại', width: 16, align: 'center' },
        { header: 'Trạng thái phân công', width: 20, align: 'center' },
      ],
      rows: targetRows.map((u, idx) => {
        const mgr = getSubUnitManager(u);
        const typeLabel =
          u.type === 'COMMUNE' ? 'Xã' : u.type === 'TOWN' ? 'Thị trấn' : u.type === 'WARD' ? 'Phường' : 'Đặc khu / Khác';
        return [
          idx + 1,
          u.name || '—',
          typeLabel,
          mgr?.managerName || 'Chưa phân công',
          mgr ? mgr.position || mgr.department || 'Cán bộ phụ trách' : '—',
          mgr?.phone || '—',
          mgr ? 'Đã có quản lý' : 'Chưa phân công',
        ];
      }),
    });
    toast.success(`Đã xuất Excel ${targetRows.length} địa bàn hành chính.`);
  };

  return (
    <div className="sos-views-container administrative-areas-container">
      <div className="sos-view-card administrative-areas-card">
        <div className="sos-view-card-header">
          <div>
            <div className="sos-view-card-title">
              <Building2 size={18} color="var(--sos-primary)" />
              <span>
                {DA_NANG_PROVINCE_NAME} ({filteredSubUnits.length}/{subUnits.length} địa bàn)
              </span>
            </div>
            <div className="areas-subtitle-row">
              <span className="areas-scope-chip">
                <MapPin size={11} />
                TP. Đà Nẵng (VN-DN)
              </span>
              <span>Phường, xã và cán bộ phụ trách</span>
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

            <ExcelExportButton
              onClick={() => handleExportAreasExcel(false)}
              disabled={filteredSubUnits.length === 0}
              title="Xuất danh sách địa bàn hành chính ra Excel (.xlsx)"
            />
          </div>
        </div>

        <TableBulkActionBar
          selectedCount={areaSelection.selectedCount}
          totalFilteredCount={filteredSubUnits.length}
          unitLabel="địa bàn"
          onSelectAllFiltered={areaSelection.selectAllFiltered}
          onClearSelection={areaSelection.clearSelection}
          onExportSelected={() => handleExportAreasExcel(true)}
        />

        <div className="sos-table-wrapper administrative-areas-table-wrapper">
          <table className="sos-table">
            <thead>
              <tr>
                <th className="sos-checkbox-col">
                  <TableSelectAllCheckbox
                    checked={areaSelection.allVisibleSelected}
                    indeterminate={areaSelection.someVisibleSelected}
                    disabled={filteredSubUnits.length === 0}
                    onChange={areaSelection.toggleSelectVisible}
                  />
                </th>
                <th style={{ width: '24%' }}>Tên đơn vị (Phường / Xã)</th>
                <th style={{ width: '16%', textAlign: 'center' }}>Cấp hành chính</th>
                <th style={{ width: '42%' }}>Địa phương quản lý</th>
                <th style={{ width: '18%', textAlign: 'center' }}>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {subUnitsLoading && subUnits.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '16px 20px' }}>
                    <SyncLogoLoader
                      size="md"
                      message="Đang tải danh sách phường, xã trực thuộc Thành phố Đà Nẵng..."
                    />
                  </td>
                </tr>
              ) : filteredSubUnits.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--sos-text-secondary)' }}>
                    Không có phường / xã nào phù hợp với bộ lọc tìm kiếm.
                  </td>
                </tr>
              ) : (
                filteredSubUnits.map((u) => {
                  const isDistrict = u.type === 'DISTRICT';
                  const isCommune = u.type === 'COMMUNE';
                  const isTown = u.type === 'TOWN';

                  let typeLabel = 'Phường';
                  if (isDistrict) {
                    if (u.name.startsWith('Đặc khu')) typeLabel = 'Đặc khu';
                    else if (u.name.startsWith('Quận')) typeLabel = 'Quận';
                    else if (u.name.startsWith('Huyện')) typeLabel = 'Huyện';
                    else if (u.name.startsWith('Thành phố') || u.name.startsWith('TP')) typeLabel = 'Thành phố';
                    else if (u.name.startsWith('Thị xã')) typeLabel = 'Thị xã';
                    else typeLabel = 'Quận / Huyện';
                  } else if (isCommune) {
                    typeLabel = 'Xã';
                  } else if (isTown) {
                    typeLabel = 'Thị trấn';
                  }

                  const mgr = getSubUnitManager(u);

                  return (
                    <tr key={u.id} style={{ height: '56px' }}>
                      <td className="sos-checkbox-col" onClick={(e) => e.stopPropagation()}>
                        <TableRowCheckbox
                          checked={areaSelection.isSelected(u.id)}
                          onChange={() => areaSelection.toggleRow(u.id)}
                          ariaLabel={`Chọn địa bàn ${u.name}`}
                        />
                      </td>
                      <td>
                        <span className="areas-unit-name">{u.name}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="areas-level-tag">{typeLabel}</span>
                      </td>
                      <td>
                        {mgr ? (
                          <div className="areas-manager-cell">
                            <div className="areas-manager-top">
                              <span className="areas-manager-name">{mgr.managerName}</span>
                              <span className="areas-assign-pill managed">
                                <CheckCircle2 size={10} />
                                Đã có quản lý
                              </span>
                            </div>
                            <div className="areas-manager-meta">
                              <span>{mgr.position || mgr.department || 'Cán bộ phụ trách'}</span>
                              {mgr.phone && (
                                <span className="areas-manager-phone">
                                  • {mgr.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="areas-manager-cell">
                            <div className="areas-manager-top">
                              <span className="areas-manager-empty">
                                Chưa có cán bộ quản lý
                              </span>
                              <span className="areas-assign-pill unmanaged">
                                <UserX size={10} />
                                Chưa phân công
                              </span>
                            </div>
                            <div className="ch-tbl-meta">
                              Chưa gán tài khoản địa phương phụ trách
                            </div>
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="areas-status-pill">
                          <span className="areas-status-dot" />
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

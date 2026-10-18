import React, { useState, useEffect } from 'react';
import {
  Building2,
  Search,
  CheckCircle2,
  RefreshCw,
  Globe2,
  ChevronRight,
  ArrowLeft,
  UserCheck,
  UserX,
  Home,
  Loader2,
} from 'lucide-react';
import type { AdministrativeAreaItem } from '@/types/dashboard';
import {
  fetchAdministrativeAreas,
  fetchAreaManagers,
  type AreaManagerInfo,
} from '@/api';
import {
  fetchVietnamProvincesService,
  fetchProvinceSubUnitsService,
  VIETNAM_34_PROVINCES_STANDARD,
  type VietnamProvinceItem,
  type ProvinceSubUnitItem,
} from '@/services/geoapifyBoundariesService';
import './AdministrativeAreasView.css';

export interface AdministrativeAreasViewProps {
  onOpenMap?: (sosId?: any) => void;
  areas?: AdministrativeAreaItem[];
  user?: any;
}

export const AdministrativeAreasView: React.FC<AdministrativeAreasViewProps> = ({
  onOpenMap: _onOpenMap,
  areas: propAreas = [],
}) => {
  const [, setAreas] = useState<AdministrativeAreaItem[]>(propAreas);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [provincesLoading, setProvincesLoading] = useState(false);

  const [vietnamProvinces, setVietnamProvinces] = useState<VietnamProvinceItem[]>(() => {
    const initialList: VietnamProvinceItem[] = VIETNAM_34_PROVINCES_STANDARD.map((s) => ({
      id: `prov-${s.code}`,
      code: s.code,
      name: s.name,
      placeId: `prov-${s.code}`,
      ref: `VN-${s.code}`,
      isoCode: s.iso,
      divisionType: s.type,
      population: s.pop,
      areaKm2: s.area,
      isDaNang: s.code === 48,
    }));
    initialList.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return initialList;
  });
  
  const [selectedProvince, setSelectedProvince] = useState<VietnamProvinceItem | null>(null);
  const [subUnits, setSubUnits] = useState<ProvinceSubUnitItem[]>([]);
  const [subUnitsLoading, setSubUnitsLoading] = useState(false);
  const [provinceSearchQuery, setProvinceSearchQuery] = useState('');
  const [provinceManagerFilter, setProvinceManagerFilter] = useState<'ALL' | 'MANAGED' | 'UNMANAGED'>('ALL');
  const [subUnitTypeFilter, setSubUnitTypeFilter] = useState<'ALL' | 'DISTRICT' | 'WARD'>('ALL');
  const [subUnitManagerFilter, setSubUnitManagerFilter] = useState<'ALL' | 'MANAGED' | 'UNMANAGED'>('ALL');
  const [subUnitSearchQuery, setSubUnitSearchQuery] = useState('');
  const [areaManagers, setAreaManagers] = useState<Record<string, AreaManagerInfo>>({});

  // Tải danh sách đơn vị hành chính và cán bộ quản lý
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setProvincesLoading(true);
        const [areasRes, mgrRes, provRes] = await Promise.all([
          fetchAdministrativeAreas().catch(() => ({ success: false, data: [] })),
          fetchAreaManagers().catch(() => ({ success: false, data: {} })),
          fetchVietnamProvincesService().catch(() => []),
        ]);
        if (!isMounted) return;
        if (areasRes && areasRes.success && Array.isArray(areasRes.data)) {
          setAreas(areasRes.data);
        }
        if (mgrRes && mgrRes.success && mgrRes.data) {
          setAreaManagers(mgrRes.data);
        }
        if (provRes && provRes.length > 0) {
          setVietnamProvinces(provRes);
        }
      } catch (e) {
        console.warn('Lỗi tải dữ liệu khu vực:', e);
      } finally {
        if (isMounted) {
          setProvincesLoading(false);
        }
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [refreshIndex]);

    const getSubUnitManager = (u: ProvinceSubUnitItem): AreaManagerInfo | null => {
      if (!areaManagers || Object.keys(areaManagers).length === 0) return null;

      const fullName = (u.name || '').toLowerCase().trim();
      if (areaManagers[fullName]) return areaManagers[fullName];

      const shortName = fullName.replace(/^(quận|huyện|thị xã|thành phố|tp\.|phường|xã)\s+/i, '').trim();
      if (shortName && areaManagers[shortName]) return areaManagers[shortName];

      if (u.id && areaManagers[u.id]) return areaManagers[u.id];
      if (u.code && areaManagers[u.code.toLowerCase()]) return areaManagers[u.code.toLowerCase()];

      for (const key of Object.keys(areaManagers)) {
        if (key && shortName && (key.includes(shortName) || shortName.includes(key))) {
          return areaManagers[key];
        }
      }

      return null;
    };

    const getProvinceManager = (p: VietnamProvinceItem): AreaManagerInfo | null => {
      if (!areaManagers || Object.keys(areaManagers).length === 0) return null;
      const fullName = (p.name || '').toLowerCase().trim();
      if (areaManagers[fullName]) return areaManagers[fullName];
      const shortName = fullName.replace(/^(thành phố|tỉnh|tp\.)\s+/i, '').trim();
      if (shortName && areaManagers[shortName]) return areaManagers[shortName];
      for (const key of Object.keys(areaManagers)) {
        if (key && shortName && (key.includes(shortName) || shortName.includes(key))) {
          return areaManagers[key];
        }
      }
      return null;
    };



    const handleSelectProvince = async (prov: VietnamProvinceItem) => {
      setSelectedProvince(prov);
      setSubUnitsLoading(true);
      setSubUnitSearchQuery('');
      setSubUnitTypeFilter('ALL');
      setSubUnitManagerFilter('ALL');
      try {
        const [units, mgrRes] = await Promise.all([
          fetchProvinceSubUnitsService(prov.placeId, prov.name, prov.code),
          fetchAreaManagers(),
        ]);
        setSubUnits(units);
        if (mgrRes.success && mgrRes.data) {
          setAreaManagers(mgrRes.data);
        }
      } catch (err) {
        console.error('Lỗi khi tải đơn vị con:', err);
      } finally {
        setSubUnitsLoading(false);
      }
    };

    const handleBackToProvinces = () => {
      setSelectedProvince(null);
      setSubUnits([]);
      setSubUnitSearchQuery('');
      setSubUnitTypeFilter('ALL');
      setSubUnitManagerFilter('ALL');
    };

    // TẦNG 2: XEM CHI TIẾT CÁC XÃ, PHƯỜNG, QUẬN, HUYỆN CỦA TỈNH ĐƯỢC CHỌN
    if (selectedProvince) {
      const managedCount = subUnits.filter((u) => getSubUnitManager(u) !== null).length;
      const unmanagedCount = subUnits.length - managedCount;

      const filteredSubUnits = subUnits.filter((u) => {
        const mgr = getSubUnitManager(u);
        if (subUnitManagerFilter === 'MANAGED' && !mgr) return false;
        if (subUnitManagerFilter === 'UNMANAGED' && mgr) return false;
        if (subUnitTypeFilter !== 'ALL') {
          if (subUnitTypeFilter === 'DISTRICT' && u.type !== 'DISTRICT') return false;
          if (subUnitTypeFilter === 'WARD' && u.type !== 'WARD' && u.type !== 'COMMUNE' && u.type !== 'TOWN') return false;
        }
        if (subUnitSearchQuery.trim()) {
          const q = subUnitSearchQuery.toLowerCase();
          const matchName = (u.name || '').toLowerCase().includes(q) || (u.code || '').toLowerCase().includes(q);
          const matchMgr = mgr
            ? (mgr.managerName || '').toLowerCase().includes(q) ||
              (mgr.phone || '').includes(q) ||
              (mgr.department || '').toLowerCase().includes(q)
            : false;
          return matchName || matchMgr;
        }
        return true;
      });

      const districtCount = subUnits.filter((u) => u.type === 'DISTRICT').length;
      const wardCount = subUnits.filter((u) => u.type === 'WARD' || u.type === 'COMMUNE' || u.type === 'TOWN').length;

      return (
        <div className="sos-views-container sos-light-view administrative-areas-container">
          {/* THANH BREADCRUMB ĐIỀU HƯỚNG */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px' }}>
              <button
                type="button"
                onClick={handleBackToProvinces}
                className="sos-btn-refresh"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px' }}
              >
                <ArrowLeft size={15} />
                <span>Quay lại Danh sách Tỉnh / Thành</span>
              </button>
              <span style={{ color: '#64748b' }}>/</span>
              <span style={{ color: '#64748b' }}>Toàn Quốc</span>
              <span style={{ color: '#64748b' }}>/</span>
              <strong style={{ color: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700 }}>
                <Building2 size={15} color="#0284c7" />
                {selectedProvince.name}
              </strong>
            </div>

            <span className="sos-badge active" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
              KHẢ DỤNG HỆ THỐNG
            </span>
          </div>



          {/* BẢNG DANH MỤC XÃ PHƯỜNG / QUẬN HUYỆN CỦA TỈNH */}
          <div className="sos-view-card administrative-areas-card">
            <div className="sos-view-card-header">
              <div className="sos-view-card-title">
                <Building2 size={18} color="#0284c7" />
                <span>Danh Mục Đơn Vị Trực Thuộc: {selectedProvince.name} ({filteredSubUnits.length}/{subUnits.length} đơn vị)</span>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Nút lọc nhanh dạng Pill theo trạng thái quản lý & phân cấp */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`sos-btn-filter-pill ${subUnitManagerFilter === 'ALL' && subUnitTypeFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => {
                      setSubUnitManagerFilter('ALL');
                      setSubUnitTypeFilter('ALL');
                    }}
                  >
                    Tất cả ({subUnits.length})
                  </button>
                  <button
                    type="button"
                    className={`sos-btn-filter-pill ${subUnitManagerFilter === 'MANAGED' ? 'active-green' : ''}`}
                    onClick={() => setSubUnitManagerFilter(subUnitManagerFilter === 'MANAGED' ? 'ALL' : 'MANAGED')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <UserCheck size={13} />
                    <span>Đã có quản lý ({managedCount})</span>
                  </button>
                  <button
                    type="button"
                    className={`sos-btn-filter-pill ${subUnitManagerFilter === 'UNMANAGED' ? 'active-red' : ''}`}
                    onClick={() => setSubUnitManagerFilter(subUnitManagerFilter === 'UNMANAGED' ? 'ALL' : 'UNMANAGED')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <UserX size={13} />
                    <span>Chưa có quản lý ({unmanagedCount})</span>
                  </button>
                  <button
                    type="button"
                    className={`sos-btn-filter-pill ${subUnitTypeFilter === 'DISTRICT' ? 'active-yellow' : ''}`}
                    onClick={() => setSubUnitTypeFilter(subUnitTypeFilter === 'DISTRICT' ? 'ALL' : 'DISTRICT')}
                  >
                    Quận / Huyện ({districtCount})
                  </button>
                  <button
                    type="button"
                    className={`sos-btn-filter-pill ${subUnitTypeFilter === 'WARD' ? 'active-blue' : ''}`}
                    onClick={() => setSubUnitTypeFilter(subUnitTypeFilter === 'WARD' ? 'ALL' : 'WARD')}
                  >
                    Phường / Xã ({wardCount})
                  </button>
                </div>

                {/* Thanh tìm kiếm */}
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input
                    type="text"
                    placeholder={`Tìm đơn vị hoặc cán bộ phụ trách...`}
                    value={subUnitSearchQuery}
                    onChange={(e) => setSubUnitSearchQuery(e.target.value)}
                    style={{
                      padding: '7px 14px 7px 32px',
                      borderRadius: '20px',
                      fontSize: '12.5px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#0f172a',
                      outline: 'none',
                      minWidth: '240px',
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="sos-table-wrapper administrative-areas-table-wrapper">
              <table className="sos-table">
                <thead>
                  <tr>
                    <th style={{ width: '28%' }}>Tên đơn vị (Xã/Phường/Quận/Huyện)</th>
                    <th style={{ width: '15%' }}>Mã định danh tác chiến</th>
                    <th style={{ width: '13%' }}>Cấp hành chính</th>
                    <th style={{ width: '32%' }}>Địa phương quản lý</th>
                    <th style={{ width: '12%', textAlign: 'center' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {subUnitsLoading ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#0284c7' }} />
                        Đang kết nối API bản đồ mới để tải các xã, phường của {selectedProvince.name}...
                      </td>
                    </tr>
                  ) : filteredSubUnits.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        Không có đơn vị nào phù hợp với bộ lọc tìm kiếm.
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
                        if (u.name.startsWith('Quận')) typeLabel = 'Quận';
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: '6px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  background: isDistrict
                                    ? 'rgba(217, 119, 6, 0.1)'
                                    : isCommune
                                    ? 'rgba(2, 132, 199, 0.1)'
                                    : 'rgba(22, 163, 74, 0.1)',
                                  color: isDistrict ? '#d97706' : isCommune ? '#0284c7' : '#16a34a',
                                }}
                              >
                                {isDistrict ? (
                                  <Building2 size={15} />
                                ) : isCommune ? (
                                  <Globe2 size={15} />
                                ) : (
                                  <Home size={15} />
                                )}
                              </div>
                              <span
                                style={{
                                  color: '#0f172a',
                                  fontSize: '13.5px',
                                  fontWeight: 600,
                                }}
                              >
                                {u.name}
                              </span>
                            </div>
                          </td>
                          <td>
                            <code
                              style={{
                                background: '#f8fafc',
                                padding: '3px 8px',
                                borderRadius: '5px',
                                fontSize: '12px',
                                color: '#0369a1',
                                border: '1px solid #e2e8f0',
                                fontWeight: 600,
                                letterSpacing: '0.3px',
                              }}
                            >
                              {u.code}
                            </code>
                          </td>
                          <td>
                            <span
                              className={`sos-badge ${typeBadgeClass}`}
                              style={{ fontSize: '11.5px', padding: '3px 8px', fontWeight: 600 }}
                            >
                              {typeLabel}
                            </span>
                          </td>
                          <td>
                            {mgr ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
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
                                    }}
                                  >
                                    <CheckCircle2 size={10} color="#15803d" />
                                    Đã có quản lý
                                  </span>
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>{mgr.position || mgr.department || 'Cán bộ phụ trách'}</span>
                                  {mgr.phone && (
                                    <span style={{ color: '#0284c7', fontWeight: 600 }}>
                                      • {mgr.phone}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
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
                                gap: '5px',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                color: '#16a34a',
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                padding: '3px 8px',
                                borderRadius: '12px',
                              }}
                            >
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a' }} />
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
    }

    // TẦNG 1: DANH MỤC CÁC TỈNH / THÀNH PHỐ VIỆT NAM (CHUẨN 34 TỈNH THÀNH MỚI)
    const filteredProvinces = vietnamProvinces.filter((p) => {
      const mgr = getProvinceManager(p);
      if (provinceManagerFilter === 'MANAGED' && !mgr) return false;
      if (provinceManagerFilter === 'UNMANAGED' && mgr) return false;
      if (!provinceSearchQuery.trim()) return true;
      const q = provinceSearchQuery.toLowerCase();
      return (p.name || '').toLowerCase().includes(q) || (p.ref || '').toLowerCase().includes(q) || (p.isoCode || '').toLowerCase().includes(q);
    });


    return (
      <div className="sos-views-container sos-light-view administrative-areas-container">


        <div className="sos-view-card administrative-areas-card">
          <div className="sos-view-card-header">
            <div>
              <div className="sos-view-card-title">
                <Globe2 size={18} color="#0284c7" />
                <span>Danh Mục Tỉnh / Thành Phố Việt Nam ({filteredProvinces.length}/{vietnamProvinces.length} đơn vị cấp tỉnh)</span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                Nhấn vào từng Tỉnh / Thành phố để xem danh sách các Quận, Huyện, Xã, Phường trực thuộc
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Bộ lọc cán bộ quản lý cấp tỉnh */}
              <div className="sos-filter-tabs" style={{ marginBottom: 0 }}>
                <button
                  type="button"
                  className={`sos-btn-filter-pill ${provinceManagerFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setProvinceManagerFilter('ALL')}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  className={`sos-btn-filter-pill ${provinceManagerFilter === 'MANAGED' ? 'active-green' : ''}`}
                  onClick={() => setProvinceManagerFilter('MANAGED')}
                >
                  Đã có cán bộ
                </button>
                <button
                  type="button"
                  className={`sos-btn-filter-pill ${provinceManagerFilter === 'UNMANAGED' ? 'active-yellow' : ''}`}
                  onClick={() => setProvinceManagerFilter('UNMANAGED')}
                >
                  Chưa phân công
                </button>
              </div>

              {/* Thanh tìm kiếm tỉnh thành */}
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  type="text"
                  placeholder="Tìm tỉnh, thành phố (Hà Nội, Đà Nẵng, TP.HCM...)"
                  value={provinceSearchQuery}
                  onChange={(e) => setProvinceSearchQuery(e.target.value)}
                  style={{
                    padding: '7px 14px 7px 32px',
                    borderRadius: '20px',
                    fontSize: '12.5px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    outline: 'none',
                    minWidth: '280px',
                  }}
                />
              </div>

              <button
                onClick={() => {
                  try {
                    localStorage.removeItem('rescuesos_vietnam_34_provinces_v2');
                    localStorage.removeItem('rescuesos_vietnam_provinces_cache_v4');
                    localStorage.removeItem('rescuesos_vietnam_provinces_cache_v3');
                    localStorage.removeItem('rescuesos_vietnam_provinces_cache_v2');
                    localStorage.removeItem('rescuesos_vietnam_provinces_cache_v1');
                  } catch {}
                  setRefreshIndex((p) => p + 1);
                }}
                className="sos-btn-refresh"
              >
                <RefreshCw size={14} className={provincesLoading ? 'animate-spin' : ''} />
                <span>Làm mới</span>
              </button>
            </div>
          </div>

          <div className="sos-table-wrapper administrative-areas-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Tên Tỉnh / Thành Phố</th>
                  <th style={{ width: '22%' }}>Mã ISO / Ký hiệu</th>
                  <th style={{ width: '20%' }}>Cấp hành chính</th>
                  <th style={{ width: '18%', textAlign: 'center' }}>Thao tác phân cấp</th>
                </tr>
              </thead>
              <tbody>
                {provincesLoading && filteredProvinces.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                      <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#0284c7' }} />
                      Đang đồng bộ danh mục các Tỉnh / Thành phố Việt Nam từ API bản đồ...
                    </td>
                  </tr>
                ) : filteredProvinces.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                      Không tìm thấy Tỉnh / Thành phố nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredProvinces.map((prov) => {
                    const isTWCity =
                      prov.name.toLowerCase().includes('thành phố') ||
                      prov.name.toLowerCase().includes('tp');

                    return (
                      <tr
                        key={prov.id}
                        onClick={() => handleSelectProvince(prov)}
                        style={{ cursor: 'pointer', height: '54px' }}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                background: isTWCity ? 'rgba(2, 132, 199, 0.1)' : 'rgba(124, 58, 237, 0.1)',
                                color: isTWCity ? '#0284c7' : '#7c3aed',
                              }}
                            >
                              <Globe2 size={15} />
                            </div>
                            <span style={{ color: '#0f172a', fontSize: '13.5px', fontWeight: 600 }}>
                              {prov.name}
                            </span>
                          </div>
                        </td>
                        <td>
                          <code
                            style={{
                              background: '#f8fafc',
                              padding: '3px 8px',
                              borderRadius: '5px',
                              fontSize: '12px',
                              color: '#0369a1',
                              border: '1px solid #e2e8f0',
                              fontWeight: 600,
                              letterSpacing: '0.3px',
                            }}
                          >
                            {prov.isoCode || prov.ref || 'VN-PROV'}
                          </code>
                        </td>
                        <td>
                          <span
                            className={`sos-badge ${isTWCity ? 'verified' : 'default'}`}
                            style={{ fontSize: '11.5px', padding: '3px 8px', fontWeight: 600 }}
                          >
                            {isTWCity ? 'Thành phố TW' : 'Tỉnh'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectProvince(prov);
                            }}
                            className="sos-btn-filter-pill active-blue"
                            style={{ fontSize: '12px', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <span>Xem Xã Phường</span>
                            <ChevronRight size={13} />
                          </button>
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

import React, { useState, useEffect, useCallback } from 'react';
import {
  Map as MapIcon,
  Search,
  Phone,
  Mail,
  MapPin,
  Building2,
  Lock,
  CheckCircle2,
  X,
  RefreshCw,
  Edit,
  UserPlus,
  Unlock,
  Loader2,
  Check
} from 'lucide-react';
import type { User } from '@/types/auth';
import type { AuthorityOrgItem, AdministrativeAreaItem } from '@/types/dashboard';
import {
  fetchAdminUsers,
  fetchAuthorityOrganizations,
  createAdminUser,
  updateAdminUser,
  updateUserStatus,
  fetchAdministrativeAreas,
} from '@/api';
import {
  VIETNAM_34_PROVINCES_STANDARD,
  fetchVietnamProvincesService,
  fetchProvinceSubUnitsService,
} from '@/services/geoapifyBoundariesService';
import { DANANG_ADMIN_AREAS } from '@/constants';
import { AreaPreviewMap, getAreaCoordinates } from './AreaPreviewMap';

export interface AuthoritiesViewProps {
  user?: User;
  onOpenMap?: (sosId?: any) => void;
  areas?: AdministrativeAreaItem[];
}

function generateRandomPassword(length = 10) {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghjkmnpqrstuvwxyz';
  const numbers = '23456789';
  const specials = '!@$*._';
  const all = uppers + lowers + numbers + specials;
  let pwd = '';
  pwd += uppers[Math.floor(Math.random() * uppers.length)];
  pwd += lowers[Math.floor(Math.random() * lowers.length)];
  pwd += numbers[Math.floor(Math.random() * numbers.length)];
  pwd += specials[Math.floor(Math.random() * specials.length)];
  for (let i = 4; i < Math.max(8, length); i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }
  return pwd.split('').sort(() => 0.5 - Math.random()).join('');
}

export const AuthoritiesView: React.FC<AuthoritiesViewProps> = ({
  user: _user,
  areas: propAreas = [],
}) => {
  const [authorities, setAuthorities] = useState<any[]>([]);
  const [, setOrgs] = useState<AuthorityOrgItem[]>([]);
  const [_areas, setAreas] = useState<AdministrativeAreaItem[]>(propAreas);
  const [loading, setLoading] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refreshData = () => setRefreshIndex((prev) => prev + 1);
  const [vietnamProvinces, setVietnamProvinces] = useState<any[]>(VIETNAM_34_PROVINCES_STANDARD);

  const [showCreateAuthModal, setShowCreateAuthModal] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authSubmitError, setAuthSubmitError] = useState<string | null>(null);
  const [_authSubmitSuccess, setAuthSubmitSuccess] = useState<string | null>(null);
  const [createdOfficerSuccess, setCreatedOfficerSuccess] = useState<{
    fullName: string;
    phone: string;
    email: string;
    areaName: string;
    city: string;
  } | null>(null);
  const [selectedMapOfficer, setSelectedMapOfficer] = useState<any | null>(null);
  const [createAuthForm, setCreateAuthForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    password: generateRandomPassword(10),
    city: 'Thành phố Đà Nẵng',
    areaId: 'area-htd',
    areaName: 'Phường Hòa Cường',
  });

  // State danh mục đơn vị hành chính con (xã/phường) theo tỉnh được chọn trong Modal
  const [modalProvinceSubUnits, setModalProvinceSubUnits] = useState<Array<{ id: string; name: string; district?: string }>>(DANANG_ADMIN_AREAS);
  const [modalSubUnitsLoading, setModalSubUnitsLoading] = useState(false);

  // State bộ lọc danh sách Cán bộ địa phương
  const [authSearchQuery, setAuthSearchQuery] = useState('');
  const [authStatusFilter, setAuthStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // State phục vụ modal chỉnh sửa Cán bộ & thay đổi địa bàn quản lý
  const [editingAuthority, setEditingAuthority] = useState<any | null>(null);
  const [editAuthSubmitting, setEditAuthSubmitting] = useState(false);
  const [editAuthError, setEditAuthError] = useState<string | null>(null);
  const [editAuthSuccess, setEditAuthSuccess] = useState<string | null>(null);
  const [editAuthForm, setEditAuthForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    status: 'ACTIVE',
    areaId: '',
    areaName: '',
    department: '',
    position: '',
    password: '',
  });


  // Tải danh sách cán bộ, tổ chức, và danh mục tỉnh thành
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [usersRes, orgsRes, areasRes, provRes] = await Promise.all([
          fetchAdminUsers({ role: 'LOCAL_AUTHORITY' }),
          fetchAuthorityOrganizations(),
          propAreas.length === 0 ? fetchAdministrativeAreas() : Promise.resolve(null),
          fetchVietnamProvincesService(),
        ]);
        if (!isMounted) return;
        if (usersRes.success && usersRes.data?.users) {
          setAuthorities(usersRes.data.users);
        }
        if (orgsRes.success && Array.isArray(orgsRes.data)) {
          setOrgs(orgsRes.data);
        }
        if (areasRes && areasRes.success && Array.isArray(areasRes.data)) {
          setAreas(areasRes.data);
        }
        if (provRes && provRes.length > 0) {
          setVietnamProvinces(provRes);
        }
      } catch (e) {
        console.warn('Lỗi tải dữ liệu cán bộ:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [propAreas, refreshIndex]);

  const loadSubUnitsForCity = useCallback(
    async (cityName: string) => {
      setModalSubUnitsLoading(true);
      try {
        const provList = vietnamProvinces.length > 0 ? vietnamProvinces : VIETNAM_34_PROVINCES_STANDARD;
        const matchedProv = provList.find(
          (p: any) =>
            p.name.toLowerCase() === cityName.toLowerCase() ||
            cityName.toLowerCase().includes(p.name.toLowerCase()) ||
            p.name.toLowerCase().includes(cityName.toLowerCase())
        );

        const provCode = matchedProv?.code || (matchedProv as any)?.code || 48;
        const provPlaceId = (matchedProv as any)?.placeId || `prov-${provCode}`;

        const units = await fetchProvinceSubUnitsService(provPlaceId, cityName, provCode);
        if (units && units.length > 0) {
          const mapped = units.map((u) => ({
            id: u.id || u.code,
            name: u.name,
            district: u.parentName || cityName,
          }));
          setModalProvinceSubUnits(mapped);
          return mapped;
        }
      } catch (err) {
        console.warn('Lỗi tải danh mục đơn vị cho tỉnh', cityName, err);
      } finally {
        setModalSubUnitsLoading(false);
      }
      if (cityName.includes('Đà Nẵng')) {
        setModalProvinceSubUnits(DANANG_ADMIN_AREAS);
        return DANANG_ADMIN_AREAS;
      }
      return [];
    },
    [vietnamProvinces]
  );

  // Xử lý khi admin đổi Tỉnh / Thành phố trong form tạo tài khoản
  const handleCityChange = async (newCity: string) => {
    setCreateAuthForm((prev) => ({
      ...prev,
      city: newCity,
    }));
    const units = await loadSubUnitsForCity(newCity);
    if (units && units.length > 0) {
      const firstArea = units[0];
      setCreateAuthForm((prev) => ({
        ...prev,
        city: newCity,
        areaId: firstArea.id,
        areaName: firstArea.name,
      }));
    } else {
      setCreateAuthForm((prev) => ({
        ...prev,
        city: newCity,
        areaId: `area-${Date.now()}`,
        areaName: `Khu vực Trung Tâm (${newCity})`,
      }));
    }
  };

  // Hành động 8: Tạo tài khoản Cán bộ địa phương (LOCAL_AUTHORITY) gán địa bàn quản lý
  const handleCreateAuthorityUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthSubmitError(null);
    setAuthSubmitSuccess(null);
    try {
      const currentCityAreas = modalProvinceSubUnits.length > 0 ? modalProvinceSubUnits : DANANG_ADMIN_AREAS;
      const selectedArea = currentCityAreas.find((a) => a.id === createAuthForm.areaId);
      const areaName = selectedArea ? selectedArea.name : createAuthForm.areaName;

      const payload = {
        fullName: createAuthForm.fullName.trim(),
        phone: createAuthForm.phone.trim(),
        email: createAuthForm.email.trim(),
        password: createAuthForm.password.trim() || '123456',
        role: 'LOCAL_AUTHORITY',
        areaId: createAuthForm.areaId,
        areaName: areaName,
        city: createAuthForm.city,
        position: 'Chỉ Huy Trực Ban Tác Chiến',
        department: `Ban Chỉ Huy PCTT ${areaName} (${createAuthForm.city})`,
      };

      const res = await createAdminUser(payload);
      if (res.success) {
        setShowCreateAuthModal(false);
        setAuthSubmitError(null);
        setAuthSubmitSuccess(null);
        refreshData();
        setCreatedOfficerSuccess({
          fullName: payload.fullName,
          phone: payload.phone,
          email: payload.email,
          areaName: areaName,
          city: createAuthForm.city,
        });
        const nextArea = currentCityAreas.find((a) => a.id !== payload.areaId) || currentCityAreas[0];
        setCreateAuthForm((prev) => ({
          ...prev,
          fullName: '',
          phone: '',
          email: '',
          password: generateRandomPassword(10),
          areaId: nextArea?.id || 'area-default',
          areaName: nextArea?.name || 'Khu vực quản lý',
        }));
      } else {
        setAuthSubmitError(res.message || 'Không thể tạo tài khoản cán bộ.');
      }
    } catch (err: any) {
      setAuthSubmitError(err?.message || 'Lỗi kết nối khi gửi yêu cầu tạo tài khoản.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Hành động 8b: Chỉnh sửa Cán bộ & thay đổi địa bàn quản lý
  const handleOpenEditAuthority = (a: any) => {
    setEditingAuthority(a);
    setEditAuthError(null);
    setEditAuthSuccess(null);
    setEditAuthForm({
      fullName: a.fullName || '',
      phone: a.phone || '',
      email: a.email || '',
      status: a.status || 'ACTIVE',
      areaId: String(a.authority?.areaId || ''),
      areaName: a.authority?.areaName || '',
      department: a.authority?.department || '',
      position: a.authority?.position || 'Chỉ Huy Trực Ban Tác Chiến',
      password: '',
    });
  };

  const handleEditAuthoritySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAuthority) return;
    setEditAuthSubmitting(true);
    setEditAuthError(null);
    setEditAuthSuccess(null);
    try {
      const selectedArea = DANANG_ADMIN_AREAS.find((ar) => ar.id === editAuthForm.areaId);
      const finalAreaName = selectedArea ? selectedArea.name : editAuthForm.areaName;

      const payload: any = {
        fullName: editAuthForm.fullName.trim(),
        phone: editAuthForm.phone.trim(),
        email: editAuthForm.email.trim(),
        status: editAuthForm.status,
        authority: {
          areaId: editAuthForm.areaId,
          areaName: finalAreaName,
          department: editAuthForm.department.trim() || `Ban Chỉ Huy PCTT ${finalAreaName}`,
          position: editAuthForm.position.trim() || 'Chỉ Huy Trực Ban Tác Chiến',
        },
      };

      if (editAuthForm.password && editAuthForm.password.trim()) {
        payload.password = editAuthForm.password.trim();
      }

      const res = await updateAdminUser(editingAuthority._id, payload);
      if (res.success) {
        setEditAuthSuccess(`✅ Đã cập nhật thông tin và địa bàn cho cán bộ ${payload.fullName} thành công!`);
        refreshData();
        setTimeout(() => {
          setEditingAuthority(null);
          setEditAuthSuccess(null);
        }, 1200);
      } else {
        setEditAuthError(res.message || 'Không thể cập nhật tài khoản cán bộ.');
      }
    } catch (err: any) {
      setEditAuthError(err?.message || 'Lỗi kết nối khi cập nhật tài khoản.');
    } finally {
      setEditAuthSubmitting(false);
    }
  };

  const handleQuickToggleAuthStatus = async (a: any) => {
    const nextStatus = a.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      setLoading(true);
      await updateUserStatus(a._id, nextStatus);
      refreshData();
    } catch (err: any) {
      alert('❌ Lỗi cập nhật trạng thái: ' + (err.message || 'Lỗi server'));
    } finally {
      setLoading(false);
    }
  };


    const activeOfficersCount = authorities.filter((a) => a.status === 'ACTIVE').length;
    const inactiveOfficersCount = authorities.length - activeOfficersCount;

    const filteredAuthorities = authorities.filter((a) => {
      if (authStatusFilter === 'ACTIVE' && a.status !== 'ACTIVE') return false;
      if (authStatusFilter === 'INACTIVE' && a.status === 'ACTIVE') return false;
      if (authSearchQuery.trim()) {
        const q = authSearchQuery.toLowerCase();
        const matchName = (a.fullName || '').toLowerCase().includes(q);
        const matchPhone = (a.phone || '').includes(q);
        const matchEmail = (a.email || '').toLowerCase().includes(q);
        const matchArea = (a.authority?.areaName || a.authority?.areaId || '').toLowerCase().includes(q);
        const matchDept = (a.authority?.department || '').toLowerCase().includes(q);
        const matchPos = (a.authority?.position || '').toLowerCase().includes(q);
        return matchName || matchPhone || matchEmail || matchArea || matchDept || matchPos;
      }
      return true;
    });

    return (
      <div className="sos-views-container sos-light-view">
        <div className="sos-view-card" style={{ border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', background: '#ffffff' }}>
          <div className="sos-view-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Building2 size={20} color="#334155" />
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                Cán Bộ &amp; Địa Bàn Phụ Trách ({authorities.length} cán bộ điều hành toàn quốc)
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '13px',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onClick={() => {
                  setAuthSubmitError(null);
                  setAuthSubmitSuccess(null);
                  setCreateAuthForm((prev) => ({
                    ...prev,
                    password: generateRandomPassword(10),
                  }));
                  setShowCreateAuthModal(true);
                  if (modalProvinceSubUnits.length === 0) {
                    loadSubUnitsForCity(createAuthForm.city || 'Thành phố Đà Nẵng');
                  }
                }}
              >
                <UserPlus size={15} />
                <span>+ Tạo Tài Khoản Cán Bộ</span>
              </button>
              <button
                type="button"
                style={{
                  backgroundColor: '#ffffff',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
                onClick={refreshData}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span>Làm mới</span>
              </button>
            </div>
          </div>

          {/* Thanh lọc nhanh trạng thái & Tìm kiếm */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'inline-flex', background: '#e2e8f0', padding: '3px', borderRadius: '8px', gap: '3px' }}>
              <button
                type="button"
                style={{
                  padding: '6px 12px',
                  fontSize: '12.5px',
                  fontWeight: authStatusFilter === 'ALL' ? 600 : 500,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: authStatusFilter === 'ALL' ? '#ffffff' : 'transparent',
                  color: authStatusFilter === 'ALL' ? '#0f172a' : '#64748b',
                  boxShadow: authStatusFilter === 'ALL' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
                onClick={() => setAuthStatusFilter('ALL')}
              >
                Tất cả ({authorities.length})
              </button>
              <button
                type="button"
                style={{
                  padding: '6px 12px',
                  fontSize: '12.5px',
                  fontWeight: authStatusFilter === 'ACTIVE' ? 600 : 500,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: authStatusFilter === 'ACTIVE' ? '#ffffff' : 'transparent',
                  color: authStatusFilter === 'ACTIVE' ? '#16a34a' : '#64748b',
                  boxShadow: authStatusFilter === 'ACTIVE' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
                onClick={() => setAuthStatusFilter('ACTIVE')}
              >
                Đang hoạt động ({activeOfficersCount})
              </button>
              <button
                type="button"
                style={{
                  padding: '6px 12px',
                  fontSize: '12.5px',
                  fontWeight: authStatusFilter === 'INACTIVE' ? 600 : 500,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: authStatusFilter === 'INACTIVE' ? '#ffffff' : 'transparent',
                  color: authStatusFilter === 'INACTIVE' ? '#dc2626' : '#64748b',
                  boxShadow: authStatusFilter === 'INACTIVE' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
                onClick={() => setAuthStatusFilter('INACTIVE')}
              >
                Tạm khóa / Ngừng ({inactiveOfficersCount})
              </button>
            </div>

            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Tìm cán bộ, SĐT, email hoặc địa bàn..."
                value={authSearchQuery}
                onChange={(e) => setAuthSearchQuery(e.target.value)}
                style={{
                  padding: '7px 14px 7px 32px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  outline: 'none',
                  minWidth: '290px',
                }}
              />
            </div>
          </div>

          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th style={{ width: '16%' }}>Họ và tên</th>
                  <th style={{ width: '19%' }}>Số điện thoại / Email</th>
                  <th style={{ width: '18%' }}>Khu vực phụ trách (Địa bàn)</th>
                  <th style={{ width: '10%', textAlign: 'center' }}>Bản đồ</th>
                  <th style={{ width: '17%' }}>Đơn vị / Cơ quan</th>
                  <th style={{ width: '12%' }}>Chức vụ</th>
                  <th style={{ width: '11%', textAlign: 'center' }}>Trạng thái</th>
                  <th style={{ width: '11%', textAlign: 'center' }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuthorities.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      {authorities.length === 0
                        ? 'Chưa có tài khoản cán bộ địa phương nào. Nhấn "+ Tạo Tài Khoản Cán Bộ" để tạo mới!'
                        : 'Không có cán bộ nào phù hợp với bộ lọc tìm kiếm.'}
                    </td>
                  </tr>
                ) : (
                  filteredAuthorities.map((a) => {
                    const areaName = a.authority?.areaName || a.authority?.areaId || 'Địa bàn phụ trách';
                    const isActive = a.status === 'ACTIVE';
                    return (
                      <tr key={a._id}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{a.fullName}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>{a.phone || '--'}</div>
                          <div style={{ color: '#64748b', fontSize: '12px' }}>{a.email || '--'}</div>
                        </td>
                        <td>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#1e293b', fontWeight: 500, fontSize: '13px' }}>
                            <MapPin size={14} color="#64748b" />
                            <span>{areaName}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedMapOfficer(a)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: '#f8fafc',
                              color: '#0369a1',
                              fontSize: '12px',
                              fontWeight: 500,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                            title={`Xem bản đồ khu vực ${areaName}`}
                          >
                            <MapIcon size={13} />
                            <span>Xem</span>
                          </button>
                        </td>
                        <td style={{ color: '#334155', fontSize: '13px' }}>{a.authority?.department || 'Ban chỉ huy PCTT'}</td>
                        <td style={{ color: '#475569', fontSize: '13px' }}>{a.authority?.position || 'Cán bộ tác chiến'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleQuickToggleAuthStatus(a)}
                            style={{
                              background: isActive ? '#f0fdf4' : '#f8fafc',
                              color: isActive ? '#15803d' : '#64748b',
                              border: `1px solid ${isActive ? '#bbf7d0' : '#e2e8f0'}`,
                              borderRadius: '6px',
                              padding: '3px 8px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              cursor: 'pointer',
                            }}
                            title="Bấm để chuyển trạng thái"
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? '#16a34a' : '#94a3b8' }} />
                            <span>{isActive ? 'HOẠT ĐỘNG' : 'TẠM KHÓA'}</span>
                          </button>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              type="button"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '5px',
                                backgroundColor: '#ffffff',
                                color: '#0369a1',
                                border: '1px solid #cbd5e1',
                                fontSize: '12px',
                                fontWeight: 500,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                cursor: 'pointer',
                              }}
                              title="Chỉnh sửa thông tin cán bộ"
                              onClick={() => handleOpenEditAuthority(a)}
                            >
                              <Edit size={12} />
                              <span>Sửa</span>
                            </button>
                            <button
                              type="button"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '5px',
                                backgroundColor: '#ffffff',
                                color: isActive ? '#b91c1c' : '#15803d',
                                border: `1px solid ${isActive ? '#fecaca' : '#bbf7d0'}`,
                                fontSize: '12px',
                                fontWeight: 500,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                cursor: 'pointer',
                              }}
                              title={isActive ? 'Khóa tài khoản cán bộ' : 'Mở khóa kích hoạt lại'}
                              onClick={() => handleQuickToggleAuthStatus(a)}
                            >
                              {isActive ? <Lock size={12} /> : <Unlock size={12} />}
                              <span>{isActive ? 'Khóa' : 'Mở'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MODAL: CHỈNH SỬA THÔNG TIN CÁN BỘ & THAY ĐỔI ĐỊA BÀN QUẢN LÝ */}
        {editingAuthority && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(5px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 125,
              padding: '20px',
            }}
          >
            <div
              className="sos-modal-card"
              style={{
                borderRadius: '14px',
                padding: '24px',
                maxWidth: '560px',
                width: '100%',
                maxHeight: '92vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 className="sos-modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '17px' }}>
                  <Edit size={20} color="#0284c7" />
                  <span>Chỉnh Sửa Cán Bộ &amp; Thay Đổi Địa Bàn</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingAuthority(null)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={20} />
                </button>
              </div>

              {editAuthError && (
                <div
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#f87171',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    marginBottom: '16px',
                  }}
                >
                  {editAuthError}
                </div>
              )}

              {editAuthSuccess && (
                <div
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#34d399',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    marginBottom: '16px',
                  }}
                >
                  {editAuthSuccess}
                </div>
              )}

              <form onSubmit={handleEditAuthoritySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                      Họ và tên cán bộ <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      className="sos-form-input"
                      placeholder="VD: Nguyễn Văn Sơn"
                      value={editAuthForm.fullName}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, fullName: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                      Số điện thoại đăng nhập <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      className="sos-form-input"
                      placeholder="VD: 0905123456"
                      value={editAuthForm.phone}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, phone: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                      Email liên hệ
                    </label>
                    <input
                      type="email"
                      className="sos-form-input"
                      placeholder="VD: officer@danang.gov.vn"
                      value={editAuthForm.email}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, email: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                      Trạng thái tài khoản <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      className="sos-form-select"
                      value={editAuthForm.status}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, status: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }}
                    >
                      <option value="ACTIVE">🟢 ACTIVE - Đang hoạt động tác chiến</option>
                      <option value="INACTIVE">🔴 INACTIVE - Tạm khóa / Ngừng điều hành</option>
                      <option value="SUSPENDED">⛔ SUSPENDED - Đình chỉ tác chiến</option>
                    </select>
                  </div>
                </div>

                {/* Thay đổi địa bàn quản lý */}
                <div>
                  <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                    Khu vực phụ trách (Thay đổi địa bàn điều phối) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    className="sos-form-select"
                    value={editAuthForm.areaId}
                    onChange={(e) => {
                      const targetId = e.target.value;
                      const match = DANANG_ADMIN_AREAS.find((a) => a.id === targetId);
                      const areaName = match ? match.name : '';
                      setEditAuthForm({
                        ...editAuthForm,
                        areaId: targetId,
                        areaName: areaName,
                        department: `Ban Chỉ Huy PCTT ${areaName}`,
                      });
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }}
                  >
                    {/* Địa bàn hiện tại */}
                    {editAuthForm.areaName && (
                      <option value={editAuthForm.areaId}>
                        ⭐ {editAuthForm.areaName} (Địa bàn hiện tại)
                      </option>
                    )}
                    {DANANG_ADMIN_AREAS
                      .filter((ar) => ar.id !== editAuthForm.areaId)
                      .map((ar: { id: string; name: string; district: string }) => (
                        <option key={ar.id} value={ar.id}>
                          {ar.name} ({ar.district})
                        </option>
                      ))}
                  </select>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    * Chọn địa bàn mới để chuyển quyền điều phối tác chiến của cán bộ này sang khu vực đó.
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                      Đơn vị / Cơ quan
                    </label>
                    <input
                      type="text"
                      className="sos-form-input"
                      value={editAuthForm.department}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, department: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                      Chức vụ
                    </label>
                    <input
                      type="text"
                      className="sos-form-input"
                      value={editAuthForm.position}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, position: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                </div>

                {/* Đổi mật khẩu mới nếu muốn */}
                <div>
                  <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                    Đặt mật khẩu mới (Bỏ trống nếu không muốn đổi mật khẩu)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      className="sos-form-input"
                      placeholder="Để trống nếu giữ nguyên mật khẩu cũ"
                      value={editAuthForm.password}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, password: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '9px 38px 9px 12px',
                        borderRadius: '6px',
                        fontFamily: editAuthForm.password ? 'monospace' : 'inherit',
                        background: '#ffffff',
                        color: '#0f172a',
                        border: '1px solid #cbd5e1',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditAuthForm((prev) => ({
                          ...prev,
                          password: generateRandomPassword(8),
                        }))
                      }
                      style={{
                        position: 'absolute',
                        right: '6px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#0284c7',
                        cursor: 'pointer',
                        padding: '5px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                      }}
                      title="Sinh mật khẩu ngẫu nhiên"
                    >
                      <RefreshCw size={15} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                  <button
                    type="button"
                    className="sos-btn-action sos-btn-refresh"
                    style={{ padding: '9px 16px', borderRadius: '6px' }}
                    onClick={() => setEditingAuthority(null)}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={editAuthSubmitting}
                    style={{
                      padding: '9px 20px',
                      borderRadius: '6px',
                      background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                      color: '#fff',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 700,
                      boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {editAuthSubmitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Đang lưu thay đổi...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Lưu Thay Đổi &amp; Cập Nhật Địa Bàn</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: TẠO TÀI KHOẢN CÁN BỘ ĐỊA PHƯƠNG & GÁN ĐỊA BÀN QUẢN LÝ */}
        {showCreateAuthModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(5px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 120,
              padding: '20px',
            }}
          >
            <div
              className="sos-modal-card"
              style={{
                borderRadius: '16px',
                padding: '28px 32px',
                maxWidth: '680px',
                width: '100%',
                maxHeight: '92vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.45)',
                border: '1px solid rgba(226, 232, 240, 0.8)',
                background: '#ffffff',
              }}
            >
              {(() => {
                const currentCityAreas = modalProvinceSubUnits.length > 0 ? modalProvinceSubUnits : DANANG_ADMIN_AREAS;
                const allProvincesList = vietnamProvinces.length > 0 ? vietnamProvinces : VIETNAM_34_PROVINCES_STANDARD;

                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: '10px',
                            background: 'rgba(16, 185, 129, 0.12)',
                            color: '#059669',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <UserPlus size={22} />
                        </div>
                        <div>
                          <h3 className="sos-modal-title" style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                            Tạo Tài Khoản Cán Bộ &amp; Gán Khu Vực Quản Lý
                          </h3>
                          <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px' }}>
                            Cấp tài khoản điều hành tác chiến theo địa bàn hành chính trên toàn quốc
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCreateAuthModal(false)}
                        style={{
                          background: '#f1f5f9',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                        }}
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {authSubmitError && (
                      <div
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#dc2626',
                          padding: '12px 16px',
                          borderRadius: '10px',
                          fontSize: '13px',
                          marginBottom: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <span>{authSubmitError}</span>
                      </div>
                    )}


                    <form onSubmit={handleCreateAuthorityUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* PHẦN 1: THÔNG TIN TÀI KHOẢN CÁN BỘ */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#334155', letterSpacing: '0.5px' }}>
                          1. Thông Tin Tài Khoản Đăng Nhập
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                          <div>
                            <label className="sos-form-label" style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', marginBottom: '6px', color: '#1e293b' }}>
                              Họ và tên cán bộ <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                              type="text"
                              required
                              className="sos-form-input"
                              placeholder="VD: Nguyễn Văn Thắng"
                              value={createAuthForm.fullName}
                              onChange={(e) => setCreateAuthForm({ ...createAuthForm, fullName: e.target.value })}
                              style={{
                                width: '100%',
                                padding: '10px 14px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                background: '#ffffff',
                                color: '#0f172a',
                                border: '1px solid #cbd5e1',
                              }}
                            />
                          </div>
                          <div>
                            <label className="sos-form-label" style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', marginBottom: '6px', color: '#1e293b' }}>
                              Số điện thoại đăng nhập <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                              type="tel"
                              required
                              className="sos-form-input"
                              placeholder="VD: 0905123456"
                              value={createAuthForm.phone}
                              onChange={(e) => setCreateAuthForm({ ...createAuthForm, phone: e.target.value })}
                              style={{
                                width: '100%',
                                padding: '10px 14px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                background: '#ffffff',
                                color: '#0f172a',
                                border: '1px solid #cbd5e1',
                              }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                          <div>
                            <label className="sos-form-label" style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', marginBottom: '6px', color: '#1e293b' }}>
                              Email liên hệ <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                              type="email"
                              required
                              className="sos-form-input"
                              placeholder="VD: thang.nguyen@danang.gov.vn"
                              value={createAuthForm.email}
                              onChange={(e) => setCreateAuthForm({ ...createAuthForm, email: e.target.value })}
                              style={{
                                width: '100%',
                                padding: '10px 14px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                background: '#ffffff',
                                color: '#0f172a',
                                border: '1px solid #cbd5e1',
                              }}
                            />
                          </div>
                          <div>
                            <label className="sos-form-label" style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', marginBottom: '6px', color: '#1e293b' }}>
                              Mật khẩu khởi tạo
                            </label>
                            <div style={{ position: 'relative' }}>
                              <input
                                type="text"
                                required
                                className="sos-form-input"
                                placeholder="Mật khẩu ngẫu nhiên"
                                value={createAuthForm.password}
                                onChange={(e) => setCreateAuthForm({ ...createAuthForm, password: e.target.value })}
                                style={{
                                  width: '100%',
                                  padding: '10px 42px 10px 14px',
                                  borderRadius: '8px',
                                  fontFamily: 'monospace',
                                  fontWeight: 600,
                                  fontSize: '13.5px',
                                  letterSpacing: '0.8px',
                                  color: '#0f172a',
                                  backgroundColor: '#ffffff',
                                  border: '1px solid #cbd5e1',
                                }}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setCreateAuthForm((prev) => ({
                                    ...prev,
                                    password: generateRandomPassword(8),
                                  }))
                                }
                                style={{
                                  position: 'absolute',
                                  right: '6px',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  background: 'none',
                                  border: 'none',
                                  color: '#64748b',
                                  cursor: 'pointer',
                                  padding: '6px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: '6px',
                                }}
                                title="Đổi mật khẩu ngẫu nhiên mới"
                              >
                                <RefreshCw size={15} />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div style={{ fontSize: '11.5px', color: '#64748b', fontStyle: 'italic', marginTop: '-2px' }}>
                          * Mật khẩu ngẫu nhiên kèm liên kết xác thực sẽ được tự động gửi về Email của cán bộ.
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid #e2e8f0', margin: '4px 0' }} />

                      {/* PHẦN 2: PHẠM VI ĐỊA BÀN PHÂN QUYỀN TÁC CHIẾN */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#334155', letterSpacing: '0.5px' }}>
                            2. Phạm Vi Địa Bàn Quản Lý (34 Tỉnh Thành Cả Nước)
                          </div>
                          {modalSubUnitsLoading && (
                            <span style={{ fontSize: '11.5px', color: '#0284c7', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Loader2 size={12} className="animate-spin" />
                              Đang nạp xã/phường...
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                          <div>
                            <label className="sos-form-label" style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', marginBottom: '6px', color: '#1e293b' }}>
                              Tỉnh / Thành phố <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <select
                              className="sos-form-select"
                              value={createAuthForm.city}
                              onChange={(e) => handleCityChange(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '10px 14px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                background: '#ffffff',
                                color: '#0f172a',
                                border: '1px solid #cbd5e1',
                              }}
                            >
                              {allProvincesList.map((p) => (
                                <option key={p.code || p.name} value={p.name}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="sos-form-label" style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', marginBottom: '6px', color: '#1e293b' }}>
                              Khu vực quản lý ({currentCityAreas.length} địa bàn) <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <select
                              className="sos-form-select"
                              value={createAuthForm.areaId}
                              disabled={modalSubUnitsLoading}
                              onChange={(e) => {
                                const targetId = e.target.value;
                                const match = currentCityAreas.find((a) => a.id === targetId);
                                const areaName = match ? match.name : '';
                                setCreateAuthForm({
                                  ...createAuthForm,
                                  areaId: targetId,
                                  areaName: areaName,
                                });
                              }}
                              style={{
                                width: '100%',
                                padding: '10px 14px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                background: '#ffffff',
                                color: '#0f172a',
                                border: '1px solid #cbd5e1',
                              }}
                            >
                              {currentCityAreas.length === 0 ? (
                                <option value="" disabled>
                                  Không có dữ liệu khu vực tại {createAuthForm.city}
                                </option>
                              ) : (
                                currentCityAreas.map((ar) => {
                                  const officersInArea = authorities.filter((a: any) => {
                                    const authAreaId = String(a.authority?.areaId || '').trim();
                                    const authAreaName = String(a.authority?.areaName || '').trim().toLowerCase();
                                    const cleanAuthName = authAreaName.replace(/^(Phường|Xã|Quận|Huyện|Thị trấn)\s+/i, '').trim();
                                    const cleanArName = ar.name.replace(/^(Phường|Xã|Quận|Huyện|Thị trấn)\s+/i, '').trim().toLowerCase();
                                    return authAreaId === ar.id || authAreaName === ar.name.toLowerCase() || (cleanAuthName && cleanAuthName === cleanArName);
                                  });
                                  const count = officersInArea.length;
                                  return (
                                    <option key={ar.id} value={ar.id}>
                                      {ar.name} {ar.district ? `(${ar.district})` : ''} {count > 0 ? `• [Hiện có ${count} cán bộ]` : ''}
                                    </option>
                                  );
                                })
                              )}
                            </select>
                          </div>
                        </div>

                        <div style={{ fontSize: '11.5px', color: '#64748b', fontStyle: 'italic', marginTop: '-2px' }}>
                          * Một khu vực / phường xã có thể phân bổ nhiều cán bộ điều phối cùng tham gia trực ban và tác chiến.
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                        <button
                          type="button"
                          className="sos-btn-action"
                          style={{
                            padding: '10px 18px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            background: '#f8fafc',
                            color: '#475569',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          onClick={() => setShowCreateAuthModal(false)}
                        >
                          Hủy
                        </button>
                        <button
                          type="submit"
                          disabled={authSubmitting || modalSubUnitsLoading}
                          style={{
                            padding: '10px 22px',
                            borderRadius: '8px',
                            background: '#0284c7',
                            color: '#ffffff',
                            border: 'none',
                            cursor: authSubmitting ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            fontSize: '13px',
                            boxShadow: '0 1px 3px rgba(2, 132, 199, 0.25)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '7px',
                          }}
                        >
                          {authSubmitting ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              <span>Đang tạo tài khoản...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={16} />
                              <span>Tạo Tài Khoản &amp; Gán Địa Bàn</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* MODAL: THÔNG BÁO TẠO TÀI KHOẢN CÁN BỘ THÀNH CÔNG */}
        {createdOfficerSuccess && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 130,
              padding: '20px',
            }}
            onClick={() => setCreatedOfficerSuccess(null)}
          >
            <div
              className="sos-modal-card"
              style={{
                borderRadius: '14px',
                padding: '28px 24px',
                maxWidth: '430px',
                width: '100%',
                background: '#ffffff',
                boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.2)',
                border: '1px solid #e2e8f0',
                textAlign: 'center',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <Check size={24} strokeWidth={2.5} />
              </div>

              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>
                Tạo tài khoản thành công
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px', lineHeight: 1.5 }}>
                Tài khoản điều phối tác chiến đã được khởi tạo và sẵn sàng tham gia trực ban.
              </p>

              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  color: '#334155',
                  marginBottom: '18px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#64748b' }}>Cán bộ:</span>
                  <strong style={{ color: '#0f172a' }}>{createdOfficerSuccess.fullName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#64748b' }}>Số điện thoại:</span>
                  <strong style={{ color: '#0f172a' }}>{createdOfficerSuccess.phone}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#64748b' }}>Địa bàn:</span>
                  <strong style={{ color: '#0284c7' }}>{createdOfficerSuccess.areaName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #e2e8f0', paddingTop: '8px', marginTop: '6px' }}>
                  <span style={{ color: '#64748b' }}>Email tiếp nhận:</span>
                  <span style={{ color: '#0f172a', fontWeight: 500 }}>{createdOfficerSuccess.email}</span>
                </div>
              </div>

              <p style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', margin: '0 0 22px', lineHeight: 1.5 }}>
                * Mật khẩu khởi tạo và liên kết kích hoạt đã được gửi tự động đến email của cán bộ.
              </p>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#475569',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setCreatedOfficerSuccess(null);
                    setShowCreateAuthModal(true);
                  }}
                >
                  Tạo tiếp tài khoản khác
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#0284c7',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(2, 132, 199, 0.25)',
                  }}
                  onClick={() => setCreatedOfficerSuccess(null)}
                >
                  Hoàn tất
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL POPUP: XEM BẢN ĐỒ KHU VỰC ĐỊA BÀN PHỤ TRÁCH */}
        {selectedMapOfficer && (() => {
          const officerArea = selectedMapOfficer.authority?.areaName || selectedMapOfficer.authority?.areaId || 'Địa bàn phụ trách';
          const officerDept = selectedMapOfficer.authority?.department || '';
          const coords = getAreaCoordinates(officerArea, officerDept);
          const isOfficerActive = selectedMapOfficer.status === 'ACTIVE';

          return (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.5)',
                backdropFilter: 'blur(3px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '16px',
              }}
              onClick={() => setSelectedMapOfficer(null)}
            >
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  width: '100%',
                  maxWidth: '840px',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
                  overflow: 'hidden',
                  border: '1px solid #cbd5e1',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 20px',
                    borderBottom: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <MapIcon size={20} color="#0284c7" />
                    <div>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                        Bản đồ địa bàn phụ trách
                      </h4>
                      <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                        {officerArea}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#475569',
                      cursor: 'pointer',
                      padding: '6px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="Đóng cửa sổ bản đồ"
                    onClick={() => setSelectedMapOfficer(null)}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Modal Body */}
                <div style={{ padding: '18px 20px' }}>
                  {/* Map container - Chiều cao mở rộng cho tầm nhìn bao quát */}
                  <div style={{ height: '380px', width: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid #cbd5e1', marginBottom: '14px' }}>
                    <AreaPreviewMap
                      lat={coords.lat}
                      lng={coords.lng}
                      areaName={officerArea}
                      areaId={selectedMapOfficer.authority?.areaId}
                      department={officerDept}
                    />
                  </div>

                  {/* Thông tin cơ bản */}
                  {/* Thẻ thông tin cán bộ phụ trách địa bàn */}
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      padding: '14px 18px',
                      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                    }}
                  >
                    {/* Hàng trên: Cán bộ, Chức vụ, Đơn vị & Trạng thái */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: '50%',
                            background: '#e0f2fe',
                            color: '#0369a1',
                            fontWeight: 700,
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            border: '1px solid #bae6fd',
                          }}
                        >
                          {(selectedMapOfficer.fullName || 'CB').slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h5 style={{ margin: 0, fontSize: '14.5px', fontWeight: 700, color: '#0f172a' }}>
                              {selectedMapOfficer.fullName}
                            </h5>
                            {selectedMapOfficer.authority?.position && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  color: '#0369a1',
                                  background: '#f0f9ff',
                                  border: '1px solid #e0f2fe',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                }}
                              >
                                {selectedMapOfficer.authority.position}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            {selectedMapOfficer.authority?.department || 'Ban Chỉ Huy PCTT'}
                          </div>
                        </div>
                      </div>

                      {/* Trạng thái hoạt động */}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          background: isOfficerActive ? '#dcfce7' : '#f1f5f9',
                          color: isOfficerActive ? '#15803d' : '#64748b',
                          border: `1px solid ${isOfficerActive ? '#bbf7d0' : '#e2e8f0'}`,
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: isOfficerActive ? '#16a34a' : '#94a3b8' }} />
                        {isOfficerActive ? 'Đang hoạt động' : 'Tạm dừng / Khóa'}
                      </span>
                    </div>

                    {/* Đường phân cách */}
                    <div style={{ height: '1px', background: '#f1f5f9', margin: '12px 0 10px 0' }} />

                    {/* Hàng dưới: Liên hệ & Địa bàn */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '12px',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Phone size={13} color="#0284c7" />
                        </div>
                        <div>
                          <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Điện thoại</span>
                          <span style={{ color: '#0f172a', fontWeight: 600 }}>{selectedMapOfficer.phone || '--'}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Mail size={13} color="#0284c7" />
                        </div>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                          <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Email</span>
                          <span
                            style={{
                              color: '#334155',
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={selectedMapOfficer.email || '--'}
                          >
                            {selectedMapOfficer.email || '--'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <MapPin size={13} color="#0284c7" />
                        </div>
                        <div>
                          <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Địa bàn quản lý</span>
                          <span style={{ color: '#0f172a', fontWeight: 600 }}>{officerArea}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
};

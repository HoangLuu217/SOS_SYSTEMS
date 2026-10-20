import React, { useState, useEffect, useCallback } from 'react';
import {
  Map as MapIcon,
  Search,
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
  Check,
  Phone,
  Mail,
  Briefcase,
  ShieldCheck,
  Calendar,
  Navigation,
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
import { AreaPreviewMap, getAreaCoordinates } from './AreaPreviewMap';
import '@/features/sos/SosRequestsView.css';
import './AuthoritiesView.css';

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
  const [, setAreas] = useState<AdministrativeAreaItem[]>(propAreas);
  const [loading, setLoading] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refreshData = () => setRefreshIndex((prev) => prev + 1);
  const [vietnamProvinces, setVietnamProvinces] = useState<any[]>(VIETNAM_34_PROVINCES_STANDARD);

  const [showCreateAuthModal, setShowCreateAuthModal] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authSubmitError, setAuthSubmitError] = useState<string | null>(null);
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
    areaId: '',
    areaName: '',
  });

  // Danh mục đơn vị hành chính con (xã/phường) lấy trực tiếp từ API bản đồ / CSDL thực
  const [modalProvinceSubUnits, setModalProvinceSubUnits] = useState<Array<{ id: string; name: string; district?: string }>>([]);
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
          fetchAdminUsers({ role: 'LOCAL_AUTHORITY' }).catch(() => ({ success: false, data: { users: [] } })),
          fetchAuthorityOrganizations().catch(() => ({ success: false, data: [] })),
          fetchAdministrativeAreas().catch(() => ({ success: false, data: [] })),
          fetchVietnamProvincesService().catch(() => []),
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
  }, [refreshIndex]);

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

        // Lấy danh mục địa bàn thực tế trực tiếp từ API bản đồ / CSDL
        const units = await fetchProvinceSubUnitsService(provPlaceId, cityName, provCode);
        if (units && units.length > 0) {
          const mapped = units.map((u) => ({
            id: u.id,
            name: u.name,
            district: u.parentName || (u.type === 'DISTRICT' ? 'Quận / Huyện' : 'Phường / Xã'),
          }));
          setModalProvinceSubUnits(mapped);
          if (mapped.length > 0) {
            setCreateAuthForm((prev) => ({
              ...prev,
              areaId: prev.areaId && mapped.some((m) => m.id === prev.areaId) ? prev.areaId : mapped[0].id,
              areaName: prev.areaName && mapped.some((m) => m.name === prev.areaName) ? prev.areaName : mapped[0].name,
            }));
          }
        } else {
          setModalProvinceSubUnits([]);
        }
      } catch (e) {
        console.warn('Lỗi nạp đơn vị con của tỉnh:', e);
        setModalProvinceSubUnits([]);
      } finally {
        setModalSubUnitsLoading(false);
      }
    },
    [vietnamProvinces]
  );

  // Tự động tải danh sách xã/phường thực tế của tỉnh thành được chọn ngay khi mở trang
  useEffect(() => {
    loadSubUnitsForCity(createAuthForm.city || 'Thành phố Đà Nẵng');
  }, [loadSubUnitsForCity, createAuthForm.city]);

  const handleCityChange = (cityName: string) => {
    setCreateAuthForm((prev) => ({
      ...prev,
      city: cityName,
    }));
    loadSubUnitsForCity(cityName);
  };

  const handleCreateAuthorityUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthSubmitError(null);
    try {
      const currentCityAreas = modalProvinceSubUnits;
      const selectedArea = currentCityAreas.find((a) => a.id === createAuthForm.areaId);
      const areaName = selectedArea ? selectedArea.name : createAuthForm.areaName || 'Khu vực quản lý';

      const payload: any = {
        fullName: createAuthForm.fullName.trim(),
        phone: createAuthForm.phone.trim(),
        email: createAuthForm.email.trim(),
        password: createAuthForm.password.trim(),
        role: 'LOCAL_AUTHORITY',
        status: 'ACTIVE',
        authority: {
          areaId: createAuthForm.areaId,
          areaName: areaName,
          department: `Ban Chỉ Huy PCTT ${areaName} (${createAuthForm.city})`,
          position: 'Chỉ Huy Trực Ban Tác Chiến',
        },
      };

      const res = await createAdminUser(payload);
      if (res.success) {
        setShowCreateAuthModal(false);
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
      const selectedArea = modalProvinceSubUnits.find((ar) => ar.id === editAuthForm.areaId);
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
    <div className="authorities-executive-container">
      {/* Main Table Card */}
      <div className="executive-table-card">
        {/* Filter Pills, Search Input & Create Action Row */}
        <div className="executive-table-filters-row">
          <div className="executive-triage-pills">
            <button
              type="button"
              className={`triage-btn ${authStatusFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setAuthStatusFilter('ALL')}
            >
              Tất cả ({authorities.length})
            </button>
            <button
              type="button"
              className={`triage-btn ${authStatusFilter === 'ACTIVE' ? 'active' : ''}`}
              onClick={() => setAuthStatusFilter('ACTIVE')}
            >
              Đang hoạt động ({activeOfficersCount})
            </button>
            <button
              type="button"
              className={`triage-btn ${authStatusFilter === 'INACTIVE' ? 'active' : ''}`}
              onClick={() => setAuthStatusFilter('INACTIVE')}
            >
              Tạm khóa / Ngừng ({inactiveOfficersCount})
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="executive-search-input-wrap">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                className="executive-search-input"
                placeholder="Tìm cán bộ, SĐT, email hoặc địa bàn..."
                value={authSearchQuery}
                onChange={(e) => setAuthSearchQuery(e.target.value)}
              />
              {authSearchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setAuthSearchQuery('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              type="button"
              className="coordination-action-btn primary"
              onClick={() => {
                setAuthSubmitError(null);
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
              <span>Tạo Tài Khoản Cán Bộ</span>
            </button>
          </div>
        </div>

        {/* Content Table */}
        <div className="executive-table-wrapper">
          <table className="executive-table">
            <thead>
              <tr>
                <th style={{ width: '18%', minWidth: '150px' }}>Cán bộ chỉ huy</th>
                <th style={{ width: '20%', minWidth: '160px' }}>Số điện thoại / Email</th>
                <th style={{ width: '24%', minWidth: '180px' }}>Khu vực phụ trách (Địa bàn)</th>
                <th style={{ width: '18%', minWidth: '160px' }}>Đơn vị / Cơ quan</th>
                <th style={{ width: '10%', minWidth: '105px', textAlign: 'center' }}>Trạng thái</th>
                <th style={{ width: '10%', minWidth: '115px', textAlign: 'center' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                      <Loader2 size={16} className="executive-spin" />
                      <span>Đang tải danh sách cán bộ...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredAuthorities.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                    {authorities.length === 0
                      ? 'Chưa có tài khoản cán bộ địa phương nào. Nhấn "+ Tạo Tài Khoản Cán Bộ" để tạo mới!'
                      : 'Không tìm thấy cán bộ nào phù hợp với bộ lọc tìm kiếm.'}
                  </td>
                </tr>
              ) : (
                filteredAuthorities.map((a) => {
                  const areaName = a.authority?.areaName || a.authority?.areaId || 'Địa bàn phụ trách';
                  const isActive = a.status === 'ACTIVE';

                  return (
                    <tr key={a._id}>
                      {/* Cán bộ chỉ huy (Đã xóa avatar, tên to và in đậm) */}
                      <td>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14.5px', lineHeight: 1.3 }}>
                            {a.fullName}
                          </div>
                          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                            {a.role === 'LOCAL_AUTHORITY' ? 'Chỉ huy địa phương' : a.role}
                          </span>
                        </div>
                      </td>

                      {/* SĐT / Email (SĐT in đậm, Gmail hiển thị đầy đủ không bị cắt ...) */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>
                            {a.phone || '--'}
                          </span>
                          <span
                            style={{
                              color: '#334155',
                              fontSize: '12.5px',
                              fontWeight: 500,
                              wordBreak: 'break-all',
                              lineHeight: 1.3,
                            }}
                            title={a.email}
                          >
                            {a.email || '--'}
                          </span>
                        </div>
                      </td>

                      {/* Khu vực phụ trách (Địa bàn) & Nút Xem Bản đồ tích hợp trực tiếp, không bị dính cột */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#0f172a', fontWeight: 600, fontSize: '13.5px', minWidth: 0, flex: 1 }}>
                            <MapPin size={15} color="#0284c7" style={{ flexShrink: 0 }} />
                            <span style={{ wordBreak: 'break-word', lineHeight: 1.3 }}>{areaName}</span>
                          </div>
                          <button
                            type="button"
                            className="map-preview-btn"
                            onClick={() => setSelectedMapOfficer(a)}
                            title={`Xem bản đồ địa bàn ${areaName}`}
                          >
                            <MapIcon size={12} />
                            <span>Bản đồ</span>
                          </button>
                        </div>
                      </td>

                      {/* Đơn vị / Cơ quan */}
                      <td>
                        <span style={{ color: '#1e293b', fontSize: '13px', fontWeight: 600, lineHeight: 1.35, display: 'block' }}>
                          {a.authority?.department || 'Ban chỉ huy PCTT'}
                        </span>
                      </td>

                      {/* Trạng thái */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className={`officer-status-badge ${isActive ? 'active' : 'inactive'}`}
                          onClick={() => handleQuickToggleAuthStatus(a)}
                          title="Bấm để chuyển trạng thái kích hoạt"
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: isActive ? '#16a34a' : '#94a3b8',
                            }}
                          />
                          <span>{isActive ? 'HOẠT ĐỘNG' : 'TẠM KHÓA'}</span>
                        </button>
                      </td>

                      {/* Hành động tối ưu: gọn gàng, vừa vặn không tràn khung */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="officer-action-btn edit"
                            title="Chỉnh sửa thông tin cán bộ"
                            onClick={() => handleOpenEditAuthority(a)}
                          >
                            <Edit size={12} /> <span>Sửa</span>
                          </button>
                          <button
                            type="button"
                            className={`officer-action-btn ${isActive ? 'lock' : 'unlock'}`}
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
        <div className="executive-modal-backdrop" onClick={() => setEditingAuthority(null)}>
          <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
            <div className="executive-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="metric-icon-box blue" style={{ width: 36, height: 36 }}>
                  <Edit size={20} />
                </div>
                <div>
                  <h3 className="executive-modal-title">Chỉnh Sửa Cán Bộ & Thay Đổi Địa Bàn</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                    Cán bộ: {editingAuthority.fullName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="executive-modal-close"
                onClick={() => setEditingAuthority(null)}
              >
                <X size={18} />
              </button>
            </div>

            {editAuthError && (
              <div
                style={{
                  backgroundColor: '#fee2e2',
                  border: '1px solid #fca5a5',
                  color: '#b91c1c',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  margin: '12px 24px 0',
                }}
              >
                {editAuthError}
              </div>
            )}

            {editAuthSuccess && (
              <div
                style={{
                  backgroundColor: '#dcfce7',
                  border: '1px solid #86efac',
                  color: '#15803d',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  margin: '12px 24px 0',
                }}
              >
                {editAuthSuccess}
              </div>
            )}

            <form onSubmit={handleEditAuthoritySubmit}>
              <div className="executive-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Họ và tên cán bộ (*)</label>
                    <input
                      type="text"
                      required
                      className="executive-modal-input"
                      value={editAuthForm.fullName}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, fullName: e.target.value })}
                    />
                  </div>
                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Số điện thoại đăng nhập (*)</label>
                    <input
                      type="tel"
                      required
                      className="executive-modal-input"
                      value={editAuthForm.phone}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Email liên hệ</label>
                    <input
                      type="email"
                      className="executive-modal-input"
                      value={editAuthForm.email}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, email: e.target.value })}
                    />
                  </div>
                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Trạng thái tài khoản (*)</label>
                    <select
                      className="executive-modal-select"
                      value={editAuthForm.status}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, status: e.target.value })}
                    >
                      <option value="ACTIVE">🟢 ACTIVE - Đang hoạt động tác chiến</option>
                      <option value="INACTIVE">🔴 INACTIVE - Tạm khóa / Ngừng điều hành</option>
                      <option value="SUSPENDED">⛔ SUSPENDED - Đình chỉ tác chiến</option>
                    </select>
                  </div>
                </div>

                <div className="executive-modal-field">
                  <label className="executive-modal-label">
                    Khu vực phụ trách (Thay đổi địa bàn điều phối) (*)
                  </label>
                  <select
                    className="executive-modal-select"
                    value={editAuthForm.areaId}
                    onChange={(e) => {
                      const targetId = e.target.value;
                      const match = modalProvinceSubUnits.find((a) => a.id === targetId);
                      const areaName = match ? match.name : '';
                      setEditAuthForm({
                        ...editAuthForm,
                        areaId: targetId,
                        areaName: areaName,
                        department: `Ban Chỉ Huy PCTT ${areaName}`,
                      });
                    }}
                  >
                    {editAuthForm.areaName && (
                      <option value={editAuthForm.areaId}>
                        ⭐ {editAuthForm.areaName} (Địa bàn hiện tại)
                      </option>
                    )}
                    {modalProvinceSubUnits.filter((ar) => ar.id !== editAuthForm.areaId).map((ar: any) => (
                      <option key={ar.id} value={ar.id}>
                        {ar.name} {ar.district ? `(${ar.district})` : ''}
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: 4 }}>
                    * Chọn địa bàn mới để chuyển quyền điều phối tác chiến của cán bộ này sang khu vực đó.
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Đơn vị / Cơ quan</label>
                    <input
                      type="text"
                      className="executive-modal-input"
                      value={editAuthForm.department}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, department: e.target.value })}
                    />
                  </div>
                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Chức vụ</label>
                    <input
                      type="text"
                      className="executive-modal-input"
                      value={editAuthForm.position}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, position: e.target.value })}
                    />
                  </div>
                </div>

                <div className="executive-modal-field">
                  <label className="executive-modal-label">
                    Đặt mật khẩu mới (Bỏ trống nếu không muốn đổi mật khẩu)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      className="executive-modal-input"
                      placeholder="Để trống nếu giữ nguyên mật khẩu cũ"
                      value={editAuthForm.password}
                      onChange={(e) => setEditAuthForm({ ...editAuthForm, password: e.target.value })}
                      style={{ paddingRight: 38, fontFamily: editAuthForm.password ? 'monospace' : 'inherit' }}
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
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#0284c7',
                        cursor: 'pointer',
                        padding: 4,
                      }}
                      title="Sinh mật khẩu ngẫu nhiên"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="executive-modal-footer">
                <button
                  type="button"
                  className="executive-btn-outline"
                  onClick={() => setEditingAuthority(null)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={editAuthSubmitting}
                  className="executive-btn-primary"
                >
                  {editAuthSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>Lưu Thay Đổi & Cập Nhật</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TẠO TÀI KHOẢN CÁN BỘ ĐỊA PHƯƠNG */}
      {showCreateAuthModal && (
        <div className="executive-modal-backdrop" onClick={() => setShowCreateAuthModal(false)}>
          <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 660 }}>
            {(() => {
              const currentCityAreas = modalProvinceSubUnits;
              const allProvincesList = vietnamProvinces.length > 0 ? vietnamProvinces : VIETNAM_34_PROVINCES_STANDARD;

              return (
                <>
                  <div className="executive-modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="metric-icon-box blue" style={{ width: 36, height: 36 }}>
                        <UserPlus size={20} />
                      </div>
                      <div>
                        <h3 className="executive-modal-title">Tạo Tài Khoản Cán Bộ & Gán Địa Bàn</h3>
                        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                          Cấp tài khoản điều hành tác chiến theo địa bàn hành chính trên toàn quốc
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="executive-modal-close"
                      onClick={() => setShowCreateAuthModal(false)}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {authSubmitError && (
                    <div
                      style={{
                        backgroundColor: '#fee2e2',
                        border: '1px solid #fca5a5',
                        color: '#b91c1c',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        margin: '12px 24px 0',
                      }}
                    >
                      {authSubmitError}
                    </div>
                  )}

                  <form onSubmit={handleCreateAuthorityUser}>
                    <div className="executive-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#0284c7', letterSpacing: '0.5px' }}>
                        1. Thông Tin Tài Khoản Đăng Nhập
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="executive-modal-field">
                          <label className="executive-modal-label">Họ và tên cán bộ (*)</label>
                          <input
                            type="text"
                            required
                            className="executive-modal-input"
                            placeholder="VD: Nguyễn Văn Thắng"
                            value={createAuthForm.fullName}
                            onChange={(e) => setCreateAuthForm({ ...createAuthForm, fullName: e.target.value })}
                          />
                        </div>
                        <div className="executive-modal-field">
                          <label className="executive-modal-label">Số điện thoại đăng nhập (*)</label>
                          <input
                            type="tel"
                            required
                            className="executive-modal-input"
                            placeholder="VD: 0905123456"
                            value={createAuthForm.phone}
                            onChange={(e) => setCreateAuthForm({ ...createAuthForm, phone: e.target.value })}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="executive-modal-field">
                          <label className="executive-modal-label">Email liên hệ (*)</label>
                          <input
                            type="email"
                            required
                            className="executive-modal-input"
                            placeholder="VD: canbo@sos.gov.vn"
                            value={createAuthForm.email}
                            onChange={(e) => setCreateAuthForm({ ...createAuthForm, email: e.target.value })}
                          />
                        </div>
                        <div className="executive-modal-field">
                          <label className="executive-modal-label">Mật khẩu khởi tạo (*)</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type="text"
                              required
                              className="executive-modal-input"
                              value={createAuthForm.password}
                              onChange={(e) => setCreateAuthForm({ ...createAuthForm, password: e.target.value })}
                              style={{ paddingRight: 38, fontFamily: 'monospace', fontWeight: 600 }}
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
                                right: 8,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                color: '#0284c7',
                                cursor: 'pointer',
                                padding: 4,
                              }}
                              title="Đổi mật khẩu ngẫu nhiên"
                            >
                              <RefreshCw size={14} />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid #f1f5f9', margin: '4px 0' }} />

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: '#0284c7', letterSpacing: '0.5px' }}>
                          2. Phạm Vi Địa Bàn Quản Lý (34 Tỉnh Thành)
                        </div>
                        {modalSubUnitsLoading && (
                          <span style={{ fontSize: '11px', color: '#0284c7', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Loader2 size={12} className="animate-spin" /> Đang nạp xã/phường...
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="executive-modal-field">
                          <label className="executive-modal-label">Tỉnh / Thành phố (*)</label>
                          <select
                            className="executive-modal-select"
                            value={createAuthForm.city}
                            onChange={(e) => handleCityChange(e.target.value)}
                          >
                            {allProvincesList.map((p) => (
                              <option key={p.code || p.name} value={p.name}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="executive-modal-field">
                          <label className="executive-modal-label">
                            Khu vực quản lý ({modalSubUnitsLoading ? 'Đang nạp...' : `${currentCityAreas.length} địa bàn`}) (*)
                          </label>
                          <select
                            className="executive-modal-select"
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
                          >
                            {currentCityAreas.length === 0 ? (
                              <option value="" disabled>
                                {modalSubUnitsLoading ? 'Đang tải danh sách địa bàn thực tế từ API...' : `Không có dữ liệu khu vực tại ${createAuthForm.city}`}
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
                    </div>

                    <div className="executive-modal-footer">
                      <button
                        type="button"
                        className="executive-btn-outline"
                        onClick={() => setShowCreateAuthModal(false)}
                      >
                        Hủy bỏ
                      </button>
                      <button
                        type="submit"
                        disabled={authSubmitting || modalSubUnitsLoading}
                        className="executive-btn-primary"
                      >
                        {authSubmitting ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>Đang tạo...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={16} />
                            <span>Tạo Tài Khoản & Gán Địa Bàn</span>
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

      {/* MODAL: THÔNG BÁO TẠO TÀI KHOẢN THÀNH CÔNG */}
      {createdOfficerSuccess && (
        <div className="executive-modal-backdrop" onClick={() => setCreatedOfficerSuccess(null)}>
          <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, textAlign: 'center' }}>
            <div className="executive-modal-body" style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  backgroundColor: '#dcfce7',
                  border: '1px solid #86efac',
                  color: '#15803d',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircle2 size={28} />
              </div>

              <h4 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                Tạo Tài Khoản Cán Bộ Thành Công!
              </h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                Tài khoản điều phối tác chiến đã được khởi tạo và sẵn sàng bàn giao cho cán bộ.
              </p>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 12,
                  width: '100%',
                  textAlign: 'left',
                  fontSize: '12.5px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div><strong>Cán bộ:</strong> {createdOfficerSuccess.fullName}</div>
                <div><strong>Số điện thoại:</strong> {createdOfficerSuccess.phone}</div>
                <div><strong>Email:</strong> {createdOfficerSuccess.email}</div>
                <div><strong>Địa bàn phụ trách:</strong> {createdOfficerSuccess.areaName} ({createdOfficerSuccess.city})</div>
              </div>

              <button
                type="button"
                className="executive-btn-primary"
                style={{ width: '100%', marginTop: 8 }}
                onClick={() => setCreatedOfficerSuccess(null)}
              >
                Hoàn tất & Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: XEM BẢN ĐỒ RANH GIỚI ĐỊA BÀN PHỤ TRÁCH */}
      {selectedMapOfficer && (() => {
        const officerArea = selectedMapOfficer.authority?.areaName || selectedMapOfficer.authority?.areaId || 'Địa bàn quản lý';
        const officerDept = selectedMapOfficer.authority?.department || '';
        const coords = getAreaCoordinates(officerArea, officerDept);
        const isOfficerActive = selectedMapOfficer.status === 'ACTIVE';

        return (
          <div className="executive-modal-backdrop" onClick={() => setSelectedMapOfficer(null)}>
            <div
              className="executive-modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '95%',
                maxWidth: 1040,
                padding: 0,
                borderRadius: 16,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                overflow: 'hidden',
              }}
            >
              <div className="executive-modal-header" style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="metric-icon-box blue" style={{ width: 38, height: 38, borderRadius: 10 }}>
                    <MapIcon size={20} />
                  </div>
                  <div>
                    <h4 className="executive-modal-title" style={{ fontSize: '16px', fontWeight: 800 }}>Bản Đồ Địa Bàn Phụ Trách</h4>
                    <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b', marginTop: 2 }}>
                      {officerArea}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="executive-modal-close"
                  onClick={() => setSelectedMapOfficer(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(90vh - 80px)' }}>
                <div style={{ height: 360, width: '100%', borderRadius: 10, overflow: 'hidden', border: '1px solid #cbd5e1', marginBottom: 16 }}>
                  <AreaPreviewMap
                    lat={coords.lat}
                    lng={coords.lng}
                    areaName={officerArea}
                    areaId={selectedMapOfficer.authority?.areaId}
                    department={officerDept}
                  />
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    padding: '16px 20px',
                    boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  {/* Hàng 1: Avatar, Tên, Chức vụ & Trạng thái */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12,
                      paddingBottom: 12,
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div
                        className="officer-avatar-box"
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 12,
                          fontSize: '18px',
                          fontWeight: 800,
                          background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
                          border: '1.5px solid #7dd3fc',
                          color: '#0369a1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {(selectedMapOfficer.fullName || 'CB').slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '16px', letterSpacing: '-0.2px' }}>
                            {selectedMapOfficer.fullName}
                          </span>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              background: '#f0f9ff',
                              color: '#0284c7',
                              padding: '3px 9px',
                              borderRadius: 6,
                              border: '1px solid #bae6fd',
                            }}
                          >
                            {selectedMapOfficer.role === 'LOCAL_AUTHORITY' ? 'Chỉ huy địa phương' : (selectedMapOfficer.role || 'Cán bộ PCTT')}
                          </span>
                        </div>
                        <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{selectedMapOfficer.authority?.department || 'Ban Chỉ Huy PCTT & TKCN'}</span>
                          <span>•</span>
                          <span style={{ fontWeight: 600, color: '#334155' }}>{selectedMapOfficer.phone || '--'}</span>
                        </div>
                      </div>
                    </div>

                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 12px',
                        borderRadius: 20,
                        fontSize: '12px',
                        fontWeight: 700,
                        background: isOfficerActive ? '#f0fdf4' : '#f8fafc',
                        color: isOfficerActive ? '#15803d' : '#64748b',
                        border: `1px solid ${isOfficerActive ? '#bbf7d0' : '#e2e8f0'}`,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: isOfficerActive ? '#16a34a' : '#94a3b8',
                          boxShadow: isOfficerActive ? '0 0 0 2px rgba(34, 197, 94, 0.2)' : 'none',
                        }}
                      />
                      {isOfficerActive ? 'Đang hoạt động' : 'Tạm khóa'}
                    </span>
                  </div>

                  {/* Hàng 2: Chi tiết 4 khối thông tin chuyên sâu (Rộng rãi, không che email) */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: 12,
                    }}
                  >
                    {/* Thẻ 1: Liên hệ trực ban */}
                    <div
                      style={{
                        background: '#f8fafc',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                        Liên hệ trực ban
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Phone size={12} color="#0284c7" />
                        </div>
                        <a href={`tel:${selectedMapOfficer.phone}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                          {selectedMapOfficer.phone || '--'}
                        </a>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 8,
                          fontSize: '12px',
                          color: '#334155',
                          lineHeight: '1.4',
                        }}
                        title={selectedMapOfficer.email}
                      >
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                          <Mail size={12} color="#0284c7" />
                        </div>
                        <a
                          href={`mailto:${selectedMapOfficer.email}`}
                          style={{
                            color: '#0284c7',
                            textDecoration: 'none',
                            wordBreak: 'break-all',
                            fontWeight: 500,
                          }}
                        >
                          {selectedMapOfficer.email || '--'}
                        </a>
                      </div>
                    </div>

                    {/* Thẻ 2: Cơ quan & Chức vụ */}
                    <div
                      style={{
                        background: '#f8fafc',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                        Cơ quan & Chức vụ
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Building2 size={12} color="#d97706" />
                        </div>
                        <span style={{ wordBreak: 'break-word' }} title={selectedMapOfficer.authority?.organizationName || 'UBND / BCH PCTT'}>
                          {selectedMapOfficer.authority?.organizationName || 'UBND / BCH PCTT'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: '#475569' }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Briefcase size={12} color="#64748b" />
                        </div>
                        <span>{selectedMapOfficer.authority?.position || 'Cán bộ trực ban'}</span>
                      </div>
                    </div>

                    {/* Thẻ 3: Địa bàn phụ trách */}
                    <div
                      style={{
                        background: '#f8fafc',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                        Địa bàn phụ trách
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', color: '#0369a1', fontWeight: 700 }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <MapPin size={12} color="#0284c7" />
                        </div>
                        <span style={{ wordBreak: 'break-word' }} title={officerArea}>
                          {officerArea}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '11.5px', color: '#64748b' }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Navigation size={12} color="#64748b" />
                        </div>
                        <span>{coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</span>
                      </div>
                    </div>

                    {/* Thẻ 4: Hệ thống & Cấp phép */}
                    <div
                      style={{
                        background: '#f8fafc',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                        Hệ thống & Cấp phép
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <ShieldCheck size={12} color="#16a34a" />
                        </div>
                        <span>Mã CB: #{selectedMapOfficer._id ? selectedMapOfficer._id.slice(-6).toUpperCase() : '--'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '11.5px', color: '#64748b' }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Calendar size={12} color="#64748b" />
                        </div>
                        <span>Ngày tạo: {selectedMapOfficer.createdAt ? new Date(selectedMapOfficer.createdAt).toLocaleDateString('vi-VN') : 'Hệ thống'}</span>
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

export default AuthoritiesView;

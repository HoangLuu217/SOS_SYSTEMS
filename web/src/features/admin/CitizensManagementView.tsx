import React, { useEffect, useState, useMemo } from 'react';
import {
  Users,
  RefreshCw,
  Lock as LockIcon,
  Unlock,
  Search,
  MapPin,
  Filter,
  X,
  RotateCcw,
  FileQuestion,
} from 'lucide-react';
import { fetchAdminUsers, updateUserStatus } from '@/api';
import { toast } from '@/components/common/toast';
import './CitizensManagementView.css';

interface CitizenUser {
  _id: string;
  fullName: string;
  phone?: string;
  email?: string;
  address?: string;
  status: string;
  roles?: string[];
  createdAt?: string;
}

const removeVietnameseTones = (str: string): string => {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
};

export const CitizensManagementView: React.FC = () => {
  const [citizens, setCitizens] = useState<CitizenUser[]>([]);
  const [loading, setLoading] = useState(false);

  // Bộ lọc & Tìm kiếm
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWard, setSelectedWard] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchAdminUsers({ role: 'CITIZEN' });
      if (res.success && res.data?.users) {
        setCitizens(res.data.users);
      } else {
        setCitizens([]);
      }
    } catch (e) {
      console.warn('[CitizensManagementView] fetchAdminUsers CITIZEN error:', e);
      setCitizens([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      setLoading(true);
      await updateUserStatus(userId, nextStatus);
      toast.success(
        `Đã cập nhật trạng thái tài khoản thành: ${nextStatus === 'ACTIVE' ? 'Hoạt động' : 'Tạm khóa'}!`,
        'Cập nhật tài khoản'
      );
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi server', 'Lỗi cập nhật trạng thái');
    } finally {
      setLoading(false);
    }
  };

  // Trích xuất danh sách Phường / Xã tự động từ địa chỉ thực tế trong CSDL
  const wardOptions = useMemo(() => {
    const wardCountMap = new Map<string, number>();

    citizens.forEach((u) => {
      const addr = u.address || '';
      if (!addr || addr.toLowerCase().includes('chưa cung cấp')) return;

      const matches = Array.from(addr.matchAll(/(phường|xã|thị trấn)\s+([^,]+)/gi));
      if (matches.length > 0) {
        matches.forEach((m) => {
          const type = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
          const name = m[2].trim();
          const fullWard = `${type} ${name}`;
          wardCountMap.set(fullWard, (wardCountMap.get(fullWard) || 0) + 1);
        });
      } else {
        const dMatch = addr.match(/(quận|huyện|thị xã)\s+([^,]+)/i);
        if (dMatch) {
          const type = dMatch[1].charAt(0).toUpperCase() + dMatch[1].slice(1).toLowerCase();
          const name = dMatch[2].trim();
          const fullDistrict = `${type} ${name}`;
          wardCountMap.set(fullDistrict, (wardCountMap.get(fullDistrict) || 0) + 1);
        }
      }
    });

    return Array.from(wardCountMap.entries())
      .map(([ward, count]) => ({ ward, count }))
      .sort((a, b) => a.ward.localeCompare(b.ward, 'vi'));
  }, [citizens]);

  // Lọc danh sách người dân theo điều kiện tìm kiếm và bộ lọc
  const filteredCitizens = useMemo(() => {
    const rawSearch = searchTerm.trim().toLowerCase();
    const cleanSearch = removeVietnameseTones(rawSearch);

    return citizens.filter((u) => {
      // 1. Lọc theo Phường / Xã
      if (selectedWard !== 'ALL') {
        const addrClean = removeVietnameseTones(u.address || '');
        const wardClean = removeVietnameseTones(selectedWard);
        if (!addrClean.includes(wardClean)) {
          return false;
        }
      }

      // 2. Lọc theo Trạng thái tài khoản
      if (selectedStatus !== 'ALL' && u.status !== selectedStatus) {
        return false;
      }

      // 3. Lọc theo Từ khóa tìm kiếm đa năng
      if (cleanSearch) {
        const nameClean = removeVietnameseTones(u.fullName || '');
        const phoneClean = (u.phone || '').toLowerCase();
        const emailClean = (u.email || '').toLowerCase();
        const addrClean = removeVietnameseTones(u.address || '');

        const matches =
          nameClean.includes(cleanSearch) ||
          phoneClean.includes(rawSearch) ||
          emailClean.includes(rawSearch) ||
          addrClean.includes(cleanSearch);

        if (!matches) return false;
      }

      return true;
    });
  }, [citizens, searchTerm, selectedWard, selectedStatus]);

  const isFiltering = searchTerm.trim() !== '' || selectedWard !== 'ALL' || selectedStatus !== 'ALL';

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedWard('ALL');
    setSelectedStatus('ALL');
  };

  return (
    <div className="sos-views-container">
      <div className="sos-view-card">
        <div className="sos-view-card-header">
          <div className="sos-view-card-title">
            <Users size={18} color="#ef4444" />
            <span>
              Quản Lý Tài Khoản Người Dân Thực Tế Trong Database ({citizens.length} người dùng)
            </span>
          </div>
          <button
            type="button"
            className="sos-btn-action"
            style={{ backgroundColor: '#1e293b', color: '#f1f5f9', border: '1px solid #475569' }}
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Làm mới</span>
          </button>
        </div>

        {/* THANH TÌM KIẾM VÀ BỘ LỌC PHƯỜNG / XÃ */}
        <div className="sos-citizen-filter-bar">
          {/* Ô tìm kiếm đa năng */}
          <div className="sos-citizen-search-box">
            <Search size={15} className="sos-citizen-search-icon" />
            <input
              type="text"
              placeholder="Tìm theo họ tên, số điện thoại, email, địa chỉ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="sos-citizen-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="sos-citizen-search-clear"
                title="Xóa tìm kiếm"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Bộ lọc theo Phường / Xã */}
          <div className="sos-citizen-filter-select-wrap">
            <MapPin size={15} className="sos-citizen-select-icon" />
            <select
              value={selectedWard}
              onChange={(e) => setSelectedWard(e.target.value)}
              className="sos-citizen-select"
            >
              <option value="ALL">Tất cả Phường / Xã ({citizens.length})</option>
              {wardOptions.map((w) => (
                <option key={w.ward} value={w.ward}>
                  {w.ward} ({w.count})
                </option>
              ))}
            </select>
          </div>

          {/* Bộ lọc theo Trạng thái */}
          <div className="sos-citizen-filter-select-wrap">
            <Filter size={15} className="sos-citizen-select-icon" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="sos-citizen-select"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Hoạt động (ACTIVE)</option>
              <option value="SUSPENDED">Tạm khóa (SUSPENDED)</option>
            </select>
          </div>

          {/* Nút đặt lại bộ lọc */}
          {isFiltering && (
            <button
              type="button"
              className="sos-citizen-reset-btn"
              onClick={handleResetFilters}
              title="Đặt lại bộ lọc về mặc định"
            >
              <RotateCcw size={14} />
              <span>Đặt lại</span>
            </button>
          )}

          {/* Thống kê số lượng kết quả */}
          <div className="sos-citizen-stats">
            Hiển thị <strong>{filteredCitizens.length}</strong> / {citizens.length} người dùng
          </div>
        </div>

        {/* BẢNG DANH SÁCH TÀI KHOẢN NGƯỜI DÂN */}
        <div className="sos-table-wrapper">
          <table className="sos-table">
            <thead>
              <tr>
                <th>Họ và tên</th>
                <th>Số điện thoại</th>
                <th>Email</th>
                <th>Địa chỉ</th>
                <th>Trạng thái</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filteredCitizens.length === 0 ? (
                <tr>
                  <td colSpan={6} className="sos-empty-table-cell">
                    <div className="sos-empty-table-inner">
                      <FileQuestion size={36} color="#94a3b8" />
                      <span className="sos-empty-table-title">
                        Không tìm thấy tài khoản người dân phù hợp
                      </span>
                      <span className="sos-empty-table-sub">
                        Thử thay đổi từ khóa tìm kiếm hoặc chọn lại Phường / Xã khác.
                      </span>
                      {isFiltering && (
                        <button
                          type="button"
                          className="sos-citizen-reset-btn"
                          style={{ marginTop: '6px' }}
                          onClick={handleResetFilters}
                        >
                          <RotateCcw size={13} />
                          <span>Đặt lại bộ lọc</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCitizens.map((u) => (
                  <tr key={u._id}>
                    <td>
                      <strong>{u.fullName}</strong>
                    </td>
                    <td>{u.phone || 'Chưa có'}</td>
                    <td>{u.email || 'Chưa có'}</td>
                    <td>{u.address || 'Chưa cung cấp'}</td>
                    <td>
                      <span className={`sos-badge ${u.status === 'ACTIVE' ? 'active' : 'critical'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`sos-btn-action ${u.status === 'ACTIVE' ? 'danger' : 'success'}`}
                        onClick={() => handleToggleUserStatus(u._id, u.status)}
                        disabled={loading}
                      >
                        {u.status === 'ACTIVE' ? <LockIcon size={12} /> : <Unlock size={12} />}
                        <span>{u.status === 'ACTIVE' ? 'Khóa' : 'Kích hoạt'}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

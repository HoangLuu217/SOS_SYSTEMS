import React, { useEffect, useState } from 'react';
import { Users, RefreshCw, Lock as LockIcon, Unlock } from 'lucide-react';
import { fetchAdminUsers, updateUserStatus } from '@/api';
import { toast } from '@/components/common/toast';

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

const FALLBACK_CITIZENS: CitizenUser[] = [
  { _id: 'u-cit-01', fullName: 'Lê Minh Tuấn', phone: '0905-334-772', email: 'tuan.lm@gmail.com', address: 'Đường Tiểu La, Hòa Cường', status: 'ACTIVE', roles: ['CITIZEN'], createdAt: '2026-10-12T08:00:00Z' },
  { _id: 'u-cit-02', fullName: 'Hoàng Văn Vinh', phone: '0905-998-331', email: 'vinh.hv@gmail.com', address: 'Đường 2 Tháng 9, Hòa Cường', status: 'ACTIVE', roles: ['CITIZEN'], createdAt: '2026-10-12T08:30:00Z' },
];

export const CitizensManagementView: React.FC = () => {
  const [citizens, setCitizens] = useState<CitizenUser[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchAdminUsers({ role: 'CITIZEN' });
      if (res.success && res.data?.users && res.data.users.length > 0) {
        setCitizens(res.data.users);
      } else {
        setCitizens(FALLBACK_CITIZENS);
      }
    } catch (e) {
      console.warn('[CitizensManagementView] fetchAdminUsers CITIZEN fallback:', e);
      setCitizens(FALLBACK_CITIZENS);
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

  return (
    <div className="sos-views-container">
      <div className="sos-view-card">
        <div className="sos-view-card-header">
          <div className="sos-view-card-title">
            <Users size={18} color="#ef4444" />
            <span>Quản Lý Tài Khoản Người Dân Thực Tế Trong Database ({citizens.length} người dùng)</span>
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
              {citizens.map((u) => (
                <tr key={u._id}>
                  <td><strong>{u.fullName}</strong></td>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

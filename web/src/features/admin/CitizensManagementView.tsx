import React, { useEffect, useState, useMemo } from 'react';
import {
  Users,
  RefreshCw,
  Lock as LockIcon,
  Unlock,
  Search,
  Filter,
  X,
  RotateCcw,
  FileQuestion,
  Eye,
} from 'lucide-react';
import { fetchAdminUsers, updateUserStatus, deleteAdminUser } from '@/api';
import { toast } from '@/components/common/toast';
import { DaNangAreaSelect } from '@/components/common/DaNangAreaSelect';
import { UserDetailSheet, UserFullPageDetail } from '@/components/common/UserDetailSheet';
import { SyncLogoLoader } from '@/components/common/SyncLogoLoader';
import { useAdministrativeFilter } from '@/hooks/useAdministrativeFilter';
import {
  ExcelExportButton,
  TableBulkActionBar,
  TableRowCheckbox,
  TableSelectAllCheckbox,
  runBulkOperation,
  useTableSelection,
} from '@/components/common/TableBulkKit';
import { exportTableToExcel } from '@/utils/tableExcelExport';
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
  const [loading, setLoading] = useState(true);
  const [selectedCitizenId, setSelectedCitizenId] = useState<string | null>(null);
  const [fullPageCitizenId, setFullPageCitizenId] = useState<string | null>(null);

  // Bộ lọc & Tìm kiếm
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWard, setSelectedWard] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const { wards: daNangWards, wardsLoading: daNangWardsLoading } = useAdministrativeFilter({
    isAdmin: true,
    wardsScopeProvince: 'Đà Nẵng',
  });

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

  // Lọc danh sách người dân theo điều kiện tìm kiếm và bộ lọc
  const filteredCitizens = useMemo(() => {
    const rawSearch = searchTerm.trim().toLowerCase();
    const cleanSearch = removeVietnameseTones(rawSearch);

    return citizens.filter((u) => {
      // 1. Lọc theo địa bàn Đà Nẵng
      if (selectedWard !== 'ALL') {
        const addrClean = removeVietnameseTones(u.address || '');
        const wardFullClean = removeVietnameseTones(selectedWard);
        const wardCoreClean = wardFullClean
          .replace(/^(phuong|xa|dac khu|thi tran|quan|huyen|thi xa)\s+/i, '')
          .trim();
        if (!addrClean.includes(wardFullClean) && (!wardCoreClean || !addrClean.includes(wardCoreClean))) {
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

  const citizenSelection = useTableSelection(filteredCitizens.map((u) => u._id));

  const handleExportCitizensExcel = (onlySelected = false) => {
    const targetRows = onlySelected
      ? filteredCitizens.filter((u) => citizenSelection.selectedIds.has(u._id))
      : filteredCitizens;
    if (targetRows.length === 0) {
      toast.warning('Không có dữ liệu người dân để xuất Excel.');
      return;
    }
    exportTableToExcel({
      title: 'DANH SÁCH TÀI KHOẢN NGƯỜI DÂN',
      subtitle: onlySelected
        ? `Xuất ${targetRows.length} tài khoản đã chọn`
        : `Tổng hợp ${targetRows.length} tài khoản người dân`,
      sheetName: 'Nguoi dan',
      fileNamePrefix: 'Danh_sach_nguoi_dan',
      columns: [
        { header: 'STT', width: 6, align: 'center' },
        { header: 'Họ và tên', width: 26 },
        { header: 'Số điện thoại', width: 16, align: 'center' },
        { header: 'Email', width: 28 },
        { header: 'Địa chỉ', width: 38 },
        { header: 'Trạng thái', width: 15, align: 'center' },
      ],
      rows: targetRows.map((u, idx) => [
        idx + 1,
        u.fullName || '—',
        u.phone || 'Chưa có',
        u.email || 'Chưa có',
        u.address || 'Chưa cung cấp',
        u.status === 'ACTIVE' ? 'Hoạt động' : 'Tạm khóa',
      ]),
    });
    toast.success(`Đã xuất Excel ${targetRows.length} tài khoản người dân.`);
  };

  const handleBulkSuspendCitizens = async () => {
    const ids = Array.from(citizenSelection.selectedIds);
    const { succeeded, failed } = await runBulkOperation(ids, (id) =>
      updateUserStatus(id, 'SUSPENDED')
    );
    if (succeeded.length > 0) {
      toast.success(`Đã khóa ${succeeded.length} tài khoản người dân.`);
    }
    if (failed.length > 0) {
      toast.error(`Không thể khóa ${failed.length} tài khoản: ${failed[0].error}`);
    }
    citizenSelection.clearSelection();
    await loadData();
  };

  const handleBulkDeleteCitizens = async () => {
    const ids = Array.from(citizenSelection.selectedIds);
    const { succeeded, failed } = await runBulkOperation(ids, (id) => deleteAdminUser(id));
    if (succeeded.length > 0) {
      toast.success(`Đã xóa ${succeeded.length} tài khoản người dân.`);
    }
    if (failed.length > 0) {
      toast.error(`Không thể xóa ${failed.length} tài khoản: ${failed[0].error}`);
    }
    citizenSelection.clearSelection();
    await loadData();
  };

  const handleDeleteSingleCitizen = async (userId: string) => {
    try {
      setLoading(true);
      await deleteAdminUser(userId);
      toast.success('Đã xóa tài khoản người dân.', 'Xóa tài khoản');
      if (selectedCitizenId === userId) setSelectedCitizenId(null);
      if (fullPageCitizenId === userId) setFullPageCitizenId(null);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi server', 'Không thể xóa tài khoản');
    } finally {
      setLoading(false);
    }
  };

  const selectedCitizen = useMemo(
    () => (selectedCitizenId ? citizens.find((u) => u._id === selectedCitizenId) ?? null : null),
    [citizens, selectedCitizenId]
  );

  const fullPageCitizen = useMemo(
    () => (fullPageCitizenId ? citizens.find((u) => u._id === fullPageCitizenId) ?? null : null),
    [citizens, fullPageCitizenId]
  );

  if (fullPageCitizen) {
    return (
      <div className="sos-views-container">
        <UserFullPageDetail
          variant="citizen"
          record={fullPageCitizen}
          busy={loading}
          backLabel="Tất cả người dân"
          onBack={() => setFullPageCitizenId(null)}
          onToggleStatus={(id, st) => void handleToggleUserStatus(id, st)}
          onDelete={(id) => void handleDeleteSingleCitizen(id)}
        />
      </div>
    );
  }

  return (
    <div className="sos-views-container">
      <div className="sos-view-card">
        <div className="sos-view-card-header">
          <div className="sos-view-card-title">
            <Users size={18} color="#ef4444" />
            <span>Người dân ({citizens.length})</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <ExcelExportButton
              onClick={() => handleExportCitizensExcel(false)}
              disabled={filteredCitizens.length === 0}
              title="Xuất danh sách tài khoản người dân ra Excel (.xlsx)"
            />
            <button
              type="button"
              className="sos-btn sos-btn--outline sos-btn--sm"
              onClick={loadData}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>
          </div>
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

          {/* Bộ lọc địa bàn Đà Nẵng đồng bộ */}
          <DaNangAreaSelect
            wards={daNangWards}
            loading={daNangWardsLoading}
            valueKey="name"
            value={selectedWard}
            onChange={setSelectedWard}
          />

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

        {/* THANH THAO TÁC HÀNG LOẠT */}
        <TableBulkActionBar
          selectedCount={citizenSelection.selectedCount}
          totalFilteredCount={filteredCitizens.length}
          unitLabel="tài khoản"
          onSelectAllFiltered={citizenSelection.selectAllFiltered}
          onClearSelection={citizenSelection.clearSelection}
          onExportSelected={() => handleExportCitizensExcel(true)}
          onCloseSelected={handleBulkSuspendCitizens}
          closeLabel="Khóa đã chọn"
          closeConfirmTitle={`Khóa ${citizenSelection.selectedCount} tài khoản người dân?`}
          closeConfirmDesc="Các tài khoản đã chọn sẽ chuyển sang trạng thái Tạm khóa (SUSPENDED)."
          onDeleteSelected={handleBulkDeleteCitizens}
          deleteLabel="Xóa đã chọn"
        />

        {/* BẢNG DANH SÁCH TÀI KHOẢN NGƯỜI DÂN */}
        <div className="sos-table-wrapper">
          <table className="sos-table">
            <thead>
              <tr>
                <th className="sos-checkbox-col">
                  <TableSelectAllCheckbox
                    checked={citizenSelection.allVisibleSelected}
                    indeterminate={citizenSelection.someVisibleSelected}
                    disabled={filteredCitizens.length === 0}
                    onChange={citizenSelection.toggleSelectVisible}
                  />
                </th>
                <th>Họ và tên</th>
                <th>Số điện thoại</th>
                <th>Email</th>
                <th>Địa chỉ</th>
                <th>Trạng thái</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {loading && citizens.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '16px 20px' }}>
                    <SyncLogoLoader size="md" message="Đang tải danh sách người dân..." />
                  </td>
                </tr>
              ) : filteredCitizens.length === 0 ? (
                <tr>
                  <td colSpan={7} className="sos-empty-table-cell">
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
                  <tr
                    key={u._id}
                    onClick={() => setSelectedCitizenId(u._id)}
                    style={{ cursor: 'pointer' }}
                    title="Nhấn để xem chi tiết tài khoản"
                  >
                    <td className="sos-checkbox-col" onClick={(e) => e.stopPropagation()}>
                      <TableRowCheckbox
                        checked={citizenSelection.isSelected(u._id)}
                        onChange={() => citizenSelection.toggleRow(u._id)}
                        ariaLabel={`Chọn tài khoản ${u.fullName}`}
                      />
                    </td>
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
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          className="sos-btn-action"
                          onClick={() => setSelectedCitizenId(u._id)}
                          title="Xem chi tiết hồ sơ"
                        >
                          <Eye size={12} />
                          <span>Xem</span>
                        </button>
                        <button
                          type="button"
                          className={`sos-btn-action ${u.status === 'ACTIVE' ? 'danger' : 'success'}`}
                          onClick={() => handleToggleUserStatus(u._id, u.status)}
                          disabled={loading}
                        >
                          {u.status === 'ACTIVE' ? <LockIcon size={12} /> : <Unlock size={12} />}
                          <span>{u.status === 'ACTIVE' ? 'Khóa' : 'Kích hoạt'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <UserDetailSheet
        variant="citizen"
        record={selectedCitizen}
        busy={loading}
        onOpenChange={(open) => {
          if (!open) setSelectedCitizenId(null);
        }}
        onOpenFullPage={(rec) => {
          setSelectedCitizenId(null);
          setFullPageCitizenId(rec._id);
        }}
        onToggleStatus={(id, st) => void handleToggleUserStatus(id, st)}
        onDelete={(id) => void handleDeleteSingleCitizen(id)}
      />
    </div>
  );
};

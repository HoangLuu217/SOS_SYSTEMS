import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckSquare,
  FileSpreadsheet,
  Lock,
  Trash2,
  X,
} from 'lucide-react';

/* ==========================================================================
   1. REUSABLE TABLE ROW SELECTION HOOK
   ========================================================================== */

export interface TableSelectionState {
  selectedIds: Set<string>;
  selectedCount: number;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  allFilteredSelected: boolean;
  isSelected: (id: string) => boolean;
  toggleRow: (id: string) => void;
  toggleSelectVisible: () => void;
  selectAllFiltered: () => void;
  clearSelection: () => void;
}

export function useTableSelection(
  visibleIds: string[],
  allFilteredIds?: string[]
): TableSelectionState {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const validIdSet = useMemo(
    () => new Set(allFilteredIds ?? visibleIds),
    [allFilteredIds, visibleIds]
  );

  // Auto-prune IDs that are no longer in the dataset (e.g. deleted or filtered out)
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIdSet.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [validIdSet]);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected =
    visibleIds.some((id) => selectedIds.has(id)) && !allVisibleSelected;
  const allList = allFilteredIds ?? visibleIds;
  const allFilteredSelected =
    allList.length > 0 && allList.every((id) => selectedIds.has(id));

  const toggleSelectVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (visibleIds.length > 0 && visibleIds.every((id) => next.has(id))) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [visibleIds]);

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(allFilteredIds ?? visibleIds));
  }, [allFilteredIds, visibleIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    allVisibleSelected,
    someVisibleSelected,
    allFilteredSelected,
    isSelected,
    toggleRow,
    toggleSelectVisible,
    selectAllFiltered,
    clearSelection,
  };
}

/* ==========================================================================
   2. BULK API RUNNER HELPER
   ========================================================================== */

export async function runBulkOperation(
  ids: string[],
  handler: (id: string) => Promise<any>
): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  const results = await Promise.allSettled(ids.map((id) => handler(id)));
  results.forEach((res, idx) => {
    const id = ids[idx];
    if (res.status === 'fulfilled') {
      const val = res.value;
      if (val && typeof val === 'object' && 'success' in val && val.success === false) {
        failed.push({ id, error: val.message || 'Thao tác không thành công' });
      } else {
        succeeded.push(id);
      }
    } else {
      failed.push({ id, error: res.reason?.message || 'Lỗi kết nối' });
    }
  });

  return { succeeded, failed };
}

/* ==========================================================================
   3. HEADER & ROW CHECKBOXES
   ========================================================================== */

export const TableSelectAllCheckbox: React.FC<{
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
  title?: string;
}> = ({ checked, indeterminate = false, disabled = false, onChange, title = 'Chọn tất cả trang này' }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      className="sos-table-checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      title={title}
      aria-label={title}
    />
  );
};

export const TableRowCheckbox: React.FC<{
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  ariaLabel?: string;
}> = ({ checked, disabled = false, onChange, ariaLabel = 'Chọn dòng này' }) => (
  <input
    type="checkbox"
    className="sos-table-checkbox"
    checked={checked}
    disabled={disabled}
    onChange={onChange}
    onClick={(e) => e.stopPropagation()}
    aria-label={ariaLabel}
  />
);

/* ==========================================================================
   4. UNIFIED EXCEL EXPORT BUTTON (EXACT MATCH TO REFERENCE IMAGE 2)
   ========================================================================== */

export interface ExcelExportButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  title?: string;
  className?: string;
}

export const ExcelExportButton: React.FC<ExcelExportButtonProps> = ({
  onClick,
  disabled = false,
  loading = false,
  label = 'Xuất Excel',
  title = 'Xuất dữ liệu ra file Excel (.xlsx)',
  className = '',
}) => (
  <button
    type="button"
    className={`sos-excel-btn ${className}`.trim()}
    onClick={onClick}
    disabled={disabled || loading}
    title={title}
  >
    {loading ? (
      <span className="sos-btn-spinner" aria-hidden="true" />
    ) : (
      <FileSpreadsheet size={15} strokeWidth={2} />
    )}
    <span>{loading ? 'Đang xuất...' : label}</span>
  </button>
);

/* ==========================================================================
   5. CONTEXTUAL BULK ACTION BAR + CONFIRMATION MODAL
   ========================================================================== */

export interface TableBulkActionBarProps {
  selectedCount: number;
  totalFilteredCount?: number;
  unitLabel?: string;
  onSelectAllFiltered?: () => void;
  onClearSelection: () => void;
  onCloseSelected?: () => Promise<void> | void;
  closeLabel?: string;
  closeConfirmTitle?: string;
  closeConfirmDesc?: string;
  onDeleteSelected?: () => Promise<void> | void;
  deleteLabel?: string;
  deleteConfirmTitle?: string;
  deleteConfirmDesc?: string;
  onExportSelected?: () => void;
  extraActions?: React.ReactNode;
}

export const TableBulkActionBar: React.FC<TableBulkActionBarProps> = ({
  selectedCount,
  totalFilteredCount = 0,
  unitLabel = 'mục',
  onSelectAllFiltered,
  onClearSelection,
  onCloseSelected,
  closeLabel = 'Đóng đã chọn',
  closeConfirmTitle,
  closeConfirmDesc,
  onDeleteSelected,
  deleteLabel = 'Xóa đã chọn',
  deleteConfirmTitle,
  deleteConfirmDesc,
  onExportSelected,
  extraActions,
}) => {
  const [confirmKind, setConfirmKind] = useState<'close' | 'delete' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (selectedCount <= 0) return null;

  const canSelectAll =
    Boolean(onSelectAllFiltered) && totalFilteredCount > selectedCount;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      if (confirmKind === 'close' && onCloseSelected) {
        await onCloseSelected();
      } else if (confirmKind === 'delete' && onDeleteSelected) {
        await onDeleteSelected();
      }
      setConfirmKind(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="sos-bulk-bar" role="region" aria-label="Thao tác hàng loạt">
        <div className="sos-bulk-bar-left">
          <span className="sos-bulk-count-pill">
            <CheckSquare size={14} />
            <strong>Đã chọn {selectedCount} {unitLabel}</strong>
          </span>

          {canSelectAll && (
            <button
              type="button"
              className="sos-bulk-link-btn"
              onClick={onSelectAllFiltered}
            >
              Chọn tất cả {totalFilteredCount} {unitLabel}
            </button>
          )}
        </div>

        <div className="sos-bulk-bar-actions">
          {extraActions}

          {onExportSelected && (
            <ExcelExportButton
              onClick={onExportSelected}
              label={`Xuất Excel (${selectedCount})`}
              title={`Xuất ${selectedCount} ${unitLabel} đang chọn ra Excel`}
            />
          )}

          {onCloseSelected && (
            <button
              type="button"
              className="sos-bulk-btn warning"
              onClick={() => setConfirmKind('close')}
              disabled={submitting}
            >
              <Lock size={14} />
              <span>{closeLabel}</span>
            </button>
          )}

          {onDeleteSelected && (
            <button
              type="button"
              className="sos-bulk-btn danger"
              onClick={() => setConfirmKind('delete')}
              disabled={submitting}
            >
              <Trash2 size={14} />
              <span>{deleteLabel}</span>
            </button>
          )}

          <button
            type="button"
            className="sos-bulk-btn ghost"
            onClick={onClearSelection}
            disabled={submitting}
            title="Bỏ chọn tất cả"
          >
            <X size={14} />
            <span>Bỏ chọn</span>
          </button>
        </div>
      </div>

      {confirmKind &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="executive-modal-backdrop"
            onClick={() => !submitting && setConfirmKind(null)}
          >
            <div
              className="executive-modal-card sos-bulk-confirm-card"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="executive-modal-header">
                <h3 className="executive-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle
                    size={18}
                    style={{
                      color: confirmKind === 'delete' ? 'var(--dm-red-text)' : 'var(--dm-amber-text)',
                    }}
                  />
                  <span>
                    {confirmKind === 'delete'
                      ? deleteConfirmTitle || `Xác nhận xóa ${selectedCount} ${unitLabel}`
                      : closeConfirmTitle || `Xác nhận đóng ${selectedCount} ${unitLabel}`}
                  </span>
                </h3>
                <button
                  type="button"
                  className="executive-modal-close"
                  onClick={() => !submitting && setConfirmKind(null)}
                  disabled={submitting}
                  aria-label="Đóng"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="executive-modal-body">
                <p className="sos-bulk-confirm-desc">
                  {confirmKind === 'delete'
                    ? deleteConfirmDesc ||
                      `Bạn có chắc chắn muốn xóa ${selectedCount} ${unitLabel} đã chọn? Thao tác này không thể hoàn tác.`
                    : closeConfirmDesc ||
                      `Bạn có chắc chắn muốn đóng / ngừng hoạt động ${selectedCount} ${unitLabel} đã chọn?`}
                </p>
              </div>

              <div className="executive-modal-footer">
                <button
                  type="button"
                  className="executive-btn-outline"
                  onClick={() => setConfirmKind(null)}
                  disabled={submitting}
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  className={`sos-bulk-confirm-submit ${confirmKind}`}
                  onClick={handleConfirm}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <span className="sos-btn-spinner" />
                      <span>Đang xử lý...</span>
                    </>
                  ) : confirmKind === 'delete' ? (
                    <>
                      <Trash2 size={14} />
                      <span>Xóa {selectedCount} {unitLabel}</span>
                    </>
                  ) : (
                    <>
                      <Lock size={14} />
                      <span>Đóng {selectedCount} {unitLabel}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

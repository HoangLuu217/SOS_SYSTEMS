import React, { useMemo } from 'react';
import {
  SearchableSelect,
  type SearchableSelectOption,
} from '@/components/common/SearchableSelect';

export interface DaNangWardLike {
  id?: string;
  _id?: string;
  name: string;
  code?: string | null;
}

export interface DaNangAreaSelectProps {
  wards: DaNangWardLike[];
  value: string;
  onChange: (value: string) => void;
  /** Giá trị đại diện cho "Tất cả địa bàn Đà Nẵng" (mặc định: 'ALL') */
  allValue?: string;
  /** Lấy trường nào của ward làm option.value (mặc định: 'id' -> id ?? _id ?? name) */
  valueKey?: 'id' | '_id' | 'name';
  loading?: boolean;
  disabled?: boolean;
  /** Tùy chỉnh nhãn mặc định cho mục Tất cả */
  allLabel?: string;
  searchPlaceholder?: string;
  ariaLabel?: string;
  title?: string;
  className?: string;
  triggerStyle?: React.CSSProperties;
  menuMinWidth?: number;
  maxMenuHeight?: number;
  /** Tự động tô nhấn nhẹ khi đang lọc một địa bàn cụ thể */
  highlightActive?: boolean;
  /** Các lựa chọn bổ sung chèn ngay sau mục Tất cả (ví dụ khu vực ngoài danh mục) */
  extraOptions?: SearchableSelectOption[];
}

export const DaNangAreaSelect: React.FC<DaNangAreaSelectProps> = ({
  wards,
  value,
  onChange,
  allValue = 'ALL',
  valueKey = 'id',
  loading = false,
  disabled = false,
  allLabel,
  searchPlaceholder = 'Tìm nhanh địa bàn Đà Nẵng...',
  ariaLabel = 'Lọc theo địa bàn Đà Nẵng',
  title = 'Lọc theo Phường / Xã / Đặc khu Đà Nẵng',
  className = '',
  triggerStyle,
  menuMinWidth = 280,
  maxMenuHeight = 340,
  highlightActive = true,
  extraOptions = [],
}) => {
  const isFiltered = Boolean(value && value !== allValue && value !== 'ALL');

  const options = useMemo<SearchableSelectOption[]>(() => {
    const resolvedAllLabel =
      allLabel ??
      (loading
        ? 'Đang tải địa bàn Đà Nẵng...'
        : `Tất cả địa bàn Đà Nẵng (${wards.length})`);

    const wardOptions: SearchableSelectOption[] = wards.map((ward) => {
      const resolvedValue =
        valueKey === 'name'
          ? ward.name
          : valueKey === '_id'
            ? String(ward._id || ward.id || ward.name)
            : String(ward.id || ward._id || ward.name);

      return {
        value: resolvedValue,
        label: ward.name,
        badgeText: ward.code || undefined,
        keywords: `${ward.name} ${ward.code || ''}`.trim(),
      };
    });

    return [
      {
        value: allValue,
        label: resolvedAllLabel,
        keywords: 'tat ca toan thanh pho da nang dia ban phuong xa',
      },
      ...extraOptions,
      ...wardOptions,
    ];
  }, [wards, allLabel, allValue, loading, valueKey, extraOptions]);

  const mergedTriggerStyle = useMemo<React.CSSProperties>(
    () => ({
      minWidth: '220px',
      height: '36px',
      padding: '0 12px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: isFiltered ? 600 : 500,
      ...(highlightActive && isFiltered
        ? {
            borderColor: 'var(--dm-blue-border)',
            background: 'var(--dm-blue-bg)',
            color: 'var(--dm-blue-text)',
          }
        : {}),
      ...triggerStyle,
    }),
    [isFiltered, highlightActive, triggerStyle]
  );

  return (
    <SearchableSelect
      className={`sos-area-searchable-select ${isFiltered ? 'has-filter' : ''} ${className}`.trim()}
      ariaLabel={ariaLabel}
      title={title}
      searchPlaceholder={searchPlaceholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      options={options}
      triggerStyle={mergedTriggerStyle}
      menuMinWidth={menuMinWidth}
      maxMenuHeight={maxMenuHeight}
    />
  );
};

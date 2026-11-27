import {
  appendDataTable,
  buildSheetFormHeader,
  exportWorkbookSheets,
  formatDateVi,
  type SheetSpec,
} from '@/features/admin/exportReportsExcel';

export interface SimpleExcelColumn<T> {
  header: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  value?: (row: T, index: number) => string | number;
}

export interface ExportTableExcelOptions<T> {
  title: string;
  subtitle?: string;
  sheetName: string;
  fileNamePrefix: string;
  columns: SimpleExcelColumn<T>[];
  rows: T[];
  meta?: [string, string | number, string, string | number][];
}

/**
 * Helper chuẩn dùng chung để xuất bảng dữ liệu sang file .xlsx định dạng đẹp
 * cho toàn bộ các trang quản trị trong hệ thống Cứu Hộ Cứu Nạn.
 */
export function exportTableToExcel<T>({
  title,
  subtitle = 'Hệ Thống Cứu Hộ Cứu Nạn — Dữ liệu xuất từ bảng quản trị',
  sheetName,
  fileNamePrefix,
  columns,
  rows,
  meta,
}: ExportTableExcelOptions<T>): void {
  const colWidths = columns.map((c) => c.width ?? 22);
  const defaultMeta: [string, string | number, string, string | number][] = meta ?? [
    ['Ngày xuất', formatDateVi(new Date().toISOString()), 'Tổng số dòng', rows.length],
  ];

  const { rows: sheetRows, merges } = buildSheetFormHeader(
    title.toUpperCase(),
    subtitle,
    Math.max(4, columns.length),
    defaultMeta
  );

  const headers = columns.map((c) => c.header);
  const matrix = rows.map((row, idx) =>
    columns.map((col, colIdx) => {
      const cellValue = col.value
        ? col.value(row, idx)
        : Array.isArray(row)
          ? (row[colIdx] ?? '—')
          : '—';
      return {
        v: cellValue as string | number,
        align: col.align,
      };
    })
  );

  appendDataTable(sheetRows, headers, matrix);

  const sheet: SheetSpec = {
    name: sheetName,
    colWidths:
      colWidths.length >= 4
        ? colWidths
        : [...colWidths, ...Array(4 - colWidths.length).fill(18)],
    rows: sheetRows,
    merges,
  };

  const dateTag = new Date().toISOString().slice(0, 10);
  exportWorkbookSheets([sheet], `${fileNamePrefix}_${dateTag}.xlsx`);
}

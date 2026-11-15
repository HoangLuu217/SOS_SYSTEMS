import type { WeatherArticleItem, WeatherPaginationCounts } from '@/api/weather.api';
import {
  exportWorkbookSheets,
  appendDataTable,
  formatDateVi,
  type CellSpec,
  type RowSpec,
  type SheetSpec,
} from '@/features/admin/exportReportsExcel';

export type WeatherExportTab = 'approved' | 'pending' | 'archived' | 'all';

export interface ExportWeatherExcelOptions {
  articles: WeatherArticleItem[];
  activeTab: WeatherExportTab;
  searchTerm?: string;
  selectedCategory?: string;
  sortBy?: string;
  exporterName?: string;
  categoryLabels: Record<string, string>;
  counts?: WeatherPaginationCounts;
}

const TAB_DISPLAY_MAP: Record<WeatherExportTab, { label: string; sheetName: string; fileSlug: string }> = {
  approved: {
    label: 'Đã duyệt phát hành',
    sheetName: 'Ban tin da phat hanh',
    fileSlug: 'da_phat_hanh',
  },
  pending: {
    label: 'Chờ kiểm duyệt',
    sheetName: 'Ban tin cho duyet',
    fileSlug: 'cho_duyet',
  },
  archived: {
    label: 'Lưu trữ / Từ chối',
    sheetName: 'Ban tin luu tru',
    fileSlug: 'luu_tru',
  },
  all: {
    label: 'Tất cả bản tin',
    sheetName: 'Tat ca ban tin',
    fileSlug: 'tat_ca',
  },
};

const SORT_LABELS: Record<string, string> = {
  createdAt: 'Mới cào gần đây',
  publishedAt: 'Ngày báo đăng',
  score: 'Điểm tin cậy cao nhất',
};

function colLetter(colIdx0: number): string {
  let n = colIdx0 + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function getEffectiveScore(item: WeatherArticleItem): number {
  if (typeof item.relevance_score === 'number' && item.relevance_score > 0) {
    return item.relevance_score;
  }
  if (typeof item.score === 'number' && item.score > 0) {
    return item.score;
  }
  return item.relevance_score ?? item.score ?? 0;
}

function getStatusText(status?: string): string {
  const s = (status || '').toUpperCase();
  if (s === 'ACTIVE' || s === 'APPROVED') return 'Đã phát hành';
  if (s === 'PENDING') return 'Chờ kiểm duyệt';
  if (s === 'ARCHIVED' || s === 'REJECTED') return 'Lưu trữ / Từ chối';
  return status || 'Khác';
}

function getAreaText(item: WeatherArticleItem): string {
  if (item.area && item.area.trim()) return item.area.trim();
  if (Array.isArray(item.regions) && item.regions.length > 0) {
    return item.regions.join(', ');
  }
  if (typeof item.areaId === 'object' && item.areaId?.name) {
    return item.areaId.name;
  }
  return 'Toàn quốc';
}

function formatPublishedDate(val?: string | null): string {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function estimateWrappedRowHeight(pairs: [string, number][]): number {
  let maxLines = 1;
  for (const [text, width] of pairs) {
    if (!text) continue;
    const charsPerLine = Math.max(10, width - 3);
    const segments = String(text).split(/\r?\n/);
    let lines = 0;
    for (const seg of segments) {
      lines += Math.max(1, Math.ceil(seg.length / charsPerLine));
    }
    if (lines > maxLines) maxLines = lines;
  }
  return Math.min(120, Math.max(24, maxLines * 14 + 8));
}

/**
 * Builds a structured Excel form sheet with header metadata, summary KPIs, and wrapped data table.
 */
function buildWeatherFormHeader(
  title: string,
  subtitle: string,
  colCount: number,
  metaPairs: [string, string | number, string, string | number][]
): { rows: RowSpec[]; merges: string[] } {
  const rows: RowSpec[] = [];
  const merges: string[] = [];
  const lastCol = colLetter(colCount - 1);

  rows.push({
    height: 34,
    cells: Array.from({ length: colCount }, (_, i) => (i === 0 ? { v: title, s: 1 } : { v: '', s: 1 })),
  });
  merges.push(`A1:${lastCol}1`);

  rows.push({
    height: 24,
    cells: Array.from({ length: colCount }, (_, i) => (i === 0 ? { v: subtitle, s: 2 } : { v: '', s: 2 })),
  });
  merges.push(`A2:${lastCol}2`);

  rows.push({ height: 10, cells: [] });

  rows.push({
    height: 24,
    cells: Array.from({ length: colCount }, (_, i) =>
      i === 0 ? { v: 'I. THÔNG TIN BIỂU MẪU & TỔNG HỢP CHỈ SỐ', s: 6 } : { v: '', s: 6 }
    ),
  });
  merges.push(`A4:${lastCol}4`);

  let currentRow1 = 5;
  for (const [k1, v1, k2, v2] of metaPairs) {
    const v1Style = typeof v1 === 'number' ? 5 : 4;
    const v2Style = typeof v2 === 'number' ? 5 : 4;
    const cells: (CellSpec | null)[] = Array.from({ length: colCount }, (_, i) => {
      if (i <= 1) return { v: i === 0 ? k1 : '', s: 3 };
      if (i <= 3) {
        return {
          v: i === 2 ? v1 : '',
          s: v1Style,
          t: i === 2 && typeof v1 === 'number' ? 'n' : 's',
        };
      }
      if (i <= 5) return { v: i === 4 ? k2 : '', s: 3 };
      return {
        v: i === 6 ? v2 : '',
        s: v2Style,
        t: i === 6 && typeof v2 === 'number' ? 'n' : 's',
      };
    });

    merges.push(`A${currentRow1}:B${currentRow1}`);
    merges.push(`C${currentRow1}:D${currentRow1}`);
    merges.push(`E${currentRow1}:F${currentRow1}`);
    merges.push(`G${currentRow1}:${lastCol}${currentRow1}`);

    const estHeight = estimateWrappedRowHeight([
      [String(v1), 38],
      [String(v2), 120],
    ]);
    rows.push({ height: Math.max(22, Math.min(48, estHeight)), cells });
    currentRow1 += 1;
  }

  rows.push({ height: 12, cells: [] });
  currentRow1 += 1;

  rows.push({
    height: 24,
    cells: Array.from({ length: colCount }, (_, i) =>
      i === 0 ? { v: 'II. BẢNG DỮ LIỆU CHI TIẾT BẢN TIN & CẢNH BÁO THỜI TIẾT', s: 6 } : { v: '', s: 6 }
    ),
  });
  merges.push(`A${currentRow1}:${lastCol}${currentRow1}`);

  return { rows, merges };
}

export function exportWeatherArticlesExcel({
  articles,
  activeTab,
  searchTerm = '',
  selectedCategory = 'ALL',
  sortBy = 'createdAt',
  exporterName,
  categoryLabels,
  counts,
}: ExportWeatherExcelOptions): void {
  const tabMeta = TAB_DISPLAY_MAP[activeTab] || TAB_DISPLAY_MAP.all;
  const nowText = formatDateVi(new Date().toISOString());
  const categoryLabel =
    selectedCategory && selectedCategory !== 'ALL'
      ? categoryLabels[selectedCategory] || selectedCategory
      : 'Tất cả loại hình thời tiết';
  const sortLabel = SORT_LABELS[sortBy] || sortBy;
  const searchLabel = searchTerm.trim() ? `"${searchTerm.trim()}"` : 'Không có';

  let approvedInList = 0;
  let pendingInList = 0;
  let archivedInList = 0;
  let scoreSum = 0;
  const categoryCounts = new Map<string, number>();

  articles.forEach((item) => {
    const s = (item.status || '').toUpperCase();
    if (s === 'ACTIVE' || s === 'APPROVED') approvedInList += 1;
    else if (s === 'PENDING') pendingInList += 1;
    else if (s === 'ARCHIVED' || s === 'REJECTED') archivedInList += 1;

    scoreSum += getEffectiveScore(item);
    const catName = categoryLabels[item.category] || item.category || 'Tin thời tiết khác';
    categoryCounts.set(catName, (categoryCounts.get(catName) || 0) + 1);
  });

  const avgScore = articles.length > 0 ? Math.round((scoreSum / articles.length) * 10) / 10 : 0;
  const categoryBreakdown =
    categoryCounts.size > 0
      ? Array.from(categoryCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, count]) => `${label}: ${count}`)
          .join(' | ')
      : 'Chưa có dữ liệu';

  const systemSummary = counts
    ? `Tổng: ${counts.total} (Phát hành: ${counts.approved} | Chờ duyệt: ${counts.pending} | Lưu trữ: ${counts.archived})`
    : `${articles.length} bản tin`;

  const headers = [
    'STT',
    'Tiêu đề bản tin',
    'Phân loại hiện tượng',
    'Trạng thái kiểm duyệt',
    'Độ ưu tiên (0-100)',
    'Khu vực áp dụng',
    'Nguồn cấp tin',
    'Tóm tắt thông báo',
    'Đánh giá AI Crawler',
    'Ngày báo xuất bản',
    'Thời gian lưu hệ thống',
    'Đường dẫn bài viết gốc',
  ];
  const colWidths = [7, 40, 22, 19, 16, 24, 22, 44, 34, 18, 20, 36];

  const subtitle = `Tab dữ liệu: ${tabMeta.label}   |   Phân loại: ${categoryLabel}   |   Sắp xếp: ${sortLabel}   |   Ngày xuất: ${nowText}`;

  const { rows, merges } = buildWeatherFormHeader(
    'BIỂU MẪU BÁO CÁO QUẢN LÝ BẢN TIN & CẢNH BÁO THỜI TIẾT — HỆ THỐNG CỨU HỘ SOS',
    subtitle,
    headers.length,
    [
      ['Đơn vị quản lý', 'Ban Chỉ Huy PCTT — Hệ thống SOS', 'Tab dữ liệu đang xuất', tabMeta.label],
      ['Người lập / xuất biểu mẫu', exporterName || 'Quản trị viên Hệ thống', 'Thời gian xuất biểu mẫu', nowText],
      ['Số bản tin trong biểu mẫu', articles.length, 'Bộ lọc tìm kiếm / Phân loại', `${categoryLabel} | Từ khóa: ${searchLabel}`],
      [
        'Điểm ưu tiên trung bình (DS)',
        `${avgScore} / 100`,
        'Thống kê trạng thái (trong DS)',
        `Đã phát hành: ${approvedInList} | Chờ kiểm duyệt: ${pendingInList} | Lưu trữ: ${archivedInList}`,
      ],
      ['Phân bố loại hình (trong DS)', categoryBreakdown, 'Toàn bộ CSDL hiện hành', systemSummary],
    ]
  );

  const rowHeights: number[] = [];
  const dataMatrix = articles.map((item, idx) => {
    const titleText = item.title || '—';
    const categoryText = categoryLabels[item.category] || item.category || 'Tin thời tiết khác';
    const statusText = getStatusText(item.status);
    const scoreNum = getEffectiveScore(item);
    const areaText = getAreaText(item);
    const sourceText = item.sourceName || item.source_name || item.articleTitle || 'Hệ thống';
    const summaryText = item.summary || (item.content ? item.content.slice(0, 250) : '—');
    const aiReasonText = item.ai_reason || (item as WeatherArticleItem & { reason?: string }).reason || '—';
    const publishedText = formatPublishedDate(item.publishedAt || item.published_at);
    const createdText = formatDateVi(item.createdAt || item.created_at);
    const urlText = item.articleUrl || item.source_url || '—';

    rowHeights.push(
      estimateWrappedRowHeight([
        [titleText, colWidths[1]],
        [areaText, colWidths[5]],
        [sourceText, colWidths[6]],
        [summaryText, colWidths[7]],
        [aiReasonText, colWidths[8]],
        [urlText, colWidths[11]],
      ])
    );

    return [
      { v: idx + 1, align: 'center' as const },
      { v: titleText, align: 'left' as const },
      { v: categoryText, align: 'center' as const },
      { v: statusText, align: 'center' as const },
      { v: scoreNum, align: 'right' as const },
      { v: areaText, align: 'left' as const },
      { v: sourceText, align: 'left' as const },
      { v: summaryText, align: 'left' as const },
      { v: aiReasonText, align: 'left' as const },
      { v: publishedText, align: 'center' as const },
      { v: createdText, align: 'center' as const },
      { v: urlText, align: 'left' as const },
    ];
  });

  const dataStartIdx = rows.length + 1;
  appendDataTable(rows, headers, dataMatrix, [
    '',
    'TỔNG CỘNG BÁO CÁO',
    `${articles.length} bản tin`,
    `Duyệt: ${approvedInList} | Chờ: ${pendingInList} | Lưu trữ: ${archivedInList}`,
    `TB: ${avgScore}/100`,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);

  rowHeights.forEach((h, idx) => {
    const targetRow = rows[dataStartIdx + idx];
    if (targetRow) targetRow.height = h;
  });

  const sheet: SheetSpec = {
    name: tabMeta.sheetName,
    colWidths,
    rows,
    merges,
  };

  const fileName = `Bao_cao_ban_tin_thoi_tiet_${tabMeta.fileSlug}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  exportWorkbookSheets([sheet], fileName);
}


import {
  appendDataTable,
  exportWorkbookSheets,
  type CellSpec,
  type RowSpec,
  type SheetSpec,
} from '@/features/admin/exportReportsExcel';

export interface BloodDonationExportEvent {
  _id: string;
  title: string;
  locationName: string;
  address: string;
  googleMapsUrl?: string;
  location?: {
    coordinates?: [number, number];
  };
  eventDate: string;
  startTime: string;
  endTime: string;
  neededBloodTypes: string[];
  targetDonors: number;
  organizerName: string;
  contactPhone?: string;
  areaName?: string;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  stats?: {
    confirmedCount?: number;
    declinedCount?: number;
    completedCount?: number;
  };
}

export interface BloodDonationExportRegistration {
  _id: string;
  eventId?: { _id: string; title?: string } | null;
  userId?: {
    _id: string;
    fullName?: string;
    phone?: string;
    email?: string;
    address?: string;
  } | null;
  fullName: string;
  phone: string;
  bloodType: string;
  donatedVolumeMl?: number | null;
  weightKg?: number | null;
  preferredTimeSlot?: string;
  note?: string;
  areaName?: string;
  provinceName?: string;
  address?: string;
  status: 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'COMPLETED' | 'CANCELLED';
  respondedAt: string;
  createdAt: string;
}

export interface ExportBloodDonationsExcelOptions {
  events: BloodDonationExportEvent[];
  responsesByEventId: Record<string, BloodDonationExportRegistration[]>;
  exporterName?: string;
}

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

function formatDateViShort(val?: string | null): string {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatDateTimeViShort(val?: string | null): string {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function getEventStatusText(status: string): string {
  if (status === 'ACTIVE') return 'Đang mở đăng ký';
  if (status === 'CLOSED') return 'Đã kết thúc';
  if (status === 'CANCELLED') return 'Đã hủy';
  return status || 'Khác';
}

function getRegistrationStatusText(status: string): string {
  if (status === 'CONFIRMED') return 'Xác nhận tham gia';
  if (status === 'COMPLETED') return 'Đã hiến máu';
  if (status === 'DECLINED') return 'Từ chối';
  if (status === 'CANCELLED') return 'Đã hủy';
  return 'Chờ thông báo';
}

function getNeededBloodTypesText(neededBloodTypes?: string[]): string {
  if (!neededBloodTypes || neededBloodTypes.length === 0 || neededBloodTypes.includes('ALL')) {
    return 'Tất cả';
  }
  return neededBloodTypes.join(', ');
}

function getEventGoogleMapsUrl(ev: BloodDonationExportEvent): string {
  if (ev.googleMapsUrl && ev.googleMapsUrl.trim()) {
    return ev.googleMapsUrl.trim();
  }
  const coords = ev.location?.coordinates;
  if (Array.isArray(coords) && coords.length === 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
    const [lng, lat] = coords;
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const query = `${ev.locationName || ''} ${ev.address || ''}`.trim();
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '—';
}

function buildFormHeader(
  title: string,
  subtitle: string,
  section1Title: string,
  section2Title: string,
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
      i === 0 ? { v: section1Title, s: 6 } : { v: '', s: 6 }
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

    rows.push({ height: 24, cells });
    currentRow1 += 1;
  }

  rows.push({ height: 12, cells: [] });
  currentRow1 += 1;

  rows.push({
    height: 24,
    cells: Array.from({ length: colCount }, (_, i) =>
      i === 0 ? { v: section2Title, s: 6 } : { v: '', s: 6 }
    ),
  });
  merges.push(`A${currentRow1}:${lastCol}${currentRow1}`);

  return { rows, merges };
}

function buildOverviewSheet(
  events: BloodDonationExportEvent[],
  responsesByEventId: Record<string, BloodDonationExportRegistration[]>,
  exporterName: string,
  exportedAtText: string
): SheetSpec {
  const colWidths = [6, 30, 26, 42, 14, 15, 16, 12, 14, 14, 18, 16];
  const colCount = colWidths.length;

  let totalTarget = 0;
  let totalConfirmed = 0;
  let totalCompleted = 0;
  let totalVolumeMl = 0;

  const tableRows: CellSpec[][] = events.map((ev, idx) => {
    const list = responsesByEventId[ev._id] || [];
    const confirmedCount = list.filter((r) => r.status === 'CONFIRMED' || r.status === 'COMPLETED').length;
    const completedList = list.filter((r) => r.status === 'COMPLETED');
    const completedCount = completedList.length;
    const eventVolumeMl = completedList.reduce((sum, r) => sum + (Number(r.donatedVolumeMl) || 0), 0);

    totalTarget += ev.targetDonors || 0;
    totalConfirmed += confirmedCount;
    totalCompleted += completedCount;
    totalVolumeMl += eventVolumeMl;

    return [
      { v: idx + 1, align: 'center', t: 'n' },
      { v: ev.title || '—', bold: true },
      { v: ev.locationName || '—' },
      { v: getEventGoogleMapsUrl(ev) },
      { v: formatDateViShort(ev.eventDate), align: 'center' },
      { v: `${ev.startTime || ''} - ${ev.endTime || ''}`, align: 'center' },
      { v: getNeededBloodTypesText(ev.neededBloodTypes), align: 'center' },
      { v: ev.targetDonors || 0, align: 'right', t: 'n' },
      { v: confirmedCount, align: 'right', t: 'n' },
      { v: completedCount, align: 'right', t: 'n' },
      { v: eventVolumeMl, align: 'right', t: 'n' },
      { v: getEventStatusText(ev.status), align: 'center' },
    ];
  });

  const { rows, merges } = buildFormHeader(
    'BÁO CÁO TỔNG HỢP CÁC ĐỢT HIẾN MÁU TÌNH NGUYỆN',
    `Hệ thống Điều hành Tác chiến & Cứu nạn SOS | Thời gian xuất: ${exportedAtText}`,
    'I. THÔNG TIN BIỂU MẪU & TỔNG HỢP CHỈ SỐ',
    'II. DANH SÁCH TỔNG HỢP CÁC ĐỢT HIẾN MÁU (CHI TIẾT TỪNG ĐỢT Ở CÁC TAB KẾ TIẾP)',
    colCount,
    [
      ['Đơn vị xuất báo cáo:', exporterName, 'Tổng số đợt hiến máu:', events.length],
      ['Tổng người xác nhận:', totalConfirmed, 'Tổng người đã hiến máu:', totalCompleted],
      ['Tổng lượng máu thu được (ml):', totalVolumeMl, 'Số tab chi tiết:', events.length],
    ]
  );

  appendDataTable(
    rows,
    [
      'STT',
      'Tên đợt hiến máu',
      'Địa điểm tổ chức',
      'Link GPS / Google Maps',
      'Ngày tổ chức',
      'Khung giờ',
      'Nhóm máu cần',
      'Chỉ tiêu',
      'Đã xác nhận',
      'Đã hiến máu',
      'Tổng lượng máu (ml)',
      'Trạng thái',
    ],
    tableRows,
    [
      'TỔNG',
      `${events.length} đợt hiến máu`,
      '',
      '',
      '',
      '',
      '',
      totalTarget,
      totalConfirmed,
      totalCompleted,
      totalVolumeMl,
      '',
    ]
  );

  return {
    name: 'Tong hop cac dot',
    colWidths,
    rows,
    merges,
  };
}

function buildEventSheet(
  ev: BloodDonationExportEvent,
  index: number,
  responses: BloodDonationExportRegistration[],
  exporterName: string,
  exportedAtText: string
): SheetSpec {
  const colWidths = [6, 24, 15, 28, 12, 18, 13, 18, 15, 34, 22, 18];
  const colCount = colWidths.length;

  const confirmedCount = responses.filter((r) => r.status === 'CONFIRMED' || r.status === 'COMPLETED').length;
  const completedList = responses.filter((r) => r.status === 'COMPLETED');
  const completedCount = completedList.length;
  const totalVolumeMl = completedList.reduce((sum, r) => sum + (Number(r.donatedVolumeMl) || 0), 0);
  const googleMapsUrl = getEventGoogleMapsUrl(ev);

  const { rows, merges } = buildFormHeader(
    `PHIẾU THEO DÕI ĐỢT HIẾN MÁU: ${ev.title.toUpperCase()}`,
    `Địa điểm: ${ev.locationName} (${ev.address || ev.areaName || '—'}) | Xuất lúc: ${exportedAtText}`,
    'I. THÔNG TIN ĐỢT HIẾN MÁU & KẾT QUẢ TIẾP NHẬN',
    'II. DANH SÁCH NGƯỜI THAM GIA & KẾT QUẢ HIẾN MÁU',
    colCount,
    [
      ['Tên đợt hiến máu:', ev.title, 'Ngày & Khung giờ:', `${formatDateViShort(ev.eventDate)} (${ev.startTime} - ${ev.endTime})`],
      ['Đơn vị tổ chức:', `${ev.organizerName || '—'}${ev.contactPhone ? ` (${ev.contactPhone})` : ''}`, 'Khu vực / Nhóm máu cần:', `${ev.areaName || 'Toàn hệ thống'} | ${getNeededBloodTypesText(ev.neededBloodTypes)}`],
      ['Chỉ tiêu / Đã xác nhận:', `${ev.targetDonors || 0} / ${confirmedCount} người`, 'Đã hiến máu / Tổng lượng máu:', `${completedCount} người / ${totalVolumeMl} ml`],
      ['Trạng thái đợt:', getEventStatusText(ev.status), 'Link GPS / Google Maps:', googleMapsUrl],
      ['Người xuất báo cáo:', exporterName, 'Thời gian xuất:', exportedAtText],
    ]
  );

  const tableRows: CellSpec[][] = responses.map((r, idx) => [
    { v: idx + 1, align: 'center', t: 'n' },
    { v: r.fullName || r.userId?.fullName || '—', bold: true },
    { v: r.phone || r.userId?.phone || '—', align: 'center' },
    { v: r.userId?.email || '—' },
    { v: r.bloodType === 'UNKNOWN' ? 'Chưa rõ' : r.bloodType || '—', align: 'center', bold: r.bloodType !== 'UNKNOWN' },
    {
      v: r.status === 'COMPLETED' && r.donatedVolumeMl ? Number(r.donatedVolumeMl) : 0,
      align: 'right',
      t: 'n',
    },
    {
      v: r.weightKg !== null && r.weightKg !== undefined ? Number(r.weightKg) : 0,
      align: 'right',
      t: 'n',
    },
    { v: getRegistrationStatusText(r.status), align: 'center' },
    { v: r.preferredTimeSlot || '—', align: 'center' },
    { v: r.address || r.userId?.address || r.areaName || r.provinceName || '—' },
    { v: r.note || '—' },
    { v: formatDateTimeViShort(r.respondedAt || r.createdAt), align: 'center' },
  ]);

  appendDataTable(
    rows,
    [
      'STT',
      'Họ và tên',
      'Số điện thoại',
      'Email',
      'Nhóm máu',
      'Lượng máu hiến (ml)',
      'Cân nặng (kg)',
      'Trạng thái',
      'Khung giờ',
      'Địa chỉ',
      'Ghi chú',
      'Thời gian xác nhận',
    ],
    tableRows,
    [
      'TỔNG',
      `${responses.length} người (${completedCount} đã hiến)`,
      '',
      '',
      '',
      totalVolumeMl,
      '',
      '',
      '',
      '',
      '',
      '',
    ]
  );

  const shortTitle = (ev.title || `Dot ${index + 1}`)
    .replace(/[:\\/?*[\]]/g, ' ')
    .trim();
  const sheetName = `Dot ${index + 1} - ${shortTitle}`.slice(0, 31);

  return {
    name: sheetName,
    colWidths,
    rows,
    merges,
  };
}

export function exportBloodDonationsExcel({
  events,
  responsesByEventId,
  exporterName = 'Quản trị viên SOS',
}: ExportBloodDonationsExcelOptions): void {
  const exportedAtText = formatDateTimeViShort(new Date().toISOString());
  const sheets: SheetSpec[] = [
    buildOverviewSheet(events, responsesByEventId, exporterName, exportedAtText),
    ...events.map((ev, idx) =>
      buildEventSheet(ev, idx, responsesByEventId[ev._id] || [], exporterName, exportedAtText)
    ),
  ];

  const dateSlug = new Date().toISOString().slice(0, 10);
  exportWorkbookSheets(sheets, `Bao_cao_hien_mau_theo_dot_${dateSlug}.xlsx`);
}

export function exportSingleBloodDonationEventExcel(
  event: BloodDonationExportEvent,
  responses: BloodDonationExportRegistration[],
  exporterName = 'Quản trị viên SOS'
): void {
  const exportedAtText = formatDateTimeViShort(new Date().toISOString());
  const sheet = buildEventSheet(event, 0, responses, exporterName, exportedAtText);
  const safeTitle = (event.title || 'dot_hien_mau')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 45);
  const dateSlug = new Date().toISOString().slice(0, 10);
  exportWorkbookSheets([sheet], `Phieu_hien_mau_${safeTitle}_${dateSlug}.xlsx`);
}

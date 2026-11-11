import type { AuditLogItem } from '@/types/dashboard';
import type { User } from '@/types/auth';

// Từ điển chuyển đổi các mã hành động thành nhãn tiếng Việt dễ hiểu
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CITIZEN_CREATE_SOS: 'Gửi yêu cầu cứu nạn khẩn cấp',
  CITIZEN_CANCEL_SOS: 'Hủy yêu cầu cứu nạn',
  UPDATE_SOS: 'Cập nhật yêu cầu cứu nạn',
  COMPLETE_SOS: 'Hoàn tất toàn bộ ca cứu nạn',
  CITIZEN_REPORT_HAZARD: 'Báo cáo điểm nguy hiểm / ngập lụt',
  AUTHORITY_VERIFY_SOS: 'Xác minh yêu cầu SOS',
  VERIFY_SOS: 'Xác minh yêu cầu SOS',
  AUTHORITY_ASSIGN_MISSION: 'Phân công lực lượng cứu nạn cho ca SOS',
  AUTHORITY_REASSIGN_MISSION: 'Điều phối lại lực lượng cứu trợ',
  AUTHORITY_CANCEL_MISSION: 'Hủy lệnh phân công cứu nạn',
  AUTHORITY_APPROVE_HAZARD: 'Phê duyệt điểm nguy hiểm lên bản đồ',
  AUTHORITY_REJECT_HAZARD: 'Từ chối duyệt điểm nguy hiểm',
  AUTHORITY_DELETE_HAZARD: 'Xóa điểm nguy hiểm',
  RESCUER_ACCEPT_MISSION: 'Tiếp nhận phân công nhiệm vụ cứu hộ',
  RESCUER_IN_PROGRESS_MISSION: 'Đang di chuyển / Đang triển khai cứu hộ',
  RESCUER_COMPLETED_MISSION: 'Hoàn thành nhiệm vụ được giao',
  RESCUER_CANCELLED_MISSION: 'Hủy phân công nhiệm vụ',
  CREATE_ALERT: 'Phát cảnh báo khẩn cấp diện rộng',
  CANCEL_ALERT: 'Hủy cảnh báo diện rộng',
  CREATE_SAFE_LOCATION: 'Thêm mới trạm trú ẩn / điểm sơ tán',
  UPDATE_SAFE_LOCATION: 'Cập nhật thông tin trạm trú ẩn',
  ADMIN_CREATE_USER: 'Tạo tài khoản cán bộ mới',
  ADMIN_UPDATE_USER: 'Cập nhật tài khoản người dùng',
  ADMIN_UPDATE_USER_STATUS: 'Thay đổi trạng thái tài khoản',
  ADMIN_VERIFY_USER: 'Xác minh tài khoản người dùng',
  ADMIN_UPDATE_USER_ROLES: 'Phân quyền vai trò người dùng',
  ADMIN_DELETE_USER: 'Xóa tài khoản người dùng',
  ADMIN_VERIFY_RESCUER: 'Xác minh hồ sơ cứu hộ viên',
  ADMIN_CREATE_AREA: 'Thêm mới khu vực hành chính',
  ADMIN_UPDATE_AREA: 'Cập nhật khu vực hành chính',
  ADMIN_SYNC_AREAS: 'Đồng bộ khu vực hành chính từ API',
  CREATE_RESCUE_TEAM: 'Thành lập đội cứu hộ mới',
  UPDATE_RESCUE_TEAM: 'Cập nhật thông tin đội cứu hộ',
  DELETE_RESCUE_TEAM: 'Giải thể đội cứu hộ',
  TEAM_ADD_MEMBER: 'Bổ sung thành viên vào đội cứu hộ',
  TEAM_REMOVE_MEMBER: 'Loại thành viên khỏi đội cứu hộ',
  TEAM_CHANGE_LEADER: 'Thay đổi đội trưởng đội cứu hộ',
  RESCUER_UPDATE_AVAILABILITY: 'Cập nhật trạng thái sẵn sàng trực chiến',
  RESCUER_UPDATE_SKILLS: 'Cập nhật kỹ năng tác chiến cứu hộ',
  RESCUER_UPDATE_PROFILE: 'Cập nhật hồ sơ cứu hộ viên',
  UPDATE_PROFILE: 'Cập nhật hồ sơ cá nhân & chức vụ',
  VERIFY_PHONE: 'Xác thực số điện thoại qua OTP',
};

// Từ điển chuyển đổi các khóa metadata thành tiếng Việt rõ ràng
export const AUDIT_META_KEY_LABELS: Record<string, string> = {
  doiCuuHo: 'Đội cứu hộ',
  phuongTien: 'Phương tiện',
  khuVuc: 'Khu vực',
  mucDo: 'Mức độ',
  nguoiGoi: 'Người gọi',
  sosCode: 'Mã SOS',
  tieuDe: 'Tiêu đề',
  kenhPhat: 'Kênh phát',
  soNguoiCuuDuoc: 'Số người cứu được',
  tramTruAn: 'Trạm trú ẩn',
  sosId: 'Mã SOS',
  teamName: 'Đội cứu hộ',
  teamId: 'Mã đội cứu hộ',
  rescuerId: 'Cứu hộ viên',
  leaderId: 'Đội trưởng',
  areaId: 'Mã địa bàn',
  areaName: 'Khu vực quản lý',
  updatedFields: 'Nội dung thay đổi',
  status: 'Trạng thái',
  verificationStatus: 'Trạng thái',
  availabilityStatus: 'Trạng thái trực chiến',
  severity: 'Mức độ',
  title: 'Tiêu đề',
  type: 'Loại',
  note: 'Ghi chú',
  reason: 'Lý do',
  fullName: 'Họ và tên',
  phone: 'Số điện thoại',
  email: 'Email',
  authority: 'Cơ quan chỉ huy',
  organizationName: 'Đơn vị công tác',
  position: 'Chức vụ',
  department: 'Phòng ban / Đơn vị',
  provinceCode: 'Mã Tỉnh / TP',
  wardCode: 'Mã Phường / Xã',
  code: 'Mã hiệu',
  level: 'Cấp độ',
  name: 'Tên',
  roles: 'Vai trò',
  role: 'Vai trò',
  resultSummary: 'Kết quả',
  channel: 'Kênh',
  messageId: 'Mã tin nhắn',
  senderName: 'Người gửi',
  receiverName: 'Người nhận',
  priority: 'Độ ưu tiên',
  victimCount: 'Số lượng người',
  urgency: 'Mức độ khẩn cấp',
  description: 'Mô tả',
  address: 'Địa chỉ',
  location: 'Vị trí',
  coordinates: 'Tọa độ GPS',
  skills: 'Kỹ năng',
  vehicleType: 'Phương tiện',
};

export interface ExportAuditLogsOptions {
  logs: AuditLogItem[];
  user?: User | null;
  scopeName?: string;
  roleFilter?: string;
  searchTerm?: string;
}

interface CellSpec {
  v: string | number;
  t?: 'n' | 's';
  s?: number;
}

interface RowSpec {
  height?: number;
  cells: (CellSpec | null)[];
}

interface SheetSpec {
  name: string;
  colWidths: number[];
  rows: RowSpec[];
  merges: string[];
}

function xmlEscape(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cellRef(rowIdx1: number, colIdx0: number): string {
  let colName = '';
  let temp = colIdx0;
  while (temp >= 0) {
    colName = String.fromCharCode((temp % 26) + 65) + colName;
    temp = Math.floor(temp / 26) - 1;
  }
  return `${colName}${rowIdx1}`;
}

const formatDateTime = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const secs = String(d.getSeconds()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${hours}:${mins}:${secs} ${day}/${month}/${year}`;
  } catch {
    return dateStr || '—';
  }
};

const formatRoleText = (roleStr: string): string => {
  const r = (roleStr || '').toUpperCase();
  if (
    r.includes('LOCAL_AUTHORITY') ||
    r.includes('AUTHORITY') ||
    r.includes('CHỈ HUY') ||
    r.includes('ĐỊA PHƯƠNG') ||
    r.includes('CHÍNH QUYỀN') ||
    r.includes('TRỰC BAN') ||
    r.includes('BCH') ||
    r.includes('DISPATCHER')
  ) {
    return 'Chính quyền địa phương';
  }
  if (r.includes('ADMIN') || r.includes('QUẢN TRỊ')) {
    return 'Quản trị viên';
  }
  if (r.includes('RESCUER') || r.includes('CỨU HỘ') || r.includes('ĐỘI TRƯỞNG') || r.includes('THỰC ĐỊA')) {
    return 'Đội cứu hộ';
  }
  if (r.includes('CITIZEN') || r.includes('NGƯỜI DÂN') || r.includes('DÂN')) {
    return 'Người dân';
  }
  return roleStr || 'Khác';
};

const formatMetadataSummary = (meta?: Record<string, unknown>): string => {
  if (!meta || typeof meta !== 'object' || Object.keys(meta).length === 0) {
    return '—';
  }

  const ignoredKeys = new Set([
    'fullname', 'hoten', 'phone', 'sodienthoai', 'sdt', 'email',
    'authority', 'organizationname', 'position', 'chucvu', 'department',
    'phongban', 'provincecode', 'wardcode', 'roles', 'role', 'name',
    'actorname', 'actoremail', 'actorphone', 'actorrole'
  ]);

  const items: string[] = [];

  for (const [key, rawVal] of Object.entries(meta)) {
    if (rawVal === null || rawVal === undefined || rawVal === '') continue;
    const lowerKey = key.toLowerCase();
    if (ignoredKeys.has(lowerKey)) continue;

    let label = AUDIT_META_KEY_LABELS[key] || key;
    let valStr = '';

    if (typeof rawVal === 'object') {
      if (Array.isArray(rawVal)) {
        valStr = rawVal.join(', ');
      } else {
        const obj = rawVal as Record<string, unknown>;
        if (obj.name) valStr = String(obj.name);
        else if (obj.title) valStr = String(obj.title);
        else {
          valStr = Object.entries(obj)
            .map(([k, v]) => `${AUDIT_META_KEY_LABELS[k] || k}: ${v}`)
            .join('; ');
        }
      }
    } else {
      valStr = String(rawVal);
      // Dịch trạng thái phổ biến
      const valUpper = valStr.toUpperCase();
      if (valUpper === 'PENDING') valStr = 'Chờ xử lý';
      else if (valUpper === 'VERIFIED') valStr = 'Đã xác minh';
      else if (valUpper === 'ASSIGNED') valStr = 'Đã phân công';
      else if (valUpper === 'IN_PROGRESS') valStr = 'Đang cứu hộ';
      else if (valUpper === 'COMPLETED') valStr = 'Đã hoàn thành';
      else if (valUpper === 'REJECTED') valStr = 'Đã từ chối';
      else if (valUpper === 'CANCELLED') valStr = 'Đã hủy';
    }

    if (valStr && valStr !== '—') {
      items.push(`${label}: ${valStr}`);
    }
  }

  return items.length > 0 ? items.join(' | ') : '—';
};

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="9">
    <font><sz val="10"/><color rgb="FF0F172A"/><name val="Segoe UI"/></font>
    <font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>
    <font><b/><sz val="11.5"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>
    <font><b/><sz val="10"/><color rgb="FF1E3A8A"/><name val="Segoe UI"/></font>
    <font><b/><sz val="10"/><color rgb="FF334155"/><name val="Segoe UI"/></font>
    <font><b/><sz val="10.5"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Segoe UI"/></font>
    <font><i/><sz val="9.5"/><color rgb="FF64748B"/><name val="Segoe UI"/></font>
    <font><b/><sz val="11"/><color rgb="FF1E3A8A"/><name val="Segoe UI"/></font>
  </fonts>
  <fills count="9">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E40AF"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/></patternFill></fill>
  </fills>
  <borders count="5">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FF1E40AF"/></left>
      <right style="thin"><color rgb="FF1E40AF"/></right>
      <top style="medium"><color rgb="FF1E3A8A"/></top>
      <bottom style="medium"><color rgb="FF1E3A8A"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FF94A3B8"/></left>
      <right style="thin"><color rgb="FF94A3B8"/></right>
      <top style="medium"><color rgb="FF1D4ED8"/></top>
      <bottom style="double"><color rgb="FF1D4ED8"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left/><right/><top/><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="17">
    <!-- 0: Default -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <!-- 1: Big Title Banner (Navy Blue, White bold 14pt, center) -->
    <xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 2: Subtitle Banner (Royal Blue, White bold 11.5pt, center) -->
    <xf numFmtId="0" fontId="2" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 3: Meta Info Key (Light blue fill, Bold Navy, left) -->
    <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" indent="1"/>
    </xf>
    <!-- 4: Meta Info Value (Light blue fill, Regular, left) -->
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" indent="1"/>
    </xf>
    <!-- 5: Table Header Column (Blue 1D4ED8, White bold 10.5pt, center, wrapText) -->
    <xf numFmtId="0" fontId="5" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <!-- 6: Data Cell Left (White fill, border 1, wrapText) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" wrapText="1"/>
    </xf>
    <!-- 7: Data Cell Center (White fill, border 1) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 8: Data Cell Right Number (White fill, border 1) -->
    <xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 9: Zebra Cell Left (Soft slate F8FAFC, border 1, wrapText) -->
    <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" wrapText="1"/>
    </xf>
    <!-- 10: Zebra Cell Center (Soft slate F8FAFC, border 1) -->
    <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 11: Zebra Cell Right Number (Soft slate F8FAFC, border 1) -->
    <xf numFmtId="0" fontId="6" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 12: Total Summary Row Cell Left (Bold, fill 5, border 3) -->
    <xf numFmtId="0" fontId="8" fillId="5" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" indent="1"/>
    </xf>
    <!-- 13: Total Summary Row Cell Center (Bold, fill 5, border 3) -->
    <xf numFmtId="0" fontId="8" fillId="5" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 14: Card Stat Value (Large bold navy, center, border 1) -->
    <xf numFmtId="0" fontId="8" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 15: Card Stat Label (Gray text, center, border 1) -->
    <xf numFmtId="0" fontId="4" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 16: Footnote / Italic Note (center) -->
    <xf numFmtId="0" fontId="7" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>`;
}

function buildWorksheetXml(sheet: SheetSpec): string {
  const colsXml = sheet.colWidths
    .map((w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  const rowsXml = sheet.rows
    .map((row, rIdx) => {
      const rNum = rIdx + 1;
      const htAttr = row.height ? ` ht="${row.height}" customHeight="1"` : '';
      if (!row.cells || row.cells.length === 0) {
        return `<row r="${rNum}"${htAttr}/>`;
      }
      const cellsXml = row.cells
        .map((c, cIdx) => {
          if (!c) return '';
          const ref = cellRef(rNum, cIdx);
          const sAttr = c.s !== undefined ? ` s="${c.s}"` : '';
          if (c.t === 'n' && typeof c.v === 'number' && Number.isFinite(c.v)) {
            return `<c r="${ref}"${sAttr} t="n"><v>${c.v}</v></c>`;
          }
          return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(
            String(c.v ?? '')
          )}</t></is></c>`;
        })
        .join('');
      return `<row r="${rNum}"${htAttr}>${cellsXml}</row>`;
    })
    .join('');

  const mergesXml =
    sheet.merges.length > 0
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges
          .map((m) => `<mergeCell ref="${m}"/>`)
          .join('')}</mergeCells>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0" showGridLines="1"/></sheetViews>
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml}</sheetData>
  ${mergesXml}
</worksheet>`;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipArchive(files: { name: string; content: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const entries = files.map((f) => {
    const nameBytes = encoder.encode(f.name);
    const dataBytes = encoder.encode(f.content);
    const crc = crc32(dataBytes);
    return { nameBytes, dataBytes, crc, offset: 0 };
  });

  let localSize = 0;
  let centralSize = 0;
  for (const e of entries) {
    e.offset = localSize;
    localSize += 30 + e.nameBytes.length + e.dataBytes.length;
    centralSize += 46 + e.nameBytes.length;
  }

  const totalSize = localSize + centralSize + 22;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  let pos = 0;
  for (const e of entries) {
    view.setUint32(pos, 0x04034b50, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 0x0800, true);
    view.setUint16(pos + 8, 0, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, 0, true);
    view.setUint32(pos + 14, e.crc, true);
    view.setUint32(pos + 18, e.dataBytes.length, true);
    view.setUint32(pos + 22, e.dataBytes.length, true);
    view.setUint16(pos + 26, e.nameBytes.length, true);
    view.setUint16(pos + 28, 0, true);
    out.set(e.nameBytes, pos + 30);
    out.set(e.dataBytes, pos + 30 + e.nameBytes.length);
    pos += 30 + e.nameBytes.length + e.dataBytes.length;
  }

  const centralOffset = pos;
  for (const e of entries) {
    view.setUint32(pos, 0x02014b50, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 20, true);
    view.setUint16(pos + 8, 0x0800, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, 0, true);
    view.setUint16(pos + 14, 0, true);
    view.setUint32(pos + 16, e.crc, true);
    view.setUint32(pos + 20, e.dataBytes.length, true);
    view.setUint32(pos + 24, e.dataBytes.length, true);
    view.setUint16(pos + 28, e.nameBytes.length, true);
    view.setUint16(pos + 30, 0, true);
    view.setUint16(pos + 32, 0, true);
    view.setUint16(pos + 34, 0, true);
    view.setUint16(pos + 36, 0, true);
    view.setUint32(pos + 38, 0, true);
    view.setUint32(pos + 42, e.offset, true);
    out.set(e.nameBytes, pos + 46);
    pos += 46 + e.nameBytes.length;
  }

  const centralSizeTotal = pos - centralOffset;
  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 4, 0, true);
  view.setUint16(pos + 6, 0, true);
  view.setUint16(pos + 8, entries.length, true);
  view.setUint16(pos + 10, entries.length, true);
  view.setUint32(pos + 12, centralSizeTotal, true);
  view.setUint32(pos + 16, centralOffset, true);
  view.setUint16(pos + 20, 0, true);

  return out;
}

/**
 * XUẤT TẬP TIN EXCEL (.XLSX) CHUYÊN NGHIỆP CHO AUDIT LOGS
 * Hỗ trợ cả 2 vai trò: Local Authority (Địa phương) và Admin (Toàn hệ thống)
 */
export function exportAuditLogsToExcel({
  logs,
  user,
  scopeName,
  roleFilter = 'ALL',
  searchTerm = '',
}: ExportAuditLogsOptions) {
  const isAdmin = Boolean(
    user?.roles?.includes('ADMIN') || (user as any)?.role === 'ADMIN'
  );

  const officialScope =
    scopeName ||
    (isAdmin
      ? 'Toàn hệ thống (Ban Quản trị SOS)'
      : user?.authority?.areaName
      ? `UBND / Ban Chỉ Huy PCTT ${user.authority.areaName}`
      : 'Cơ quan Cứu nạn Địa phương');

  const now = new Date();
  const printTimeStr = formatDateTime(now.toISOString());
  const exporterName = user?.fullName || 'Cán bộ trực ban điều hành';
  const exporterTitle =
    user?.authority?.position ||
    (isAdmin ? 'Quản trị viên Hệ thống' : 'Chuyên viên Điều phối Cứu nạn');

  // Thống kê nhanh
  const totalCount = logs.length;
  const citizenCount = logs.filter((l) => (l.actorRole || '').toUpperCase().includes('CITIZEN')).length;
  const rescuerCount = logs.filter((l) => (l.actorRole || '').toUpperCase().includes('RESCUER')).length;
  const authorityCount = logs.filter((l) => {
    const r = (l.actorRole || '').toUpperCase();
    return r.includes('AUTHORITY') || r.includes('CHỈ HUY') || r.includes('TRỰC BAN') || r.includes('DISPATCHER');
  }).length;
  const adminCount = logs.filter((l) => (l.actorRole || '').toUpperCase().includes('ADMIN')).length;

  // -------------------------------------------------------------
  // SHEET 1: NHẬT KÝ CHI TIẾT ĐẦY ĐỦ CÁC CỘT HÀNG
  // -------------------------------------------------------------
  const colWidths = [
    7,   // A: STT
    22,  // B: Thời gian
    25,  // C: Người thực hiện
    22,  // D: Vai trò
    16,  // E: Số điện thoại
    26,  // F: Email
    32,  // G: Cơ quan / Đơn vị
    24,  // H: Chức vụ
    36,  // I: Hành động nghiệp vụ
    25,  // J: Mã hành động
    16,  // K: Loại đối tượng
    24,  // L: Mã đối tượng / SOS
    25,  // M: Khu vực / Địa bàn
    55,  // N: Thông số & Chi tiết tác chiến
  ];

  const sheet1Rows: RowSpec[] = [];
  const sheet1Merges: string[] = [];

  // Row 1: Banner chính
  sheet1Rows.push({
    height: 30,
    cells: [
      { v: 'HỆ THỐNG ĐIỀU HÀNH CỨU HỘ CỨU NẠN KHẨN CẤP (SOS SYSTEMS)', s: 1 },
      ...Array(13).fill(null),
    ],
  });
  sheet1Merges.push('A1:N1');

  // Row 2: Tiêu đề báo cáo
  sheet1Rows.push({
    height: 24,
    cells: [
      { v: 'BÁO CÁO NHẬT KÝ KIỂM TOÁN TÁC CHIẾN & LỊCH SỬ THAO TÁC HỆ THỐNG', s: 2 },
      ...Array(13).fill(null),
    ],
  });
  sheet1Merges.push('A2:N2');

  // Row 3: Dòng trống
  sheet1Rows.push({ height: 10, cells: [] });

  // Row 4: Metadata dòng 1
  sheet1Rows.push({
    height: 20,
    cells: [
      { v: 'Phạm vi trích xuất:', s: 3 },
      { v: officialScope, s: 4 },
      null, null,
      { v: 'Thời gian xuất file:', s: 3 },
      { v: printTimeStr, s: 4 },
      null, null,
      { v: 'Người lập báo cáo:', s: 3 },
      { v: `${exporterName} (${exporterTitle})`, s: 4 },
      null, null, null, null,
    ],
  });
  sheet1Merges.push('B4:D4', 'F4:H4', 'J4:N4');

  // Row 5: Metadata dòng 2
  const filterLabel =
    roleFilter === 'ALL'
      ? 'Tất cả các vai trò'
      : roleFilter === 'CITIZEN'
      ? 'Chỉ người dân'
      : roleFilter === 'RESCUER'
      ? 'Chỉ đội cứu hộ'
      : roleFilter === 'AUTHORITY'
      ? 'Chỉ chính quyền / điều phối'
      : 'Chỉ quản trị viên';

  sheet1Rows.push({
    height: 20,
    cells: [
      { v: 'Bộ lọc vai trò:', s: 3 },
      { v: filterLabel, s: 4 },
      null, null,
      { v: 'Từ khóa tìm kiếm:', s: 3 },
      { v: searchTerm ? `"${searchTerm}"` : 'Không áp dụng', s: 4 },
      null, null,
      { v: 'Tổng số sự kiện:', s: 3 },
      { v: `${totalCount} sự kiện tác chiến được ghi nhận`, s: 4 },
      null, null, null, null,
    ],
  });
  sheet1Merges.push('B5:D5', 'F5:H5', 'J5:N5');

  // Row 6: Dòng trống
  sheet1Rows.push({ height: 12, cells: [] });

  // Row 7: Tiêu đề bảng cột (Header table)
  const headers = [
    'STT',
    'Thời gian',
    'Người thực hiện',
    'Vai trò',
    'Số điện thoại',
    'Email liên hệ',
    'Cơ quan / Đơn vị',
    'Chức vụ',
    'Hành động nghiệp vụ',
    'Mã hành động',
    'Loại đối tượng',
    'Mã đối tượng / SOS',
    'Khu vực / Địa bàn',
    'Thông số & Chi tiết tác chiến',
  ];

  sheet1Rows.push({
    height: 32,
    cells: headers.map((h) => ({ v: h, s: 5 })),
  });

  // Render các hàng dữ liệu (Rows)
  logs.forEach((log, idx) => {
    const isZebra = idx % 2 === 1;
    const actor = typeof log.actorId === 'object' && log.actorId !== null ? log.actorId : null;
    const meta = (log.metadata || {}) as Record<string, unknown>;

    // Họ tên
    const actorName =
      actor?.fullName ||
      (typeof log.actorId === 'string' ? log.actorId : '') ||
      (meta.fullName as string) ||
      (meta.hoTen as string) ||
      '—';

    // Vai trò
    const roleText = formatRoleText(log.actorRole || '');

    // SĐT
    const actorPhone =
      actor?.phone ||
      (meta.phone as string) ||
      (meta.soDienThoai as string) ||
      (meta.sdt as string) ||
      '—';

    // Email
    const actorEmail =
      actor?.email ||
      (meta.email as string) ||
      '—';

    // Đơn vị
    let orgName =
      actor?.authority?.organizationName ||
      (typeof meta.authority === 'object' && meta.authority !== null && 'organizationName' in meta.authority
        ? (meta.authority as any).organizationName
        : typeof meta.authority === 'string' && meta.authority
        ? meta.authority
        : '') ||
      (meta.organizationName as string) ||
      (meta.donVi as string) ||
      (meta.department as string) ||
      (meta.phongBan as string) ||
      '';

    if (!orgName) {
      const rUpper = (log.actorRole || '').toUpperCase();
      if (rUpper.includes('AUTHORITY') || rUpper.includes('CHỈ HUY') || rUpper.includes('ĐỊA PHƯƠNG')) {
        if (log.areaId && typeof log.areaId === 'object' && log.areaId.name) {
          orgName = `Ban Chỉ Huy PCTT & TKCN ${log.areaId.name}`;
        } else if (actor?.authority?.areaName) {
          orgName = `Ban Chỉ Huy PCTT & TKCN ${actor.authority.areaName}`;
        } else {
          orgName = 'Ban Chỉ Huy PCTT & TKCN Địa Phương';
        }
      } else if (rUpper.includes('ADMIN')) {
        orgName = 'Trung tâm Quản trị Hệ thống Cứu nạn';
      } else if (rUpper.includes('RESCUER')) {
        orgName = (meta.teamName as string) || (meta.doiCuuHo as string) || 'Đội Cứu hộ Thực địa';
      } else {
        orgName = 'Công dân địa phương';
      }
    }

    // Chức vụ
    let position =
      actor?.authority?.position ||
      (typeof meta.authority === 'object' && meta.authority !== null && 'position' in meta.authority
        ? (meta.authority as any).position
        : '') ||
      (meta.position as string) ||
      (meta.chucVu as string) ||
      '';

    if (!position) {
      const rUpper = (log.actorRole || '').toUpperCase();
      if (rUpper.includes('AUTHORITY') || rUpper.includes('CHỈ HUY') || rUpper.includes('ĐỊA PHƯƠNG')) {
        position = 'Chuyên viên Điều phối Tác chiến';
      } else if (rUpper.includes('ADMIN')) {
        position = 'Quản trị viên Hệ thống';
      } else if (rUpper.includes('RESCUER')) {
        position = 'Cứu hộ viên';
      } else {
        position = 'Người dân';
      }
    }

    // Hành động
    const actionLabel = AUDIT_ACTION_LABELS[log.action] || log.action;
    const actionCode = log.action || '—';
    const entityType = log.entityType || '—';

    // Mã đối tượng / SOS Code
    const entityId =
      (meta.sosCode as string) ||
      (meta.code as string) ||
      (meta.sosId as string) ||
      log.entityId ||
      '—';

    // Khu vực
    let areaName = '—';
    if (log.areaId && typeof log.areaId === 'object' && log.areaId.name) {
      areaName = log.areaId.name;
    } else if (actor?.authority?.areaName) {
      areaName = actor.authority.areaName;
    } else if (meta.khuVuc) {
      areaName = String(meta.khuVuc);
    } else if (meta.areaName) {
      areaName = String(meta.areaName);
    }

    // Chi tiết
    const detailsText = formatMetadataSummary(meta);

    // Style indexes:
    // Left: 6 (normal) or 9 (zebra)
    // Center: 7 (normal) or 10 (zebra)
    // Right: 8 (normal) or 11 (zebra)
    const sLeft = isZebra ? 9 : 6;
    const sCenter = isZebra ? 10 : 7;

    sheet1Rows.push({
      height: 24,
      cells: [
        { v: idx + 1, t: 'n', s: sCenter },
        { v: formatDateTime(log.createdAt), s: sCenter },
        { v: actorName, s: sLeft },
        { v: roleText, s: sCenter },
        { v: actorPhone, s: sCenter },
        { v: actorEmail, s: sLeft },
        { v: orgName, s: sLeft },
        { v: position, s: sLeft },
        { v: actionLabel, s: sLeft },
        { v: actionCode, s: sCenter },
        { v: entityType, s: sCenter },
        { v: entityId, s: sCenter },
        { v: areaName, s: sLeft },
        { v: detailsText, s: sLeft },
      ],
    });
  });

  // Hàng tổng kết ở cuối bảng
  sheet1Rows.push({
    height: 26,
    cells: [
      { v: 'TỔNG CỘNG', s: 13 },
      { v: `${totalCount} sự kiện`, s: 12 },
      null, null, null, null, null, null, null, null, null, null, null, null,
    ],
  });
  sheet1Merges.push(`B${sheet1Rows.length}:N${sheet1Rows.length}`);

  // Dòng chữ ký xác nhận
  sheet1Rows.push({ height: 18, cells: [] });
  sheet1Rows.push({
    height: 22,
    cells: [
      null,
      { v: 'NGƯỜI LẬP BÁO CÁO', s: 3 },
      null, null, null, null, null, null, null,
      { v: 'CÁN BỘ / CHỈ HUY XÁC NHẬN', s: 3 },
      null, null, null, null,
    ],
  });
  sheet1Merges.push(`B${sheet1Rows.length}:D${sheet1Rows.length}`, `J${sheet1Rows.length}:M${sheet1Rows.length}`);

  sheet1Rows.push({
    height: 48,
    cells: [
      null,
      { v: `(Ký, ghi rõ họ tên)\n\n${exporterName}`, s: 16 },
      null, null, null, null, null, null, null,
      { v: `(Ký, đóng dấu xác nhận)\n\n${officialScope}`, s: 16 },
      null, null, null, null,
    ],
  });
  sheet1Merges.push(`B${sheet1Rows.length}:D${sheet1Rows.length}`, `J${sheet1Rows.length}:M${sheet1Rows.length}`);

  // -------------------------------------------------------------
  // SHEET 2: TỔNG HỢP & PHÂN TÍCH THỐNG KÊ (ANALYTICS BREAKDOWN)
  // -------------------------------------------------------------
  const sheet2ColWidths = [8, 32, 20, 20, 30];
  const sheet2Rows: RowSpec[] = [];
  const sheet2Merges: string[] = [];

  sheet2Rows.push({
    height: 28,
    cells: [
      { v: 'BẢNG PHÂN TÍCH THỐNG KÊ NHẬT KÝ KIỂM TOÁN TÁC CHIẾN', s: 1 },
      null, null, null, null,
    ],
  });
  sheet2Merges.push('A1:E1');

  sheet2Rows.push({
    height: 20,
    cells: [
      { v: `Phạm vi: ${officialScope} | Thời gian: ${printTimeStr} | Tổng cộng: ${totalCount} sự kiện`, s: 2 },
      null, null, null, null,
    ],
  });
  sheet2Merges.push('A2:E2');

  sheet2Rows.push({ height: 12, cells: [] });

  // Phần A: Thống kê theo vai trò
  sheet2Rows.push({
    height: 24,
    cells: [{ v: 'A. PHÂN BỐ SỰ KIỆN THEO VAI TRÒ TÁC NHÂN (ACTOR ROLES)', s: 3 }, null, null, null, null],
  });
  sheet2Merges.push('A4:E4');

  sheet2Rows.push({
    height: 26,
    cells: [
      { v: 'STT', s: 5 },
      { v: 'Vai trò tác nhân', s: 5 },
      { v: 'Số sự kiện', s: 5 },
      { v: 'Tỷ lệ %', s: 5 },
      { v: 'Ghi chú nghiệp vụ', s: 5 },
    ],
  });

  const roleStats = [
    { name: 'Người dân (Citizens)', count: citizenCount, note: 'Gửi yêu cầu SOS, báo nguy hiểm, hủy SOS' },
    { name: 'Đội cứu hộ (Rescuers)', count: rescuerCount, note: 'Nhận lệnh, xuất quân, hoàn tất nhiệm vụ' },
    { name: 'Chính quyền địa phương (Authority)', count: authorityCount, note: 'Xác minh SOS, điều động lực lượng, phát tin' },
    { name: 'Quản trị viên (Admin)', count: adminCount, note: 'Quản lý tài khoản, phân quyền, cấu hình' },
  ];

  roleStats.forEach((st, idx) => {
    const isZebra = idx % 2 === 1;
    const sLeft = isZebra ? 9 : 6;
    const sCenter = isZebra ? 10 : 7;
    const pct = totalCount > 0 ? ((st.count / totalCount) * 100).toFixed(1) + '%' : '0%';
    sheet2Rows.push({
      height: 22,
      cells: [
        { v: idx + 1, t: 'n', s: sCenter },
        { v: st.name, s: sLeft },
        { v: st.count, t: 'n', s: sCenter },
        { v: pct, s: sCenter },
        { v: st.note, s: sLeft },
      ],
    });
  });

  // Hàng tổng vai trò
  sheet2Rows.push({
    height: 24,
    cells: [
      { v: '', s: 13 },
      { v: 'TỔNG CỘNG', s: 12 },
      { v: totalCount, t: 'n', s: 13 },
      { v: '100%', s: 13 },
      { v: 'Toàn bộ sự kiện đã ghi nhận', s: 12 },
    ],
  });

  sheet2Rows.push({ height: 16, cells: [] });

  // Phần B: Top các hành động phổ biến nhất
  sheet2Rows.push({
    height: 24,
    cells: [{ v: 'B. TỔNG HỢP CÁC LOẠI HÀNH ĐỘNG NGHIỆP VỤ ĐÃ THỰC HIỆN', s: 3 }, null, null, null, null],
  });
  sheet2Merges.push(`A${sheet2Rows.length}:E${sheet2Rows.length}`);

  sheet2Rows.push({
    height: 26,
    cells: [
      { v: 'STT', s: 5 },
      { v: 'Tên hành động', s: 5 },
      { v: 'Mã hành động hệ thống', s: 5 },
      { v: 'Số lần thực hiện', s: 5 },
      { v: 'Tỷ lệ %', s: 5 },
    ],
  });

  // Gom nhóm hành động
  const actionCounts: Record<string, number> = {};
  logs.forEach((l) => {
    const act = l.action || 'UNKNOWN';
    actionCounts[act] = (actionCounts[act] || 0) + 1;
  });

  const sortedActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]);

  sortedActions.forEach(([actionCode, count], idx) => {
    const isZebra = idx % 2 === 1;
    const sLeft = isZebra ? 9 : 6;
    const sCenter = isZebra ? 10 : 7;
    const actionLabel = AUDIT_ACTION_LABELS[actionCode] || actionCode;
    const pct = totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) + '%' : '0%';

    sheet2Rows.push({
      height: 22,
      cells: [
        { v: idx + 1, t: 'n', s: sCenter },
        { v: actionLabel, s: sLeft },
        { v: actionCode, s: sLeft },
        { v: count, t: 'n', s: sCenter },
        { v: pct, s: sCenter },
      ],
    });
  });

  // Hàng tổng hành động
  sheet2Rows.push({
    height: 24,
    cells: [
      { v: '', s: 13 },
      { v: 'TỔNG CỘNG', s: 12 },
      { v: '', s: 12 },
      { v: totalCount, t: 'n', s: 13 },
      { v: '100%', s: 13 },
    ],
  });

  // -------------------------------------------------------------
  // TẠO FILE ZIP CHUẨN OPENXML (.XLSX)
  // -------------------------------------------------------------
  const sheets: SheetSpec[] = [
    {
      name: 'Nhat_Ky_Chi_Tiet',
      colWidths,
      rows: sheet1Rows,
      merges: sheet1Merges,
    },
    {
      name: 'Tong_Hop_Thong_Ke',
      colWidths: sheet2ColWidths,
      rows: sheet2Rows,
      merges: sheet2Merges,
    },
  ];

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('\n  ')}
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets
      .map(
        (s, i) =>
          `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
      )
      .join('\n    ')}
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('\n  ')}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const files: { name: string; content: string }[] = [
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: rootRelsXml },
    { name: 'xl/workbook.xml', content: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml },
    { name: 'xl/styles.xml', content: buildStylesXml() },
  ];

  sheets.forEach((s, i) => {
    files.push({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      content: buildWorksheetXml(s),
    });
  });

  const zipBytes = createZipArchive(files);
  const blob = new Blob([zipBytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const dateSlug = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeSlug = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
  const scopeSlug = isAdmin ? 'Toan_He_Thong' : 'Dia_Phuong';

  const fileName = `Nhat_Ky_Audit_Log_SOS_${scopeSlug}_${dateSlug}_${timeSlug}.xlsx`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { fileName, count: totalCount };
}


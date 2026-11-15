import type { DispatchHistoryRecord } from '@/api/equipment.api';

const PAGE_W = 1654; // A4 @ 200 DPI (210mm)
const PAGE_H = 2339; // A4 @ 200 DPI (297mm)
const MARGIN_X = 110;
const MARGIN_TOP = 105;
const MARGIN_BOTTOM = 110;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const FONT_FAMILY = '"Segoe UI", Arial, Helvetica, sans-serif';
const MONO_FONT = 'Consolas, "Courier New", monospace';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ đội nhận lệnh',
  ACCEPTED: 'Đội đã nhận lệnh',
  DISPATCHED: 'Đang xuất kho giao',
  EN_ROUTE: 'Đang tiếp tế',
  ON_THE_WAY: 'Đang tiếp tế',
  ARRIVED: 'Đã đến điểm tiếp nhận',
  IN_PROGRESS: 'Đang bàn giao',
  RESCUING: 'Đang bàn giao',
  COMPLETED: 'Đã bàn giao xong',
  DIRECT: 'Xuất trực tiếp tại kho',
  REJECTED: 'Leader đội cứu hộ từ chối',
  CANCELLED: 'Đã hủy lệnh',
};

const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: 'Nguy cấp',
  HIGH: 'Khẩn cấp',
  MEDIUM: 'Trung bình',
  LOW: 'Thấp',
};

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractReadableNote(rec: DispatchHistoryRecord): string | null {
  if (rec.cancelReason) return rec.cancelReason;
  if (!rec.note) return null;
  const parts = rec.note
    .split(' | ')
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith('[Lệnh xuất cấp cứu trợ]'));
  return parts.length > 0 ? parts.join(' • ') : null;
}

function normalizeVoucherArea(areaName?: string | null): string {
  const trimmed = (areaName || '').trim();
  if (!trimmed || /toàn\s*quốc|34\s*tỉnh/i.test(trimmed)) {
    return 'Thành phố Đà Nẵng';
  }
  return trimmed;
}

const GENERIC_RECIPIENT_PLACEHOLDERS = new Set([
  'đầu mối tiếp nhận cứu trợ',
  'người nhận tại hiện trường',
  'chưa xác nhận',
]);

export function isGenericRecipientLabel(value?: string | null): boolean {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return !normalized || GENERIC_RECIPIENT_PLACEHOLDERS.has(normalized);
}

/** Chuẩn hóa tên người ký nhận thực tế: nếu chỉ là chuỗi mặc định thì hiển thị rõ trạng thái chưa ghi tên */
export function formatActualRecipientDisplay(
  actualRecipient?: string | null,
  status?: string | null
): string {
  const trimmed = String(actualRecipient ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return status === 'COMPLETED'
      ? 'Đã bàn giao tại điểm tiếp nhận — chưa ghi tên người ký'
      : 'Chưa xác nhận';
  }
  if (isGenericRecipientLabel(trimmed)) {
    return 'Đã bàn giao tại điểm tiếp nhận — chưa ghi tên người ký';
  }
  return trimmed;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return ['—'];

  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
    } else {
      let chunk = '';
      for (const ch of word) {
        if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      current = chunk;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : ['—'];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string,
  stroke?: string,
  lineWidth = 2
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  align: CanvasTextAlign = 'left'
): number {
  ctx.textAlign = align;
  lines.forEach((line, idx) => {
    ctx.fillText(line, x, y + idx * lineHeight);
  });
  return y + lines.length * lineHeight;
}

function createCanvasPage(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Không thể khởi tạo Canvas để xuất PDF');
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.textBaseline = 'top';
  return { canvas, ctx };
}

function drawFooter(ctx: CanvasRenderingContext2D, pageNo: number, totalPages: number) {
  const footerY = PAGE_H - MARGIN_BOTTOM + 24;
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(MARGIN_X, footerY);
  ctx.lineTo(PAGE_W - MARGIN_X, footerY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = `500 20px ${FONT_FAMILY}`;
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'left';
  ctx.fillText('Hệ thống quản lý điều phối cứu hộ SOS', MARGIN_X, footerY + 16);

  const pageSuffix = totalPages > 1 ? ` • Trang ${pageNo}/${totalPages}` : '';
  ctx.textAlign = 'right';
  ctx.fillText(
    `Thời điểm xuất file: ${new Date().toLocaleString('vi-VN')}${pageSuffix}`,
    PAGE_W - MARGIN_X,
    footerY + 16
  );
  ctx.restore();
}

function drawTableHeader(
  ctx: CanvasRenderingContext2D,
  y: number,
  colWidths: [number, number, number, number, number]
): number {
  const headerH = 54;
  const [wStt, wName, wType, wUnit, wQty] = colWidths;
  const labels = ['STT', 'TÊN THIẾT BỊ / NHU YẾU PHẨM', 'PHÂN LOẠI', 'ĐVT', 'SỐ LƯỢNG'];
  const aligns: CanvasTextAlign[] = ['center', 'left', 'center', 'center', 'right'];
  const widths = [wStt, wName, wType, wUnit, wQty];

  let curX = MARGIN_X;
  ctx.font = `800 20px ${FONT_FAMILY}`;

  widths.forEach((w, idx) => {
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(curX, y, w, headerH);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(curX, y, w, headerH);

    ctx.fillStyle = '#334155';
    ctx.textAlign = aligns[idx];
    const textX =
      aligns[idx] === 'center'
        ? curX + w / 2
        : aligns[idx] === 'right'
          ? curX + w - 16
          : curX + 16;
    ctx.fillText(labels[idx], textX, y + 17);
    curX += w;
  });

  return y + headerH;
}

function renderVoucherCanvases(
  rec: DispatchHistoryRecord,
  areaName?: string | null
): HTMLCanvasElement[] {
  const pages: Array<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> = [];
  const startNewPage = () => {
    const p = createCanvasPage();
    pages.push(p);
    return p;
  };

  let current = startNewPage();
  let ctx = current.ctx;
  let y = MARGIN_TOP;

  const isDirect = rec.mode === 'DIRECT';
  const isCancelled = rec.status === 'REJECTED' || rec.status === 'CANCELLED';
  const statusLabel = STATUS_LABELS[rec.status] || rec.status || 'Không rõ';
  const priorityLabel =
    PRIORITY_LABELS[String(rec.priority || '').toUpperCase()] || rec.priority || 'Tiêu chuẩn';
  const readableNote = extractReadableNote(rec);
  const resolvedArea = normalizeVoucherArea(areaName);
  const items = Array.isArray(rec.items) ? rec.items : [];
  const totalUnits = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  // 1. HEADER
  ctx.textAlign = 'left';
  ctx.font = `800 24px ${FONT_FAMILY}`;
  ctx.fillStyle = '#0f172a';
  ctx.fillText('HỆ THỐNG ĐIỀU PHỐI CỨU HỘ & CỨU TRỢ SOS', MARGIN_X, y);

  ctx.font = `600 21px ${FONT_FAMILY}`;
  ctx.fillStyle = '#475569';
  ctx.fillText(`Ban Chỉ Huy PCTT & TKCN — Khu vực: ${resolvedArea}`, MARGIN_X, y + 34);

  ctx.textAlign = 'right';
  ctx.font = `600 21px ${FONT_FAMILY}`;
  ctx.fillStyle = '#334155';
  ctx.fillText('Mẫu chứng từ: PXK-TT', PAGE_W - MARGIN_X, y);

  ctx.font = `800 24px ${MONO_FONT}`;
  ctx.fillStyle = '#0f172a';
  ctx.fillText(`Số phiếu: ${rec.dispatchCode || 'PXK'}`, PAGE_W - MARGIN_X, y + 30);

  let rightMetaY = y + 62;
  if (rec.sosCode) {
    ctx.font = `700 21px ${FONT_FAMILY}`;
    ctx.fillStyle = '#0f172a';
    ctx.fillText(`Liên kết SOS: ${rec.sosCode}`, PAGE_W - MARGIN_X, rightMetaY);
    rightMetaY += 30;
  }
  ctx.font = `500 21px ${FONT_FAMILY}`;
  ctx.fillStyle = '#334155';
  ctx.fillText(`Ngày lập: ${formatDateTime(rec.createdAt)}`, PAGE_W - MARGIN_X, rightMetaY);

  const headerBottomY = Math.max(y + 72, rightMetaY + 34) + 14;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(MARGIN_X, headerBottomY);
  ctx.lineTo(PAGE_W - MARGIN_X, headerBottomY);
  ctx.stroke();

  y = headerBottomY + 34;

  // 2. TITLE (Không hiển thị badge Trạng thái theo yêu cầu người dùng)
  ctx.textAlign = 'center';
  ctx.font = `800 34px ${FONT_FAMILY}`;
  ctx.fillStyle = '#0f172a';
  ctx.fillText(
    isDirect ? 'PHIẾU XUẤT KHO CỨU TRỢ TRỰC TIẾP' : 'PHIẾU XUẤT KHO & LỆNH ĐIỀU PHỐI TIẾP TẾ',
    PAGE_W / 2,
    y
  );
  y += 46;

  ctx.font = `600 22px ${FONT_FAMILY}`;
  ctx.fillStyle = '#475569';
  ctx.fillText(
    `Hình thức: ${isDirect ? 'Xuất trực tiếp tại kho' : 'Điều phối đội cứu hộ vận chuyển'}  •  Mức độ ưu tiên: ${priorityLabel}`,
    PAGE_W / 2,
    y
  );
  y += 50;

  // 3. CANCEL BANNER (chỉ hiện nếu phiếu đã hủy / từ chối)
  if (isCancelled) {
    const cancelText = `Lưu ý chứng từ đã đóng (${statusLabel}): ${readableNote ? `${readableNote} • ` : ''}${rec.inventoryRestored ? 'Vật tư đã được hoàn nhập lại vào kho.' : 'Chưa ghi nhận hoàn kho tự động.'}`;
    ctx.font = `600 21px ${FONT_FAMILY}`;
    const cancelLines = wrapText(ctx, cancelText, CONTENT_W - 44);
    const boxH = cancelLines.length * 30 + 30;
    drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, boxH, 10, '#fef2f2', '#fca5a5', 2);
    ctx.fillStyle = '#991b1b';
    drawLines(ctx, cancelLines, MARGIN_X + 22, y + 16, 30, 'left');
    y += boxH + 22;
  }

  // 4. ADMINISTRATIVE INFO CARD
  const cardPadX = 28;
  const cardPadY = 24;
  const colGap = 36;
  const halfW = (CONTENT_W - cardPadX * 2 - colGap) / 2;
  const leftColX = MARGIN_X + cardPadX;
  const rightColX = leftColX + halfW + colGap;

  ctx.font = `700 23px ${FONT_FAMILY}`;
  const teamValLines = wrapText(ctx, rec.teamName || 'Kho Tổng / Xuất trực tiếp', halfW);
  const leaderText = [rec.leaderName, rec.teamPhone].filter(Boolean).join(' • ');
  ctx.font = `500 21px ${FONT_FAMILY}`;
  const leaderLines = leaderText ? wrapText(ctx, leaderText, halfW) : [];

  ctx.font = `700 23px ${FONT_FAMILY}`;
  const actorLines = wrapText(ctx, rec.actorName || 'Cán bộ điều phối', halfW);
  const destLines = wrapText(ctx, rec.destination || '—', CONTENT_W - cardPadX * 2);
  const recpLines = wrapText(ctx, rec.recipientName || '—', halfW);
  const actualRecpDisplay = formatActualRecipientDisplay(rec.actualRecipient, rec.status);
  const actualRecpLines = wrapText(ctx, actualRecpDisplay, halfW);
  ctx.font = `500 21px ${FONT_FAMILY}`;
  const noteLines = !isCancelled && readableNote
    ? wrapText(ctx, readableNote, CONTENT_W - cardPadX * 2)
    : [];

  const row1H = Math.max(
    28 + teamValLines.length * 31 + (leaderLines.length ? leaderLines.length * 28 + 4 : 0),
    28 + actorLines.length * 31
  );
  const row2H = 28 + destLines.length * 31;
  const row3H = Math.max(28 + recpLines.length * 31, 28 + actualRecpLines.length * 31);
  const row4H = noteLines.length > 0 ? 28 + noteLines.length * 29 : 0;

  const infoCardH =
    cardPadY * 2 + row1H + 18 + row2H + 18 + row3H + (row4H > 0 ? 18 + row4H : 0);

  drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, infoCardH, 14, '#f8fafc', '#cbd5e1', 2);

  let cy = y + cardPadY;
  const drawField = (
    label: string,
    valLines: string[],
    x: number,
    fy: number,
    subLines: string[] = []
  ) => {
    ctx.textAlign = 'left';
    ctx.font = `700 18.5px ${FONT_FAMILY}`;
    ctx.fillStyle = '#64748b';
    ctx.fillText(label, x, fy);

    ctx.font = `700 23px ${FONT_FAMILY}`;
    ctx.fillStyle = '#0f172a';
    const nextY = drawLines(ctx, valLines, x, fy + 26, 31, 'left');

    if (subLines.length > 0) {
      ctx.font = `500 21px ${FONT_FAMILY}`;
      ctx.fillStyle = '#475569';
      drawLines(ctx, subLines, x, nextY + 2, 28, 'left');
    }
  };

  drawField('ĐƠN VỊ VẬN CHUYỂN / XUẤT CẤP', teamValLines, leftColX, cy, leaderLines);
  drawField('CÁN BỘ LẬP PHIẾU / THỦ KHO', actorLines, rightColX, cy);
  cy += row1H + 18;

  drawField('ĐIỂM TIẾP NHẬN CỨU TRỢ / NƠI GIAO HÀNG', destLines, leftColX, cy);
  cy += row2H + 18;

  drawField('NGƯỜI NHẬN DỰ KIẾN', recpLines, leftColX, cy);
  drawField('KÝ NHẬN THỰC TẾ TẠI HIỆN TRƯỜNG', actualRecpLines, rightColX, cy);
  cy += row3H;

  if (noteLines.length > 0) {
    cy += 18;
    ctx.textAlign = 'left';
    ctx.font = `700 18.5px ${FONT_FAMILY}`;
    ctx.fillStyle = '#64748b';
    ctx.fillText('GHI CHÚ ĐIỀU PHỐI', leftColX, cy);

    ctx.font = `500 21px ${FONT_FAMILY}`;
    ctx.fillStyle = '#334155';
    drawLines(ctx, noteLines, leftColX, cy + 26, 29, 'left');
  }

  y += infoCardH + 34;

  // 5. ITEMS TABLE
  ctx.textAlign = 'left';
  ctx.font = `800 23px ${FONT_FAMILY}`;
  ctx.fillStyle = '#0f172a';
  ctx.fillText('DANH MỤC THIẾT BỊ & HÀNG HÓA XUẤT KHO', MARGIN_X, y);
  y += 38;

  const colWidths: [number, number, number, number, number] = [84, 770, 260, 150, 170];
  const [wStt, wName, wType, wUnit, wQty] = colWidths;
  y = drawTableHeader(ctx, y, colWidths);

  const maxTableY = PAGE_H - MARGIN_BOTTOM - 90;

  if (items.length === 0) {
    const emptyH = 68;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(MARGIN_X, y, CONTENT_W, emptyH);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(MARGIN_X, y, CONTENT_W, emptyH);
    ctx.font = `italic 21px ${FONT_FAMILY}`;
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('Chưa có danh mục hàng hóa trong phiếu.', MARGIN_X + CONTENT_W / 2, y + 22);
    y += emptyH;
  } else {
    items.forEach((item, idx) => {
      ctx.font = `700 22px ${FONT_FAMILY}`;
      const nameLines = wrapText(ctx, item.name || 'Vật tư', wName - 32);
      const rowH = Math.max(58, nameLines.length * 30 + 26);

      if (y + rowH > maxTableY) {
        current = startNewPage();
        ctx = current.ctx;
        y = MARGIN_TOP;
        y = drawTableHeader(ctx, y, colWidths);
      }

      const typeLabel =
        item.supplyType === 'DURABLE'
          ? 'Thiết bị cứu hộ'
          : item.supplyType === 'CONSUMABLE'
            ? 'Nhu yếu phẩm'
            : item.category || 'Vật tư';
      const unitLabel = item.unit === 'cai' ? 'cái' : item.unit || 'đv';

      const cellWidths = [wStt, wName, wType, wUnit, wQty];
      let cx = MARGIN_X;
      cellWidths.forEach((cw) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx, y, cw, rowH);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(cx, y, cw, rowH);
        cx += cw;
      });

      const midY = y + (rowH - 22) / 2;

      // STT
      ctx.font = `600 21px ${FONT_FAMILY}`;
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'center';
      ctx.fillText(String(idx + 1), MARGIN_X + wStt / 2, midY);

      // Tên vật tư
      ctx.font = `700 22px ${FONT_FAMILY}`;
      ctx.fillStyle = '#0f172a';
      const nameStartY = y + (rowH - nameLines.length * 30) / 2 + 2;
      drawLines(ctx, nameLines, MARGIN_X + wStt + 16, nameStartY, 30, 'left');

      // Phân loại
      ctx.font = `500 21px ${FONT_FAMILY}`;
      ctx.fillStyle = '#334155';
      ctx.textAlign = 'center';
      ctx.fillText(typeLabel, MARGIN_X + wStt + wName + wType / 2, midY);

      // ĐVT
      ctx.fillText(unitLabel, MARGIN_X + wStt + wName + wType + wUnit / 2, midY);

      // Số lượng
      ctx.font = `800 22px ${FONT_FAMILY}`;
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'right';
      ctx.fillText(
        String(item.quantity ?? 0),
        MARGIN_X + CONTENT_W - 18,
        midY
      );

      y += rowH;
    });
  }

  // Total row
  const totalH = 56;
  if (y + totalH > maxTableY) {
    current = startNewPage();
    ctx = current.ctx;
    y = MARGIN_TOP;
  }
  const leftTotalW = wStt + wName + wType + wUnit;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(MARGIN_X, y, leftTotalW, totalH);
  ctx.fillRect(MARGIN_X + leftTotalW, y, wQty, totalH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.8;
  ctx.strokeRect(MARGIN_X, y, leftTotalW, totalH);
  ctx.strokeRect(MARGIN_X + leftTotalW, y, wQty, totalH);

  ctx.font = `800 22px ${FONT_FAMILY}`;
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'right';
  ctx.fillText(`Tổng cộng (${items.length} mặt hàng)`, MARGIN_X + leftTotalW - 18, y + 17);
  ctx.fillText(String(totalUnits), MARGIN_X + CONTENT_W - 18, y + 17);
  y += totalH + 28;

  // 6. TIMELINE + SIGNATURES (giữ nguyên khối ở trang cuối)
  const timelineParts = [
    `Tạo phiếu: ${formatDateTime(rec.createdAt)}`,
    rec.acceptedAt ? `Đội nhận lệnh: ${formatDateTime(rec.acceptedAt)}` : '',
    rec.completedAt ? `Hoàn thành bàn giao: ${formatDateTime(rec.completedAt)}` : '',
    rec.cancelledAt ? `Thời điểm hủy: ${formatDateTime(rec.cancelledAt)}` : '',
  ].filter(Boolean);

  const sigBlockNeedH = 310;
  if (y + sigBlockNeedH > PAGE_H - MARGIN_BOTTOM - 30) {
    current = startNewPage();
    ctx = current.ctx;
    y = MARGIN_TOP;
  }

  ctx.textAlign = 'left';
  ctx.font = `500 20.5px ${FONT_FAMILY}`;
  ctx.fillStyle = '#475569';
  const timelineLines = wrapText(ctx, timelineParts.join('   •   '), CONTENT_W);
  y = drawLines(ctx, timelineLines, MARGIN_X, y, 28, 'left') + 36;

  const sigColW = CONTENT_W / 3;
  const sigRoles = [
    'CÁN BỘ LẬP PHIẾU / THỦ KHO',
    isDirect ? 'NGƯỜI XUẤT GIAO TRỰC TIẾP' : 'ĐƠN VỊ VẬN CHUYỂN',
    'NGƯỜI TIẾP NHẬN CỨU TRỢ',
  ];
  const sigHints = ['(Ký và ghi rõ họ tên)', '(Ký và ghi rõ họ tên)', '(Ký xác nhận thực tế)'];
  const signedRecipientName = !isGenericRecipientLabel(rec.actualRecipient)
    ? String(rec.actualRecipient).trim()
    : !isGenericRecipientLabel(rec.recipientName)
      ? String(rec.recipientName).trim()
      : '';
  const sigNames = [
    rec.actorName || '',
    rec.leaderName || rec.teamName || '',
    signedRecipientName,
  ];

  sigRoles.forEach((role, idx) => {
    const centerX = MARGIN_X + sigColW * idx + sigColW / 2;
    ctx.textAlign = 'center';

    ctx.font = `800 21px ${FONT_FAMILY}`;
    ctx.fillStyle = '#0f172a';
    ctx.fillText(role, centerX, y);

    ctx.font = `italic 19.5px ${FONT_FAMILY}`;
    ctx.fillStyle = '#64748b';
    ctx.fillText(sigHints[idx], centerX, y + 30);

    if (sigNames[idx]) {
      ctx.font = `700 21.5px ${FONT_FAMILY}`;
      ctx.fillStyle = '#0f172a';
      const nameLines = wrapText(ctx, sigNames[idx], sigColW - 24);
      drawLines(ctx, nameLines, centerX, y + 168, 28, 'center');
    }
  });

  // Footer cho toàn bộ trang
  pages.forEach((page, idx) => {
    drawFooter(page.ctx, idx + 1, pages.length);
  });

  return pages.map((p) => p.canvas);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function buildPdfFromJpegCanvases(canvases: HTMLCanvasElement[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let bytePos = 0;

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    bytePos += bytes.length;
  };

  const pushText = (text: string) => {
    pushBytes(encoder.encode(text));
  };

  pushText('%PDF-1.4\n');
  pushBytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const pageCount = canvases.length;
  const pageObjIds = canvases.map((_, idx) => 3 + idx * 3);

  const startObj = (id: number) => {
    offsets[id] = bytePos;
    pushText(`${id} 0 obj\n`);
  };
  const endObj = () => {
    pushText('\nendobj\n');
  };

  // Object 1: Catalog
  startObj(1);
  pushText('<< /Type /Catalog /Pages 2 0 R >>');
  endObj();

  // Object 2: Pages
  startObj(2);
  pushText(`<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`);
  endObj();

  // Page + Content + JPEG Image objects (A4: 595.28 x 841.89 pt)
  canvases.forEach((canvas, idx) => {
    const pageId = 3 + idx * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
    const jpegBytes = base64ToBytes(dataUrl.split(',')[1]);
    const contentStream = `q 595.28 0 0 841.89 0 0 cm /Im0 Do Q`;

    startObj(pageId);
    pushText(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    endObj();

    startObj(contentId);
    pushText(`<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`);
    endObj();

    startObj(imageId);
    pushText(
      `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
    );
    pushBytes(jpegBytes);
    pushText('\nendstream');
    endObj();
  });

  const xrefOffset = bytePos;
  const totalObjs = 2 + pageCount * 3;
  pushText(`xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= totalObjs; id += 1) {
    pushText(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const output = new Uint8Array(bytePos);
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}

/**
 * Xuất trực tiếp file PDF cho Phiếu Xuất Kho & Lệnh Điều Phối Tiếp Tế (không mở form in).
 */
export function exportSupplyDispatchVoucherPdf(
  record: DispatchHistoryRecord,
  options?: { areaName?: string | null }
): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  try {
    const canvases = renderVoucherCanvases(record, options?.areaName);
    const pdfBytes = buildPdfFromJpegCanvases(canvases);
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const safeFileCode = (record.dispatchCode || 'PXK').replace(/[^a-zA-Z0-9_-]/g, '_');

    const link = document.createElement('a');
    link.href = url;
    link.download = `Phieu_Xuat_Kho_${safeFileCode}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (err) {
    console.error('Lỗi xuất PDF phiếu xuất kho:', err);
    return false;
  }
}

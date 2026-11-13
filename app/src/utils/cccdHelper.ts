/**
 * Tiện ích bóc tách và xác thực dữ liệu mã QR trên thẻ Căn cước công dân (CCCD) gắn chip
 * Cấu trúc chuẩn theo Bộ Công An:
 * Số_CCCD | Số_CMND_cũ | Họ_và_tên | Ngày_sinh(DDMMYYYY) | Giới_tính | Địa_chỉ_thường_trú | Ngày_cấp(DDMMYYYY)
 */

export interface ParsedCccdData {
  idNumber: string;        // 12 chữ số
  oldCmnd?: string;        // 9 chữ số cũ (nếu có)
  fullName: string;        // Họ và tên
  dateOfBirthRaw?: string; // DDMMYYYY
  formattedDob?: string;   // DD/MM/YYYY
  gender?: string;         // 'Nam' | 'Nữ'
  address?: string;        // Nơi thường trú
  issueDate?: string;      // DD/MM/YYYY
  raw: string;
}

/**
 * Loại bỏ dấu tiếng Việt để so sánh chuỗi linh hoạt, không phân biệt hoa thường
 */
export const removeVietnameseTones = (str: string): string => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

/**
 * Bóc tách chuỗi quét được từ mã QR trên thẻ CCCD
 */
export const parseCccdQr = (data: string): ParsedCccdData | null => {
  if (!data || typeof data !== 'string') return null;

  const parts = data.split('|').map((p) => p.trim());
  // Định dạng chuẩn có ít nhất 6 hoặc 7 trường
  if (parts.length < 5) return null;

  const idNumber = parts[0] || '';
  // Kiểm tra số CCCD phải là 12 chữ số
  if (!/^\d{12}$/.test(idNumber)) {
    return null;
  }

  const oldCmnd = parts[1] || '';
  const fullName = parts[2] || '';
  const dobRaw = parts[3] || '';
  const gender = parts[4] || '';
  const address = parts[5] || '';
  const issueDateRaw = parts[6] || '';

  // Format DDMMYYYY -> DD/MM/YYYY
  const formatDdMmYyyy = (raw: string) => {
    if (raw && /^\d{8}$/.test(raw)) {
      return `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}`;
    }
    return raw;
  };

  return {
    idNumber,
    oldCmnd: oldCmnd || undefined,
    fullName,
    dateOfBirthRaw: dobRaw,
    formattedDob: formatDdMmYyyy(dobRaw),
    gender,
    address,
    issueDate: formatDdMmYyyy(issueDateRaw),
    raw: data,
  };
};

/**
 * Đối chiếu thông tin CCCD quét được với tài khoản người dùng
 */
export const verifyCccdWithUser = (
  cccd: ParsedCccdData,
  user: { fullName?: string }
): { isValid: boolean; message: string } => {
  if (!cccd || !cccd.idNumber) {
    return { isValid: false, message: 'Dữ liệu mã thẻ CCCD không hợp lệ.' };
  }

  if (!user || !user.fullName) {
    // Không có tên user để đối chiếu -> chấp nhận số CCCD
    return { isValid: true, message: 'Đã xác thực mã thẻ CCCD hợp lệ.' };
  }

  const cleanUser = removeVietnameseTones(user.fullName);
  const cleanCccd = removeVietnameseTones(cccd.fullName);

  if (cleanUser && cleanCccd) {
    // Kiểm tra xem tên có khớp nhau không
    const isNameMatch =
      cleanUser === cleanCccd ||
      cleanUser.includes(cleanCccd) ||
      cleanCccd.includes(cleanUser);

    if (!isNameMatch) {
      return {
        isValid: false,
        message: `Họ tên trên thẻ CCCD ("${cccd.fullName}") không khớp với tên tài khoản của bạn ("${user.fullName}"). Vui lòng quét thẻ CCCD chính chủ!`,
      };
    }
  }

  return {
    isValid: true,
    message: `Đã xác thực chính chủ: ${cccd.fullName} (${cccd.idNumber})`,
  };
};


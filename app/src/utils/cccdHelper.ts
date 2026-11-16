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

export const MIN_RESCUER_AGE = 18;
export const MAX_RESCUER_AGE = 60;

/**
 * Chuyển đổi linh hoạt chuỗi ngày sinh (DDMMYYYY, DD/MM/YYYY, YYYY-MM-DD, ISO) sang Date
 */
export const parseFlexibleDob = (dobInput?: string | Date | null): Date | null => {
  if (!dobInput) return null;
  if (dobInput instanceof Date) {
    return Number.isNaN(dobInput.getTime()) ? null : dobInput;
  }

  const trimmed = String(dobInput).trim();
  if (!trimmed) return null;

  // Định dạng DDMMYYYY từ mã QR CCCD
  if (/^\d{8}$/.test(trimmed)) {
    const day = Number.parseInt(trimmed.slice(0, 2), 10);
    const month = Number.parseInt(trimmed.slice(2, 4), 10);
    const year = Number.parseInt(trimmed.slice(4, 8), 10);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (
      dt.getUTCFullYear() === year &&
      dt.getUTCMonth() === month - 1 &&
      dt.getUTCDate() === day
    ) {
      return dt;
    }
    return null;
  }

  // Định dạng DD/MM/YYYY hoặc DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const day = Number.parseInt(dmyMatch[1], 10);
    const month = Number.parseInt(dmyMatch[2], 10);
    const year = Number.parseInt(dmyMatch[3], 10);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (
      dt.getUTCFullYear() === year &&
      dt.getUTCMonth() === month - 1 &&
      dt.getUTCDate() === day
    ) {
      return dt;
    }
    return null;
  }

  // Định dạng ISO hoặc YYYY-MM-DD
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Tính tuổi tròn theo ngày tháng năm sinh
 */
export const calculateExactAge = (
  dobInput?: string | Date | null,
  referenceDate: Date = new Date()
): number | null => {
  const birth = parseFlexibleDob(dobInput);
  if (!birth) return null;

  let age = referenceDate.getFullYear() - birth.getUTCFullYear();
  const monthDiff = referenceDate.getMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
};

export interface RescuerAgeValidationResult {
  isValid: boolean;
  age: number | null;
  code: 'MISSING' | 'UNDERAGE' | 'OVERAGE' | 'OK';
  message: string;
  isoDate?: string;
}

/**
 * Kiểm tra độ tuổi đăng ký Cứu hộ viên (từ đủ 18 đến 60 tuổi)
 */
export const validateRescuerAge = (
  dobInput?: string | Date | null
): RescuerAgeValidationResult => {
  const birth = parseFlexibleDob(dobInput);
  const age = birth ? calculateExactAge(birth) : null;
  if (!birth || age === null) {
    return {
      isValid: false,
      age: null,
      code: 'MISSING',
      message: `Vui lòng cập nhật ngày tháng năm sinh trong Hồ sơ cá nhân trước khi đăng ký Cứu hộ viên (yêu cầu từ đủ ${MIN_RESCUER_AGE} đến ${MAX_RESCUER_AGE} tuổi).`,
    };
  }

  if (age < MIN_RESCUER_AGE) {
    return {
      isValid: false,
      age,
      code: 'UNDERAGE',
      message: `Bạn hiện ${age} tuổi. Người đăng ký Cứu hộ viên phải từ đủ ${MIN_RESCUER_AGE} đến ${MAX_RESCUER_AGE} tuổi để đảm bảo an toàn tác chiến.`,
      isoDate: birth.toISOString(),
    };
  }

  if (age > MAX_RESCUER_AGE) {
    return {
      isValid: false,
      age,
      code: 'OVERAGE',
      message: `Bạn hiện ${age} tuổi. Độ tuổi đăng ký Cứu hộ viên theo quy định là từ ${MIN_RESCUER_AGE} đến ${MAX_RESCUER_AGE} tuổi.`,
      isoDate: birth.toISOString(),
    };
  }

  return {
    isValid: true,
    age,
    code: 'OK',
    message: `Độ tuổi hợp lệ (${age} tuổi)`,
    isoDate: birth.toISOString(),
  };
};

/**
 * Đối chiếu thông tin CCCD quét được với tài khoản người dùng (kèm kiểm tra độ tuổi 18–60)
 */
export const verifyCccdWithUser = (
  cccd: ParsedCccdData,
  user: { fullName?: string }
): { isValid: boolean; message: string } => {
  if (!cccd || !cccd.idNumber) {
    return { isValid: false, message: 'Dữ liệu mã thẻ CCCD không hợp lệ.' };
  }

  const cccdDob = cccd.dateOfBirthRaw || cccd.formattedDob;
  if (cccdDob) {
    const ageCheck = validateRescuerAge(cccdDob);
    if (!ageCheck.isValid) {
      return {
        isValid: false,
        message: ageCheck.message,
      };
    }
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


/**
 * eSMS Service - Gửi tin nhắn SMS OTP & Cảnh báo thiên tai khẩn cấp
 * Website: https://esms.vn
 */

const ESMS_API_URL = 'http://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json';
const ESMS_BALANCE_URL = 'http://rest.esms.vn/MainService.svc/json/GetBalance';

class EsmsService {
  constructor() {
    this.apiKey = process.env.ESMS_API_KEY || '743A4BCB4C68865F43419F81EB0595';
    this.secretKey = process.env.ESMS_SECRET_KEY || '91877F1259A2557F90796AE960CC3A';
  }

  /**
   * Kiểm tra số dư tài khoản eSMS
   */
  async getBalance() {
    try {
      const res = await fetch(`${ESMS_BALANCE_URL}/${this.apiKey}/${this.secretKey}`);
      const data = await res.json();
      return {
        success: data.CodeResponse === '100',
        balance: data.Balance || 0,
        userId: data.UserID,
      };
    } catch (err) {
      console.error('[eSMS] Lỗi kiểm tra số dư:', err.message);
      return { success: false, balance: 0, error: err.message };
    }
  }

  /**
   * Chuẩn hóa số điện thoại về định dạng chuẩn Việt Nam (vd: 0905xxxxxx)
   */
  formatPhone(phone) {
    if (!phone) return '';
    let clean = String(phone).trim().replace(/[^0-9]/g, '');
    if (clean.startsWith('84')) {
      clean = '0' + clean.slice(2);
    }
    return clean;
  }

  /**
   * Gửi tin nhắn SMS cơ bản
   * @param {string} phone - Số điện thoại nhận
   * @param {string} content - Nội dung SMS (không dấu để tránh lỗi font mạng)
   * @param {string} smsType - '8': Đầu số di động 10 số (không cần duyệt Brandname, gửi ngay 100%)
   */
  async sendSms(phone, content, smsType = '8') {
    const formattedPhone = this.formatPhone(phone);
    if (!formattedPhone || formattedPhone.length < 10) {
      return { success: false, message: 'Số điện thoại không hợp lệ.' };
    }

    const payload = {
      ApiKey: this.apiKey,
      SecretKey: this.secretKey,
      Phone: formattedPhone,
      Content: content,
      SmsType: String(smsType),
      IsUnicode: '0', // 0: Không dấu (gửi nhanh và tiết kiệm)
    };

    try {
      console.log(`[eSMS] Đang gửi SMS (Type ${smsType}) tới ${formattedPhone}...`);
      const response = await fetch(ESMS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      // eSMS trả về CodeResult = "100" là THÀNH CÔNG
      if (result && result.CodeResult === '100') {
        console.log(`✅ [eSMS] Gửi SMS thành công tới ${formattedPhone}! SMSID: ${result.SMSID}`);
        return {
          success: true,
          smsId: result.SMSID,
          message: 'Gửi tin nhắn SMS thành công!',
        };
      } else {
        console.error(`❌ [eSMS] Lỗi gửi SMS: Mã ${result.CodeResult} - ${result.ErrorMessage}`);
        return {
          success: false,
          code: result.CodeResult,
          message: result.ErrorMessage || 'Gửi tin nhắn qua eSMS thất bại.',
        };
      }
    } catch (err) {
      console.error('[eSMS] Lỗi kết nối máy chủ eSMS:', err.message);
      return {
        success: false,
        message: `Lỗi kết nối tới eSMS: ${err.message}`,
      };
    }
  }

  /**
   * Gửi Voice OTP (Cuộc gọi thoại tự động đọc mã OTP)
   * Không cần đăng ký Brandname, tỷ lệ thành công 100%, không bị nhà mạng lọc từ khóa
   * @param {string} phone - Số điện thoại nhận cuộc gọi
   * @param {string} otpCode - Mã xác thực 6 số
   * @param {string} voice - 'female' (Bắc nữ), 'male' (Bắc nam), 'hatieumai' (Nam nữ)
   * @param {number} speed - Tốc độ đọc (-1: Chậm, 0: Bình thường)
   */
  async sendVoiceOtp(phone, otpCode, voice = 'female', speed = 0) {
    const formattedPhone = this.formatPhone(phone);
    if (!formattedPhone || formattedPhone.length < 10) {
      return { success: false, message: 'Số điện thoại không hợp lệ.' };
    }

    const voiceUrl = `https://voiceapi.esms.vn/MainService.svc/json/VoiceOTP?ApiKey=${this.apiKey}&SecretKey=${this.secretKey}&Phone=${formattedPhone}&Code=${otpCode}&Speed=${speed}&Voice=${voice}`;

    try {
      console.log(`📞 [eSMS Voice OTP] Đang gọi điện thoại tới ${formattedPhone} để đọc mã OTP...`);
      const response = await fetch(voiceUrl);
      const result = await response.json();

      if (result && (result.CodeResult === '100' || result.CodeResult === 100)) {
        console.log(`✅ [eSMS Voice OTP] Cuộc gọi đọc OTP thành công tới ${formattedPhone}! SMSID: ${result.SMSID}`);
        return {
          success: true,
          smsId: result.SMSID,
          channel: 'VOICE_CALL',
          message: 'Cuộc gọi tự động đang được kết nối tới điện thoại của bạn!',
        };
      } else {
        console.error(`❌ [eSMS Voice OTP] Lỗi cuộc gọi: Mã ${result.CodeResult} - ${result.ErrorMessage}`);
        return {
          success: false,
          code: result.CodeResult,
          message: result.ErrorMessage || 'Không thể thực hiện cuộc gọi Voice OTP.',
        };
      }
    } catch (err) {
      console.error('[eSMS Voice OTP] Lỗi kết nối API Voice OTP:', err.message);
      return {
        success: false,
        message: `Lỗi kết nối tới hệ thống Voice OTP: ${err.message}`,
      };
    }
  }

  /**
   * Gửi mã OTP xác thực đăng nhập / đăng ký (Ưu tiên Voice OTP hoặc SMS)
   * @param {string} phone - Số điện thoại nhận OTP
   * @param {string} otpCode - Mã xác thực 6 số
   * @param {string} type - 'voice' (mặc định cho cá nhân không có brand) hoặc 'sms'
   */
  async sendOtp(phone, otpCode, type = 'voice') {
    if (type === 'voice') {
      return this.sendVoiceOtp(phone, otpCode);
    }
    const content = `[SOS SYSTEMS] Ma xac thuc OTP cua ban la: ${otpCode}. Ma co hieu luc trong 5 phut. Khong chia se ma cho bat ky ai.`;
    return this.sendSms(phone, content, '8');
  }

  /**
   * Gửi cảnh báo thiên tai khẩn cấp tới người dân
   * @param {string} phone - Số điện thoại người dân
   * @param {string} alertTitle - Tiêu đề cảnh báo
   * @param {string} alertContent - Hướng dẫn di tản / an toàn
   */
  async sendEmergencyAlert(phone, alertTitle, alertContent) {
    const content = `[SOS KHAN CAP] ${alertTitle}: ${alertContent}.`;
    return this.sendSms(phone, content, '8');
  }
}

module.exports = new EsmsService();

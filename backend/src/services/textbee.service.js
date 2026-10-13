/**
 * TextBee Service - Android SMS Gateway tự động gửi SMS OTP qua SIM vật lý
 * Website: https://textbee.dev
 */

const TEXTBEE_API_URL = 'https://api.textbee.dev/api/v1/gateway/devices';

class TextBeeService {
  constructor() {
    this.apiKey = process.env.TEXTBEE_API_KEY || 'txb_aWuia0cuVt5d25ZFy9QlbXo71qbMnJJ7';
    this.deviceId = process.env.TEXTBEE_DEVICE_ID || '6acd8e4f74e21da91afa8b41';
  }

  /**
   * Định dạng số điện thoại sang chuẩn E.164 (+84xxxxxxxxx) cho TextBee
   */
  formatPhone(phone) {
    if (!phone) return '';
    let clean = String(phone).trim().replace(/[^0-9]/g, '');
    if (clean.startsWith('84')) {
      return '+' + clean;
    }
    if (clean.startsWith('0')) {
      return '+84' + clean.slice(1);
    }
    if (!clean.startsWith('+')) {
      return '+84' + clean;
    }
    return clean;
  }

  /**
   * Gửi tin nhắn SMS thật qua SIM điện thoại Android bằng TextBee Gateway
   * @param {string} phone - Số điện thoại nhận tin
   * @param {string} message - Nội dung tin nhắn
   */
  async sendSms(phone, message) {
    const formattedPhone = this.formatPhone(phone);
    if (!formattedPhone || formattedPhone.length < 10) {
      return { success: false, message: 'Số điện thoại không hợp lệ.' };
    }

    const endpoint = `${TEXTBEE_API_URL}/${this.deviceId}/send-sms`;

    try {
      console.log(`📱 [TextBee Gateway] Đang yêu cầu máy Android gửi SMS tới ${formattedPhone}...`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipients: [formattedPhone],
          message: message,
        }),
      });

      const resData = await response.json();

      if (response.ok && (resData?.data?.success || resData?.success)) {
        console.log(`✅ [TextBee Gateway] Đã đưa SMS vào hàng đợi máy Android thành công! BatchId: ${resData?.data?.smsBatchId || ''}`);
        return {
          success: true,
          smsBatchId: resData?.data?.smsBatchId,
          message: 'Tin nhắn SMS đã được gửi qua điện thoại của bạn!',
          warning: resData?.data?.warning,
        };
      } else {
        const errorMsg = resData?.message || resData?.error || 'Lỗi gửi tin nhắn qua TextBee';
        console.error(`❌ [TextBee Gateway] Lỗi từ TextBee:`, errorMsg);
        return {
          success: false,
          message: errorMsg,
        };
      }
    } catch (err) {
      console.error('[TextBee Gateway] Lỗi kết nối TextBee API:', err.message);
      return {
        success: false,
        message: `Lỗi kết nối tới TextBee Gateway: ${err.message}`,
      };
    }
  }

  /**
   * Gửi mã OTP xác thực qua tin nhắn SMS thật (SIM Android)
   * @param {string} phone - Số điện thoại nhận OTP
   * @param {string} otpCode - Mã xác thực 6 số
   */
  async sendOtp(phone, otpCode) {
    const message = `[SOS SYSTEMS] Ma xac thuc OTP cua ban la: ${otpCode}. Ma co hieu luc trong 5 phut. Khong chia se ma cho bat ky ai.`;
    return this.sendSms(phone, message);
  }
}

module.exports = new TextBeeService();

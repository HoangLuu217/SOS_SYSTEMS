import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { parseCccdQr, verifyCccdWithUser, ParsedCccdData } from '../utils/cccdHelper';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCAN_FRAME_SIZE = Math.min(SCREEN_WIDTH * 0.82, 310);

// Cố định cấu hình quét mã QR ngoài component để tránh native camera khởi tạo lại liên tục
const BARCODE_SETTINGS: any = { barcodeTypes: ['qr'] };

interface CccdQrScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (data: ParsedCccdData) => void;
  userFullName?: string;
}

type DialogType = 'SUCCESS' | 'MISMATCH' | 'INVALID_FORMAT';

interface DialogInfo {
  type: DialogType;
  parsed?: ParsedCccdData;
  title: string;
  message?: string;
  cardName?: string;
  userName?: string;
}

export const CccdQrScannerModal: React.FC<CccdQrScannerModalProps> = ({
  visible,
  onClose,
  onSuccess,
  userFullName,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [cooldown, setCooldown] = useState<boolean>(false);
  const [dialogInfo, setDialogInfo] = useState<DialogInfo | null>(null);

  // Khóa cứng quét đồng bộ (tránh 30 frame bắn liên tục trong 1 giây)
  const isLockedRef = useRef<boolean>(false);
  const cooldownTimerRef = useRef<any>(null);

  // Reset state khi mở hoặc đóng modal
  useEffect(() => {
    if (visible) {
      isLockedRef.current = false;
      setIsProcessing(false);
      setCooldown(false);
      setDialogInfo(null);
      if (!permission?.granted) {
        requestPermission();
      }
    } else {
      isLockedRef.current = true;
      setIsProcessing(false);
      setTorchOn(false);
      setDialogInfo(null);
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    }
  }, [visible, permission?.granted]);

  // Xử lý đóng modal an toàn
  const handleClose = () => {
    isLockedRef.current = true;
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    setDialogInfo(null);
    onClose();
  };

  // Quét lại với bộ đệm cực nhanh (400ms)
  const handleRetryScan = () => {
    setDialogInfo(null);
    setCooldown(true);
    setIsProcessing(false);
    isLockedRef.current = true;

    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      setCooldown(false);
      isLockedRef.current = false;
    }, 400);
  };

  // Xử lý sự kiện quét QR từ Camera
  const handleBarcodeScanned = (scanningResult: BarcodeScanningResult) => {
    // Nếu đang khóa hoặc đang hiện dialog thì bỏ qua ngay lập tức
    if (isLockedRef.current || isProcessing || dialogInfo || cooldown) {
      return;
    }

    const rawData = scanningResult?.data;
    if (!rawData) return;

    // Khóa ngay lập tức trên Ref (đồng bộ trong micro-second)
    isLockedRef.current = true;
    setIsProcessing(true);

    const parsed = parseCccdQr(rawData);
    if (!parsed) {
      setDialogInfo({
        type: 'INVALID_FORMAT',
        title: 'Mã QR không đúng định dạng',
        message:
          'Mã vừa quét không đúng chuẩn thẻ CCCD gắn chip của Bộ Công An. Vui lòng căn chỉnh lại góc trên bên phải của thẻ!',
      });
      setIsProcessing(false);
      return;
    }

    // Đối chiếu với tài khoản người dùng
    const verification = verifyCccdWithUser(parsed, { fullName: userFullName });
    if (!verification.isValid) {
      setDialogInfo({
        type: 'MISMATCH',
        title: 'Xác thực không trùng khớp',
        message: verification.message,
        cardName: parsed.fullName,
        userName: userFullName || 'Chưa cập nhật',
      });
      setIsProcessing(false);
      return;
    }

    // Quét và đối chiếu thành công
    setDialogInfo({
      type: 'SUCCESS',
      title: 'Đã xác thực chính chủ thành công',
      parsed,
    });
    setIsProcessing(false);
  };

  if (!visible) return null;

  const isScanningActive = !isLockedRef.current && !isProcessing && !dialogInfo && !cooldown;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <View style={styles.container}>
        {/* Header điều khiển */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.circleBtn} onPress={handleClose} activeOpacity={0.7}>
            <Feather name="x" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Quét mã QR thẻ CCCD</Text>

          <TouchableOpacity
            style={[styles.circleBtn, torchOn && styles.circleBtnActive]}
            onPress={() => setTorchOn((prev) => !prev)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name={torchOn ? 'flashlight' : 'flashlight-off'}
              size={22}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>

        {/* Nội dung Camera hoặc xin quyền */}
        {!permission?.granted ? (
          <View style={styles.permissionBox}>
            <MaterialCommunityIcons name="camera-off" size={48} color="#94A3B8" />
            <Text style={styles.permissionTitle}>Yêu cầu quyền Camera</Text>
            <Text style={styles.permissionDesc}>
              Ứng dụng cần quyền mở Camera để quét mã QR in trên góc thẻ CCCD gắn chip của bạn nhằm xác thực hồ sơ cứu hộ viên chính chủ.
            </Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
              <Text style={styles.permissionBtnText}>Cấp quyền Camera</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraWrapper}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              zoom={0.08}
              enableTorch={torchOn}
              barcodeScannerSettings={BARCODE_SETTINGS}
              onBarcodeScanned={handleBarcodeScanned}
            />

            {/* Lớp phủ căn chỉnh khung ngắm */}
            <View style={styles.overlay} pointerEvents="box-none">
              <View style={styles.overlayTop} />

              <View style={styles.overlayCenter}>
                <View style={styles.overlaySide} />

                {/* Khung ngắm mục tiêu */}
                <View style={styles.scanFrame}>
                  {/* 4 góc viền khung ngắm */}
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />

                  {/* Trạng thái quét */}
                  {cooldown ? (
                    <View style={styles.cooldownBadge}>
                      <ActivityIndicator size="small" color="#38BDF8" />
                      <Text style={styles.cooldownText}>Sẵn sàng quét lại...</Text>
                    </View>
                  ) : isProcessing ? (
                    <View style={styles.processingWrap}>
                      <ActivityIndicator size="large" color="#00D26A" />
                      <Text style={styles.processingText}>Đang giải mã CCCD...</Text>
                    </View>
                  ) : (
                    <View style={styles.aimIconWrap}>
                      <MaterialCommunityIcons name="qrcode-scan" size={48} color="rgba(255,255,255,0.45)" />
                    </View>
                  )}
                </View>

                <View style={styles.overlaySide} />
              </View>

              <View style={styles.overlayBottom}>
                <View style={styles.tipCard}>
                  <Feather name="info" size={16} color="#38BDF8" style={{ marginTop: 2 }} />
                  <Text style={styles.tipText}>
                    Giữ điện thoại cách thẻ khoảng <Text style={styles.boldText}>15 - 20 cm</Text> để camera bắt nét chuẩn mã QR ở góc thẻ CCCD.
                  </Text>
                </View>
              </View>
            </View>

            {/* DIALOG THÔNG BÁO TÍCH HỢP TRONG MODAL (Tránh dùng Alert.alert gây lỗi trắng màn hình) */}
            {dialogInfo && (
              <View style={styles.dialogBackdrop}>
                <View style={styles.dialogCard}>
                  {/* TRƯỜNG HỢP 1: KHÔNG TRÙNG KHỚP HỌ TÊN */}
                  {dialogInfo.type === 'MISMATCH' && (
                    <>
                      <View style={[styles.dialogIconCircle, { backgroundColor: '#FEE2E2' }]}>
                        <Feather name="alert-triangle" size={32} color="#DC2626" />
                      </View>
                      <Text style={[styles.dialogTitle, { color: '#DC2626' }]}>
                        Xác thực không trùng khớp
                      </Text>
                      <Text style={styles.dialogSubtitle}>
                        Thông tin thẻ CCCD vừa quét không trùng với tài khoản đang đăng ký:
                      </Text>

                      <View style={styles.mismatchComparisonBox}>
                        <View style={styles.comparisonRow}>
                          <Text style={styles.comparisonLabel}>Họ tên trên CCCD:</Text>
                          <Text style={[styles.comparisonValue, { color: '#DC2626' }]}>
                            {dialogInfo.cardName || 'Không rõ'}
                          </Text>
                        </View>
                        <View style={styles.comparisonDivider} />
                        <View style={styles.comparisonRow}>
                          <Text style={styles.comparisonLabel}>Tài khoản hiện tại:</Text>
                          <Text style={[styles.comparisonValue, { color: '#0066FF' }]}>
                            {dialogInfo.userName || 'Chưa cập nhật'}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.dialogNoticeText}>
                        🛡️ Để đảm bảo an toàn và tính pháp lý cho Đội Cứu hộ, chỉ tài khoản chính chủ mới được đăng ký bằng thẻ này.
                      </Text>

                      <View style={styles.dialogBtnGroup}>
                        <TouchableOpacity
                          style={[styles.dialogBtn, styles.dialogBtnPrimary, { backgroundColor: '#DC2626' }]}
                          onPress={handleRetryScan}
                          activeOpacity={0.8}
                        >
                          <Feather name="refresh-cw" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.dialogBtnPrimaryText}>Quét thẻ khác</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.dialogBtn, styles.dialogBtnCancel]}
                          onPress={handleClose}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.dialogBtnCancelText}>Hủy bỏ & Đóng</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                  {/* TRƯỜNG HỢP 2: MÃ QR KHÔNG ĐÚNG ĐỊNH DẠNG CCCD */}
                  {dialogInfo.type === 'INVALID_FORMAT' && (
                    <>
                      <View style={[styles.dialogIconCircle, { backgroundColor: '#FEF3C7' }]}>
                        <Feather name="alert-circle" size={32} color="#D97706" />
                      </View>
                      <Text style={[styles.dialogTitle, { color: '#D97706' }]}>
                        Mã QR không hợp lệ
                      </Text>
                      <Text style={styles.dialogSubtitle}>
                        {dialogInfo.message ||
                          'Mã vừa quét không đúng cấu trúc mã thẻ CCCD gắn chip của Bộ Công An.'}
                      </Text>

                      <View style={styles.dialogBtnGroup}>
                        <TouchableOpacity
                          style={[styles.dialogBtn, styles.dialogBtnPrimary, { backgroundColor: '#D97706' }]}
                          onPress={handleRetryScan}
                          activeOpacity={0.8}
                        >
                          <Feather name="refresh-cw" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.dialogBtnPrimaryText}>Căn chỉnh & Quét lại</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.dialogBtn, styles.dialogBtnCancel]}
                          onPress={handleClose}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.dialogBtnCancelText}>Hủy bỏ</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                  {/* TRƯỜNG HỢP 3: QUÉT THÀNH CÔNG CHÍNH CHỦ */}
                  {dialogInfo.type === 'SUCCESS' && dialogInfo.parsed && (
                    <>
                      <View style={[styles.dialogIconCircle, { backgroundColor: '#D1FAE5' }]}>
                        <Feather name="check-circle" size={32} color="#059669" />
                      </View>
                      <Text style={[styles.dialogTitle, { color: '#059669' }]}>
                        Đã xác thực chính chủ
                      </Text>
                      <Text style={styles.dialogSubtitle}>
                        Thông tin CCCD trùng khớp với tài khoản đăng ký:
                      </Text>

                      <View style={styles.successDataBox}>
                        <View style={styles.successRow}>
                          <Text style={styles.successLabel}>Họ và tên:</Text>
                          <Text style={styles.successValue}>{dialogInfo.parsed.fullName}</Text>
                        </View>
                        <View style={styles.successRow}>
                          <Text style={styles.successLabel}>Số CCCD:</Text>
                          <Text style={[styles.successValue, { color: '#0066FF', fontWeight: '800' }]}>
                            {dialogInfo.parsed.idNumber}
                          </Text>
                        </View>
                        {dialogInfo.parsed.formattedDob && (
                          <View style={styles.successRow}>
                            <Text style={styles.successLabel}>Ngày sinh:</Text>
                            <Text style={styles.successValue}>{dialogInfo.parsed.formattedDob}</Text>
                          </View>
                        )}
                        {dialogInfo.parsed.gender && (
                          <View style={styles.successRow}>
                            <Text style={styles.successLabel}>Giới tính:</Text>
                            <Text style={styles.successValue}>{dialogInfo.parsed.gender}</Text>
                          </View>
                        )}
                        {dialogInfo.parsed.address && (
                          <View style={[styles.successRow, { alignItems: 'flex-start' }]}>
                            <Text style={styles.successLabel}>Thường trú:</Text>
                            <Text style={[styles.successValue, { flex: 1, textAlign: 'right' }]}>
                              {dialogInfo.parsed.address}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.dialogBtnGroup}>
                        <TouchableOpacity
                          style={[styles.dialogBtn, styles.dialogBtnPrimary, { backgroundColor: '#059669' }]}
                          onPress={() => {
                            if (dialogInfo.parsed) {
                              onSuccess(dialogInfo.parsed);
                            }
                            handleClose();
                          }}
                          activeOpacity={0.8}
                        >
                          <Feather name="check" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.dialogBtnPrimaryText}>Xác nhận & Điền số</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.dialogBtn, styles.dialogBtnCancel]}
                          onPress={handleRetryScan}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.dialogBtnCancelText}>Quét lại</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  topBar: {
    height: Platform.OS === 'ios' ? 96 : 74,
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0B1329',
    zIndex: 10,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleBtnActive: {
    backgroundColor: '#0284C7',
  },
  cameraWrapper: {
    flex: 1,
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
  },
  overlayCenter: {
    flexDirection: 'row',
    height: SCAN_FRAME_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
  },
  scanFrame: {
    width: SCAN_FRAME_SIZE,
    height: SCAN_FRAME_SIZE,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#00D26A',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  aimIconWrap: {
    opacity: 0.6,
  },
  processingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    padding: 16,
    borderRadius: 12,
  },
  processingText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  cooldownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  cooldownText: {
    color: '#38BDF8',
    fontSize: 12.5,
    fontWeight: '600',
  },
  overlayBottom: {
    flex: 1.4,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 24,
    paddingTop: 24,
    alignItems: 'center',
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    maxWidth: 360,
  },
  tipText: {
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 19,
    marginLeft: 10,
    flex: 1,
  },
  boldText: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  permissionBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  permissionDesc: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 24,
  },
  permissionBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  permissionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // DIALOG TÍCH HỢP IN-APP STYLES
  dialogBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 999,
  },
  dialogCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 20,
  },
  dialogIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  dialogSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  mismatchComparisonBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
  },
  comparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  comparisonLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  comparisonValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  comparisonDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 8,
  },
  dialogNoticeText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 18,
    paddingHorizontal: 12,
  },
  dialogBtnGroup: {
    width: '100%',
    gap: 10,
  },
  dialogBtn: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogBtnPrimary: {
    backgroundColor: '#0066FF',
  },
  dialogBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  dialogBtnCancel: {
    backgroundColor: '#F1F5F9',
  },
  dialogBtnCancelText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },

  // THÔNG TIN THẺ THÀNH CÔNG
  successDataBox: {
    width: '100%',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    gap: 8,
  },
  successRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  successLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  successValue: {
    fontSize: 13.5,
    color: '#0F172A',
    fontWeight: '700',
  },
});

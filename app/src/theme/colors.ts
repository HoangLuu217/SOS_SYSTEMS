/**
 * Bảng màu Design System chuẩn cho ứng dụng SOS SYSTEMS
 */
export const colors = {
  // Brand Colors (Màu chủ đạo)
  primary: '#0066FF',
  primaryLight: '#EFF6FF',
  primaryBorder: '#BFDBFE',
  primaryDark: '#0052CC',

  // Status & Alerts (Trạng thái & Cảnh báo khẩn cấp)
  danger: '#EF4444',
  dangerDark: '#DC2626',
  dangerLight: '#FEF2F2',
  dangerBorder: '#FECACA',

  warning: '#F59E0B',
  warningDark: '#B45309',
  warningLight: '#FFFBEB',
  warningBorder: '#FDE68A',

  success: '#10B981',
  successDark: '#047857',
  successLight: '#ECFDF5',
  successBorder: '#A7F3D0',

  info: '#0284C7',
  infoDark: '#0369A1',
  infoLight: '#F0F9FF',
  infoBorder: '#BAE6FD',

  // Neutral & Grayscale (Bảng màu trung tính)
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  // Slate Tones
  slate900: '#0F172A', // Chữ tiêu đề chính (Deep Navy)
  slate800: '#1E293B',
  slate700: '#334155', // Chữ nội dung phụ
  slate600: '#475569',
  slate500: '#64748B', // Chữ mờ / icon phụ
  slate400: '#94A3B8',
  slate300: '#CBD5E1', // Border ô input
  slate200: '#E2E8F0', // Đường kẻ viền phân cách
  slate100: '#F1F5F9', // Nền card / pill
  slate50: '#F8FAFC',  // Nền app chung

  // Semantic UI Mapping
  textPrimary: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  textDim: '#94A3B8',
  textLight: '#FFFFFF',

  background: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  borderFocus: '#0066FF',

  // Form Controls
  inputBg: '#FFFFFF',
  inputBorder: '#CBD5E1',
  inputBorderActive: '#0066FF',
  readOnlyBg: '#F8FAFC',
  readOnlyBorder: '#E2E8F0',

  // Overlay / Backdrop
  overlay: 'rgba(15, 23, 42, 0.55)',
  backdropDark: 'rgba(0, 0, 0, 0.6)',

  // Profile-specific aliases for backward compatibility
  offline: '#64748B',
  offlineLight: '#F1F5F9',
  offlineBorder: '#CBD5E1',
  suspended: '#DC2626',
  suspendedLight: '#FEF2F2',
  suspendedBorder: '#FECACA',
} as const;

export type ColorType = typeof colors;

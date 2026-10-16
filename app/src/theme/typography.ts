import { TextStyle } from 'react-native';
import { colors } from './colors';

/**
 * Cấu hình Typography chuẩn cho ứng dụng SOS SYSTEMS
 */
export const typography = {
  fontSize: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },
  fontWeight: {
    regular: '400' as TextStyle['fontWeight'],
    medium: '500' as TextStyle['fontWeight'],
    semibold: '600' as TextStyle['fontWeight'],
    bold: '700' as TextStyle['fontWeight'],
    extrabold: '800' as TextStyle['fontWeight'],
  },
  presets: {
    h1: {
      fontSize: 28,
      fontWeight: '800' as const,
      color: colors.textPrimary,
      lineHeight: 34,
    },
    h2: {
      fontSize: 22,
      fontWeight: '800' as const,
      color: colors.textPrimary,
      lineHeight: 28,
    },
    h3: {
      fontSize: 18,
      fontWeight: '700' as const,
      color: colors.textPrimary,
      lineHeight: 24,
    },
    title: {
      fontSize: 22,
      fontWeight: '800' as const,
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: 13,
      fontWeight: '500' as const,
      color: colors.textMuted,
    },
    body: {
      fontSize: 15,
      fontWeight: '400' as const,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    caption: {
      fontSize: 12,
      fontWeight: '400' as const,
      color: colors.textMuted,
    },
  },
} as const;

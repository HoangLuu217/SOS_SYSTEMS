import { colors } from './colors';
import { typography } from './typography';
import { spacing, radius } from './spacing';

export * from './colors';
export * from './typography';
export * from './spacing';

export const theme = {
  colors,
  typography,
  spacing,
  radius,
} as const;

/**
 * Tương thích ngược với các màn hình Profile đang dùng PROFILE_THEME
 */
export const PROFILE_THEME = {
  colors: {
    background: colors.background,
    card: colors.card,
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textMuted: colors.textMuted,
    textDim: colors.textDim,

    primary: colors.primary,
    primaryLight: colors.primaryLight,
    primaryBorder: colors.primaryBorder,
    primaryDark: colors.primaryDark,

    success: colors.success,
    successLight: colors.successLight,
    successBorder: colors.successBorder,
    successDark: colors.successDark,

    warning: colors.warning,
    warningLight: colors.warningLight,
    warningBorder: colors.warningBorder,
    warningDark: colors.warningDark,

    info: colors.info,
    infoLight: colors.infoLight,
    infoBorder: colors.infoBorder,
    infoDark: colors.infoDark,

    offline: colors.offline,
    offlineLight: colors.offlineLight,
    offlineBorder: colors.offlineBorder,

    suspended: colors.suspended,
    suspendedLight: colors.suspendedLight,
    suspendedBorder: colors.suspendedBorder,

    border: colors.border,
    borderLight: colors.borderLight,
    borderFocus: colors.borderFocus,
    inputBg: colors.inputBg,
    inputBorder: colors.inputBorder,
    inputBorderActive: colors.inputBorderActive,
    readOnlyBg: colors.readOnlyBg,
    readOnlyBorder: colors.readOnlyBorder,
    overlay: colors.overlay,
  },
  radius,
  typography: {
    title: typography.presets.title,
    subtitle: typography.presets.subtitle,
  },
} as const;

export default theme;

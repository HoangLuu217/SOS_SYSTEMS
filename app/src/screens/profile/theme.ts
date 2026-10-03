export const PROFILE_THEME = {
  colors: {
    background: '#F8FAFC',
    card: '#FFFFFF',
    textPrimary: '#0F172A', // Deep Navy
    textSecondary: '#334155', // Slate Navy
    textMuted: '#64748B',
    textDim: '#94A3B8',
    
    // Coral red primary
    primary: '#EF4444',
    primaryLight: '#FEF2F2',
    primaryBorder: '#FEE2E2',
    primaryDark: '#DC2626',

    // Success & Verification
    success: '#10B981',
    successLight: '#ECFDF5',
    successBorder: '#A7F3D0',
    successDark: '#047857',

    // Warning & Pending
    warning: '#F59E0B',
    warningLight: '#FFFBEB',
    warningBorder: '#FDE68A',
    warningDark: '#B45309',

    // Info & Missions
    info: '#0284C7',
    infoLight: '#F0F9FF',
    infoBorder: '#BAE6FD',
    infoDark: '#0369A1',

    // Neutral & Offline
    offline: '#64748B',
    offlineLight: '#F1F5F9',
    offlineBorder: '#CBD5E1',

    // Suspended
    suspended: '#DC2626',
    suspendedLight: '#FEF2F2',
    suspendedBorder: '#FECACA',

    // Borders & Backgrounds
    border: '#E2E8F0',
    borderLight: '#F1F5F9',
    borderFocus: '#EF4444',
    inputBg: '#FFFFFF',
    inputBorder: '#CBD5E1',
    inputBorderActive: '#EF4444',
    readOnlyBg: '#F8FAFC',
    readOnlyBorder: '#E2E8F0',
    overlay: 'rgba(15, 23, 42, 0.55)',
  },
  radius: {
    xs: 6,
    sm: 10,
    card: 18,
    input: 14,
    button: 16,
    badge: 24,
    sheet: 28,
    full: 9999,
  },
  typography: {
    title: {
      fontSize: 22,
      fontWeight: '800' as const,
      color: '#0F172A',
    },
    subtitle: {
      fontSize: 13,
      fontWeight: '500' as const,
      color: '#64748B',
    },
  },
};

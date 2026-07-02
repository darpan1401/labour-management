export const colors = {
  primary: '#153D36',
  primaryDark: '#0E2A24',
  primaryLight: '#1F5348',
  accent: '#E8792D',
  accentDark: '#C86A22',
  accentLight: '#FCE9D6',
  background: '#F3F6F1',
  surface: '#FFFFFF',
  border: '#D7E0DA',
  borderLight: '#E5ECE8',
  textPrimary: '#17231F',
  textSecondary: '#5B6A64',
  textMuted: '#8A9993',
  danger: '#B7352C',
  dangerBorder: '#E8B3AC',
  dangerBg: '#FBEAE7',
  success: '#1E7A42',
  successBg: '#E3F1E6',
  warning: '#B57912',
  warningBg: '#FBF0DC',
  chipInactiveBg: '#EFF4F1',
  overlay: 'rgba(11, 26, 22, 0.55)',
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const cardShadow = {
  shadowColor: '#0B1A16',
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

export const statusColors: Record<string, string> = {
  present: colors.success,
  absent: colors.danger,
  half: colors.warning,
  one_half: colors.accentDark,
};
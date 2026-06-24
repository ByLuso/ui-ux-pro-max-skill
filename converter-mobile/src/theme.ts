export const colors = {
  bg:       '#0F1117',
  surface:  '#1A1D27',
  card:     '#21253A',
  border:   '#2E3354',
  accent:   '#5B6EF7',
  accent2:  '#7C3AED',
  success:  '#22C55E',
  warning:  '#F59E0B',
  error:    '#EF4444',
  text:     '#E8EAFF',
  subtext:  '#8B91B5',
  dim:      '#4A5080',
} as const;

export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

export const radius = {
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  full: 9999,
} as const;

export const fontSize = {
  xs:  11,
  sm:  13,
  md:  15,
  lg:  17,
  xl:  20,
  xxl: 26,
} as const;

export const fontWeight = {
  regular: '400' as const,
  medium:  '500' as const,
  semibold:'600' as const,
  bold:    '700' as const,
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;

export const TOUCH_TARGET = 44;

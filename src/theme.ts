// Design tokens for FireVibe / SparkR.
// Exported in a few different shapes on purpose: the screens in this project
// (originally generated separately) import this module in several different
// styles (`import theme from './theme'`, `import { theme } from './theme'`,
// `import { colors, fonts } from './theme'`) - all of them are supported here
// so every screen resolves the same values no matter which style it uses.

export const colors = {
  background: '#0B0B10',
  foreground: '#FFF7F2',
  primary: '#FF6A24',
  primaryForeground: '#1A0B07',
  secondary: '#6E52D9',
  secondaryForeground: '#FFFFFF',
  accent: '#D9387A',
  accentForeground: '#FFFFFF',
  muted: '#241E29',
  mutedForeground: '#C8BBC7',
  card: '#17131B',
  cardForeground: '#FFF7F2',
  border: '#403342',
  input: '#211A25',
  destructive: '#D9414C',
  destructiveForeground: '#FFFFFF',
  success: '#22A06B',
  successForeground: '#061C13',
  chart1: '#FF6A24',
  chart2: '#D9387A',
  chart3: '#8B6CE8',
  chart4: '#20B8A6',
  chart5: '#E6B83E',
} as const;

export const fonts = {
  heading: 'Space Grotesk',
  body: 'Manrope',
} as const;

export const radius = 20;

export const theme = {
  colors,
  fonts,
  radius: String(radius),
  cornerRadius: radius,
} as const;

export default theme;

export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized;
  const num = parseInt(value, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

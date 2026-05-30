// lib/design/tokens.ts, Stream A Foundation.
//
// Shared design tokens calibrated to the Zedcor surface (the existing quality
// reference at components/zedcor/*). Surface streams B/C/D import from here.
//
// The codebase uses inline `style` props rather than Tailwind classes today,
// so tokens are exported as plain TS const objects. Components compose them
// into style objects directly.
//
// Palette captured verbatim from components/zedcor/ZedcorLeadList.tsx so the
// three rework surfaces match the Zedcor surface and each other.

export const color = {
  bg: '#0e1116',
  bgSubtle: 'rgba(255,255,255,0.03)',
  bgRaised: 'rgba(255,255,255,0.045)',
  border: 'rgba(91, 127, 255, 0.20)',
  borderStrong: 'rgba(91, 127, 255, 0.34)',
  text: '#e6e9ef',
  textMuted: '#9aa3b2',
  textDim: '#6c7587',
  accent: '#5B7FFF',
  accentSoft: 'rgba(91, 127, 255, 0.12)',
  scoreHi: '#FFB454',
  scoreMid: '#3DDC97',
  scoreLow: '#9aa3b2',
  danger: '#ff6b6b',
  verifiedPillBg: '#0f2615',
  verifiedPillBorder: '#1a5e2a',
  verifiedPillText: '#5bd87f',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 3,
  md: 4,
  lg: 6,
  xl: 8,
  pill: 999,
} as const;

export const font = {
  sans: 'var(--font-inter), system-ui, sans-serif',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
} as const;

export const fontSize = {
  eyebrow: 11,
  micro: 12,
  sm: 13,
  md: 14,
  lg: 16,
  xl: 18,
  hero: 22,
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semi: 600,
  bold: 700,
} as const;

export const letterSpacing = {
  tight: '0em',
  wide: '0.05em',
  wider: '0.08em',
  widest: '0.10em',
} as const;

/**
 * Score threshold mapping. >=80 high (orange), >=60 mid (green), else low
 * (muted). Matches Zedcor's ScorePill at components/zedcor/ZedcorLeadList.tsx.
 */
export function scoreColor(score: number | null | undefined): string {
  if (score == null) return color.textMuted;
  if (score >= 80) return color.scoreHi;
  if (score >= 60) return color.scoreMid;
  return color.scoreLow;
}

export const designTokens = {
  color,
  space,
  radius,
  font,
  fontSize,
  fontWeight,
  letterSpacing,
} as const;

export type DesignTokens = typeof designTokens;

// Atrium Design Tokens — Sprint 2
// Dark mode first. Unicron orange accent. Dense-where-needed, calm elsewhere.

export const tokens = {
  accent: '#FF6B2B',          // Unicron orange
  bgPrimary: '#0A0A0B',       // matches bg.base from Tailwind config
  bgPanel: '#101012',
  bgCard: '#141416',
  bgCardHover: '#1A1A1D',
  bgInput: '#1A1A1D',
  borderSubtle: '#1F1F23',
  borderHover: '#2A2A2E',
  textPrimary: '#E5E5E7',
  textMuted: 'rgba(229,229,231,0.6)',
  radius: '12px',
  radiusSm: '8px',
  shadowCard: '0 1px 3px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2)',
  transitionFast: '200ms ease',
  transitionPage: '400ms ease',
  statusGreen: '#22C55E',
  statusYellow: '#F59E0B',
  statusRed: '#EF4444',
  statusBlue: '#3B82F6',
} as const;

export type TokenKey = keyof typeof tokens;

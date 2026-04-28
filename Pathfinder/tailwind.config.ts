import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Chrome surfaces
        bg: '#ffffff',
        bgAlt: '#f6f7f9',
        bgRaised: '#ffffff',
        ink: '#0a0a0a',
        inkSub: '#3a3f46',
        inkDim: '#6b7280',
        inkFaint: '#9ca3af',
        rule: '#0a0a0a',
        // Map surfaces
        mapBg: '#0e1116',
        mapLand: '#1a1f26',
        mapInk: '#e6e9ef',
        mapInkDim: '#9aa3b2',
        // Meaning (only two)
        hi: '#22d3ee',
        warm: '#a3e635',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '3px',
        md: '5px',
        lg: '8px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(10,10,10,0.06), 0 0 0 1px rgba(10,10,10,0.06)',
        md: '0 4px 12px rgba(10,10,10,0.08), 0 0 0 1px rgba(10,10,10,0.06)',
        lg: '0 12px 32px rgba(10,10,10,0.16), 0 0 0 1px rgba(10,10,10,0.08)',
      },
      keyframes: {
        'pf-pulse': {
          '0%,100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.18)', opacity: '0.78' },
        },
        'pf-pulse-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '0.55' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        'pf-flash': {
          '0%': { background: 'rgba(34,211,238,0.14)' },
          '100%': { background: 'transparent' },
        },
      },
      animation: {
        'pf-pulse': 'pf-pulse 1200ms ease-in-out infinite',
        'pf-pulse-ring': 'pf-pulse-ring 1200ms ease-out infinite',
        'pf-flash': 'pf-flash 900ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base:     '#0A0C10',  // v3 --bg-ground
          panel:    '#11141A',  // v3 --bg-surface
          card:     '#181C24',  // v3 --bg-elevated (was #141416)
          elevated: '#181C24',  // alias for bg-card
          raised:   '#1F242E',  // v3 --bg-raised (was bg-input)
          input:    '#1F242E',  // back-compat alias for bg-raised
        },
        border: {
          faint:   'rgba(255,255,255,0.04)',
          subtle:  'rgba(255,255,255,0.07)',
          default: 'rgba(255,255,255,0.10)',  // was #1F1F23
          strong:  'rgba(255,255,255,0.16)',
          hover:   'rgba(255,255,255,0.16)',  // was #2A2A2E
          accent:  'rgba(232,118,58,0.40)',
        },
        text: {
          primary:   '#F2F4F7',   // v3 --text-hi (was #E5E5E7)
          secondary: '#A8B0BD',   // v3 --text-md (was rgba(229,229,231,0.6))
          muted:     '#6B7280',   // v3 --text-lo
          faint:     '#4A5160',   // v3 --text-faint
        },
        accent: {
          cyan:    '#22D3EE',
          gold:    '#E8763A',  // v3 --accent (was #FBBF24)
          violet:  '#8B5CF6',
          magenta: '#EC4899',
          orange:  '#E8763A',  // v3 --accent (was #FF6B2B)
        },
        status: {
          green:  '#4FB286',  // v3 --ok  (was #22C55E)
          yellow: '#D9A23A',  // v3 --warn (was #F59E0B)
          red:    '#DD6262',  // v3 --err  (was #EF4444)
          blue:   '#6F95D6',  // v3 --info (was #3B82F6)
        },
      },
      fontFamily: {
        sans:    ['Geist', 'Inter', 'sans-serif'],
        mono:    ['"Geist Mono"', '"JetBrains Mono"', 'monospace'],
        display: ['"Inter Tight"', 'Geist', 'sans-serif'],
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(0.85)' },
          '50%': { opacity: '1', transform: 'scale(1.15)' },
        },
        slideOutFade: {
          '0%': { opacity: '1', transform: 'translateX(0)' },
          '100%': { opacity: '0', transform: 'translateX(40px)' },
        },
        toastUp: {
          '0%': { opacity: '0', transform: 'translate(-50%, 8px)' },
          '10%, 90%': { opacity: '1', transform: 'translate(-50%, 0)' },
          '100%': { opacity: '0', transform: 'translate(-50%, 8px)' },
        },
        ellipsis: {
          '0%': { opacity: '0.2' },
          '50%': { opacity: '1' },
          '100%': { opacity: '0.2' },
        },
      },
      animation: {
        pulseDot: 'pulseDot 1.6s ease-in-out infinite',
        slideOutFade: 'slideOutFade 250ms ease-in forwards',
        toastUp: 'toastUp 2s ease-out forwards',
        ellipsis: 'ellipsis 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

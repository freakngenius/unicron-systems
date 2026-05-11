/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base:     '#F6F7F9',  // v3 cool gray page
          panel:    '#F6F7F9',  // same as base
          card:     '#FFFFFF',  // v3 white cards
          elevated: '#FFFFFF',  // alias for bg-card
          raised:   '#EEF0F4',  // hover rows, popovers
          input:    '#EEF0F4',  // input backgrounds
        },
        border: {
          faint:   '#EEF0F4',
          subtle:  '#EEF0F4',
          default: '#E5E8EE',
          strong:  '#D8DCE5',
          hover:   '#D8DCE5',
          accent:  'rgba(232,118,58,0.40)',
        },
        text: {
          primary:   '#0B1530',  // v3 ink — near-black navy
          secondary: '#46506A',  // v3 ink-md
          muted:     '#7E8AA3',  // v3 ink-lo
          faint:     '#BAC2D2',  // v3 ink-faint
        },
        accent: {
          primary: '#6081BE',  // v3 blue — primary actions
          cyan:    '#5BB5BC',
          gold:    '#E8763A',  // orange — brand + live state
          violet:  '#7355E5',  // v3 purple
          magenta: '#E14B4B',  // v3 red
          orange:  '#E8763A',
        },
        status: {
          green:  '#2E8E66',   // v3 --ok
          yellow: '#C28A1F',   // v3 --warn
          red:    '#E14B4B',   // v3 --err
          blue:   '#6081BE',   // v3 --info / primary
        },
        // ----------------------------------------------------------------
        // Remap named Tailwind palettes to v3 light equivalents so that
        // existing class strings resolve without a full component rewrite.
        // ----------------------------------------------------------------
        rose: {
          300: '#E87777',
          400: '#E14B4B',   // → v3 err
          500: '#E14B4B',
        },
        red: {
          300: '#E87777',
          400: '#E14B4B',   // → v3 err
          500: '#E14B4B',
        },
        emerald: {
          300: '#5EB594',
          400: '#2E8E66',   // → v3 ok
          500: '#2E8E66',
        },
        amber: {
          300: '#D9B45A',
          400: '#C28A1F',   // → v3 warn
          500: '#C28A1F',
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

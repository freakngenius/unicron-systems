/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { base: '#0A0A0B', panel: '#101012', card: '#141416', input: '#1A1A1D' },
        border: { default: '#1F1F23', hover: '#2A2A2E' },
        text: { primary: '#E5E5E7', secondary: 'rgba(229,229,231,0.6)' },
        accent: {
          cyan: '#22D3EE',
          gold: '#FBBF24',
          violet: '#8B5CF6',
          magenta: '#EC4899',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
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

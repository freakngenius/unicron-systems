/** @type {import('tailwindcss').Config} */
//
// Atrium v3 — Stellate-inspired editorial design.
// Source: Brand/Atrium Design System/v3.jsx (v3Tokens template).
//
// This config re-points every legacy alias (bg-base, text-primary, border-default,
// accent-*, status-*, rose/red/emerald/amber) to the v3 palette so existing
// Tailwind class strings flip from dark-mode to the canonical light-mode Stellate
// design without rewriting every consumer.
//
// New code should prefer var(--v3-*) directly. See src/atrium/styles/atrium-tokens.css.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base:     '#F6F7F9',   // --v3-bg     (was dark #0A0C10)
          panel:    '#FFFFFF',   // --v3-surface
          card:     '#FFFFFF',   // --v3-surface
          elevated: '#FFFFFF',   // --v3-surface
          raised:   '#ECEEF2',   // --v3-bg-soft
          input:    '#FFFFFF',   // white inputs on cool-gray page
          rail:     '#1D2D4F',   // --v3-rail (navy)
        },
        border: {
          faint:   '#EEF0F4',    // --v3-line-soft
          subtle:  '#EEF0F4',    // --v3-line-soft
          default: '#E5E8EE',    // --v3-line
          strong:  '#D8DCE5',    // --v3-line-strong
          hover:   '#D8DCE5',    // --v3-line-strong
          accent:  'rgba(232,118,58,0.40)',
        },
        text: {
          primary:   '#0B1530',  // --v3-ink
          secondary: '#46506A',  // --v3-ink-md
          muted:     '#7E8AA3',  // --v3-ink-lo
          faint:     '#BAC2D2',  // --v3-ink-faint
        },
        accent: {
          // Legacy accent-* aliases re-pointed to v3 equivalents.
          primary: '#6081BE',    // --v3-blue (primary actions, from main)
          cyan:    '#6081BE',    // --v3-blue (was teal #5BB5BC)
          gold:    '#E8763A',    // --v3-orange
          violet:  '#7355E5',    // --v3-purple
          magenta: '#E14B4B',    // --v3-red (used as fail indicator)
          orange:  '#E8763A',    // --v3-orange
        },
        status: {
          green:  '#2E8E66',     // --v3-green
          yellow: '#C28A1F',     // --v3-amber
          red:    '#E14B4B',     // --v3-red
          blue:   '#6081BE',     // --v3-blue
        },
        // ----------------------------------------------------------------
        // Atrium semantic aliases for Tailwind's native named palettes.
        // Existing components use `text-rose-400`, `border-emerald-400/40`,
        // `bg-rose-400/10` etc; re-mapping to v3 semantics keeps the visual
        // language consistent on the light surface.
        // ----------------------------------------------------------------
        rose: {
          300: '#E97070',
          400: '#E14B4B',        // --v3-red
          500: '#E14B4B',
        },
        red: {
          300: '#E97070',
          400: '#E14B4B',        // --v3-red
          500: '#E14B4B',
        },
        emerald: {
          300: '#5BA98C',
          400: '#2E8E66',        // --v3-green
          500: '#2E8E66',
        },
        amber: {
          300: '#D5A14A',
          400: '#C28A1F',        // --v3-amber
          500: '#C28A1F',
        },
      },
      fontFamily: {
        sans:    ['Geist', '"Inter Tight"', 'Inter', 'sans-serif'],
        mono:    ['"Geist Mono"', '"JetBrains Mono"', 'monospace'],
        display: ['Geist', '"Inter Tight"', 'sans-serif'],
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

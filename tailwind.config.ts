import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg)",
        "canvas-2": "var(--bg-2)",
        "canvas-3": "var(--bg-3)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        line: "var(--line)",
        mycelium: "var(--accent-3)",
        beehive: "var(--accent-2)",
        colony: "var(--accent)",
        murmuration: "var(--accent-4)",
        slime: "var(--accent-5)",
      },
      fontFamily: {
        display: ["Iowan Old Style", "Palatino", "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

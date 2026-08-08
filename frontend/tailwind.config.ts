import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          base: "var(--color-surface-base)",
          raised: "var(--color-surface-raised)",
          sunken: "var(--color-surface-sunken)",
          overlay: "var(--color-surface-overlay)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
          inverse: "var(--color-text-inverse)",
        },
        accent: {
          emerald: "var(--color-accent-emerald)",
          "emerald-soft": "var(--color-accent-emerald-soft)",
          slate: "var(--color-accent-slate)",
          "slate-soft": "var(--color-accent-slate-soft)",
        },
        status: {
          positive: "var(--color-status-positive)",
          "positive-soft": "var(--color-status-positive-soft)",
          attention: "var(--color-status-attention)",
          "attention-soft": "var(--color-status-attention-soft)",
          concerning: "var(--color-status-concerning)",
          "concerning-soft": "var(--color-status-concerning-soft)",
          info: "var(--color-status-info)",
          "info-soft": "var(--color-status-info-soft)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-xl": [
          "3.75rem",
          { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        "display-lg": [
          "2.75rem",
          { lineHeight: "1.08", letterSpacing: "-0.015em", fontWeight: "700" },
        ],
        "display-md": [
          "2rem",
          { lineHeight: "1.15", letterSpacing: "-0.01em", fontWeight: "700" },
        ],
        "editorial-num": [
          "2.5rem",
          { lineHeight: "1", letterSpacing: "-0.02em", fontWeight: "600" },
        ],
      },
      borderRadius: {
        card: "4px",
        chip: "2px",
        control: "3px",
      },
      boxShadow: {
        "elevation-1":
          "0 1px 2px rgba(28, 27, 23, 0.04), 0 1px 1px rgba(28, 27, 23, 0.03)",
        "elevation-2":
          "0 4px 12px rgba(28, 27, 23, 0.06), 0 1px 2px rgba(28, 27, 23, 0.04)",
        "elevation-3":
          "0 12px 32px rgba(28, 27, 23, 0.10), 0 2px 6px rgba(28, 27, 23, 0.05)",
      },
      transitionTimingFunction: {
        editorial: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      maxWidth: {
        prose: "68ch",
      },
    },
  },
  plugins: [],
};

export default config;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          deep: "var(--bg-deep)",
          panel: "var(--bg-panel)",
          elevated: "var(--bg-elevated)"
        },
        accent: {
          sky: "var(--accent-sky)",
          teal: "var(--accent-teal)",
          amber: "var(--accent-amber)",
          red: "var(--accent-red)"
        },
        ink: {
          strong: "var(--ink-strong)",
          normal: "var(--ink-normal)",
          soft: "var(--ink-soft)"
        }
      },
      borderRadius: {
        shell: "1.1rem"
      },
      boxShadow: {
        panel: "0 16px 36px rgba(2, 6, 23, 0.42)",
        focus: "0 0 0 2px rgba(113, 204, 255, 0.55)"
      },
      fontFamily: {
        display: ["Sora", "Space Grotesk", "Avenir Next", "Segoe UI", "sans-serif"],
        body: ["IBM Plex Sans", "Manrope", "Avenir Next", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      }
    }
  },
  plugins: []
};

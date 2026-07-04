/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Sora", "Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        paper: "#f7f4ee",
        ink: "#111217",
        graphite: "#2e3338",
        muted: "#69727d",
        mint: "#2f7f75",
        coral: "#d16d44",
        iris: "#5b5bd6"
      },
      boxShadow: {
        panel: "0 28px 90px rgba(17, 18, 23, 0.12)"
      }
    }
  },
  plugins: []
};

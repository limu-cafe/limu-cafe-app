import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: "#FDFAF5",
          100: "#F7F0E0",
          200: "#EDE0C4",
        },
        espresso: {
          DEFAULT: "#2C1A0E",
          700: "#3D2512",
          600: "#5C3D1E",
          500: "#7A5230",
          400: "#9B6B42",
        },
        matcha: {
          DEFAULT: "#4A7C59",
          light: "#6B9E7A",
          dark: "#2D5940",
        },
        amber: {
          cafe: "#D4872A",
        },
      },
      fontFamily: {
        sans: ["var(--font-noto)", "sans-serif"],
        display: ["var(--font-playfair)", "serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.4s ease-out",
        "scale-in": "scaleIn 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // TerangaCoach Design System — palette stricte
        background:  "#0D0D0D",
        card:        "#161616",
        border:      "#2A2A2A",
        foreground:  "#FFFFFF",
        muted:       "#B0B0B0",
        primary: {
          DEFAULT:   "#00853F",
          foreground:"#FFFFFF",
        },
        destructive: {
          DEFAULT:   "#E31B23",
          foreground:"#FFFFFF",
        },
        // shadcn overrides
        secondary: {
          DEFAULT:   "#161616",
          foreground:"#FFFFFF",
        },
        accent: {
          DEFAULT:   "#1A1A1A",
          foreground:"#FFFFFF",
        },
        popover: {
          DEFAULT:   "#161616",
          foreground:"#FFFFFF",
        },
        input:       "#2A2A2A",
        ring:        "#00853F",
      },
      borderRadius: {
        lg: "8px",
        md: "6px",
        sm: "4px",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,0.4), 0 1px 2px -1px rgba(0,0,0,0.4)",
      },
      screens: {
        xs: "375px",
      },
    },
  },
  plugins: [],
};

export default config;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // 手绘风格特色颜色
        sketch: {
          ink: "#2d2d2d",
          paper: "#faf8f5",
          pencil: "#666666",
          highlight: "#ffeb3b",
        },
        pastel: {
          blue: "#a7d7e8",
          green: "#b9e4c9",
          pink: "#f1c0e8",
          yellow: "#fcf6bd",
          orange: "#ffcfb3",
          purple: "#cfbaf0",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        'sketch': '255px 15px 225px 15px / 15px 225px 15px 255px',
      },
      fontFamily: {
        // 将中文字体优先放在字体族前，以便中文字符使用 ZCOOL / Noto Serif 即使在其他字体工具类中也能回退到中文字体
        sketch: ['"ZCOOL KuaiLe"', '"Noto Serif"', '"Comic Neue"', '"Patrick Hand"', 'cursive', 'sans-serif'],
        hand: ['"ZCOOL KuaiLe"', '"Noto Serif"', '"Caveat"', '"Gloria Hallelujah"', 'cursive'],
      },
      boxShadow: {
        sketch: '2px 3px 0px 0px #2d2d2d',
        'sketch-lg': '4px 5px 0px 0px #2d2d2d',
        'sketch-sm': '1px 2px 0px 0px #2d2d2d',
      },
      animation: {
        'wiggle': 'wiggle 0.3s ease-in-out infinite',
        'sketch-draw': 'sketchDraw 0.5s ease-out forwards',
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(-1deg)' },
          '50%': { transform: 'rotate(1deg)' },
        },
        sketchDraw: {
          '0%': { strokeDashoffset: '1000' },
          '100%': { strokeDashoffset: '0' },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

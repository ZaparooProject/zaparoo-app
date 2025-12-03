/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      spacing: {
        "safe-top": "env(safe-area-inset-top, 0px)",
        "safe-bottom": "env(safe-area-inset-bottom, 0px)",
        "safe-left": "env(safe-area-inset-left, 0px)",
        "safe-right": "env(safe-area-inset-right, 0px)",
        "safe-top-4": "calc(1rem + env(safe-area-inset-top, 0px))",
        "safe-bottom-4": "calc(1rem + env(safe-area-inset-bottom, 0px))",
        "safe-left-4": "calc(1rem + env(safe-area-inset-left, 0px))",
        "safe-right-4": "calc(1rem + env(safe-area-inset-right, 0px))",
        "bottom-nav": "calc(80px + env(safe-area-inset-bottom, 0px))",
      },
    },
  },
  plugins: ["tailwindcss-animate"],
};

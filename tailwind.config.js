/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      spacing: {
        'safe-top': 'var(--safe-area-top, 0px)',
        'safe-bottom': 'var(--safe-area-bottom, 0px)',
        'safe-left': 'var(--safe-area-left, 0px)',
        'safe-right': 'var(--safe-area-right, 0px)',
        'safe-top-4': 'calc(1rem + var(--safe-area-top, 0px))',
        'safe-bottom-4': 'calc(1rem + var(--safe-area-bottom, 0px))',
        'safe-left-4': 'calc(1rem + var(--safe-area-left, 0px))',
        'safe-right-4': 'calc(1rem + var(--safe-area-right, 0px))',
        'bottom-nav': 'calc(80px + var(--safe-area-bottom, 0px))'
      }
    }
  },
  plugins: ["tailwindcss-animate"]
};

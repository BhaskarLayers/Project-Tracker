/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        strategy: '#C0392B',
        planning: '#27AE60',
        design: '#9B59B6',
        social: '#E67E22',
        execution: '#E84393',
        today: '#FFEB3B',
        'grid-line': '#E9ECEF',
        'bg-off-white': '#F5F6F8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

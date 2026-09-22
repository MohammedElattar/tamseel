/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
        naskh: ['"Noto Naskh Arabic"', 'Amiri', 'serif'],
      },
    },
  },
  plugins: [],
};

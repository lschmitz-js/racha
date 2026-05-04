/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        bg2: '#141414',
        bg3: '#1f1f1f',
        border: '#2a2a2a',
        text: '#e7e7e7',
        muted: '#9a9a9a',
        accent: '#22c55e',
        white_v: '#f3f4f6',
        black_v: '#111827',
        green_v: '#16a34a',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

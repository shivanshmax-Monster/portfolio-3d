/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        synth: {
          cyan: '#00FFFF',
          magenta: '#FF00FF',
          purple: '#2b00ff',
          bg: '#050014'
        }
      },
      fontFamily: {
        sans: ['Space Grotesk', 'sans-serif'],
      }
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/styles.css",
    "./src/**/*.{js,jsx,ts,tsx,css}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e3f5f0',
          100: '#c8ebe1',
          200: '#9ddcc6',
          300: '#65c8a7',
          400: '#2cb389',
          500: '#00ae91',
          600: '#009579',
          700: '#008f76',
          800: '#006655',
          900: '#003f33'
        },
        ink: {
          DEFAULT: '#1f1c18',
          soft: '#4a5560'
        },
        surface: {
          DEFAULT: '#ffffff',
          alt: '#eef4f1'
        },
        border: {
          DEFAULT: '#dce9e5',
          strong: '#b7cdc5'
        },
        success: '#00ae91',
        danger:  '#c85d2c',
        warn:    '#b48a2d',
        info:    '#1e6fb6'
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '14px',
        xl: '14px',
        '2xl': '18px'
      },
      boxShadow: {
        soft: '0 2px 8px rgba(0, 40, 40, 0.06)',
        ui:   '0 8px 28px rgba(0, 40, 40, 0.08)'
      },
      fontFamily: {
        ui: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial'],
        heading: ['"Space Grotesk"', 'Manrope', 'system-ui', 'sans-serif'],
        mono: ['"Roboto Mono"', 'ui-monospace', 'monospace']
      }
    }
  },
  plugins: []
}

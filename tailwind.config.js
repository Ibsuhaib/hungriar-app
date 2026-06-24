/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },
    extend: {
      colors: {
        primary: {
          50: '#fdf3ee',
          100: '#fbe3d6',
          200: '#f6c5ad',
          300: '#f0a079',
          400: '#e9824a',
          500: '#e76f51',
          600: '#d3552f',
          700: '#b13f23',
          800: '#8f3320',
          900: '#742c1e',
        },
        secondary: {
          50: '#eefbf9',
          100: '#d3f3ed',
          200: '#a8e7dc',
          300: '#73d4c5',
          400: '#43bba8',
          500: '#2a9d8f',
          600: '#1f7e74',
          700: '#1d645e',
          800: '#1c504c',
          900: '#1a4441',
        },
        sand: {
          50: '#fffdf8',
          100: '#fff8f0',
          200: '#fbeed9',
          300: '#f3dfc1',
          400: '#e9cda3',
          500: '#dcb480',
        },
        accent: {
          400: '#f4a261',
          500: '#e9a047',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 2px 10px 0 rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
}

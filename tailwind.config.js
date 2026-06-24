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
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,0.10), 0 2px 4px -1px rgba(0,0,0,0.06)',
        'card-lg': '0 8px 24px -4px rgba(0,0,0,0.10), 0 3px 8px -2px rgba(0,0,0,0.06)',
        glow: '0 0 0 3px rgba(231,111,81,0.20)',
        'glow-secondary': '0 0 0 3px rgba(42,157,143,0.20)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(100%)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
        'slide-in-right': 'slide-in-right 0.28s cubic-bezier(0.32,0.72,0,1)',
        'scale-in': 'scale-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
}

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
        // Brand gold / copper — #D4A373
        primary: {
          50:  '#fbf5ec',
          100: '#f7ebd6',
          200: '#efd8b8',
          300: '#e6c69a',
          400: '#ddb586',
          500: '#d4a373',  // brand accent gold
          600: '#b8865a',
          700: '#9c6a42',
          800: '#7f5030',
          900: '#663d20',
        },
        // Brand navy — sidebar, dark backgrounds
        navy: {
          50:  '#eef2f9',
          100: '#d5deed',
          200: '#adbcd9',
          300: '#7e97be',
          400: '#5674a3',
          500: '#334155',  // slate
          600: '#1e2d45',
          700: '#162238',
          800: '#0f172a',  // deep brand navy
          900: '#080e1a',
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
      },
      fontFamily: {
        sans:    ['Poppins', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:        '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)',
        'card-hover':'0 4px 12px 0 rgba(0,0,0,0.10), 0 2px 4px -1px rgba(0,0,0,0.06)',
        'card-lg':   '0 8px 24px -4px rgba(0,0,0,0.10), 0 3px 8px -2px rgba(0,0,0,0.06)',
        glow:        '0 0 0 3px rgba(212,163,115,0.25)',
        'glow-gold': '0 0 24px rgba(212,163,115,0.30)',
      },
      keyframes: {
        'marquee': {
          from: { transform: 'translateX(0)' },
          to:   { transform: 'translateX(calc(-100% - 12px))' },
        },
        'grid': {
          '0%':   { transform: 'translateY(-50%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(100%)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in':        'fade-in 0.2s ease-out',
        'slide-up':       'slide-up 0.25s ease-out',
        'slide-in-right': 'slide-in-right 0.28s cubic-bezier(0.32,0.72,0,1)',
        'scale-in':       'scale-in 0.2s ease-out',
        'marquee':        'marquee var(--marquee-duration, 35s) linear infinite',
        'marquee-reverse':'marquee var(--marquee-duration, 35s) linear infinite reverse',
        'grid':           'grid 18s linear infinite',
        'spin-slow':      'spin 8s linear infinite',
      },
    },
  },
  plugins: [],
}

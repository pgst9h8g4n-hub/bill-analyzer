/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        clay: {
          50:  '#fef7ee',
          100: '#fdeddc',
          200: '#fad9b6',
          300: '#f6ba82',
          400: '#f08e46',
          500: '#e06b2a',
          600: '#b45309',
          700: '#92400e',
          800: '#78350f',
          900: '#451a03',
        },
        paper: '#FDF8F0',
        ink:   '#1C1917',
        smoke: '#78716C',
        frost: '#E7E5E4',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 3px rgba(180,83,9,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        card: '0 1px 8px rgba(180,83,9,0.07), 0 1px 2px rgba(0,0,0,0.04)',
        nav:  '0 -1px 0 rgba(0,0,0,0.04)',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
    }
  },
  plugins: []
};

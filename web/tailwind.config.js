/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          50: '#FDF8ED',
          100: '#F6E7C1',
          200: '#E3C27E',
          300: '#D6B268',
          400: '#C9A050',
          500: '#B78F44',
          600: '#A5813A',
          700: '#8A6A2F',
          800: '#6E5320',
          900: '#4B3915',
        },
        ink: {
          950: '#08080A',
          900: '#0D0D10',
          850: '#131317',
          800: '#17171C',
          700: '#1F1F26',
          600: '#2A2A33',
          500: '#3A3A45',
          400: '#5A5A67',
          300: '#8A8A97',
        },
        bone: {
          50: '#FCFBF8',
          100: '#F6F3EC',
          200: '#EDE8DC',
          300: '#DED7C6',
          400: '#C4BBA6',
        },
        acqua: {
          400: '#7FB3AE',
          500: '#5E8F8B',
          600: '#456E6B',
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Manrope', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        widest: '0.24em',
        brand: '0.42em',
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #F6E7C1 0%, #E3C27E 28%, #C9A050 58%, #8A6A2F 100%)',
        'gold-sheen': 'linear-gradient(100deg, transparent 20%, rgba(246,231,193,.55) 48%, transparent 72%)',
        'ink-vignette': 'radial-gradient(120% 90% at 50% 0%, #1A1A20 0%, #0A0A0C 62%, #060608 100%)',
        'bone-vignette': 'radial-gradient(120% 90% at 50% 0%, #FFFFFF 0%, #F6F3EC 55%, #EDE8DC 100%)',
      },
      boxShadow: {
        gold: '0 0 0 1px rgba(201,160,80,.28), 0 18px 48px -24px rgba(201,160,80,.55)',
        'gold-lg': '0 0 0 1px rgba(227,194,126,.4), 0 40px 90px -40px rgba(201,160,80,.7)',
        card: '0 1px 2px rgba(8,8,10,.05), 0 24px 60px -40px rgba(8,8,10,.45)',
        'card-dark': '0 1px 0 rgba(255,255,255,.04) inset, 0 30px 70px -45px rgba(0,0,0,.9)',
        inset: 'inset 0 1px 0 rgba(255,255,255,.06)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-140% 0' },
          '100%': { backgroundPosition: '240% 0' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'draw-line': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(.85)', opacity: '.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
      },
      animation: {
        shimmer: 'shimmer 2.6s linear infinite',
        float: 'float 7s ease-in-out infinite',
        'fade-up': 'fade-up .7s cubic-bezier(.16,1,.3,1) both',
        'draw-line': 'draw-line .9s cubic-bezier(.16,1,.3,1) both',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(.16,1,.3,1) infinite',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(.16,1,.3,1)',
      },
    },
  },
  plugins: [],
};

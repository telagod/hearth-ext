import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

export default {
  content: ['./src/**/*.{ts,tsx,html}', './mockups/**/*.html'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f7f7f5',
          100: '#ecebe6',
          200: '#d6d4ca',
          300: '#b6b3a3',
          400: '#8e8a7a',
          500: '#6b685a',
          600: '#504e44',
          700: '#3b3a32',
          800: '#262620',
          900: '#181813',
          950: '#0c0c09',
        },
        ember: {
          50: '#fff8ed',
          100: '#ffeed1',
          200: '#ffd89a',
          300: '#ffba5b',
          400: '#ff9b2d',
          500: '#f87b15',
          600: '#e85d0a',
          700: '#c0420c',
          800: '#993411',
          900: '#7c2c12',
        },
        moss: {
          400: '#85a987',
          500: '#5f8a64',
          600: '#456c4a',
        },
      },
      fontFamily: {
        sans: ['"Inter var"', '"Source Han Sans SC"', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif Pro"', '"Source Han Serif SC"', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      backdropBlur: {
        xs: '4px',
      },
      animation: {
        'orb-breath': 'orb-breath 4s ease-in-out infinite',
        'shimmer': 'shimmer 2.4s linear infinite',
      },
      keyframes: {
        'orb-breath': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.85' },
          '50%': { transform: 'scale(1.06)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
    },
  },
  plugins: [typography],
} satisfies Config;

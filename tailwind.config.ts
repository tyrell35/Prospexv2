import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        prospex: {
          bg: '#0A0A0F',
          surface: '#141418',
          card: '#1A1A22',
          border: '#2A2A32',
          cyan: '#00D4FF',
          blue: '#0088FF',
          green: '#00FF88',
          amber: '#FFB800',
          red: '#FF4444',
          text: '#E8E8EC',
          muted: '#9898A0',
          dim: '#5A5A66',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0, 212, 255, 0.3), 0 0 40px rgba(0, 212, 255, 0.1)',
        'glow-green': '0 0 20px rgba(0, 255, 136, 0.3)',
        'glow-amber': '0 0 20px rgba(255, 184, 0, 0.3)',
        'glow-red': '0 0 20px rgba(255, 68, 68, 0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 212, 255, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 212, 255, 0.4), 0 0 40px rgba(0, 212, 255, 0.1)' },
        }
      }
    },
  },
  plugins: [],
};

export default config;

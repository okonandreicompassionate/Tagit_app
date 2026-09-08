import type { Config } from 'tailwindcss';

// Same palette and type stack as admin/index.html and landing/ — the
// dashboard should read as the same product, not a different tool.
export default {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: '#0a0a09',
        surface: '#141412',
        surfhi: '#1e1e1b',
        edge: '#2a2a26',
        dim: '#8c8c84',
        faint: '#5d5d57',
        snap: '#fffc00',
        flame: '#ff6b2c',
        good: '#2bd97c',
        warn: '#f5a623',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Arial', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;

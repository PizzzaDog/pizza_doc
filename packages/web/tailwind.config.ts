import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

// Colors and sizes are sourced from Notion page 11 (UI Visual Language).
// Do not edit HEX values here — update page 11 first, then mirror here.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          tertiary: 'var(--bg-tertiary)',
          elevated: 'var(--bg-elevated)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
        },
        fg: {
          primary: 'var(--fg-primary)',
          secondary: 'var(--fg-secondary)',
          tertiary: 'var(--fg-tertiary)',
          muted: 'var(--fg-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          fg: 'var(--accent-fg)',
          muted: 'var(--accent-muted)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
        type: {
          controller: 'var(--type-controller)',
          service: 'var(--type-service)',
          repository: 'var(--type-repository)',
          model: 'var(--type-model)',
          table: 'var(--type-table)',
          page: 'var(--type-page)',
          external: 'var(--type-external)',
        },
        kind: {
          frontend: 'var(--kind-frontend)',
          backend: 'var(--kind-backend)',
          database: 'var(--kind-database)',
          queue: 'var(--kind-queue)',
          external: 'var(--kind-external)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Geist Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Geist Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        meta: ['11px', { lineHeight: '14px' }],
        ui: ['13px', { lineHeight: '18px' }],
        content: ['14px', { lineHeight: '20px' }],
      },
      fontWeight: {
        // 450 is the Linear-like "settled" weight from page 11.
        normal: '450',
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '6px',
        md: '8px',
        lg: '10px',
        xl: '12px',
      },
      boxShadow: {
        popover: '0 8px 24px rgba(0, 0, 0, 0.4)',
        'popover-light': '0 4px 16px rgba(0, 0, 0, 0.08)',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        120: '120ms',
        140: '140ms',
        160: '160ms',
        180: '180ms',
        200: '200ms',
      },
    },
  },
  plugins: [animate],
} satisfies Config

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--primary-color)',
          hover: 'var(--primary-hover)',
          light: 'var(--primary-light)',
        },
        secondary: {
          DEFAULT: 'var(--secondary-color)',
        },
        dark: {
          bg: 'var(--dark-bg)',
          sidebar: 'var(--dark-sidebar)',
          card: 'var(--dark-card)',
          input: 'var(--dark-input)',
          border: 'var(--dark-border)',
          hover: 'var(--dark-hover)',
        },
        accent: {
          red: 'var(--primary-color)',
          redHover: 'var(--primary-hover)',
        },
        status: {
          open: 'var(--status-open)',
          closed: 'var(--status-closed)',
          completed: 'var(--status-completed)',
          warning: 'var(--status-warning)',
          error: 'var(--status-error)',
        }
      },
      fontSize: {
        'xs': '0.75rem',
        'sm': '0.8rem',
        'base': '0.85rem',
      },
      spacing: {
        '0.5': '0.125rem',
        '1': '0.25rem',
        '1.5': '0.375rem',
        '2': '0.5rem',
        '3': '0.75rem',
        '4': '1rem',
      }
    },
  },
  plugins: [],
}

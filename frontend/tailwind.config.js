/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme from existing design
        dark: {
          bg: '#16213e',
          card: '#1a1a2e',
          input: '#1a1a2e',
          border: '#0f3460',
          hover: '#0f1a2e',
        },
        accent: {
          red: '#e94560',
          redHover: '#d63850',
        },
        status: {
          open: '#27ae60',
          closed: '#7f8c8d',
          completed: '#3498db',
          warning: '#f39c12',
          error: '#e74c3c',
        }
      },
      fontSize: {
        'xs': '0.75rem',
        'sm': '0.8rem',
        'base': '0.85rem',
      },
      spacing: {
        // Compact spacing per Mike's request (~50% reduction)
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

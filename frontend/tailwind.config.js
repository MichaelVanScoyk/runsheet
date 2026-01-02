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
          DEFAULT: '#016a2b',
          hover: '#015a24',
        },
        // REMAP dark-* to LIGHT colors
        dark: {
          bg: '#f5f5f5',
          card: '#ffffff',
          border: '#e0e0e0',
          hover: '#f0f0f0',
          input: '#ffffff',
          sidebar: '#016a2b',
        },
        // Remap accent-red to green
        accent: {
          red: '#016a2b',
          redHover: '#015a24',
        },
        status: {
          open: '#27ae60',
          closed: '#7f8c8d',
          completed: '#3498db',
          warning: '#f39c12',
          error: '#e74c3c',
        }
      },
      textColor: {
        // Force gray text to be visible on light backgrounds
        'gray-400': '#666666',
        'gray-500': '#555555',
      }
    },
  },
  plugins: [],
}

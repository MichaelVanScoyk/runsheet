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
          light: '#e8f5e9',
        },
        // Remap dark theme to light
        dark: {
          bg: '#ffffff',
          card: '#ffffff', 
          border: '#e0e0e0',
          hover: '#f5f5f5',
          input: '#ffffff',
        },
        accent: {
          red: '#016a2b',
          redHover: '#015a24',
        },
        status: {
          open: '#28a745',
          closed: '#6c757d',
          completed: '#007bff',
          warning: '#ffc107',
          error: '#dc3545',
        }
      },
    },
  },
  plugins: [],
}

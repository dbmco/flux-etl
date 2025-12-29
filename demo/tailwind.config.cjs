/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './apps/web/app/**/*.{ts,tsx,js,jsx}',
    './components/**/*.{ts,tsx,js,jsx}'
  ],
  theme: {
    extend: {}
  },
  plugins: [require('@tailwindcss/forms')]
};

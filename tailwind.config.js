/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './*.{js,ts,jsx,tsx}', './src/**/*.{js,ts,jsx,tsx}', './supabase/functions/**/*.{js,ts}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

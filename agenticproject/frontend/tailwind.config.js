/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#FEF5F2",
          100: "#FDEBE5",
          200: "#F5A9A1",
          300: "#F08B7F",
          400: "#E87F70",
          500: "#E07856",
          600: "#D46B47",
          700: "#C85A3A",
          800: "#B84B2E",
          900: "#933A22",
        },
      },
    },
  },
  plugins: [],
};

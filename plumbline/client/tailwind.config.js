/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#14213D", teal: { DEFAULT: "#0E7C86", light: "#DCEFF1" }, amber: { DEFAULT: "#E8A33D", light: "#FBEBD0" }, rose: { DEFAULT: "#C8453B", light: "#F8DEDB" }, moss: { DEFAULT: "#2E8B6A", light: "#DBF0E6" }, paper: "#F7F5F0", mist: "#EEF0F3" },
      fontFamily: { head: ["Poppins", "system-ui", "sans-serif"], body: ['"Source Sans 3"', "Carlito", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};

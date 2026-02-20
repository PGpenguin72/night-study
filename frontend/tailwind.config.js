/** @type {import('tailwindcss').Config} */
export default {
  // 這裡路徑必須包含 src 下的所有 jsx 檔案
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

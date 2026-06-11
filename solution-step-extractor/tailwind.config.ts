import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#070b12",
        panel: "#0d1522",
        line: "#1f2a3d",
        ninja: "#22c55e"
      },
      boxShadow: {
        glow: "0 0 60px rgba(34, 197, 94, 0.16)"
      }
    }
  },
  plugins: []
};

export default config;

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Сборка кладётся прямо в docs/ — эта папка является корнем GitHub Pages,
// поэтому URL фото (docs/demo/*.jpg) и адрес приложения не меняются.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "../docs",
    emptyOutDir: false,
    assetsDir: "assets",
    sourcemap: false,
  },
});

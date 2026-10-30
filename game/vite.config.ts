import { defineConfig } from "vite";

export default defineConfig({
  build: { outDir: "dist", sourcemap: false },
  preview: { port: 5174, strictPort: true },
});

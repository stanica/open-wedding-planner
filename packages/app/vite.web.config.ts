import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Standalone web build — output goes to packages/gateway/web-dist
// so the gateway can serve it as static files.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: path.resolve(__dirname, "src/renderer"),
  base: "/",
  build: {
    outDir: path.resolve(__dirname, "../gateway/web-dist"),
    emptyOutDir: true,
  },
});

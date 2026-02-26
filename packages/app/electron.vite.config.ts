import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@wedding-planner/shared"] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["@wedding-planner/shared"] })],
  },
  renderer: {
    plugins: [react(), tailwindcss()],
  },
});

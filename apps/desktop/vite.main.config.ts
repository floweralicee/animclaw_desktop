import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      external: ["electron", "electron-squirrel-startup", "node:child_process", "node:path", "node:fs", "node:http", "node:os", "node:url"],
    },
  },
  resolve: {
    conditions: ["node"],
  },
});

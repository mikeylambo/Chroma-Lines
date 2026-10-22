import { defineConfig } from "vite";

export default defineConfig({
  define: { __PLATFORM__: JSON.stringify(process.env.PLATFORM ?? "web") },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
  },
});

import { defineConfig } from "vite";

const platform = process.env.PLATFORM ?? "web";

export default defineConfig({
  define: { __PLATFORM__: JSON.stringify(platform) },
  plugins: [{
    name: "playables-sdk",
    // YouTube Playables requires its SDK as the first script; web builds stay network-free.
    transformIndexHtml: (html) => platform === "youtube" ? html.replace("<head>", `<head>\n  <script src="https://www.youtube.com/game_api/v1"></script>`) : html,
  }],
  build: { target: "es2022", chunkSizeWarningLimit: 2000, assetsInlineLimit: 0 },
});

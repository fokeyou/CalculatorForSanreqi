import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// 反向代理域名下必须 allowedHosts: true，否则 Vite 拒绝非白名单 Host
export default defineConfig({
  plugins: [vue()],
  server: { host: "0.0.0.0", allowedHosts: true },
  preview: { host: "0.0.0.0", allowedHosts: true, strictPort: true },
  build: { outDir: "dist" }
});

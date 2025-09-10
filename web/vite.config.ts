import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "fs";

// 读取package.json获取版本号
const packageJson = JSON.parse(readFileSync("./package.json", "utf-8"));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tsconfigPaths(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __DEV_MODE__: JSON.stringify(mode === 'development'),
  },
  build: {
    outDir: '../cmd/server/dist',
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        ws: true, // 启用 WebSocket 代理
      },
    },
  },
}));

import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  base: "./",
  // server: {
  //   host: "0.0.0.0",
  //   port: 8100
  // },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  plugins: [
    react(),
    TanStackRouterVite(),
    sentryVitePlugin({
      org: "zaparoo",
      project: "zaparoo-app"
    })
  ],
  build: {
    sourcemap: true
  }
});

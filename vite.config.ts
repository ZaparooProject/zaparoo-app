import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig, ServerOptions } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  let server: ServerOptions | undefined = undefined;
  if (command === "serve" && mode === "development") {
    server = {
      host: "0.0.0.0",
      port: 8100
    };
  }

  return {
    base: "./",
    server,
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
  };
});

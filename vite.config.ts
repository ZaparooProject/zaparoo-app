import { defineConfig, ServerOptions } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env") });

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  let server: ServerOptions | undefined = undefined;
  if (
    command === "serve" &&
    mode === "development" &&
    process.env.DEV_SERVER_IP
  ) {
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
    plugins: [react(), TanStackRouterVite()],
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            router: ['@tanstack/react-router'],
            ui: ['react-i18next', 'react-hot-toast', 'classnames'],
            capacitor: ['@capacitor/core', '@capacitor/preferences', '@capacitor-community/keep-awake']
          }
        }
      }
    }
  };
});

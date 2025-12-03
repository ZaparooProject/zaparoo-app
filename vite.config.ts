import { defineConfig, ServerOptions } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import { visualizer } from "rollup-plugin-visualizer";
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
      port: 8100,
    };
  }

  const plugins = [
    react(),
    TanStackRouterVite(),
    legacy({
      targets: [
        "chrome >= 49",
        "safari >= 11",
        "firefox >= 52",
        "ios >= 11",
        "android >= 49",
      ],
      additionalLegacyPolyfills: ["regenerator-runtime/runtime"],
      modernPolyfills: true,
    }),
  ];

  if (mode === "analyze") {
    plugins.push(
      visualizer({
        open: true,
        filename: "dist/stats.html",
        gzipSize: true,
        brotliSize: true,
      }),
    );
  }

  return {
    base: "./",
    server,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    plugins,
    build: {
      sourcemap: false,
      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ["console.log", "console.info", "console.debug"],
        },
      },
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes("node_modules")) {
              // Let dynamically-imported packages be split automatically
              if (id.includes("rollbar") || id.includes("shepherd")) {
                return undefined;
              }
              if (id.includes("react") || id.includes("react-dom")) {
                return "vendor";
              }
              if (id.includes("@tanstack/react-router")) {
                return "router";
              }
              if (id.includes("firebase")) {
                return "firebase";
              }
              if (id.includes("i18next")) {
                return "i18n";
              }
              if (id.includes("lucide")) {
                return "icons";
              }
              if (id.includes("@capacitor")) {
                return "capacitor";
              }
              return "vendor-other";
            }
          },
        },
      },
      chunkSizeWarningLimit: 500,
    },
  };
});

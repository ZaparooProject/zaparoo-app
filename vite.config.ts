import { defineConfig, ServerOptions } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
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

  // Core build mode is for embedding in Zaparoo Core web UI at /app/ path
  const isCoreBuild = mode === "core";
  const base = isCoreBuild ? "/app/" : "/";
  const outDir = isCoreBuild ? "dist-core" : "dist";

  const plugins = [
    tanstackRouter({ autoCodeSplitting: true }),
    react(),
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
    base,
    server,
    define: {
      // Expose base path to runtime for TanStack Router basepath
      __APP_BASE_PATH__: JSON.stringify(base),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    plugins,
    build: {
      outDir,
      sourcemap: false,
      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ["console.log", "console.info", "console.debug"],
        },
      },
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Only process node_modules
            if (!id.includes("node_modules")) {
              return;
            }

            // Extract the package name from the path (handles pnpm's .pnpm structure)
            // e.g., "node_modules/.pnpm/firebase@11.0.0/node_modules/firebase/..." -> "firebase"
            // e.g., "node_modules/react/..." -> "react"
            let packageName: string;
            if (id.includes("node_modules/.pnpm/")) {
              // pnpm structure: get the package name after .pnpm/
              const pnpmPart = id.split("node_modules/.pnpm/")[1];
              // Handle scoped packages: @scope+package@version -> @scope/package
              const nameWithVersion = pnpmPart.split("/")[0];
              // Remove version suffix (@x.x.x)
              packageName = nameWithVersion
                .replace(/@[\d.]+.*$/, "")
                .replace(/\+/g, "/");
            } else {
              // Standard node_modules structure
              const parts = id.split("node_modules/")[1].split("/");
              // Handle scoped packages (@org/package)
              packageName = parts[0].startsWith("@")
                ? `${parts[0]}/${parts[1]}`
                : parts[0];
            }

            // Group large, stable packages into their own chunks
            if (
              packageName === "firebase" ||
              packageName.startsWith("@firebase/")
            ) {
              return "vendor-firebase";
            }

            if (packageName === "rollbar" || packageName === "@rollbar/react") {
              return "vendor-rollbar";
            }

            if (
              packageName.startsWith("i18next") ||
              packageName === "react-i18next"
            ) {
              return "vendor-i18n";
            }

            if (
              packageName.startsWith("@capacitor") ||
              packageName.startsWith("@capawesome") ||
              packageName.startsWith("@capgo/") ||
              packageName.startsWith("@revenuecat/")
            ) {
              return "vendor-capacitor";
            }

            // Everything else goes into a shared vendor chunk
            return "vendor";
          },
        },
      },
    },
  };
});

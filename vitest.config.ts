import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "path";

export default defineConfig({
  plugins: [
    tanstackRouter({ quoteStyle: "double", semicolons: true }),
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./src/test-setup.ts"],

    pool: "threads",
    maxConcurrency: 20,

    include: [
      "src/__tests__/**/*.test.{ts,tsx}",
      "src/**/__tests__/**/*.test.{ts,tsx}",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
    ],

    reporters: ["default"],

    testTimeout: 10000,
    hookTimeout: 10000,

    deps: {
      optimizer: {
        client: {
          enabled: true,
        },
      },
    },

    css: false,

    coverage: {
      provider: "istanbul",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",

      exclude: [
        "node_modules/",
        "src/test-setup.ts",
        "src/test-utils/**",
        "__mocks__/**",
        "src/__tests__/**",
        "**/*.d.ts",
        "**/*.config.ts",
        "**/*.config.js",
        "**/coverage/**",
        "**/dist/**",
        "capacitor.config.ts",
        "tailwind.config.js",
      ],
    },
  },
});

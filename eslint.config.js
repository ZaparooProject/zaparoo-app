import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import react from "eslint-plugin-react";
import jsxA11y from "eslint-plugin-jsx-a11y";
import importX from "eslint-plugin-import-x";
import vitest from "eslint-plugin-vitest";
import testingLibrary from "eslint-plugin-testing-library";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default defineConfig(
  // Global ignores
  globalIgnores([
    "dist/**",
    "node_modules/**",
    "coverage/**",
    "android/**",
    "ios/**",
    "*.config.{js,ts}",
    "vite.config.ts",
    "vitest.config.ts",
    "tailwind.config.js",
    "postcss.config.js",
  ]),

  // Base configs
  js.configs.recommended,

  // Main source files
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/__tests__/**",
      "src/__mocks__/**",
      "src/test-setup.ts",
      "src/test-utils/**",
    ],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2022,
        // Build-time constant from vite.config.ts
        __APP_BASE_PATH__: "readonly",
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
      react: react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
      "import-x": importX,
    },
    rules: {
      // TypeScript rules
      ...typescript.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "prefer-const": "error",

      // React rules
      ...react.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",

      // React Hooks
      ...reactHooks.configs.recommended.rules,

      // React Refresh
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // Accessibility rules
      ...jsxA11y.configs.recommended.rules,

      // Import rules
      "import-x/no-unresolved": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../**/lib/*", "../**/hooks/*", "../**/components/*"],
              message: "Use @/ alias instead of relative parent imports.",
            },
          ],
        },
      ],
      "import-x/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "never",
        },
      ],
    },
    settings: {
      react: { version: "detect" },
      "import-x/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
    },
  },

  // Test files - with vitest and testing-library plugins, relaxed rules
  {
    files: [
      "src/__tests__/**/*.{ts,tsx}",
      "src/test-utils/**/*.{ts,tsx}",
      "src/test-setup.ts",
    ],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2022,
        ...globals.node,
        // Vitest globals
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        test: "readonly",
        // React and DOM types for test files
        React: "readonly",
        EventListener: "readonly",
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
      react: react,
      vitest: vitest,
      "testing-library": testingLibrary,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...typescript.configs.recommended.rules,
      ...react.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      ...vitest.configs.recommended.rules,
      ...testingLibrary.configs.react.rules,
      // Relaxed rules for tests
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      // Allow manual cleanup in test setup
      "testing-library/no-manual-cleanup": "off",
      // Container access is sometimes necessary for testing
      "testing-library/no-node-access": "off",
      "testing-library/no-container": "off",
      // Allow act wrapping when needed for complex async operations
      "testing-library/no-unnecessary-act": "warn",
      // Allow destructuring queries when convenient
      "testing-library/prefer-screen-queries": "warn",
      // Allow await on sync events (often more readable)
      "testing-library/no-await-sync-events": "off",
      // Allow multiple assertions in waitFor when testing related state
      "testing-library/no-wait-for-multiple-assertions": "warn",
      // Escape rules are too strict for test strings
      "react/no-unescaped-entities": "off",
    },
  },

  // Prettier must be last to disable conflicting rules
  prettier,
);

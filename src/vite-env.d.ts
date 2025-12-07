/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

// Build-time constant defined in vite.config.ts
// "/" for native/standalone builds, "/app/" for core embedded builds
declare const __APP_BASE_PATH__: string;

interface ImportMetaEnv {
  readonly VITE_VERSION: string;
  readonly VITE_GOOGLE_STORE_API: string;
  readonly VITE_APPLE_STORE_API: string;
  readonly VITE_ROLLBAR_ACCESS_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

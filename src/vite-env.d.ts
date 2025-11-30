/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

interface ImportMetaEnv {
  readonly VITE_VERSION: string;
  readonly VITE_GOOGLE_STORE_API: string;
  readonly VITE_APPLE_STORE_API: string;
  readonly VITE_ROLLBAR_ACCESS_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

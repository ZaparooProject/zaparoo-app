import "@testing-library/jest-dom";
import { afterEach, beforeAll, afterAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { setupServer } from "msw/node";
import { handlers } from "./test-utils/msw-handlers";

// Mock Capacitor plugins - calling vi.mock WITHOUT a factory tells Vitest
// to use the corresponding file in __mocks__ directory
vi.mock("@capacitor/core");
vi.mock("@capacitor/device");
vi.mock("@capacitor/preferences");
vi.mock("@capacitor/status-bar");
vi.mock("@capacitor/haptics");
vi.mock("@capacitor/app");
vi.mock("@capacitor/text-zoom");
vi.mock("@capacitor/share");
vi.mock("@capacitor/screen-reader");
vi.mock("@capacitor/clipboard");
vi.mock("@capacitor/browser");
vi.mock("@capacitor/filesystem");
vi.mock("@capacitor-firebase/authentication");
vi.mock("@capacitor-community/keep-awake");
vi.mock("@capacitor-mlkit/barcode-scanning");
vi.mock("@capawesome-team/capacitor-nfc");
vi.mock("@capgo/capacitor-shake");
vi.mock("@revenuecat/purchases-capacitor");
vi.mock("capacitor-plugin-safe-area");
vi.mock("capacitor-zeroconf");
vi.mock("@capacitor/network");

import { CoreAPI } from "./lib/coreApi";

// Define global constants that Vite normally injects
(globalThis as any).__APP_BASE_PATH__ = "/";

// Global i18n mock - returns translation keys as-is
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options && typeof options === "object") {
        let result = key;
        Object.entries(options).forEach(([param, value]) => {
          result = result.replace(
            new RegExp(`{{${param}}}`, "g"),
            String(value),
          );
        });
        return result;
      }
      return key;
    },
    i18n: {
      changeLanguage: vi.fn(() => Promise.resolve()),
      language: "en",
    },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

// Setup MSW server with handlers
export const server = setupServer(...handlers);

// Start server before all tests
beforeAll(() => server.listen());

// Reset handlers after each test
afterEach(() => {
  server.resetHandlers();
  cleanup();
  // Clear any hanging timers
  vi.clearAllTimers();
  vi.useRealTimers();
  // Reset CoreAPI state to prevent accumulation across tests
  CoreAPI.reset();
});

// Close server after all tests
afterAll(() => server.close());

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

// Platform detection mock
Object.defineProperty(navigator, "platform", {
  writable: true,
  value: "MacIntel",
});

// WebSocket mock for happy-dom environment
global.WebSocket = class MockWebSocket {
  public readyState = 1; // OPEN state
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;

  constructor(_url: string) {}

  send(_data: any) {}
  close(_code?: number, _reason?: string) {}
  addEventListener(_type: string, _listener: EventListener) {}
  removeEventListener(_type: string, _listener: EventListener) {}

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
} as any;

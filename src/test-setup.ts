import "@testing-library/jest-dom";
import { afterEach, beforeAll, afterAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { setupServer } from "msw/node";
import { handlers } from "./test-utils/msw-handlers";

// Setup MSW server with handlers
export const server = setupServer(...handlers);

// Start server before all tests
beforeAll(() => server.listen());

// Reset handlers after each test
afterEach(() => {
  server.resetHandlers();
  cleanup();
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
    dispatchEvent: () => {}
  })
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
  value: "MacIntel"
});

// WebSocket mock for happy-dom environment
global.WebSocket = class MockWebSocket {
  constructor(_url: string) {}
  close() {}
} as any;
import { vi } from "vitest";

// Helper to wait for async operations
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to create a mock WebSocket that can be controlled in tests
export const createMockWebSocket = () => {
  const mockWs = {
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    readyState: 1, // OPEN
    url: "ws://test:7497/api/v0.1",
    onopen: null as ((event: Event) => void) | null,
    onclose: null as ((event: CloseEvent) => void) | null,
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
  };

  // Helper methods to simulate events
  const simulateOpen = () => {
    if (mockWs.onopen) mockWs.onopen(new Event("open"));
  };
  
  const simulateMessage = (data: string) => {
    if (mockWs.onmessage) mockWs.onmessage(new MessageEvent("message", { data }));
  };
  
  const simulateClose = () => {
    if (mockWs.onclose) mockWs.onclose(new CloseEvent("close"));
  };
  
  const simulateError = () => {
    if (mockWs.onerror) mockWs.onerror(new Event("error"));
  };

  return {
    mockWs,
    simulateOpen,
    simulateMessage,
    simulateClose,
    simulateError
  };
};

// Helper to mock console methods
export const mockConsole = () => {
  const originalConsole = { ...console };
  
  const restore = () => {
    Object.assign(console, originalConsole);
  };
  
  const mockMethods = {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn()
  };
  
  Object.assign(console, mockMethods);
  
  return { ...mockMethods, restore };
};
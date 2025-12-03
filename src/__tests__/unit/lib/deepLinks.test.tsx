/**
 * Unit tests for AppUrlListener (deep links)
 *
 * Tests URL command handling for /run and /write paths.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { URLOpenListenerEvent } from "@capacitor/app";

// Create hoisted mocks
const { mockAddListener, mockLogger } = vi.hoisted(() => ({
  mockAddListener: vi.fn(),
  mockLogger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

// Track the captured callback
let urlOpenCallback: ((event: URLOpenListenerEvent) => void) | null = null;

mockAddListener.mockImplementation(
  (eventName: string, callback: (event: URLOpenListenerEvent) => void) => {
    if (eventName === "appUrlOpen") {
      urlOpenCallback = callback;
    }
    return Promise.resolve({ remove: vi.fn() });
  },
);

// Mock Capacitor App
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: mockAddListener,
  },
}));

// Mock logger
vi.mock("../../../lib/logger", () => ({
  logger: mockLogger,
}));

// Mock the store
const mockSetRunQueue = vi.fn();
const mockSetWriteQueue = vi.fn();

vi.mock("../../../lib/store", () => ({
  useStatusStore: vi.fn((selector: (state: unknown) => unknown) => {
    const state = {
      setRunQueue: mockSetRunQueue,
      setWriteQueue: mockSetWriteQueue,
    };
    return selector(state);
  }),
}));

import AppUrlListener from "../../../lib/deepLinks";

describe("AppUrlListener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    urlOpenCallback = null;
  });

  it("should register appUrlOpen listener on mount", () => {
    render(<AppUrlListener />);

    expect(mockAddListener).toHaveBeenCalledWith(
      "appUrlOpen",
      expect.any(Function),
    );
  });

  describe("/run path", () => {
    it("should set runQueue when /run path with v param", async () => {
      render(<AppUrlListener />);

      await waitFor(() => {
        expect(urlOpenCallback).not.toBeNull();
      });

      // Simulate URL open event
      urlOpenCallback?.({
        url: "zaparoo://app/run?v=test-token-value",
      });

      expect(mockSetRunQueue).toHaveBeenCalledWith({
        value: "test-token-value",
        unsafe: true,
      });

      expect(mockLogger.log).toHaveBeenCalledWith(
        "Run queue:",
        "test-token-value",
      );
    });

    it("should handle URL encoded values in /run", async () => {
      render(<AppUrlListener />);

      await waitFor(() => {
        expect(urlOpenCallback).not.toBeNull();
      });

      urlOpenCallback?.({
        url: "zaparoo://app/run?v=hello%20world",
      });

      expect(mockSetRunQueue).toHaveBeenCalledWith({
        value: "hello world",
        unsafe: true,
      });
    });

    it("should not set runQueue when /run path without v param", async () => {
      render(<AppUrlListener />);

      await waitFor(() => {
        expect(urlOpenCallback).not.toBeNull();
      });

      urlOpenCallback?.({
        url: "zaparoo://app/run",
      });

      expect(mockSetRunQueue).not.toHaveBeenCalled();
    });
  });

  describe("/write path", () => {
    it("should set writeQueue when /write path with v param", async () => {
      render(<AppUrlListener />);

      await waitFor(() => {
        expect(urlOpenCallback).not.toBeNull();
      });

      urlOpenCallback?.({
        url: "zaparoo://app/write?v=write-content",
      });

      expect(mockSetWriteQueue).toHaveBeenCalledWith("write-content");

      expect(mockLogger.log).toHaveBeenCalledWith(
        "Write queue:",
        "write-content",
      );
    });

    it("should not set writeQueue when /write path without v param", async () => {
      render(<AppUrlListener />);

      await waitFor(() => {
        expect(urlOpenCallback).not.toBeNull();
      });

      urlOpenCallback?.({
        url: "zaparoo://app/write",
      });

      expect(mockSetWriteQueue).not.toHaveBeenCalled();
    });
  });

  describe("other paths", () => {
    it("should not process unrecognized paths", async () => {
      render(<AppUrlListener />);

      await waitFor(() => {
        expect(urlOpenCallback).not.toBeNull();
      });

      urlOpenCallback?.({
        url: "zaparoo://app/settings?v=something",
      });

      expect(mockSetRunQueue).not.toHaveBeenCalled();
      expect(mockSetWriteQueue).not.toHaveBeenCalled();
    });

    it("should log all URL opens for debugging", async () => {
      render(<AppUrlListener />);

      await waitFor(() => {
        expect(urlOpenCallback).not.toBeNull();
      });

      urlOpenCallback?.({
        url: "zaparoo://app/unknown",
      });

      expect(mockLogger.log).toHaveBeenCalledWith(
        "App URL opened:",
        expect.objectContaining({
          path: "/unknown",
        }),
      );
    });
  });

  describe("URL parsing", () => {
    it("should handle multiple query parameters", async () => {
      render(<AppUrlListener />);

      await waitFor(() => {
        expect(urlOpenCallback).not.toBeNull();
      });

      urlOpenCallback?.({
        url: "zaparoo://app/run?v=token&other=param&another=value",
      });

      // Should only use v param for run queue
      expect(mockSetRunQueue).toHaveBeenCalledWith({
        value: "token",
        unsafe: true,
      });
    });
  });

  it("should render null (no visible UI)", () => {
    const { container } = render(<AppUrlListener />);

    expect(container.firstChild).toBeNull();
  });
});

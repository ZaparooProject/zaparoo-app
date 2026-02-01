/**
 * Unit tests for AppUrlListener (deep links)
 *
 * Tests URL command handling for /run and /write paths.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "../../../test-utils";
import type { URLOpenListenerEvent } from "@capacitor/app";

// Create hoisted mocks
const { mockAddListener, mockGetLaunchUrl, mockLogger, mockToast } = vi.hoisted(
  () => ({
    mockAddListener: vi.fn(),
    mockGetLaunchUrl: vi.fn(),
    mockLogger: {
      log: vi.fn(),
      error: vi.fn(),
    },
    mockToast: {
      error: vi.fn(),
    },
  }),
);

// Track the captured callback
let urlOpenCallback: ((event: URLOpenListenerEvent) => void) | null = null;
let listenerRemoveFn: ReturnType<typeof vi.fn>;

beforeEach(() => {
  listenerRemoveFn = vi.fn();
});

mockAddListener.mockImplementation(
  (eventName: string, callback: (event: URLOpenListenerEvent) => void) => {
    if (eventName === "appUrlOpen") {
      urlOpenCallback = callback;
    }
    return Promise.resolve({ remove: listenerRemoveFn });
  },
);

// Mock Capacitor App
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: mockAddListener,
    getLaunchUrl: mockGetLaunchUrl,
  },
}));

// Mock logger
vi.mock("../../../lib/logger", () => ({
  logger: mockLogger,
}));

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  default: mockToast,
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
    mockGetLaunchUrl.mockResolvedValue({ url: undefined });
  });

  it("should register appUrlOpen listener on mount", () => {
    render(<AppUrlListener />);

    expect(mockAddListener).toHaveBeenCalledWith(
      "appUrlOpen",
      expect.any(Function),
    );
  });

  it("should cleanup listener on unmount", async () => {
    const { unmount } = render(<AppUrlListener />);

    await waitFor(() => {
      expect(mockAddListener).toHaveBeenCalled();
    });

    unmount();

    await waitFor(() => {
      expect(listenerRemoveFn).toHaveBeenCalled();
    });
  });

  describe("cold start handling", () => {
    it("should check getLaunchUrl on mount", async () => {
      render(<AppUrlListener />);

      await waitFor(() => {
        expect(mockGetLaunchUrl).toHaveBeenCalled();
      });
    });

    it("should process launch URL if present", async () => {
      mockGetLaunchUrl.mockResolvedValue({
        url: "zaparoo://app/run?v=cold-start-token",
      });

      render(<AppUrlListener />);

      await waitFor(() => {
        expect(mockSetRunQueue).toHaveBeenCalledWith({
          value: "cold-start-token",
          unsafe: true,
        });
      });

      expect(mockLogger.log).toHaveBeenCalledWith(
        "App launched with URL:",
        "zaparoo://app/run?v=cold-start-token",
      );
    });

    it("should not process if launch URL is undefined", async () => {
      mockGetLaunchUrl.mockResolvedValue({ url: undefined });

      render(<AppUrlListener />);

      await waitFor(() => {
        expect(mockGetLaunchUrl).toHaveBeenCalled();
      });

      expect(mockSetRunQueue).not.toHaveBeenCalled();
      expect(mockSetWriteQueue).not.toHaveBeenCalled();
    });

    it("should handle write URL on cold start", async () => {
      mockGetLaunchUrl.mockResolvedValue({
        url: "https://zaparoo.app/write?v=cold-start-write",
      });

      render(<AppUrlListener />);

      await waitFor(() => {
        expect(mockSetWriteQueue).toHaveBeenCalledWith("cold-start-write");
      });
    });

    it("should deduplicate when both getLaunchUrl and appUrlOpen fire for same URL within window", async () => {
      const duplicateUrl = "zaparoo://app/run?v=duplicate-token";

      // getLaunchUrl returns the URL
      mockGetLaunchUrl.mockResolvedValue({ url: duplicateUrl });

      render(<AppUrlListener />);

      // Wait for getLaunchUrl to be processed
      await waitFor(() => {
        expect(mockSetRunQueue).toHaveBeenCalledWith({
          value: "duplicate-token",
          unsafe: true,
        });
      });

      // Clear the mock to check if it gets called again
      mockSetRunQueue.mockClear();

      // Now simulate appUrlOpen firing for the same URL (retained event)
      // This happens nearly simultaneously on cold start
      await waitFor(() => {
        expect(urlOpenCallback).not.toBeNull();
      });

      urlOpenCallback?.({ url: duplicateUrl });

      // Should NOT process again - should be deduplicated within time window
      expect(mockSetRunQueue).not.toHaveBeenCalled();

      // Should log that it's skipping duplicate
      expect(mockLogger.log).toHaveBeenCalledWith(
        "Skipping duplicate URL (within dedup window):",
        duplicateUrl,
      );
    });
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

  describe("error handling", () => {
    it("should handle malformed URLs gracefully", async () => {
      render(<AppUrlListener />);

      await waitFor(() => {
        expect(urlOpenCallback).not.toBeNull();
      });

      // Simulate malformed URL
      urlOpenCallback?.({
        url: "not-a-valid-url",
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to parse deep link URL",
        expect.any(Error),
        expect.objectContaining({
          category: "general",
          action: "parseDeepLink",
          severity: "warning",
        }),
      );

      expect(mockToast.error).toHaveBeenCalledWith("deepLinks.invalidUrl");
    });

    it("should handle empty URL string", async () => {
      render(<AppUrlListener />);

      await waitFor(() => {
        expect(urlOpenCallback).not.toBeNull();
      });

      urlOpenCallback?.({
        url: "",
      });

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockToast.error).toHaveBeenCalledWith("deepLinks.invalidUrl");
    });

    it("should not set queues when URL parsing fails", async () => {
      render(<AppUrlListener />);

      await waitFor(() => {
        expect(urlOpenCallback).not.toBeNull();
      });

      urlOpenCallback?.({
        url: ":::invalid:::url",
      });

      expect(mockSetRunQueue).not.toHaveBeenCalled();
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

    it("should handle https URLs (universal links)", async () => {
      render(<AppUrlListener />);

      await waitFor(() => {
        expect(urlOpenCallback).not.toBeNull();
      });

      urlOpenCallback?.({
        url: "https://zaparoo.app/run?v=universal-link-token",
      });

      expect(mockSetRunQueue).toHaveBeenCalledWith({
        value: "universal-link-token",
        unsafe: true,
      });
    });
  });

  it("should render without visible UI elements", () => {
    const { container } = render(<AppUrlListener />);

    // AppUrlListener returns null, but the test wrapper adds accessibility elements
    // Verify no visible content is rendered by checking for text content
    // The only content should be from the test wrapper (A11yAnnouncer)
    const visibleText = container.textContent;
    expect(visibleText).toBe("");
  });
});

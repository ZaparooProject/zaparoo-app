/**
 * Unit tests for usePassiveNfcListener hook
 *
 * Tests the passive NFC listener that handles NFC intents on Android
 * when the app is launched/foregrounded via NFC, but not in explicit scan mode.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "../../../test-utils";
import type { NfcTagScannedEvent } from "@capawesome-team/capacitor-nfc";

// Create hoisted mocks - must use vi.hoisted for all mocks used in vi.mock factories
const {
  mockRunToken,
  mockLogger,
  mockNfcAddListener,
  mockAppAddListener,
  mockNfcListenerHandle,
  mockAppListenerHandle,
  mockGetPlatform,
  mockSessionManager,
  mockReadNfcEvent,
} = vi.hoisted(() => ({
  mockRunToken: vi.fn().mockResolvedValue(true),
  mockLogger: {
    log: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
  mockNfcAddListener: vi.fn(),
  mockAppAddListener: vi.fn(),
  mockNfcListenerHandle: {
    remove: vi.fn().mockResolvedValue(undefined),
  },
  mockAppListenerHandle: {
    remove: vi.fn().mockResolvedValue(undefined),
  },
  mockGetPlatform: vi.fn().mockReturnValue("android"),
  mockSessionManager: {
    isScanning: false,
  },
  mockReadNfcEvent: vi.fn((event: { nfcTag?: { id?: number[] } }) => {
    if (!event.nfcTag?.id) return null;
    return {
      uid: "abc123",
      text: "test-text",
    };
  }),
}));

// Track callbacks for triggering events in tests
let nfcTagScannedCallback: ((event: NfcTagScannedEvent) => void) | null = null;
let appStateChangeCallback: ((state: { isActive: boolean }) => void) | null =
  null;

// Mock dependencies
vi.mock("../../../lib/tokenOperations", () => ({
  runToken: mockRunToken,
}));

vi.mock("../../../lib/logger", () => ({
  logger: mockLogger,
}));

vi.mock("@capawesome-team/capacitor-nfc", () => ({
  Nfc: {
    addListener: mockNfcAddListener,
  },
}));

// Mock Capacitor App
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: mockAppAddListener,
  },
}));

// Mock Capacitor Core
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: mockGetPlatform,
  },
}));

// Mock store state
const mockStoreState = {
  connected: true,
  launcherAccess: true,
  nfcAvailable: true,
};

const mockSetLastToken = vi.fn();
const mockSetProPurchaseModalOpen = vi.fn();

vi.mock("../../../lib/store", () => ({
  useStatusStore: Object.assign(
    vi.fn((selector: (state: unknown) => unknown) => {
      const state = {
        setLastToken: mockSetLastToken,
        setProPurchaseModalOpen: mockSetProPurchaseModalOpen,
        connected: mockStoreState.connected,
      };
      return selector(state);
    }),
    {
      getState: () => ({
        connected: mockStoreState.connected,
      }),
    },
  ),
}));

vi.mock("../../../lib/preferencesStore", () => ({
  usePreferencesStore: vi.fn((selector: (state: unknown) => unknown) => {
    const state = {
      launcherAccess: mockStoreState.launcherAccess,
      nfcAvailable: mockStoreState.nfcAvailable,
    };
    return selector(state);
  }),
}));

vi.mock("../../../lib/nfc", () => ({
  sessionManager: mockSessionManager,
  readNfcEvent: mockReadNfcEvent,
}));

// Import after mocks are set up
import { usePassiveNfcListener } from "../../../hooks/usePassiveNfcListener";

describe("usePassiveNfcListener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nfcTagScannedCallback = null;
    appStateChangeCallback = null;

    // Reset state
    mockStoreState.connected = true;
    mockStoreState.launcherAccess = true;
    mockStoreState.nfcAvailable = true;
    mockSessionManager.isScanning = false;
    mockGetPlatform.mockReturnValue("android");

    // Set up NFC addListener to capture callback and return handle
    mockNfcAddListener.mockImplementation(
      (
        eventName: string,
        callback: (event: NfcTagScannedEvent) => void,
      ): Promise<typeof mockNfcListenerHandle> => {
        if (eventName === "nfcTagScanned") {
          nfcTagScannedCallback = callback;
        }
        return Promise.resolve(mockNfcListenerHandle);
      },
    );

    // Set up App addListener to capture appStateChange callback
    mockAppAddListener.mockImplementation(
      (
        eventName: string,
        callback: (state: { isActive: boolean }) => void,
      ): Promise<typeof mockAppListenerHandle> => {
        if (eventName === "appStateChange") {
          appStateChangeCallback = callback;
        }
        return Promise.resolve(mockAppListenerHandle);
      },
    );
  });

  it("should be importable without errors", () => {
    expect(typeof usePassiveNfcListener).toBe("function");
  });

  it("should register listener on Android when NFC is available", async () => {
    renderHook(() => usePassiveNfcListener());

    // Wait for async setup
    await vi.waitFor(() => {
      expect(mockNfcAddListener).toHaveBeenCalledWith(
        "nfcTagScanned",
        expect.any(Function),
      );
      expect(mockAppAddListener).toHaveBeenCalledWith(
        "appStateChange",
        expect.any(Function),
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Passive NFC listener: registered",
        expect.any(Object),
      );
    });
  });

  it("should not register listener on iOS", async () => {
    mockGetPlatform.mockReturnValue("ios");

    renderHook(() => usePassiveNfcListener());

    // Verify listener is not registered on iOS
    await vi.waitFor(() => {
      expect(mockNfcAddListener).not.toHaveBeenCalled();
    });
  });

  it("should not register listener when NFC is not available", async () => {
    mockStoreState.nfcAvailable = false;

    renderHook(() => usePassiveNfcListener());

    // Verify listener is not registered when NFC is unavailable
    await vi.waitFor(() => {
      expect(mockNfcAddListener).not.toHaveBeenCalled();
    });
  });

  it("should remove listener on unmount", async () => {
    const { unmount } = renderHook(() => usePassiveNfcListener());

    await vi.waitFor(() => {
      expect(mockNfcAddListener).toHaveBeenCalled();
      expect(mockAppAddListener).toHaveBeenCalled();
    });

    unmount();

    expect(mockNfcListenerHandle.remove).toHaveBeenCalled();
    expect(mockAppListenerHandle.remove).toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      "Passive NFC listener: removed",
      expect.any(Object),
    );
  });

  it("should ignore events when scan session is active", async () => {
    mockSessionManager.isScanning = true;

    renderHook(() => usePassiveNfcListener());

    await vi.waitFor(() => {
      expect(nfcTagScannedCallback).not.toBeNull();
    });

    // Trigger NFC event
    act(() => {
      nfcTagScannedCallback!({
        nfcTag: { id: [1, 2, 3] },
      } as NfcTagScannedEvent);
    });

    expect(mockLogger.debug).toHaveBeenCalledWith(
      "Passive NFC listener: scan session active, ignoring",
      expect.any(Object),
    );
    expect(mockRunToken).not.toHaveBeenCalled();
  });

  it("should process tag when app was in background (cold start scenario)", async () => {
    mockSessionManager.isScanning = false;
    mockStoreState.connected = true;

    renderHook(() => usePassiveNfcListener());

    await vi.waitFor(() => {
      expect(nfcTagScannedCallback).not.toBeNull();
      expect(appStateChangeCallback).not.toBeNull();
    });

    // Simulate cold start / background scenario:
    // App was in background, then NFC brings it to foreground
    act(() => {
      appStateChangeCallback!({ isActive: false });
    });
    act(() => {
      appStateChangeCallback!({ isActive: true });
    });
    act(() => {
      nfcTagScannedCallback!({
        nfcTag: { id: [1, 2, 3] },
      } as NfcTagScannedEvent);
    });

    expect(mockLogger.log).toHaveBeenCalledWith(
      "Passive NFC listener: processing tag from background",
      expect.any(Object),
    );
    expect(mockRunToken).toHaveBeenCalledWith(
      "abc123",
      "test-text",
      true,
      true,
      mockSetLastToken,
      mockSetProPurchaseModalOpen,
      false,
      false,
      true,
      false,
    );
  });

  it("should ignore tag when app was in foreground (no appStateChange)", async () => {
    mockSessionManager.isScanning = false;
    mockStoreState.connected = true;

    renderHook(() => usePassiveNfcListener());

    await vi.waitFor(() => {
      expect(nfcTagScannedCallback).not.toBeNull();
      expect(appStateChangeCallback).not.toBeNull();
    });

    // Simulate foreground tap - NFC event without appStateChange (isActive:false)
    // This happens when NFC is tapped while app is in foreground - there's a quick
    // pause/resume but appStateChange doesn't fire
    act(() => {
      nfcTagScannedCallback!({
        nfcTag: { id: [1, 2, 3] },
      } as NfcTagScannedEvent);
    });

    expect(mockLogger.debug).toHaveBeenCalledWith(
      "Passive NFC listener: app was in foreground, ignoring",
      expect.any(Object),
    );
    expect(mockRunToken).not.toHaveBeenCalled();
  });

  it("should process tag when app was in background (appStateChange fired)", async () => {
    mockSessionManager.isScanning = false;
    mockStoreState.connected = true;

    renderHook(() => usePassiveNfcListener());

    await vi.waitFor(() => {
      expect(nfcTagScannedCallback).not.toBeNull();
      expect(appStateChangeCallback).not.toBeNull();
    });

    // Simulate background tap:
    // 1. App goes to background (appStateChange with isActive:false)
    // 2. User taps NFC tag
    // 3. App comes to foreground (appStateChange with isActive:true)
    // 4. nfcTagScanned fires
    act(() => {
      appStateChangeCallback!({ isActive: false });
    });

    act(() => {
      appStateChangeCallback!({ isActive: true });
    });

    act(() => {
      nfcTagScannedCallback!({
        nfcTag: { id: [1, 2, 3] },
      } as NfcTagScannedEvent);
    });

    expect(mockLogger.log).toHaveBeenCalledWith(
      "Passive NFC listener: processing tag from background",
      expect.any(Object),
    );
    expect(mockRunToken).toHaveBeenCalled();
  });

  it("should process tag when not connected (will update lastToken)", async () => {
    mockSessionManager.isScanning = false;
    mockStoreState.connected = false;

    renderHook(() => usePassiveNfcListener());

    await vi.waitFor(() => {
      expect(nfcTagScannedCallback).not.toBeNull();
      expect(appStateChangeCallback).not.toBeNull();
    });

    // Simulate background NFC tap when disconnected
    act(() => {
      appStateChangeCallback!({ isActive: false });
    });
    act(() => {
      appStateChangeCallback!({ isActive: true });
    });
    act(() => {
      nfcTagScannedCallback!({
        nfcTag: { id: [1, 2, 3] },
      } as NfcTagScannedEvent);
    });

    expect(mockRunToken).toHaveBeenCalledWith(
      "abc123",
      "test-text",
      true,
      false, // connected is false
      mockSetLastToken,
      mockSetProPurchaseModalOpen,
      false,
      false,
      true,
      false,
    );
  });

  it("should not process tag with no valid data", async () => {
    // Override readNfcEvent to return null for this test
    mockReadNfcEvent.mockReturnValueOnce(null);

    renderHook(() => usePassiveNfcListener());

    await vi.waitFor(() => {
      expect(nfcTagScannedCallback).not.toBeNull();
      expect(appStateChangeCallback).not.toBeNull();
    });

    // Simulate background NFC tap with invalid tag data
    act(() => {
      appStateChangeCallback!({ isActive: false });
    });
    act(() => {
      appStateChangeCallback!({ isActive: true });
    });
    act(() => {
      nfcTagScannedCallback!({
        nfcTag: {}, // No id
      } as NfcTagScannedEvent);
    });

    expect(mockLogger.debug).toHaveBeenCalledWith(
      "Passive NFC listener: no valid tag data",
      expect.any(Object),
    );
    expect(mockRunToken).not.toHaveBeenCalled();
  });

  it("should handle runToken errors gracefully", async () => {
    mockRunToken.mockRejectedValueOnce(new Error("API Error"));

    renderHook(() => usePassiveNfcListener());

    await vi.waitFor(() => {
      expect(nfcTagScannedCallback).not.toBeNull();
      expect(appStateChangeCallback).not.toBeNull();
    });

    // Simulate background NFC tap that will trigger runToken error
    act(() => {
      appStateChangeCallback!({ isActive: false });
    });
    act(() => {
      appStateChangeCallback!({ isActive: true });
    });
    act(() => {
      nfcTagScannedCallback!({
        nfcTag: { id: [1, 2, 3] },
      } as NfcTagScannedEvent);
    });

    // Allow promise rejection to be caught
    await vi.waitFor(() => {
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Passive NFC listener: runToken error",
        expect.any(Error),
        expect.any(Object),
      );
    });
  });

  it("should handle listener registration errors", async () => {
    mockNfcAddListener.mockRejectedValueOnce(new Error("NFC not available"));

    renderHook(() => usePassiveNfcListener());

    await vi.waitFor(() => {
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Passive NFC listener: failed to register",
        expect.any(Error),
        expect.any(Object),
      );
    });
  });

  it("should pass launcherAccess from preferences store", async () => {
    mockStoreState.launcherAccess = false;

    renderHook(() => usePassiveNfcListener());

    await vi.waitFor(() => {
      expect(nfcTagScannedCallback).not.toBeNull();
      expect(appStateChangeCallback).not.toBeNull();
    });

    // Simulate background NFC tap
    act(() => {
      appStateChangeCallback!({ isActive: false });
    });
    act(() => {
      appStateChangeCallback!({ isActive: true });
    });
    act(() => {
      nfcTagScannedCallback!({
        nfcTag: { id: [1, 2, 3] },
      } as NfcTagScannedEvent);
    });

    expect(mockRunToken).toHaveBeenCalledWith(
      "abc123",
      "test-text",
      false, // launcherAccess should be false
      true,
      mockSetLastToken,
      mockSetProPurchaseModalOpen,
      false,
      false,
      true,
      false,
    );
  });

  describe("appStateChange state tracking", () => {
    it("should log when app goes to background", async () => {
      renderHook(() => usePassiveNfcListener());

      await vi.waitFor(() => {
        expect(appStateChangeCallback).not.toBeNull();
      });

      act(() => {
        appStateChangeCallback!({ isActive: false });
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Passive NFC listener: app went to background",
        expect.any(Object),
      );
    });

    it("should log when app comes to foreground", async () => {
      renderHook(() => usePassiveNfcListener());

      await vi.waitFor(() => {
        expect(appStateChangeCallback).not.toBeNull();
      });

      act(() => {
        appStateChangeCallback!({ isActive: true });
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Passive NFC listener: app came to foreground",
        expect.any(Object),
      );
    });

    it("should reset wasInBackground after processing tag", async () => {
      mockSessionManager.isScanning = false;
      mockStoreState.connected = true;

      renderHook(() => usePassiveNfcListener());

      await vi.waitFor(() => {
        expect(nfcTagScannedCallback).not.toBeNull();
        expect(appStateChangeCallback).not.toBeNull();
      });

      // First: background → foreground → nfcTagScanned (processed)
      act(() => {
        appStateChangeCallback!({ isActive: false });
      });
      act(() => {
        appStateChangeCallback!({ isActive: true });
      });
      act(() => {
        nfcTagScannedCallback!({
          nfcTag: { id: [1, 2, 3] },
        } as NfcTagScannedEvent);
      });
      expect(mockRunToken).toHaveBeenCalledTimes(1);

      // Second: NFC without going to background (should be ignored)
      act(() => {
        nfcTagScannedCallback!({
          nfcTag: { id: [4, 5, 6] },
        } as NfcTagScannedEvent);
      });

      // Still only called once - second event was ignored
      expect(mockRunToken).toHaveBeenCalledTimes(1);
    });

    it("should process tag even if app comes to foreground without NFC first", async () => {
      // This tests the scenario where app goes to background, comes back,
      // and THEN user taps NFC - should still process
      renderHook(() => usePassiveNfcListener());

      await vi.waitFor(() => {
        expect(nfcTagScannedCallback).not.toBeNull();
        expect(appStateChangeCallback).not.toBeNull();
      });

      // App goes to background
      act(() => {
        appStateChangeCallback!({ isActive: false });
      });

      // App comes back to foreground (not via NFC)
      act(() => {
        appStateChangeCallback!({ isActive: true });
      });

      // wasInBackground should still be true, so this should process
      act(() => {
        nfcTagScannedCallback!({
          nfcTag: { id: [1, 2, 3] },
        } as NfcTagScannedEvent);
      });

      expect(mockRunToken).toHaveBeenCalled();
    });
  });
});

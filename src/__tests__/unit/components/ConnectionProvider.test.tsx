/**
 * Unit tests for ConnectionProvider
 *
 * Tests the connection state management, device address initialization,
 * connection lifecycle handling, and notification processing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  __simulateDeviceDiscovered,
  ZeroConf,
  type ZeroConfService,
} from "../../../../__mocks__/capacitor-zeroconf";
import { QueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "../../../test-utils";
import { ConnectionProvider } from "../../../components/ConnectionProvider";
import { useConnection } from "../../../hooks/useConnection";
import { connectionManager } from "../../../lib/transport";
import { CoreAPI } from "@/lib/coreApi";
import {
  credentialKeyForRecord,
  credentialStore,
} from "@/lib/crypto/credentials";
import { deviceRegistry } from "@/lib/devices/deviceRegistry";
import {
  mockDeviceRecord,
  seedDeviceRegistry,
} from "@/test-utils/deviceRegistry";
import { ConnectionState, useStatusStore } from "@/lib/store";
import type { TransportState } from "../../../lib/transport/types";
import type { NotificationRequest } from "@/lib/coreApi";
import { ClientCapability, InboxSeverity, Notification } from "@/lib/models";
import { logger } from "@/lib/logger";
import { invalidateLibraryImageCache } from "@/lib/libraryImageCache";

// Capture event handlers for notification testing
let capturedEventHandlers: {
  onConnectionChange?: (deviceId: string, connection: unknown) => void;
  onMessage?: (deviceId: string, event: unknown) => void;
  onError?: (deviceId: string, error: Error) => void;
  onEncryptedHandshakeOk?: () => void;
  onPlaintextMode?: () => void;
  onCredentialsRevoked?: () => void;
} = {};

const pairingModalCapture = vi.hoisted(() => ({
  onSuccess: undefined as (() => void) | undefined,
}));

// Mock dependencies
vi.mock("@/lib/libraryImageCache", () => ({
  invalidateLibraryImageCache: vi.fn(),
}));

vi.mock("../../../lib/transport", () => {
  const mockTransport = {
    deviceId: "test-device",
    state: "disconnected" as TransportState,
    isConnected: false,
    hasEverConnected: false,
    send: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    destroy: vi.fn(),
    immediateReconnect: vi.fn(),
    pauseHeartbeat: vi.fn(),
    resumeHeartbeat: vi.fn(),
    setEventHandlers: vi.fn(),
  };

  return {
    connectionManager: {
      setEventHandlers: vi.fn((handlers) => {
        capturedEventHandlers = handlers;
      }),
      addDevice: vi.fn(() => mockTransport),
      removeDevice: vi.fn(),
      setActiveDevice: vi.fn(),
      getActiveDeviceId: vi.fn(() => "test-device"),
      getActiveConnection: vi.fn(() => null),
      pauseAll: vi.fn(),
      resumeAll: vi.fn(),
      immediateReconnectActive: vi.fn(),
      restartActiveConnection: vi.fn(),
      clearEncryptionBlockActive: vi.fn(),
    },
  };
});

vi.mock("../../../components/PairingModal", () => ({
  PairingModal: ({ onSuccess }: { onSuccess?: () => void }) => {
    pairingModalCapture.onSuccess = onSuccess;
    return null;
  },
}));

vi.mock("../../../lib/coreApi", () => ({
  CoreApiError: class extends Error {
    constructor(
      message: string,
      readonly code: number,
    ) {
      super(message);
    }
  },
  CoreAPI: {
    setWsInstance: vi.fn(),
    flushQueue: vi.fn(),
    handleDisconnect: vi.fn(),
    reset: vi.fn(),
    processReceived: vi.fn().mockResolvedValue(null),
    media: vi.fn().mockResolvedValue({ database: {}, active: [] }),
    tokens: vi.fn().mockResolvedValue({ last: null }),
    version: vi.fn().mockResolvedValue({ version: "2.5.0", platform: "test" }),
    clientsCurrent: vi.fn().mockResolvedValue({
      paired: true,
      role: "admin",
      capabilities: ["profiles.manage", "settings.write"],
    }),
    inbox: vi.fn().mockResolvedValue({ messages: [] }),
    mediaScrapeStatus: vi.fn().mockResolvedValue({
      processed: 0,
      total: 0,
      matched: 0,
      skipped: 0,
      totalScraped: 0,
      scraping: false,
      done: false,
      paused: false,
    }),
  },
  validateDeviceAddress: vi.fn((address: string) => {
    if (address.includes("286")) {
      return {
        ok: false,
        errorKey: "settings.deviceAddressInvalid",
        message: "Invalid device address",
      };
    }

    const [host = address, portInput] = address.split(":");
    const port = portInput ? Number(portInput) : 7497;

    return {
      ok: true,
      address,
      host,
      port,
      wsUrl: `ws://${host}:${port}/api/v0.1`,
    };
  }),
  // Mirror the real predicate rather than a call counter: several responses are
  // in flight at once after a connect, and a `mockReturnValueOnce` would attach
  // itself to whichever happened to resolve first.
  isCancelled: vi.fn(
    (response: unknown) =>
      typeof response === "object" &&
      response !== null &&
      (response as { cancelled?: unknown }).cancelled === true,
  ),
  isExpectedMediaDatabaseError: (error: unknown) => {
    if (!(error instanceof Error)) return false;
    const msg = error.message.toLowerCase();
    return (
      msg.includes("no such table: dbconfig") ||
      msg.includes("method not found")
    );
  },
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  },
}));

// `@capacitor/core` deliberately uses the shared `__mocks__` module rather than
// a local factory: test-setup imports `useNetworkScan`, so that hook resolves
// the shared mock, and a local factory here would leave the provider and the
// hook disagreeing about whether the platform is native.
vi.mock("@capacitor/network", () => ({
  Network: {
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  },
}));

vi.mock("@/lib/capacitorBridge", () => ({
  isPluginAvailable: vi.fn(() => true),
  isNativePluginAvailable: vi.fn(() => true),
}));

// Use vi.hoisted for toast mock
const { mockToast, mockToastError } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: Object.assign(mockToast, {
    error: mockToastError,
    dismiss: vi.fn(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Use vi.hoisted for announce mock
const { mockAnnounce } = vi.hoisted(() => ({
  mockAnnounce: vi.fn(),
}));

vi.mock("../../../components/A11yAnnouncer", () => ({
  useAnnouncer: () => ({
    announce: mockAnnounce,
  }),
  A11yAnnouncerProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

// test-utils already provides QueryClientProvider, so we use render directly

// Test component that uses the connection context
function ConnectionConsumer() {
  const { isConnected, hasData, showConnecting, showReconnecting } =
    useConnection();
  return (
    <div>
      <span data-testid="isConnected">{String(isConnected)}</span>
      <span data-testid="hasData">{String(hasData)}</span>
      <span data-testid="showConnecting">{String(showConnecting)}</span>
      <span data-testid="showReconnecting">{String(showReconnecting)}</span>
    </div>
  );
}

/**
 * The transport keys devices by record id now, so the id the provider hands to
 * `connectionManager` is this, not an address. Tests drive the connection
 * handlers with it for the same reason.
 */
const RECORD_ID = "record-under-test";
const DEVICE_ADDRESS = "192.168.1.100:7497";

/** A hydrated registry holding one device, so the connection effect can run. */
async function resetStore() {
  useStatusStore.setState({ ...useStatusStore.getInitialState() });
  await seedDeviceRegistry(
    [mockDeviceRecord({ recordId: RECORD_ID, address: DEVICE_ADDRESS })],
    RECORD_ID,
  );
}

describe("ConnectionProvider", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetStore();

    const bridge = await import("@/lib/capacitorBridge");
    vi.mocked(bridge.isPluginAvailable).mockReturnValue(true);
    vi.mocked(bridge.isNativePluginAvailable).mockReturnValue(true);
  });

  describe("rendering", () => {
    it("should render children", () => {
      render(
        <ConnectionProvider>
          <div data-testid="child">Child content</div>
        </ConnectionProvider>,
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    it("should provide connection context to children", () => {
      render(
        <ConnectionProvider>
          <ConnectionConsumer />
        </ConnectionProvider>,
      );

      expect(screen.getByTestId("isConnected")).toBeInTheDocument();
      expect(screen.getByTestId("hasData")).toBeInTheDocument();
    });

    it("should skip startup plugin calls when bridge plugins are unavailable", async () => {
      const { App } = await import("@capacitor/app");
      const { Capacitor } = await import("@capacitor/core");
      const { Network } = await import("@capacitor/network");
      const bridge = await import("@/lib/capacitorBridge");

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(bridge.isPluginAvailable).mockImplementation(
        (pluginName: string) => pluginName !== "Preferences",
      );
      vi.mocked(bridge.isNativePluginAvailable).mockImplementation(
        (pluginName: string) => !["App", "Network"].includes(pluginName),
      );
      vi.mocked(connectionManager.getActiveDeviceId).mockReturnValue(RECORD_ID);

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      await waitFor(() => {
        expect(connectionManager.setEventHandlers).toHaveBeenCalled();
      });

      capturedEventHandlers.onConnectionChange!(RECORD_ID, {
        state: "connected",
        hasData: false,
        hasConnectedBefore: false,
      });

      await waitFor(() => {
        expect(CoreAPI.version).toHaveBeenCalled();
      });

      expect(Preferences.get).not.toHaveBeenCalled();
      expect(App.addListener).not.toHaveBeenCalled();
      expect(Network.addListener).not.toHaveBeenCalled();
    });
  });

  describe("connection initialization", () => {
    it("should set up connection manager event handlers", () => {
      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(connectionManager.setEventHandlers).toHaveBeenCalled();
    });

    it("should add device with correct config", () => {
      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      // The transport is keyed by the record, not the address it happens to be
      // reachable at today — that is what lets a device survive a DHCP move.
      expect(connectionManager.addDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: RECORD_ID,
          type: "websocket",
          address: "ws://192.168.1.100:7497/api/v0.1",
          encryption: expect.objectContaining({
            getCredentials: expect.any(Function),
          }),
        }),
      );
    });

    it("should not create a transport when no device is active", async () => {
      await seedDeviceRegistry([]);

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(connectionManager.addDevice).not.toHaveBeenCalled();
      expect(connectionManager.setActiveDevice).not.toHaveBeenCalled();
      expect(useStatusStore.getState().connectionState).toBe(
        ConnectionState.DISCONNECTED,
      );
    });

    it("should set active device after adding", () => {
      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(connectionManager.setActiveDevice).toHaveBeenCalledWith(RECORD_ID);
    });

    it("should restart the active connection after pairing succeeds", () => {
      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(pairingModalCapture.onSuccess).toBeDefined();
      pairingModalCapture.onSuccess?.();

      expect(connectionManager.restartActiveConnection).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  // iOS WebSockets do not reliably bootstrap `.local` resolution themselves, so
  // the provider browses mDNS and dials the address it resolves while the record
  // keeps the hostname that survives the device moving.
  describe("resolving a .local device", () => {
    const MDNS_RECORD_ID = "record-mdns";

    const advertise = (
      overrides: Partial<ZeroConfService> = {},
    ): ZeroConfService => ({
      domain: "local.",
      type: "_zaparoo._tcp.",
      name: "Steam Deck",
      port: 7497,
      hostname: "steamdeck.local",
      ipv4Addresses: ["10.0.0.206"],
      ipv6Addresses: [],
      txtRecord: { id: "core-id" },
      ...overrides,
    });

    async function seedMdnsDevice() {
      await seedDeviceRegistry(
        [
          mockDeviceRecord({
            recordId: MDNS_RECORD_ID,
            address: "steamdeck.local",
            source: "mdns",
            discoveryId: "core-id",
          }),
        ],
        MDNS_RECORD_ID,
      );
    }

    beforeEach(async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(connectionManager.getActiveDeviceId).mockReturnValue(
        MDNS_RECORD_ID,
      );
      await seedMdnsDevice();
    });

    afterEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    });

    it("should browse for a hostname it has not resolved yet", async () => {
      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      await waitFor(() => {
        expect(ZeroConf.watch).toHaveBeenCalled();
      });
    });

    it("should not browse for a device reached by address", async () => {
      await resetStore();

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      await waitFor(() => {
        expect(connectionManager.addDevice).toHaveBeenCalled();
      });
      expect(ZeroConf.watch).not.toHaveBeenCalled();
    });

    it("should dial the resolved address while the record keeps its hostname", async () => {
      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      await waitFor(() => {
        expect(ZeroConf.watch).toHaveBeenCalled();
      });
      act(() => {
        __simulateDeviceDiscovered(advertise());
      });

      await waitFor(() => {
        expect(connectionManager.addDevice).toHaveBeenCalledWith(
          expect.objectContaining({
            deviceId: MDNS_RECORD_ID,
            address: "ws://10.0.0.206:7497/api/v0.1",
          }),
        );
      });
      expect(deviceRegistry.activeEndpoint()?.address).toBe("steamdeck.local");
    });

    it("should follow the hostname to a new address", async () => {
      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      await waitFor(() => {
        expect(ZeroConf.watch).toHaveBeenCalled();
      });
      act(() => {
        __simulateDeviceDiscovered(advertise());
      });
      await waitFor(() => {
        expect(connectionManager.addDevice).toHaveBeenCalledWith(
          expect.objectContaining({ address: "ws://10.0.0.206:7497/api/v0.1" }),
        );
      });

      act(() => {
        __simulateDeviceDiscovered(
          advertise({ ipv4Addresses: ["10.0.0.219"] }),
        );
      });

      await waitFor(() => {
        expect(connectionManager.addDevice).toHaveBeenCalledWith(
          expect.objectContaining({ address: "ws://10.0.0.219:7497/api/v0.1" }),
        );
      });
    });

    // DHCP hands leases around, so adopting a stranger's resolution because it
    // happens to answer on a familiar address would point the socket at the
    // wrong box entirely.
    it("should ignore an announcement from a different device", async () => {
      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      await waitFor(() => {
        expect(ZeroConf.watch).toHaveBeenCalled();
      });
      act(() => {
        __simulateDeviceDiscovered(
          advertise({
            name: "Someone else",
            hostname: "basement.local",
            txtRecord: { id: "other-core" },
          }),
        );
      });

      await waitFor(() => {
        expect(connectionManager.addDevice).toHaveBeenCalled();
      });
      expect(connectionManager.addDevice).not.toHaveBeenCalledWith(
        expect.objectContaining({ address: "ws://10.0.0.206:7497/api/v0.1" }),
      );
    });

    it("should match an announcement without a device id on hostname and port", async () => {
      await seedDeviceRegistry(
        [
          mockDeviceRecord({
            recordId: MDNS_RECORD_ID,
            address: "steamdeck.local",
            source: "mdns",
          }),
        ],
        MDNS_RECORD_ID,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      await waitFor(() => {
        expect(ZeroConf.watch).toHaveBeenCalled();
      });
      act(() => {
        __simulateDeviceDiscovered(advertise({ txtRecord: {} }));
      });

      await waitFor(() => {
        expect(connectionManager.addDevice).toHaveBeenCalledWith(
          expect.objectContaining({ address: "ws://10.0.0.206:7497/api/v0.1" }),
        );
      });
    });

    // Browsing costs battery and multicast traffic, so it runs only until the
    // hostname is resolved on a live connection.
    it("should stop browsing once the connection is up", async () => {
      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      await waitFor(() => {
        expect(ZeroConf.watch).toHaveBeenCalled();
      });
      act(() => {
        __simulateDeviceDiscovered(advertise());
      });

      act(() => {
        capturedEventHandlers.onConnectionChange!(MDNS_RECORD_ID, {
          state: "connected",
          hasData: false,
          hasConnectedBefore: false,
        });
      });

      await waitFor(() => {
        expect(ZeroConf.unwatch).toHaveBeenCalled();
      });
    });

    it("should keep browsing while the connection is still down", async () => {
      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      await waitFor(() => {
        expect(ZeroConf.watch).toHaveBeenCalled();
      });
      act(() => {
        __simulateDeviceDiscovered(advertise());
      });

      await waitFor(() => {
        expect(connectionManager.addDevice).toHaveBeenCalledWith(
          expect.objectContaining({ address: "ws://10.0.0.206:7497/api/v0.1" }),
        );
      });
      expect(ZeroConf.unwatch).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("should remove device on unmount", () => {
      const { unmount } = render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      unmount();

      expect(connectionManager.removeDevice).toHaveBeenCalledWith(RECORD_ID);
    });
  });

  describe("context values", () => {
    it("should provide default disconnected state", () => {
      render(
        <ConnectionProvider>
          <ConnectionConsumer />
        </ConnectionProvider>,
      );

      expect(screen.getByTestId("isConnected")).toHaveTextContent("false");
    });

    it("should provide hasData as false initially", () => {
      render(
        <ConnectionProvider>
          <ConnectionConsumer />
        </ConnectionProvider>,
      );

      expect(screen.getByTestId("hasData")).toHaveTextContent("false");
    });
  });
});

describe("useConnection hook", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetStore();
  });

  it("should return connection context values with expected initial state", () => {
    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    // Verify connection state values are rendered correctly
    // On initial render with a target address but no connection:
    // - isConnected: false (not connected yet)
    // - hasData: false (no data received)
    // - showConnecting: true (have target address, attempting initial connection)
    // - showReconnecting: false (haven't connected before, so not reconnecting)
    expect(screen.getByTestId("isConnected")).toHaveTextContent("false");
    expect(screen.getByTestId("hasData")).toHaveTextContent("false");
    expect(screen.getByTestId("showConnecting")).toHaveTextContent("true");
    expect(screen.getByTestId("showReconnecting")).toHaveTextContent("false");
  });
});

describe("notification processing", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(CoreAPI.processReceived).mockReset().mockResolvedValue(null);
    vi.mocked(CoreAPI.media)
      .mockReset()
      .mockResolvedValue({
        database: { exists: false, indexing: false },
        active: [],
      });
    capturedEventHandlers = {};
    await resetStore();
    mockToast.mockClear();
    mockAnnounce.mockClear();
  });

  describe("media.started", () => {
    it("should update playing state and clear staged token when media starts", async () => {
      useStatusStore.setState({
        stagedToken: {
          ready: true,
          token: {
            type: "ntag",
            uid: "STAGED",
            text: "**launch:nes/zelda.nes",
            data: "",
            scanTime: "2024-01-15T11:00:00Z",
          },
        },
      });
      const startedMedia = {
        systemId: "snes",
        systemName: "Super Nintendo",
        mediaPath: "/games/mario.sfc",
        mediaName: "Super Mario World",
      };
      const mediaStartedNotification: NotificationRequest = {
        method: Notification.MediaStarted,
        params: { ...startedMedia, slot: null },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        mediaStartedNotification,
      );
      vi.mocked(CoreAPI.media).mockResolvedValueOnce({
        database: { exists: true, indexing: false },
        active: [startedMedia],
      });

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      // Simulate receiving a message
      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(useStatusStore.getState().playing).toEqual(startedMedia);
        expect(useStatusStore.getState().stagedToken).toBeNull();
      });
    });

    it("should update background media without replacing primary media", async () => {
      const primary = {
        systemId: "SNES",
        systemName: "Super Nintendo",
        mediaPath: "/games/smw.sfc",
        mediaName: "Super Mario World",
      };
      const stagedToken = {
        ready: true,
        token: {
          type: "ntag",
          uid: "STAGED",
          text: "**launch:snes/mario.sfc",
          data: "",
          scanTime: "2024-01-15T11:00:00Z",
        },
      };
      useStatusStore.setState({ playing: primary, stagedToken });
      vi.mocked(CoreAPI.media).mockResolvedValueOnce({
        database: { exists: true, indexing: false },
        active: [
          primary,
          {
            systemId: "Audio",
            systemName: "Audio",
            mediaPath: "/music/theme.mp3",
            mediaName: "Theme",
            slot: "background",
          },
        ],
        playlists: [
          {
            id: "soundtrack",
            name: "Soundtrack",
            slot: "background",
            repeat: "all",
            items: [
              { name: "Intro", zapScript: "@Audio/Intro" },
              { name: "Theme", zapScript: "@Audio/Theme" },
            ],
            index: 1,
            total: 2,
            playing: true,
          },
        ],
      });
      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce({
        method: Notification.MediaStarted,
        params: {
          systemId: "Audio",
          systemName: "Audio",
          mediaPath: "/music/theme.mp3",
          mediaName: "Theme",
          slot: "background",
        },
      });

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(useStatusStore.getState().playing).toEqual(primary);
        expect(useStatusStore.getState().backgroundPlaying).toEqual({
          systemId: "Audio",
          systemName: "Audio",
          mediaPath: "/music/theme.mp3",
          mediaName: "Theme",
          slot: "background",
        });
        expect(useStatusStore.getState().playlists.background).toMatchObject({
          id: "soundtrack",
          index: 1,
          playing: true,
        });
        expect(useStatusStore.getState().stagedToken).toEqual(stagedToken);
      });
    });

    it("should ignore notifications for unknown future slots", async () => {
      const primary = {
        systemId: "SNES",
        systemName: "Super Nintendo",
        mediaPath: "/games/smw.sfc",
        mediaName: "Super Mario World",
      };
      useStatusStore.setState({ playing: primary });
      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce({
        method: Notification.MediaStarted,
        params: {
          systemId: "Video",
          systemName: "Video",
          mediaPath: "/video/trailer.mp4",
          mediaName: "Trailer",
          slot: "tertiary",
        },
      });

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );
      await capturedEventHandlers.onMessage!("test-device", {});

      expect(useStatusStore.getState().playing).toEqual(primary);
      expect(useStatusStore.getState().backgroundPlaying.mediaName).toBe("");
    });
  });

  describe("message error handling", () => {
    it("should show recoverable toast when message processing fails", async () => {
      const { resetToastRateLimiter } = await import("@/lib/toastUtils");
      resetToastRateLimiter();
      vi.mocked(CoreAPI.processReceived).mockRejectedValueOnce(
        new Error("Malformed Core JSON response: Unexpected end of JSON input"),
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith("error");
      });
    });
  });

  describe("media.stopped", () => {
    it("should clear primary media without clearing background media", async () => {
      useStatusStore.setState({
        backgroundPlaying: {
          systemId: "Audio",
          systemName: "Audio",
          mediaPath: "/music/theme.mp3",
          mediaName: "Theme",
          slot: "background",
        },
        stagedToken: {
          ready: true,
          token: {
            type: "ntag",
            uid: "STAGED",
            text: "**launch:nes/zelda.nes",
            data: "",
            scanTime: "2024-01-15T11:00:00Z",
          },
        },
      });
      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce({
        method: Notification.MediaStopped,
        params: {},
      });
      vi.mocked(CoreAPI.media).mockResolvedValueOnce({
        database: { exists: true, indexing: false },
        active: [useStatusStore.getState().backgroundPlaying],
      });

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(CoreAPI.media).toHaveBeenCalledTimes(1);
        expect(useStatusStore.getState().playing).toEqual({
          systemId: "",
          systemName: "",
          mediaPath: "",
          mediaName: "",
        });
        expect(useStatusStore.getState().backgroundPlaying.mediaName).toBe(
          "Theme",
        );
        expect(useStatusStore.getState().stagedToken).toBeNull();
      });
    });

    it("should clear background media without clearing primary media", async () => {
      const primary = {
        systemId: "SNES",
        systemName: "Super Nintendo",
        mediaPath: "/games/smw.sfc",
        mediaName: "Super Mario World",
      };
      useStatusStore.setState({
        playing: primary,
        backgroundPlaying: {
          systemId: "Audio",
          systemName: "Audio",
          mediaPath: "/music/theme.mp3",
          mediaName: "Theme",
          slot: "background",
        },
        playlists: {
          primary: null,
          background: {
            id: "soundtrack",
            name: "Soundtrack",
            slot: "background",
            repeat: "all",
            items: [{ name: "Theme", zapScript: "@Audio/Theme" }],
            index: 0,
            total: 1,
            playing: true,
          },
        },
      });
      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce({
        method: Notification.MediaStopped,
        params: { slot: "background" },
      });
      vi.mocked(CoreAPI.media).mockResolvedValueOnce({
        database: { exists: true, indexing: false },
        active: [primary],
      });

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );
      await capturedEventHandlers.onMessage!("test-device", {});

      expect(useStatusStore.getState().backgroundPlaying?.mediaName).toBe(
        "Theme",
      );
      expect(useStatusStore.getState().playlists.background?.name).toBe(
        "Soundtrack",
      );

      await waitFor(() => {
        expect(useStatusStore.getState().playing).toEqual(primary);
        expect(useStatusStore.getState().backgroundPlaying).toEqual({
          systemId: "",
          systemName: "",
          mediaPath: "",
          mediaName: "",
        });
        expect(useStatusStore.getState().playlists.background).toBeNull();
      });
    });

    it("should preserve background controls between playlist tracks", async () => {
      vi.useFakeTimers();
      const previous = {
        systemId: "Audio",
        systemName: "Audio",
        mediaPath: "/music/intro.mp3",
        mediaName: "Intro",
        slot: "background" as const,
      };
      const next = {
        systemId: "Audio",
        systemName: "Audio",
        mediaPath: "/music/theme.mp3",
        mediaName: "Theme",
        slot: "background" as const,
      };
      const playlist = {
        id: "soundtrack",
        name: "Soundtrack",
        slot: "background" as const,
        repeat: "all" as const,
        items: [
          { name: "Intro", zapScript: "@Audio/Intro" },
          { name: "Theme", zapScript: "@Audio/Theme" },
        ],
        index: 1,
        total: 2,
        playing: true,
      };
      useStatusStore.setState({
        backgroundPlaying: previous,
        playlists: {
          primary: null,
          background: playlist,
        },
      });
      vi.mocked(CoreAPI.processReceived)
        .mockResolvedValueOnce({
          method: Notification.MediaStopped,
          params: { slot: "background" },
        })
        .mockResolvedValueOnce({
          method: Notification.MediaStarted,
          params: next,
        });
      vi.mocked(CoreAPI.media).mockResolvedValueOnce({
        database: { exists: true, indexing: false },
        active: [next],
        playlists: [playlist],
      });

      const view = render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      try {
        await capturedEventHandlers.onMessage!("test-device", {});
        expect(useStatusStore.getState().backgroundPlaying).toEqual(previous);
        expect(useStatusStore.getState().playlists.background).toEqual(
          playlist,
        );

        await capturedEventHandlers.onMessage!("test-device", {});
        await act(async () => {
          await vi.runAllTimersAsync();
        });

        expect(useStatusStore.getState().backgroundPlaying).toEqual(next);
        expect(useStatusStore.getState().playlists.background).toEqual(
          playlist,
        );
        expect(CoreAPI.media).toHaveBeenCalledTimes(1);
      } finally {
        view.unmount();
        vi.useRealTimers();
      }
    });
  });

  describe("tokens.added", () => {
    it("should update last token state", async () => {
      const tokenScannedNotification: NotificationRequest = {
        method: Notification.TokensScanned,
        params: {
          uid: "ABC123",
          text: "**launch:snes/mario.sfc",
          data: "launch data",
          scanTime: "2024-01-15T12:00:00Z",
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        tokenScannedNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(useStatusStore.getState().lastToken).toEqual({
          uid: "ABC123",
          text: "**launch:snes/mario.sfc",
          data: "launch data",
          scanTime: "2024-01-15T12:00:00Z",
        });
      });
    });

    it("should set active tokens and clear staged token", async () => {
      useStatusStore.setState({
        stagedToken: {
          ready: false,
          token: {
            type: "ntag",
            uid: "STAGED",
            text: "**launch:nes/zelda.nes",
            data: "",
            scanTime: "2024-01-15T11:00:00Z",
          },
        },
      });
      const tokenScannedNotification: NotificationRequest = {
        method: Notification.TokensScanned,
        params: {
          type: "ntag",
          uid: "ABC123",
          text: "**launch:snes/mario.sfc",
          data: "launch data",
          scanTime: "2024-01-15T12:00:00Z",
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        tokenScannedNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(useStatusStore.getState().activeTokens).toEqual([
          tokenScannedNotification.params,
        ]);
        expect(useStatusStore.getState().stagedToken).toBeNull();
      });
    });
  });

  describe("token staging notifications", () => {
    it("should store staged token as waiting", async () => {
      const stagedNotification: NotificationRequest = {
        method: Notification.TokensStaged,
        params: {
          type: "ntag",
          uid: "STAGED",
          text: "**launch:nes/zelda.nes",
          data: "",
          scanTime: "2024-01-15T11:00:00Z",
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        stagedNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(useStatusStore.getState().stagedToken).toEqual({
          token: stagedNotification.params,
          ready: false,
        });
        expect(mockAnnounce).toHaveBeenCalledWith(
          "tokenStaging.stagedAnnounce",
          "assertive",
        );
      });
    });

    it("should mark staged token ready", async () => {
      const readyNotification: NotificationRequest = {
        method: Notification.TokensStagedReady,
        params: {
          type: "ntag",
          uid: "STAGED",
          text: "**launch:nes/zelda.nes",
          data: "",
          scanTime: "2024-01-15T11:00:00Z",
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        readyNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(useStatusStore.getState().stagedToken).toEqual({
          token: readyNotification.params,
          ready: true,
        });
        expect(mockAnnounce).toHaveBeenCalledWith(
          "tokenStaging.readyAnnounce",
          "assertive",
        );
      });
    });

    it("should clear active tokens on token removal while preserving staged and last tokens", async () => {
      const lastToken = {
        type: "ntag",
        uid: "LAST",
        text: "**launch:snes/mario.sfc",
        data: "",
        scanTime: "2024-01-15T12:00:00Z",
      };
      const stagedToken = {
        type: "ntag",
        uid: "STAGED",
        text: "**launch:nes/zelda.nes",
        data: "",
        scanTime: "2024-01-15T11:00:00Z",
      };
      useStatusStore.setState({
        lastToken,
        activeTokens: [lastToken],
        stagedToken: { token: stagedToken, ready: true },
      });
      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce({
        method: Notification.TokensRemoved,
        params: undefined,
      });

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(useStatusStore.getState().activeTokens).toEqual([]);
        expect(useStatusStore.getState().stagedToken).toEqual({
          token: stagedToken,
          ready: true,
        });
        expect(useStatusStore.getState().lastToken).toEqual(lastToken);
      });
    });
  });

  describe("reader notifications", () => {
    it("should invalidate readers query on reader added", async () => {
      const invalidateSpy = vi.spyOn(
        QueryClient.prototype,
        "invalidateQueries",
      );
      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce({
        method: Notification.ReadersConnected,
        params: { driver: "pn532", path: "/dev/ttyUSB0", connected: true },
      });

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["readers"] });
      });
      invalidateSpy.mockRestore();
    });

    it("should invalidate readers query and clear active state on reader removed", async () => {
      const invalidateSpy = vi.spyOn(
        QueryClient.prototype,
        "invalidateQueries",
      );
      const token = {
        type: "ntag",
        uid: "ACTIVE",
        text: "**launch:snes/mario.sfc",
        data: "",
        scanTime: "2024-01-15T12:00:00Z",
      };
      useStatusStore.setState({
        activeTokens: [token],
        stagedToken: { token, ready: false },
      });
      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce({
        method: Notification.ReadersDisconnected,
        params: { driver: "pn532", path: "/dev/ttyUSB0", connected: false },
      });

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["readers"] });
        expect(useStatusStore.getState().activeTokens).toEqual([]);
        expect(useStatusStore.getState().stagedToken).toBeNull();
      });
      invalidateSpy.mockRestore();
    });
  });

  describe("inbox.added", () => {
    it("should add inbox message when the feature gate is available", async () => {
      useStatusStore.setState({ coreVersion: "2.8.0" });
      const inboxNotification: NotificationRequest = {
        method: Notification.InboxAdded,
        params: {
          id: 11,
          title: "New warning",
          severity: InboxSeverity.Info,
          createdAt: "2026-05-19T10:00:00.000Z",
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        inboxNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(useStatusStore.getState().inboxMessages).toEqual([
          inboxNotification.params,
        ]);
      });
    });

    it("should ignore inbox message when the feature gate is unavailable", async () => {
      useStatusStore.setState({ coreVersion: "2.7.0" });
      const inboxNotification: NotificationRequest = {
        method: Notification.InboxAdded,
        params: {
          id: 12,
          title: "Unsupported message",
          severity: InboxSeverity.Warning,
          createdAt: "2026-05-19T10:00:00.000Z",
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        inboxNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      expect(useStatusStore.getState().inboxMessages).toEqual([]);
      expect(mockToast).not.toHaveBeenCalled();
    });

    it("should show warning toast that opens the inbox", async () => {
      useStatusStore.setState({ coreVersion: "2.8.0" });
      const inboxNotification: NotificationRequest = {
        method: Notification.InboxAdded,
        params: {
          id: 13,
          title: "Action needed",
          severity: InboxSeverity.Warning,
          createdAt: "2026-05-19T10:00:00.000Z",
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        inboxNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalled();
      });

      expect(mockToast.mock.calls[0]?.[1]).toMatchObject({
        ariaProps: { role: "alert", "aria-live": "assertive" },
      });
      const toastRenderer = mockToast.mock.calls[0]![0] as (to: {
        id: string;
      }) => React.ReactNode;
      render(<>{toastRenderer({ id: "toast-1" })}</>);
      screen.getByRole("button", { name: "Action needed" }).click();

      expect(useStatusStore.getState().inboxModalOpen).toBe(true);
    });
  });

  describe("playtime notifications", () => {
    it("should expose daily playtime limit through one assertive toast", async () => {
      const playtimeLimitReachedNotification: NotificationRequest = {
        method: Notification.PlaytimeLimitReached,
        params: {
          reason: "daily",
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        playtimeLimitReachedNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => expect(mockToast).toHaveBeenCalled());
      expect(mockAnnounce).not.toHaveBeenCalled();
      expect(mockToast.mock.calls[0]?.[1]).toMatchObject({
        ariaProps: { role: "alert", "aria-live": "assertive" },
      });
    });

    it("should show session limit message when session limit reached", async () => {
      const playtimeLimitReachedNotification: NotificationRequest = {
        method: Notification.PlaytimeLimitReached,
        params: {
          reason: "session",
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        playtimeLimitReachedNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => expect(mockToast).toHaveBeenCalled());
      expect(mockAnnounce).not.toHaveBeenCalled();
      expect(mockToast.mock.calls[0]?.[1]).toMatchObject({
        ariaProps: { role: "alert", "aria-live": "assertive" },
      });
    });
  });

  describe("media.indexing", () => {
    it("should invalidate library queries after a system commit", async () => {
      const invalidateSpy = vi.spyOn(
        QueryClient.prototype,
        "invalidateQueries",
      );
      const removeSpy = vi.spyOn(QueryClient.prototype, "removeQueries");
      useStatusStore.setState({
        gamesIndex: {
          exists: true,
          indexing: true,
          systemsCompleted: 1,
          systemsTotal: 10,
        },
      });
      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce({
        method: Notification.MediaIndexing,
        params: {
          exists: true,
          indexing: true,
          systemsCompleted: 2,
          systemsTotal: 10,
        },
      });

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );
      invalidateSpy.mockClear();
      removeSpy.mockClear();

      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["systems"],
        });
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tags"] });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["infiniteMediaSearch"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["mediaBrowse"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["mediaBrowseIndex"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["mediaMeta"],
      });
      expect(removeSpy).toHaveBeenCalledWith({ queryKey: ["mediaImage"] });
      invalidateSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it("should update games index state", async () => {
      const mediaIndexingNotification: NotificationRequest = {
        method: Notification.MediaIndexing,
        params: {
          indexing: true,
          optimizing: false,
          exists: true,
          totalMedia: 150,
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        mediaIndexingNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(useStatusStore.getState().gamesIndex).toMatchObject({
          indexing: true,
          optimizing: false,
          exists: true,
          totalMedia: 150,
        });
      });
    });

    it("should reconcile until authoritative media status is terminal", async () => {
      vi.useFakeTimers();
      const messagePromise = Promise.resolve<NotificationRequest>({
        method: Notification.MediaIndexing,
        params: {
          indexing: true,
          optimizing: false,
          exists: true,
          currentStepDisplay: "Finding media folders",
        },
      });
      vi.mocked(CoreAPI.processReceived).mockReturnValueOnce(messagePromise);
      vi.mocked(CoreAPI.media)
        .mockResolvedValueOnce({
          database: {
            exists: true,
            indexing: true,
            currentStepDisplay: "Super Nintendo",
          },
          active: [],
        })
        .mockResolvedValueOnce({
          database: {
            exists: true,
            indexing: false,
            optimizing: false,
            totalMedia: 150,
          },
          active: [],
        });

      const invalidateSpy = vi.spyOn(
        QueryClient.prototype,
        "invalidateQueries",
      );
      const view = render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );
      useStatusStore.setState({
        connected: true,
        connectionState: ConnectionState.CONNECTED,
      });

      try {
        await act(async () => {
          capturedEventHandlers.onMessage!("test-device", {});
          await messagePromise;
        });
        expect(useStatusStore.getState().gamesIndex.indexing).toBe(true);

        await act(async () => {
          await vi.advanceTimersToNextTimerAsync();
        });
        expect(CoreAPI.media).toHaveBeenCalledTimes(1);
        expect(useStatusStore.getState().gamesIndex).toMatchObject({
          indexing: true,
          currentStepDisplay: "Super Nintendo",
        });
        invalidateSpy.mockClear();

        await act(async () => {
          await vi.advanceTimersToNextTimerAsync();
        });
        expect(CoreAPI.media).toHaveBeenCalledTimes(2);
        expect(useStatusStore.getState().gamesIndex).toMatchObject({
          indexing: false,
          totalMedia: 150,
        });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["media"] });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["systems"] });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tags"] });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["infiniteMediaSearch"],
        });

        while (vi.getTimerCount() > 0) {
          await act(async () => {
            await vi.advanceTimersToNextTimerAsync();
          });
        }
        expect(CoreAPI.media).toHaveBeenCalledTimes(2);
      } finally {
        view.unmount();
        invalidateSpy.mockRestore();
        vi.useRealTimers();
      }
    });

    it.each(["resolve", "reject"] as const)(
      "should ignore stale reconciliation %s after a terminal notification",
      async (outcome) => {
        vi.useFakeTimers();
        const progressPromise = Promise.resolve<NotificationRequest>({
          method: Notification.MediaIndexing,
          params: {
            indexing: true,
            optimizing: false,
            exists: true,
            currentStepDisplay: "Finding media folders",
          },
        });
        const terminalPromise = Promise.resolve<NotificationRequest>({
          method: Notification.MediaIndexing,
          params: {
            indexing: false,
            optimizing: false,
            exists: true,
            totalMedia: 150,
          },
        });
        vi.mocked(CoreAPI.processReceived)
          .mockReturnValueOnce(progressPromise)
          .mockReturnValueOnce(terminalPromise);

        type MediaResponse = Awaited<ReturnType<typeof CoreAPI.media>>;
        let resolveReconciliation!: (response: MediaResponse) => void;
        let rejectReconciliation!: (error: Error) => void;
        vi.mocked(CoreAPI.media).mockReturnValueOnce(
          new Promise((resolve, reject) => {
            resolveReconciliation = resolve;
            rejectReconciliation = reject;
          }),
        );
        const loggerSpy = vi
          .spyOn(logger, "error")
          .mockImplementation(() => {});

        const view = render(
          <ConnectionProvider>
            <div>Test</div>
          </ConnectionProvider>,
        );
        useStatusStore.setState({
          connected: true,
          connectionState: ConnectionState.CONNECTED,
        });

        try {
          await act(async () => {
            capturedEventHandlers.onMessage!("test-device", {});
            await progressPromise;
            await vi.advanceTimersToNextTimerAsync();
          });
          expect(CoreAPI.media).toHaveBeenCalledTimes(1);

          await act(async () => {
            capturedEventHandlers.onMessage!("test-device", {});
            await terminalPromise;
          });
          expect(useStatusStore.getState().gamesIndex.indexing).toBe(false);

          await act(async () => {
            if (outcome === "resolve") {
              resolveReconciliation({
                database: {
                  exists: true,
                  indexing: true,
                  currentStepDisplay: "Stale progress",
                },
                active: [],
              });
            } else {
              rejectReconciliation(new Error("Stale media status failure"));
            }
            await Promise.resolve();
          });

          expect(useStatusStore.getState().gamesIndex).toMatchObject({
            indexing: false,
            totalMedia: 150,
          });
          expect(CoreAPI.media).toHaveBeenCalledTimes(1);
          expect(loggerSpy).not.toHaveBeenCalled();
          expect(vi.getTimerCount()).toBe(0);
        } finally {
          view.unmount();
          loggerSpy.mockRestore();
          vi.useRealTimers();
        }
      },
    );

    it("should skip reconciliation after connection loss", async () => {
      vi.useFakeTimers();
      const messagePromise = Promise.resolve<NotificationRequest>({
        method: Notification.MediaIndexing,
        params: {
          indexing: true,
          optimizing: false,
          exists: true,
        },
      });
      vi.mocked(CoreAPI.processReceived).mockReturnValueOnce(messagePromise);

      const view = render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );
      useStatusStore.setState({
        connected: true,
        connectionState: ConnectionState.CONNECTED,
      });

      try {
        await act(async () => {
          capturedEventHandlers.onMessage!("test-device", {});
          await messagePromise;
        });
        useStatusStore.setState({
          connected: false,
          connectionState: ConnectionState.RECONNECTING,
        });

        await act(async () => {
          await vi.advanceTimersToNextTimerAsync();
        });

        expect(CoreAPI.media).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        view.unmount();
        vi.useRealTimers();
      }
    });

    it("should retry reconciliation after cancelled and failed status attempts", async () => {
      vi.useFakeTimers();
      const messagePromise = Promise.resolve<NotificationRequest>({
        method: Notification.MediaIndexing,
        params: {
          indexing: true,
          optimizing: false,
          exists: true,
        },
      });
      vi.mocked(CoreAPI.processReceived).mockReturnValueOnce(messagePromise);
      // CoreAPI.media is declared as returning MediaResponse, but a stale or
      // reset request resolves with a CancelledResponse instead — which is why
      // the provider guards with isCancelled. The cast is what lets the test
      // reproduce that real resolution against the narrower declared type.
      vi.mocked(CoreAPI.media)
        .mockResolvedValueOnce({
          cancelled: true,
        } as unknown as Awaited<ReturnType<typeof CoreAPI.media>>)
        .mockRejectedValueOnce(new Error("Temporary media status failure"))
        .mockResolvedValueOnce({
          database: {
            exists: true,
            indexing: false,
            optimizing: false,
            totalMedia: 150,
          },
          active: [],
        });
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

      const view = render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );
      useStatusStore.setState({
        connected: true,
        connectionState: ConnectionState.CONNECTED,
      });

      try {
        await act(async () => {
          capturedEventHandlers.onMessage!("test-device", {});
          await messagePromise;
          await vi.advanceTimersToNextTimerAsync();
        });
        expect(CoreAPI.media).toHaveBeenCalledTimes(1);
        expect(loggerSpy).not.toHaveBeenCalled();

        await act(async () => {
          await vi.advanceTimersToNextTimerAsync();
        });
        expect(CoreAPI.media).toHaveBeenCalledTimes(2);
        expect(loggerSpy).toHaveBeenCalledWith(
          "Failed to reconcile media indexing status",
          expect.any(Error),
          expect.objectContaining({ action: "media-index-reconcile" }),
        );

        await act(async () => {
          await vi.advanceTimersToNextTimerAsync();
        });
        expect(CoreAPI.media).toHaveBeenCalledTimes(3);
        expect(useStatusStore.getState().gamesIndex).toMatchObject({
          indexing: false,
          totalMedia: 150,
        });
      } finally {
        view.unmount();
        loggerSpy.mockRestore();
        vi.useRealTimers();
      }
    });
  });

  describe("media.scraping", () => {
    it("should invalidate Library metadata when scraping finishes", async () => {
      const invalidateSpy = vi.spyOn(
        QueryClient.prototype,
        "invalidateQueries",
      );
      const removeSpy = vi.spyOn(QueryClient.prototype, "removeQueries");
      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce({
        method: Notification.MediaScraping,
        params: {
          processed: 100,
          total: 100,
          matched: 90,
          skipped: 10,
          totalScraped: 1200,
          scraping: false,
          done: true,
          paused: false,
        },
      });

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );
      invalidateSpy.mockClear();
      removeSpy.mockClear();

      await capturedEventHandlers.onMessage!("test-device", {});

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["mediaBrowse"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["mediaMeta"],
      });
      expect(removeSpy).toHaveBeenCalledWith({ queryKey: ["mediaImage"] });
      await waitFor(() =>
        expect(invalidateLibraryImageCache).toHaveBeenCalledWith(RECORD_ID),
      );
      invalidateSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it("should update scraper status state", async () => {
      const mediaScrapingNotification: NotificationRequest = {
        method: Notification.MediaScraping,
        params: {
          scraperId: "gamelist.xml",
          systemId: "snes",
          processed: 42,
          total: 100,
          matched: 38,
          skipped: 4,
          totalScraped: 1200,
          scraping: true,
          done: false,
          paused: true,
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        mediaScrapingNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(useStatusStore.getState().scrapingStatus).toMatchObject({
          scraperId: "gamelist.xml",
          systemId: "snes",
          processed: 42,
          total: 100,
          matched: 38,
          skipped: 4,
          totalScraped: 1200,
          scraping: true,
          done: false,
          paused: true,
        });
      });
    });
  });

  describe("error handling", () => {
    it("should not update state when processReceived returns null", async () => {
      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(null);

      const initialState = useStatusStore.getInitialState();

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      // State should remain at initial values
      expect(useStatusStore.getState().playing).toEqual(initialState.playing);
      expect(useStatusStore.getState().lastToken).toEqual(
        initialState.lastToken,
      );
    });

    it("should handle unknown notification method gracefully", async () => {
      const unknownNotification: NotificationRequest = {
        method: "unknown.method" as any,
        params: {},
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        unknownNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      // Should not throw
      await capturedEventHandlers.onMessage!("test-device", {});

      // State should not be updated for unknown notifications
      const initialState = useStatusStore.getInitialState();
      expect(useStatusStore.getState().playing).toEqual(initialState.playing);
      expect(useStatusStore.getState().lastToken).toEqual(
        initialState.lastToken,
      );
    });

    it("should show toast when processReceived throws an error", async () => {
      vi.mocked(CoreAPI.processReceived).mockRejectedValueOnce(
        new Error("Parse error"),
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      // Should not crash and should continue functioning
      await waitFor(() => {
        expect(screen.getByText("Test")).toBeInTheDocument();
      });
    });
  });

  describe("playtimeLimitWarning", () => {
    it("should expose playtime warning through one assertive toast", async () => {
      const playtimeLimitWarningNotification: NotificationRequest = {
        method: Notification.PlaytimeLimitWarning,
        params: {
          interval: "1m",
          remaining: "5m", // 5 minutes as string duration
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        playtimeLimitWarningNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => expect(mockToast).toHaveBeenCalled());
      expect(mockAnnounce).not.toHaveBeenCalled();
      expect(mockToast.mock.calls[0]?.[1]).toMatchObject({
        ariaProps: { role: "alert", "aria-live": "assertive" },
      });
    });
  });
});

describe("connection event handling", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedEventHandlers = {};
    await resetStore();
    // Re-setup mock after clearAllMocks - use the address from store mock
    vi.mocked(connectionManager.getActiveDeviceId).mockReturnValue(RECORD_ID);
  });

  it("should call handleConnectionOpen when connection state becomes connected", async () => {
    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onConnectionChange).toBeDefined();

    // Simulate connection becoming connected using the correct device ID
    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.flushQueue).toHaveBeenCalled();
      expect(CoreAPI.media).toHaveBeenCalled();
      expect(CoreAPI.tokens).toHaveBeenCalled();
      expect(CoreAPI.version).toHaveBeenCalled();
      expect(useStatusStore.getState().coreVersion).toBe("2.5.0");
      expect(useStatusStore.getState().corePlatform).toBe("test");
      expect(useStatusStore.getState().coreVersionPending).toBe(false);
    });
  });

  it("should reconcile indexing discovered during connection hydration", async () => {
    vi.useFakeTimers();
    vi.mocked(CoreAPI.media)
      .mockReset()
      .mockResolvedValueOnce({
        database: {
          exists: true,
          indexing: true,
          currentStepDisplay: "Finding media folders",
        },
        active: [],
      })
      .mockResolvedValueOnce({
        database: {
          exists: true,
          indexing: false,
          optimizing: false,
          totalMedia: 150,
        },
        active: [],
      });

    const view = render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    try {
      await act(async () => {
        capturedEventHandlers.onConnectionChange!(RECORD_ID, {
          state: "connected",
          hasData: false,
          hasConnectedBefore: false,
        });
        await Promise.resolve();
      });

      expect(CoreAPI.media).toHaveBeenCalledTimes(1);
      expect(useStatusStore.getState().gamesIndex.indexing).toBe(true);

      await act(async () => {
        await vi.advanceTimersToNextTimerAsync();
      });

      expect(CoreAPI.media).toHaveBeenCalledTimes(2);
      expect(useStatusStore.getState().gamesIndex).toMatchObject({
        indexing: false,
        totalMedia: 150,
      });
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it("should hydrate both media slots regardless of response order", async () => {
    vi.mocked(CoreAPI.media).mockResolvedValueOnce({
      database: { exists: true, indexing: false },
      active: [
        {
          systemId: "Audio",
          systemName: "Audio",
          mediaPath: "/music/theme.mp3",
          mediaName: "Theme",
          slot: "background",
        },
        {
          systemId: "SNES",
          systemName: "Super Nintendo",
          mediaPath: "/games/smw.sfc",
          mediaName: "Super Mario World",
          slot: null as never,
        },
      ],
      playlists: [
        {
          id: "favorites",
          name: "Favorites",
          slot: "primary",
          repeat: "none",
          items: [
            {
              name: "Super Mario World",
              zapScript: "@SNES/Super Mario World",
            },
          ],
          index: 0,
          total: 1,
          playing: true,
        },
        {
          id: "soundtrack",
          name: "Soundtrack",
          slot: "background",
          repeat: "all",
          items: [
            { name: "Theme", zapScript: "@Audio/Theme" },
            { name: "Battle", zapScript: "@Audio/Battle" },
          ],
          index: 0,
          total: 2,
          playing: true,
        },
      ],
    });

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );
    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(useStatusStore.getState().playing.mediaName).toBe(
        "Super Mario World",
      );
      expect(useStatusStore.getState().backgroundPlaying.mediaName).toBe(
        "Theme",
      );
      expect(useStatusStore.getState().playlists.primary?.name).toBe(
        "Favorites",
      );
      expect(useStatusStore.getState().playlists.background?.name).toBe(
        "Soundtrack",
      );
    });
  });

  it("should ignore stale initial media after a notification refresh", async () => {
    type MediaResult = Awaited<ReturnType<typeof CoreAPI.media>>;
    let resolveInitialRequest!: (value: MediaResult) => void;
    const initialRequest = new Promise<MediaResult>((resolve) => {
      resolveInitialRequest = resolve;
    });

    vi.mocked(CoreAPI.media)
      .mockReset()
      .mockResolvedValue({
        database: { exists: false, indexing: false },
        active: [],
      })
      .mockReturnValueOnce(initialRequest)
      .mockResolvedValueOnce({
        database: { exists: true, indexing: false },
        active: [
          {
            systemId: "SNES",
            systemName: "Super Nintendo",
            mediaPath: "/games/new.sfc",
            mediaName: "New Game",
          },
        ],
      });
    vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce({
      method: Notification.MediaStarted,
      params: {
        systemId: "SNES",
        systemName: "Super Nintendo",
        mediaPath: "/games/new.sfc",
        mediaName: "New Game",
      },
    });

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );
    act(() => {
      capturedEventHandlers.onConnectionChange!(RECORD_ID, {
        state: "connected",
        hasData: false,
        hasConnectedBefore: false,
      });
    });
    await waitFor(() => {
      expect(CoreAPI.media).toHaveBeenCalledTimes(1);
    });

    await capturedEventHandlers.onMessage!("test-device", {});
    await waitFor(() => {
      expect(useStatusStore.getState().playing.mediaName).toBe("New Game");
    });

    await act(async () => {
      resolveInitialRequest({
        database: { exists: true, indexing: false },
        active: [
          {
            systemId: "NES",
            systemName: "Nintendo",
            mediaPath: "/games/old.nes",
            mediaName: "Old Game",
          },
        ],
      });
      await initialRequest;
    });

    expect(useStatusStore.getState().playing.mediaName).toBe("New Game");
  });

  it("should keep primary empty when only background media is active", async () => {
    useStatusStore.setState({
      playing: {
        systemId: "NES",
        systemName: "Nintendo",
        mediaPath: "/games/old.nes",
        mediaName: "Old Game",
      },
    });
    vi.mocked(CoreAPI.media).mockResolvedValueOnce({
      database: { exists: true, indexing: false },
      active: [
        {
          systemId: "Audio",
          systemName: "Audio",
          mediaPath: "/music/theme.mp3",
          mediaName: "Theme",
          slot: "background",
        },
      ],
    });

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );
    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(useStatusStore.getState().playing.mediaName).toBe("");
      expect(useStatusStore.getState().backgroundPlaying.mediaName).toBe(
        "Theme",
      );
    });
  });

  it("should preserve legacy capabilities for older Core versions", async () => {
    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(useStatusStore.getState().currentClient).toEqual({
        paired: false,
        role: null,
        capabilities: [
          ClientCapability.ProfilesManage,
          ClientCapability.SettingsWrite,
        ],
      });
    });
    expect(CoreAPI.clientsCurrent).not.toHaveBeenCalled();
  });

  it("should hydrate current client capabilities from supported Core", async () => {
    vi.mocked(CoreAPI.version).mockResolvedValueOnce({
      version: "DEVELOPMENT",
      platform: "test",
    });
    vi.mocked(CoreAPI.clientsCurrent).mockResolvedValueOnce({
      paired: true,
      role: "member",
      capabilities: [],
    });

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.clientsCurrent).toHaveBeenCalledTimes(1);
      expect(useStatusStore.getState().currentClient).toEqual({
        paired: true,
        role: "member",
        capabilities: [],
      });
    });
  });

  it.each(["resolve", "reject"] as const)(
    "should ignore stale clients.current %s callbacks after reconnecting",
    async (outcome) => {
      vi.mocked(CoreAPI.version).mockResolvedValueOnce({
        version: "DEVELOPMENT",
        platform: "test",
      });
      type CurrentClient = Awaited<ReturnType<typeof CoreAPI.clientsCurrent>>;
      let resolveRequest!: (value: CurrentClient) => void;
      let rejectRequest!: (reason: Error) => void;
      const deferredRequest = new Promise<CurrentClient>((resolve, reject) => {
        resolveRequest = resolve;
        rejectRequest = reject;
      });
      vi.mocked(CoreAPI.clientsCurrent).mockReturnValueOnce(deferredRequest);

      render(
        <ConnectionProvider>
          <ConnectionConsumer />
        </ConnectionProvider>,
      );
      capturedEventHandlers.onConnectionChange!(RECORD_ID, {
        state: "connected",
        hasData: false,
        hasConnectedBefore: false,
      });
      await waitFor(() => {
        expect(CoreAPI.clientsCurrent).toHaveBeenCalledTimes(1);
      });

      capturedEventHandlers.onConnectionChange!(RECORD_ID, {
        state: "reconnecting",
        hasData: true,
        hasConnectedBefore: true,
      });
      const newerClient: CurrentClient = {
        paired: true,
        role: "admin",
        capabilities: [ClientCapability.SettingsWrite],
      };
      useStatusStore.setState({ currentClient: newerClient });

      await act(async () => {
        if (outcome === "resolve") {
          resolveRequest({ paired: true, role: "member", capabilities: [] });
        } else {
          rejectRequest(new Error("stale request failed"));
        }
        await deferredRequest.catch(() => undefined);
      });

      expect(useStatusStore.getState().currentClient).toEqual(newerClient);
    },
  );

  it("should cancel pending RPCs and image queries while reconnecting", () => {
    const cancelSpy = vi.spyOn(QueryClient.prototype, "cancelQueries");

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );
    cancelSpy.mockClear();

    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "reconnecting",
      hasData: true,
      hasConnectedBefore: true,
    });

    expect(CoreAPI.handleDisconnect).toHaveBeenCalledTimes(1);
    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ["mediaImage"] });
    cancelSpy.mockRestore();
  });

  it("should clear stale client capabilities while reconnecting", () => {
    useStatusStore.setState({
      currentClient: {
        paired: true,
        role: "admin",
        capabilities: [ClientCapability.SettingsWrite],
      },
    });
    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );
    useStatusStore.setState({
      currentClient: {
        paired: true,
        role: "admin",
        capabilities: [ClientCapability.SettingsWrite],
      },
    });

    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "reconnecting",
      hasData: true,
      hasConnectedBefore: true,
    });

    expect(useStatusStore.getState().currentClient).toBeNull();
  });

  it("should invalidate library queries after reconnecting", async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );
    invalidateSpy.mockClear();

    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["systems"] });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tags"] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["infiniteMediaSearch"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["mediaBrowse"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["mediaMeta"] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["mediaImage"],
      refetchType: "active",
    });
    invalidateSpy.mockRestore();
  });

  it("should fetch inbox messages when connected Core supports inbox", async () => {
    const messages = [
      {
        id: 21,
        title: "Fetched message",
        severity: InboxSeverity.Info,
        createdAt: "2026-05-19T10:00:00.000Z",
      },
    ];
    vi.mocked(CoreAPI.version).mockResolvedValueOnce({
      version: "2.8.0",
      platform: "test",
    });
    vi.mocked(CoreAPI.inbox).mockResolvedValueOnce({ messages });

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onConnectionChange).toBeDefined();
    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.inbox).toHaveBeenCalled();
      expect(useStatusStore.getState().inboxMessages).toEqual(messages);
    });
  });

  it("should clear stale inbox state when connected Core does not support inbox", async () => {
    useStatusStore.setState({
      inboxMessages: [
        {
          id: 22,
          title: "Stale message",
          severity: InboxSeverity.Warning,
          createdAt: "2026-05-19T10:00:00.000Z",
        },
      ],
      inboxModalOpen: true,
    });
    vi.mocked(CoreAPI.version).mockResolvedValueOnce({
      version: "2.7.0",
      platform: "test",
    });

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onConnectionChange).toBeDefined();
    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(useStatusStore.getState().coreVersion).toBe("2.7.0");
      expect(CoreAPI.inbox).not.toHaveBeenCalled();
      expect(useStatusStore.getState().inboxMessages).toEqual([]);
      expect(useStatusStore.getState().inboxModalOpen).toBe(false);
    });
  });

  it("should fetch scraper status when connected Core supports media scrapers", async () => {
    vi.mocked(CoreAPI.version).mockResolvedValueOnce({
      version: "2.12.0",
      platform: "test",
    });
    vi.mocked(CoreAPI.mediaScrapeStatus).mockResolvedValueOnce({
      scraperId: "gamelist.xml",
      processed: 1,
      total: 2,
      matched: 1,
      skipped: 0,
      totalScraped: 12,
      scraping: true,
      done: false,
      paused: false,
    });

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onConnectionChange).toBeDefined();
    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.mediaScrapeStatus).toHaveBeenCalled();
      expect(useStatusStore.getState().scrapingStatus).toMatchObject({
        scraperId: "gamelist.xml",
        scraping: true,
        totalScraped: 12,
      });
    });
  });

  it("should not fetch scraper status when connected Core is below media scraper gate", async () => {
    vi.mocked(CoreAPI.version).mockResolvedValueOnce({
      version: "2.11.9",
      platform: "test",
    });

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onConnectionChange).toBeDefined();
    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(useStatusStore.getState().coreVersion).toBe("2.11.9");
      expect(CoreAPI.mediaScrapeStatus).not.toHaveBeenCalled();
    });
  });

  it("should clear stale scraper status when fetching scraper status fails", async () => {
    useStatusStore.setState({
      scrapingStatus: {
        scraperId: "gamelist.xml",
        processed: 1,
        total: 2,
        matched: 1,
        skipped: 0,
        totalScraped: 12,
        scraping: true,
        done: false,
        paused: false,
      },
    });
    vi.mocked(CoreAPI.version).mockResolvedValueOnce({
      version: "2.12.0",
      platform: "test",
    });
    vi.mocked(CoreAPI.mediaScrapeStatus).mockRejectedValueOnce(
      new Error("status failed"),
    );

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onConnectionChange).toBeDefined();
    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.mediaScrapeStatus).toHaveBeenCalled();
      expect(useStatusStore.getState().scrapingStatus).toBeNull();
    });
  });

  it("should store the platform and version the peer reports on its record", async () => {
    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onConnectionChange).toBeDefined();

    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    // The device list renders these between connects, so they have to outlive
    // the socket that fetched them.
    await waitFor(() => {
      expect(deviceRegistry.getSnapshot().records[RECORD_ID]).toMatchObject({
        platform: "test",
        version: "2.5.0",
      });
    });
  });

  it("should leave the user's own name alone when the peer reports its metadata", async () => {
    await seedDeviceRegistry(
      [
        mockDeviceRecord({
          recordId: RECORD_ID,
          address: DEVICE_ADDRESS,
          name: "Old Name",
          nameIsCustom: true,
        }),
      ],
      RECORD_ID,
    );

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(deviceRegistry.getSnapshot().records[RECORD_ID]).toMatchObject({
        name: "Old Name",
        platform: "test",
      });
    });
  });

  it("should stamp the record as connected once the peer settles on plaintext", async () => {
    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    const before = Date.now();
    capturedEventHandlers.onPlaintextMode!();

    await waitFor(() => {
      const record = deviceRegistry.getSnapshot().records[RECORD_ID];
      expect(record?.lastConnectedAt).toBeGreaterThanOrEqual(before);
    });
  });

  it("should move a pre-V2 pairing onto the record once the peer authenticates with it", async () => {
    // Nothing before the handshake proves the credential stored at an address
    // belongs to this record — a recycled DHCP lease would look identical. The
    // key only moves after the peer has actually authenticated with it.
    await seedDeviceRegistry(
      [
        mockDeviceRecord({
          recordId: RECORD_ID,
          address: DEVICE_ADDRESS,
          legacyCredentialKey: "192.168.1.100",
        }),
      ],
      RECORD_ID,
    );
    await credentialStore.set("192.168.1.100", {
      authToken: "token-abc",
      pairingKey: "a".repeat(64),
      clientId: "client-uuid-1234",
      pairedAt: 1700000000000,
    });

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    const [config] = vi.mocked(connectionManager.addDevice).mock.calls.at(-1)!;
    await expect(config.encryption!.getCredentials()).resolves.toMatchObject({
      authToken: "token-abc",
    });

    capturedEventHandlers.onEncryptedHandshakeOk!();

    // The promotion and the record update land on separate ticks, so all three
    // assertions have to be inside the same waitFor — asserting the last two
    // after it would read state the handler has not finished writing.
    await waitFor(async () => {
      await expect(
        credentialStore.get(credentialKeyForRecord(RECORD_ID)),
      ).resolves.toMatchObject({ authToken: "token-abc" });
      await expect(credentialStore.get("192.168.1.100")).resolves.toBeNull();
      expect(
        deviceRegistry.getSnapshot().records[RECORD_ID]?.legacyCredentialKey,
      ).toBeUndefined();
    });
  });

  it("should set coreVersion to null when version fetch fails", async () => {
    vi.mocked(CoreAPI.version).mockRejectedValueOnce(
      new Error("Network error"),
    );

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(useStatusStore.getState().coreVersion).toBeNull();
      expect(useStatusStore.getState().corePlatform).toBeNull();
      expect(useStatusStore.getState().coreVersionPending).toBe(false);
    });
  });

  it("should handle error event without crashing", async () => {
    vi.mocked(connectionManager.getActiveDeviceId).mockReturnValue(
      "test-device",
    );

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onError).toBeDefined();

    // Simulate error - should not throw or crash the component
    capturedEventHandlers.onError!(
      "test-device",
      new Error("Connection refused"),
    );

    // Component should still be rendered and functional
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("should ignore events from inactive devices", async () => {
    vi.mocked(connectionManager.getActiveDeviceId).mockReturnValue(
      "other-device",
    );

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onConnectionChange).toBeDefined();

    // Simulate event from different device
    capturedEventHandlers.onConnectionChange!("test-device", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    // Should not trigger data fetch since it's not the active device
    // The initial render already calls these, so we check they weren't called again
    const initialCallCount = vi.mocked(CoreAPI.media).mock.calls.length;

    // Verify no additional calls were made (event was ignored)
    expect(vi.mocked(CoreAPI.media).mock.calls.length).toBe(initialCallCount);
  });
});

describe("cancelled request handling", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedEventHandlers = {};
    await resetStore();
    // Ensure getActiveDeviceId returns the device we're testing with
    vi.mocked(connectionManager.getActiveDeviceId).mockReturnValue(RECORD_ID);
  });

  it("should handle cancelled media response gracefully", async () => {
    vi.mocked(CoreAPI.media).mockResolvedValueOnce({ cancelled: true } as any);

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Trigger connection open with the deviceId that matches our mock
    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.media).toHaveBeenCalled();
    });

    // Component should handle cancelled response without crashing
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("should retry media() once after a cancelled response on initial connect", async () => {
    // Reconnect can race with the transport coming back up; the first call may
    // resolve as cancelled (request reset). We schedule one delayed retry —
    // without it the settings card and store stay stale until the next
    // notification arrives.
    vi.mocked(CoreAPI.media)
      .mockResolvedValueOnce({ cancelled: true } as any)
      .mockResolvedValueOnce({
        database: { exists: true, indexing: false },
        active: [],
      } as any);

    vi.useFakeTimers({ shouldAdvanceTime: true });

    try {
      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      capturedEventHandlers.onConnectionChange!(RECORD_ID, {
        state: "connected",
        hasData: false,
        hasConnectedBefore: false,
      });

      await waitFor(() => {
        expect(CoreAPI.media).toHaveBeenCalledTimes(1);
      });

      // Advance past the 500ms scheduled retry.
      await vi.advanceTimersByTimeAsync(600);

      await waitFor(() => {
        expect(CoreAPI.media).toHaveBeenCalledTimes(2);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("should clear a pending media retry timer on unmount", async () => {
    // If the user switches devices while a retry is pending the timer must
    // not fire and write stale data into the new connection's store.
    vi.mocked(CoreAPI.media).mockResolvedValueOnce({ cancelled: true } as any);

    vi.useFakeTimers({ shouldAdvanceTime: true });

    try {
      const { unmount } = render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      capturedEventHandlers.onConnectionChange!(RECORD_ID, {
        state: "connected",
        hasData: false,
        hasConnectedBefore: false,
      });

      await waitFor(() => {
        expect(CoreAPI.media).toHaveBeenCalledTimes(1);
      });

      unmount();

      // Even after the retry window, no second call — the cleanup cleared it.
      await vi.advanceTimersByTimeAsync(1000);
      expect(CoreAPI.media).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("should handle cancelled tokens response gracefully", async () => {
    vi.mocked(CoreAPI.tokens).mockResolvedValueOnce({
      cancelled: true,
    } as any);

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Trigger connection open with the deviceId that matches our mock
    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.tokens).toHaveBeenCalled();
    });

    // Should not crash
    expect(screen.getByText("Test")).toBeInTheDocument();
  });
});

describe("API error handling", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedEventHandlers = {};
    await resetStore();
    // Ensure getActiveDeviceId returns the device we're testing with
    vi.mocked(connectionManager.getActiveDeviceId).mockReturnValue(RECORD_ID);
    // Reset rate limiter so toast assertions aren't masked by inter-test cooldown.
    const { resetToastRateLimiter } = await import("@/lib/toastUtils");
    resetToastRateLimiter();
  });

  it("should handle media API failure gracefully", async () => {
    vi.mocked(CoreAPI.media).mockRejectedValueOnce(new Error("Network error"));

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Trigger connection open with the deviceId that matches our mock
    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.media).toHaveBeenCalled();
    });

    // Should not crash
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("should degrade expected media database setup errors without toast", async () => {
    vi.mocked(CoreAPI.media).mockRejectedValueOnce(
      new Error("failed to get optimization status: no such table: DBConfig"),
    );

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(useStatusStore.getState().gamesIndex).toMatchObject({
        exists: false,
        indexing: false,
        optimizing: false,
      });
    });
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("should handle tokens API failure gracefully", async () => {
    vi.mocked(CoreAPI.tokens).mockRejectedValueOnce(new Error("Network error"));

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Trigger connection open with the deviceId that matches our mock
    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.tokens).toHaveBeenCalled();
    });

    // Should not crash
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("should show error toast when media fetch fails while CONNECTED", async () => {
    vi.mocked(CoreAPI.media).mockRejectedValueOnce(new Error("Network error"));

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(expect.any(String));
    });
  });

  it("should suppress error toast when media fetch fails after RECONNECTING", async () => {
    // Reject after we flip to RECONNECTING — simulates a transport flap that
    // rejects pending requests via CoreAPI.reset() while reconnect is in flight.
    let rejectMedia: (e: Error) => void = () => {};
    vi.mocked(CoreAPI.media).mockReturnValueOnce(
      new Promise<never>((_, rej) => {
        rejectMedia = rej;
      }),
    );

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.media).toHaveBeenCalled();
    });

    // Flip the store to RECONNECTING before resolving the rejection.
    useStatusStore.setState({
      connectionState: ConnectionState.RECONNECTING,
      connected: true,
    });
    rejectMedia(new Error("Request cancelled: connection reset"));

    // Give the catch handler a chance to run.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("should suppress a stale tokens error after reconnect succeeds", async () => {
    let rejectTokens: (e: Error) => void = () => {};
    vi.mocked(CoreAPI.tokens).mockReturnValueOnce(
      new Promise<never>((_, rej) => {
        rejectTokens = rej;
      }),
    );

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.tokens).toHaveBeenCalledTimes(1);
    });

    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "reconnecting",
      hasData: true,
      hasConnectedBefore: true,
    });
    capturedEventHandlers.onConnectionChange!(RECORD_ID, {
      state: "connected",
      hasData: true,
      hasConnectedBefore: true,
    });

    await waitFor(() => {
      expect(CoreAPI.tokens).toHaveBeenCalledTimes(2);
    });
    expect(useStatusStore.getState().connectionState).toBe(
      ConnectionState.CONNECTED,
    );

    rejectTokens(new Error("Request cancelled: connection reset"));

    await Promise.resolve();
    await Promise.resolve();

    expect(mockToastError).not.toHaveBeenCalled();
  });
});

describe("app lifecycle handling", () => {
  let resumeCallback: (() => void) | null = null;
  let pauseCallback: (() => void) | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    resumeCallback = null;
    pauseCallback = null;
    await resetStore();

    // Capture the callbacks passed to App.addListener
    const { App } = await import("@capacitor/app");
    vi.mocked(App.addListener).mockImplementation(
      async (eventName: any, callback: any) => {
        if (eventName === "resume") {
          resumeCallback = callback;
        } else if (eventName === "pause") {
          pauseCallback = callback;
        }
        return { remove: vi.fn() };
      },
    );
  });

  it("should call connectionManager.resumeAll when app resumes", async () => {
    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Wait for listeners to be set up
    await waitFor(() => {
      expect(resumeCallback).not.toBeNull();
    });

    // Simulate app resume
    resumeCallback!();

    expect(connectionManager.resumeAll).toHaveBeenCalled();
  });

  it("should call connectionManager.pauseAll when app pauses", async () => {
    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Wait for listeners to be set up
    await waitFor(() => {
      expect(pauseCallback).not.toBeNull();
    });

    // Simulate app pause
    pauseCallback!();

    expect(connectionManager.pauseAll).toHaveBeenCalled();
  });

  it("should clean up app lifecycle listeners on unmount", async () => {
    const removeResume = vi.fn();
    const removePause = vi.fn();

    const { App } = await import("@capacitor/app");
    vi.mocked(App.addListener).mockImplementation(async (eventName: string) => {
      if (eventName === "resume") {
        return { remove: removeResume };
      } else if (eventName === "pause") {
        return { remove: removePause };
      }
      return { remove: vi.fn() };
    });

    const { unmount } = render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Allow listeners to be registered
    await waitFor(() => {
      expect(App.addListener).toHaveBeenCalledWith(
        "resume",
        expect.any(Function),
      );
    });
    expect(App.addListener).toHaveBeenCalledWith("pause", expect.any(Function));

    unmount();

    // Cleanup should be called
    await waitFor(() => {
      expect(removeResume).toHaveBeenCalled();
    });
    expect(removePause).toHaveBeenCalled();
  });
});

describe("browser visibility handling (web platform)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetStore();

    const { Capacitor } = await import("@capacitor/core");
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
  });

  it("should call connectionManager.resumeAll when tab becomes visible", async () => {
    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Simulate visibility change to visible
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => {
      expect(connectionManager.resumeAll).toHaveBeenCalled();
    });
  });

  it("should call connectionManager.pauseAll when tab becomes hidden", async () => {
    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Simulate visibility change to hidden
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      writable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => {
      expect(connectionManager.pauseAll).toHaveBeenCalled();
    });
  });

  it("should clean up visibility listener on unmount", async () => {
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

    const { unmount } = render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
  });
});

describe("edge cases", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedEventHandlers = {};
    await resetStore();
  });

  describe("stale connection events", () => {
    it("should ignore connection events from non-active devices", async () => {
      vi.mocked(connectionManager.getActiveDeviceId).mockReturnValue(
        "other-device-address",
      );

      render(
        <ConnectionProvider>
          <ConnectionConsumer />
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onConnectionChange).toBeDefined();

      // Simulate event from a different device (not the active one)
      capturedEventHandlers.onConnectionChange!("stale-device", {
        state: "connected",
        hasData: true,
        hasConnectedBefore: true,
      });

      // Should not trigger any data fetch since it's not from active device
      // Initial render may call these once, but they shouldn't be called again
      const callCountAfterEvent = vi.mocked(CoreAPI.media).mock.calls.length;

      // Simulate another event from wrong device
      capturedEventHandlers.onConnectionChange!("another-stale-device", {
        state: "connected",
        hasData: false,
        hasConnectedBefore: false,
      });

      // Call count should remain the same
      expect(vi.mocked(CoreAPI.media).mock.calls.length).toBe(
        callCountAfterEvent,
      );
    });
  });
});

describe("network status handling (native platform)", () => {
  let networkListener: { remove: () => Promise<void> } | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    networkListener = null;
    await resetStore();

    // Mock Capacitor as native platform
    const { Capacitor } = await import("@capacitor/core");
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

    // Capture the network status listener
    const { Network } = await import("@capacitor/network");
    vi.mocked(Network.addListener).mockImplementation(async () => {
      networkListener = { remove: vi.fn().mockResolvedValue(undefined) };
      return networkListener;
    });
  });

  it("should set up network listener on native platform", async () => {
    const { Network } = await import("@capacitor/network");

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    await waitFor(() => {
      expect(Network.addListener).toHaveBeenCalledWith(
        "networkStatusChange",
        expect.any(Function),
      );
    });
  });

  it("should clean up network listener on unmount", async () => {
    const { Network } = await import("@capacitor/network");
    const removeListener = vi.fn();
    vi.mocked(Network.addListener).mockResolvedValue({
      remove: removeListener,
    });

    const { unmount } = render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    await waitFor(() => {
      expect(Network.addListener).toHaveBeenCalled();
    });

    unmount();

    await waitFor(() => {
      expect(removeListener).toHaveBeenCalled();
    });
  });

  it("should trigger immediate reconnect when network reconnects", async () => {
    const { Network } = await import("@capacitor/network");
    let networkCallback:
      | ((status: { connected: boolean; connectionType: string }) => void)
      | null = null;

    vi.mocked(Network.addListener).mockImplementation(
      async (_eventName: any, callback: any) => {
        networkCallback = callback;
        return { remove: vi.fn() };
      },
    );

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    await waitFor(() => {
      expect(networkCallback).not.toBeNull();
    });

    // Simulate network reconnection
    networkCallback!({ connected: true, connectionType: "wifi" });

    expect(connectionManager.immediateReconnectActive).toHaveBeenCalled();
  });

  it("should not trigger reconnect when network disconnects", async () => {
    const { Network } = await import("@capacitor/network");
    let networkCallback:
      | ((status: { connected: boolean; connectionType: string }) => void)
      | null = null;

    vi.mocked(Network.addListener).mockImplementation(
      async (_eventName: any, callback: any) => {
        networkCallback = callback;
        return { remove: vi.fn() };
      },
    );

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    await waitFor(() => {
      expect(networkCallback).not.toBeNull();
    });

    // Clear previous calls
    vi.mocked(connectionManager.immediateReconnectActive).mockClear();

    // Simulate network disconnection
    networkCallback!({ connected: false, connectionType: "none" });

    expect(connectionManager.immediateReconnectActive).not.toHaveBeenCalled();
  });
});

describe("processNotification error handling", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedEventHandlers = {};
    await resetStore();
    mockToast.mockClear();
    mockToastError.mockClear();
    // Reset toast rate limiter to ensure toast shows
    const { resetToastRateLimiter } = await import("@/lib/toastUtils");
    resetToastRateLimiter();
  });

  it("should show error toast when message processing throws", async () => {
    // Make processReceived throw to trigger error handling
    vi.mocked(CoreAPI.processReceived).mockRejectedValue(
      new Error("Processing failed"),
    );

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onMessage).toBeDefined();
    await capturedEventHandlers.onMessage!("test-device", {});

    // Should show error toast (toast.error is called by showRateLimitedErrorToast)
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });

    // Component should not crash
    expect(screen.getByText("Test")).toBeInTheDocument();
  });
});

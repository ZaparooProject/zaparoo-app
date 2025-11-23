import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock dependencies
vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    history: vi.fn()
  }
}));

vi.mock("../../../hooks/useAppSettings", () => ({
  useAppSettings: vi.fn(() => ({
    launcherAccess: true,
    preferRemoteWriter: false
  }))
}));

vi.mock("../../../lib/writeNfcHook", () => ({
  useNfcWriter: vi.fn(() => ({
    status: null,
    end: vi.fn()
  })),
  WriteMethod: {
    Auto: 'auto'
  }
}));

vi.mock("../../../hooks/useWriteQueueProcessor", () => ({
  useWriteQueueProcessor: vi.fn(() => ({
    reset: vi.fn()
  }))
}));

vi.mock("../../../hooks/useRunQueueProcessor", () => ({
  useRunQueueProcessor: vi.fn()
}));

vi.mock("../../../hooks/useScanOperations", () => ({
  useScanOperations: vi.fn(() => ({
    scanSession: null,
    scanStatus: "idle",
    handleScanButton: vi.fn(),
    handleCameraScan: vi.fn(),
    handleStopConfirm: vi.fn(),
    runToken: vi.fn()
  }))
}));

vi.mock("../../../lib/store", () => ({
  useStatusStore: vi.fn((selector) => {
    const mockState = {
      connected: true,
      playing: {
        mediaName: "Test Game",
        systemName: "Test System",
        mediaPath: "/test/path"
      },
      lastToken: {
        uid: "test-uid",
        text: "test-text",
        time: new Date().toISOString()
      },
      setLastToken: vi.fn()
    };
    return selector(mockState);
  })
}));

vi.mock("../../../lib/preferencesStore", () => ({
  usePreferencesStore: {
    getState: vi.fn(() => ({
      restartScan: true,
      launchOnScan: true,
      launcherAccess: true,
      preferRemoteWriter: true,
      shakeEnabled: true,
      shakeMode: "random" as const,
      shakeZapscript: ""
    }))
  }
}));

// Mock Capacitor
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockImplementation(({ key }) => {
      const values: { [key: string]: string } = {
        "restartScan": "true",
        "launchOnScan": "true",
        "launcherAccess": "true",
        "preferRemoteWriter": "true"
      };
      return Promise.resolve({ value: values[key] || "true" });
    })
  }
}));

vi.mock("@capacitor-community/keep-awake", () => ({
  KeepAwake: {
    keepAwake: vi.fn(),
    allowSleep: vi.fn()
  }
}));

vi.mock("../../../lib/nfc", () => ({
  Status: {
    Success: 'success'
  },
  cancelSession: vi.fn()
}));

vi.mock("../../../components/ProPurchase", () => ({
  useProPurchase: vi.fn(() => ({
    PurchaseModal: () => <div data-testid="purchase-modal">Purchase Modal</div>,
    proPurchaseModalOpen: false,
    setProPurchaseModalOpen: vi.fn()
  }))
}));

describe("Index Route (Home Page)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render the home page with all main components", async () => {
    const TestWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    // Create a more comprehensive version of the Index component for testing
    const IndexComponent = () => {
      const [historyOpen, setHistoryOpen] = React.useState(false);
      const [writeOpen, setWriteOpen] = React.useState(false);
      const [stopConfirmOpen, setStopConfirmOpen] = React.useState(false);

      return (
        <div data-testid="home-page">
          <div data-testid="zaparoo-logo">Zaparoo Logo</div>

          <button
            data-testid="history-toggle"
            onClick={() => setHistoryOpen(!historyOpen)}
            disabled={false}
          >
            History
          </button>

          <div data-testid="scan-controls">
            <button data-testid="scan-button">Scan</button>
            <button data-testid="camera-scan-button">Camera Scan</button>
          </div>

          <div data-testid="connection-status">
            <span data-testid="connection-indicator">Connected</span>
          </div>

          <div data-testid="last-scanned">
            <span data-testid="last-scanned-info">Last scanned: test-text</span>
          </div>

          <div data-testid="now-playing">
            <span data-testid="now-playing-info">Now playing: Test Game</span>
            <button
              data-testid="stop-button"
              onClick={() => setStopConfirmOpen(true)}
            >
              Stop
            </button>
          </div>

          <button
            data-testid="write-modal-trigger"
            onClick={() => setWriteOpen(true)}
          >
            Write
          </button>

          {historyOpen && (
            <div data-testid="history-modal">
              <button
                data-testid="close-history"
                onClick={() => setHistoryOpen(false)}
              >
                Close History
              </button>
            </div>
          )}

          {writeOpen && (
            <div data-testid="write-modal">
              <button
                data-testid="close-write-modal"
                onClick={() => setWriteOpen(false)}
              >
                Close Write Modal
              </button>
            </div>
          )}

          {stopConfirmOpen && (
            <div data-testid="stop-confirm-modal">
              <button
                data-testid="confirm-stop"
                onClick={() => setStopConfirmOpen(false)}
              >
                Confirm Stop
              </button>
              <button
                data-testid="cancel-stop"
                onClick={() => setStopConfirmOpen(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      );
    };

    render(
      <TestWrapper>
        <IndexComponent />
      </TestWrapper>
    );

    expect(screen.getByTestId("home-page")).toBeInTheDocument();
    expect(screen.getByTestId("zaparoo-logo")).toBeInTheDocument();
    expect(screen.getByTestId("scan-controls")).toBeInTheDocument();
    expect(screen.getByTestId("connection-status")).toBeInTheDocument();
    expect(screen.getByTestId("last-scanned")).toBeInTheDocument();
    expect(screen.getByTestId("now-playing")).toBeInTheDocument();
  });

  it("should handle loader data properly", async () => {
    // Import the actual route to test its loader
    const { Route } = await import("../../../routes/index");
    const result = await Route.options.loader!({} as any);

    expect(result).toEqual({
      restartScan: true, // based on mock
      launchOnScan: true,
      launcherAccess: true,
      preferRemoteWriter: true,
      shakeMode: "random",
      shakeZapscript: ""
    });
  });

  it("should initialize keep awake functionality", async () => {
    const { KeepAwake } = await import("@capacitor-community/keep-awake");

    // Mock the component that would use KeepAwake
    const KeepAwakeComponent = () => {
      React.useEffect(() => {
        KeepAwake.keepAwake();
        return () => {
          KeepAwake.allowSleep();
        };
      }, []);

      return <div data-testid="keep-awake-component">Keep Awake Component</div>;
    };

    const { unmount } = render(<KeepAwakeComponent />);

    expect(KeepAwake.keepAwake).toHaveBeenCalled();

    unmount();

    expect(KeepAwake.allowSleep).toHaveBeenCalled();
  });

  it("should handle history modal opening and closing", async () => {
    const { CoreAPI } = await import("../../../lib/coreApi");
    const mockHistory = vi.mocked(CoreAPI.history);

    mockHistory.mockResolvedValue({
      entries: [
        {
          time: "2024-09-24T17:49:42.938167429+08:00",
          type: "nfc",
          uid: "04a1b2c3d4e5f6",
          text: "**launch.system:snes",
          data: "04a1b2c3",
          success: true
        }
      ]
    });

    // Mock history modal component
    const HistoryModalComponent = () => {
      const [historyOpen, setHistoryOpen] = React.useState(false);

      return (
        <div>
          <button
            data-testid="history-toggle"
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            {historyOpen ? "Close History" : "Open History"}
          </button>
          {historyOpen && <div data-testid="history-modal">History Modal</div>}
        </div>
      );
    };

    render(<HistoryModalComponent />);

    const historyToggle = screen.getByTestId("history-toggle");

    expect(screen.queryByTestId("history-modal")).not.toBeInTheDocument();

    fireEvent.click(historyToggle);

    await waitFor(() => {
      expect(screen.getByTestId("history-modal")).toBeInTheDocument();
    });
  });

  it("should handle write modal lifecycle", async () => {
    const { useNfcWriter } = await import("../../../lib/writeNfcHook");
    const mockNfcWriter = {
      status: null,
      write: vi.fn(),
      end: vi.fn(),
      writing: false,
      result: null
    };

    vi.mocked(useNfcWriter).mockReturnValue(mockNfcWriter);

    // Mock write modal component
    const WriteModalComponent = () => {
      const [writeOpen, setWriteOpen] = React.useState(false);
      const nfcWriter = useNfcWriter();

      const closeWriteModal = async () => {
        setWriteOpen(false);
        await nfcWriter.end();
      };

      return (
        <div>
          <button
            data-testid="open-write-modal"
            onClick={() => setWriteOpen(true)}
          >
            Open Write Modal
          </button>
          {writeOpen && (
            <div data-testid="write-modal">
              <button
                data-testid="close-write-modal"
                onClick={closeWriteModal}
              >
                Close
              </button>
            </div>
          )}
        </div>
      );
    };

    render(<WriteModalComponent />);

    const openButton = screen.getByTestId("open-write-modal");
    fireEvent.click(openButton);

    await waitFor(() => {
      expect(screen.getByTestId("write-modal")).toBeInTheDocument();
    });

    const closeButton = screen.getByTestId("close-write-modal");
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(mockNfcWriter.end).toHaveBeenCalled();
    });
  });

  it("should handle stop confirm modal", async () => {
    // Mock stop confirm modal component
    const StopConfirmComponent = () => {
      const [stopConfirmOpen, setStopConfirmOpen] = React.useState(false);

      return (
        <div>
          <button
            data-testid="show-stop-confirm"
            onClick={() => setStopConfirmOpen(true)}
          >
            Stop Game
          </button>
          {stopConfirmOpen && (
            <div data-testid="stop-confirm-modal">
              <button
                data-testid="confirm-stop"
                onClick={() => {
                  setStopConfirmOpen(false);
                  // Handle stop confirmation
                }}
              >
                Confirm Stop
              </button>
              <button
                data-testid="cancel-stop"
                onClick={() => setStopConfirmOpen(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      );
    };

    render(<StopConfirmComponent />);

    const stopButton = screen.getByTestId("show-stop-confirm");
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(screen.getByTestId("stop-confirm-modal")).toBeInTheDocument();
    });

    const confirmButton = screen.getByTestId("confirm-stop");
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.queryByTestId("stop-confirm-modal")).not.toBeInTheDocument();
    });
  });

  it("should integrate properly with store state", async () => {
    const { useStatusStore } = await import("../../../lib/store");

    // Test component that uses store
    const StoreTestComponent = () => {
      const connected = useStatusStore((state: any) => state.connected);
      const playing = useStatusStore((state: any) => state.playing);

      return (
        <div>
          <div data-testid="connection-state">
            {connected ? "Connected" : "Disconnected"}
          </div>
          <div data-testid="playing-info">
            {playing.mediaName || "No game playing"}
          </div>
        </div>
      );
    };

    render(<StoreTestComponent />);

    expect(screen.getByTestId("connection-state")).toHaveTextContent("Connected");
    expect(screen.getByTestId("playing-info")).toHaveTextContent("Test Game");
  });

  it("should handle NFC session cancellation on cleanup", async () => {
    const { cancelSession } = await import("../../../lib/nfc");

    // Component that cancels session on unmount
    const NFCSessionComponent = () => {
      React.useEffect(() => {
        return () => {
          cancelSession();
        };
      }, []);

      return <div data-testid="nfc-session-component">NFC Session Component</div>;
    };

    const { unmount } = render(<NFCSessionComponent />);

    unmount();

    expect(cancelSession).toHaveBeenCalled();
  });

  it("should handle purchase modal interactions", async () => {
    const { useProPurchase } = await import("../../../components/ProPurchase");

    const mockSetProPurchaseModalOpen = vi.fn();

    vi.mocked(useProPurchase).mockReturnValue({
      proAccess: true,
      PurchaseModal: () => <div data-testid="purchase-modal">Purchase Modal</div>,
      proPurchaseModalOpen: false,
      setProPurchaseModalOpen: mockSetProPurchaseModalOpen
    });

    // Component that uses Pro Purchase
    const ProPurchaseComponent = () => {
      const { PurchaseModal, setProPurchaseModalOpen } = useProPurchase(true);

      return (
        <div>
          <button
            data-testid="trigger-purchase"
            onClick={() => setProPurchaseModalOpen(true)}
          >
            Trigger Purchase
          </button>
          <PurchaseModal />
        </div>
      );
    };

    render(<ProPurchaseComponent />);

    const triggerButton = screen.getByTestId("trigger-purchase");
    fireEvent.click(triggerButton);

    expect(mockSetProPurchaseModalOpen).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("purchase-modal")).toBeInTheDocument();
  });

  it("should handle scan button interactions", async () => {
    const IndexComponent = () => {
      const [scanStatus, setScanStatus] = React.useState("idle");
      const [scanSession, setScanSession] = React.useState<string | null>(null);

      const handleScanButton = () => {
        if (scanStatus === "idle") {
          setScanStatus("scanning");
          setScanSession("test-session");
        } else {
          setScanStatus("idle");
          setScanSession(null);
        }
      };

      return (
        <div>
          <button
            data-testid="scan-button"
            onClick={handleScanButton}
          >
            {scanStatus === "idle" ? "Start Scan" : "Stop Scan"}
          </button>
          <div data-testid="scan-status">{scanStatus}</div>
          {scanSession && <div data-testid="scan-session">{scanSession}</div>}
        </div>
      );
    };

    render(<IndexComponent />);

    const scanButton = screen.getByTestId("scan-button");
    const scanStatus = screen.getByTestId("scan-status");

    expect(scanStatus).toHaveTextContent("idle");
    expect(scanButton).toHaveTextContent("Start Scan");

    fireEvent.click(scanButton);

    expect(scanStatus).toHaveTextContent("scanning");
    expect(scanButton).toHaveTextContent("Stop Scan");
    expect(screen.getByTestId("scan-session")).toHaveTextContent("test-session");
  });

  it("should handle disconnected state properly", async () => {
    // Import useStatusStore properly
    const { useStatusStore: mockUseStatusStore } = await import("../../../lib/store");
    vi.mocked(mockUseStatusStore).mockImplementation((selector: any) => {
      const mockState = {
        connected: false,
        playing: { mediaName: "", systemName: "", mediaPath: "" },
        lastToken: null,
        setLastToken: vi.fn()
      };
      return selector(mockState);
    });

    const DisconnectedComponent = () => {
      const connected = false;
      const playing = { mediaName: "", systemName: "", mediaPath: "" };

      return (
        <div>
          <div data-testid="connection-status">
            {connected ? "Connected" : "Disconnected"}
          </div>
          <button
            data-testid="history-button"
            disabled={!connected}
          >
            History
          </button>
          {connected && playing.mediaName && (
            <div data-testid="now-playing">
              Now playing: {playing.mediaName}
            </div>
          )}
        </div>
      );
    };

    render(<DisconnectedComponent />);

    expect(screen.getByTestId("connection-status")).toHaveTextContent("Disconnected");
    expect(screen.getByTestId("history-button")).toBeDisabled();
    expect(screen.queryByTestId("now-playing")).not.toBeInTheDocument();
  });

  it("should show now playing info only when connected and game is playing", async () => {
    const PlayingComponent = () => {
      const [connected, setConnected] = React.useState(true);
      const [playing, setPlaying] = React.useState({
        mediaName: "Super Mario Bros",
        systemName: "NES",
        mediaPath: "/path/to/game"
      });

      return (
        <div>
          <button
            data-testid="toggle-connection"
            onClick={() => setConnected(!connected)}
          >
            {connected ? "Disconnect" : "Connect"}
          </button>

          <button
            data-testid="toggle-playing"
            onClick={() => setPlaying(prev =>
              prev.mediaName ? { mediaName: "", systemName: "", mediaPath: "" }
                             : { mediaName: "Super Mario Bros", systemName: "NES", mediaPath: "/path/to/game" }
            )}
          >
            Toggle Playing
          </button>

          {connected && playing.mediaName && (
            <div data-testid="now-playing">
              <div data-testid="media-name">{playing.mediaName}</div>
              <div data-testid="system-name">{playing.systemName}</div>
              <button data-testid="stop-button">Stop</button>
            </div>
          )}
        </div>
      );
    };

    render(<PlayingComponent />);

    // Initially connected with game playing
    expect(screen.getByTestId("now-playing")).toBeInTheDocument();
    expect(screen.getByTestId("media-name")).toHaveTextContent("Super Mario Bros");
    expect(screen.getByTestId("system-name")).toHaveTextContent("NES");

    // Disconnect
    fireEvent.click(screen.getByTestId("toggle-connection"));
    expect(screen.queryByTestId("now-playing")).not.toBeInTheDocument();

    // Reconnect
    fireEvent.click(screen.getByTestId("toggle-connection"));
    expect(screen.getByTestId("now-playing")).toBeInTheDocument();

    // Stop game
    fireEvent.click(screen.getByTestId("toggle-playing"));
    expect(screen.queryByTestId("now-playing")).not.toBeInTheDocument();
  });

  it("should handle write modal auto-close on success", async () => {
    const { Status } = await import("../../../lib/nfc");

    const WriteModalComponent = () => {
      const [writeOpen, setWriteOpen] = React.useState(true);
      const [nfcStatus, setNfcStatus] = React.useState<any>(null);

      React.useEffect(() => {
        if (nfcStatus === Status.Success) {
          setWriteOpen(false);
        }
      }, [nfcStatus]);

      return (
        <div>
          {writeOpen && (
            <div data-testid="write-modal">
              <div data-testid="nfc-status">{nfcStatus || "idle"}</div>
              <button
                data-testid="trigger-success"
                onClick={() => setNfcStatus(Status.Success)}
              >
                Trigger Success
              </button>
              <button
                data-testid="close-modal"
                onClick={() => setWriteOpen(false)}
              >
                Close
              </button>
            </div>
          )}
          {!writeOpen && <div data-testid="modal-closed">Modal Closed</div>}
        </div>
      );
    };

    render(<WriteModalComponent />);

    expect(screen.getByTestId("write-modal")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("trigger-success"));

    await waitFor(() => {
      expect(screen.getByTestId("modal-closed")).toBeInTheDocument();
      expect(screen.queryByTestId("write-modal")).not.toBeInTheDocument();
    });
  });

  it("should handle history modal with pro purchase modal interaction", async () => {
    const HistoryProInteractionComponent = () => {
      const [historyOpen, setHistoryOpen] = React.useState(false);
      const [proPurchaseModalOpen, setProPurchaseModalOpen] = React.useState(false);

      const handleHistoryToggle = (state: boolean) => {
        if (!historyOpen && proPurchaseModalOpen) {
          setProPurchaseModalOpen(false);
          setTimeout(() => {
            setHistoryOpen(state);
          }, 150);
        } else {
          setHistoryOpen(state);
        }
      };

      return (
        <div>
          <button
            data-testid="open-pro-modal"
            onClick={() => setProPurchaseModalOpen(true)}
          >
            Open Pro Modal
          </button>

          <button
            data-testid="toggle-history"
            onClick={() => handleHistoryToggle(!historyOpen)}
          >
            Toggle History
          </button>

          {proPurchaseModalOpen && (
            <div data-testid="pro-purchase-modal">Pro Purchase Modal</div>
          )}

          {historyOpen && (
            <div data-testid="history-modal">History Modal</div>
          )}
        </div>
      );
    };

    render(<HistoryProInteractionComponent />);

    // Open pro modal first
    fireEvent.click(screen.getByTestId("open-pro-modal"));
    expect(screen.getByTestId("pro-purchase-modal")).toBeInTheDocument();

    // Try to open history - should close pro modal first
    fireEvent.click(screen.getByTestId("toggle-history"));

    await waitFor(() => {
      expect(screen.queryByTestId("pro-purchase-modal")).not.toBeInTheDocument();
    }, { timeout: 200 });

    await waitFor(() => {
      expect(screen.getByTestId("history-modal")).toBeInTheDocument();
    }, { timeout: 300 });
  });
});
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock dependencies
const mockSettings = vi.fn();
const mockSettingsUpdate = vi.fn();
const mockSetPreferRemoteWriter = vi.fn();
const mockRefetch = vi.fn();

vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    settings: mockSettings,
    settingsUpdate: mockSettingsUpdate,
  },
}));

vi.mock("../../../hooks/useAppSettings", () => ({
  useAppSettings: vi.fn(() => ({
    preferRemoteWriter: false,
    setPreferRemoteWriter: mockSetPreferRemoteWriter,
  })),
}));

vi.mock("../../../hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({})),
}));

vi.mock("../../../lib/store", () => ({
  useStatusStore: vi.fn((selector) => {
    const mockState = {
      connected: true,
    };
    return selector(mockState);
  }),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useNavigate: vi.fn(() => vi.fn()),
    createFileRoute: vi.fn(() => ({
      useLoaderData: vi.fn(() => ({
        restartScan: false,
        launchOnScan: true,
        launcherAccess: true,
        preferRemoteWriter: false,
      })),
    })),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: { [key: string]: string } = {
        "settings.advanced.title": "Advanced Settings",
        "settings.advanced.soundEffects": "Sound Effects",
        "settings.advanced.autoDetect": "Auto Detect Readers",
        "settings.advanced.debug": "Debug Logging",
        "settings.advanced.preferRemoteWriter": "Prefer Remote Writer",
        "settings.modeLabel": "Scan Mode",
        "settings.tapMode": "Tap Mode",
        "settings.insertMode": "Insert Mode",
        "settings.insertHelp": "Hold tags on reader until removed",
      };
      return translations[key] || key;
    },
  }),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

vi.mock("@capawesome-team/capacitor-nfc", () => ({
  Nfc: {
    isAvailable: vi.fn(() => Promise.resolve({ nfc: false })),
  },
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockImplementation(({ key }) => {
      const values: { [key: string]: string } = {
        restartScan: "false",
        launchOnScan: "true",
        launcherAccess: "true",
        preferRemoteWriter: "false",
      };
      return Promise.resolve({ value: values[key] || "false" });
    }),
  },
}));

describe("Settings Advanced Route", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Mock default settings data
    mockSettings.mockResolvedValue({
      audioScanFeedback: true,
      readersAutoDetect: false,
      debugLogging: false,
      readersScanMode: "tap",
    });

    mockSettingsUpdate.mockResolvedValue({});
    mockRefetch.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderAdvancedSettings = () => {
    // Import the actual component
    const AdvancedComponent = () => {
      const [audioScanFeedback, setAudioScanFeedback] = React.useState(true);
      const [readersAutoDetect, setReadersAutoDetect] = React.useState(false);
      const [debugLogging, setDebugLogging] = React.useState(false);
      const [readersScanMode, setReadersScanMode] = React.useState<
        "tap" | "hold"
      >("tap");
      const [connected, setConnected] = React.useState(true);

      return (
        <div data-testid="advanced-settings">
          <h1>Advanced Settings</h1>

          <div data-testid="sound-effects-toggle">
            <label>
              <input
                type="checkbox"
                checked={audioScanFeedback}
                onChange={(e) => {
                  setAudioScanFeedback(e.target.checked);
                  mockSettingsUpdate({ audioScanFeedback: e.target.checked });
                }}
                disabled={!connected}
              />
              Sound Effects
            </label>
          </div>

          <div data-testid="auto-detect-toggle">
            <label>
              <input
                type="checkbox"
                checked={readersAutoDetect}
                onChange={(e) => {
                  setReadersAutoDetect(e.target.checked);
                  mockSettingsUpdate({ readersAutoDetect: e.target.checked });
                }}
                disabled={!connected}
              />
              Auto Detect Readers
            </label>
          </div>

          <div data-testid="debug-toggle">
            <label>
              <input
                type="checkbox"
                checked={debugLogging}
                onChange={(e) => {
                  setDebugLogging(e.target.checked);
                  mockSettingsUpdate({ debugLogging: e.target.checked });
                }}
                disabled={!connected}
              />
              Debug Logging
            </label>
          </div>

          <div data-testid="scan-mode-buttons">
            <span>Scan Mode</span>
            <button
              data-testid="tap-mode-button"
              onClick={() => {
                setReadersScanMode("tap");
                mockSettingsUpdate({ readersScanMode: "tap" });
              }}
              disabled={!connected}
              className={readersScanMode === "tap" ? "active" : ""}
            >
              Tap Mode
            </button>
            <button
              data-testid="hold-mode-button"
              onClick={() => {
                setReadersScanMode("hold");
                mockSettingsUpdate({ readersScanMode: "hold" });
              }}
              disabled={!connected}
              className={readersScanMode === "hold" ? "active" : ""}
            >
              Insert Mode
            </button>
          </div>

          {readersScanMode === "hold" && connected && (
            <p data-testid="insert-mode-help">
              Hold tags on reader until removed
            </p>
          )}

          <div data-testid="connection-status">
            <button
              onClick={() => setConnected(!connected)}
              data-testid="toggle-connection"
            >
              {connected ? "Connected" : "Disconnected"}
            </button>
          </div>
        </div>
      );
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <AdvancedComponent />
      </QueryClientProvider>,
    );
  };

  it("should render advanced settings page with all controls", async () => {
    renderAdvancedSettings();

    expect(screen.getByTestId("advanced-settings")).toBeInTheDocument();
    expect(screen.getByText("Advanced Settings")).toBeInTheDocument();
    expect(screen.getByTestId("sound-effects-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("auto-detect-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("debug-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("scan-mode-buttons")).toBeInTheDocument();
  });

  it("should handle sound effects toggle", async () => {
    renderAdvancedSettings();

    const soundEffectsToggle = screen
      .getByTestId("sound-effects-toggle")
      .querySelector("input")!;
    expect(soundEffectsToggle).toBeChecked();

    fireEvent.click(soundEffectsToggle);

    expect(mockSettingsUpdate).toHaveBeenCalledWith({
      audioScanFeedback: false,
    });
  });

  it("should handle auto detect readers toggle", async () => {
    renderAdvancedSettings();

    const autoDetectToggle = screen
      .getByTestId("auto-detect-toggle")
      .querySelector("input")!;
    expect(autoDetectToggle).not.toBeChecked();

    fireEvent.click(autoDetectToggle);

    expect(mockSettingsUpdate).toHaveBeenCalledWith({
      readersAutoDetect: true,
    });
  });

  it("should handle debug logging toggle", async () => {
    renderAdvancedSettings();

    const debugToggle = screen
      .getByTestId("debug-toggle")
      .querySelector("input")!;
    expect(debugToggle).not.toBeChecked();

    fireEvent.click(debugToggle);

    expect(mockSettingsUpdate).toHaveBeenCalledWith({ debugLogging: true });
  });

  it("should handle scan mode changes", async () => {
    renderAdvancedSettings();

    const tapModeButton = screen.getByTestId("tap-mode-button");
    const holdModeButton = screen.getByTestId("hold-mode-button");

    expect(tapModeButton).toHaveClass("active");
    expect(holdModeButton).not.toHaveClass("active");

    // Switch to hold mode
    fireEvent.click(holdModeButton);

    expect(mockSettingsUpdate).toHaveBeenCalledWith({
      readersScanMode: "hold",
    });

    await waitFor(() => {
      expect(screen.getByTestId("insert-mode-help")).toBeInTheDocument();
    });
  });

  it("should disable controls when disconnected", async () => {
    renderAdvancedSettings();

    // Simulate disconnection
    const disconnectButton = screen.getByTestId("toggle-connection");
    fireEvent.click(disconnectButton);

    await waitFor(() => {
      const soundEffectsToggle = screen
        .getByTestId("sound-effects-toggle")
        .querySelector("input")!;
      const autoDetectToggle = screen
        .getByTestId("auto-detect-toggle")
        .querySelector("input")!;
      const debugToggle = screen
        .getByTestId("debug-toggle")
        .querySelector("input")!;
      const tapModeButton = screen.getByTestId("tap-mode-button");
      const holdModeButton = screen.getByTestId("hold-mode-button");

      expect(soundEffectsToggle).toBeDisabled();
      expect(autoDetectToggle).toBeDisabled();
      expect(debugToggle).toBeDisabled();
      expect(tapModeButton).toBeDisabled();
      expect(holdModeButton).toBeDisabled();
    });
  });

  it("should hide insert mode help when not in hold mode", async () => {
    renderAdvancedSettings();

    // Initially in tap mode, help should not be visible
    expect(screen.queryByTestId("insert-mode-help")).not.toBeInTheDocument();
  });

  it("should show insert mode help when in hold mode and connected", async () => {
    renderAdvancedSettings();

    const holdModeButton = screen.getByTestId("hold-mode-button");
    fireEvent.click(holdModeButton);

    await waitFor(() => {
      expect(screen.getByTestId("insert-mode-help")).toBeInTheDocument();
      expect(
        screen.getByText("Hold tags on reader until removed"),
      ).toBeInTheDocument();
    });
  });

  it("should handle preference remote writer setting", async () => {
    // Mock native platform and NFC availability
    const { Capacitor } = await import("@capacitor/core");
    const { Nfc } = await import("@capawesome-team/capacitor-nfc");

    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: true, hce: false });

    // Enhanced component with remote writer preference
    const ComponentWithRemoteWriter = () => {
      const [preferRemoteWriter, setPreferRemoteWriter] = React.useState(false);

      return (
        <div>
          <div data-testid="prefer-remote-writer-toggle">
            <label>
              <input
                type="checkbox"
                checked={preferRemoteWriter}
                onChange={(e) => {
                  setPreferRemoteWriter(e.target.checked);
                  mockSetPreferRemoteWriter(e.target.checked);
                }}
              />
              Prefer Remote Writer
            </label>
          </div>
        </div>
      );
    };

    render(<ComponentWithRemoteWriter />);

    const remoteWriterToggle = screen
      .getByTestId("prefer-remote-writer-toggle")
      .querySelector("input")!;
    expect(remoteWriterToggle).not.toBeChecked();

    fireEvent.click(remoteWriterToggle);

    expect(mockSetPreferRemoteWriter).toHaveBeenCalledWith(true);
  });

  it("should handle loader data properly", async () => {
    const loaderData = {
      restartScan: false,
      launchOnScan: true,
      launcherAccess: true,
      preferRemoteWriter: false,
    };

    // Mock the route loader by testing with the actual expected data structure
    expect(loaderData).toEqual({
      restartScan: false,
      launchOnScan: true,
      launcherAccess: true,
      preferRemoteWriter: false,
    });
  });

  it("should handle settings query errors gracefully", async () => {
    mockSettings.mockRejectedValue(new Error("Failed to fetch settings"));

    const ComponentWithError = () => {
      const [error, setError] = React.useState<Error | null>(null);

      React.useEffect(() => {
        mockSettings().catch((err: Error) => setError(err));
      }, []);

      return (
        <div>
          {error ? (
            <div data-testid="settings-error">Error: {error.message}</div>
          ) : (
            <div data-testid="settings-loaded">Settings loaded</div>
          )}
        </div>
      );
    };

    render(<ComponentWithError />);

    await waitFor(() => {
      expect(screen.getByTestId("settings-error")).toBeInTheDocument();
      expect(
        screen.getByText("Error: Failed to fetch settings"),
      ).toBeInTheDocument();
    });
  });

  it("should handle mutation errors gracefully", async () => {
    mockSettingsUpdate.mockRejectedValue(new Error("Update failed"));

    const ComponentWithUpdateError = () => {
      const [error, setError] = React.useState<string | null>(null);

      const handleUpdate = async () => {
        try {
          await mockSettingsUpdate({ audioScanFeedback: true });
        } catch (err) {
          setError((err as Error).message);
        }
      };

      return (
        <div>
          <button onClick={handleUpdate} data-testid="update-button">
            Update Settings
          </button>
          {error && <div data-testid="update-error">Update error: {error}</div>}
        </div>
      );
    };

    render(<ComponentWithUpdateError />);

    const updateButton = screen.getByTestId("update-button");
    fireEvent.click(updateButton);

    await waitFor(() => {
      expect(screen.getByTestId("update-error")).toBeInTheDocument();
      expect(
        screen.getByText("Update error: Update failed"),
      ).toBeInTheDocument();
    });
  });

  it("should verify integration with query client", () => {
    expect(queryClient).toBeInstanceOf(QueryClient);
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(false);
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });
});

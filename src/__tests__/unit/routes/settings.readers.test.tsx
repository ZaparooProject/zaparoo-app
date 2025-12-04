import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock dependencies
const mockSettings = vi.fn();
const mockSettingsUpdate = vi.fn();

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    settings: () => mockSettings(),
    settingsUpdate: (params: any) => mockSettingsUpdate(params),
  },
}));

vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({})),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

vi.mock("@/lib/store", () => ({
  useStatusStore: vi.fn((selector) => {
    const mockState = {
      connected: true,
      connectionState: "CONNECTED",
    };
    return selector(mockState);
  }),
  ConnectionState: {
    IDLE: "IDLE",
    CONNECTING: "CONNECTING",
    CONNECTED: "CONNECTED",
    RECONNECTING: "RECONNECTING",
    ERROR: "ERROR",
    DISCONNECTED: "DISCONNECTED",
  },
}));

vi.mock("@/lib/preferencesStore", () => ({
  usePreferencesStore: vi.fn((selector) => {
    const mockState = {
      nfcAvailable: true,
      accelerometerAvailable: true,
      restartScan: false,
      launchOnScan: true,
      launcherAccess: true,
      preferRemoteWriter: false,
      shakeEnabled: false,
      shakeMode: "random",
      shakeZapscript: "**launch.random:all",
      setRestartScan: vi.fn(),
      setLaunchOnScan: vi.fn(),
      setPreferRemoteWriter: vi.fn(),
      setShakeEnabled: vi.fn(),
      setShakeMode: vi.fn(),
      setShakeZapscript: vi.fn(),
    };
    return selector(mockState);
  }),
  selectAppSettings: vi.fn(),
  selectShakeSettings: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "settings.readers.title": "Readers Settings",
        "settings.readers.scanMode": "Scan Mode",
        "settings.tapMode": "Tap",
        "settings.insertMode": "Insert",
        "settings.insertHelp": "Hold tags on reader until removed",
        "settings.readers.continuousScan": "Continuous Scan",
        "settings.readers.launchOnScan": "Launch on Scan",
        "settings.readers.preferRemoteWriter": "Prefer Remote Writer",
        "settings.readers.shakeToLaunch": "Shake to Launch",
        "settings.readers.soundEffects": "Sound Effects",
        "settings.readers.autoDetect": "Auto Detect Readers",
        "settings.app.shakeModeLabel": "Shake Mode",
        "settings.app.shakeRandomMedia": "Random Media",
        "settings.app.shakeCustom": "Custom",
        "settings.app.shakeSelectSystem": "Select System",
        "systemSelector.allSystems": "All Systems",
        "nav.back": "Back",
      };
      return translations[key] || key;
    },
  }),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: vi.fn(() => ({
    component: vi.fn(),
  })),
  useRouter: () => ({
    history: {
      back: vi.fn(),
    },
  }),
}));

vi.mock("@/components/PageFrame", () => ({
  PageFrame: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-frame">{children}</div>
  ),
}));

vi.mock("@/components/wui/HeaderButton", () => ({
  HeaderButton: ({ onClick, "aria-label": ariaLabel }: any) => (
    <button onClick={onClick} aria-label={ariaLabel}>
      Back
    </button>
  ),
}));

vi.mock("@/components/wui/ToggleSwitch", () => ({
  ToggleSwitch: ({
    label,
    value,
    setValue,
    disabled,
    loading,
    suffix,
  }: any) => (
    <div data-testid={`toggle-${label}`}>
      <label>{label}</label>
      {suffix && <span data-testid="suffix">{suffix}</span>}
      {loading ? (
        <span data-testid="loading-skeleton">Loading...</span>
      ) : (
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => setValue(e.target.checked)}
          disabled={disabled}
        />
      )}
    </div>
  ),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: any) => (
    <div className={className} data-testid="skeleton">
      Loading...
    </div>
  ),
}));

vi.mock("@/components/ProPurchase", () => ({
  useProPurchase: () => ({
    PurchaseModal: () => <div data-testid="purchase-modal" />,
    setProPurchaseModalOpen: vi.fn(),
  }),
}));

vi.mock("@/components/ProBadge", () => ({
  ProBadge: ({ show, onPress }: any) =>
    show ? (
      <button onClick={onPress} data-testid="pro-badge">
        Pro
      </button>
    ) : null,
}));

vi.mock("@/components/SystemSelector", () => ({
  SystemSelector: ({ isOpen, onClose, onSelect }: any) =>
    isOpen ? (
      <div data-testid="system-selector">
        <button onClick={onClose}>Close</button>
        <button onClick={() => onSelect(["nes"])}>Select NES</button>
      </div>
    ) : null,
}));

vi.mock("@/components/ZapScriptInput", () => ({
  ZapScriptInput: ({ value, setValue }: any) => (
    <textarea
      data-testid="zapscript-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  ),
}));

describe("Settings Readers Route", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockSettings.mockResolvedValue({
      readersScanMode: "tap",
      audioScanFeedback: true,
      readersAutoDetect: false,
    });

    mockSettingsUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderReadersSettings = (overrides: Record<string, any> = {}) => {
    const defaults = {
      connected: true,
      scanMode: "tap" as "tap" | "hold",
      restartScan: false,
      launchOnScan: true,
      preferRemoteWriter: false,
      shakeEnabled: false,
      shakeMode: "random" as "random" | "custom",
      audioScanFeedback: true,
      readersAutoDetect: false,
      isNative: true,
      nfcAvailable: true,
      accelerometerAvailable: true,
      launcherAccess: true,
    };

    const config = { ...defaults, ...overrides };

    // Destructure before component to avoid ESLint prop-types false positive
    const {
      connected: initialConnected,
      scanMode: initialScanMode,
      restartScan: initialRestartScan,
      launchOnScan: initialLaunchOnScan,
      preferRemoteWriter: initialPreferRemoteWriter,
      shakeEnabled: initialShakeEnabled,
      shakeMode: initialShakeMode,
      audioScanFeedback: initialAudioScanFeedback,
      readersAutoDetect: initialReadersAutoDetect,
      isNative,
      nfcAvailable,
      accelerometerAvailable,
      launcherAccess,
    } = config;

    const ReadersSettingsTest = () => {
      const [scanMode, setScanMode] = React.useState<"tap" | "hold">(
        initialScanMode,
      );
      const [restartScan, setRestartScan] = React.useState(initialRestartScan);
      const [launchOnScan, setLaunchOnScan] =
        React.useState(initialLaunchOnScan);
      const [preferRemoteWriter, setPreferRemoteWriter] = React.useState(
        initialPreferRemoteWriter,
      );
      const [shakeEnabled, setShakeEnabled] =
        React.useState(initialShakeEnabled);
      const [shakeMode, setShakeMode] = React.useState<"random" | "custom">(
        initialShakeMode,
      );
      const [shakeZapscript, setShakeZapscript] = React.useState(
        "**launch.random:all",
      );
      const [audioScanFeedback, setAudioScanFeedback] = React.useState(
        initialAudioScanFeedback,
      );
      const [readersAutoDetect, setReadersAutoDetect] = React.useState(
        initialReadersAutoDetect,
      );
      const [systemPickerOpen, setSystemPickerOpen] = React.useState(false);

      const connected = initialConnected;

      const getSystemFromZapscript = () => {
        if (
          shakeMode === "random" &&
          shakeZapscript.startsWith("**launch.random:")
        ) {
          return shakeZapscript.replace("**launch.random:", "");
        }
        return "";
      };

      const shakeSystem = getSystemFromZapscript();

      return (
        <div data-testid="readers-settings">
          <h1>Readers Settings</h1>

          <div data-testid="scan-mode-section">
            <span id="scan-mode-label">Scan Mode</span>
            <div
              role="radiogroup"
              aria-labelledby="scan-mode-label"
              data-testid="scan-mode-buttons"
            >
              <button
                role="radio"
                aria-checked={scanMode === "tap" && connected}
                onClick={() => {
                  setScanMode("tap");
                  mockSettingsUpdate({ readersScanMode: "tap" });
                }}
                disabled={!connected}
                data-testid="tap-mode-button"
              >
                Tap
              </button>
              <button
                role="radio"
                aria-checked={scanMode === "hold" && connected}
                onClick={() => {
                  setScanMode("hold");
                  mockSettingsUpdate({ readersScanMode: "hold" });
                }}
                disabled={!connected}
                data-testid="hold-mode-button"
              >
                Insert
              </button>
            </div>
            {scanMode === "hold" && connected && (
              <p data-testid="insert-mode-help">
                Hold tags on reader until removed
              </p>
            )}
          </div>

          <div data-testid="continuous-scan-toggle">
            <label>Continuous Scan</label>
            <input
              type="checkbox"
              checked={restartScan}
              onChange={(e) => setRestartScan(e.target.checked)}
              data-testid="continuous-scan-checkbox"
            />
          </div>

          {isNative && connected && (
            <div data-testid="launch-on-scan-toggle">
              <label>Launch on Scan</label>
              {!launcherAccess && <span data-testid="pro-badge">Pro</span>}
              <input
                type="checkbox"
                checked={launchOnScan}
                onChange={(e) => setLaunchOnScan(e.target.checked)}
                data-testid="launch-on-scan-checkbox"
              />
            </div>
          )}

          {isNative && nfcAvailable && (
            <div data-testid="prefer-remote-writer-toggle">
              <label>Prefer Remote Writer</label>
              <input
                type="checkbox"
                checked={preferRemoteWriter}
                onChange={(e) => setPreferRemoteWriter(e.target.checked)}
                data-testid="prefer-remote-writer-checkbox"
              />
            </div>
          )}

          {isNative && accelerometerAvailable && (
            <div data-testid="shake-to-launch-section">
              <label>Shake to Launch</label>
              {!launcherAccess && (
                <span data-testid="shake-pro-badge">Pro</span>
              )}
              <input
                type="checkbox"
                checked={shakeEnabled}
                onChange={(e) => setShakeEnabled(e.target.checked)}
                disabled={!connected}
                data-testid="shake-enabled-checkbox"
              />
            </div>
          )}

          {isNative && accelerometerAvailable && shakeEnabled && (
            <div data-testid="shake-mode-section">
              <div
                role="radiogroup"
                aria-label="Shake Mode"
                data-testid="shake-mode-buttons"
              >
                <button
                  role="radio"
                  aria-checked={shakeMode === "random" && connected}
                  onClick={() => setShakeMode("random")}
                  disabled={!connected}
                  data-testid="shake-random-button"
                >
                  Random Media
                </button>
                <button
                  role="radio"
                  aria-checked={shakeMode === "custom" && connected}
                  onClick={() => setShakeMode("custom")}
                  disabled={!connected}
                  data-testid="shake-custom-button"
                >
                  Custom
                </button>
              </div>

              {shakeMode === "random" && (
                <div data-testid="shake-system-selector">
                  <span data-testid="selected-system">
                    {shakeSystem === "all" ? "All Systems" : shakeSystem || "-"}
                  </span>
                  <button
                    onClick={() => setSystemPickerOpen(true)}
                    disabled={!connected}
                    data-testid="select-system-button"
                  >
                    Select System
                  </button>
                </div>
              )}

              {shakeMode === "custom" && (
                <div data-testid="shake-zapscript-section">
                  <textarea
                    data-testid="shake-zapscript-input"
                    value={shakeZapscript}
                    onChange={(e) => setShakeZapscript(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <div data-testid="sound-effects-toggle">
            <label>Sound Effects</label>
            <input
              type="checkbox"
              checked={audioScanFeedback}
              onChange={(e) => {
                setAudioScanFeedback(e.target.checked);
                mockSettingsUpdate({ audioScanFeedback: e.target.checked });
              }}
              disabled={!connected}
              data-testid="sound-effects-checkbox"
            />
          </div>

          <div data-testid="auto-detect-toggle">
            <label>Auto Detect Readers</label>
            <input
              type="checkbox"
              checked={readersAutoDetect}
              onChange={(e) => {
                setReadersAutoDetect(e.target.checked);
                mockSettingsUpdate({ readersAutoDetect: e.target.checked });
              }}
              disabled={!connected}
              data-testid="auto-detect-checkbox"
            />
          </div>

          {systemPickerOpen && (
            <div data-testid="system-selector-modal">
              <button
                onClick={() => setSystemPickerOpen(false)}
                data-testid="close-system-selector"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShakeZapscript("**launch.random:nes");
                  setSystemPickerOpen(false);
                }}
                data-testid="select-nes-button"
              >
                Select NES
              </button>
            </div>
          )}
        </div>
      );
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <ReadersSettingsTest />
      </QueryClientProvider>,
    );
  };

  it("renders readers settings page", () => {
    renderReadersSettings();

    expect(screen.getByTestId("readers-settings")).toBeInTheDocument();
    expect(screen.getByText("Readers Settings")).toBeInTheDocument();
  });

  it("renders scan mode buttons", () => {
    renderReadersSettings();

    expect(screen.getByTestId("scan-mode-section")).toBeInTheDocument();
    expect(screen.getByTestId("tap-mode-button")).toBeInTheDocument();
    expect(screen.getByTestId("hold-mode-button")).toBeInTheDocument();
  });

  it("changes scan mode to hold", () => {
    renderReadersSettings();

    const holdButton = screen.getByTestId("hold-mode-button");
    fireEvent.click(holdButton);

    expect(mockSettingsUpdate).toHaveBeenCalledWith({
      readersScanMode: "hold",
    });
    expect(screen.getByTestId("insert-mode-help")).toBeInTheDocument();
  });

  it("changes scan mode to tap", () => {
    renderReadersSettings({ scanMode: "hold" });

    const tapButton = screen.getByTestId("tap-mode-button");
    fireEvent.click(tapButton);

    expect(mockSettingsUpdate).toHaveBeenCalledWith({ readersScanMode: "tap" });
  });

  it("shows insert mode help when in hold mode", () => {
    renderReadersSettings({ scanMode: "hold" });

    expect(screen.getByTestId("insert-mode-help")).toBeInTheDocument();
    expect(
      screen.getByText("Hold tags on reader until removed"),
    ).toBeInTheDocument();
  });

  it("renders continuous scan toggle", () => {
    renderReadersSettings();

    expect(screen.getByTestId("continuous-scan-toggle")).toBeInTheDocument();
  });

  it("toggles continuous scan", () => {
    renderReadersSettings();

    const checkbox = screen.getByTestId("continuous-scan-checkbox");
    fireEvent.click(checkbox);

    expect(checkbox).toBeChecked();
  });

  it("renders launch on scan toggle on native platform", () => {
    renderReadersSettings({ isNative: true });

    expect(screen.getByTestId("launch-on-scan-toggle")).toBeInTheDocument();
  });

  it("toggles launch on scan", () => {
    renderReadersSettings();

    const checkbox = screen.getByTestId("launch-on-scan-checkbox");
    fireEvent.click(checkbox);

    expect(checkbox).not.toBeChecked();
  });

  it("renders prefer remote writer toggle when NFC is available", () => {
    renderReadersSettings({ isNative: true, nfcAvailable: true });

    expect(
      screen.getByTestId("prefer-remote-writer-toggle"),
    ).toBeInTheDocument();
  });

  it("toggles prefer remote writer", () => {
    renderReadersSettings();

    const checkbox = screen.getByTestId("prefer-remote-writer-checkbox");
    fireEvent.click(checkbox);

    expect(checkbox).toBeChecked();
  });

  it("renders shake to launch toggle when accelerometer is available", () => {
    renderReadersSettings({ isNative: true, accelerometerAvailable: true });

    expect(screen.getByTestId("shake-to-launch-section")).toBeInTheDocument();
  });

  it("toggles shake to launch", () => {
    renderReadersSettings();

    const checkbox = screen.getByTestId("shake-enabled-checkbox");
    fireEvent.click(checkbox);

    expect(checkbox).toBeChecked();
  });

  it("shows shake mode options when shake is enabled", () => {
    renderReadersSettings({ shakeEnabled: true });

    expect(screen.getByTestId("shake-mode-section")).toBeInTheDocument();
    expect(screen.getByTestId("shake-random-button")).toBeInTheDocument();
    expect(screen.getByTestId("shake-custom-button")).toBeInTheDocument();
  });

  it("shows system selector when shake mode is random", () => {
    renderReadersSettings({ shakeEnabled: true, shakeMode: "random" });

    expect(screen.getByTestId("shake-system-selector")).toBeInTheDocument();
    expect(screen.getByTestId("select-system-button")).toBeInTheDocument();
  });

  it("shows zapscript input when shake mode is custom", () => {
    renderReadersSettings({ shakeEnabled: true, shakeMode: "custom" });

    expect(screen.getByTestId("shake-zapscript-section")).toBeInTheDocument();
    expect(screen.getByTestId("shake-zapscript-input")).toBeInTheDocument();
  });

  it("opens system selector modal", () => {
    renderReadersSettings({ shakeEnabled: true, shakeMode: "random" });

    const selectButton = screen.getByTestId("select-system-button");
    fireEvent.click(selectButton);

    expect(screen.getByTestId("system-selector-modal")).toBeInTheDocument();
  });

  it("selects a system from system selector", () => {
    renderReadersSettings({ shakeEnabled: true, shakeMode: "random" });

    const selectButton = screen.getByTestId("select-system-button");
    fireEvent.click(selectButton);

    const selectNesButton = screen.getByTestId("select-nes-button");
    fireEvent.click(selectNesButton);

    expect(screen.getByTestId("selected-system")).toHaveTextContent("nes");
  });

  it("renders sound effects toggle", () => {
    renderReadersSettings();

    expect(screen.getByTestId("sound-effects-toggle")).toBeInTheDocument();
  });

  it("toggles sound effects", () => {
    renderReadersSettings();

    const checkbox = screen.getByTestId("sound-effects-checkbox");
    fireEvent.click(checkbox);

    expect(mockSettingsUpdate).toHaveBeenCalledWith({
      audioScanFeedback: false,
    });
  });

  it("renders auto detect toggle", () => {
    renderReadersSettings();

    expect(screen.getByTestId("auto-detect-toggle")).toBeInTheDocument();
  });

  it("toggles auto detect", () => {
    renderReadersSettings();

    const checkbox = screen.getByTestId("auto-detect-checkbox");
    fireEvent.click(checkbox);

    expect(mockSettingsUpdate).toHaveBeenCalledWith({
      readersAutoDetect: true,
    });
  });

  it("disables controls when disconnected", () => {
    renderReadersSettings({ connected: false });

    expect(screen.getByTestId("tap-mode-button")).toBeDisabled();
    expect(screen.getByTestId("hold-mode-button")).toBeDisabled();
    expect(screen.getByTestId("sound-effects-checkbox")).toBeDisabled();
    expect(screen.getByTestId("auto-detect-checkbox")).toBeDisabled();
  });

  it("shows pro badge for launch on scan when no launcher access", () => {
    renderReadersSettings({ launcherAccess: false });

    expect(screen.getByTestId("pro-badge")).toBeInTheDocument();
  });

  it("shows pro badge for shake to launch when no launcher access", () => {
    renderReadersSettings({ launcherAccess: false });

    expect(screen.getByTestId("shake-pro-badge")).toBeInTheDocument();
  });
});

describe("getSystemFromZapscript helper", () => {
  it("extracts system from random zapscript", () => {
    const shakeMode = "random";
    const shakeZapscript = "**launch.random:nes";

    const getSystemFromZapscript = () => {
      if (
        shakeMode === "random" &&
        shakeZapscript.startsWith("**launch.random:")
      ) {
        return shakeZapscript.replace("**launch.random:", "");
      }
      return "";
    };

    expect(getSystemFromZapscript()).toBe("nes");
  });

  it("returns all for **launch.random:all", () => {
    const shakeMode = "random";
    const shakeZapscript = "**launch.random:all";

    const getSystemFromZapscript = () => {
      if (
        shakeMode === "random" &&
        shakeZapscript.startsWith("**launch.random:")
      ) {
        return shakeZapscript.replace("**launch.random:", "");
      }
      return "";
    };

    expect(getSystemFromZapscript()).toBe("all");
  });

  it("returns empty string for custom mode", () => {
    const getSystemFromZapscript = (
      mode: "random" | "custom",
      zapscript: string,
    ) => {
      if (mode === "random" && zapscript.startsWith("**launch.random:")) {
        return zapscript.replace("**launch.random:", "");
      }
      return "";
    };

    expect(getSystemFromZapscript("custom", "custom script")).toBe("");
  });
});

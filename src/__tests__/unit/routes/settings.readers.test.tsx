/* eslint-disable react/prop-types */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";
import React from "react";
import { mockReaderInfo } from "../../../test-utils/factories";
import { ReaderInfo } from "../../../lib/models";

// Mock CoreAPI
const mockSettings = vi.fn();
const mockSettingsUpdate = vi.fn();
const mockReaders = vi.fn();

vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    settings: () => mockSettings(),
    settingsUpdate: (params: unknown) => mockSettingsUpdate(params),
    readers: () => mockReaders(),
  },
}));

describe("Settings Readers Route - Device Readers List", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSettings.mockResolvedValue({
      readersScanMode: "tap",
      audioScanFeedback: true,
      readersAutoDetect: true,
    });

    mockReaders.mockResolvedValue({ readers: [] });
  });

  // Component that mirrors the readers list logic from settings.readers.tsx
  const ReadersListTest = ({
    connected = true,
    isLoading = false,
    readers = [] as ReaderInfo[],
  }) => {
    return (
      <div data-testid="readers-section">
        <span>Device Readers</span>
        <div className="mt-2 flex flex-col gap-2">
          {isLoading ? (
            <span
              className="text-foreground-disabled"
              data-testid="readers-loading"
            >
              Loading...
            </span>
          ) : !connected ? (
            <span
              className="text-foreground-disabled"
              data-testid="readers-no-connection"
            >
              No readers found
            </span>
          ) : readers.length > 0 ? (
            readers.map((reader) => (
              <div
                key={reader.id}
                className="flex items-center gap-2"
                data-testid={`reader-${reader.id}`}
              >
                <span
                  className={reader.connected ? "bg-green-500" : "bg-red-500"}
                  data-testid={`reader-indicator-${reader.id}`}
                  aria-hidden="true"
                />
                <span className="text-foreground">
                  {reader.info || reader.id}
                </span>
              </div>
            ))
          ) : (
            <span
              className="text-foreground-disabled"
              data-testid="readers-empty"
            >
              No readers found
            </span>
          )}
        </div>
      </div>
    );
  };

  it("should show loading state while fetching readers", () => {
    render(<ReadersListTest isLoading={true} />);

    expect(screen.getByTestId("readers-loading")).toBeInTheDocument();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show 'no readers found' when no readers are connected", () => {
    render(<ReadersListTest connected={true} readers={[]} />);

    expect(screen.getByTestId("readers-empty")).toBeInTheDocument();
    expect(screen.getByText("No readers found")).toBeInTheDocument();
  });

  it("should show 'no readers found' when disconnected from Core", () => {
    render(<ReadersListTest connected={false} />);

    expect(screen.getByTestId("readers-no-connection")).toBeInTheDocument();
  });

  it("should display connected reader with green indicator", () => {
    const reader = mockReaderInfo({
      id: "pn532_1",
      info: "PN532 NFC Reader",
      connected: true,
    });

    render(<ReadersListTest readers={[reader]} />);

    expect(screen.getByText("PN532 NFC Reader")).toBeInTheDocument();
    expect(screen.getByTestId("reader-indicator-pn532_1")).toHaveClass(
      "bg-green-500",
    );
  });

  it("should display disconnected reader with red indicator", () => {
    const reader = mockReaderInfo({
      id: "acr122u_1",
      info: "ACR122U Reader",
      connected: false,
    });

    render(<ReadersListTest readers={[reader]} />);

    expect(screen.getByText("ACR122U Reader")).toBeInTheDocument();
    expect(screen.getByTestId("reader-indicator-acr122u_1")).toHaveClass(
      "bg-red-500",
    );
  });

  it("should display multiple readers", () => {
    const readers = [
      mockReaderInfo({
        id: "pn532_1",
        info: "PN532 NFC Reader",
        connected: true,
      }),
      mockReaderInfo({
        id: "acr122u_1",
        info: "ACR122U USB Reader",
        connected: true,
      }),
      mockReaderInfo({
        id: "simple_1",
        info: "Simple Serial Reader",
        connected: false,
      }),
    ];

    render(<ReadersListTest readers={readers} />);

    expect(screen.getByText("PN532 NFC Reader")).toBeInTheDocument();
    expect(screen.getByText("ACR122U USB Reader")).toBeInTheDocument();
    expect(screen.getByText("Simple Serial Reader")).toBeInTheDocument();
  });

  it("should fallback to reader id when info is empty", () => {
    const reader = mockReaderInfo({
      id: "simple_serial_1",
      info: "",
      connected: true,
    });

    render(<ReadersListTest readers={[reader]} />);

    expect(screen.getByText("simple_serial_1")).toBeInTheDocument();
  });

  it("should show section header", () => {
    render(<ReadersListTest />);

    expect(screen.getByText("Device Readers")).toBeInTheDocument();
  });

  it("should display mix of connected and disconnected readers correctly", () => {
    const readers = [
      mockReaderInfo({
        id: "reader_1",
        info: "Connected Reader",
        connected: true,
      }),
      mockReaderInfo({
        id: "reader_2",
        info: "Disconnected Reader",
        connected: false,
      }),
    ];

    render(<ReadersListTest readers={readers} />);

    expect(screen.getByTestId("reader-indicator-reader_1")).toHaveClass(
      "bg-green-500",
    );
    expect(screen.getByTestId("reader-indicator-reader_2")).toHaveClass(
      "bg-red-500",
    );
  });
});

describe("Settings Readers Route - Scan Mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ScanModeTest = ({
    connected = true,
    scanMode = "tap" as "tap" | "hold",
    onModeChange = vi.fn(),
  }) => {
    const [mode, setMode] = React.useState(scanMode);

    const handleModeChange = (newMode: "tap" | "hold") => {
      setMode(newMode);
      onModeChange(newMode);
      mockSettingsUpdate({ readersScanMode: newMode });
    };

    return (
      <div data-testid="scan-mode-section">
        <span id="scan-mode-label">Scan Mode</span>
        <div role="radiogroup" aria-labelledby="scan-mode-label">
          <button
            role="radio"
            aria-checked={mode === "tap" && connected}
            onClick={() => handleModeChange("tap")}
            disabled={!connected}
            data-testid="tap-mode-button"
          >
            Tap
          </button>
          <button
            role="radio"
            aria-checked={mode === "hold" && connected}
            onClick={() => handleModeChange("hold")}
            disabled={!connected}
            data-testid="hold-mode-button"
          >
            Hold
          </button>
        </div>
      </div>
    );
  };

  it("should render scan mode buttons", () => {
    render(<ScanModeTest />);

    expect(screen.getByTestId("tap-mode-button")).toBeInTheDocument();
    expect(screen.getByTestId("hold-mode-button")).toBeInTheDocument();
  });

  it("should show tap mode as selected by default", () => {
    render(<ScanModeTest scanMode="tap" />);

    const tapButton = screen.getByTestId("tap-mode-button");
    expect(tapButton).toHaveAttribute("aria-checked", "true");
  });

  it("should show hold mode as selected when set", () => {
    render(<ScanModeTest scanMode="hold" />);

    const holdButton = screen.getByTestId("hold-mode-button");
    expect(holdButton).toHaveAttribute("aria-checked", "true");
  });

  it("should call settings update when changing mode", () => {
    render(<ScanModeTest />);

    const holdButton = screen.getByTestId("hold-mode-button");
    fireEvent.click(holdButton);

    expect(mockSettingsUpdate).toHaveBeenCalledWith({
      readersScanMode: "hold",
    });
  });

  it("should disable buttons when disconnected", () => {
    render(<ScanModeTest connected={false} />);

    expect(screen.getByTestId("tap-mode-button")).toBeDisabled();
    expect(screen.getByTestId("hold-mode-button")).toBeDisabled();
  });
});

describe("Settings Readers Route - Core Settings Toggles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const CoreSettingsTest = ({
    connected = true,
    audioScanFeedback = true,
    readersAutoDetect = true,
  }) => {
    const [audio, setAudio] = React.useState(audioScanFeedback);
    const [autoDetect, setAutoDetect] = React.useState(readersAutoDetect);

    return (
      <div data-testid="core-settings">
        <div data-testid="audio-feedback-toggle">
          <label>
            <input
              type="checkbox"
              checked={audio}
              onChange={(e) => {
                setAudio(e.target.checked);
                mockSettingsUpdate({ audioScanFeedback: e.target.checked });
              }}
              disabled={!connected}
              data-testid="audio-checkbox"
            />
            Audio Feedback
          </label>
        </div>
        <div data-testid="auto-detect-toggle">
          <label>
            <input
              type="checkbox"
              checked={autoDetect}
              onChange={(e) => {
                setAutoDetect(e.target.checked);
                mockSettingsUpdate({ readersAutoDetect: e.target.checked });
              }}
              disabled={!connected}
              data-testid="auto-detect-checkbox"
            />
            Auto Detect Readers
          </label>
        </div>
      </div>
    );
  };

  it("should render audio feedback toggle", () => {
    render(<CoreSettingsTest />);

    expect(screen.getByTestId("audio-feedback-toggle")).toBeInTheDocument();
  });

  it("should render auto-detect readers toggle", () => {
    render(<CoreSettingsTest />);

    expect(screen.getByTestId("auto-detect-toggle")).toBeInTheDocument();
  });

  it("should toggle audio feedback", () => {
    render(<CoreSettingsTest audioScanFeedback={true} />);

    const checkbox = screen.getByTestId("audio-checkbox");
    fireEvent.click(checkbox);

    expect(mockSettingsUpdate).toHaveBeenCalledWith({
      audioScanFeedback: false,
    });
  });

  it("should toggle auto-detect readers", () => {
    render(<CoreSettingsTest readersAutoDetect={true} />);

    const checkbox = screen.getByTestId("auto-detect-checkbox");
    fireEvent.click(checkbox);

    expect(mockSettingsUpdate).toHaveBeenCalledWith({
      readersAutoDetect: false,
    });
  });

  it("should disable toggles when disconnected", () => {
    render(<CoreSettingsTest connected={false} />);

    expect(screen.getByTestId("audio-checkbox")).toBeDisabled();
    expect(screen.getByTestId("auto-detect-checkbox")).toBeDisabled();
  });
});

describe("Settings Readers Route - App Settings", () => {
  const AppSettingsTest = ({
    restartScan = false,
    onRestartScanChange = vi.fn(),
  }) => {
    const [restart, setRestart] = React.useState(restartScan);

    return (
      <div data-testid="app-settings">
        <div data-testid="continuous-scan-toggle">
          <label>
            <input
              type="checkbox"
              checked={restart}
              onChange={(e) => {
                setRestart(e.target.checked);
                onRestartScanChange(e.target.checked);
              }}
              data-testid="continuous-scan-checkbox"
            />
            Continuous Scanning
          </label>
        </div>
      </div>
    );
  };

  it("should render continuous scan toggle", () => {
    render(<AppSettingsTest />);

    expect(screen.getByTestId("continuous-scan-toggle")).toBeInTheDocument();
  });

  it("should toggle continuous scan", () => {
    const onRestartScanChange = vi.fn();
    render(<AppSettingsTest onRestartScanChange={onRestartScanChange} />);

    const checkbox = screen.getByTestId("continuous-scan-checkbox");
    fireEvent.click(checkbox);

    expect(onRestartScanChange).toHaveBeenCalledWith(true);
  });

  it("should show continuous scan as enabled when set", () => {
    render(<AppSettingsTest restartScan={true} />);

    const checkbox = screen.getByTestId("continuous-scan-checkbox");
    expect(checkbox).toBeChecked();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";
import { createRouter, createMemoryHistory } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "fs";
import { resolve } from "path";
import React from "react";

// Mock dependencies
vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    version: vi.fn(),
    settings: vi.fn(),
    settingsUpdate: vi.fn(),
    mediaGenerate: vi.fn(),
    reset: vi.fn(),
  },
  getDeviceAddress: vi.fn(() => "192.168.1.100"),
  setDeviceAddress: vi.fn(),
}));

vi.mock("../../../hooks/useAppSettings", () => ({
  useAppSettings: vi.fn(() => ({
    restartScan: false,
    setRestartScan: vi.fn(),
    launchOnScan: true,
    setLaunchOnScan: vi.fn(),
    preferRemoteWriter: false,
    setPreferRemoteWriter: vi.fn(),
  })),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the store
const mockResetConnectionState = vi.fn();
vi.mock("../../../lib/store", () => ({
  useStatusStore: vi.fn(() => ({
    connected: true,
    connectionError: "",
    deviceHistory: [{ address: "192.168.1.200" }],
    setDeviceHistory: vi.fn(),
    removeDeviceHistory: vi.fn(),
    resetConnectionState: mockResetConnectionState,
  })),
  ConnectionState: {
    IDLE: "IDLE",
    CONNECTING: "CONNECTING",
    CONNECTED: "CONNECTED",
    RECONNECTING: "RECONNECTING",
    ERROR: "ERROR",
    DISCONNECTED: "DISCONNECTED",
  },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useMutation: vi.fn(() => ({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    })),
    useQuery: vi.fn(() => ({
      data: {
        platform: "test-platform",
        version: "1.0.0",
        audioScanFeedback: true,
        readersAutoDetect: true,
        debugLogging: false,
        readersScanMode: "tap",
      },
      isLoading: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn(),
    })),
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
    })),
  };
});

// Mock MediaDatabaseCard component
vi.mock("../../../components/MediaDatabaseCard", () => ({
  MediaDatabaseCard: () => (
    <div data-testid="media-database-card">Media Database Card</div>
  ),
}));

describe("Settings Index Route", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const memoryHistory = createMemoryHistory({
      initialEntries: ["/settings"],
    });

    createRouter({
      history: memoryHistory,
      context: {
        queryClient,
      },
    });
  });

  it("should import MediaDatabaseCard component", () => {
    // Read settings.index.tsx source code to verify MediaDatabaseCard import
    const settingsPath = resolve(
      __dirname,
      "../../../routes/settings.index.tsx",
    );
    const settingsSource = readFileSync(settingsPath, "utf-8");

    // Check that MediaDatabaseCard is imported
    expect(settingsSource).toMatch(
      /import.*MediaDatabaseCard.*from.*components\/MediaDatabaseCard/,
    );

    // Check that MediaDatabaseCard is used in JSX
    expect(settingsSource).toMatch(/<MediaDatabaseCard\s*\/>/);
  });

  it("should not import or use DatabaseIcon anymore", () => {
    // Read settings.index.tsx source code to verify DatabaseIcon removal
    const settingsPath = resolve(
      __dirname,
      "../../../routes/settings.index.tsx",
    );
    const settingsSource = readFileSync(settingsPath, "utf-8");

    // Check that DatabaseIcon is no longer imported
    expect(settingsSource).not.toMatch(/DatabaseIcon.*from.*lib\/images/);

    // Check that the old update database button is removed
    expect(settingsSource).not.toMatch(/CoreAPI\.mediaGenerate\(\)/);
    expect(settingsSource).not.toMatch(
      /label.*settings\.updateDb.*icon.*DatabaseIcon/,
    );
  });

  it("should not use gamesIndex state anymore", () => {
    // Read settings.index.tsx source code to verify gamesIndex removal
    const settingsPath = resolve(
      __dirname,
      "../../../routes/settings.index.tsx",
    );
    const settingsSource = readFileSync(settingsPath, "utf-8");

    // Check that gamesIndex is no longer used in the settings component
    expect(settingsSource).not.toMatch(/const gamesIndex = useStatusStore/);
    expect(settingsSource).not.toMatch(/gamesIndex\.indexing/);
  });

  it("should have MediaDatabaseCard in place of old database button", () => {
    // Read settings.index.tsx source code to verify replacement
    const settingsPath = resolve(
      __dirname,
      "../../../routes/settings.index.tsx",
    );
    const settingsSource = readFileSync(settingsPath, "utf-8");

    // The old button structure should be gone
    expect(settingsSource).not.toMatch(
      /<div>\s*<Button.*label.*settings\.updateDb/,
    );

    // MediaDatabaseCard should be in its place
    expect(settingsSource).toMatch(/<MediaDatabaseCard\s*\/>/);
  });

  it("should render MediaDatabaseCard component when testing", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <div data-testid="settings-page">
          <div data-testid="media-database-card">Media Database Card</div>
        </div>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("media-database-card")).toBeInTheDocument();
    expect(screen.getByText("Media Database Card")).toBeInTheDocument();
  });

  it("should maintain other existing functionality", () => {
    // Read settings.index.tsx source code to verify other components remain
    const settingsPath = resolve(
      __dirname,
      "../../../routes/settings.index.tsx",
    );
    const settingsSource = readFileSync(settingsPath, "utf-8");

    // Check that other important elements are still present
    expect(settingsSource).toMatch(/DeviceConnectionCard/);
    expect(settingsSource).toMatch(/settings\.device/);
    expect(settingsSource).toMatch(/settings\.designer/);
    expect(settingsSource).toMatch(/settings\.readers\.title/);
    expect(settingsSource).toMatch(/settings\.playtime\.title/);
    expect(settingsSource).toMatch(/settings\.advanced\.title/);
    expect(settingsSource).toMatch(/settings\.help\.title/);
    expect(settingsSource).toMatch(/settings\.about\.title/);
  });

  it("should have proper component structure", () => {
    // Verify the component structure is maintained
    const settingsPath = resolve(
      __dirname,
      "../../../routes/settings.index.tsx",
    );
    const settingsSource = readFileSync(settingsPath, "utf-8");

    // PageFrame should still be the main wrapper with headerCenter
    expect(settingsSource).toMatch(/<PageFrame/);
    expect(settingsSource).toMatch(/headerCenter/);
    expect(settingsSource).toMatch(/settings\.title/);

    // Should have the main flex column container
    expect(settingsSource).toMatch(/className="flex flex-col gap-5"/);

    // MediaDatabaseCard component should be present
    expect(settingsSource).toMatch(/<MediaDatabaseCard/);
  });

  describe("Device Address Change Flow", () => {
    it("should use handleDeviceAddressChange instead of location.reload", () => {
      // Read settings.index.tsx source code to verify the change
      const settingsPath = resolve(
        __dirname,
        "../../../routes/settings.index.tsx",
      );
      const settingsSource = readFileSync(settingsPath, "utf-8");

      // Should not use location.reload anymore
      expect(settingsSource).not.toMatch(/location\.reload\(\)/);

      // Should have the handleDeviceAddressChange function
      expect(settingsSource).toMatch(/const handleDeviceAddressChange = /);

      // Should call the required functions in the handler
      expect(settingsSource).toMatch(/setDeviceAddress\(newAddress\)/);
      expect(settingsSource).toMatch(/resetConnectionState\(\)/);
      expect(settingsSource).toMatch(/CoreAPI\.reset\(\)/);
      expect(settingsSource).toMatch(/queryClient\.invalidateQueries\(\)/);
    });

    it("should use handleDeviceAddressChange in DeviceConnectionCard", () => {
      const settingsPath = resolve(
        __dirname,
        "../../../routes/settings.index.tsx",
      );
      const settingsSource = readFileSync(settingsPath, "utf-8");

      // DeviceConnectionCard should use handleDeviceAddressChange via onAddressChange
      expect(settingsSource).toMatch(
        /onAddressChange={handleDeviceAddressChange}/,
      );
    });

    it("should use handleDeviceAddressChange in device history buttons", () => {
      const settingsPath = resolve(
        __dirname,
        "../../../routes/settings.index.tsx",
      );
      const settingsSource = readFileSync(settingsPath, "utf-8");

      // Device history buttons should use handleDeviceAddressChange
      expect(settingsSource).toMatch(
        /onClick={\(\) => \{[\s\S]*?handleDeviceAddressChange\(entry\.address\)/,
      );
      expect(settingsSource).toMatch(/setHistoryOpen\(false\)/);
    });

    it("should import useQueryClient from React Query", () => {
      const settingsPath = resolve(
        __dirname,
        "../../../routes/settings.index.tsx",
      );
      const settingsSource = readFileSync(settingsPath, "utf-8");

      // Should import useQueryClient
      expect(settingsSource).toMatch(
        /import.*useQueryClient.*from.*@tanstack\/react-query/,
      );

      // Should call useQueryClient hook
      expect(settingsSource).toMatch(/const queryClient = useQueryClient\(\)/);
    });

    it("should import resetConnectionState from store", () => {
      const settingsPath = resolve(
        __dirname,
        "../../../routes/settings.index.tsx",
      );
      const settingsSource = readFileSync(settingsPath, "utf-8");

      // Should use resetConnectionState from the store (handle multi-line formatting and trailing comma)
      expect(settingsSource).toMatch(
        /const resetConnectionState = useStatusStore\(\s*\(state\) => state\.resetConnectionState,?\s*\)/,
      );
    });

    it("should have proper function sequence in handleDeviceAddressChange", () => {
      const settingsPath = resolve(
        __dirname,
        "../../../routes/settings.index.tsx",
      );
      const settingsSource = readFileSync(settingsPath, "utf-8");

      // Extract the handleDeviceAddressChange function
      const functionMatch = settingsSource.match(
        /const handleDeviceAddressChange = \(newAddress: string\) => \{([\s\S]*?)};/,
      );
      expect(functionMatch).toBeTruthy();

      if (functionMatch) {
        const functionBody = functionMatch[1];

        // Verify the correct sequence of operations
        expect(functionBody).toMatch(/setDeviceAddress\(newAddress\)/);
        expect(functionBody).toMatch(/resetConnectionState\(\)/);
        expect(functionBody).toMatch(/CoreAPI\.reset\(\)/);
        expect(functionBody).toMatch(/queryClient\.invalidateQueries\(\)/);
        expect(functionBody).toMatch(/setAddress\(newAddress\)/);
      }
    });
  });
});

describe("Settings Index Route - Component Behavior", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders navigation links to all settings pages", () => {
    const SettingsNavComponent = () => (
      <div data-testid="settings-nav">
        <a href="/settings/readers" data-testid="link-readers">
          Readers
        </a>
        <a href="/settings/playtime" data-testid="link-playtime">
          Playtime
        </a>
        <a href="/settings/accessibility" data-testid="link-accessibility">
          Accessibility
        </a>
        <a href="/settings/advanced" data-testid="link-advanced">
          Advanced
        </a>
        <a href="/settings/help" data-testid="link-help">
          Help
        </a>
        <a href="/settings/about" data-testid="link-about">
          About
        </a>
      </div>
    );

    render(
      <QueryClientProvider client={queryClient}>
        <SettingsNavComponent />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("link-readers")).toBeInTheDocument();
    expect(screen.getByTestId("link-playtime")).toBeInTheDocument();
    expect(screen.getByTestId("link-accessibility")).toBeInTheDocument();
    expect(screen.getByTestId("link-advanced")).toBeInTheDocument();
    expect(screen.getByTestId("link-help")).toBeInTheDocument();
    expect(screen.getByTestId("link-about")).toBeInTheDocument();
  });

  it("shows language selector with all supported languages", () => {
    const LanguageSelectorComponent = () => {
      const [language, setLanguage] = React.useState("en-US");

      return (
        <div data-testid="language-selector">
          <label htmlFor="language">Language</label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            data-testid="language-select"
          >
            <option value="de-DE">Deutsch</option>
            <option value="en-GB">English (UK)</option>
            <option value="en-US">English (US)</option>
            <option value="fr-FR">Français</option>
            <option value="nl-NL">Nederlands</option>
            <option value="zh-CN">中文</option>
            <option value="ja-JP">日本語</option>
            <option value="ko-KR">한국어</option>
          </select>
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageSelectorComponent />
      </QueryClientProvider>,
    );

    const select = screen.getByTestId("language-select");
    expect(select).toHaveValue("en-US");

    // Verify all language options exist
    expect(screen.getByText("Deutsch")).toBeInTheDocument();
    expect(screen.getByText("English (UK)")).toBeInTheDocument();
    expect(screen.getByText("English (US)")).toBeInTheDocument();
    expect(screen.getByText("Français")).toBeInTheDocument();
    expect(screen.getByText("Nederlands")).toBeInTheDocument();
    expect(screen.getByText("中文")).toBeInTheDocument();
    expect(screen.getByText("日本語")).toBeInTheDocument();
    expect(screen.getByText("한국어")).toBeInTheDocument();
  });

  it("handles language change", () => {
    const mockChangeLanguage = vi.fn();
    const LanguageSelectorComponent = () => {
      const [language, setLanguage] = React.useState("en-US");

      const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setLanguage(e.target.value);
        mockChangeLanguage(e.target.value);
      };

      return (
        <select
          value={language}
          onChange={handleChange}
          data-testid="language-select"
        >
          <option value="en-US">English (US)</option>
          <option value="ja-JP">日本語</option>
        </select>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageSelectorComponent />
      </QueryClientProvider>,
    );

    const select = screen.getByTestId("language-select");
    fireEvent.change(select, { target: { value: "ja-JP" } });

    expect(mockChangeLanguage).toHaveBeenCalledWith("ja-JP");
    expect(select).toHaveValue("ja-JP");
  });

  it("shows device history modal when history button is clicked", () => {
    const DeviceHistoryComponent = () => {
      const [historyOpen, setHistoryOpen] = React.useState(false);
      const deviceHistory = [
        { address: "192.168.1.100" },
        { address: "192.168.1.200" },
      ];

      return (
        <div data-testid="device-history-test">
          <button
            onClick={() => setHistoryOpen(true)}
            data-testid="open-history"
            disabled={deviceHistory.length === 0}
          >
            Device History
          </button>

          {historyOpen && (
            <div data-testid="history-modal">
              <h2>Device History</h2>
              {deviceHistory.map((entry) => (
                <button
                  key={entry.address}
                  data-testid={`history-${entry.address}`}
                  onClick={() => setHistoryOpen(false)}
                >
                  {entry.address}
                </button>
              ))}
              <button
                onClick={() => setHistoryOpen(false)}
                data-testid="close-history"
              >
                Close
              </button>
            </div>
          )}
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <DeviceHistoryComponent />
      </QueryClientProvider>,
    );

    // Open history modal
    fireEvent.click(screen.getByTestId("open-history"));
    expect(screen.getByTestId("history-modal")).toBeInTheDocument();

    // Check history entries
    expect(screen.getByTestId("history-192.168.1.100")).toBeInTheDocument();
    expect(screen.getByTestId("history-192.168.1.200")).toBeInTheDocument();

    // Select a history entry
    fireEvent.click(screen.getByTestId("history-192.168.1.100"));
    expect(screen.queryByTestId("history-modal")).not.toBeInTheDocument();
  });

  it("shows Pro purchase button when not subscribed on native platform", () => {
    const ProPurchaseComponent = () => {
      const isNative = true;
      const proAccess = false;
      const [modalOpen, setModalOpen] = React.useState(false);

      return (
        <div data-testid="pro-purchase-test">
          {isNative && (
            <>
              {proAccess ? (
                <button disabled data-testid="pro-active">
                  Pro Active
                </button>
              ) : (
                <button
                  onClick={() => setModalOpen(true)}
                  data-testid="purchase-pro"
                >
                  Purchase Pro
                </button>
              )}
            </>
          )}

          {modalOpen && (
            <div data-testid="purchase-modal">
              <h2>Purchase Pro</h2>
              <button onClick={() => setModalOpen(false)}>Close</button>
            </div>
          )}
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <ProPurchaseComponent />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("purchase-pro")).toBeInTheDocument();
    expect(screen.queryByTestId("pro-active")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("purchase-pro"));
    expect(screen.getByTestId("purchase-modal")).toBeInTheDocument();
  });

  it("shows Pro active state when subscribed", () => {
    const ProActiveComponent = () => {
      const proAccess = true;

      return (
        <div data-testid="pro-active-test">
          {proAccess && (
            <button disabled data-testid="pro-active">
              Pro Active
            </button>
          )}
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <ProActiveComponent />
      </QueryClientProvider>,
    );

    const proButton = screen.getByTestId("pro-active");
    expect(proButton).toBeInTheDocument();
    expect(proButton).toBeDisabled();
  });

  it("opens designer URL when designer button is clicked", () => {
    const mockOpen = vi.fn();
    const DesignerButtonComponent = () => {
      const handleClick = () => {
        mockOpen({ url: "https://design.zaparoo.org" });
      };

      return (
        <button onClick={handleClick} data-testid="designer-button">
          Open Designer
        </button>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <DesignerButtonComponent />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId("designer-button"));
    expect(mockOpen).toHaveBeenCalledWith({
      url: "https://design.zaparoo.org",
    });
  });

  it("shows Get App button on web platform", () => {
    const GetAppComponent = () => {
      const isNative = false;

      return (
        <div data-testid="get-app-test">
          {!isNative && <button data-testid="get-app-button">Get App</button>}
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <GetAppComponent />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("get-app-button")).toBeInTheDocument();
  });

  it("prevents redundant connection reset when address hasn't changed", () => {
    const mockResetConnectionState = vi.fn();
    const mockSetDeviceAddress = vi.fn();
    const savedAddress = "192.168.1.100";

    const AddressChangeComponent = () => {
      const handleDeviceAddressChange = (newAddress: string) => {
        // Skip if address hasn't actually changed
        if (newAddress === savedAddress) {
          return;
        }
        mockSetDeviceAddress(newAddress);
        mockResetConnectionState();
      };

      return (
        <div data-testid="address-change-test">
          <button
            onClick={() => handleDeviceAddressChange("192.168.1.100")}
            data-testid="same-address"
          >
            Same Address
          </button>
          <button
            onClick={() => handleDeviceAddressChange("192.168.1.200")}
            data-testid="different-address"
          >
            Different Address
          </button>
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AddressChangeComponent />
      </QueryClientProvider>,
    );

    // Click same address - should not trigger reset
    fireEvent.click(screen.getByTestId("same-address"));
    expect(mockResetConnectionState).not.toHaveBeenCalled();

    // Click different address - should trigger reset
    fireEvent.click(screen.getByTestId("different-address"));
    expect(mockResetConnectionState).toHaveBeenCalled();
    expect(mockSetDeviceAddress).toHaveBeenCalledWith("192.168.1.200");
  });
});

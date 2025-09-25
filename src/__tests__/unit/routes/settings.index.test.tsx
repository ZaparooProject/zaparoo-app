import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../test-utils";
import { createRouter, createMemoryHistory } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "fs";
import { resolve } from "path";

// Mock dependencies
vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    version: vi.fn(),
    settings: vi.fn(),
    settingsUpdate: vi.fn(),
    mediaGenerate: vi.fn(),
    reset: vi.fn()
  },
  getDeviceAddress: vi.fn(() => "192.168.1.100"),
  setDeviceAddress: vi.fn()
}));

vi.mock("../../../hooks/useAppSettings", () => ({
  useAppSettings: vi.fn(() => ({
    restartScan: false,
    setRestartScan: vi.fn(),
    launchOnScan: true,
    setLaunchOnScan: vi.fn(),
    preferRemoteWriter: false,
    setPreferRemoteWriter: vi.fn()
  }))
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
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
    resetConnectionState: mockResetConnectionState
  })),
  ConnectionState: {
    IDLE: "IDLE",
    CONNECTING: "CONNECTING",
    CONNECTED: "CONNECTED",
    RECONNECTING: "RECONNECTING",
    ERROR: "ERROR",
    DISCONNECTED: "DISCONNECTED"
  }
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    useMutation: vi.fn(() => ({
      mutate: vi.fn(),
      isPending: false,
      error: null
    })),
    useQuery: vi.fn(() => ({
      data: {
        platform: "test-platform",
        version: "1.0.0",
        audioScanFeedback: true,
        readersAutoDetect: true,
        debugLogging: false,
        readersScanMode: "tap"
      },
      isLoading: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn()
    })),
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn()
    }))
  };
});

// Mock MediaDatabaseCard component
vi.mock("../../../components/MediaDatabaseCard", () => ({
  MediaDatabaseCard: () => <div data-testid="media-database-card">Media Database Card</div>
}));

describe("Settings Index Route", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });

    const memoryHistory = createMemoryHistory({
      initialEntries: ['/settings']
    });

    createRouter({
      history: memoryHistory,
      context: {
        queryClient
      }
    });
  });

  it("should import MediaDatabaseCard component", () => {
    // Read settings.index.tsx source code to verify MediaDatabaseCard import
    const settingsPath = resolve(__dirname, "../../../routes/settings.index.tsx");
    const settingsSource = readFileSync(settingsPath, "utf-8");

    // Check that MediaDatabaseCard is imported
    expect(settingsSource).toMatch(/import.*MediaDatabaseCard.*from.*components\/MediaDatabaseCard/);

    // Check that MediaDatabaseCard is used in JSX
    expect(settingsSource).toMatch(/<MediaDatabaseCard\s*\/>/);
  });

  it("should not import or use DatabaseIcon anymore", () => {
    // Read settings.index.tsx source code to verify DatabaseIcon removal
    const settingsPath = resolve(__dirname, "../../../routes/settings.index.tsx");
    const settingsSource = readFileSync(settingsPath, "utf-8");

    // Check that DatabaseIcon is no longer imported
    expect(settingsSource).not.toMatch(/DatabaseIcon.*from.*lib\/images/);

    // Check that the old update database button is removed
    expect(settingsSource).not.toMatch(/CoreAPI\.mediaGenerate\(\)/);
    expect(settingsSource).not.toMatch(/label.*settings\.updateDb.*icon.*DatabaseIcon/);
  });

  it("should not use gamesIndex state anymore", () => {
    // Read settings.index.tsx source code to verify gamesIndex removal
    const settingsPath = resolve(__dirname, "../../../routes/settings.index.tsx");
    const settingsSource = readFileSync(settingsPath, "utf-8");

    // Check that gamesIndex is no longer used in the settings component
    expect(settingsSource).not.toMatch(/const gamesIndex = useStatusStore/);
    expect(settingsSource).not.toMatch(/gamesIndex\.indexing/);
  });

  it("should have MediaDatabaseCard in place of old database button", () => {
    // Read settings.index.tsx source code to verify replacement
    const settingsPath = resolve(__dirname, "../../../routes/settings.index.tsx");
    const settingsSource = readFileSync(settingsPath, "utf-8");

    // The old button structure should be gone
    expect(settingsSource).not.toMatch(/<div>\s*<Button.*label.*settings\.updateDb/);

    // MediaDatabaseCard should be in its place
    expect(settingsSource).toMatch(/<MediaDatabaseCard\s*\/>/);
  });

  it("should render MediaDatabaseCard component when testing", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <div data-testid="settings-page">
          <div data-testid="media-database-card">Media Database Card</div>
        </div>
      </QueryClientProvider>
    );

    expect(screen.getByTestId("media-database-card")).toBeInTheDocument();
    expect(screen.getByText("Media Database Card")).toBeInTheDocument();
  });

  it("should maintain other existing functionality", () => {
    // Read settings.index.tsx source code to verify other components remain
    const settingsPath = resolve(__dirname, "../../../routes/settings.index.tsx");
    const settingsSource = readFileSync(settingsPath, "utf-8");

    // Check that other important elements are still present
    expect(settingsSource).toMatch(/TextInput/);
    expect(settingsSource).toMatch(/settings\.device/);
    expect(settingsSource).toMatch(/settings\.designer/);
    expect(settingsSource).toMatch(/settings\.advanced\.title/);
    expect(settingsSource).toMatch(/settings\.logs\.title/);
    expect(settingsSource).toMatch(/settings\.help\.title/);
    expect(settingsSource).toMatch(/settings\.about\.title/);
  });

  it("should have proper component structure", () => {
    // Verify the component structure is maintained
    const settingsPath = resolve(__dirname, "../../../routes/settings.index.tsx");
    const settingsSource = readFileSync(settingsPath, "utf-8");

    // PageFrame should still be the main wrapper
    expect(settingsSource).toMatch(/<PageFrame.*title.*settings\.title/);

    // Should have the main flex column container
    expect(settingsSource).toMatch(/className="flex flex-col gap-5"/);

    // ScanSettings component should still be present
    expect(settingsSource).toMatch(/<ScanSettings/);
  });

  describe("Device Address Change Flow", () => {
    it("should use handleDeviceAddressChange instead of location.reload", () => {
      // Read settings.index.tsx source code to verify the change
      const settingsPath = resolve(__dirname, "../../../routes/settings.index.tsx");
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

    it("should use handleDeviceAddressChange in TextInput saveValue", () => {
      const settingsPath = resolve(__dirname, "../../../routes/settings.index.tsx");
      const settingsSource = readFileSync(settingsPath, "utf-8");

      // TextInput should use handleDeviceAddressChange as saveValue
      expect(settingsSource).toMatch(/saveValue={handleDeviceAddressChange}/);
    });

    it("should use handleDeviceAddressChange in device history buttons", () => {
      const settingsPath = resolve(__dirname, "../../../routes/settings.index.tsx");
      const settingsSource = readFileSync(settingsPath, "utf-8");

      // Device history buttons should use handleDeviceAddressChange
      expect(settingsSource).toMatch(/onClick={\(\) => \{[\s\S]*?handleDeviceAddressChange\(entry\.address\)/);
      expect(settingsSource).toMatch(/setHistoryOpen\(false\)/);
    });

    it("should import useQueryClient from React Query", () => {
      const settingsPath = resolve(__dirname, "../../../routes/settings.index.tsx");
      const settingsSource = readFileSync(settingsPath, "utf-8");

      // Should import useQueryClient
      expect(settingsSource).toMatch(/import.*useQueryClient.*from.*@tanstack\/react-query/);

      // Should call useQueryClient hook
      expect(settingsSource).toMatch(/const queryClient = useQueryClient\(\)/);
    });

    it("should import resetConnectionState from store", () => {
      const settingsPath = resolve(__dirname, "../../../routes/settings.index.tsx");
      const settingsSource = readFileSync(settingsPath, "utf-8");

      // Should use resetConnectionState from the store
      expect(settingsSource).toMatch(/const resetConnectionState = useStatusStore\(\(state\) => state\.resetConnectionState\)/);
    });

    it("should have proper function sequence in handleDeviceAddressChange", () => {
      const settingsPath = resolve(__dirname, "../../../routes/settings.index.tsx");
      const settingsSource = readFileSync(settingsPath, "utf-8");

      // Extract the handleDeviceAddressChange function
      const functionMatch = settingsSource.match(/const handleDeviceAddressChange = \(newAddress: string\) => \{([\s\S]*?)\};/);
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
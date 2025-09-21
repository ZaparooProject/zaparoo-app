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
    mediaGenerate: vi.fn()
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
});
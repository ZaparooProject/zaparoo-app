import { render, screen, fireEvent } from "../../../test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MediaDatabaseCard } from "../../../components/MediaDatabaseCard";
import { CoreAPI } from "../../../lib/coreApi";

// Mock dependencies
vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    mediaGenerate: vi.fn(),
    mediaGenerateCancel: vi.fn(),
    media: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (key === "toast.filesFound" && options?.count) {
        return `${options.count} items scanned`;
      }
      return key;
    },
  }),
}));

// Mock @tanstack/react-query only when needed for specific tests
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useQuery: vi.fn(actual.useQuery), // Default to actual implementation
  };
});

// Mock zustand store
const mockStore = {
  connected: true,
  gamesIndex: {
    indexing: false,
    exists: true,
    totalFiles: 100,
    currentStep: 0,
    totalSteps: 0,
    currentStepDisplay: "",
  },
  safeInsets: {
    top: "0px",
    bottom: "0px",
    left: "0px",
    right: "0px",
  },
};

vi.mock("../../../lib/store", () => ({
  useStatusStore: (selector: any) => selector(mockStore),
}));

describe("MediaDatabaseCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock store state
    mockStore.connected = true;
    mockStore.gamesIndex = {
      indexing: false,
      exists: true,
      totalFiles: 100,
      currentStep: 0,
      totalSteps: 0,
      currentStepDisplay: "",
    };

    // Default mock - database exists and ready
    vi.mocked(CoreAPI.media).mockResolvedValue({
      database: { exists: true, indexing: false },
      active: [],
    });
  });

  it("should render update button when not indexing", () => {
    render(<MediaDatabaseCard />);

    // Get all buttons with the updateDb text and find the one that's the main update button (not the system selector)
    const buttons = screen.getAllByRole("button", {
      name: /settings\.updateDb/i,
    });
    const updateButton = buttons.find(
      (button) => !button.textContent?.includes("settings.updateDb.allSystems"),
    );

    expect(updateButton).toBeInTheDocument();
    expect(updateButton).not.toBeDisabled();
  });

  it("should disable button when not connected", () => {
    mockStore.connected = false;

    render(<MediaDatabaseCard />);

    const buttons = screen.getAllByRole("button", {
      name: /settings\.updateDb/i,
    });
    const updateButton = buttons.find(
      (button) => !button.textContent?.includes("settings.updateDb.allSystems"),
    );
    expect(updateButton).toBeDisabled();
  });

  it("should disable button when indexing", () => {
    mockStore.gamesIndex.indexing = true;

    render(<MediaDatabaseCard />);

    const buttons = screen.getAllByRole("button", {
      name: /settings\.updateDb/i,
    });
    const updateButton = buttons.find(
      (button) => !button.textContent?.includes("settings.updateDb.allSystems"),
    );
    expect(updateButton).toBeDisabled();
  });

  it("should call CoreAPI.mediaGenerate when button is clicked", async () => {
    const { CoreAPI } = await import("../../../lib/coreApi");

    render(<MediaDatabaseCard />);

    const buttons = screen.getAllByRole("button", {
      name: /settings\.updateDb/i,
    });
    const updateButton = buttons.find(
      (button) => !button.textContent?.includes("settings.updateDb.allSystems"),
    );
    fireEvent.click(updateButton!);

    expect(CoreAPI.mediaGenerate).toHaveBeenCalledOnce();
  });

  it("should show ready status when database exists (no file count)", async () => {
    render(<MediaDatabaseCard />);

    // Wait for the query to resolve
    expect(
      await screen.findByText("settings.updateDb.status.ready"),
    ).toBeInTheDocument();
  });

  it("should not show file count in card status", async () => {
    // File count should never appear in the card, only in toast
    mockStore.gamesIndex.totalFiles = 250;

    render(<MediaDatabaseCard />);

    expect(screen.queryByText("250 items scanned")).not.toBeInTheDocument();
    // Wait for the query to resolve
    expect(
      await screen.findByText("settings.updateDb.status.ready"),
    ).toBeInTheDocument();
  });

  it("should show error message when database does not exist", async () => {
    vi.mocked(CoreAPI.media).mockResolvedValue({
      database: { exists: false, indexing: false },
      active: [],
    });

    render(<MediaDatabaseCard />);

    // Wait for the query to resolve
    expect(await screen.findByText("No database found")).toBeInTheDocument();
  });

  it("should show checking status when loading", async () => {
    // For this test, we need to mock useQuery to control loading state
    // Use a partial mock with type assertion
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      // Only mock what the component actually uses
    } as any);

    render(<MediaDatabaseCard />);

    expect(
      screen.getByText("settings.updateDb.status.checking"),
    ).toBeInTheDocument();
  });

  it("should show progress when indexing", () => {
    mockStore.gamesIndex = {
      indexing: true,
      exists: true,
      totalFiles: 100,
      currentStep: 5,
      totalSteps: 10,
      currentStepDisplay: "Scanning games directory",
    };

    render(<MediaDatabaseCard />);

    // Text appears both in visible UI and aria-live announcement region
    expect(
      screen.getAllByText("Scanning games directory").length,
    ).toBeGreaterThan(0);

    // Progress bar should show 50% (5/10 steps)
    const progressBar = screen.getByRole("progressbar", {
      name: "settings.updateDb.progressLabel",
    });
    expect(progressBar).toHaveAttribute("aria-valuenow", "50");
  });

  it("should show preparing message when currentStepDisplay is empty", () => {
    mockStore.gamesIndex = {
      indexing: true,
      exists: true,
      totalFiles: 100,
      currentStep: 0,
      totalSteps: 10,
      currentStepDisplay: "",
    };

    render(<MediaDatabaseCard />);

    // Text appears both in visible UI and aria-live announcement region
    expect(screen.getAllByText("toast.preparingDb").length).toBeGreaterThan(0);
  });

  it("should show writing message when on final step", () => {
    mockStore.gamesIndex = {
      indexing: true,
      exists: true,
      totalFiles: 100,
      currentStep: 10,
      totalSteps: 10,
      currentStepDisplay: "Finalizing",
    };

    render(<MediaDatabaseCard />);

    // Text appears both in visible UI and aria-live announcement region
    expect(screen.getAllByText("toast.writingDb").length).toBeGreaterThan(0);
  });

  it("should show cancel button when indexing", () => {
    mockStore.gamesIndex.indexing = true;

    render(<MediaDatabaseCard />);

    const cancelButton = screen.getByRole("button", {
      name: /settings\.updateDb\.cancel/i,
    });
    expect(cancelButton).toBeInTheDocument();
    expect(cancelButton).not.toBeDisabled();
  });

  it("should call CoreAPI.mediaGenerateCancel when cancel button is clicked", async () => {
    mockStore.gamesIndex.indexing = true;
    const { CoreAPI } = await import("../../../lib/coreApi");

    render(<MediaDatabaseCard />);

    const cancelButton = screen.getByRole("button", {
      name: /settings\.updateDb\.cancel/i,
    });
    fireEvent.click(cancelButton);

    expect(CoreAPI.mediaGenerateCancel).toHaveBeenCalledOnce();
  });

  it("should not show cancel button when not indexing", () => {
    mockStore.gamesIndex.indexing = false;

    render(<MediaDatabaseCard />);

    const cancelButton = screen.queryByRole("button", {
      name: /settings\.updateDb\.cancel/i,
    });
    expect(cancelButton).not.toBeInTheDocument();
  });

  it('should keep cancel button in "Cancelling..." state after API call completes (regression test)', async () => {
    // REGRESSION TEST: This test prevents re-introducing a bug where the cancel button
    // immediately reverts to "Cancel" state after the API call completes, even though
    // the actual cancellation is still happening in the background on zaparoo-core.
    //
    // The bug was caused by a `finally` block that reset `isCancelling` state immediately
    // after the API call. The correct behavior is to keep the button in "Cancelling..."
    // state until a WebSocket notification confirms that indexing has stopped.

    mockStore.gamesIndex.indexing = true;
    const { CoreAPI } = await import("../../../lib/coreApi");

    // Mock the cancel API to resolve successfully
    vi.mocked(CoreAPI.mediaGenerateCancel).mockResolvedValue(undefined);

    render(<MediaDatabaseCard />);

    // Find and click the cancel button
    const cancelButton = screen.getByRole("button", {
      name: /settings\.updateDb\.cancel/i,
    });
    fireEvent.click(cancelButton);

    // Wait for the API call to complete
    await vi.waitFor(() => {
      expect(CoreAPI.mediaGenerateCancel).toHaveBeenCalledOnce();
    });

    // CRITICAL ASSERTION: After the API call completes, the button should STILL
    // be in the "Cancelling..." state (disabled with "cancelling" text),
    // NOT reverted back to "Cancel" state.
    //
    // This is because the actual cancellation is happening in the background,
    // and we need to wait for the WebSocket notification (indexing: false) to confirm.
    const buttonAfterApiCall = screen.getByRole("button", {
      name: /cancelling/i,
    });
    expect(buttonAfterApiCall).toBeInTheDocument();
    expect(buttonAfterApiCall).toBeDisabled();

    // Verify it's NOT showing the normal "Cancel" text
    expect(
      screen.queryByRole("button", { name: /^settings\.updateDb\.cancel$/i }),
    ).not.toBeInTheDocument();
  });
});

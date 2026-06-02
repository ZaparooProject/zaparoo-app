import userEvent from "@testing-library/user-event";
import { render, screen, fireEvent } from "../../../test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MediaDatabaseCard } from "../../../components/MediaDatabaseCard";
import { CoreAPI } from "../../../lib/coreApi";

// Mock dependencies
vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    mediaGenerate: vi.fn(),
    mediaGenerateCancel: vi.fn(),
    mediaGenerateResume: vi.fn(),
    mediaCleanOrphans: vi.fn(),
    media: vi.fn(),
    systems: vi.fn(),
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
const { ConnectionState, mockStore } = vi.hoisted(() => {
  const ConnectionState = {
    IDLE: "IDLE",
    CONNECTING: "CONNECTING",
    CONNECTED: "CONNECTED",
    RECONNECTING: "RECONNECTING",
    DISCONNECTING: "DISCONNECTING",
    DISCONNECTED: "DISCONNECTED",
    ERROR: "ERROR",
  } as const;
  const mockStore = {
    connected: true,
    connectionState: ConnectionState.CONNECTED as string,
    gamesIndex: {
      indexing: false,
      optimizing: false,
      exists: true,
      totalFiles: 100,
      currentStep: 0,
      totalSteps: 0,
      currentStepDisplay: "",
    } as {
      indexing: boolean;
      optimizing?: boolean;
      exists: boolean;
      totalFiles: number;
      currentStep: number;
      totalSteps: number;
      currentStepDisplay: string;
      paused?: boolean;
    },
    scrapingStatus: null as { scraping: boolean } | null,
    coreVersion: "2.12.0" as string | null,
    coreVersionPending: false,
    safeInsets: {
      top: "0px",
      bottom: "0px",
      left: "0px",
      right: "0px",
    },
  };
  return { ConnectionState, mockStore };
});

vi.mock("../../../lib/store", () => ({
  ConnectionState,
  useStatusStore: (selector: any) => selector(mockStore),
}));

describe("MediaDatabaseCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock store state
    mockStore.connected = true;
    mockStore.connectionState = ConnectionState.CONNECTED;
    mockStore.gamesIndex = {
      indexing: false,
      optimizing: false,
      exists: true,
      totalFiles: 100,
      currentStep: 0,
      totalSteps: 0,
      currentStepDisplay: "",
    };
    mockStore.scrapingStatus = null;
    mockStore.coreVersion = "2.12.0";
    mockStore.coreVersionPending = false;

    // Default mock - database exists and ready
    vi.mocked(CoreAPI.media).mockResolvedValue({
      database: { exists: true, indexing: false },
      active: [],
    });
    vi.mocked(CoreAPI.systems).mockResolvedValue({ systems: [] });
    vi.mocked(CoreAPI.mediaCleanOrphans).mockResolvedValue({ deleted: 0 });
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

  it("should explain why database updates are disabled while scraping", () => {
    mockStore.scrapingStatus = { scraping: true };

    render(<MediaDatabaseCard />);

    expect(
      screen.getByRole("button", { name: "settings.updateDb" }),
    ).toBeDisabled();
    expect(
      screen.getByText("settings.updateDb.blockedByScrape"),
    ).toBeInTheDocument();
  });

  it("should hide clean missing media action by default", () => {
    render(<MediaDatabaseCard />);

    expect(
      screen.queryByRole("button", {
        name: "settings.updateDb.cleanOrphans",
      }),
    ).not.toBeInTheDocument();
  });

  it("should hide clean missing media action for unsupported Core versions", () => {
    mockStore.coreVersion = "2.11.9";

    render(<MediaDatabaseCard showMaintenanceActions />);

    expect(
      screen.queryByRole("button", {
        name: "settings.updateDb.cleanOrphans",
      }),
    ).not.toBeInTheDocument();
  });

  it("should confirm before cleaning missing media", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.mediaCleanOrphans).mockResolvedValue({ deleted: 3 });

    render(<MediaDatabaseCard showMaintenanceActions />);

    await user.click(
      screen.getByRole("button", {
        name: "settings.updateDb.cleanOrphans",
      }),
    );
    expect(
      screen.getByRole("dialog", {
        name: "settings.updateDb.cleanOrphansConfirmTitle",
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "settings.updateDb.cleanOrphansConfirmAction",
      }),
    );

    await vi.waitFor(() => {
      expect(CoreAPI.mediaCleanOrphans).toHaveBeenCalledOnce();
    });
    expect(
      await screen.findByText("settings.updateDb.cleanOrphansSuccess"),
    ).toBeInTheDocument();
  });

  it("should show when no missing media entries are found", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.mediaCleanOrphans).mockResolvedValue({ deleted: 0 });

    render(<MediaDatabaseCard showMaintenanceActions />);

    await user.click(
      screen.getByRole("button", {
        name: "settings.updateDb.cleanOrphans",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings.updateDb.cleanOrphansConfirmAction",
      }),
    );

    expect(
      await screen.findByText("settings.updateDb.cleanOrphansNone"),
    ).toBeInTheDocument();
  });

  it("should show clean missing media errors inline", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.mediaCleanOrphans).mockRejectedValue(
      new Error("clean timed out"),
    );

    render(<MediaDatabaseCard showMaintenanceActions />);

    await user.click(
      screen.getByRole("button", {
        name: "settings.updateDb.cleanOrphans",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings.updateDb.cleanOrphansConfirmAction",
      }),
    );

    expect(await screen.findByText("error")).toBeInTheDocument();
  });

  it("should disable clean missing media while scraping", () => {
    mockStore.scrapingStatus = { scraping: true };

    render(<MediaDatabaseCard showMaintenanceActions />);

    expect(
      screen.getByRole("button", {
        name: "settings.updateDb.cleanOrphans",
      }),
    ).toBeDisabled();
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

  it("should render core-supplied step text verbatim when currentStep===totalSteps", () => {
    // Regression: previously the card hardcoded toast.writingDb whenever
    // currentStep===totalSteps, hiding Core's split phases (Writing database /
    // Creating indexes / Building search caches).
    mockStore.gamesIndex = {
      indexing: true,
      exists: true,
      totalFiles: 100,
      currentStep: 10,
      totalSteps: 10,
      currentStepDisplay: "Building search caches",
    };

    render(<MediaDatabaseCard />);

    expect(
      screen.getAllByText("Building search caches").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("toast.writingDb")).not.toBeInTheDocument();
  });

  it("should not render a stray '0' during phases where totalSteps is 0", () => {
    // Regression: hasDetailedProgress used to short-circuit to the number 0
    // when totalSteps was 0, which React rendered as the literal text "0"
    // wherever the chain ended in JSX (notably in the spinner slot).
    mockStore.gamesIndex = {
      indexing: true,
      exists: true,
      totalFiles: 0,
      currentStep: 0,
      totalSteps: 0,
      currentStepDisplay: "Finding media folders",
    };

    render(<MediaDatabaseCard />);

    expect(screen.getAllByText("Finding media folders").length).toBeGreaterThan(
      0,
    );
    // The progress card must not contain a bare "0" — only screen-reader
    // announce content lives outside the card.
    expect(
      screen.queryByText((_, el) => (el?.textContent ?? "").trim() === "0"),
    ).not.toBeInTheDocument();
  });

  it("should hide the spinner during phase steps (currentStep===0)", () => {
    mockStore.gamesIndex = {
      indexing: true,
      exists: true,
      totalFiles: 0,
      currentStep: 0,
      totalSteps: 0,
      currentStepDisplay: "Initializing database",
    };

    render(<MediaDatabaseCard />);

    expect(
      screen.queryByRole("status", { name: "Loading" }),
    ).not.toBeInTheDocument();
  });

  it("should hide the spinner during the writing phase (currentStep===totalSteps)", () => {
    mockStore.gamesIndex = {
      indexing: true,
      exists: true,
      totalFiles: 100,
      currentStep: 11,
      totalSteps: 11,
      currentStepDisplay: "Writing database",
    };

    render(<MediaDatabaseCard />);

    expect(
      screen.queryByRole("status", { name: "Loading" }),
    ).not.toBeInTheDocument();
  });

  it("should show the spinner during per-system steps", () => {
    mockStore.gamesIndex = {
      indexing: true,
      exists: true,
      totalFiles: 50,
      currentStep: 3,
      totalSteps: 11,
      currentStepDisplay: "Nintendo Entertainment System",
    };

    render(<MediaDatabaseCard />);

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("should show Resume button and call mediaGenerateResume when paused", async () => {
    mockStore.gamesIndex = {
      indexing: true,
      exists: false,
      totalFiles: 0,
      currentStep: 2,
      totalSteps: 11,
      currentStepDisplay: "Atari 2600",
      paused: true,
    };
    const { CoreAPI } = await import("../../../lib/coreApi");
    vi.mocked(CoreAPI.mediaGenerateResume).mockResolvedValue(undefined);

    render(<MediaDatabaseCard />);

    expect(
      screen.getAllByText("settings.updateDb.status.paused").length,
    ).toBeGreaterThan(0);
    const resumeButton = screen.getByRole("button", {
      name: /settings\.updateDb\.resume/i,
    });
    expect(resumeButton).toBeInTheDocument();

    // No cancel button while paused
    expect(
      screen.queryByRole("button", { name: /settings\.updateDb\.cancel/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(resumeButton);
    expect(CoreAPI.mediaGenerateResume).toHaveBeenCalledOnce();
  });

  it("should re-enable the Resume button after a failed resume so user can retry", async () => {
    mockStore.gamesIndex = {
      indexing: true,
      exists: false,
      totalFiles: 0,
      currentStep: 2,
      totalSteps: 11,
      currentStepDisplay: "Atari 2600",
      paused: true,
    };
    const { CoreAPI } = await import("../../../lib/coreApi");
    vi.mocked(CoreAPI.mediaGenerateResume).mockRejectedValue(
      new Error("Network error"),
    );

    render(<MediaDatabaseCard />);

    const resumeButton = screen.getByRole("button", {
      name: /settings\.updateDb\.resume/i,
    });
    fireEvent.click(resumeButton);

    // Once the rejection settles, the button must return to "Resume" (enabled),
    // not stay stuck in "Resuming…" — otherwise the user can't try again.
    await vi.waitFor(() => {
      expect(CoreAPI.mediaGenerateResume).toHaveBeenCalledOnce();
    });
    await vi.waitFor(() => {
      const button = screen.getByRole("button", {
        name: /settings\.updateDb\.resume/i,
      });
      expect(button).not.toBeDisabled();
    });
  });

  it("should show Reconnecting indicator when reconnecting mid-index", () => {
    // Real reconnect path: store.connected stays true during RECONNECTING
    // (see src/lib/store.ts) — only connectionState distinguishes the live
    // CONNECTED state from a transient drop.
    mockStore.connected = true;
    mockStore.connectionState = ConnectionState.RECONNECTING;
    mockStore.gamesIndex = {
      indexing: true,
      exists: false,
      totalFiles: 10,
      currentStep: 4,
      totalSteps: 11,
      currentStepDisplay: "Sega Genesis",
    };

    render(<MediaDatabaseCard />);

    expect(
      screen.getAllByText("settings.updateDb.status.reconnecting").length,
    ).toBeGreaterThan(0);
    // Spinner is suppressed while reconnecting — updates are paused.
    expect(
      screen.queryByRole("status", { name: "Loading" }),
    ).not.toBeInTheDocument();
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

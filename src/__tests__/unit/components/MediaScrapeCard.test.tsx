import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import {
  act,
  mockDeviceRecord,
  render,
  screen,
  seedActiveDevice,
  seedDeviceRegistry,
  waitFor,
} from "@/test-utils";
import { MediaScrapeCard } from "@/components/MediaScrapeCard";
import { CoreAPI } from "@/lib/coreApi";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { deviceRegistry } from "@/lib/devices/deviceRegistry";

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    scrapers: vi.fn(),
    systems: vi.fn(),
    mediaScrapeStatus: vi.fn(),
    mediaScrape: vi.fn(),
    mediaScrapeCancel: vi.fn(),
    mediaScrapeResume: vi.fn(),
  },
  isMediaOperationConflictError: (error: unknown) =>
    error instanceof Error &&
    error.message.toLowerCase().includes("optimization in progress"),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { formattedCount?: string }) =>
      options?.formattedCount ?? key,
  }),
}));

vi.mock("@/components/A11yAnnouncer", () => ({
  useAnnouncer: () => ({ announce: vi.fn() }),
  A11yAnnouncerProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

describe("MediaScrapeCard", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await seedActiveDevice({ recordId: "test-device" });
    useTabSessionStore.getState().reset();
    useStatusStore.setState({
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      coreVersion: "2.12.0",
      coreVersionPending: false,
      scrapingStatus: null,
      gamesIndex: {
        exists: true,
        indexing: false,
        optimizing: false,
        totalSteps: 0,
        currentStep: 0,
        currentStepDisplay: "",
        totalFiles: 0,
      },
    });
    vi.mocked(CoreAPI.scrapers).mockResolvedValue({
      scrapers: [
        {
          id: "gamelist.xml",
          name: "ES gamelist.xml",
          supportedSystems: ["snes"],
        },
      ],
    });
    vi.mocked(CoreAPI.systems).mockResolvedValue({
      systems: [
        { id: "snes", name: "Super Nintendo" },
        { id: "nes", name: "Nintendo Entertainment System" },
      ],
    });
    vi.mocked(CoreAPI.mediaScrapeStatus).mockResolvedValue({
      processed: 0,
      total: 0,
      matched: 0,
      skipped: 0,
      totalScraped: 0,
      scraping: false,
      done: false,
      paused: false,
    });
    vi.mocked(CoreAPI.mediaScrape).mockResolvedValue(undefined);
    vi.mocked(CoreAPI.mediaScrapeCancel).mockResolvedValue({
      message: "scraping cancelled",
    });
    vi.mocked(CoreAPI.mediaScrapeResume).mockResolvedValue({
      message: "Media scraping resumed",
    });
  });

  it("should not call scraper APIs before Core version is known", () => {
    useStatusStore.setState({ coreVersion: null, coreVersionPending: true });

    render(<MediaScrapeCard />);

    expect(CoreAPI.scrapers).not.toHaveBeenCalled();
    expect(CoreAPI.mediaScrapeStatus).not.toHaveBeenCalled();
  });

  it("should not call scraper APIs for Core versions below 2.12.0", () => {
    useStatusStore.setState({
      coreVersion: "2.11.9",
      coreVersionPending: false,
    });

    render(<MediaScrapeCard />);

    expect(CoreAPI.scrapers).not.toHaveBeenCalled();
    expect(CoreAPI.mediaScrapeStatus).not.toHaveBeenCalled();
  });

  it("should clear the previous scrape status when switching devices", async () => {
    const sourceDevice = mockDeviceRecord({
      recordId: "source-device",
      address: "192.168.1.100",
    });
    const targetDevice = mockDeviceRecord({
      recordId: "target-device",
      address: "192.168.1.101",
    });
    await seedDeviceRegistry(
      [sourceDevice, targetDevice],
      sourceDevice.recordId,
    );

    const previousStatus = {
      scraperId: "gamelist.xml",
      systemId: "snes",
      processed: 25,
      total: 100,
      matched: 20,
      skipped: 5,
      totalScraped: 12,
      scraping: true,
      done: false,
      paused: false,
    };
    useStatusStore.setState({ scrapingStatus: previousStatus });
    vi.mocked(CoreAPI.mediaScrapeStatus)
      .mockResolvedValueOnce(previousStatus)
      .mockReturnValueOnce(new Promise(() => {}));

    render(<MediaScrapeCard />);

    expect(
      await screen.findByText("settings.scrapeMedia.activeTitle"),
    ).toBeInTheDocument();

    await act(async () => {
      await deviceRegistry.setActiveRecord(targetDevice.recordId);
    });

    await waitFor(() => {
      expect(useStatusStore.getState().scrapingStatus).toBeNull();
    });
    expect(
      screen.queryByText("settings.scrapeMedia.activeTitle"),
    ).not.toBeInTheDocument();
  });

  it("should select ES gamelist.xml by default", async () => {
    render(<MediaScrapeCard />);

    const select = await screen.findByRole("combobox", {
      name: "settings.scrapeMedia.scraperPlaceholder",
    });
    await waitFor(() => expect(select).toHaveValue("gamelist.xml"));
  });

  it("should restore a valid scraper choice for the active device", async () => {
    useTabSessionStore.getState().setMediaScraper("test-device", "other");
    vi.mocked(CoreAPI.scrapers).mockResolvedValueOnce({
      scrapers: [
        {
          id: "gamelist.xml",
          name: "ES gamelist.xml",
          supportedSystems: ["snes"],
        },
        {
          id: "other",
          name: "Other scraper",
          supportedSystems: [],
        },
      ],
    });

    render(<MediaScrapeCard />);

    const select = await screen.findByRole("combobox", {
      name: "settings.scrapeMedia.scraperPlaceholder",
    });
    await waitFor(() => expect(select).toHaveValue("other"));
  });

  it("should replace an unavailable session choice with gamelist.xml", async () => {
    useTabSessionStore.getState().setMediaScraper("test-device", "missing");

    render(<MediaScrapeCard />);

    const select = await screen.findByRole("combobox", {
      name: "settings.scrapeMedia.scraperPlaceholder",
    });
    await waitFor(() => expect(select).toHaveValue("gamelist.xml"));
    expect(
      useTabSessionStore.getState().mediaScraperByDevice["test-device"],
    ).toBe("gamelist.xml");
  });

  it("should start scraping with the selected scraper", async () => {
    const user = userEvent.setup();
    render(<MediaScrapeCard />);

    await screen.findByRole("option", { name: "ES gamelist.xml" });
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "settings.scrapeMedia.scraperPlaceholder",
      }),
      "gamelist.xml",
    );
    await user.click(
      screen.getByRole("button", { name: "settings.scrapeMedia" }),
    );

    await waitFor(() => {
      expect(CoreAPI.mediaScrape).toHaveBeenCalledWith({
        scraperId: "gamelist.xml",
        systems: ["snes"],
        force: false,
      });
    });
  });

  it("should treat empty scraper support as all systems", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.scrapers).mockResolvedValueOnce({
      scrapers: [
        {
          id: "empty-scraper",
          name: "Empty scraper",
          supportedSystems: [],
        },
      ],
    });

    render(<MediaScrapeCard />);

    await screen.findByRole("option", { name: "Empty scraper" });
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "settings.scrapeMedia.scraperPlaceholder",
      }),
      "empty-scraper",
    );
    await user.click(
      screen.getByRole("button", { name: "settings.scrapeMedia" }),
    );

    await waitFor(() => {
      expect(CoreAPI.mediaScrape).toHaveBeenCalledWith({
        scraperId: "empty-scraper",
        systems: undefined,
        force: false,
      });
    });
  });

  it("should treat omitted scraper support as all systems", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.scrapers).mockResolvedValueOnce({
      scrapers: [
        {
          id: "legacy-scraper",
          name: "Legacy scraper",
          supportedSystems: undefined as unknown as string[],
        },
      ],
    });

    render(<MediaScrapeCard />);

    await screen.findByRole("option", { name: "Legacy scraper" });
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "settings.scrapeMedia.scraperPlaceholder",
      }),
      "legacy-scraper",
    );
    await user.click(
      screen.getByRole("button", { name: "settings.scrapeMedia" }),
    );

    await waitFor(() => {
      expect(CoreAPI.mediaScrape).toHaveBeenCalledWith({
        scraperId: "legacy-scraper",
        systems: undefined,
        force: false,
      });
    });
  });

  it("should show a loading state while waiting for scrape status", async () => {
    const user = userEvent.setup();
    render(<MediaScrapeCard />);

    await screen.findByRole("option", { name: "ES gamelist.xml" });
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "settings.scrapeMedia.scraperPlaceholder",
      }),
      "gamelist.xml",
    );
    await user.click(
      screen.getByRole("button", { name: "settings.scrapeMedia" }),
    );

    expect(
      await screen.findByRole("button", {
        name: "settings.scrapeMedia.starting",
      }),
    ).toBeDisabled();
    expect(screen.getByRole("status", { name: "loading" })).toBeInTheDocument();
  });

  it("should render one visible force toggle label", async () => {
    render(<MediaScrapeCard />);

    expect(
      await screen.findByText("settings.scrapeMedia.force"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("settings.scrapeMedia.force")).toHaveLength(1);
  });

  it("should explain why scraping is disabled while media indexing is active", async () => {
    useStatusStore.setState({
      gamesIndex: {
        exists: true,
        indexing: true,
        optimizing: false,
        totalSteps: 0,
        currentStep: 0,
        currentStepDisplay: "",
        totalFiles: 0,
      },
    });

    render(<MediaScrapeCard />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "settings.scrapeMedia" }),
      ).toBeDisabled();
    });
    expect(
      screen.getByText("settings.scrapeMedia.blockedByIndex"),
    ).toBeInTheDocument();
  });

  it("should keep scraping disabled while indexing is paused", async () => {
    useStatusStore.setState({
      gamesIndex: {
        exists: true,
        indexing: true,
        optimizing: false,
        paused: true,
        totalSteps: 5,
        currentStep: 2,
        currentStepDisplay: "Super Nintendo",
        totalFiles: 25,
      },
    });

    render(<MediaScrapeCard />);

    expect(
      await screen.findByRole("button", { name: "settings.scrapeMedia" }),
    ).toBeDisabled();
  });

  it("should keep scraping disabled during database optimization", async () => {
    useStatusStore.setState({
      gamesIndex: {
        exists: true,
        indexing: false,
        optimizing: true,
        totalSteps: 0,
        currentStep: 0,
        currentStepDisplay: "",
        totalFiles: 0,
      },
    });

    render(<MediaScrapeCard />);

    expect(
      await screen.findByRole("button", { name: "settings.scrapeMedia" }),
    ).toBeDisabled();
    expect(
      screen.getByText("settings.scrapeMedia.blockedByIndex"),
    ).toBeInTheDocument();
  });

  it("should replace the form with status controls while scraping", async () => {
    vi.mocked(CoreAPI.mediaScrapeStatus).mockResolvedValueOnce({
      scraperId: "gamelist.xml",
      systemId: "snes",
      processed: 1,
      total: 2,
      matched: 1,
      skipped: 0,
      totalScraped: 12,
      scraping: true,
      done: false,
      paused: false,
    });

    render(<MediaScrapeCard />);

    expect(
      await screen.findByRole("button", {
        name: "settings.scrapeMedia.cancel",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", {
        name: "settings.scrapeMedia.scraperPlaceholder",
      }),
    ).not.toBeInTheDocument();
  });

  it("should render overall and current-system progress from the new payload", async () => {
    vi.mocked(CoreAPI.mediaScrapeStatus).mockResolvedValueOnce({
      scraperId: "gamelist.xml",
      systemId: "snes",
      currentStep: 2,
      totalSteps: 4,
      currentStepDisplay: "Super Nintendo",
      currentSystem: {
        systemId: "snes",
        systemName: "Super Nintendo",
        processed: 25,
        total: 100,
        matched: 20,
        skipped: 5,
      },
      processed: 25,
      total: 100,
      matched: 20,
      skipped: 5,
      totalScraped: 12,
      scraping: true,
      done: false,
      paused: false,
    });

    render(<MediaScrapeCard />);

    expect(
      await screen.findByRole("progressbar", {
        name: "settings.scrapeMedia.overallProgressLabel",
      }),
    ).toHaveAttribute("aria-valuenow", "50");
    expect(
      screen.getByRole("progressbar", {
        name: "settings.scrapeMedia.progressLabel",
      }),
    ).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getAllByText("Super Nintendo").length).toBeGreaterThan(0);
  });

  it("should show overall progress count while the first system is preparing", async () => {
    vi.mocked(CoreAPI.mediaScrapeStatus).mockResolvedValueOnce({
      scraperId: "gamelist.xml",
      systemId: "snes",
      currentStep: 0,
      totalSteps: 4,
      currentStepDisplay: "Preparing",
      processed: 0,
      total: 100,
      matched: 0,
      skipped: 0,
      totalScraped: 0,
      scraping: true,
      done: false,
      paused: false,
    });

    render(<MediaScrapeCard />);

    expect(
      await screen.findByRole("progressbar", {
        name: "settings.scrapeMedia.overallProgressLabel",
      }),
    ).toHaveAttribute("aria-valuenow", "0");
    expect(
      screen.getByText("settings.scrapeMedia.systemProgressCount"),
    ).toBeInTheDocument();
  });

  it("should render current-system progress from the legacy payload", async () => {
    vi.mocked(CoreAPI.mediaScrapeStatus).mockResolvedValueOnce({
      scraperId: "gamelist.xml",
      systemId: "snes",
      processed: 3,
      total: 6,
      matched: 2,
      skipped: 1,
      totalScraped: 12,
      scraping: true,
      done: false,
      paused: false,
    });

    render(<MediaScrapeCard />);

    expect(
      await screen.findByRole("progressbar", {
        name: "settings.scrapeMedia.progressLabel",
      }),
    ).toHaveAttribute("aria-valuenow", "50");
  });

  it("should recover cleanly when Core rejects a conflicting scrape", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.mediaScrape).mockRejectedValueOnce(
      new Error("database optimization in progress"),
    );

    render(<MediaScrapeCard />);

    const button = await screen.findByRole("button", {
      name: "settings.scrapeMedia",
    });
    await waitFor(() => expect(button).not.toBeDisabled());
    await user.click(button);

    expect(await screen.findByText("error")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "settings.scrapeMedia" }),
      ).not.toBeDisabled();
    });
  });

  it("should keep the form visible when showing completed scrape stats", async () => {
    vi.mocked(CoreAPI.mediaScrapeStatus).mockResolvedValueOnce({
      scraperId: "gamelist.xml",
      processed: 2,
      total: 2,
      matched: 1,
      skipped: 1,
      totalScraped: 10,
      scraping: false,
      done: true,
      paused: false,
    });

    render(<MediaScrapeCard />);

    expect(
      (await screen.findAllByText("settings.scrapeMedia.done")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("combobox", {
        name: "settings.scrapeMedia.scraperPlaceholder",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "settings.scrapeMedia.dismiss" }),
    ).not.toBeInTheDocument();
  });

  it("should show failed scrape state without calling it complete", async () => {
    vi.mocked(CoreAPI.mediaScrapeStatus).mockResolvedValueOnce({
      scraperId: "gamelist.xml",
      processed: 2,
      total: 5,
      matched: 1,
      skipped: 1,
      totalScraped: 10,
      scraping: false,
      done: true,
      paused: false,
      state: "failed",
      error: "source file is invalid",
      force: false,
    });

    render(<MediaScrapeCard />);

    expect(
      (await screen.findAllByText("settings.scrapeMedia.failed")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("source file is invalid")).toBeInTheDocument();
    expect(
      screen.queryByText("settings.scrapeMedia.done"),
    ).not.toBeInTheDocument();
  });

  it("should show cancelled scrape state without calling it complete", async () => {
    vi.mocked(CoreAPI.mediaScrapeStatus).mockResolvedValueOnce({
      scraperId: "gamelist.xml",
      processed: 2,
      total: 5,
      matched: 1,
      skipped: 1,
      totalScraped: 10,
      scraping: false,
      done: true,
      paused: false,
      state: "cancelled",
      force: false,
    });

    render(<MediaScrapeCard />);

    expect(
      (await screen.findAllByText("settings.scrapeMedia.cancelled")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("settings.scrapeMedia.done"),
    ).not.toBeInTheDocument();
  });

  it("should show active force and throttled values from Core", async () => {
    vi.mocked(CoreAPI.mediaScrapeStatus).mockResolvedValueOnce({
      scraperId: "gamelist.xml",
      systemId: "snes",
      processed: 1,
      total: 2,
      matched: 1,
      skipped: 0,
      totalScraped: 12,
      scraping: true,
      done: false,
      paused: false,
      state: "running",
      force: true,
      throttled: true,
    });

    render(<MediaScrapeCard />);

    expect(
      (await screen.findAllByText("settings.scrapeMedia.status.throttled"))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("yes")).toBeInTheDocument();
  });

  it("should resume paused scraping", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.mediaScrapeStatus).mockResolvedValueOnce({
      scraperId: "gamelist.xml",
      systemId: "snes",
      processed: 1,
      total: 2,
      matched: 1,
      skipped: 0,
      totalScraped: 12,
      scraping: true,
      done: false,
      paused: true,
    });

    render(<MediaScrapeCard />);

    await user.click(
      await screen.findByRole("button", {
        name: "settings.scrapeMedia.resume",
      }),
    );

    expect(CoreAPI.mediaScrapeResume).toHaveBeenCalledOnce();
  });
});

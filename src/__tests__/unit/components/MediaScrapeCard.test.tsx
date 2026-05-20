import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test-utils";
import { MediaScrapeCard } from "@/components/MediaScrapeCard";
import { CoreAPI } from "@/lib/coreApi";
import { ConnectionState, useStatusStore } from "@/lib/store";

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    scrapers: vi.fn(),
    systems: vi.fn(),
    mediaScrapeStatus: vi.fn(),
    mediaScrape: vi.fn(),
    mediaScrapeCancel: vi.fn(),
    mediaScrapeResume: vi.fn(),
  },
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
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("should not offer systems when the scraper supports none", async () => {
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
        systems: [],
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
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  findA11yViolations,
  render,
  screen,
  waitFor,
  within,
} from "@/test-utils";
import { RootLayout } from "@/routes/__root";
import { Settings } from "@/routes/settings.index";
import { AccessibilitySettings } from "@/routes/settings.accessibility";
import { ReadersSettings } from "@/routes/settings.readers";
import { MediaSettings } from "@/routes/settings.media";
import { PlayControlsSettings } from "@/routes/settings.play-controls";
import { OnlinePage } from "@/routes/settings.online";
import { CoreAPI } from "@/lib/coreApi";
import { ClientCapability } from "@/lib/models";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
import { mockReaderInfo } from "@/test-utils/factories";
import { responsiveWindow } from "@/test-utils/responsiveWindow";

vi.mock("@/lib/mfaAuthentication", () => ({
  MfaAuthentication: {
    signInWithEmailAndPassword: vi.fn(),
    confirmSignIn: vi.fn(),
    cancelSignIn: vi.fn().mockResolvedValue(undefined),
  },
}));

async function renderSettings(path: string, basepath?: string) {
  const root = createRootRoute({ component: RootLayout });
  const pages = [
    { path: "/settings", component: Settings },
    { path: "/settings/accessibility", component: AccessibilitySettings },
    { path: "/settings/readers", component: ReadersSettings },
    { path: "/settings/media", component: MediaSettings },
    { path: "/settings/play-controls", component: PlayControlsSettings },
    { path: "/settings/online", component: OnlinePage },
  ];
  const router = createRouter({
    basepath,
    routeTree: root.addChildren(
      pages.map((page) => createRoute({ getParentRoute: () => root, ...page })),
    ),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  return { ...render(<RouterProvider router={router} />), router };
}

describe("Adaptive Settings pages", () => {
  beforeEach(async () => {
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      coreVersion: "2.23.0",
      coreVersionPending: false,
      encryptionState: "plaintext",
      currentClient: {
        paired: true,
        role: "admin",
        capabilities: [
          ClientCapability.SettingsWrite,
          ClientCapability.ProfilesManage,
        ],
      },
    });
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
    });
    await seedActiveDevice();
    vi.spyOn(CoreAPI, "settings").mockResolvedValue({
      runZapScript: true,
      debugLogging: false,
      errorReporting: false,
      audioScanFeedback: true,
      readersAutoDetect: true,
      readersScanMode: "tap",
      readersScanExitDelay: 0,
      readersScanIgnoreSystems: [],
    });
    vi.spyOn(CoreAPI, "settingsUpdate").mockResolvedValue();
    vi.spyOn(CoreAPI, "readers").mockResolvedValue({ readers: [] });
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({ systems: [] });
    vi.spyOn(CoreAPI, "media").mockResolvedValue({
      database: useStatusStore.getState().gamesIndex,
      active: [],
    });
    vi.spyOn(CoreAPI, "scrapers").mockResolvedValue({ scrapers: [] });
    vi.spyOn(CoreAPI, "mediaScrapeStatus").mockResolvedValue({
      state: "idle",
      processed: 0,
      total: 0,
      matched: 0,
      skipped: 0,
      totalScraped: 0,
      scraping: false,
      done: false,
      paused: false,
    });
    vi.spyOn(CoreAPI, "profiles").mockResolvedValue({ profiles: [] });
    vi.spyOn(CoreAPI, "activeProfile").mockResolvedValue(null);
    vi.spyOn(CoreAPI, "playtimeLimits").mockResolvedValue({
      enabled: false,
      daily: "2h",
      session: "1h",
      sessionReset: "30m",
      warnings: ["5m"],
      retention: 30,
    });
    vi.spyOn(CoreAPI, "playtimeLimitsUpdate").mockResolvedValue();
  });
  afterEach(() => vi.restoreAllMocks());

  it("should retain Accessibility choices and real parent navigation through resize", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    const { router, baseElement } = await renderSettings(
      "/settings/accessibility",
    );
    const heading = await screen.findByRole("heading", {
      name: "settings.accessibility.title",
    });
    const scroll = heading.closest<HTMLElement>(
      "[data-scroll-restoration-id]",
    )!;
    const parent = within(scroll).getByRole("link", {
      name: "settings.title",
      hidden: true,
    });
    const accessibleLists = screen.getByRole("checkbox", {
      name: "settings.accessibility.accessibleLists",
    });
    await user.click(accessibleLists);
    const choice = usePreferencesStore.getState().accessibleLists;
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(
        screen.getByRole("heading", { name: "settings.accessibility.title" }),
      ).toBe(heading);
      expect(
        screen.getByRole("checkbox", {
          name: "settings.accessibility.accessibleLists",
        }),
      ).toBe(accessibleLists);
      if (choice) expect(accessibleLists).toBeChecked();
      else expect(accessibleLists).not.toBeChecked();
      expect(router.state.location.pathname).toBe("/settings/accessibility");
    }
    expect(await findA11yViolations(baseElement)).toEqual([]);
    await user.click(parent);
    await screen.findByRole("heading", { name: "settings.title" });
    expect(router.state.location.pathname).toBe("/settings");
  });

  it("should keep parent links inside embedded Core base path", async () => {
    responsiveWindow(1440);
    const user = userEvent.setup();
    const { router } = await renderSettings(
      "/app/settings/accessibility",
      "/app",
    );
    const heading = await screen.findByRole("heading", {
      name: "settings.accessibility.title",
    });
    const scroll = heading.closest<HTMLElement>(
      "[data-scroll-restoration-id]",
    )!;
    const parent = within(scroll).getByRole("link", {
      name: "settings.title",
      hidden: true,
    });
    expect(parent).toHaveAttribute("href", "/app/settings");
    await user.click(parent);
    await screen.findByRole("heading", { name: "settings.title" });
    expect(router.state.location.pathname).toBe("/settings");
    expect(router.history.location.pathname).toBe("/app/settings");
  });

  it("should retain reader settings and controls through resize without extra updates", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    vi.mocked(CoreAPI.readers).mockResolvedValue({
      readers: [
        mockReaderInfo({
          id: "fixture-reader",
          info: "Long reader label from USB link",
          capabilities: ["read", "write"],
          connected: true,
        }),
      ],
    });
    await renderSettings("/settings/readers");
    const readerName = await screen.findByText(
      "Long reader label from USB link",
    );
    const continuous = await screen.findByRole("checkbox", {
      name: "settings.readers.continuousScan",
    });
    await user.click(continuous);
    const choice = usePreferencesStore.getState().restartScan;
    const hold = await screen.findByRole("radio", {
      name: "settings.insertMode",
    });
    await waitFor(() => expect(hold).toBeEnabled());
    await user.click(hold);
    await waitFor(() =>
      expect(CoreAPI.settingsUpdate).toHaveBeenCalledWith({
        readersScanMode: "hold",
      }),
    );
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(screen.getByText("Long reader label from USB link")).toBe(
        readerName,
      );
      expect(
        screen.getByRole("checkbox", {
          name: "settings.readers.continuousScan",
        }),
      ).toBe(continuous);
      if (choice) expect(continuous).toBeChecked();
      else expect(continuous).not.toBeChecked();
      expect(screen.getByRole("radio", { name: "settings.insertMode" })).toBe(
        hold,
      );
    }
    expect(CoreAPI.settingsUpdate).toHaveBeenCalledTimes(1);
  });

  it("should retain media maintenance panels and headings through resize", async () => {
    const resize = responsiveWindow(1440);
    const { baseElement } = await renderSettings("/settings/media");
    const heading = await screen.findByRole("heading", {
      name: "settings.media.title",
    });
    const database = screen.getByRole("region", {
      name: "settings.media.databaseTitle",
    });
    const scraper = screen.getByRole("region", {
      name: "settings.media.scraperTitle",
    });
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(
        screen.getByRole("heading", { name: "settings.media.title" }),
      ).toBe(heading);
      expect(
        screen.getByRole("region", { name: "settings.media.databaseTitle" }),
      ).toBe(database);
      expect(
        screen.getByRole("region", { name: "settings.media.scraperTitle" }),
      ).toBe(scraper);
    }
    expect(await findA11yViolations(baseElement)).toEqual([]);
  });

  it("should preserve signed-in Online account controls through resize without invoking account actions", async () => {
    const resize = responsiveWindow(1440);
    useStatusStore.setState({
      connected: false,
      connectionState: ConnectionState.DISCONNECTED,
      loggedInUser: {
        uid: "test-user",
        displayName: "Test member",
        email: "member@example.test",
        emailVerified: true,
        isAnonymous: false,
        metadata: {},
        phoneNumber: null,
        photoUrl: null,
        providerData: [],
        providerId: "password",
        tenantId: null,
      },
    });
    await renderSettings("/settings/online");
    const heading = await screen.findByRole("heading", {
      name: "online.title",
    });
    const account = screen.getByRole("region", { name: "online.account" });
    const dashboard = within(account).getByRole("button", {
      name: "online.dashboard",
    });
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(screen.getByRole("heading", { name: "online.title" })).toBe(
        heading,
      );
      expect(screen.getByRole("region", { name: "online.account" })).toBe(
        account,
      );
      expect(dashboard).toBeEnabled();
      expect(within(account).getByText("member@example.test")).toBeVisible();
    }
  });

  it("should preserve signed-out Online login draft and focus through resize", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    useStatusStore.setState({
      connected: false,
      connectionState: ConnectionState.DISCONNECTED,
    });
    await renderSettings("/settings/online");
    await user.click(
      await screen.findByRole("button", { name: "online.login" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "online.login" });
    const email = within(dialog).getByRole("textbox", { name: "online.email" });
    await user.type(email, "member@example.test");
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(screen.getByRole("dialog", { name: "online.login" })).toBe(dialog);
      expect(email).toHaveValue("member@example.test");
      expect(email).toHaveFocus();
    }
    expect(useStatusStore.getState().loggedInUser).toBeNull();
  });

  it("should preserve profile editor draft and modal focus through resize", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    await renderSettings("/settings/play-controls");
    await user.click(
      await screen.findByRole("button", { name: "settings.core.profiles.add" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "settings.core.profiles.new",
    });
    const name = within(dialog).getByRole("textbox", {
      name: "settings.core.profiles.nameRequiredLabel",
    });
    await user.type(name, "Family profile");
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(
        screen.getByRole("dialog", { name: "settings.core.profiles.new" }),
      ).toBe(dialog);
      expect(name).toHaveValue("Family profile");
      expect(name).toHaveFocus();
    }
    expect(CoreAPI.playtimeLimitsUpdate).not.toHaveBeenCalled();
    expect(CoreAPI.settingsUpdate).not.toHaveBeenCalled();
  });
});

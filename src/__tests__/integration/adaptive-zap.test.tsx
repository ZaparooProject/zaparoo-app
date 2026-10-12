import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { Capacitor } from "@capacitor/core";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@/test-utils";
import { RootLayout } from "@/routes/__root";
import { Index } from "@/routes/-pages/Index";
import { Settings } from "@/routes/settings.index";
import { ScanHistory, PlayHistory } from "@/routes/-pages/ZapHistory";
import { CoreAPI } from "@/lib/coreApi";
import { ConnectionState, emptyPlaying, useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
import * as nfc from "@/lib/nfc";
import * as libraryImages from "@/lib/libraryImages";
import * as toastUtils from "@/lib/toastUtils";
import type { HistoryResponse, PlaylistState } from "@/lib/models";
import { responsiveWindow } from "@/test-utils/responsiveWindow";

async function renderZap(initialPath = "/", basepath?: string) {
  const root = createRootRoute({ component: RootLayout });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: Index,
  });
  const settings = createRoute({
    getParentRoute: () => root,
    path: "/settings",
    component: Settings,
  });
  const scans = createRoute({
    getParentRoute: () => root,
    path: "/zap/scan-history",
    component: ScanHistory,
  });
  const played = createRoute({
    getParentRoute: () => root,
    path: "/zap/play-history",
    component: PlayHistory,
  });
  const router = createRouter({
    basepath,
    routeTree: root.addChildren([home, settings, scans, played]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  await router.load();
  return { ...render(<RouterProvider router={router} />), router };
}

const audio = {
  systemId: "Audio",
  systemName: "Audio",
  mediaName: "Track One",
  mediaPath: "/music/one.flac",
  launcherControls: ["previous", "pause", "resume", "next"],
};

describe("Adaptive Zap", () => {
  beforeEach(async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      coreVersion: "2.23.0",
      coreVersionPending: false,
      corePlatform: "MiSTer",
      encryptionState: "plaintext",
      playing: audio,
    });
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      keepScreenAwake: false,
      launcherAccess: true,
      nfcAvailable: false,
      cameraAvailable: false,
    });
    await seedActiveDevice();
    vi.spyOn(libraryImages, "requestLibraryImage").mockResolvedValue(null);
    vi.spyOn(CoreAPI, "isConnected").mockReturnValue(true);
    vi.spyOn(CoreAPI, "mediaHistory").mockResolvedValue({ entries: [] });
    vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue({
      results: [],
      total: 0,
    });
    vi.spyOn(CoreAPI, "readers").mockResolvedValue({ readers: [] });
    vi.spyOn(CoreAPI, "history").mockResolvedValue({ entries: [] });
    vi.spyOn(CoreAPI, "run").mockResolvedValue();
    vi.spyOn(CoreAPI, "inputKeyboard").mockResolvedValue();
    vi.spyOn(CoreAPI, "screenshot").mockResolvedValue({
      path: "capture.png",
      data: "iVBORw0KGgo=",
      size: 12,
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("should offer History destinations on desktop and retain the phone sheet through resize", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    await renderZap();
    const navigation = screen.getByRole("navigation", {
      name: "nav.mainNavigation",
    });
    expect(
      within(navigation).getByRole("link", { name: "scan.scanHistoryTitle" }),
    ).toHaveAttribute("href", "/zap/scan-history");
    expect(
      within(navigation).getByRole("link", { name: "scan.playHistoryTitle" }),
    ).toHaveAttribute("href", "/zap/play-history");
    expect(
      screen.queryByRole("button", { name: "scan.remoteKeyboard" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "scan.historyTitle" }),
    ).not.toBeInTheDocument();
    await resize(390);
    await user.click(screen.getByRole("button", { name: "scan.historyTitle" }));
    const dialog = await screen.findByRole("dialog", {
      name: "scan.historyTitle",
    });
    const played = within(dialog).getByRole("tab", {
      name: "scan.historyTabPlayed",
    });
    await user.click(played);
    await resize(1440);
    expect(screen.getByRole("dialog", { name: "scan.historyTitle" })).toBe(
      dialog,
    );
    expect(played).toHaveAttribute("aria-selected", "true");
    await user.click(
      within(dialog).getAllByRole("button", { name: "nav.close" })[0]!,
    );
    expect(
      screen.getByRole("region", { name: "remoteKeyboard.title" }),
    ).toBeInTheDocument();
  });

  it("should open the Settings destinations and close Zap when visiting Settings", async () => {
    responsiveWindow(1440);
    const user = userEvent.setup();
    const { router } = await renderZap();
    const navigation = screen.getByRole("navigation", {
      name: "nav.mainNavigation",
    });
    await act(() =>
      useStatusStore.setState({
        connected: false,
        connectionState: ConnectionState.DISCONNECTED,
      }),
    );
    await user.click(
      within(navigation).getByRole("link", { name: "nav.settings" }),
    );
    await screen.findByRole("heading", { name: "settings.title" });
    expect(router.state.location.pathname).toBe("/settings");
    expect(
      within(navigation).queryByRole("link", { name: "scan.scanHistoryTitle" }),
    ).not.toBeInTheDocument();
    expect(
      within(navigation).getByRole("link", { name: "nav.devices" }),
    ).toHaveAttribute("href", "/settings/devices");
    expect(
      within(navigation).getByRole("link", { name: "nav.index" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("should keep a scan history page and scroll owner through resizing, with Zap selected on phone", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    vi.mocked(CoreAPI.history).mockResolvedValue({
      entries: [
        {
          time: "2026-01-01T12:00:00Z",
          type: "nfc",
          uid: "tag-one",
          text: "game.rom",
          data: "",
          success: false,
        },
      ],
    });
    const { router } = await renderZap("/zap/scan-history");
    await screen.findByText("game.rom");
    expect(screen.getByText("scan.historyFailed")).toBeVisible();
    const heading = screen.getByRole("heading", {
      name: "scan.scanHistoryTitle",
    });
    expect(heading).toHaveFocus();
    const replay = screen.getByRole("button", { name: "scan.historyReplay" });
    await user.click(replay);
    expect(CoreAPI.run).toHaveBeenCalledWith({
      type: "nfc",
      uid: "tag-one",
      text: "game.rom",
      data: "",
    });
    expect(CoreAPI.mediaHistory).not.toHaveBeenCalled();
    await resize(820);
    await resize(390);
    expect(screen.getByRole("heading", { name: "scan.scanHistoryTitle" })).toBe(
      heading,
    );
    expect(router.state.location.pathname).toBe("/zap/scan-history");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const zapNavigation = within(
      screen.getByRole("navigation", { name: "nav.mainNavigation" }),
    ).getByRole("link", { name: "nav.index" });
    expect(zapNavigation).toHaveAttribute("aria-current", "page");
    await act(() =>
      useStatusStore.setState({
        connectionState: ConnectionState.RECONNECTING,
      }),
    );
    expect(replay).toBeDisabled();
    await user.click(zapNavigation);
    await screen.findByRole("heading", { name: "Zaparoo", level: 1 });
    expect(router.state.location.pathname).toBe("/");
  });

  it.each([
    ["scan-history", "scan.scanHistoryTitle"],
    ["play-history", "scan.playHistoryTitle"],
  ])(
    "should keep %s title/actions and embedded Zap parent in page content",
    async (path, title) => {
      const resize = responsiveWindow(1440);
      const user = userEvent.setup();
      const { router } = await renderZap(`/app/zap/${path}`, "/app");
      const heading = await screen.findByRole("heading", {
        name: title,
        level: 1,
      });
      const scroll = heading.closest<HTMLElement>(
        "[data-scroll-restoration-id]",
      )!;
      const parent = within(scroll).getByRole("link", { name: "nav.index" });
      const refresh = within(scroll).getByRole("button", {
        name: "scan.historyRefresh",
      });
      expect(parent).toHaveAttribute("href", "/app/");
      for (const width of [820, 390, 1440]) {
        await resize(width);
        expect(screen.getByRole("heading", { name: title, level: 1 })).toBe(
          heading,
        );
        expect(within(scroll).getByRole("link", { name: "nav.index" })).toBe(
          parent,
        );
        expect(
          within(scroll).getByRole("button", { name: "scan.historyRefresh" }),
        ).toBe(refresh);
      }
      await user.click(parent);
      await screen.findByRole("heading", { name: "Zaparoo", level: 1 });
      expect(router.state.location.pathname).toBe("/");
    },
  );

  it("should paginate individual play sessions without collapsing repeat games", async () => {
    responsiveWindow(1440);
    const user = userEvent.setup();
    const entry = {
      systemId: "SNES",
      systemName: "SNES",
      mediaName: "Repeat Game",
      mediaPath: "/games/repeat.rom",
      playTime: 60,
    };
    vi.mocked(CoreAPI.mediaHistory)
      .mockResolvedValueOnce({
        entries: [
          { ...entry, startedAt: "2026-01-02T12:00:00Z" },
          { ...entry, startedAt: "2026-01-01T12:00:00Z" },
        ],
        pagination: { hasNextPage: true, nextCursor: "older", pageSize: 50 },
      })
      .mockResolvedValueOnce({
        entries: [{ ...entry, startedAt: "2025-12-31T12:00:00Z" }],
        pagination: { hasNextPage: false, nextCursor: null, pageSize: 50 },
      });
    await renderZap("/zap/play-history");
    await waitFor(() =>
      expect(screen.getAllByText("Repeat Game")).toHaveLength(2),
    );
    expect(CoreAPI.mediaHistory).toHaveBeenCalledWith(
      { limit: 50 },
      expect.any(AbortSignal),
    );
    await user.click(screen.getByRole("button", { name: "library.loadMore" }));
    await waitFor(() =>
      expect(screen.getAllByText("Repeat Game")).toHaveLength(3),
    );
    expect(CoreAPI.mediaHistory).toHaveBeenLastCalledWith(
      { limit: 50, cursor: "older" },
      expect.any(AbortSignal),
    );
    expect(
      screen.queryByRole("button", { name: "library.loadMore" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "scan.playHistoryTitle" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("should open game details from a play history row", async () => {
    responsiveWindow(1440);
    const user = userEvent.setup();
    vi.mocked(CoreAPI.mediaHistory).mockResolvedValueOnce({
      entries: [
        {
          systemId: "SNES",
          systemName: "SNES",
          mediaName: "Detail Game",
          mediaPath: "/games/detail.rom",
          playTime: 60,
          startedAt: "2026-01-02T12:00:00Z",
        },
      ],
      pagination: { hasNextPage: false, nextCursor: null, pageSize: 50 },
    });
    await renderZap("/zap/play-history");

    await user.click(
      await screen.findByRole("button", { name: "scan.coverRowDetails" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Detail Game" }),
    ).toBeInTheDocument();
  });

  it("should refresh real phone History data on each opening", async () => {
    responsiveWindow(390);
    const user = userEvent.setup();
    const entry = {
      time: "2026-01-01T12:00:00Z",
      type: "nfc",
      uid: "",
      data: "",
      success: true,
    };
    vi.mocked(CoreAPI.history)
      .mockResolvedValueOnce({ entries: [{ ...entry, text: "First scan" }] })
      .mockResolvedValueOnce({ entries: [{ ...entry, text: "Latest scan" }] });
    await renderZap();
    expect(CoreAPI.history).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "scan.historyTitle" }));
    await screen.findByText("First scan");
    const dialog = screen.getByRole("dialog", { name: "scan.historyTitle" });
    await user.click(
      within(dialog).getAllByRole("button", { name: "nav.close" })[0]!,
    );
    await user.click(screen.getByRole("button", { name: "scan.historyTitle" }));
    await screen.findByText("Latest scan");
    expect(screen.queryByText("First scan")).not.toBeInTheDocument();
    expect(CoreAPI.history).toHaveBeenCalledTimes(2);
  });

  it("should retry history failures instead of presenting them as empty history", async () => {
    responsiveWindow(1440);
    const user = userEvent.setup();
    vi.mocked(CoreAPI.history)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ entries: [] });
    await renderZap("/zap/scan-history");
    await screen.findByText("scan.historyLoadError");
    expect(screen.queryByText("scan.history.empty")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "scan.retry" }));
    await screen.findByText("scan.history.empty");
  });

  it("should not show an old Core's late scan history after switching devices", async () => {
    responsiveWindow(1440);
    let resolveOld!: (value: HistoryResponse) => void;
    const entry = {
      time: "2026-01-01T12:00:00Z",
      type: "nfc",
      uid: "",
      data: "",
      success: true,
    };
    vi.mocked(CoreAPI.history)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
      )
      .mockResolvedValueOnce({
        entries: [{ ...entry, text: "New Core scan" }],
      });
    await renderZap("/zap/scan-history");
    await waitFor(() => expect(CoreAPI.history).toHaveBeenCalledTimes(1));
    await act(async () => {
      await seedActiveDevice({ address: "192.168.1.200" });
    });
    await screen.findByText("New Core scan");
    await act(async () => {
      resolveOld({ entries: [{ ...entry, text: "Old Core scan" }] });
    });
    expect(screen.queryByText("Old Core scan")).not.toBeInTheDocument();
    expect(screen.getByText("New Core scan")).toBeVisible();
  });

  it("should gate play history on unsupported Core versions without requesting it", async () => {
    responsiveWindow(1440);
    useStatusStore.setState({ coreVersion: "2.11.0" });
    await renderZap("/zap/play-history");
    expect(screen.getByText("library.updateCore")).toBeVisible();
    expect(CoreAPI.mediaHistory).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("link", { name: "scan.playHistoryTitle" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "scan.scanHistoryTitle" }),
    ).toBeInTheDocument();
  });

  it("should retain keyboard state, DOM identity and focus across actual Home resize", async () => {
    const resize = responsiveWindow(390);
    const user = userEvent.setup();
    await renderZap();
    await user.click(
      screen.getByRole("button", { name: "scan.remoteKeyboard" }),
    );
    await user.click(
      screen.getByRole("tab", { name: "remoteKeyboard.keyboardMode" }),
    );
    await user.click(screen.getByRole("button", { name: "Shift" }));
    const key = screen.getByRole("button", { name: "Q" });
    key.focus();
    const playback = screen.getByRole("region", {
      name: "scan.nowPlayingHeading",
    });
    await resize(1440);
    expect(screen.getByRole("region", { name: "scan.nowPlayingHeading" })).toBe(
      playback,
    );
    expect(
      screen.getByRole("region", { name: "remoteKeyboard.title" }),
    ).not.toHaveAttribute("aria-modal");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Q" })).toBe(key);
    expect(key).toHaveFocus();
    await resize(390);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(key).toHaveFocus();
    await user.click(key);
    await waitFor(() =>
      expect(CoreAPI.inputKeyboard).toHaveBeenCalledWith({ keys: "Q" }),
    );
  });

  it("should keep cached primary/background media but disable all live controls while reconnecting", async () => {
    responsiveWindow(1180);
    const user = userEvent.setup();
    useStatusStore.setState({
      backgroundPlaying: {
        ...audio,
        mediaName: "Background Track",
        playbackState: "paused",
      },
    });
    await renderZap();
    await act(() => {
      useStatusStore.setState({
        connectionState: ConnectionState.RECONNECTING,
      });
    });
    const primary = screen.getByRole("region", {
      name: "scan.nowPlayingHeading",
    });
    const background = screen.getByRole("region", {
      name: "scan.backgroundMediaHeading",
    });
    expect(within(primary).getByText("Track One")).toBeVisible();
    expect(within(background).getByText("Background Track")).toBeVisible();
    for (const group of [primary, background]) {
      for (const button of within(group).getAllByRole("button"))
        expect(button).toBeDisabled();
    }
    const remote = screen.getByRole("region", { name: "remoteKeyboard.title" });
    const up = within(remote).getByRole("button", {
      name: "remoteKeyboard.up",
    });
    expect(up).toBeDisabled();
    await user.click(up);
    expect(CoreAPI.inputKeyboard).not.toHaveBeenCalled();
    expect(CoreAPI.run).not.toHaveBeenCalled();
    await act(() => {
      useStatusStore.setState({ connectionState: ConnectionState.CONNECTED });
    });
    expect(up).toBeEnabled();
    expect(
      within(background).getByRole("button", { name: "scan.mediaResume" }),
    ).toBeEnabled();
  });

  it("should drive ordinary media with launcher controls, not playlist commands", async () => {
    responsiveWindow(1180);
    const user = userEvent.setup();
    const control = vi.spyOn(CoreAPI, "mediaControl").mockResolvedValue();
    await renderZap();
    const primary = within(
      screen.getByRole("region", { name: "scan.nowPlayingHeading" }),
    );
    expect(
      primary.getByRole("group", { name: "scan.mediaControls" }),
    ).toBeInTheDocument();

    await user.click(primary.getByRole("button", { name: "scan.mediaPause" }));
    await user.click(
      primary.getByRole("button", { name: "scan.playlistNext" }),
    );
    await user.click(
      primary.getByRole("button", { name: "scan.playlistPrevious" }),
    );

    expect(control.mock.calls).toEqual([
      [{ action: "pause" }],
      [{ action: "next" }],
      [{ action: "previous" }],
    ]);
    expect(CoreAPI.run).not.toHaveBeenCalled();
  });

  it("should resume paused background media in its own slot", async () => {
    responsiveWindow(1180);
    const user = userEvent.setup();
    const control = vi.spyOn(CoreAPI, "mediaControl").mockResolvedValue();
    useStatusStore.setState({
      backgroundPlaying: {
        ...audio,
        mediaName: "Background Track",
        playbackState: "paused",
      },
    });
    await renderZap();

    await user.click(
      within(
        screen.getByRole("region", { name: "scan.backgroundMediaHeading" }),
      ).getByRole("button", { name: "scan.mediaResume" }),
    );

    expect(control).toHaveBeenCalledExactlyOnceWith({
      action: "resume",
      slot: "background",
    });
    expect(CoreAPI.run).not.toHaveBeenCalled();
  });

  it("should not report a stop failure from a Core that is no longer selected", async () => {
    responsiveWindow(1180);
    const user = userEvent.setup();
    const toast = vi.spyOn(toastUtils, "showRateLimitedErrorToast");
    let fail!: (error: Error) => void;
    vi.spyOn(CoreAPI, "mediaControl").mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
    );
    useStatusStore.setState({
      backgroundPlaying: { ...audio, mediaName: "Background Track" },
    });
    await renderZap();
    await user.click(
      screen.getByRole("button", { name: "scan.stopBackgroundMediaButton" }),
    );
    await user.click(
      within(
        await screen.findByRole("dialog", { name: "create.nfc.confirm" }),
      ).getByRole("button", { name: "yes" }),
    );
    await waitFor(() =>
      expect(CoreAPI.mediaControl).toHaveBeenCalledWith({
        action: "stop",
        slot: "background",
      }),
    );

    await act(async () => {
      await seedActiveDevice({ address: "192.168.1.101" });
    });
    await act(async () => {
      fail(new Error("old Core went away"));
    });

    expect(toast).not.toHaveBeenCalled();
  });

  it("should put playback first in reading order on wide screens without remounting", async () => {
    const resize = responsiveWindow(390);
    await renderZap();
    const playback = screen.getByRole("region", {
      name: "scan.nowPlayingHeading",
    });
    const controls = screen.getByRole("button", {
      name: "scan.remoteKeyboard",
    });
    // Phone: reader tools lead.
    expect(
      controls.compareDocumentPosition(playback) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    controls.focus();

    await resize(800);

    // Same nodes, now with playback ahead of the reader tools.
    expect(screen.getByRole("region", { name: "scan.nowPlayingHeading" })).toBe(
      playback,
    );
    expect(screen.getByRole("button", { name: "scan.remoteKeyboard" })).toBe(
      controls,
    );
    expect(
      playback.compareDocumentPosition(controls) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(controls).toHaveFocus();

    await resize(390);

    expect(
      controls.compareDocumentPosition(playback) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(controls).toHaveFocus();
  });

  it("should invalidate stop confirmation on Core switch", async () => {
    responsiveWindow(1180);
    const user = userEvent.setup();
    await renderZap();
    await user.click(
      screen.getByRole("button", { name: "scan.stopPlayingButton" }),
    );
    await screen.findByRole("dialog", { name: "create.nfc.confirm" });
    await act(async () => {
      await seedActiveDevice({ address: "192.168.1.101" });
    });
    expect(
      screen.queryByRole("dialog", { name: "create.nfc.confirm" }),
    ).not.toBeInTheDocument();
    expect(CoreAPI.run).not.toHaveBeenCalled();
  });

  it("should not apply late playlist state to a newly selected Core", async () => {
    responsiveWindow(1180);
    const user = userEvent.setup();
    let finish!: () => void;
    vi.mocked(CoreAPI.run).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const playlist: PlaylistState = {
      slot: "primary",
      repeat: "none",
      id: "queue",
      name: "Queue",
      total: 2,
      index: 0,
      playing: false,
      items: [
        { name: "One", zapScript: "one.flac" },
        { name: "Two", zapScript: "two.flac" },
      ],
    };
    useStatusStore.getState().setPlaylist("primary", playlist);
    await renderZap();
    await user.click(screen.getByRole("button", { name: "scan.playlistPlay" }));
    await waitFor(() =>
      expect(CoreAPI.run).toHaveBeenCalledWith({
        text: "**playlist.play?slot=primary",
      }),
    );
    await act(async () => {
      await seedActiveDevice({ address: "192.168.1.101" });
    });
    await act(async () => {
      finish();
    });
    expect(useStatusStore.getState().playlists.primary?.playing).toBe(false);
  });

  it("should keep exactly one active NFC scan through narrow/wide resize", async () => {
    const resize = responsiveWindow(390);
    const user = userEvent.setup();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    usePreferencesStore.setState({ nfcAvailable: true, cameraAvailable: true });
    const read = vi
      .spyOn(nfc, "readTag")
      .mockReturnValue(new Promise(() => {}));
    const cancel = vi.spyOn(nfc, "cancelSession").mockResolvedValue();
    const { unmount } = await renderZap();
    const camera = screen.getByRole("button", { name: "scan.scanCode" });
    const playback = screen.getByRole("region", {
      name: "scan.nowPlayingHeading",
    });
    const readers = screen.getByRole("region", { name: "scan.readersHeading" });
    expect(camera).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "scan.tapTag" }));
    const stop = await screen.findByRole("button", { name: "scan.tapTagStop" });
    expect(camera).toBeDisabled();
    await resize(820);
    expect(screen.getByRole("button", { name: "scan.tapTagStop" })).toBe(stop);
    expect(screen.getByRole("button", { name: "scan.scanCode" })).toBe(camera);
    await resize(1180);
    await resize(1440);
    await resize(390);
    expect(screen.getByRole("button", { name: "scan.tapTagStop" })).toBe(stop);
    expect(screen.getByRole("button", { name: "scan.scanCode" })).toBe(camera);
    expect(camera).toBeDisabled();
    expect(screen.getByRole("region", { name: "scan.nowPlayingHeading" })).toBe(
      playback,
    );
    expect(screen.getByRole("region", { name: "scan.readersHeading" })).toBe(
      readers,
    );
    expect(read).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
  });

  it("should preserve truthful idle controls and screenshot exports while offline", async () => {
    responsiveWindow(1180);
    const user = userEvent.setup();
    useStatusStore.setState({ playing: emptyPlaying() });
    await renderZap();
    await user.click(
      screen.getByRole("button", { name: "remoteKeyboard.screenshotAction" }),
    );
    await screen.findByAltText("remoteKeyboard.screenshotAlt");
    await act(() => {
      useStatusStore.setState({
        connectionState: ConnectionState.DISCONNECTED,
      });
    });
    const primary = screen.getByRole("region", {
      name: "scan.nowPlayingHeading",
    });
    expect(within(primary).getByText("scan.nowPlayingIdle")).toBeVisible();
    const controls = screen.getByRole("region", {
      name: "remoteKeyboard.title",
    });
    expect(
      within(controls).queryByText("remoteKeyboard.disconnected"),
    ).not.toBeInTheDocument();
    expect(
      within(controls).getByRole("button", {
        name: "remoteKeyboard.screenshotAction",
      }),
    ).toBeDisabled();
    expect(
      within(primary).getByRole("button", {
        name: "scan.playLastPlayedUnavailable",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "remoteKeyboard.screenshotDownload" }),
    ).toHaveAttribute("download", "capture.png");
    expect(
      screen.getByRole("button", { name: "remoteKeyboard.screenshotClear" }),
    ).toBeEnabled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, render, screen, waitFor, within } from "@/test-utils";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
import { deviceRegistry } from "@/lib/devices/deviceRegistry";
import { CoreAPI } from "@/lib/coreApi";
import { ConnectionState, useStatusStore } from "@/lib/store";
import {
  libraryBrowseScrollKey,
  useLibrarySessionStore,
} from "@/lib/librarySessionStore";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { Library } from "@/routes/library.index";

const { mockErrorToast, mockNavigate } = vi.hoisted(() => ({
  mockErrorToast: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: unknown) => options,
    useNavigate: () => mockNavigate,
    Link: ({
      children,
      to,
      params,
      onClick,
      ...rest
    }: {
      children: React.ReactNode;
      to: string;
      params?: { system?: string; deckId?: string };
      onClick?: () => void;
      "aria-label"?: string;
    }) => (
      <a
        {...rest}
        href={to
          .replace("$system", params?.system ?? "")
          .replace("$deckId", params?.deckId ?? "")}
        onClick={(event) => {
          event.preventDefault();
          onClick?.();
        }}
      >
        {children}
      </a>
    ),
  };
});

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: () => undefined,
}));

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({ impact: vi.fn() }),
}));

vi.mock("@/lib/toastUtils", () => ({
  showRateLimitedErrorToast: mockErrorToast,
}));

const WINAMP = {
  id: "ab3cdefghijklmnopqrstuvwxy",
  name: "Winamp",
  category: "Other",
  mediaCount: 0,
  zapScript: "zaparoo://ab3cdefghijklmnopqrstuvwxy/Winamp",
};

describe("Library index route", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    CoreAPI.reset();
    vi.spyOn(CoreAPI, "decks").mockResolvedValue({ decks: [] });
    mockNavigate.mockClear();
    mockErrorToast.mockClear();
    usePreferencesStore.setState({
      systemNameRegion: "auto",
      nfcAvailable: false,
    });
    useStatusStore.getState().setWriteQueue("");
    useLibrarySessionStore.getState().reset();
    useTabSessionStore.getState().reset();
    await seedActiveDevice({ recordId: "device-a" });
    useStatusStore.setState({
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      coreVersion: "2.15.0",
      coreVersionPending: false,
      gamesIndex: {
        exists: true,
        indexing: false,
      },
    });
  });

  it("should show row skeletons while systems load", async () => {
    vi.spyOn(CoreAPI, "systems").mockImplementation(
      () => new Promise(() => undefined),
    );

    render(<Library />);

    expect(
      await screen.findByRole("status", { name: "library.loadingSystems" }),
    ).toBeInTheDocument();
    expect(
      await screen.findAllByTestId("library-system-skeleton"),
    ).toHaveLength(5);
  });

  it("keeps Collections available while Systems load", async () => {
    vi.spyOn(CoreAPI, "systems").mockImplementation(
      () => new Promise(() => undefined),
    );
    render(<Library />);
    await userEvent
      .setup()
      .click(screen.getByRole("tab", { name: "library.collections" }));
    expect(
      screen.getByRole("link", { name: "library.favorites" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: "library.loadingSystems" }),
    ).not.toBeInTheDocument();
  });

  it("should list indexed systems alphabetically", async () => {
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [
        { id: "SNES", name: "Super Nintendo" },
        { id: "NES", name: "Nintendo Entertainment System" },
      ],
    });

    render(<Library />);

    expect(
      await screen.findByRole("heading", { name: "library.title" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "library.systems" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tab", { name: "library.collections" }),
    ).toHaveAttribute("aria-selected", "false");
    await screen.findByRole("link", { name: "SNES" });
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["NES", "SNES"]);
    expect(links[0]).toHaveAttribute("href", "/library/NES");
    expect(
      screen.queryByRole("link", { name: "library.favorites" }),
    ).not.toBeInTheDocument();
  });

  it("should show new collections only for Core 2.18 and retain Favorites on older Core", async () => {
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({ systems: [] });
    const { rerender } = render(<Library />);
    await userEvent
      .setup()
      .click(screen.getByRole("tab", { name: "library.collections" }));
    expect(
      screen.getByRole("link", { name: "library.favorites" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "library.liked" }),
    ).not.toBeInTheDocument();

    useStatusStore.setState({ coreVersion: "2.18.0" });
    rerender(<Library />);
    expect(screen.getByRole("link", { name: "library.liked" })).toHaveAttribute(
      "href",
      "/library/liked",
    );
    expect(
      screen.getByRole("link", { name: "library.disliked" }),
    ).toHaveAttribute("href", "/library/disliked");
    expect(
      screen.getByRole("link", { name: "library.playLater" }),
    ).toHaveAttribute("href", "/library/play-later");
  });

  it("lists decks under built-in collections and searches both", async () => {
    useStatusStore.setState({ coreVersion: "2.18.0" });
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({ systems: [] });
    vi.spyOn(CoreAPI, "decks").mockResolvedValue({
      decks: [
        {
          deckId: "0k3v9x2rq7bm",
          name: "Weekend",
          itemCount: 2,
          description: "",
          owned: true,
          locked: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    render(<Library />);
    await userEvent
      .setup()
      .click(screen.getByRole("tab", { name: "library.collections" }));
    expect(
      await screen.findByRole("link", { name: /Weekend/ }),
    ).toHaveAttribute("href", "/library/decks/0k3v9x2rq7bm");
    expect(screen.getByRole("link", { name: "decks.new" })).toHaveAttribute(
      "href",
      "/library/decks/new",
    );
    const search = screen.getByRole("searchbox", {
      name: "decks.search",
    });
    await userEvent.setup().type(search, "Weekend");
    expect(screen.getByRole("link", { name: /Weekend/ })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "library.favorites" }),
    ).toBeInTheDocument();
  });

  it("keeps Systems and Collections as peer views and remembers the last view this session", async () => {
    useStatusStore.setState({ coreVersion: "2.18.0" });
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [{ id: "SNES", name: "Super Nintendo" }],
    });
    const user = userEvent.setup();
    const { unmount } = render(<Library />);
    expect(
      await screen.findByRole("link", { name: "SNES" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "library.optionsTitle" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "library.collections" }));
    expect(
      screen.getByRole("tab", { name: "library.collections" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tabpanel", { name: "library.collections" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "SNES" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "library.optionsTitle" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "library.collections" }))
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "library.favorites",
      "library.liked",
      "library.playLater",
      "library.disliked",
    ]);

    await user.type(
      screen.getByRole("searchbox", { name: "decks.search" }),
      "later",
    );
    expect(
      screen.getByRole("link", { name: "library.playLater" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "library.favorites" }),
    ).toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox", { name: "decks.search" }));
    await user.type(
      screen.getByRole("searchbox", { name: "decks.search" }),
      "unknown",
    );
    expect(screen.getByText("decks.noMatching")).toBeInTheDocument();

    unmount();
    const { unmount: unmountNext } = render(<Library />);
    expect(
      screen.getByRole("tab", { name: "library.collections" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("link", { name: "library.favorites" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "library.systems" }));
    expect(
      await screen.findByRole("link", { name: "SNES" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "library.optionsTitle" }),
    ).toBeInTheDocument();
    unmountNext();
    useLibrarySessionStore.getState().reset();
    render(<Library />);
    expect(
      screen.getByRole("tab", { name: "library.systems" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("shows Collections even when Systems has no results", async () => {
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({ systems: [] });
    const user = userEvent.setup();
    render(<Library />);
    expect(await screen.findByText("library.noSystems")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "library.collections" }));
    expect(
      screen.getByRole("link", { name: "library.favorites" }),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("tabpanel", { name: "library.collections" }),
      ).queryByText("library.noSystems"),
    ).not.toBeInTheDocument();
  });

  it("should reset a system's saved position on forward navigation", async () => {
    const user = userEvent.setup();
    const librarySession = useLibrarySessionStore.getState();
    librarySession.activateDevice("device-a");
    librarySession.setFolderLevels("SNES", [
      { name: "Games", path: "/roms/SNES" },
    ]);
    const scrollKey = libraryBrowseScrollKey("SNES", "name-asc", "/roms/SNES");
    useTabSessionStore.getState().rememberScroll(scrollKey, 0, 480);
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [{ id: "SNES", name: "Super Nintendo" }],
    });

    render(<Library />);
    await user.click(await screen.findByRole("link", { name: "SNES" }));

    expect(
      useTabSessionStore.getState().scrollPositions[scrollKey],
    ).toBeUndefined();
  });

  it("should hide systems with an explicit zero media count", async () => {
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [
        { id: "SNES", name: "Super Nintendo", mediaCount: 150 },
        { id: "3DO", name: "3DO", mediaCount: 0 },
      ],
    });

    render(<Library />);

    expect(
      await screen.findByRole("link", { name: "SNES" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "3DO" })).not.toBeInTheDocument();
  });

  it("should show the empty state when every system has zero media", async () => {
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [
        { id: "SNES", name: "Super Nintendo", mediaCount: 0 },
        { id: "3DO", name: "3DO", mediaCount: 0 },
      ],
    });

    render(<Library />);

    expect(await screen.findByText("library.noSystems")).toBeInTheDocument();
    expect(
      screen.queryByText("systemSelector.noResults"),
    ).not.toBeInTheDocument();
  });

  it("should list virtual systems as actions without listing empty systems", async () => {
    const systemsSpy = vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [
        { id: "SNES", name: "Super Nintendo", mediaCount: 150 },
        { id: "3DO", name: "3DO", mediaCount: 0 },
        WINAMP,
      ],
    });

    render(<Library />);

    expect(
      await screen.findByRole("button", { name: "Winamp" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SNES" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Winamp" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("3DO")).not.toBeInTheDocument();
    expect(systemsSpy).toHaveBeenCalledWith(undefined, {
      includeLaunchables: true,
    });
  });

  it("should not show the empty state when only virtual systems exist", async () => {
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [{ id: "3DO", name: "3DO", mediaCount: 0 }, WINAMP],
    });

    render(<Library />);

    expect(
      await screen.findByRole("button", { name: "Winamp" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("library.noSystems")).not.toBeInTheDocument();
  });

  it("should launch a virtual system from its actions", async () => {
    const user = userEvent.setup();
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({ systems: [WINAMP] });
    vi.spyOn(CoreAPI, "hasWriteCapableReader").mockResolvedValue(false);
    const runSpy = vi.spyOn(CoreAPI, "run").mockResolvedValue();

    render(<Library />);
    await user.click(await screen.findByRole("button", { name: "Winamp" }));
    const dialog = await screen.findByRole("dialog", { name: "Winamp" });
    await user.click(
      within(dialog).getByRole("button", { name: "library.launch" }),
    );

    expect(runSpy).toHaveBeenCalledWith({ text: WINAMP.zapScript });
    expect(mockErrorToast).not.toHaveBeenCalled();
  });

  it("should not launch a virtual system while Core is reconnecting", async () => {
    const user = userEvent.setup();
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({ systems: [WINAMP] });
    vi.spyOn(CoreAPI, "hasWriteCapableReader").mockResolvedValue(false);
    const runSpy = vi.spyOn(CoreAPI, "run").mockResolvedValue();

    render(<Library />);
    await user.click(await screen.findByRole("button", { name: "Winamp" }));
    const dialog = await screen.findByRole("dialog", { name: "Winamp" });
    act(() => {
      useStatusStore
        .getState()
        .setConnectionState(ConnectionState.RECONNECTING);
    });
    const launch = within(dialog).getByRole("button", {
      name: "library.launch",
    });
    expect(launch).toBeDisabled();
    await user.click(launch);

    expect(runSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Winamp" })).toBeInTheDocument();
  });

  it("should report a failed virtual system launch", async () => {
    const user = userEvent.setup();
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({ systems: [WINAMP] });
    vi.spyOn(CoreAPI, "hasWriteCapableReader").mockResolvedValue(false);
    vi.spyOn(CoreAPI, "run").mockRejectedValue(new Error("launch failed"));

    render(<Library />);
    await user.click(await screen.findByRole("button", { name: "Winamp" }));
    const dialog = await screen.findByRole("dialog", { name: "Winamp" });
    await user.click(
      within(dialog).getByRole("button", { name: "library.launch" }),
    );

    await waitFor(() =>
      expect(mockErrorToast).toHaveBeenCalledWith("library.launchSystemError"),
    );
    expect(
      within(dialog).getByRole("button", { name: "library.launch" }),
    ).toBeEnabled();
  });

  it("should write a virtual system's ZapScript to a token", async () => {
    const user = userEvent.setup();
    usePreferencesStore.setState({ nfcAvailable: true });
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({ systems: [WINAMP] });

    render(<Library />);
    await user.click(await screen.findByRole("button", { name: "Winamp" }));
    const dialog = await screen.findByRole("dialog", { name: "Winamp" });
    await user.click(
      within(dialog).getByRole("button", { name: "library.write" }),
    );

    expect(useStatusStore.getState().writeQueue).toBe(WINAMP.zapScript);
  });

  it("should disable writing a virtual system without a writer", async () => {
    const user = userEvent.setup();
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({ systems: [WINAMP] });
    const writerSpy = vi
      .spyOn(CoreAPI, "hasWriteCapableReader")
      .mockResolvedValue(false);

    render(<Library />);
    await user.click(await screen.findByRole("button", { name: "Winamp" }));
    const dialog = await screen.findByRole("dialog", { name: "Winamp" });

    await waitFor(() => expect(writerSpy).toHaveBeenCalled());
    expect(
      within(dialog).getByRole("button", { name: "library.write" }),
    ).toBeDisabled();
    expect(useStatusStore.getState().writeQueue).toBe("");
  });

  it("should disable writing a virtual system to a Core reader while reconnecting", async () => {
    const user = userEvent.setup();
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({ systems: [WINAMP] });
    vi.spyOn(CoreAPI, "hasWriteCapableReader").mockResolvedValue(true);

    render(<Library />);
    await user.click(await screen.findByRole("button", { name: "Winamp" }));
    const dialog = await screen.findByRole("dialog", { name: "Winamp" });
    const write = within(dialog).getByRole("button", {
      name: "library.write",
    });
    await waitFor(() => expect(write).toBeEnabled());

    act(() => {
      useStatusStore
        .getState()
        .setConnectionState(ConnectionState.RECONNECTING);
    });
    expect(write).toBeDisabled();
    await user.click(write);

    expect(useStatusStore.getState().writeQueue).toBe("");
  });

  it("should use the preferred regional system names", async () => {
    usePreferencesStore.setState({ systemNameRegion: "eu" });
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [{ id: "Genesis", name: "Genesis" }],
    });

    render(<Library />);

    expect(await screen.findByText("Mega Drive")).toBeInTheDocument();
  });

  it("should show manufacturer and release year when available", async () => {
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [
        {
          id: "SNES",
          name: "Super Nintendo",
          manufacturer: "Nintendo",
          releaseDate: "1990-11-21",
        },
      ],
    });

    render(<Library />);

    expect(await screen.findByText("Nintendo · 1990")).toBeInTheDocument();
  });

  it("should filter systems by category", async () => {
    const user = userEvent.setup();
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [
        {
          id: "NES",
          name: "Nintendo Entertainment System",
          category: "Nintendo",
        },
        { id: "GENESIS", name: "Sega Genesis", category: "Sega" },
        { id: "PSX", name: "PlayStation", category: "Sony" },
      ],
    });

    render(<Library />);
    await user.click(await screen.findByRole("tab", { name: "Sega" }));

    expect(
      screen.getByRole("link", { name: "Sega Genesis" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "NES" })).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel", { name: "Sega" })).toBeInTheDocument();
  });

  it("should open full-page game search from the header", async () => {
    const user = userEvent.setup();
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [{ id: "NES", name: "Nintendo Entertainment System" }],
    });

    render(<Library />);
    await user.click(
      await screen.findByRole("button", { name: "library.searchTitle" }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/library/search" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("should apply and clear manufacturer and release-period filters", async () => {
    const user = userEvent.setup();
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [
        {
          id: "NES",
          name: "Nintendo Entertainment System",
          manufacturer: "Nintendo",
          releaseDate: "1983",
        },
        {
          id: "N64",
          name: "Nintendo 64",
          manufacturer: "Nintendo",
          releaseDate: "1996",
        },
        {
          id: "PSX",
          name: "PlayStation",
          manufacturer: "Sony",
          releaseDate: "1994",
        },
      ],
    });

    render(<Library />);
    await user.click(
      await screen.findByRole("button", { name: "library.optionsTitle" }),
    );
    expect(
      screen.getByRole("dialog", { name: "library.optionsTitle" }),
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "library.manufacturer" }),
      "Nintendo",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "library.releasePeriod" }),
      "1990s",
    );
    await user.click(
      screen.getByRole("button", { name: "library.showSystems" }),
    );

    expect(screen.getByText("Nintendo 64")).toBeInTheDocument();
    expect(screen.queryByText("NES")).not.toBeInTheDocument();
    expect(screen.queryByText("PlayStation")).not.toBeInTheDocument();
    expect(screen.getByLabelText("library.activeOptions")).toHaveTextContent(
      "Nintendo · library.releasePeriod1990s",
    );

    await user.click(
      screen.getByRole("button", { name: "library.clearOptions" }),
    );
    expect(screen.getByText("NES")).toBeInTheDocument();
    expect(screen.getByText("PlayStation")).toBeInTheDocument();
  });

  it("should retain refinements after leaving and returning", async () => {
    const user = userEvent.setup();
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [
        {
          id: "NES",
          name: "Nintendo Entertainment System",
          category: "Nintendo",
          manufacturer: "Nintendo",
          releaseDate: "1983",
        },
        {
          id: "N64",
          name: "Nintendo 64",
          category: "Nintendo",
          manufacturer: "Nintendo",
          releaseDate: "1996",
        },
        {
          id: "PSX",
          name: "PlayStation",
          category: "Sony",
          manufacturer: "Sony",
          releaseDate: "1994",
        },
      ],
    });

    const view = render(<Library />);
    await user.click(await screen.findByRole("tab", { name: "Nintendo" }));
    await user.click(
      screen.getByRole("button", { name: "library.optionsTitle" }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "library.manufacturer" }),
      "Nintendo",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "library.releasePeriod" }),
      "1990s",
    );
    await user.click(
      screen.getByRole("radio", { name: "library.sortYearDesc" }),
    );
    await user.click(
      screen.getByRole("button", { name: "library.showSystems" }),
    );
    view.unmount();

    render(<Library />);

    expect(
      await screen.findByRole("tab", { name: "Nintendo" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("library.activeOptions")).toHaveTextContent(
      "Nintendo · library.releasePeriod1990s · library.sortYearDesc",
    );
    expect(screen.getByText("Nintendo 64")).toBeInTheDocument();
    expect(screen.queryByText("NES")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "library.optionsTitle" }),
    );
    expect(
      screen.getByRole("radio", { name: "library.sortYearDesc" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("should reset refinements after changing devices", async () => {
    const user = userEvent.setup();
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [
        {
          id: "NES",
          name: "Nintendo Entertainment System",
          category: "Nintendo",
          manufacturer: "Nintendo",
        },
        {
          id: "PSX",
          name: "PlayStation",
          category: "Sony",
          manufacturer: "Sony",
        },
      ],
    });

    const view = render(<Library />);
    await user.click(await screen.findByRole("tab", { name: "Nintendo" }));
    await user.click(
      screen.getByRole("button", { name: "library.optionsTitle" }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "library.manufacturer" }),
      "Nintendo",
    );
    await user.click(
      screen.getByRole("radio", { name: "library.sortNameDesc" }),
    );
    await user.click(
      screen.getByRole("button", { name: "library.showSystems" }),
    );
    await user.click(screen.getByRole("tab", { name: "library.collections" }));
    view.unmount();

    await deviceRegistry.selectAddress("192.168.1.55");
    render(<Library />);

    expect(
      screen.getByRole("tab", { name: "library.systems" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      await screen.findByRole("tab", { name: "systemSelector.allCategories" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.queryByLabelText("library.activeOptions"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("NES")).toBeInTheDocument();
    expect(screen.getByText("PlayStation")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "library.optionsTitle" }),
    );
    expect(
      screen.getByRole("radio", { name: "library.sortNameAsc" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("should reset draft filters before applying", async () => {
    const user = userEvent.setup();
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [
        { id: "NES", name: "NES", manufacturer: "Nintendo" },
        { id: "PSX", name: "PlayStation", manufacturer: "Sony" },
      ],
    });

    render(<Library />);
    await user.click(
      await screen.findByRole("button", { name: "library.optionsTitle" }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "library.manufacturer" }),
      "Nintendo",
    );
    await user.click(
      screen.getByRole("button", { name: "library.resetOptions" }),
    );
    await user.click(
      screen.getByRole("button", { name: "library.showSystems" }),
    );

    expect(screen.getByText("NES")).toBeInTheDocument();
    expect(screen.getByText("PlayStation")).toBeInTheDocument();
  });

  it("should sort systems by release year", async () => {
    const user = userEvent.setup();
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [
        { id: "NES", name: "NES", releaseDate: "1983" },
        { id: "N64", name: "Nintendo 64", releaseDate: "1996" },
        { id: "UNKNOWN", name: "Unknown" },
      ],
    });

    render(<Library />);
    await user.click(
      await screen.findByRole("button", { name: "library.optionsTitle" }),
    );
    await user.click(
      screen.getByRole("radio", { name: "library.sortYearDesc" }),
    );
    await user.click(
      screen.getByRole("button", { name: "library.showSystems" }),
    );

    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["/library/N64", "/library/NES", "/library/UNKNOWN"]);
  });

  it("should show disconnected state without fetching systems", () => {
    useStatusStore.setState({ connected: false });
    const systemsSpy = vi.spyOn(CoreAPI, "systems");

    render(<Library />);

    expect(screen.getByText("library.disconnected")).toBeInTheDocument();
    expect(systemsSpy).not.toHaveBeenCalled();
  });

  it("should link missing databases to media settings", () => {
    useStatusStore.setState({
      gamesIndex: { exists: false, indexing: false },
    });

    render(<Library />);

    expect(screen.getByText("library.databaseRequired")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "library.openMediaSettings" }),
    ).toHaveAttribute("href", "/settings");
  });

  it("browses decks even when no media index exists", async () => {
    useStatusStore.setState({
      coreVersion: "2.18.0",
      gamesIndex: { exists: false, indexing: false },
    });
    vi.spyOn(CoreAPI, "decks").mockResolvedValue({
      decks: [
        {
          deckId: "0k3v9x2rq7bm",
          name: "Weekend",
          itemCount: 0,
          description: "",
          owned: true,
          locked: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    render(<Library />);
    await userEvent
      .setup()
      .click(screen.getByRole("tab", { name: "library.collections" }));
    expect(
      await screen.findByRole("link", { name: /Weekend/ }),
    ).toBeInTheDocument();
  });

  it("should show update state for unsupported Core", () => {
    useStatusStore.setState({ coreVersion: "2.14.9" });

    render(<Library />);

    expect(screen.getByText("library.updateCore")).toBeInTheDocument();
    expect(
      screen.getByText("features.requiresCoreVersion"),
    ).toBeInTheDocument();
  });

  it("should allow retry after a systems failure", async () => {
    const systemsSpy = vi
      .spyOn(CoreAPI, "systems")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ systems: [{ id: "NES", name: "NES" }] });
    render(<Library />);

    const retry = await screen.findByRole("button", {
      name: "library.tryAgain",
    });
    retry.click();

    expect(
      await screen.findByRole("link", { name: "NES" }),
    ).toBeInTheDocument();
    expect(systemsSpy).toHaveBeenCalledTimes(2);
  });
});

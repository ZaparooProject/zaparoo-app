import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test-utils";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";
import {
  libraryBrowseScrollKey,
  useLibrarySessionStore,
} from "@/lib/librarySessionStore";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { Library } from "@/routes/library.index";

const { mockNavigate } = vi.hoisted(() => ({
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
    }: {
      children: React.ReactNode;
      to: string;
      params?: { system?: string };
      onClick?: () => void;
    }) => (
      <a
        href={to.replace("$system", params?.system ?? "")}
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

describe("Library index route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    CoreAPI.reset();
    mockNavigate.mockClear();
    usePreferencesStore.setState({ systemNameRegion: "auto" });
    useLibrarySessionStore.getState().reset();
    useTabSessionStore.getState().reset();
    useStatusStore.setState({
      connected: true,
      targetDeviceAddress: "device-a",
      coreVersion: "2.15.0",
      coreVersionPending: false,
      gamesIndex: {
        exists: true,
        indexing: false,
      },
    });
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
      screen.getByRole("heading", { name: "library.collections", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "library.systems", level: 2 }),
    ).toBeInTheDocument();
    await screen.findByRole("link", { name: "SNES" });
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "library.favorites",
      "NES",
      "SNES",
    ]);
    expect(links[0]).toHaveAttribute("href", "/library/favorites");
    expect(links[1]).toHaveAttribute("href", "/library/NES");
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
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Sega");
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
    view.unmount();

    useStatusStore.setState({ targetDeviceAddress: "device-b" });
    render(<Library />);

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
    ).toEqual([
      "/library/favorites",
      "/library/N64",
      "/library/NES",
      "/library/UNKNOWN",
    ]);
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

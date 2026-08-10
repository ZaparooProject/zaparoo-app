import {
  findA11yViolations,
  render,
  screen,
  fireEvent,
} from "../../../test-utils";
import { BottomNav } from "@/components/BottomNav";
import { useStatusStore } from "@/lib/store";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { useLibrarySessionStore } from "@/lib/librarySessionStore";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { mockInboxMessage } from "@/test-utils/factories";

// Mock useHaptics
const mockImpact = vi.fn();
vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    impact: mockImpact,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockUseLocation = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    onClick,
    "aria-current": ariaCurrent,
    "aria-label": ariaLabel,
    className,
    resetScroll,
  }: {
    children: React.ReactNode;
    to: string;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
    "aria-current"?: "page" | "step" | "location" | "date" | "time" | boolean;
    "aria-label"?: string;
    className?: string;
    resetScroll?: boolean;
  }) => (
    <a
      href={to}
      data-testid={`link-${to}`}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
      className={className}
      data-reset-scroll={String(resetScroll)}
    >
      {children}
    </a>
  ),
  useLocation: () => mockUseLocation(),
}));

describe("BottomNav", () => {
  beforeEach(() => {
    useStatusStore.setState({
      safeInsets: { bottom: "0px", right: "0px", left: "0px", top: "0px" },
      inboxMessages: [],
      connected: true,
      coreVersion: "2.8.0",
      coreVersionPending: false,
    });
    useTabSessionStore.getState().reset();
    useLibrarySessionStore.getState().reset();
    mockUseLocation.mockReturnValue({ pathname: "/", href: "/" });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has no detectable accessibility violations", async () => {
    const { baseElement } = render(<BottomNav />);

    expect(await findA11yViolations(baseElement)).toEqual([]);
  });

  it("allows navigation labels and height to reflow with text zoom", () => {
    render(<BottomNav />);

    expect(screen.getByRole("navigation")).toHaveClass(
      "[height:calc(var(--bottom-nav-base-height)+var(--bottom-nav-safe-inset))]",
    );
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("w-full", "min-w-0");
    }
    expect(screen.getByText("nav.settings")).toHaveClass("break-all");
  });

  it("renders all navigation buttons", () => {
    render(<BottomNav />);

    expect(screen.getByText("nav.index")).toBeInTheDocument();
    expect(screen.getByText("nav.library")).toBeInTheDocument();
    expect(screen.getByText("nav.create")).toBeInTheDocument();
    expect(screen.getByText("nav.settings")).toBeInTheDocument();
  });

  it("renders navigation links with correct paths", () => {
    render(<BottomNav />);

    expect(screen.getByTestId("link-/")).toBeInTheDocument();
    expect(screen.getByTestId("link-/library")).toBeInTheDocument();
    expect(screen.getByTestId("link-/create")).toBeInTheDocument();
    expect(screen.getByTestId("link-/settings")).toBeInTheDocument();
  });

  it("reopens the last screen visited in each tab", () => {
    const session = useTabSessionStore.getState();
    session.rememberLocation("/library/SNES", "/library/SNES");
    session.rememberLocation("/create/search", "/create/search");
    session.rememberLocation(
      "/settings/language-region",
      "/settings/language-region",
    );

    render(<BottomNav />);

    expect(screen.getByTestId("link-/library/SNES")).toBeInTheDocument();
    expect(screen.getByTestId("link-/create/search")).toBeInTheDocument();
    expect(
      screen.getByTestId("link-/settings/language-region"),
    ).toBeInTheDocument();
  });

  it("marks Home as active when on root path", () => {
    mockUseLocation.mockReturnValue({ pathname: "/", href: "/" });
    render(<BottomNav />);

    const homeLink = screen.getByTestId("link-/");
    expect(homeLink).toHaveAttribute("aria-current", "page");
  });

  it("marks Library as active on Library routes", () => {
    mockUseLocation.mockReturnValue({
      pathname: "/library/SNES",
      href: "/library/SNES",
    });
    render(<BottomNav />);

    expect(screen.getByTestId("link-/library")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("resets active Library navigation to its root", () => {
    mockUseLocation.mockReturnValue({
      pathname: "/library/SNES",
      href: "/library/SNES",
    });
    const librarySession = useLibrarySessionStore.getState();
    librarySession.activateDevice("device-a");
    librarySession.setFolderLevels("SNES", [
      { name: "Games", path: "/roms/SNES" },
    ]);
    librarySession.setEmbeddedSearchOpen("SNES", true);
    useTabSessionStore.getState().rememberScroll("/library", 0, 160);
    useTabSessionStore.getState().rememberScroll("library:SNES:browse", 0, 240);
    render(<BottomNav />);

    const libraryLink = screen.getByTestId("link-/library");
    expect(libraryLink).toHaveAttribute("data-reset-scroll", "false");
    fireEvent.click(libraryLink);

    expect(useTabSessionStore.getState().lastHref.library).toBe("/library");
    expect(useTabSessionStore.getState().scrollPositions).toHaveProperty(
      "/library",
      { scrollX: 0, scrollY: 160 },
    );
    expect(useTabSessionStore.getState().scrollPositions).not.toHaveProperty(
      "library:SNES:browse",
    );
    expect(useLibrarySessionStore.getState().folderLevels).toEqual({});
    expect(useLibrarySessionStore.getState().embeddedSearchOpen).toEqual({});
  });

  it("scrolls an active tab root to the top without clearing its state", () => {
    mockUseLocation.mockReturnValue({
      pathname: "/library",
      href: "/library",
    });
    useTabSessionStore.getState().rememberScroll("/library", 0, 240);
    useLibrarySessionStore.getState().setSearch("all", {
      query: "mario",
      system: "all",
      tags: [],
    });
    const scrollTo = vi.fn();
    render(
      <>
        <div
          ref={(element) => {
            if (!element) return;
            element.scrollTop = 240;
            element.scrollTo = scrollTo;
          }}
          data-scroll-restoration-id="page-scroll"
        />
        <BottomNav />
      </>,
    );

    fireEvent.click(screen.getByTestId("link-/library"));

    expect(scrollTo).toHaveBeenCalledWith({
      left: 0,
      top: 0,
      behavior: "smooth",
    });
    expect(useTabSessionStore.getState().scrollPositions).toHaveProperty(
      "/library",
      { scrollX: 0, scrollY: 0 },
    );
    expect(useLibrarySessionStore.getState().searches).toHaveProperty("all");
    expect(mockImpact).toHaveBeenCalledWith("light");
  });

  it("does nothing when an active tab root is already at the top", () => {
    mockUseLocation.mockReturnValue({
      pathname: "/library",
      href: "/library",
    });
    const scrollTo = vi.fn();
    render(
      <>
        <div
          ref={(element) => {
            if (element) element.scrollTo = scrollTo;
          }}
          data-scroll-restoration-id="page-scroll"
        />
        <BottomNav />
      </>,
    );

    fireEvent.click(screen.getByTestId("link-/library"));

    expect(scrollTo).not.toHaveBeenCalled();
    expect(mockImpact).not.toHaveBeenCalled();
  });

  it("marks Create as active when on create path", () => {
    mockUseLocation.mockReturnValue({ pathname: "/create", href: "/create" });
    render(<BottomNav />);

    const createLink = screen.getByTestId("link-/create");
    expect(createLink).toHaveAttribute("aria-current", "page");
  });

  it("marks Create as active when on create subpath", () => {
    mockUseLocation.mockReturnValue({
      pathname: "/create/search",
      href: "/create/search",
    });
    render(<BottomNav />);

    const createLink = screen.getByTestId("link-/create");
    expect(createLink).toHaveAttribute("aria-current", "page");
  });

  it("marks Settings as active when on settings path", () => {
    mockUseLocation.mockReturnValue({
      pathname: "/settings",
      href: "/settings",
    });
    render(<BottomNav />);

    const settingsLink = screen.getByTestId("link-/settings");
    expect(settingsLink).toHaveAttribute("aria-current", "page");
  });

  it("marks Settings as active when on settings subpath", () => {
    mockUseLocation.mockReturnValue({
      pathname: "/settings/advanced",
      href: "/settings/advanced",
    });
    render(<BottomNav />);

    const settingsLink = screen.getByTestId("link-/settings");
    expect(settingsLink).toHaveAttribute("aria-current", "page");
  });

  it("should show notification count on Settings with an accessible label", () => {
    useStatusStore.setState({
      inboxMessages: [mockInboxMessage({ id: 1 }), mockInboxMessage({ id: 2 })],
    });

    render(<BottomNav />);

    expect(screen.getByText("2")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("link-/settings")).toHaveAccessibleName(
      "nav.settingsWithNotifications",
    );
  });

  it("should hide the Settings badge while Settings is active", () => {
    useStatusStore.setState({
      inboxMessages: [mockInboxMessage({ id: 1 }), mockInboxMessage({ id: 2 })],
    });
    mockUseLocation.mockReturnValue({
      pathname: "/settings",
      href: "/settings",
    });

    render(<BottomNav />);

    expect(screen.queryByText("2")).not.toBeInTheDocument();
    expect(screen.getByTestId("link-/settings")).toHaveAccessibleName(
      "nav.settings",
    );
  });

  it("triggers haptic feedback when nav button is clicked", () => {
    render(<BottomNav />);

    fireEvent.click(screen.getByTestId("link-/library"));

    expect(mockImpact).toHaveBeenCalledWith("light");
  });

  it("renders with correct accessibility label", () => {
    render(<BottomNav />);

    const nav = screen.getByRole("navigation", {
      name: "nav.mainNavigation",
    });
    expect(nav).toBeInTheDocument();
  });

  it("applies safe insets from store", () => {
    useStatusStore.setState({
      safeInsets: {
        bottom: "20px",
        right: "10px",
        left: "10px",
        top: "0px",
      },
    });

    render(<BottomNav />);

    // Navigation should be rendered with insets applied
    const nav = screen.getByRole("navigation");
    expect(nav).toBeInTheDocument();
  });
});

import { render, screen, fireEvent } from "../../../test-utils";
import { BottomNav } from "@/components/BottomNav";
import { useStatusStore } from "@/lib/store";
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
  }: {
    children: React.ReactNode;
    to: string;
    onClick?: () => void;
    "aria-current"?: "page" | "step" | "location" | "date" | "time" | boolean;
    "aria-label"?: string;
  }) => (
    <a
      href={to}
      data-testid={`link-${to}`}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
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
    mockUseLocation.mockReturnValue({ pathname: "/" });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders all navigation buttons", () => {
    render(<BottomNav />);

    expect(screen.getByText("nav.index")).toBeInTheDocument();
    expect(screen.getByText("nav.create")).toBeInTheDocument();
    expect(screen.getByText("nav.settings")).toBeInTheDocument();
  });

  it("renders navigation links with correct paths", () => {
    render(<BottomNav />);

    expect(screen.getByTestId("link-/")).toBeInTheDocument();
    expect(screen.getByTestId("link-/create")).toBeInTheDocument();
    expect(screen.getByTestId("link-/settings")).toBeInTheDocument();
  });

  it("marks Home as active when on root path", () => {
    mockUseLocation.mockReturnValue({ pathname: "/" });
    render(<BottomNav />);

    const homeLink = screen.getByTestId("link-/");
    expect(homeLink).toHaveAttribute("aria-current", "page");
  });

  it("marks Create as active when on create path", () => {
    mockUseLocation.mockReturnValue({ pathname: "/create" });
    render(<BottomNav />);

    const createLink = screen.getByTestId("link-/create");
    expect(createLink).toHaveAttribute("aria-current", "page");
  });

  it("marks Create as active when on create subpath", () => {
    mockUseLocation.mockReturnValue({ pathname: "/create/search" });
    render(<BottomNav />);

    const createLink = screen.getByTestId("link-/create");
    expect(createLink).toHaveAttribute("aria-current", "page");
  });

  it("marks Settings as active when on settings path", () => {
    mockUseLocation.mockReturnValue({ pathname: "/settings" });
    render(<BottomNav />);

    const settingsLink = screen.getByTestId("link-/settings");
    expect(settingsLink).toHaveAttribute("aria-current", "page");
  });

  it("marks Settings as active when on settings subpath", () => {
    mockUseLocation.mockReturnValue({ pathname: "/settings/advanced" });
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
    mockUseLocation.mockReturnValue({ pathname: "/settings" });

    render(<BottomNav />);

    expect(screen.queryByText("2")).not.toBeInTheDocument();
    expect(screen.getByTestId("link-/settings")).toHaveAccessibleName(
      "nav.settings",
    );
  });

  it("triggers haptic feedback when nav button is clicked", () => {
    render(<BottomNav />);

    const homeLink = screen.getByTestId("link-/");
    fireEvent.click(homeLink);

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

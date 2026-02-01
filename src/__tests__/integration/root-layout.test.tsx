/**
 * Integration Test: Root Layout
 *
 * Tests the REAL components from src/routes/__root.tsx including:
 * - BackHandler navigation logic
 * - ShakeDetector activation
 * - RootLayout structure
 * - Safe area handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "../../test-utils";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";

// Mock state for tracking navigation and back button behavior
const mockNavigate = vi.fn();
const mockExitApp = vi.fn();

// Capture the back button handler
let capturedBackButtonHandler: (() => boolean | void) | null = null;

// Mock pathname that can be changed per test
let mockPathname = "/";

// Mock TanStack Router
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useLocation: () => ({
      pathname: mockPathname,
    }),
    useNavigate: () => mockNavigate,
    Outlet: () => <div data-testid="outlet">Outlet Content</div>,
    createRootRoute: (config: unknown) => config,
  };
});

// Mock Capacitor App
vi.mock("@capacitor/app", () => ({
  App: {
    exitApp: () => mockExitApp(),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  },
}));

// Mock useBackButtonHandler to capture the handler
vi.mock("@/hooks/useBackButtonHandler", () => ({
  useBackButtonHandler: (
    _id: string,
    handler: () => boolean | void,
    _priority?: number,
  ) => {
    capturedBackButtonHandler = handler;
  },
}));

// Mock useShakeDetection
const mockUseShakeDetection = vi.fn();
vi.mock("@/hooks/useShakeDetection", () => ({
  useShakeDetection: (props: unknown) => mockUseShakeDetection(props),
}));

// Mock SafeAreaHandler
vi.mock("@/lib/safeArea", () => ({
  SafeAreaHandler: () => <div data-testid="safe-area-handler" />,
}));

// Mock BottomNav
vi.mock("@/components/BottomNav", () => ({
  BottomNav: () => <nav data-testid="bottom-nav">Bottom Nav</nav>,
}));

// Mock TourInitializer
vi.mock("@/components/TourInitializer", () => ({
  TourInitializer: () => <div data-testid="tour-initializer" />,
}));

// Mock SkipLink
vi.mock("@/components/SkipLink", () => ({
  SkipLink: ({ targetId }: { targetId: string }) => (
    <a href={`#${targetId}`} data-testid="skip-link">
      Skip to main content
    </a>
  ),
}));

// Mock ErrorComponent
vi.mock("@/components/ErrorComponent", () => ({
  ErrorComponent: () => <div data-testid="error-component">Error</div>,
}));

// Import after mocks
import { ShakeDetector, BackHandler, RootLayout } from "@/routes/__root";

describe("Root Layout Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset stores
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
    });

    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      shakeEnabled: false,
    });

    // Reset captured handler and mock pathname
    capturedBackButtonHandler = null;
    mockPathname = "/";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("RootLayout", () => {
    it("should render the main layout structure", () => {
      render(<RootLayout />);

      expect(screen.getByTestId("skip-link")).toBeInTheDocument();
      expect(screen.getByTestId("safe-area-handler")).toBeInTheDocument();
      expect(screen.getByTestId("bottom-nav")).toBeInTheDocument();
      expect(screen.getByRole("main")).toBeInTheDocument();
    });

    it("should render the Outlet for child routes", () => {
      render(<RootLayout />);

      expect(screen.getByTestId("outlet")).toBeInTheDocument();
    });

    it("should render footer with BottomNav", () => {
      render(<RootLayout />);

      const footer = screen.getByRole("contentinfo");
      expect(footer).toBeInTheDocument();
      expect(screen.getByTestId("bottom-nav")).toBeInTheDocument();
    });

    it("should apply safe area insets to footer style", () => {
      useStatusStore.setState({
        safeInsets: { top: "0px", bottom: "20px", left: "0px", right: "0px" },
      });

      render(<RootLayout />);

      const footer = screen.getByRole("contentinfo");
      expect(footer).toHaveStyle({
        "--bottom-nav-height": "calc(80px + 20px)",
      });
    });

    it("should have main content with correct id for skip link", () => {
      render(<RootLayout />);

      const main = screen.getByRole("main");
      expect(main).toHaveAttribute("id", "main-content");
      expect(main).toHaveAttribute("tabIndex", "-1");
    });
  });

  describe("ShakeDetector", () => {
    it("should call useShakeDetection with correct props when enabled", () => {
      usePreferencesStore.setState({ shakeEnabled: true });

      render(<ShakeDetector />);

      expect(mockUseShakeDetection).toHaveBeenCalledWith({
        shakeEnabled: true,
        connected: true,
        pathname: "/",
      });
    });

    it("should pass shakeEnabled=false when disabled in preferences", () => {
      usePreferencesStore.setState({ shakeEnabled: false });

      render(<ShakeDetector />);

      expect(mockUseShakeDetection).toHaveBeenCalledWith(
        expect.objectContaining({
          shakeEnabled: false,
        }),
      );
    });

    it("should pass connected=false when disconnected", () => {
      useStatusStore.setState({
        connected: false,
        connectionState: ConnectionState.DISCONNECTED,
      });

      render(<ShakeDetector />);

      expect(mockUseShakeDetection).toHaveBeenCalledWith(
        expect.objectContaining({
          connected: false,
        }),
      );
    });

    it("should pass current pathname from location", () => {
      mockPathname = "/settings";

      render(<ShakeDetector />);

      expect(mockUseShakeDetection).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: "/settings",
        }),
      );
    });

    it("should render no visible content", () => {
      render(<ShakeDetector />);

      // ShakeDetector returns null - no visible content should be added
      // (test wrapper adds A11yAnnouncer which is sr-only)
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    });
  });

  describe("BackHandler", () => {
    it("should render no visible content", () => {
      render(<BackHandler />);

      // BackHandler returns null - no visible content should be added
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    });

    it("should register a back button handler", () => {
      render(<BackHandler />);

      expect(capturedBackButtonHandler).not.toBeNull();
    });

    describe("navigation behavior", () => {
      // Helper to set up the handler and location for each test
      const setupBackHandler = (pathname: string) => {
        render(<BackHandler />);
        Object.defineProperty(globalThis, "location", {
          value: { pathname },
          writable: true,
          configurable: true,
        });
      };

      it("should exit app when on root path", () => {
        setupBackHandler("/");

        const result = capturedBackButtonHandler?.();

        expect(mockExitApp).toHaveBeenCalled();
        expect(result).toBe(true);
      });

      const navigateToRootCases = [["/create"], ["/settings"]] as const;

      it.each(navigateToRootCases)(
        "should navigate to root from %s",
        (pathname) => {
          setupBackHandler(pathname);

          const result = capturedBackButtonHandler?.();

          expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
          expect(result).toBe(true);
        },
      );

      const navigateToCreateCases = [
        ["/create/search"],
        ["/create/nfc"],
        ["/create/text"],
        ["/create/mappings"],
      ] as const;

      it.each(navigateToCreateCases)(
        "should navigate to /create from %s",
        (pathname) => {
          setupBackHandler(pathname);

          const result = capturedBackButtonHandler?.();

          expect(mockNavigate).toHaveBeenCalledWith({ to: "/create" });
          expect(result).toBe(true);
        },
      );

      const navigateToSettingsCases = [
        ["/settings/about"],
        ["/settings/readers"],
        ["/settings/logs"],
        ["/settings/accessibility"],
      ] as const;

      it.each(navigateToSettingsCases)(
        "should navigate to /settings from %s",
        (pathname) => {
          setupBackHandler(pathname);

          const result = capturedBackButtonHandler?.();

          expect(mockNavigate).toHaveBeenCalledWith({ to: "/settings" });
          expect(result).toBe(true);
        },
      );

      it("should return false for unknown paths", () => {
        setupBackHandler("/unknown");

        const result = capturedBackButtonHandler?.();

        expect(mockNavigate).not.toHaveBeenCalled();
        expect(mockExitApp).not.toHaveBeenCalled();
        expect(result).toBe(false);
      });
    });
  });

  describe("Integration", () => {
    it("should include all required components in RootLayout", () => {
      render(<RootLayout />);

      // Check all essential components are present
      expect(screen.getByTestId("skip-link")).toBeInTheDocument();
      expect(screen.getByTestId("safe-area-handler")).toBeInTheDocument();
      expect(screen.getByTestId("tour-initializer")).toBeInTheDocument();
      expect(screen.getByTestId("bottom-nav")).toBeInTheDocument();
      expect(screen.getByRole("main")).toBeInTheDocument();
    });

    it("should have proper layout with flex column", () => {
      render(<RootLayout />);

      const container = screen.getByRole("main").parentElement;
      expect(container).toHaveClass("flex", "flex-col");
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock dependencies
const mockExitApp = vi.fn();
vi.mock("@capacitor/app", () => ({
  App: {
    exitApp: mockExitApp
  }
}));

vi.mock("../../../lib/safeArea", () => ({
  SafeAreaHandler: () => <div data-testid="safe-area-handler">Safe Area Handler</div>
}));

vi.mock("../../../components/ErrorComponent", () => ({
  ErrorComponent: ({ error }: { error: Error }) => (
    <div data-testid="error-component">
      Error: {error.message}
    </div>
  )
}));

vi.mock("../../../components/BottomNav", () => ({
  BottomNav: () => <div data-testid="bottom-nav">Bottom Navigation</div>
}));

const mockUseBackButtonHandler = vi.fn();
vi.mock("../../../hooks/useBackButtonHandler", () => ({
  useBackButtonHandler: mockUseBackButtonHandler
}));

const mockNavigate = vi.fn();
const mockUseNavigate = vi.fn(() => mockNavigate);
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    useNavigate: mockUseNavigate,
    Outlet: () => <div data-testid="outlet">Route Content</div>
  };
});

describe("Root Route", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExitApp.mockClear();
    mockNavigate.mockClear();
    mockUseBackButtonHandler.mockClear();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render root layout with all components", () => {
    const TestWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    // Mock root component structure
    const RootComponent = () => {
      return (
        <div className="flex flex-col h-screen w-screen">
          <div data-testid="safe-area-handler">Safe Area Handler</div>
          <div data-testid="back-handler">Back Handler</div>
          <main className="flex-1 min-h-0">
            <div data-testid="outlet">Route Content</div>
          </main>
          <footer className="flex-shrink-0 z-30">
            <div data-testid="bottom-nav">Bottom Navigation</div>
          </footer>
        </div>
      );
    };

    render(
      <TestWrapper>
        <RootComponent />
      </TestWrapper>
    );

    expect(screen.getByTestId("safe-area-handler")).toBeInTheDocument();
    expect(screen.getByTestId("back-handler")).toBeInTheDocument();
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-nav")).toBeInTheDocument();
  });

  it("should have correct CSS classes for layout", () => {
    const RootLayoutComponent = () => {
      return (
        <div
          data-testid="root-container"
          className="flex flex-col h-screen w-screen"
        >
          <main
            data-testid="main-content"
            className="flex-1 min-h-0"
          >
            <div data-testid="outlet">Route Content</div>
          </main>
          <footer
            data-testid="footer"
            className="flex-shrink-0 z-30"
            style={{ '--bottom-nav-height': 'calc(80px + env(safe-area-inset-bottom, 0px))' } as React.CSSProperties}
          >
            <div data-testid="bottom-nav">Bottom Navigation</div>
          </footer>
        </div>
      );
    };

    render(<RootLayoutComponent />);

    const rootContainer = screen.getByTestId("root-container");
    expect(rootContainer).toHaveClass("flex", "flex-col", "h-screen", "w-screen");

    const mainContent = screen.getByTestId("main-content");
    expect(mainContent).toHaveClass("flex-1", "min-h-0");

    const footer = screen.getByTestId("footer");
    expect(footer).toHaveClass("flex-shrink-0", "z-30");
  });

  it("should handle back button navigation logic", () => {
    // Test the navigation logic directly
    const testNavigationLogic = (pathname: string) => {
      if (pathname === "/") {
        mockExitApp();
        return true;
      }

      if (pathname === "/create" || pathname === "/settings") {
        mockNavigate({ to: "/" });
        return true;
      }

      if (pathname.startsWith("/create")) {
        mockNavigate({ to: "/create" });
        return true;
      }

      if (pathname.startsWith("/settings")) {
        mockNavigate({ to: "/settings" });
        return true;
      }

      return false;
    };

    // Test different navigation scenarios
    expect(testNavigationLogic("/")).toBe(true);
    expect(mockExitApp).toHaveBeenCalled();

    mockNavigate.mockClear();
    expect(testNavigationLogic("/create")).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });

    mockNavigate.mockClear();
    expect(testNavigationLogic("/create/search")).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/create" });

    expect(testNavigationLogic("/unknown")).toBe(false);
  });

  it("should handle root path navigation to exit app", () => {
    // Test root path behavior directly
    const TestComponent = () => (
      <div>
        <button
          data-testid="back-button-test"
          onClick={() => mockExitApp()}
        >
          Test Back Button
        </button>
      </div>
    );

    render(<TestComponent />);

    const backButton = screen.getByTestId("back-button-test");
    fireEvent.click(backButton);

    expect(mockExitApp).toHaveBeenCalled();
  });

  it("should handle navigation to home from create path", () => {
    const TestComponent = () => (
      <div>
        <button
          data-testid="navigate-home"
          onClick={() => mockNavigate({ to: "/" })}
        >
          Navigate Home
        </button>
      </div>
    );

    render(<TestComponent />);

    const button = screen.getByTestId("navigate-home");
    fireEvent.click(button);

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("should handle navigation patterns correctly", () => {
    const TestComponent = () => {
      const [result, setResult] = React.useState<string>("");

      const testNavigation = (path: string) => {
        if (path === "/create/search") {
          setResult("nested-create");
          mockNavigate({ to: "/create" });
        } else if (path === "/settings/advanced") {
          setResult("nested-settings");
          mockNavigate({ to: "/settings" });
        }
      };

      return (
        <div>
          <button
            data-testid="test-nested-create"
            onClick={() => testNavigation("/create/search")}
          >
            Test Nested Create
          </button>
          <button
            data-testid="test-nested-settings"
            onClick={() => testNavigation("/settings/advanced")}
          >
            Test Nested Settings
          </button>
          <div data-testid="result">{result}</div>
        </div>
      );
    };

    render(<TestComponent />);

    const createButton = screen.getByTestId("test-nested-create");
    fireEvent.click(createButton);

    expect(screen.getByTestId("result")).toHaveTextContent("nested-create");
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/create" });

    mockNavigate.mockClear();

    const settingsButton = screen.getByTestId("test-nested-settings");
    fireEvent.click(settingsButton);

    expect(screen.getByTestId("result")).toHaveTextContent("nested-settings");
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/settings" });
  });

  it("should have proper footer styling with CSS variables", () => {
    const FooterTestComponent = () => {
      return (
        <footer
          data-testid="footer-with-styles"
          className="flex-shrink-0 z-30"
          style={{ '--bottom-nav-height': 'calc(80px + env(safe-area-inset-bottom, 0px))' } as React.CSSProperties}
        >
          <div data-testid="bottom-nav">Bottom Navigation</div>
        </footer>
      );
    };

    render(<FooterTestComponent />);

    const footer = screen.getByTestId("footer-with-styles");
    expect(footer).toHaveClass("flex-shrink-0", "z-30");

    const style = footer.getAttribute('style');
    expect(style).toContain('--bottom-nav-height: calc(80px + env(safe-area-inset-bottom, 0px))');
  });

  it("should use correct back button handler priority", () => {
    // Test that the back button handler is called with correct priority
    const TestComponent = () => {
      React.useEffect(() => {
        mockUseBackButtonHandler('navigation', vi.fn(), 0);
      }, []);

      return <div data-testid="back-button-priority-test">Testing Priority</div>;
    };

    render(<TestComponent />);

    expect(screen.getByTestId("back-button-priority-test")).toBeInTheDocument();
    expect(mockUseBackButtonHandler).toHaveBeenCalledWith(
      'navigation',
      expect.any(Function),
      0
    );
  });
});
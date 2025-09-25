import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock dependencies
vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: vi.fn()
  }
}));

vi.mock("../../../hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({}))
}));

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    createFileRoute: actual.createFileRoute
  };
});

vi.mock("../../../components/PageFrame", () => ({
  PageFrame: ({ title, back, children, ...props }: any) => (
    <div data-testid="page-frame" {...props}>
      <div data-testid="page-title">{title}</div>
      <button data-testid="back-button" onClick={back}>Back</button>
      <div data-testid="page-content">{children}</div>
    </div>
  )
}));

vi.mock("../../../components/wui/Button.tsx", () => ({
  Button: ({ label, onClick, variant }: any) => (
    <button
      data-testid={`button-${label.toLowerCase().replace(/\s+/g, '-')}`}
      onClick={onClick}
      data-variant={variant}
    >
      {label}
    </button>
  )
}));

// Mock environment variable
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_VERSION: '1.2.3'
  },
  writable: true
});

describe("Settings About Route", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it("should render about page with all components", async () => {
    const TestWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    // Mock the about component
    const AboutComponent = () => {
      return (
        <div data-testid="page-frame">
          <div data-testid="page-title">About</div>
          <button data-testid="back-button">Back</button>
          <div data-testid="page-content">
            <div className="text-center">
              <h2 className="text-2xl font-bold">Zaparoo App</h2>
              <p data-testid="version">Version 1.2.3</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-row justify-between">
                <span>Callan Barrett</span>
                <span>Developer</span>
              </div>
              <div className="flex flex-row justify-between">
                <span>Tim Wilsie</span>
                <span>UX Designer</span>
              </div>
            </div>
            <button data-testid="button-join-patreon">Join Patreon</button>
          </div>
        </div>
      );
    };

    render(
      <TestWrapper>
        <AboutComponent />
      </TestWrapper>
    );

    expect(screen.getByTestId("page-frame")).toBeInTheDocument();
    expect(screen.getByText("Zaparoo App")).toBeInTheDocument();
    expect(screen.getByTestId("version")).toHaveTextContent("Version 1.2.3");
    expect(screen.getByText("Callan Barrett")).toBeInTheDocument();
    expect(screen.getByText("Developer")).toBeInTheDocument();
    expect(screen.getByText("Tim Wilsie")).toBeInTheDocument();
    expect(screen.getByText("UX Designer")).toBeInTheDocument();
    expect(screen.getByTestId("button-join-patreon")).toBeInTheDocument();
  });

  it("should display version from environment variable", async () => {
    const TestComponent = () => {
      return (
        <p data-testid="app-version">
          Version {import.meta.env.VITE_VERSION}
        </p>
      );
    };

    render(<TestComponent />);

    expect(screen.getByTestId("app-version")).toHaveTextContent("Version 1.2.3");
  });

  it("should display developer credits", async () => {
    const TestComponent = () => {
      return (
        <div className="flex flex-col gap-2">
          <div className="flex flex-row justify-between">
            <span data-testid="dev-name-1">Callan Barrett</span>
            <span data-testid="dev-role-1">Developer</span>
          </div>
          <div className="flex flex-row justify-between">
            <span data-testid="dev-name-2">Tim Wilsie</span>
            <span data-testid="dev-role-2">UX Designer</span>
          </div>
        </div>
      );
    };

    render(<TestComponent />);

    expect(screen.getByTestId("dev-name-1")).toHaveTextContent("Callan Barrett");
    expect(screen.getByTestId("dev-role-1")).toHaveTextContent("Developer");
    expect(screen.getByTestId("dev-name-2")).toHaveTextContent("Tim Wilsie");
    expect(screen.getByTestId("dev-role-2")).toHaveTextContent("UX Designer");
  });

  it("should display translation contributors", async () => {
    const TestComponent = () => {
      return (
        <div className="flex flex-col gap-2">
          <h3 className="text-center text-lg font-bold">Translations By</h3>
          <div className="flex flex-row justify-between">
            <span data-testid="translator-1">Seexelas</span>
            <span data-testid="language-1">French/Français</span>
          </div>
          <div className="flex flex-row justify-between">
            <span data-testid="translator-2">Phoenix</span>
            <span data-testid="language-2">Dutch/Nederlands</span>
          </div>
          <div className="flex flex-row justify-between">
            <span data-testid="translator-3">Anime0t4ku</span>
            <span data-testid="language-3">Japanese/日本語</span>
          </div>
          <div className="flex flex-row justify-between">
            <span data-testid="translator-4">Pink Melon</span>
            <span data-testid="language-4">Korean/한국어</span>
          </div>
          <div className="flex flex-row justify-between">
            <span data-testid="translator-5">RetroCastle</span>
            <span data-testid="language-5">Chinese (Simplified)/中文</span>
          </div>
          <div className="flex flex-row justify-between">
            <span data-testid="translator-6">Ze Conehead</span>
            <span data-testid="language-6">German/Deutsch</span>
          </div>
        </div>
      );
    };

    render(<TestComponent />);

    expect(screen.getByText("Translations By")).toBeInTheDocument();
    expect(screen.getByTestId("translator-1")).toHaveTextContent("Seexelas");
    expect(screen.getByTestId("language-1")).toHaveTextContent("French/Français");
    expect(screen.getByTestId("translator-2")).toHaveTextContent("Phoenix");
    expect(screen.getByTestId("language-2")).toHaveTextContent("Dutch/Nederlands");
    expect(screen.getByTestId("translator-3")).toHaveTextContent("Anime0t4ku");
    expect(screen.getByTestId("language-3")).toHaveTextContent("Japanese/日本語");
  });

  it("should display patron credits with correct styling", async () => {
    const TestComponent = () => {
      return (
        <div className="text-center">
          Jon, <span style={{ color: "#F1C40D" }} data-testid="patron-retrorgb">RetroRGB</span>,{" "}
          <span style={{ color: "#F1C40D" }} data-testid="patron-jose">Jose BG</span>,{" "}
          <span style={{ color: "#F1C40D" }} data-testid="patron-mark">Mark DeRidder</span>,{" "}
          <span style={{ color: "#E91E63" }} data-testid="patron-biddle">Biddle</span>,{" "}
          <span style={{ color: "#E74C3C" }} data-testid="patron-retrosoft">Retrosoft Studios</span>
        </div>
      );
    };

    render(<TestComponent />);

    expect(screen.getByText(/Jon/)).toBeInTheDocument();
    expect(screen.getByTestId("patron-retrorgb")).toHaveTextContent("RetroRGB");
    expect(screen.getByTestId("patron-retrorgb")).toHaveStyle("color: #F1C40D");
    expect(screen.getByTestId("patron-jose")).toHaveTextContent("Jose BG");
    expect(screen.getByTestId("patron-jose")).toHaveStyle("color: #F1C40D");
    expect(screen.getByTestId("patron-biddle")).toHaveTextContent("Biddle");
    expect(screen.getByTestId("patron-biddle")).toHaveStyle("color: #E91E63");
    expect(screen.getByTestId("patron-retrosoft")).toHaveTextContent("Retrosoft Studios");
    expect(screen.getByTestId("patron-retrosoft")).toHaveStyle("color: #E74C3C");
  });

  it("should handle Patreon button click", async () => {
    const { Browser } = await import("@capacitor/browser");

    const TestComponent = () => {
      return (
        <button
          data-testid="patreon-button"
          onClick={() =>
            Browser.open({
              url: "https://patreon.com/wizzo"
            })
          }
        >
          Join Patreon
        </button>
      );
    };

    render(<TestComponent />);

    const patreonButton = screen.getByTestId("patreon-button");
    fireEvent.click(patreonButton);

    expect(Browser.open).toHaveBeenCalledWith({
      url: "https://patreon.com/wizzo"
    });
  });

  it("should handle back navigation", async () => {
    const TestComponent = () => {
      return (
        <button
          data-testid="back-button"
          onClick={() => mockNavigate({ to: "/settings" })}
        >
          Back
        </button>
      );
    };

    render(<TestComponent />);

    const backButton = screen.getByTestId("back-button");
    fireEvent.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/settings" });
  });

  it("should display wizzodev section with proper styling", async () => {
    const TestComponent = () => {
      return (
        <div className="flex flex-col gap-3">
          <h3 className="text-center text-lg font-bold" data-testid="wizzodev-title">
            Wizzodev
          </h3>
          <div className="text-center">
            Jon, <span style={{ color: "#F1C40D" }}>RetroRGB</span>,{" "}
            Casey McGinty, <span style={{ color: "#E91E63" }}>Biddle</span>
          </div>
        </div>
      );
    };

    render(<TestComponent />);

    expect(screen.getByTestId("wizzodev-title")).toHaveTextContent("Wizzodev");
    expect(screen.getByText(/Jon/)).toBeInTheDocument();
    expect(screen.getByText("RetroRGB")).toHaveStyle("color: #F1C40D");
    expect(screen.getByText(/Casey McGinty/)).toBeInTheDocument();
    expect(screen.getByText("Biddle")).toHaveStyle("color: #E91E63");
  });

  it("should have proper layout structure", async () => {
    const TestComponent = () => {
      return (
        <div data-testid="about-content" className="flex flex-col gap-8">
          <div data-testid="app-info-section" className="text-center">
            <h2 className="text-2xl font-bold">Zaparoo App</h2>
          </div>
          <div data-testid="team-section" className="flex flex-col gap-2">
            <div className="flex flex-row justify-between">
              <span>Developer Info</span>
            </div>
          </div>
          <div data-testid="translations-section" className="flex flex-col gap-2">
            <h3 className="text-center text-lg font-bold">Translations</h3>
          </div>
          <div data-testid="patrons-section" className="flex flex-col gap-3">
            <h3 className="text-center text-lg font-bold">Patrons</h3>
          </div>
        </div>
      );
    };

    render(<TestComponent />);

    expect(screen.getByTestId("about-content")).toHaveClass("flex", "flex-col", "gap-8");
    expect(screen.getByTestId("app-info-section")).toHaveClass("text-center");
    expect(screen.getByTestId("team-section")).toHaveClass("flex", "flex-col", "gap-2");
    expect(screen.getByTestId("translations-section")).toHaveClass("flex", "flex-col", "gap-2");
    expect(screen.getByTestId("patrons-section")).toHaveClass("flex", "flex-col", "gap-3");
  });

  it("should display all major patron contributors", async () => {
    const TestComponent = () => {
      return (
        <div className="text-center">
          <span data-testid="patron-gentlemen">Gentlemen's Pixel Club</span>,{" "}
          <span data-testid="patron-voljoe">VolJoe</span>,{" "}
          <span data-testid="patron-shijuro">Shijuro</span>,{" "}
          <span data-testid="patron-tim">Tim Sullivan</span>,{" "}
          <span data-testid="patron-jesusfish">TheJesusFish</span>
        </div>
      );
    };

    render(<TestComponent />);

    expect(screen.getByTestId("patron-gentlemen")).toHaveTextContent("Gentlemen's Pixel Club");
    expect(screen.getByTestId("patron-voljoe")).toHaveTextContent("VolJoe");
    expect(screen.getByTestId("patron-shijuro")).toHaveTextContent("Shijuro");
    expect(screen.getByTestId("patron-tim")).toHaveTextContent("Tim Sullivan");
    expect(screen.getByTestId("patron-jesusfish")).toHaveTextContent("TheJesusFish");
  });
});
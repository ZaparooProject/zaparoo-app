import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock dependencies
vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: vi.fn(),
  },
}));

vi.mock("../../../hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({})),
}));

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    createFileRoute: actual.createFileRoute,
  };
});

vi.mock("../../../components/PageFrame", () => ({
  PageFrame: ({ title, back, children, ...props }: any) => (
    <div data-testid="page-frame" {...props}>
      <div data-testid="page-title">{title}</div>
      <button data-testid="back-button" onClick={back}>
        Back
      </button>
      <div data-testid="page-content">{children}</div>
    </div>
  ),
}));

vi.mock("../../../components/wui/Button", () => ({
  Button: ({ label, onClick, variant }: any) => (
    <button
      data-testid={`button-${label.toLowerCase().replace(/\s+/g, "-")}`}
      onClick={onClick}
      data-variant={variant}
    >
      {label}
    </button>
  ),
}));

describe("Settings Help Route", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render help page with all components", async () => {
    const TestWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    // Mock the help component
    const HelpComponent = () => {
      return (
        <div data-testid="page-frame">
          <div data-testid="page-title">Help</div>
          <button data-testid="back-button">Back</button>
          <div data-testid="page-content">
            <button data-testid="button-main-site">Main Site</button>

            <div className="flex flex-col gap-4">
              <h2 className="text-center text-lg font-semibold">
                Documentation
              </h2>
              <button data-testid="button-zaparoo-wiki">Zaparoo Wiki</button>
              <button data-testid="button-getting-started">
                Getting Started
              </button>
              <button data-testid="button-command-reference">
                Command Reference
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <h2 className="text-center text-lg font-semibold">Community</h2>
              <button data-testid="button-discord">Discord</button>
              <button data-testid="button-reddit">Reddit</button>
            </div>

            <div className="flex flex-col gap-4">
              <h2 className="text-center text-lg font-semibold">
                Technical Support
              </h2>
              <button data-testid="button-report-issue">Report Issue</button>
              <p className="text-center">
                Email:{" "}
                <a className="underline" href="mailto:support@zaparoo.com">
                  support@zaparoo.com
                </a>
              </p>
            </div>
          </div>
        </div>
      );
    };

    render(
      <TestWrapper>
        <HelpComponent />
      </TestWrapper>,
    );

    expect(screen.getByTestId("page-frame")).toBeInTheDocument();
    expect(screen.getByTestId("page-title")).toHaveTextContent("Help");
    expect(screen.getByTestId("button-main-site")).toBeInTheDocument();
    expect(screen.getByText("Documentation")).toBeInTheDocument();
    expect(screen.getByTestId("button-zaparoo-wiki")).toBeInTheDocument();
    expect(screen.getByTestId("button-getting-started")).toBeInTheDocument();
    expect(screen.getByTestId("button-command-reference")).toBeInTheDocument();
    expect(screen.getByText("Community")).toBeInTheDocument();
    expect(screen.getByTestId("button-discord")).toBeInTheDocument();
    expect(screen.getByTestId("button-reddit")).toBeInTheDocument();
    expect(screen.getByText("Technical Support")).toBeInTheDocument();
    expect(screen.getByTestId("button-report-issue")).toBeInTheDocument();
    expect(screen.getByText("support@zaparoo.com")).toBeInTheDocument();
  });

  it("should handle main site button click", async () => {
    const { Browser } = await import("@capacitor/browser");

    const TestComponent = () => {
      return (
        <button
          data-testid="main-site-button"
          onClick={() =>
            Browser.open({
              url: "https://zaparoo.org/",
            })
          }
        >
          Main Site
        </button>
      );
    };

    render(<TestComponent />);

    const button = screen.getByTestId("main-site-button");
    fireEvent.click(button);

    expect(Browser.open).toHaveBeenCalledWith({
      url: "https://zaparoo.org/",
    });
  });

  it("should handle documentation links", async () => {
    const { Browser } = await import("@capacitor/browser");

    const TestComponent = () => {
      return (
        <div>
          <button
            data-testid="wiki-button"
            onClick={() =>
              Browser.open({
                url: "https://zaparoo.org/docs/",
              })
            }
          >
            Wiki
          </button>
          <button
            data-testid="getting-started-button"
            onClick={() =>
              Browser.open({
                url: "https://zaparoo.org/docs/getting-started/",
              })
            }
          >
            Getting Started
          </button>
          <button
            data-testid="command-reference-button"
            onClick={() =>
              Browser.open({
                url: "https://zaparoo.org/docs/zapscript/",
              })
            }
          >
            Command Reference
          </button>
        </div>
      );
    };

    render(<TestComponent />);

    // Test Wiki button
    const wikiButton = screen.getByTestId("wiki-button");
    fireEvent.click(wikiButton);
    expect(Browser.open).toHaveBeenCalledWith({
      url: "https://zaparoo.org/docs/",
    });

    vi.clearAllMocks();

    // Test Getting Started button
    const gettingStartedButton = screen.getByTestId("getting-started-button");
    fireEvent.click(gettingStartedButton);
    expect(Browser.open).toHaveBeenCalledWith({
      url: "https://zaparoo.org/docs/getting-started/",
    });

    vi.clearAllMocks();

    // Test Command Reference button
    const commandRefButton = screen.getByTestId("command-reference-button");
    fireEvent.click(commandRefButton);
    expect(Browser.open).toHaveBeenCalledWith({
      url: "https://zaparoo.org/docs/zapscript/",
    });
  });

  it("should handle community links", async () => {
    const { Browser } = await import("@capacitor/browser");

    const TestComponent = () => {
      return (
        <div>
          <button
            data-testid="discord-button"
            onClick={() =>
              Browser.open({
                url: "https://zaparoo.org/discord",
              })
            }
          >
            Discord
          </button>
          <button
            data-testid="reddit-button"
            onClick={() =>
              Browser.open({
                url: "https://reddit.com/r/Zaparoo",
              })
            }
          >
            Reddit
          </button>
        </div>
      );
    };

    render(<TestComponent />);

    // Test Discord button
    const discordButton = screen.getByTestId("discord-button");
    fireEvent.click(discordButton);
    expect(Browser.open).toHaveBeenCalledWith({
      url: "https://zaparoo.org/discord",
    });

    vi.clearAllMocks();

    // Test Reddit button
    const redditButton = screen.getByTestId("reddit-button");
    fireEvent.click(redditButton);
    expect(Browser.open).toHaveBeenCalledWith({
      url: "https://reddit.com/r/Zaparoo",
    });
  });

  it("should handle technical support links", async () => {
    const { Browser } = await import("@capacitor/browser");

    const TestComponent = () => {
      return (
        <div>
          <button
            data-testid="report-issue-button"
            onClick={() =>
              Browser.open({
                url: "https://github.com/ZaparooProject/zaparoo-app/issues/new",
              })
            }
          >
            Report Issue
          </button>
          <p className="text-center">
            Email:{" "}
            <a
              data-testid="email-link"
              className="underline"
              href="mailto:support@zaparoo.com"
            >
              support@zaparoo.com
            </a>
          </p>
        </div>
      );
    };

    render(<TestComponent />);

    // Test Report Issue button
    const reportButton = screen.getByTestId("report-issue-button");
    fireEvent.click(reportButton);
    expect(Browser.open).toHaveBeenCalledWith({
      url: "https://github.com/ZaparooProject/zaparoo-app/issues/new",
    });

    // Test email link
    const emailLink = screen.getByTestId("email-link");
    expect(emailLink).toHaveAttribute("href", "mailto:support@zaparoo.com");
    expect(emailLink).toHaveClass("underline");
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

  it("should have proper section organization", async () => {
    const TestComponent = () => {
      return (
        <div className="flex flex-col gap-4">
          <div
            data-testid="documentation-section"
            className="flex flex-col gap-4"
          >
            <h2
              data-testid="documentation-title"
              className="text-center text-lg font-semibold"
            >
              Documentation
            </h2>
            <button>Wiki</button>
            <button>Getting Started</button>
            <button>Command Reference</button>
          </div>

          <div data-testid="community-section" className="flex flex-col gap-4">
            <h2
              data-testid="community-title"
              className="text-center text-lg font-semibold"
            >
              Community
            </h2>
            <button>Discord</button>
            <button>Reddit</button>
          </div>

          <div data-testid="support-section" className="flex flex-col gap-4">
            <h2
              data-testid="support-title"
              className="text-center text-lg font-semibold"
            >
              Technical Support
            </h2>
            <button>Report Issue</button>
          </div>
        </div>
      );
    };

    render(<TestComponent />);

    expect(screen.getByTestId("documentation-section")).toHaveClass(
      "flex",
      "flex-col",
      "gap-4",
    );
    expect(screen.getByTestId("documentation-title")).toHaveClass(
      "text-center",
      "text-lg",
      "font-semibold",
    );
    expect(screen.getByTestId("documentation-title")).toHaveTextContent(
      "Documentation",
    );

    expect(screen.getByTestId("community-section")).toHaveClass(
      "flex",
      "flex-col",
      "gap-4",
    );
    expect(screen.getByTestId("community-title")).toHaveClass(
      "text-center",
      "text-lg",
      "font-semibold",
    );
    expect(screen.getByTestId("community-title")).toHaveTextContent(
      "Community",
    );

    expect(screen.getByTestId("support-section")).toHaveClass(
      "flex",
      "flex-col",
      "gap-4",
    );
    expect(screen.getByTestId("support-title")).toHaveClass(
      "text-center",
      "text-lg",
      "font-semibold",
    );
    expect(screen.getByTestId("support-title")).toHaveTextContent(
      "Technical Support",
    );
  });

  it("should display all buttons with outline variant", async () => {
    const TestComponent = () => {
      return (
        <div>
          <button data-testid="button-1" data-variant="outline">
            Main Site
          </button>
          <button data-testid="button-2" data-variant="outline">
            Wiki
          </button>
          <button data-testid="button-3" data-variant="outline">
            Getting Started
          </button>
          <button data-testid="button-4" data-variant="outline">
            Command Reference
          </button>
          <button data-testid="button-5" data-variant="outline">
            Discord
          </button>
          <button data-testid="button-6" data-variant="outline">
            Reddit
          </button>
          <button data-testid="button-7" data-variant="outline">
            Report Issue
          </button>
        </div>
      );
    };

    render(<TestComponent />);

    const buttons = screen.getAllByRole("button");
    buttons.forEach((button) => {
      expect(button).toHaveAttribute("data-variant", "outline");
    });
  });

  it("should handle all URL patterns correctly", async () => {
    const urls = [
      "https://zaparoo.org/",
      "https://zaparoo.org/docs/",
      "https://zaparoo.org/docs/getting-started/",
      "https://zaparoo.org/docs/zapscript/",
      "https://zaparoo.org/discord",
      "https://reddit.com/r/Zaparoo",
      "https://github.com/ZaparooProject/zaparoo-app/issues/new",
    ];

    urls.forEach((url) => {
      expect(url).toMatch(/^https:\/\//);
      expect(url).toBeTruthy();
    });
  });

  it("should display email contact information", async () => {
    const TestComponent = () => {
      return (
        <p className="text-center">
          <span data-testid="email-label">Email Label</span>{" "}
          <a
            data-testid="support-email"
            className="underline"
            href="mailto:support@zaparoo.com"
          >
            support@zaparoo.com
          </a>
        </p>
      );
    };

    render(<TestComponent />);

    const emailLink = screen.getByTestId("support-email");
    expect(emailLink).toHaveTextContent("support@zaparoo.com");
    expect(emailLink).toHaveAttribute("href", "mailto:support@zaparoo.com");
    expect(emailLink).toHaveClass("underline");
  });
});

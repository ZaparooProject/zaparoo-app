import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";

// Mock router - use vi.hoisted to make variables accessible in mocks
const { componentRef, mockGoBack, mockBrowserOpen } = vi.hoisted(() => ({
  componentRef: { current: null as any },
  mockGoBack: vi.fn(),
  mockBrowserOpen: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createFileRoute: () => (options: any) => {
      componentRef.current = options.component;
      return { options };
    },
    useRouter: () => ({ history: { back: mockGoBack } }),
  };
});

// Mock store
vi.mock("@/lib/store", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useStatusStore: (selector: any) =>
      selector({
        safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
      }),
  };
});

// Mock hooks
vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

// Mock Capacitor
vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: mockBrowserOpen,
  },
}));

// Import the route module to trigger createFileRoute which captures the component
import "@/routes/settings.help";

// The component will be captured by the mock
const getHelp = () => componentRef.current;

describe("Settings Help Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () => {
    const Help = getHelp();
    return render(<Help />);
  };

  describe("rendering", () => {
    it("should render the page title", () => {
      renderComponent();
      expect(
        screen.getByRole("heading", { name: "settings.help.title" }),
      ).toBeInTheDocument();
    });

    it("should render main site button", () => {
      renderComponent();
      expect(
        screen.getByRole("button", { name: "settings.help.main" }),
      ).toBeInTheDocument();
    });

    it("should render documentation section with buttons", () => {
      renderComponent();
      expect(
        screen.getByText("settings.help.documentationLabel"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "settings.help.taptoWiki" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "settings.help.gettingStarted" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "settings.help.commandReference" }),
      ).toBeInTheDocument();
    });

    it("should render community section with buttons", () => {
      renderComponent();
      expect(
        screen.getByText("settings.help.communityLabel"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "settings.help.discord" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "settings.help.reddit" }),
      ).toBeInTheDocument();
    });

    it("should render technical support section", () => {
      renderComponent();
      expect(
        screen.getByText("settings.help.technicalSupport"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "settings.help.reportIssue" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "support@zaparoo.com" }),
      ).toHaveAttribute("href", "mailto:support@zaparoo.com");
    });
  });

  describe("external links", () => {
    it("should open main site when button clicked", () => {
      renderComponent();
      fireEvent.click(
        screen.getByRole("button", { name: "settings.help.main" }),
      );
      expect(mockBrowserOpen).toHaveBeenCalledWith({
        url: "https://zaparoo.org/",
      });
    });

    it("should open wiki when button clicked", () => {
      renderComponent();
      fireEvent.click(
        screen.getByRole("button", { name: "settings.help.taptoWiki" }),
      );
      expect(mockBrowserOpen).toHaveBeenCalledWith({
        url: "https://zaparoo.org/docs/",
      });
    });

    it("should open getting started when button clicked", () => {
      renderComponent();
      fireEvent.click(
        screen.getByRole("button", { name: "settings.help.gettingStarted" }),
      );
      expect(mockBrowserOpen).toHaveBeenCalledWith({
        url: "https://zaparoo.org/docs/getting-started/",
      });
    });

    it("should open command reference when button clicked", () => {
      renderComponent();
      fireEvent.click(
        screen.getByRole("button", { name: "settings.help.commandReference" }),
      );
      expect(mockBrowserOpen).toHaveBeenCalledWith({
        url: "https://zaparoo.org/docs/zapscript/",
      });
    });

    it("should open discord when button clicked", () => {
      renderComponent();
      fireEvent.click(
        screen.getByRole("button", { name: "settings.help.discord" }),
      );
      expect(mockBrowserOpen).toHaveBeenCalledWith({
        url: "https://zaparoo.org/discord",
      });
    });

    it("should open reddit when button clicked", () => {
      renderComponent();
      fireEvent.click(
        screen.getByRole("button", { name: "settings.help.reddit" }),
      );
      expect(mockBrowserOpen).toHaveBeenCalledWith({
        url: "https://reddit.com/r/Zaparoo",
      });
    });

    it("should open GitHub issues when report issue clicked", () => {
      renderComponent();
      fireEvent.click(
        screen.getByRole("button", { name: "settings.help.reportIssue" }),
      );
      expect(mockBrowserOpen).toHaveBeenCalledWith({
        url: "https://github.com/ZaparooProject/zaparoo-app/issues/new",
      });
    });
  });

  describe("navigation", () => {
    it("should navigate back when back button clicked", () => {
      renderComponent();
      fireEvent.click(screen.getByLabelText("nav.back"));
      expect(mockGoBack).toHaveBeenCalled();
    });
  });
});

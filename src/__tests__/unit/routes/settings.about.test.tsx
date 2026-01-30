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
import "@/routes/settings.about";

// The component will be captured by the mock
const getAbout = () => componentRef.current;

describe("Settings About Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () => {
    const About = getAbout();
    return render(<About />);
  };

  describe("rendering", () => {
    it("should render the page title", () => {
      renderComponent();
      expect(
        screen.getByRole("heading", { name: "settings.about.title" }),
      ).toBeInTheDocument();
    });

    it("should render app name heading", () => {
      renderComponent();
      expect(
        screen.getByRole("heading", { name: "Zaparoo App" }),
      ).toBeInTheDocument();
    });

    it("should display version information", () => {
      renderComponent();
      expect(screen.getByText(/settings.about.version/)).toBeInTheDocument();
    });

    it("should display developer credits", () => {
      renderComponent();
      expect(screen.getByText("Callan Barrett")).toBeInTheDocument();
      expect(screen.getByText("Developer")).toBeInTheDocument();
      expect(screen.getByText("Tim Wilsie")).toBeInTheDocument();
      expect(screen.getByText("UX Designer")).toBeInTheDocument();
    });

    it("should display translations section", () => {
      renderComponent();
      expect(
        screen.getByText("settings.about.translationsBy"),
      ).toBeInTheDocument();
      expect(screen.getByText("Seexelas")).toBeInTheDocument();
      expect(screen.getByText("French/Français")).toBeInTheDocument();
      expect(screen.getByText("Anime0t4ku")).toBeInTheDocument();
      expect(screen.getByText("Japanese/日本語")).toBeInTheDocument();
      expect(screen.getByText("Pink Melon")).toBeInTheDocument();
      expect(screen.getByText("Korean/한국어")).toBeInTheDocument();
      expect(screen.getByText("RetroCastle")).toBeInTheDocument();
      expect(screen.getByText("Chinese (Simplified)/中文")).toBeInTheDocument();
      expect(screen.getByText("Ze Conehead")).toBeInTheDocument();
      expect(screen.getByText("German/Deutsch")).toBeInTheDocument();
    });

    it("should display patron credits section", () => {
      renderComponent();
      expect(screen.getByText("settings.about.wizzodev")).toBeInTheDocument();
      expect(screen.getByText("RetroRGB")).toBeInTheDocument();
      expect(screen.getByText("Jose BG")).toBeInTheDocument();
      expect(screen.getByText("Biddle")).toBeInTheDocument();
      expect(screen.getByText("Retrosoft Studios")).toBeInTheDocument();
    });

    it("should render join patreon button", () => {
      renderComponent();
      expect(
        screen.getByRole("button", { name: "settings.about.joinPatreon" }),
      ).toBeInTheDocument();
    });
  });

  describe("external links", () => {
    it("should open patreon when button clicked", () => {
      renderComponent();
      fireEvent.click(
        screen.getByRole("button", { name: "settings.about.joinPatreon" }),
      );
      expect(mockBrowserOpen).toHaveBeenCalledWith({
        url: "https://patreon.com/wizzo",
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

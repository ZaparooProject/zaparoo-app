import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "../../../test-utils";

// Use vi.hoisted for all variables that need to be accessed in mock factories
const { componentRef, mockState, mockNfcWriter } = vi.hoisted(() => ({
  componentRef: { current: null as any },
  mockState: {
    connected: true,
    playing: {
      mediaName: "",
      mediaPath: "",
      systemName: "",
    },
    nfcAvailable: true,
    platform: "ios" as string,
  },
  mockNfcWriter: {
    status: null as null | string,
    write: vi.fn(),
    end: vi.fn(),
    writing: false,
    result: null,
  },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createFileRoute: () => (options: any) => {
      componentRef.current = options.component;
      return { options };
    },
    Link: ({
      children,
      to,
      disabled,
    }: {
      children: React.ReactNode;
      to: string;
      disabled?: boolean;
    }) => (
      <a href={to} data-disabled={disabled} aria-disabled={disabled}>
        {children}
      </a>
    ),
  };
});

// Mock store
vi.mock("@/lib/store", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useStatusStore: (selector: any) =>
      selector({
        connected: mockState.connected,
        playing: mockState.playing,
        safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
      }),
  };
});

// Mock preferences store
vi.mock("@/lib/preferencesStore", () => ({
  usePreferencesStore: (selector: any) =>
    selector({
      nfcAvailable: mockState.nfcAvailable,
    }),
}));

// Mock NFC writer
vi.mock("@/lib/writeNfcHook", () => ({
  useNfcWriter: () => mockNfcWriter,
  WriteAction: {
    Write: "write",
    Read: "read",
  },
}));

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => mockState.platform !== "web",
    getPlatform: () => mockState.platform,
  },
}));

// Mock hooks
vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

// Mock WriteModal to simplify testing
vi.mock("@/components/WriteModal", () => ({
  WriteModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="write-modal">Write Modal</div> : null,
}));

// Import the route module to trigger createFileRoute which captures the component
import "@/routes/create.index";

// The component will be captured by the mock
const getCreate = () => componentRef.current;

describe("Create Index Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.connected = true;
    mockState.playing = { mediaName: "", mediaPath: "", systemName: "" };
    mockState.nfcAvailable = true;
    mockState.platform = "ios";
    mockNfcWriter.status = null;
    mockNfcWriter.write.mockClear();
    mockNfcWriter.end.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () => {
    const Create = getCreate();
    return render(<Create />);
  };

  describe("rendering", () => {
    it("should render the page title", () => {
      renderComponent();
      expect(
        screen.getByRole("heading", { name: "create.title" }),
      ).toBeInTheDocument();
    });

    it("should render search game card", () => {
      renderComponent();
      expect(screen.getByText("create.searchGameHeading")).toBeInTheDocument();
      expect(screen.getByText("create.searchGameSub")).toBeInTheDocument();
    });

    it("should render current game card", () => {
      renderComponent();
      expect(screen.getByText("create.currentGameHeading")).toBeInTheDocument();
      expect(
        screen.getByText("create.currentGameSubFallback"),
      ).toBeInTheDocument();
    });

    it("should render mappings card", () => {
      renderComponent();
      expect(screen.getByText("create.mappingsHeading")).toBeInTheDocument();
      expect(screen.getByText("create.mappingsSub")).toBeInTheDocument();
    });

    it("should render custom text card", () => {
      renderComponent();
      expect(screen.getByText("create.customHeading")).toBeInTheDocument();
      expect(screen.getByText("create.customSub")).toBeInTheDocument();
    });

    it("should render NFC card", () => {
      renderComponent();
      expect(screen.getByText("create.nfcHeading")).toBeInTheDocument();
      expect(screen.getByText("create.nfcSub")).toBeInTheDocument();
    });
  });

  describe("current game display", () => {
    it("should show current game name when playing", () => {
      mockState.playing = {
        mediaName: "Super Mario World",
        mediaPath: "/games/smw.sfc",
        systemName: "SNES",
      };
      renderComponent();
      // The translation with interpolation
      expect(screen.getByText(/create.currentGameSub/)).toBeInTheDocument();
    });

    it("should show fallback when no game playing", () => {
      mockState.playing = { mediaName: "", mediaPath: "", systemName: "" };
      renderComponent();
      expect(
        screen.getByText("create.currentGameSubFallback"),
      ).toBeInTheDocument();
    });
  });

  describe("connection state", () => {
    it("should disable search card when disconnected", () => {
      mockState.connected = false;
      renderComponent();
      const searchLink = screen
        .getByText("create.searchGameHeading")
        .closest("a");
      expect(searchLink).toHaveAttribute("aria-disabled", "true");
    });

    it("should disable mappings card when disconnected", () => {
      mockState.connected = false;
      renderComponent();
      const mappingsLink = screen
        .getByText("create.mappingsHeading")
        .closest("a");
      expect(mappingsLink).toHaveAttribute("aria-disabled", "true");
    });

    it("should enable cards when connected", () => {
      mockState.connected = true;
      renderComponent();
      const searchLink = screen
        .getByText("create.searchGameHeading")
        .closest("a");
      expect(searchLink).toHaveAttribute("aria-disabled", "false");
    });
  });

  describe("NFC availability", () => {
    it("should disable NFC card on web platform", () => {
      mockState.platform = "web";
      renderComponent();
      const nfcLink = screen.getByText("create.nfcHeading").closest("a");
      expect(nfcLink).toHaveAttribute("aria-disabled", "true");
    });

    it("should disable NFC card when NFC not available", () => {
      mockState.nfcAvailable = false;
      renderComponent();
      const nfcLink = screen.getByText("create.nfcHeading").closest("a");
      expect(nfcLink).toHaveAttribute("aria-disabled", "true");
    });

    it("should enable NFC card on native platform with NFC available", () => {
      mockState.platform = "ios";
      mockState.nfcAvailable = true;
      renderComponent();
      const nfcLink = screen.getByText("create.nfcHeading").closest("a");
      expect(nfcLink).toHaveAttribute("aria-disabled", "false");
    });
  });

  describe("navigation links", () => {
    it("should have correct link to search page", () => {
      renderComponent();
      const searchLink = screen
        .getByText("create.searchGameHeading")
        .closest("a");
      expect(searchLink).toHaveAttribute("href", "/create/search");
    });

    it("should have correct link to mappings page", () => {
      renderComponent();
      const mappingsLink = screen
        .getByText("create.mappingsHeading")
        .closest("a");
      expect(mappingsLink).toHaveAttribute("href", "/create/mappings");
    });

    it("should have correct link to custom page", () => {
      renderComponent();
      const customLink = screen.getByText("create.customHeading").closest("a");
      expect(customLink).toHaveAttribute("href", "/create/custom");
    });

    it("should have correct link to NFC page", () => {
      renderComponent();
      const nfcLink = screen.getByText("create.nfcHeading").closest("a");
      expect(nfcLink).toHaveAttribute("href", "/create/nfc");
    });
  });
});

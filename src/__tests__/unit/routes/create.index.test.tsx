import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import type { PlayingResponse } from "@/lib/models";

// Use vi.hoisted for all variables that need to be accessed in mock factories
const {
  componentRef,
  mockState,
  mockNfcWriter,
  mockMediaActive,
  mockLoggerError,
  mockShowRateLimitedErrorToast,
} = vi.hoisted(() => ({
  componentRef: { current: null as any },
  mockState: {
    connected: true,
    playing: {
      systemId: "",
      mediaName: "",
      mediaPath: "",
      systemName: "",
    } as PlayingResponse,
    backgroundPlaying: {
      systemId: "",
      mediaName: "",
      mediaPath: "",
      systemName: "",
    } as PlayingResponse,
    coreVersion: "2.9.0" as string | null,
    coreVersionPending: false,
    nfcAvailable: true,
    platform: "ios" as string,
  },
  mockNfcWriter: {
    status: null as null | string,
    write: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    end: vi.fn(),
    writing: false,
    result: null,
    verifyError: null,
    getVerifyError: vi.fn(() => null),
  },
  mockMediaActive: vi.fn(),
  mockLoggerError: vi.fn(),
  mockShowRateLimitedErrorToast: vi.fn(),
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
        backgroundPlaying: mockState.backgroundPlaying,
        coreVersion: mockState.coreVersion,
        coreVersionPending: mockState.coreVersionPending,
        safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
      }),
  };
});

// Mock preferences store
vi.mock("@/lib/preferencesStore", () => ({
  usePreferencesStore: (selector: any) =>
    selector({
      nfcAvailable: mockState.nfcAvailable,
      preferRemoteWriter: false,
      showFilenames: false,
    }),
}));

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    mediaActive: mockMediaActive,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mockLoggerError,
  },
}));

vi.mock("@/lib/toastUtils", () => ({
  showRateLimitedErrorToast: mockShowRateLimitedErrorToast,
}));

// Mock NFC writer, keeping the real enums and isWriteModalOpen
vi.mock("@/lib/writeNfcHook", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/writeNfcHook")>()),
  useNfcWriter: () => mockNfcWriter,
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
  WriteModal: ({ isOpen, close }: { isOpen: boolean; close: () => void }) =>
    isOpen ? (
      <div data-testid="write-modal">
        Write Modal
        <button onClick={close}>Close write modal</button>
      </div>
    ) : null,
}));

// Import the route module to trigger createFileRoute which captures the component
import "@/routes/create.index";

// The component will be captured by the mock
const getCreate = () => componentRef.current;

describe("Create Index Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.connected = true;
    mockState.playing = {
      systemId: "",
      mediaName: "",
      mediaPath: "",
      systemName: "",
    };
    mockState.backgroundPlaying = {
      systemId: "",
      mediaName: "",
      mediaPath: "",
      systemName: "",
    };
    mockState.coreVersion = "2.9.0";
    mockState.coreVersionPending = false;
    mockState.nfcAvailable = true;
    mockState.platform = "ios";
    mockNfcWriter.status = null;
    mockNfcWriter.write.mockClear();
    mockNfcWriter.end.mockClear();
    mockMediaActive.mockImplementation(async () => ({
      ...mockState.playing,
      zapScript: "@SNES/Super Mario World",
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () => {
    const Create = getCreate();
    return render(<Create />);
  };

  const setActiveMedia = () => {
    mockState.playing = {
      systemId: "SNES",
      mediaName: "Super Mario World",
      mediaPath: "/games/smw.sfc",
      systemName: "Super Nintendo",
    };
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
        systemId: "SNES",
        mediaName: "Super Mario World",
        mediaPath: "/games/smw.sfc",
        systemName: "Super Nintendo",
      };
      renderComponent();
      // The translation with interpolation
      expect(screen.getByText(/create.currentGameSub/)).toBeInTheDocument();
    });

    it("should show fallback when no game playing", () => {
      mockState.playing = {
        systemId: "",
        mediaName: "",
        mediaPath: "",
        systemName: "",
      };
      renderComponent();
      expect(
        screen.getByText("create.currentGameSubFallback"),
      ).toBeInTheDocument();
    });

    it("should remain primary-only when background media is active", () => {
      mockState.backgroundPlaying = {
        systemId: "Audio",
        mediaName: "Theme",
        mediaPath: "/music/theme.mp3",
        systemName: "Audio",
        slot: "background",
      };

      renderComponent();

      expect(
        screen.getByText("create.currentGameSubFallback"),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Theme/)).not.toBeInTheDocument();
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

  describe("current media details", () => {
    it("should open details without immediately writing", async () => {
      setActiveMedia();
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", {
          name: /create\.currentGameHeading/i,
        }),
      );

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(mockMediaActive).toHaveBeenCalledOnce();
      expect(screen.getByText("SNES")).toBeInTheDocument();
      expect(screen.getByText("/games/smw.sfc")).toBeInTheDocument();
      expect(screen.getByText("@SNES/Super Mario World")).toBeInTheDocument();
      expect(mockNfcWriter.write).not.toHaveBeenCalled();
    });

    it("should default to ZapScript and write it", async () => {
      setActiveMedia();
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", {
          name: /create\.currentGameHeading/i,
        }),
      );

      const zapScriptRadio = await screen.findByRole("radio", {
        name: /create\.search\.zapscriptLabel/i,
      });
      expect(zapScriptRadio).toBeChecked();

      await user.click(
        screen.getByRole("button", {
          name: /create\.search\.writeLabel/i,
        }),
      );

      expect(mockNfcWriter.write).toHaveBeenCalledWith(
        "write",
        "@SNES/Super Mario World",
      );
      expect(screen.getByTestId("write-modal")).toBeInTheDocument();
    });

    it("should write path when path is selected", async () => {
      setActiveMedia();
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", {
          name: /create\.currentGameHeading/i,
        }),
      );
      await user.click(
        await screen.findByRole("radio", {
          name: /create\.search\.pathLabel/i,
        }),
      );
      await user.click(
        screen.getByRole("button", {
          name: /create\.search\.writeLabel/i,
        }),
      );

      expect(mockNfcWriter.write).toHaveBeenCalledWith(
        "write",
        "/games/smw.sfc",
      );
    });

    it("should only expose write action", async () => {
      setActiveMedia();
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", {
          name: /create\.currentGameHeading/i,
        }),
      );
      expect(
        await screen.findByRole("button", {
          name: /create\.search\.writeLabel/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: /create\.search\.copyLabel/i,
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: /create\.search\.playLabel/i,
        }),
      ).not.toBeInTheDocument();
    });

    it("should show path-only details before Core 2.9.0", async () => {
      setActiveMedia();
      mockState.coreVersion = "2.8.9";
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", {
          name: /create\.currentGameHeading/i,
        }),
      );

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(mockMediaActive).not.toHaveBeenCalled();
      expect(
        screen.getByRole("radio", { name: /create\.search\.pathLabel/i }),
      ).toBeChecked();
      expect(
        screen.queryByRole("radio", {
          name: /create\.search\.zapscriptLabel/i,
        }),
      ).not.toBeInTheDocument();
    });

    it("should show path-only details while Core version is pending", async () => {
      setActiveMedia();
      mockState.coreVersionPending = true;
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", {
          name: /create\.currentGameHeading/i,
        }),
      );

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(mockMediaActive).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("radio", {
          name: /create\.search\.zapscriptLabel/i,
        }),
      ).not.toBeInTheDocument();
    });

    it("should fall back to cached path when enrichment fails", async () => {
      setActiveMedia();
      const error = new Error("media.active failed");
      mockMediaActive.mockRejectedValueOnce(error);
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", {
          name: /create\.currentGameHeading/i,
        }),
      );

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("/games/smw.sfc")).toBeInTheDocument();
      expect(
        screen.queryByRole("radio", {
          name: /create\.search\.zapscriptLabel/i,
        }),
      ).not.toBeInTheDocument();
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Failed to fetch active media details:",
        error,
        {
          category: "api",
          action: "mediaActive",
          severity: "warning",
        },
      );
    });

    it("should not open stale details when Core reports no active media", async () => {
      setActiveMedia();
      mockMediaActive.mockResolvedValueOnce(null);
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", {
          name: /create\.currentGameHeading/i,
        }),
      );

      await waitFor(() => expect(mockMediaActive).toHaveBeenCalledOnce());
      expect(mockShowRateLimitedErrorToast).toHaveBeenCalledWith("error");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(mockNfcWriter.write).not.toHaveBeenCalled();
    });

    it("should not open or write when current media has no path", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", {
          name: /create\.currentGameHeading/i,
        }),
      );

      expect(mockMediaActive).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(mockNfcWriter.write).not.toHaveBeenCalled();
    });
  });

  describe("write modal", () => {
    it("should end writer when dismissed", async () => {
      setActiveMedia();
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", {
          name: /create\.currentGameHeading/i,
        }),
      );
      await user.click(
        await screen.findByRole("button", {
          name: /create\.search\.writeLabel/i,
        }),
      );
      await user.click(
        screen.getByRole("button", { name: "Close write modal" }),
      );

      await waitFor(() => expect(mockNfcWriter.end).toHaveBeenCalledOnce());
      expect(screen.queryByTestId("write-modal")).not.toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { Capacitor } from "@capacitor/core";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";

const initialStatusState = { ...useStatusStore.getState() };

// Use vi.hoisted for all variables that need to be accessed in mock factories
const { componentRef, mockGoBack, mockNfcWriter, mockImpact } = vi.hoisted(
  () => ({
    componentRef: { current: null as any },
    mockGoBack: vi.fn(),
    mockNfcWriter: {
      status: null as null | string,
      write: vi.fn().mockResolvedValue(undefined),
      retry: vi.fn().mockResolvedValue(undefined),
      end: vi.fn(),
      writing: false,
      result: null as any,
      verifyError: null as Error | null,
      getVerifyError: vi.fn(() => null),
    },
    mockImpact: vi.fn(),
  }),
);

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
    createFileRoute: () => (options: any) => {
      componentRef.current = options.component;
      return { options };
    },
    useRouter: () => ({ navigate: mockGoBack }),
  };
});

// Mock NFC writer
vi.mock("@/lib/writeNfcHook", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/writeNfcHook")>()),
  useNfcWriter: () => ({ ...mockNfcWriter }),
}));

// Mock hooks
vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    impact: mockImpact,
    notification: vi.fn(),
    vibrate: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { log: vi.fn(), error: vi.fn() },
}));

// Mock ReadTab with functional scan button
vi.mock("@/components/nfc/ReadTab", () => ({
  ReadTab: ({
    result,
    onScan,
    scanControl,
  }: {
    result: any;
    onScan: () => void;
    scanControl?: any;
  }) => (
    <div data-testid="read-tab">
      {scanControl ?? (
        <button data-testid="scan-button" onClick={onScan}>
          Scan NFC
        </button>
      )}
      {result && (
        <div data-testid="scan-result">Result: {result.info?.tag}</div>
      )}
    </div>
  ),
}));

// Import the route module to trigger createFileRoute which captures the component
import "@/routes/create.nfc";

// The component will be captured by the mock
const getNfcUtils = () => componentRef.current;

describe("Create NFC Route", () => {
  beforeEach(() => {
    useStatusStore.setState({ ...initialStatusState });
    CoreAPI.reset();
    vi.clearAllMocks();
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
    mockNfcWriter.status = null;
    mockNfcWriter.writing = false;
    mockNfcWriter.result = null;
    mockNfcWriter.verifyError = null;
    mockNfcWriter.write.mockClear();
    mockNfcWriter.retry.mockClear();
    mockNfcWriter.end.mockClear();
    mockImpact.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () => {
    const NfcUtils = getNfcUtils();
    return render(<NfcUtils />);
  };

  describe("rendering", () => {
    it("should render the page title", () => {
      renderComponent();
      expect(
        screen.getByRole("heading", { name: "create.nfc.title" }),
      ).toBeInTheDocument();
    });

    it("should render the back button", () => {
      renderComponent();
      expect(screen.getByLabelText("nav.back")).toBeInTheDocument();
    });

    it("should render tab triggers for Read and Tools", () => {
      renderComponent();
      expect(
        screen.getByRole("tab", { name: "create.nfc.tabs.read" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: "create.nfc.tabs.tools" }),
      ).toBeInTheDocument();
    });

    it("should show Read tab content by default", () => {
      renderComponent();
      // Read tab content includes the scan button
      expect(
        screen.getByRole("button", { name: "create.nfc.readTab.scanTag" }),
      ).toBeInTheDocument();
    });
  });

  describe("scan functionality", () => {
    it("should call nfcWriter.write with Read action when scan button clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "create.nfc.readTab.scanTag" }),
      );

      expect(mockNfcWriter.write).toHaveBeenCalledWith("read");
    });

    it("should latch reader control when scan is initiated", async () => {
      const user = userEvent.setup();
      mockNfcWriter.status = null;
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "create.nfc.readTab.scanTag" }),
      );

      expect(
        screen.getByRole("button", { name: "reader.cancelAction" }),
      ).toHaveAttribute("data-reader-state", "waiting");
    });

    it("should keep reader activity available and retry after verification fails", async () => {
      const user = userEvent.setup();
      mockNfcWriter.status = "error";
      mockNfcWriter.verifyError = new Error("verification failed");
      renderComponent();

      expect(screen.getByText("spinner.verifyFailed")).toBeVisible();

      await user.click(screen.getByRole("button", { name: "scan.retry" }));

      expect(mockNfcWriter.retry).toHaveBeenCalledOnce();
    });
  });

  describe("navigation", () => {
    it("should navigate back when back button clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByLabelText("nav.back"));

      expect(mockGoBack).toHaveBeenCalledWith({
        to: "/create",
        resetScroll: false,
      });
    });
  });

  describe("tab switching", () => {
    it("should switch to Tools tab when clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Click on Tools tab trigger
      const toolsTab = screen.getByRole("tab", { name: /tools/i });
      await user.click(toolsTab);

      // Tools tab content should be visible
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "create.nfc.format" }),
        ).toBeInTheDocument();
      });
    });

    it("should trigger haptic feedback when switching tabs", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Click on Tools tab
      const toolsTab = screen.getByRole("tab", { name: /tools/i });
      await user.click(toolsTab);

      expect(mockImpact).toHaveBeenCalledWith("light");
    });

    it("should switch back to Read tab when clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Switch to Tools first
      const toolsTab = screen.getByRole("tab", { name: /tools/i });
      await user.click(toolsTab);
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "create.nfc.format" }),
        ).toBeInTheDocument();
      });

      // Switch back to Read
      const readTab = screen.getByRole("tab", { name: /read/i });
      await user.click(readTab);
      await waitFor(() => {
        expect(screen.getByTestId("read-tab")).toBeInTheDocument();
      });
    });
  });

  describe("tool actions", () => {
    it.each([
      ["format", "create.nfc.format", "create.nfc.tools.formatWarning"],
      ["erase", "create.nfc.erase", "create.nfc.tools.eraseWarning"],
      [
        "makeReadOnly",
        "create.nfc.makeReadOnly",
        "create.nfc.tools.makeReadOnlyWarning",
      ],
    ])(
      "keeps %s control and warning mounted until cancellation",
      async (action, label, warning) => {
        const user = userEvent.setup();
        renderComponent();
        await user.click(
          screen.getByRole("tab", { name: "create.nfc.tabs.tools" }),
        );
        const control = screen.getByRole("button", { name: label });
        control.focus();
        await user.click(control);
        expect(mockNfcWriter.write).toHaveBeenCalledWith(action);
        expect(screen.getByRole("heading", { name: label })).toBeVisible();
        expect(screen.getByText(warning)).toBeVisible();
        expect(
          screen.getByRole("button", { name: "reader.cancelAction" }),
        ).toBe(control);
        expect(control).toHaveFocus();
        for (const other of [
          "create.nfc.format",
          "create.nfc.erase",
          "create.nfc.makeReadOnly",
        ].filter((value) => value !== label)) {
          expect(screen.getByRole("button", { name: other })).toBeDisabled();
        }
        await user.click(control);
        expect(mockNfcWriter.end).toHaveBeenCalledOnce();
        expect(screen.getByRole("button", { name: label })).toBe(control);
        expect(control).toHaveFocus();
      },
    );

    it("should call nfcWriter.write with format action when format button clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Switch to Tools tab first
      const toolsTab = screen.getByRole("tab", { name: /tools/i });
      await user.click(toolsTab);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "create.nfc.format" }),
        ).toBeInTheDocument();
      });

      // Click format button
      await user.click(
        screen.getByRole("button", { name: "create.nfc.format" }),
      );

      expect(mockNfcWriter.write).toHaveBeenCalledWith("format");
    });

    it("should call nfcWriter.write with erase action when erase button clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Switch to Tools tab first
      const toolsTab = screen.getByRole("tab", { name: /tools/i });
      await user.click(toolsTab);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "create.nfc.erase" }),
        ).toBeInTheDocument();
      });

      // Click erase button
      await user.click(
        screen.getByRole("button", { name: "create.nfc.erase" }),
      );

      expect(mockNfcWriter.write).toHaveBeenCalledWith("erase");
    });

    it("should show reader activity when tool action is triggered", async () => {
      const user = userEvent.setup();
      mockNfcWriter.status = null;
      renderComponent();

      // Switch to Tools tab
      const toolsTab = screen.getByRole("tab", { name: /tools/i });
      await user.click(toolsTab);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "create.nfc.format" }),
        ).toBeInTheDocument();
      });

      // Click format button
      await user.click(
        screen.getByRole("button", { name: "create.nfc.format" }),
      );

      expect(
        screen.getByRole("button", { name: "reader.cancelAction" }),
      ).toHaveAttribute("data-reader-state", "waiting");
    });

    it("should disable tool buttons while processing", async () => {
      const user = userEvent.setup();
      mockNfcWriter.writing = true;
      renderComponent();

      // Switch to Tools tab
      const toolsTab = screen.getByRole("tab", { name: /tools/i });
      await user.click(toolsTab);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "create.nfc.format" }),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByRole("button", { name: "create.nfc.format" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "create.nfc.erase" }),
      ).toBeDisabled();
    });
  });

  describe("operation completion", () => {
    it("should announce results, select Read, and move focus after completion", async () => {
      const user = userEvent.setup();
      const NfcUtils = getNfcUtils();
      const { rerender } = render(<NfcUtils />);
      await user.click(
        screen.getByRole("tab", { name: "create.nfc.tabs.tools" }),
      );

      act(() => {
        mockNfcWriter.status = "success";
        mockNfcWriter.result = { info: { tag: "abc123" } };
      });
      rerender(<NfcUtils />);

      const readTab = screen.getByRole("tab", {
        name: "create.nfc.tabs.read",
      });
      await waitFor(() =>
        expect(readTab).toHaveAttribute("aria-selected", "true"),
      );
      await waitFor(() => expect(readTab).toHaveFocus());
      expect(
        await screen.findByText("create.nfc.resultReady"),
      ).toBeInTheDocument();
    });

    it("should initially show read tab by default", () => {
      mockNfcWriter.status = null;
      mockNfcWriter.result = null;
      renderComponent();

      // Read tab should be visible by default
      expect(screen.getByTestId("read-tab")).toBeInTheDocument();
    });

    it("should pass result to ReadTab component when available", () => {
      // Set up a result before rendering
      mockNfcWriter.status = "success";
      mockNfcWriter.result = {
        info: {
          tag: "abc123",
        },
      };

      renderComponent();

      // The ReadTab mock should display the result
      expect(screen.getByTestId("scan-result")).toHaveTextContent("abc123");
    });
  });
});

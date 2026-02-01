import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "../../../test-utils";
import userEvent from "@testing-library/user-event";

// Use vi.hoisted for all variables that need to be accessed in mock factories
const { componentRef, mockGoBack, mockNfcWriter, mockImpact } = vi.hoisted(
  () => ({
    componentRef: { current: null as any },
    mockGoBack: vi.fn(),
    mockNfcWriter: {
      status: null as null | string,
      write: vi.fn(),
      end: vi.fn(),
      writing: false,
      result: null as any,
    },
    mockImpact: vi.fn(),
  }),
);

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

// Mock NFC writer
vi.mock("@/lib/writeNfcHook", () => ({
  useNfcWriter: () => mockNfcWriter,
  WriteAction: {
    Write: "write",
    Read: "read",
    Format: "format",
    Erase: "erase",
  },
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

// Mock WriteModal to simplify testing
vi.mock("@/components/WriteModal", () => ({
  WriteModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="write-modal">Write Modal</div> : null,
}));

// Mock ReadTab with functional scan button
vi.mock("@/components/nfc/ReadTab", () => ({
  ReadTab: ({ result, onScan }: { result: any; onScan: () => void }) => (
    <div data-testid="read-tab">
      <button data-testid="scan-button" onClick={onScan}>
        Scan NFC
      </button>
      {result && (
        <div data-testid="scan-result">Result: {result.info?.tag}</div>
      )}
    </div>
  ),
}));

// Mock ToolsTab with functional action buttons
vi.mock("@/components/nfc/ToolsTab", () => ({
  ToolsTab: ({
    onToolAction,
    isProcessing,
  }: {
    onToolAction: (action: string) => void;
    isProcessing: boolean;
  }) => (
    <div data-testid="tools-tab">
      <button
        data-testid="format-button"
        onClick={() => onToolAction("format")}
        disabled={isProcessing}
      >
        Format
      </button>
      <button
        data-testid="erase-button"
        onClick={() => onToolAction("erase")}
        disabled={isProcessing}
      >
        Erase
      </button>
    </div>
  ),
}));

// Import the route module to trigger createFileRoute which captures the component
import "@/routes/create.nfc";

// The component will be captured by the mock
const getNfcUtils = () => componentRef.current;

describe("Create NFC Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNfcWriter.status = null;
    mockNfcWriter.writing = false;
    mockNfcWriter.result = null;
    mockNfcWriter.write.mockClear();
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
      // Check for tab trigger text
      expect(screen.getByText("Read")).toBeInTheDocument();
      expect(screen.getByText("Tools")).toBeInTheDocument();
    });

    it("should show Read tab content by default", () => {
      renderComponent();
      // Read tab content includes the scan button
      expect(screen.getByTestId("scan-button")).toBeInTheDocument();
    });
  });

  describe("scan functionality", () => {
    it("should call nfcWriter.write with Read action when scan button clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByTestId("scan-button"));

      expect(mockNfcWriter.write).toHaveBeenCalledWith("read");
    });

    it("should show write modal when scan is initiated", async () => {
      const user = userEvent.setup();
      mockNfcWriter.status = null;
      renderComponent();

      await user.click(screen.getByTestId("scan-button"));

      expect(screen.getByTestId("write-modal")).toBeInTheDocument();
    });
  });

  describe("navigation", () => {
    it("should navigate back when back button clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByLabelText("nav.back"));

      expect(mockGoBack).toHaveBeenCalled();
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
        expect(screen.getByTestId("tools-tab")).toBeInTheDocument();
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
        expect(screen.getByTestId("tools-tab")).toBeInTheDocument();
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
    it("should call nfcWriter.write with format action when format button clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Switch to Tools tab first
      const toolsTab = screen.getByRole("tab", { name: /tools/i });
      await user.click(toolsTab);

      await waitFor(() => {
        expect(screen.getByTestId("format-button")).toBeInTheDocument();
      });

      // Click format button
      await user.click(screen.getByTestId("format-button"));

      expect(mockNfcWriter.write).toHaveBeenCalledWith("format");
    });

    it("should call nfcWriter.write with erase action when erase button clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Switch to Tools tab first
      const toolsTab = screen.getByRole("tab", { name: /tools/i });
      await user.click(toolsTab);

      await waitFor(() => {
        expect(screen.getByTestId("erase-button")).toBeInTheDocument();
      });

      // Click erase button
      await user.click(screen.getByTestId("erase-button"));

      expect(mockNfcWriter.write).toHaveBeenCalledWith("erase");
    });

    it("should show write modal when tool action is triggered", async () => {
      const user = userEvent.setup();
      mockNfcWriter.status = null;
      renderComponent();

      // Switch to Tools tab
      const toolsTab = screen.getByRole("tab", { name: /tools/i });
      await user.click(toolsTab);

      await waitFor(() => {
        expect(screen.getByTestId("format-button")).toBeInTheDocument();
      });

      // Click format button
      await user.click(screen.getByTestId("format-button"));

      expect(screen.getByTestId("write-modal")).toBeInTheDocument();
    });

    it("should disable tool buttons while processing", async () => {
      const user = userEvent.setup();
      mockNfcWriter.writing = true;
      renderComponent();

      // Switch to Tools tab
      const toolsTab = screen.getByRole("tab", { name: /tools/i });
      await user.click(toolsTab);

      await waitFor(() => {
        expect(screen.getByTestId("format-button")).toBeInTheDocument();
      });

      expect(screen.getByTestId("format-button")).toBeDisabled();
      expect(screen.getByTestId("erase-button")).toBeDisabled();
    });
  });

  describe("operation completion", () => {
    // Note: Testing the auto-switch-to-read-tab effect on operation completion
    // is difficult because it depends on internal useNfcWriter hook state changes.
    // The useEffect in the component listens for nfcWriter.result?.info?.tag changes
    // which can't be easily triggered through our mock approach.
    // The core functionality (switching tabs, tool actions) is covered above.

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

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
      end: vi.fn().mockResolvedValue(undefined),
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

// Mock ReadTab so the page's result handling can be observed directly
vi.mock("@/components/nfc/ReadTab", () => ({
  ReadTab: ({ result, scanControl }: { result: any; scanControl: any }) => (
    <div data-testid="read-tab">
      {scanControl}
      {result && (
        <div data-testid="scan-result">Result: {result.info?.tag?.text}</div>
      )}
    </div>
  ),
}));

// Import the route module to trigger createFileRoute which captures the component
import "@/routes/create.nfc";

// The component will be captured by the mock
const getNfcUtils = () => componentRef.current;

describe("Create NFC Route", () => {
  let settleWrite: () => void = () => {};

  beforeEach(() => {
    useStatusStore.setState({ ...initialStatusState });
    CoreAPI.reset();
    vi.clearAllMocks();
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
    mockNfcWriter.status = null;
    mockNfcWriter.writing = false;
    mockNfcWriter.result = null;
    mockNfcWriter.verifyError = null;
    // A reader operation stays pending until the test settles it.
    mockNfcWriter.write.mockReset();
    mockNfcWriter.write.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settleWrite = resolve;
        }),
    );
    mockNfcWriter.retry.mockReset();
    mockNfcWriter.retry.mockResolvedValue(undefined);
    mockNfcWriter.end.mockReset();
    mockNfcWriter.end.mockResolvedValue(undefined);
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
    it("should start a read when the scan control is pressed", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "create.nfc.readTab.scanTag" }),
      );

      await waitFor(() =>
        expect(mockNfcWriter.write).toHaveBeenCalledWith("read", undefined),
      );
    });

    it("should latch the scan control until the read is cancelled", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "create.nfc.readTab.scanTag" }),
      );
      const control = screen.getByRole("button", {
        name: "reader.cancelAction",
      });
      expect(control).toHaveAttribute("data-reader-state", "waiting");

      await user.click(control);

      expect(mockNfcWriter.end).toHaveBeenCalledOnce();
      expect(
        await screen.findByRole("button", {
          name: "create.nfc.readTab.scanTag",
        }),
      ).toBeInTheDocument();
    });

    it("should not start a read while a queued write owns the reader", async () => {
      const user = userEvent.setup();
      useStatusStore.setState({ writeOpen: true });
      renderComponent();

      const control = screen.getByRole("button", {
        name: "create.nfc.readTab.scanTag",
      });
      expect(control).toBeDisabled();
      await user.click(control);

      expect(mockNfcWriter.write).not.toHaveBeenCalled();
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

  describe("tab lock during a tag wait", () => {
    it("should lock the tabs while a read is waiting and release them on cancel", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "create.nfc.readTab.scanTag" }),
      );

      const readTab = screen.getByRole("tab", { name: "create.nfc.tabs.read" });
      const toolsTab = screen.getByRole("tab", {
        name: "create.nfc.tabs.tools",
      });
      expect(readTab).toBeDisabled();
      expect(toolsTab).toBeDisabled();
      await user.click(toolsTab);
      expect(readTab).toHaveAttribute("aria-selected", "true");

      await user.click(
        screen.getByRole("button", { name: "reader.cancelAction" }),
      );

      await waitFor(() => expect(toolsTab).toBeEnabled());
    });

    it("should not latch the scan control for a tool's wait", async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(
        screen.getByRole("tab", { name: "create.nfc.tabs.tools" }),
      );

      await user.click(
        screen.getByRole("button", { name: "create.nfc.erase" }),
      );

      // Only the tool that started the wait offers its cancellation.
      expect(
        screen.getAllByRole("button", { name: "reader.cancelAction" }),
      ).toHaveLength(1);
      expect(
        screen.getByRole("tab", { name: "create.nfc.tabs.read" }),
      ).toBeDisabled();
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
        await waitFor(() =>
          expect(mockNfcWriter.write).toHaveBeenCalledWith(action, undefined),
        );
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
        expect(await screen.findByRole("button", { name: label })).toBe(
          control,
        );
        expect(control).toHaveFocus();
      },
    );
  });

  describe("operation completion", () => {
    const tagResult = {
      status: 0,
      info: { tag: { uid: "04a1", text: "abc123" }, rawTag: null },
    };

    it("should show and announce what a read found", async () => {
      const user = userEvent.setup();
      const NfcUtils = getNfcUtils();
      const { rerender } = render(<NfcUtils />);
      await user.click(
        screen.getByRole("button", { name: "create.nfc.readTab.scanTag" }),
      );
      await waitFor(() => expect(mockNfcWriter.write).toHaveBeenCalled());

      mockNfcWriter.result = tagResult;
      await act(async () => {
        settleWrite();
      });
      rerender(<NfcUtils />);

      expect(screen.getByTestId("scan-result")).toHaveTextContent("abc123");
      expect(
        await screen.findByText("create.nfc.resultReady"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: "create.nfc.tabs.read" }),
      ).toBeEnabled();
    });

    it("should not present the tag a tool acted on as its current contents", async () => {
      const user = userEvent.setup();
      const NfcUtils = getNfcUtils();
      const { rerender } = render(<NfcUtils />);
      const toolsTab = screen.getByRole("tab", {
        name: "create.nfc.tabs.tools",
      });
      await user.click(toolsTab);
      await user.click(
        screen.getByRole("button", { name: "create.nfc.erase" }),
      );
      await waitFor(() => expect(mockNfcWriter.write).toHaveBeenCalled());

      // Erase reports the tag as discovered, before it was erased.
      mockNfcWriter.result = tagResult;
      await act(async () => {
        settleWrite();
      });
      rerender(<NfcUtils />);

      expect(screen.queryByTestId("scan-result")).not.toBeInTheDocument();
      expect(toolsTab).toHaveAttribute("aria-selected", "true");
      expect(
        screen.queryByText("create.nfc.resultReady"),
      ).not.toBeInTheDocument();
    });
  });
});

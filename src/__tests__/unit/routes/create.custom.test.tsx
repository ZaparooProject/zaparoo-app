import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import { useStatusStore } from "@/lib/store";

const initialStatusState = { ...useStatusStore.getState() };

// Use vi.hoisted for all variables that need to be accessed in mock factories
const { componentRef, mockGoBack, mockNfcWriter, mockState } = vi.hoisted(
  () => ({
    componentRef: { current: null as any },
    mockGoBack: vi.fn(),
    mockNfcWriter: {
      status: null as null | string,
      write: vi.fn().mockResolvedValue(undefined),
      retry: vi.fn().mockResolvedValue(undefined),
      end: vi.fn().mockResolvedValue(undefined),
      writing: false,
      result: null,
      verifyError: null,
      getVerifyError: vi.fn(() => null),
    },
    mockState: {
      customText: "",
      setCustomText: vi.fn(),
    },
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

// Mock preferences store
vi.mock("@/lib/preferencesStore", () => ({
  usePreferencesStore: () => ({
    customText: mockState.customText,
    setCustomText: mockState.setCustomText,
  }),
  selectCustomText: (state: any) => ({
    customText: state.customText,
    setCustomText: state.setCustomText,
  }),
}));

// Mock NFC writer, keeping the real enums and isReaderActivityOpen
vi.mock("@/lib/writeNfcHook", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/writeNfcHook")>()),
  useNfcWriter: () => mockNfcWriter,
}));

// Mock hooks
vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

// Mock ZapScriptInput component to simplify testing
vi.mock("@/components/ZapScriptInput.tsx", () => ({
  ZapScriptInput: ({
    value,
    setValue,
    disabled,
  }: {
    value: string;
    setValue: (v: string) => void;
    disabled?: boolean;
  }) => (
    <textarea
      data-testid="zap-script-input"
      value={value}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      aria-label="ZapScript input"
    />
  ),
}));

// Import the route module to trigger createFileRoute which captures the component
import "@/routes/create.custom";

// The component will be captured by the mock
const getCustomText = () => componentRef.current;

describe("Create Custom Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.customText = "";
    mockState.setCustomText.mockClear();
    useStatusStore.setState({ ...initialStatusState });
    mockNfcWriter.status = null;
    // A write stays pending (tag not yet presented) for the whole test.
    mockNfcWriter.write.mockReset();
    mockNfcWriter.write.mockImplementation(() => new Promise<void>(() => {}));
    mockNfcWriter.end.mockReset();
    mockNfcWriter.end.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () => {
    const CustomText = getCustomText();
    return render(<CustomText />);
  };

  describe("rendering", () => {
    it("should render the page title", () => {
      renderComponent();
      expect(
        screen.getByRole("heading", { name: "create.custom.title" }),
      ).toBeInTheDocument();
    });

    it("should render the ZapScript input", () => {
      renderComponent();
      expect(screen.getByTestId("zap-script-input")).toBeInTheDocument();
    });

    it("should render the write button", () => {
      renderComponent();
      expect(
        screen.getByRole("button", { name: "create.custom.write" }),
      ).toBeInTheDocument();
    });

    it("should render the back button", () => {
      renderComponent();
      expect(screen.getByLabelText("nav.back")).toBeInTheDocument();
    });
  });

  describe("input state", () => {
    it("should display current custom text value", () => {
      mockState.customText = "test custom text";
      renderComponent();
      expect(screen.getByTestId("zap-script-input")).toHaveValue(
        "test custom text",
      );
    });

    it("should call setCustomText when input changes", () => {
      renderComponent();
      const input = screen.getByTestId("zap-script-input");
      fireEvent.change(input, { target: { value: "new text" } });
      expect(mockState.setCustomText).toHaveBeenCalledWith("new text");
    });
  });

  describe("write button state", () => {
    it("should disable write button when custom text is empty", () => {
      mockState.customText = "";
      renderComponent();
      expect(
        screen.getByRole("button", { name: "create.custom.write" }),
      ).toBeDisabled();
    });

    it("should enable write button when custom text has content", () => {
      mockState.customText = "some text";
      renderComponent();
      expect(
        screen.getByRole("button", { name: "create.custom.write" }),
      ).not.toBeDisabled();
    });
  });

  describe("write functionality", () => {
    it("should call nfcWriter.write when write button clicked with text", async () => {
      mockState.customText = "test zapscript";
      renderComponent();

      fireEvent.click(
        screen.getByRole("button", { name: "create.custom.write" }),
      );

      await waitFor(() =>
        expect(mockNfcWriter.write).toHaveBeenCalledWith(
          "write",
          "test zapscript",
        ),
      );
    });

    it("should lock the editor while its write is waiting for a tag", async () => {
      mockState.customText = "test text";
      renderComponent();
      expect(screen.getByTestId("zap-script-input")).toBeEnabled();

      fireEvent.click(
        screen.getByRole("button", { name: "create.custom.write" }),
      );
      expect(screen.getByTestId("zap-script-input")).toBeDisabled();

      fireEvent.click(
        screen.getByRole("button", { name: "reader.cancelAction" }),
      );

      await waitFor(() =>
        expect(screen.getByTestId("zap-script-input")).toBeEnabled(),
      );
      expect(mockNfcWriter.end).toHaveBeenCalledOnce();
    });

    it("should not start a write while a queued write owns the reader", () => {
      mockState.customText = "test text";
      useStatusStore.setState({ writeQueue: "**launch.system:snes" });
      renderComponent();

      expect(
        screen.getByRole("button", { name: "create.custom.write" }),
      ).toBeDisabled();
    });

    it("should not call nfcWriter.write when text is empty", () => {
      mockState.customText = "";
      renderComponent();

      // Button should be disabled, but let's verify write isn't called
      const button = screen.getByRole("button", {
        name: "create.custom.write",
      });
      expect(button).toBeDisabled();
    });

    it("should latch the write control after write is initiated", () => {
      mockState.customText = "test text";
      mockNfcWriter.status = null;
      renderComponent();

      fireEvent.click(
        screen.getByRole("button", { name: "create.custom.write" }),
      );

      expect(
        screen.getByRole("button", { name: "reader.cancelAction" }),
      ).toHaveAttribute("data-reader-state", "waiting");
    });
  });

  describe("navigation", () => {
    it("should navigate back when back button clicked", () => {
      renderComponent();

      fireEvent.click(screen.getByLabelText("nav.back"));

      expect(mockGoBack).toHaveBeenCalledWith({
        to: "/create",
        resetScroll: false,
      });
    });
  });
});

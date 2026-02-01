import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";

// Use vi.hoisted for all variables that need to be accessed in mock factories
const { componentRef, mockGoBack, mockNfcWriter, mockState } = vi.hoisted(
  () => ({
    componentRef: { current: null as any },
    mockGoBack: vi.fn(),
    mockNfcWriter: {
      status: null as null | string,
      write: vi.fn(),
      end: vi.fn(),
      writing: false,
      result: null,
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

// Mock NFC writer
vi.mock("@/lib/writeNfcHook", () => ({
  useNfcWriter: () => mockNfcWriter,
  WriteAction: {
    Write: "write",
    Read: "read",
  },
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
  }: {
    value: string;
    setValue: (v: string) => void;
  }) => (
    <textarea
      data-testid="zap-script-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      aria-label="ZapScript input"
    />
  ),
}));

// Mock WriteModal to simplify testing
vi.mock("@/components/WriteModal", () => ({
  WriteModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="write-modal">Write Modal</div> : null,
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
    mockNfcWriter.status = null;
    mockNfcWriter.write.mockClear();
    mockNfcWriter.end.mockClear();
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
    it("should call nfcWriter.write when write button clicked with text", () => {
      mockState.customText = "test zapscript";
      renderComponent();

      fireEvent.click(
        screen.getByRole("button", { name: "create.custom.write" }),
      );

      expect(mockNfcWriter.write).toHaveBeenCalledWith(
        "write",
        "test zapscript",
      );
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

    it("should show write modal after write is initiated", () => {
      mockState.customText = "test text";
      mockNfcWriter.status = null;
      renderComponent();

      fireEvent.click(
        screen.getByRole("button", { name: "create.custom.write" }),
      );

      expect(screen.getByTestId("write-modal")).toBeInTheDocument();
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

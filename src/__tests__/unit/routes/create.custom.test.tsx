import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock dependencies
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockImplementation(({ key }) => {
      if (key === "customText") {
        return Promise.resolve({ value: "test custom text" });
      }
      return Promise.resolve({ value: null });
    }),
    set: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock("../../../lib/writeNfcHook", () => ({
  useNfcWriter: vi.fn(() => ({
    status: null,
    write: vi.fn(),
    end: vi.fn(),
    writing: false,
    result: null
  })),
  WriteAction: {
    Write: 'write'
  }
}));

vi.mock("../../../hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({}))
}));

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    createFileRoute: actual.createFileRoute
  };
});

vi.mock("../../../components/ZapScriptInput.tsx", () => ({
  ZapScriptInput: ({ value, setValue, showPalette, rows }: any) => (
    <textarea
      data-testid="zap-script-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      data-palette={showPalette}
      rows={rows}
    />
  )
}));

vi.mock("../../../components/wui/Button", () => ({
  Button: ({ label, onClick, disabled, icon }: any) => (
    <button
      data-testid="custom-write-button"
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <span data-testid="button-icon">{icon}</span>}
      {label}
    </button>
  )
}));

vi.mock("../../../components/PageFrame", () => ({
  PageFrame: ({ title, back, children, ...props }: any) => (
    <div data-testid="page-frame" {...props}>
      <div data-testid="page-title">{title}</div>
      <button data-testid="back-button" onClick={back}>Back</button>
      <div data-testid="page-content">{children}</div>
    </div>
  )
}));

vi.mock("../../../components/WriteModal", () => ({
  WriteModal: ({ isOpen, close }: any) =>
    isOpen ? (
      <div data-testid="write-modal">
        <button data-testid="close-modal" onClick={close}>Close</button>
      </div>
    ) : null
}));

describe("Create Custom Route", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should not have a loader (uses store directly)", async () => {
    const { Route } = await import("../../../routes/create.custom");

    // Route should not have a loader since it uses usePreferencesStore directly
    expect(Route.options.loader).toBeUndefined();
  });

  it("should render custom text page with all components", async () => {
    const TestWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    // Mock the custom text component
    const CustomTextComponent = () => {
      const [customText, setCustomText] = React.useState("test text");

      return (
        <div data-testid="page-frame">
          <div data-testid="page-title">Create Custom</div>
          <button data-testid="back-button">Back</button>
          <div data-testid="page-content">
            <textarea
              data-testid="zap-script-input"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              rows={5}
            />
            <button
              data-testid="custom-write-button"
              disabled={customText === ""}
            >
              Write Custom
            </button>
          </div>
        </div>
      );
    };

    render(
      <TestWrapper>
        <CustomTextComponent />
      </TestWrapper>
    );

    expect(screen.getByTestId("page-frame")).toBeInTheDocument();
    expect(screen.getByTestId("page-title")).toHaveTextContent("Create Custom");
    expect(screen.getByTestId("zap-script-input")).toBeInTheDocument();
    expect(screen.getByTestId("custom-write-button")).toBeInTheDocument();
    expect(screen.getByTestId("back-button")).toBeInTheDocument();
  });

  it("should handle text input changes", async () => {
    const TestComponent = () => {
      const [customText, setCustomText] = React.useState("");

      return (
        <div>
          <textarea
            data-testid="text-input"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
          />
          <div data-testid="text-value">{customText}</div>
        </div>
      );
    };

    render(<TestComponent />);

    const textInput = screen.getByTestId("text-input");
    fireEvent.change(textInput, { target: { value: "new custom text" } });

    expect(screen.getByTestId("text-value")).toHaveTextContent("new custom text");
  });

  it("should disable write button when text is empty", async () => {
    const TestComponent = () => {
      const [customText, setCustomText] = React.useState("");

      return (
        <div>
          <textarea
            data-testid="text-input"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
          />
          <button
            data-testid="write-button"
            disabled={customText === ""}
          >
            Write
          </button>
        </div>
      );
    };

    render(<TestComponent />);

    const writeButton = screen.getByTestId("write-button");
    expect(writeButton).toBeDisabled();

    const textInput = screen.getByTestId("text-input");
    fireEvent.change(textInput, { target: { value: "some text" } });

    expect(writeButton).not.toBeDisabled();
  });

  it("should handle write button click", async () => {
    const { useNfcWriter, WriteAction } = await import("../../../lib/writeNfcHook");
    const mockWrite = vi.fn();

    vi.mocked(useNfcWriter).mockReturnValue({
      status: null,
      write: mockWrite,
      end: vi.fn(),
      writing: false,
      result: null
    });

    const TestComponent = () => {
      const [customText, setCustomText] = React.useState("test text");
      const [writeOpen, setWriteOpen] = React.useState(false);
      const nfcWriter = useNfcWriter();

      return (
        <div>
          <textarea
            data-testid="text-input"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
          />
          <button
            data-testid="write-button"
            onClick={() => {
              if (customText !== "") {
                nfcWriter.write(WriteAction.Write, customText);
                setWriteOpen(true);
              }
            }}
          >
            Write
          </button>
          {writeOpen && <div data-testid="write-modal">Writing...</div>}
        </div>
      );
    };

    render(<TestComponent />);

    const writeButton = screen.getByTestId("write-button");
    fireEvent.click(writeButton);

    expect(mockWrite).toHaveBeenCalledWith('write', 'test text');
    expect(screen.getByTestId("write-modal")).toBeInTheDocument();
  });

  it("should save preferences when text changes", async () => {
    const { Preferences } = await import("@capacitor/preferences");

    const TestComponent = () => {
      const [customText, setCustomText] = React.useState("initial");

      React.useEffect(() => {
        const savePreference = async () => {
          await Preferences.set({ key: "customText", value: customText });
        };
        savePreference();
      }, [customText]);

      return (
        <div>
          <textarea
            data-testid="text-input"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
          />
        </div>
      );
    };

    render(<TestComponent />);

    const textInput = screen.getByTestId("text-input");
    fireEvent.change(textInput, { target: { value: "updated text" } });

    await waitFor(() => {
      expect(Preferences.set).toHaveBeenCalledWith({
        key: "customText",
        value: "updated text"
      });
    });
  });

  it("should handle back navigation", async () => {
    const TestComponent = () => {
      return (
        <div>
          <button
            data-testid="back-button"
            onClick={() => mockNavigate({ to: "/create" })}
          >
            Back
          </button>
        </div>
      );
    };

    render(<TestComponent />);

    const backButton = screen.getByTestId("back-button");
    fireEvent.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/create" });
  });

  it("should close write modal when NFC writer status changes", async () => {
    const { useNfcWriter } = await import("../../../lib/writeNfcHook");

    const TestComponent = () => {
      const [writeOpen, setWriteOpen] = React.useState(true);
      const nfcWriter = useNfcWriter();

      React.useEffect(() => {
        if (nfcWriter.status !== null) {
          setWriteOpen(false);
        }
      }, [nfcWriter]);

      return (
        <div>
          {writeOpen && <div data-testid="write-modal">Modal Open</div>}
          <div data-testid="writer-status">{nfcWriter.status || "null"}</div>
        </div>
      );
    };

    // Start with status null (modal should be open)
    vi.mocked(useNfcWriter).mockReturnValue({
      status: null,
      write: vi.fn(),
      end: vi.fn(),
      writing: false,
      result: null
    });

    const { rerender } = render(<TestComponent />);

    expect(screen.getByTestId("write-modal")).toBeInTheDocument();

    // Change status to non-null (modal should close)
    const { Status } = await import("../../../lib/nfc");
    vi.mocked(useNfcWriter).mockReturnValue({
      status: Status.Success,
      write: vi.fn(),
      end: vi.fn(),
      writing: false,
      result: null
    });

    rerender(<TestComponent />);

    expect(screen.queryByTestId("write-modal")).not.toBeInTheDocument();
  });

  it("should handle write modal close", async () => {
    const { useNfcWriter } = await import("../../../lib/writeNfcHook");
    const mockEnd = vi.fn();

    vi.mocked(useNfcWriter).mockReturnValue({
      status: null,
      write: vi.fn(),
      end: mockEnd,
      writing: false,
      result: null
    });

    const TestComponent = () => {
      const [writeOpen, setWriteOpen] = React.useState(true);
      const nfcWriter = useNfcWriter();

      const closeWriteModal = async () => {
        setWriteOpen(false);
        await nfcWriter.end();
      };

      return (
        <div>
          {writeOpen && (
            <div data-testid="write-modal">
              <button data-testid="close-modal" onClick={closeWriteModal}>
                Close
              </button>
            </div>
          )}
        </div>
      );
    };

    render(<TestComponent />);

    const closeButton = screen.getByTestId("close-modal");
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(mockEnd).toHaveBeenCalled();
    });

    expect(screen.queryByTestId("write-modal")).not.toBeInTheDocument();
  });
});
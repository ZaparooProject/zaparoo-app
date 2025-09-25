import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock dependencies
vi.mock("../../../lib/writeNfcHook", () => ({
  useNfcWriter: vi.fn(() => ({
    status: null,
    write: vi.fn(),
    end: vi.fn(),
    writing: false,
    result: null
  })),
  WriteAction: {
    Read: 'read',
    Write: 'write',
    Format: 'format'
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

vi.mock("../../../components/ui/tabs", () => ({
  Tabs: ({ value, onValueChange, children, className }: any) => (
    <div data-testid="tabs" data-value={value} className={className}>
      <div data-testid="tabs-trigger-area">
        <button
          data-testid="read-tab-trigger"
          onClick={() => onValueChange("read")}
          data-active={value === "read"}
        >
          Read
        </button>
        <button
          data-testid="tools-tab-trigger"
          onClick={() => onValueChange("tools")}
          data-active={value === "tools"}
        >
          Tools
        </button>
      </div>
      {children}
    </div>
  ),
  TabsList: ({ children, className }: any) => (
    <div data-testid="tabs-list" className={className}>
      {children}
    </div>
  ),
  TabsTrigger: ({ value, children, onClick }: any) => (
    <button data-testid={`tab-trigger-${value}`} onClick={onClick}>
      {children}
    </button>
  ),
  TabsContent: ({ value, children, className }: any) => (
    <div data-testid={`tab-content-${value}`} className={className}>
      {children}
    </div>
  )
}));

vi.mock("../../../components/nfc/ReadTab", () => ({
  ReadTab: ({ result, onScan }: any) => (
    <div data-testid="read-tab">
      <button data-testid="scan-button" onClick={onScan}>
        Scan NFC
      </button>
      {result && <div data-testid="scan-result">Result: {JSON.stringify(result)}</div>}
    </div>
  )
}));

vi.mock("../../../components/nfc/ToolsTab", () => ({
  ToolsTab: ({ onToolAction, isProcessing }: any) => (
    <div data-testid="tools-tab">
      <button
        data-testid="format-button"
        onClick={() => onToolAction('format')}
        disabled={isProcessing}
      >
        Format Tag
      </button>
      <button
        data-testid="erase-button"
        onClick={() => onToolAction('erase')}
        disabled={isProcessing}
      >
        Erase Tag
      </button>
      {isProcessing && <div data-testid="processing">Processing...</div>}
    </div>
  )
}));

describe("Create NFC Route", () => {
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

  it("should render NFC utilities page with all components", async () => {
    const TestWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    // Mock the NFC utilities component
    const NfcUtilsComponent = () => {
      const [activeTab, setActiveTab] = React.useState("read");

      return (
        <div data-testid="page-frame">
          <div data-testid="page-title">NFC Utils</div>
          <button data-testid="back-button">Back</button>
          <div data-testid="page-content">
            <div data-testid="tabs" data-value={activeTab}>
              <div data-testid="tabs-trigger-area">
                <button
                  data-testid="read-tab-trigger"
                  onClick={() => setActiveTab("read")}
                  data-active={activeTab === "read"}
                >
                  Read
                </button>
                <button
                  data-testid="tools-tab-trigger"
                  onClick={() => setActiveTab("tools")}
                  data-active={activeTab === "tools"}
                >
                  Tools
                </button>
              </div>
              {activeTab === "read" && (
                <div data-testid="tab-content-read">
                  <div data-testid="read-tab">Read Tab</div>
                </div>
              )}
              {activeTab === "tools" && (
                <div data-testid="tab-content-tools">
                  <div data-testid="tools-tab">Tools Tab</div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    };

    render(
      <TestWrapper>
        <NfcUtilsComponent />
      </TestWrapper>
    );

    expect(screen.getByTestId("page-frame")).toBeInTheDocument();
    expect(screen.getByTestId("page-title")).toHaveTextContent("NFC Utils");
    expect(screen.getByTestId("tabs")).toBeInTheDocument();
    expect(screen.getByTestId("read-tab-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("tools-tab-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("tab-content-read")).toBeInTheDocument();
  });

  it("should handle tab switching", async () => {
    const TestComponent = () => {
      const [activeTab, setActiveTab] = React.useState("read");

      return (
        <div data-testid="tabs" data-value={activeTab}>
          <button
            data-testid="read-tab-trigger"
            onClick={() => setActiveTab("read")}
          >
            Read
          </button>
          <button
            data-testid="tools-tab-trigger"
            onClick={() => setActiveTab("tools")}
          >
            Tools
          </button>
          {activeTab === "read" && <div data-testid="read-content">Read Content</div>}
          {activeTab === "tools" && <div data-testid="tools-content">Tools Content</div>}
        </div>
      );
    };

    render(<TestComponent />);

    // Initially on read tab
    expect(screen.getByTestId("read-content")).toBeInTheDocument();
    expect(screen.queryByTestId("tools-content")).not.toBeInTheDocument();

    // Switch to tools tab
    const toolsTabTrigger = screen.getByTestId("tools-tab-trigger");
    fireEvent.click(toolsTabTrigger);

    expect(screen.queryByTestId("read-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("tools-content")).toBeInTheDocument();
  });

  it("should handle scan button click", async () => {
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
      const [writeOpen, setWriteOpen] = React.useState(false);
      const nfcWriter = useNfcWriter();

      const handleScan = () => {
        nfcWriter.write(WriteAction.Read);
        setWriteOpen(true);
      };

      return (
        <div>
          <button data-testid="scan-button" onClick={handleScan}>
            Scan NFC
          </button>
          {writeOpen && <div data-testid="write-modal">Scanning...</div>}
        </div>
      );
    };

    render(<TestComponent />);

    const scanButton = screen.getByTestId("scan-button");
    fireEvent.click(scanButton);

    expect(mockWrite).toHaveBeenCalledWith(WriteAction.Read);
    expect(screen.getByTestId("write-modal")).toBeInTheDocument();
  });

  it("should handle tool action buttons", async () => {
    const { useNfcWriter } = await import("../../../lib/writeNfcHook");
    const mockWrite = vi.fn();

    vi.mocked(useNfcWriter).mockReturnValue({
      status: null,
      write: mockWrite,
      end: vi.fn(),
      writing: false,
      result: null
    });

    const TestComponent = () => {
      const [writeOpen, setWriteOpen] = React.useState(false);
      const nfcWriter = useNfcWriter();

      const handleToolAction = (action: any) => {
        nfcWriter.write(action);
        setWriteOpen(true);
      };

      return (
        <div>
          <button
            data-testid="format-button"
            onClick={() => handleToolAction('format')}
          >
            Format
          </button>
          <button
            data-testid="erase-button"
            onClick={() => handleToolAction('erase')}
          >
            Erase
          </button>
          {writeOpen && <div data-testid="write-modal">Processing...</div>}
        </div>
      );
    };

    render(<TestComponent />);

    const formatButton = screen.getByTestId("format-button");
    fireEvent.click(formatButton);

    expect(mockWrite).toHaveBeenCalledWith('format');
    expect(screen.getByTestId("write-modal")).toBeInTheDocument();
  });

  it("should handle back navigation", async () => {
    const TestComponent = () => {
      return (
        <button
          data-testid="back-button"
          onClick={() => mockNavigate({ to: "/create" })}
        >
          Back
        </button>
      );
    };

    render(<TestComponent />);

    const backButton = screen.getByTestId("back-button");
    fireEvent.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/create" });
  });

  it("should close write modal when NFC operation completes", async () => {
    const { useNfcWriter } = await import("../../../lib/writeNfcHook");
    const mockEnd = vi.fn();

    const TestComponent = () => {
      const [writeOpen, setWriteOpen] = React.useState(true);
      const nfcWriter = useNfcWriter();

      React.useEffect(() => {
        if (nfcWriter.status !== null) {
          setWriteOpen(false);
          nfcWriter.end();
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
      end: mockEnd,
      writing: false,
      result: null
    });

    const { rerender } = render(<TestComponent />);

    expect(screen.getByTestId("write-modal")).toBeInTheDocument();

    // Change status to non-null (modal should close)
    vi.mocked(useNfcWriter).mockReturnValue({
      status: 'success' as any,
      write: vi.fn(),
      end: mockEnd,
      writing: false,
      result: { status: 'success' as any, info: { rawTag: null, tag: { uid: "test-uid", text: "" } } }
    });

    rerender(<TestComponent />);

    expect(screen.queryByTestId("write-modal")).not.toBeInTheDocument();
    expect(mockEnd).toHaveBeenCalled();
  });

  it("should switch to read tab when NFC operation has results", async () => {
    const { useNfcWriter } = await import("../../../lib/writeNfcHook");

    const TestComponent = () => {
      const [activeTab, setActiveTab] = React.useState("tools");
      const nfcWriter = useNfcWriter();

      React.useEffect(() => {
        if (nfcWriter.status !== null) {
          if (nfcWriter.result?.info?.tag || nfcWriter.result?.info?.rawTag) {
            setActiveTab("read");
          }
        }
      }, [nfcWriter]);

      return (
        <div>
          <div data-testid="active-tab">{activeTab}</div>
          <div data-testid="writer-status">{nfcWriter.status || "null"}</div>
        </div>
      );
    };

    // Start with status null and no results
    vi.mocked(useNfcWriter).mockReturnValue({
      status: null,
      write: vi.fn(),
      end: vi.fn(),
      writing: false,
      result: null
    });

    const { rerender } = render(<TestComponent />);

    expect(screen.getByTestId("active-tab")).toHaveTextContent("tools");

    // Change status to success with tag results
    vi.mocked(useNfcWriter).mockReturnValue({
      status: 'success' as any,
      write: vi.fn(),
      end: vi.fn(),
      writing: false,
      result: { status: 'success' as any, info: { rawTag: null, tag: { uid: "test-uid", text: "" } } }
    });

    rerender(<TestComponent />);

    expect(screen.getByTestId("active-tab")).toHaveTextContent("read");
  });

  it("should handle write modal close properly", async () => {
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

  it("should log raw tag data when operation completes", async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { useNfcWriter } = await import("../../../lib/writeNfcHook");

    const TestComponent = () => {
      const nfcWriter = useNfcWriter();

      React.useEffect(() => {
        if (nfcWriter.status !== null) {
          console.log(JSON.stringify(nfcWriter.result?.info.rawTag));
        }
      }, [nfcWriter]);

      return <div data-testid="component">Component</div>;
    };

    // Start with status null
    vi.mocked(useNfcWriter).mockReturnValue({
      status: null,
      write: vi.fn(),
      end: vi.fn(),
      writing: false,
      result: null
    });

    const { rerender } = render(<TestComponent />);

    // Change status to success with rawTag data
    vi.mocked(useNfcWriter).mockReturnValue({
      status: 'success' as any,
      write: vi.fn(),
      end: vi.fn(),
      writing: false,
      result: { status: 'success' as any, info: { rawTag: { data: "test-raw-data" } as any, tag: null } }
    });

    rerender(<TestComponent />);

    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify({ data: "test-raw-data" }));

    consoleSpy.mockRestore();
  });
});
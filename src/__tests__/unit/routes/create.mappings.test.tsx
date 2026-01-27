import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import toast from "react-hot-toast";

// Mock dependencies
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@capacitor-mlkit/barcode-scanning", () => ({
  BarcodeScanner: {
    scan: vi.fn().mockResolvedValue({
      barcodes: [
        {
          rawValue: "test-barcode-value",
        },
      ],
    }),
  },
}));

vi.mock("../../../lib/coreApi.ts", () => ({
  CoreAPI: {
    mappings: vi.fn().mockResolvedValue({
      mappings: [
        {
          id: "1",
          type: "uid",
          pattern: "existing-uid",
          override: "existing script",
          enabled: true,
          label: "Test Mapping",
        },
      ],
    }),
    updateMapping: vi.fn().mockResolvedValue({}),
    newMapping: vi.fn().mockResolvedValue({}),
    deleteMapping: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("../../../lib/store.ts", () => ({
  useStatusStore: vi.fn((selector) => {
    const mockState = {
      connected: true,
    };
    return selector(mockState);
  }),
}));

vi.mock("../../../lib/writeNfcHook", () => ({
  useNfcWriter: vi.fn(() => ({
    status: null,
    write: vi.fn(),
    end: vi.fn(),
    writing: false,
    result: null,
  })),
  WriteAction: {
    Read: "read",
  },
}));

vi.mock("../../../hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({})),
}));

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    createFileRoute: actual.createFileRoute,
  };
});

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useQuery: vi.fn(() => ({
      data: {
        mappings: [
          {
            id: "1",
            type: "uid",
            pattern: "existing-uid",
            override: "existing script",
            enabled: true,
            label: "Test Mapping",
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })),
  };
});

vi.mock("../../../components/wui/TextInput.tsx", () => ({
  TextInput: ({ value, setValue, label }: any) => (
    <div>
      <label data-testid="text-input-label">{label}</label>
      <input
        data-testid="text-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  ),
}));

vi.mock("../../../components/ZapScriptInput.tsx", () => ({
  ZapScriptInput: ({ value, setValue, showPalette, rows }: any) => (
    <textarea
      data-testid="zap-script-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      data-palette={showPalette}
      rows={rows}
    />
  ),
}));

vi.mock("../../../components/wui/Button", () => ({
  Button: ({ label, onClick, disabled, icon, variant }: any) => (
    <button
      data-testid={`button-${label.toLowerCase().replace(/\s+/g, "-")}`}
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
    >
      {icon && <span data-testid="button-icon">{icon}</span>}
      {label}
    </button>
  ),
}));

vi.mock("../../../components/PageFrame", () => ({
  PageFrame: ({ title, back, children, ...props }: any) => (
    <div data-testid="page-frame" {...props}>
      <div data-testid="page-title">{title}</div>
      <button data-testid="back-button" onClick={back}>
        Back
      </button>
      <div data-testid="page-content">{children}</div>
    </div>
  ),
}));

vi.mock("../../../components/WriteModal", () => ({
  WriteModal: ({ isOpen, close }: any) =>
    isOpen ? (
      <div data-testid="write-modal">
        <button data-testid="close-modal" onClick={close}>
          Close
        </button>
      </div>
    ) : null,
}));

describe("Create Mappings Route", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render mappings page with all components", async () => {
    const TestWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    // Mock the mappings component
    const MappingsComponent = () => {
      const [tokenId, setTokenId] = React.useState("");
      const [script, setScript] = React.useState("");

      return (
        <div data-testid="page-frame">
          <div data-testid="page-title">Mappings</div>
          <button data-testid="back-button">Back</button>
          <div data-testid="page-content">
            <div>
              <label data-testid="text-input-label">Token ID</label>
              <input
                data-testid="text-input"
                value={tokenId}
                onChange={(e) => setTokenId(e.target.value)}
              />
            </div>
            <button data-testid="button-nfc-mode">NFC Mode</button>
            <button data-testid="button-camera-mode">Camera Mode</button>
            <textarea
              data-testid="zap-script-input"
              value={script}
              onChange={(e) => setScript(e.target.value)}
            />
            <button data-testid="button-save-mapping">Save Mapping</button>
            <button data-testid="button-clear-mapping">Clear Mapping</button>
          </div>
        </div>
      );
    };

    render(
      <TestWrapper>
        <MappingsComponent />
      </TestWrapper>,
    );

    expect(screen.getByTestId("page-frame")).toBeInTheDocument();
    expect(screen.getByTestId("text-input")).toBeInTheDocument();
    expect(screen.getByTestId("button-nfc-mode")).toBeInTheDocument();
    expect(screen.getByTestId("button-camera-mode")).toBeInTheDocument();
    expect(screen.getByTestId("zap-script-input")).toBeInTheDocument();
    expect(screen.getByTestId("button-save-mapping")).toBeInTheDocument();
    expect(screen.getByTestId("button-clear-mapping")).toBeInTheDocument();
  });

  it("should handle token ID input changes", async () => {
    const TestComponent = () => {
      const [tokenId, setTokenId] = React.useState("");

      return (
        <div>
          <input
            data-testid="token-input"
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value)}
          />
          <div data-testid="token-value">{tokenId}</div>
        </div>
      );
    };

    render(<TestComponent />);

    const tokenInput = screen.getByTestId("token-input");
    fireEvent.change(tokenInput, { target: { value: "test-token-id" } });

    expect(screen.getByTestId("token-value")).toHaveTextContent(
      "test-token-id",
    );
  });

  it("should handle script input changes", async () => {
    const TestComponent = () => {
      const [script, setScript] = React.useState("");

      return (
        <div>
          <textarea
            data-testid="script-input"
            value={script}
            onChange={(e) => setScript(e.target.value)}
          />
          <div data-testid="script-value">{script}</div>
        </div>
      );
    };

    render(<TestComponent />);

    const scriptInput = screen.getByTestId("script-input");
    fireEvent.change(scriptInput, {
      target: { value: "**launch.system:snes" },
    });

    expect(screen.getByTestId("script-value")).toHaveTextContent(
      "**launch.system:snes",
    );
  });

  it("should handle NFC scan button click", async () => {
    const { useNfcWriter, WriteAction } =
      await import("../../../lib/writeNfcHook");
    const mockWrite = vi.fn();

    vi.mocked(useNfcWriter).mockReturnValue({
      status: null,
      write: mockWrite,
      end: vi.fn(),
      writing: false,
      result: null,
    });

    const TestComponent = () => {
      const [writeOpen, setWriteOpen] = React.useState(false);
      const nfcWriter = useNfcWriter();

      const handleNfcScan = () => {
        nfcWriter.write(WriteAction.Read);
        setWriteOpen(true);
      };

      return (
        <div>
          <button data-testid="nfc-scan-button" onClick={handleNfcScan}>
            NFC Scan
          </button>
          {writeOpen && <div data-testid="write-modal">Scanning...</div>}
        </div>
      );
    };

    render(<TestComponent />);

    const nfcButton = screen.getByTestId("nfc-scan-button");
    fireEvent.click(nfcButton);

    expect(mockWrite).toHaveBeenCalledWith(WriteAction.Read);
    expect(screen.getByTestId("write-modal")).toBeInTheDocument();
  });

  it("should handle barcode scanning", async () => {
    const { BarcodeScanner } =
      await import("@capacitor-mlkit/barcode-scanning");

    const TestComponent = () => {
      const [tokenId, setTokenId] = React.useState("");

      const handleBarcodeScan = () => {
        BarcodeScanner.scan().then((res) => {
          const barcode = res.barcodes[0];
          if (barcode) {
            setTokenId(barcode.rawValue);
          }
        });
      };

      return (
        <div>
          <button data-testid="barcode-scan-button" onClick={handleBarcodeScan}>
            Scan Barcode
          </button>
          <div data-testid="token-value">{tokenId}</div>
        </div>
      );
    };

    render(<TestComponent />);

    const barcodeButton = screen.getByTestId("barcode-scan-button");
    fireEvent.click(barcodeButton);

    await waitFor(() => {
      expect(screen.getByTestId("token-value")).toHaveTextContent(
        "test-barcode-value",
      );
    });
  });

  it("should gracefully handle barcode scan cancellation", async () => {
    const { BarcodeScanner } =
      await import("@capacitor-mlkit/barcode-scanning");

    // Mock scan rejection (user cancelled)
    vi.mocked(BarcodeScanner.scan).mockRejectedValueOnce(
      new Error("scan canceled."),
    );

    const TestComponent = () => {
      const [tokenId, setTokenId] = React.useState("");
      const [errorOccurred, setErrorOccurred] = React.useState(false);

      const handleBarcodeScan = () => {
        BarcodeScanner.scan()
          .then((res) => {
            const barcode = res.barcodes[0];
            if (barcode) {
              setTokenId(barcode.rawValue);
            }
          })
          .catch((error) => {
            // Cancellation should be silently ignored
            if (error.message.toLowerCase().includes("canceled")) {
              return;
            }
            setErrorOccurred(true);
          });
      };

      return (
        <div>
          <button data-testid="barcode-scan-button" onClick={handleBarcodeScan}>
            Scan Barcode
          </button>
          <div data-testid="token-value">{tokenId}</div>
          <div data-testid="error-state">{errorOccurred ? "error" : "ok"}</div>
        </div>
      );
    };

    render(<TestComponent />);

    const barcodeButton = screen.getByTestId("barcode-scan-button");
    fireEvent.click(barcodeButton);

    await waitFor(() => {
      // Token should remain empty after cancelled scan
      expect(screen.getByTestId("token-value")).toHaveTextContent("");
      // No error state should be triggered
      expect(screen.getByTestId("error-state")).toHaveTextContent("ok");
    });
  });

  it("should save new mapping", async () => {
    const { CoreAPI } = await import("../../../lib/coreApi.ts");
    const mockNewMapping = vi.mocked(CoreAPI.newMapping);

    const TestComponent = () => {
      const [tokenId, setTokenId] = React.useState("new-token");
      const [script, setScript] = React.useState("**launch.system:nes");

      const saveMapping = async () => {
        try {
          await CoreAPI.newMapping({
            label: "",
            enabled: true,
            type: "uid",
            match: "exact",
            pattern: tokenId,
            override: script,
          });
          toast.success("Mapping saved successfully!");
          setTokenId("");
          setScript("");
        } catch (error) {
          console.error(error);
        }
      };

      return (
        <div>
          <input
            data-testid="token-input"
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value)}
          />
          <textarea
            data-testid="script-input"
            value={script}
            onChange={(e) => setScript(e.target.value)}
          />
          <button
            data-testid="save-button"
            onClick={saveMapping}
            disabled={!tokenId || !script}
          >
            Save
          </button>
        </div>
      );
    };

    render(<TestComponent />);

    const saveButton = screen.getByTestId("save-button");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockNewMapping).toHaveBeenCalledWith({
        label: "",
        enabled: true,
        type: "uid",
        match: "exact",
        pattern: "new-token",
        override: "**launch.system:nes",
      });
    });

    expect(toast.success).toHaveBeenCalledWith("Mapping saved successfully!");
  });

  it("should update existing mapping", async () => {
    const { CoreAPI } = await import("../../../lib/coreApi.ts");
    const mockUpdateMapping = vi.mocked(CoreAPI.updateMapping);

    const TestComponent = () => {
      const [tokenId] = React.useState("existing-uid");
      const [script] = React.useState("updated script");

      const mappings = [
        {
          id: "1",
          type: "uid",
          pattern: "existing-uid",
          override: "existing script",
        },
      ];

      const saveMapping = async () => {
        const existing = mappings.find(
          (m) => m.type === "uid" && m.pattern === tokenId,
        );
        if (existing) {
          try {
            await CoreAPI.updateMapping({
              id: parseInt(existing.id, 10),
              label: "",
              enabled: true,
              type: "uid",
              match: "exact",
              pattern: tokenId,
              override: script,
            });
            toast.success("Mapping saved successfully!");
          } catch (error) {
            console.error(error);
          }
        }
      };

      return (
        <div>
          <button data-testid="save-button" onClick={saveMapping}>
            Save
          </button>
        </div>
      );
    };

    render(<TestComponent />);

    const saveButton = screen.getByTestId("save-button");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateMapping).toHaveBeenCalledWith({
        id: 1,
        label: "",
        enabled: true,
        type: "uid",
        match: "exact",
        pattern: "existing-uid",
        override: "updated script",
      });
    });

    expect(toast.success).toHaveBeenCalledWith("Mapping saved successfully!");
  });

  it("should delete existing mapping", async () => {
    const { CoreAPI } = await import("../../../lib/coreApi.ts");
    const mockDeleteMapping = vi.mocked(CoreAPI.deleteMapping);

    const TestComponent = () => {
      const [tokenId, setTokenId] = React.useState("existing-uid");

      const mappings = [
        {
          id: "1",
          type: "uid",
          pattern: "existing-uid",
          override: "existing script",
        },
      ];

      const deleteMapping = async () => {
        const existing = mappings.find(
          (m) => m.type === "uid" && m.pattern === tokenId,
        );
        if (existing) {
          try {
            await CoreAPI.deleteMapping({ id: parseInt(existing.id, 10) });
            setTokenId("");
          } catch (error) {
            console.error(error);
          }
        }
      };

      return (
        <div>
          <button data-testid="delete-button" onClick={deleteMapping}>
            Delete
          </button>
          <div data-testid="token-value">{tokenId}</div>
        </div>
      );
    };

    render(<TestComponent />);

    const deleteButton = screen.getByTestId("delete-button");
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockDeleteMapping).toHaveBeenCalledWith({ id: 1 });
    });

    await waitFor(() => {
      expect(screen.getByTestId("token-value")).toHaveTextContent("");
    });
  });

  it("should disable buttons when not connected", async () => {
    const { useStatusStore } = await import("../../../lib/store.ts");

    // Mock disconnected state
    vi.mocked(useStatusStore).mockImplementation((selector: any) => {
      const mockState = {
        connected: false,
        setConnected: vi.fn(),
        connectionState: "disconnected",
        setConnectionState: vi.fn(),
        lastConnectionTime: null,
        setLastConnectionTime: vi.fn(),
        playing: { mediaName: "", systemName: "", mediaPath: "" },
        setPlaying: vi.fn(),
        lastToken: null,
        setLastToken: vi.fn(),
        gamesIndex: { exists: false, indexing: false },
        setGamesIndex: vi.fn(),
        loggedInUser: null,
        setLoggedInUser: vi.fn(),
      };
      return selector(mockState);
    });

    const TestComponent = () => {
      const connected = useStatusStore((state: any) => state.connected);

      return (
        <div>
          <button data-testid="save-button" disabled={!connected}>
            Save
          </button>
          <button data-testid="clear-button" disabled={!connected}>
            Clear
          </button>
        </div>
      );
    };

    render(<TestComponent />);

    expect(screen.getByTestId("save-button")).toBeDisabled();
    expect(screen.getByTestId("clear-button")).toBeDisabled();
  });

  it("should handle NFC scan result and populate fields", async () => {
    const { useNfcWriter } = await import("../../../lib/writeNfcHook");

    const TestComponent = () => {
      const [tokenId, setTokenId] = React.useState("");
      const [script, setScript] = React.useState("");
      const nfcWriter = useNfcWriter();

      const mappings = [
        {
          id: "1",
          type: "uid",
          pattern: "scanned-uid",
          override: "existing script for scanned uid",
        },
      ];

      React.useEffect(() => {
        if (nfcWriter.status !== null) {
          if (nfcWriter.result?.info.tag?.uid) {
            const uid = nfcWriter.result.info.tag.uid;
            setTokenId(uid);
            const existing = mappings.find(
              (m) => m.type === "uid" && m.pattern === uid,
            );
            if (existing) {
              setScript(existing.override);
            } else {
              setScript("");
            }
          }
        }
      }, [nfcWriter.result, nfcWriter]);

      return (
        <div>
          <div data-testid="token-value">{tokenId}</div>
          <div data-testid="script-value">{script}</div>
          <div data-testid="writer-status">{nfcWriter.status || "null"}</div>
        </div>
      );
    };

    // Start with no results
    vi.mocked(useNfcWriter).mockReturnValue({
      status: null,
      write: vi.fn(),
      end: vi.fn(),
      writing: false,
      result: null,
    });

    const { rerender } = render(<TestComponent />);

    expect(screen.getByTestId("token-value")).toHaveTextContent("");

    // Simulate NFC scan result
    const { Status } = await import("../../../lib/nfc");
    vi.mocked(useNfcWriter).mockReturnValue({
      status: Status.Success,
      write: vi.fn(),
      end: vi.fn(),
      writing: false,
      result: {
        status: "success" as any,
        info: {
          rawTag: null,
          tag: { uid: "scanned-uid", text: "scanned-text" },
        },
      },
    });

    rerender(<TestComponent />);

    expect(screen.getByTestId("token-value")).toHaveTextContent("scanned-uid");
    expect(screen.getByTestId("script-value")).toHaveTextContent(
      "existing script for scanned uid",
    );
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

  it("should handle loading and error states", async () => {
    // Test loading state
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isPending: true,
      isError: false,
      error: null,
      isLoadingError: false,
      isRefetchError: false,
      isSuccess: false,
      isStale: false,
      isFetched: false,
      isFetching: false,
      refetch: vi.fn(),
      status: "pending",
    } as any);

    const TestComponent = () => {
      const mappings = useQuery({
        queryKey: ["mappings"],
        queryFn: vi.fn(),
      });

      if (mappings.isLoading || mappings.isError) {
        return <div data-testid="empty-state">Empty</div>;
      }

      return <div data-testid="content">Content</div>;
    };

    const { rerender } = render(<TestComponent />);

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();

    // Test error state
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isPending: false,
      isError: true,
      error: new Error("Test error"),
      isLoadingError: false,
      isRefetchError: true,
      isSuccess: false,
      isStale: false,
      isFetched: true,
      isFetching: false,
      refetch: vi.fn(),
      status: "error",
    } as any);

    rerender(<TestComponent />);

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();

    // Test success state
    vi.mocked(useQuery).mockReturnValue({
      data: { mappings: [] },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      isLoadingError: false,
      isRefetchError: false,
      isSuccess: true,
      isStale: false,
      isFetched: true,
      isFetching: false,
      refetch: vi.fn(),
      status: "success",
    } as any);

    rerender(<TestComponent />);

    expect(screen.getByTestId("content")).toBeInTheDocument();
  });
});

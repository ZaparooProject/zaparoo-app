/**
 * Integration Test: Create Mappings Route
 *
 * Tests the mapping creation page including:
 * - Rendering mapping creation form with token ID and ZapScript inputs
 * - NFC and Camera scan buttons
 * - Save button state based on form validity and connection
 * - Clear mapping button state and functionality
 * - Navigation back
 */

import React from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "../../test-utils";
import userEvent from "@testing-library/user-event";

// Use vi.hoisted for variables accessed in mock factories
const {
  componentRef,
  mockGoBack,
  mockRefetch,
  mockToastSuccess,
  mockNewMapping,
  mockUpdateMapping,
  mockDeleteMapping,
  mockMappingsData,
  mockIsLoading,
  mockNfcWriter,
  mockBarcodeScan,
} = vi.hoisted(() => ({
  componentRef: { current: null as any },
  mockGoBack: vi.fn(),
  mockRefetch: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockNewMapping: vi.fn(),
  mockUpdateMapping: vi.fn(),
  mockDeleteMapping: vi.fn(),
  mockMappingsData: { current: { mappings: [] as any[] } },
  mockIsLoading: { current: false },
  mockNfcWriter: {
    status: null as string | null,
    result: null as any,
    write: vi.fn(),
    end: vi.fn(),
    writing: false,
  },
  mockBarcodeScan: vi.fn(),
}));

// Mock TanStack Router - external library, needed for route testing
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createFileRoute: () => (options: any) => {
      componentRef.current = options.component;
      return { options };
    },
    useRouter: () => ({ history: { back: mockGoBack } }),
    // Mock Link to avoid router context requirements in nested components
    Link: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      to?: string;
    }) => <a {...props}>{children}</a>,
  };
});

// Mock CoreAPI - interface to external JSON-RPC API
vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    mappings: vi.fn(),
    newMapping: mockNewMapping,
    updateMapping: mockUpdateMapping,
    deleteMapping: mockDeleteMapping,
    systems: vi.fn().mockResolvedValue({ systems: [] }),
    run: vi.fn().mockResolvedValue({}),
    reset: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    hasWriteCapableReader: vi.fn().mockResolvedValue(false),
  },
}));

// Mock store - provide controlled state
let mockConnected = true;
vi.mock("@/lib/store", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useStatusStore: (selector: any) =>
      selector({
        connected: mockConnected,
        safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
        gamesIndex: {
          indexing: false,
          currentSystem: "",
          totalSystems: 0,
          totalSteps: 0,
          currentStep: 0,
        },
      }),
  };
});

// Mock react-query - external library, handle different queryKeys
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useQuery: vi.fn(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === "mappings") {
        return {
          data: mockMappingsData.current,
          isLoading: mockIsLoading.current,
          isError: false,
          refetch: mockRefetch,
        };
      }
      if (queryKey[0] === "systems") {
        return {
          data: { systems: [] },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        };
      }
      return {
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      };
    }),
  };
});

// Mock toast - external library
vi.mock("react-hot-toast", () => ({
  default: {
    success: mockToastSuccess,
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

// Mock NFC writer hook
vi.mock("@/lib/writeNfcHook", () => ({
  useNfcWriter: () => mockNfcWriter,
  WriteAction: {
    Write: "write",
    Read: "read",
  },
}));

// Mock BarcodeScanner - Capacitor plugin
vi.mock("@capacitor-mlkit/barcode-scanning", () => ({
  BarcodeScanner: {
    scan: mockBarcodeScan,
  },
}));

// Mock error wrapper
vi.mock("@/lib/errors", () => ({
  wrapBarcodeScannerError: (error: Error) => error,
  BarcodeScanCancelledError: class BarcodeScanCancelledError extends Error {
    constructor() {
      super("cancelled");
      this.name = "BarcodeScanCancelledError";
    }
  },
}));

// Import the route module to capture the component
import "@/routes/create.mappings";
import { BarcodeScanCancelledError } from "@/lib/errors";

const getMappings = () => componentRef.current;

describe("Create Mappings Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnected = true;
    mockMappingsData.current = { mappings: [] };
    mockIsLoading.current = false;

    // Set up API mock resolved values
    mockNewMapping.mockResolvedValue({ success: true });
    mockUpdateMapping.mockResolvedValue({ success: true });
    mockDeleteMapping.mockResolvedValue({ success: true });

    // Reset NFC writer mock
    mockNfcWriter.status = null;
    mockNfcWriter.result = null;
    mockNfcWriter.write.mockClear();
    mockNfcWriter.end.mockClear();

    // Reset barcode scanner mock
    mockBarcodeScan.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () => {
    const Mappings = getMappings();
    return render(<Mappings />);
  };

  // Helper to fill and submit the mapping form
  const fillAndSaveMapping = async (
    user: ReturnType<typeof userEvent.setup>,
    tokenId: string,
    script: string,
  ) => {
    const tokenInput = screen.getByRole("textbox", {
      name: /create\.mappings\.tokenId/i,
    });
    await user.type(tokenInput, tokenId);
    await user.type(
      screen.getByLabelText("create.custom.textareaLabel"),
      script,
    );
    await user.click(
      screen.getByRole("button", { name: /create\.mappings\.saveMapping/i }),
    );
  };

  describe("rendering", () => {
    it("should render the page title", () => {
      renderComponent();
      expect(
        screen.getByRole("heading", { name: "create.mappings.title" }),
      ).toBeInTheDocument();
    });

    it("should render the back button", () => {
      renderComponent();
      expect(screen.getByLabelText("nav.back")).toBeInTheDocument();
    });

    it("should render token ID input", () => {
      renderComponent();
      expect(screen.getByText("create.mappings.tokenId")).toBeInTheDocument();
    });

    it("should render NFC and Camera scan buttons", () => {
      renderComponent();
      expect(
        screen.getByRole("button", { name: /scan\.nfcMode/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /scan\.cameraMode/i }),
      ).toBeInTheDocument();
    });

    it("should render ZapScript input", () => {
      renderComponent();
      // Real ZapScriptInput component uses this aria-label
      expect(
        screen.getByLabelText("create.custom.textareaLabel"),
      ).toBeInTheDocument();
    });

    it("should render save and clear buttons", () => {
      renderComponent();
      expect(
        screen.getByRole("button", { name: /create\.mappings\.saveMapping/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /create\.mappings\.clearMapping/i }),
      ).toBeInTheDocument();
    });

    it("should not render content when loading", () => {
      mockIsLoading.current = true;
      renderComponent();
      // Main content should not be visible while loading
      expect(
        screen.queryByRole("heading", { name: "create.mappings.title" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("save button state", () => {
    it("should disable save button when token ID is empty", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Fill only ZapScript using real component's aria-label
      await user.type(
        screen.getByLabelText("create.custom.textareaLabel"),
        "**launch.random",
      );

      expect(
        screen.getByRole("button", { name: /create\.mappings\.saveMapping/i }),
      ).toBeDisabled();
    });

    it("should disable save button when script is empty", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Fill only token ID - find the text input
      const tokenInput = screen.getByRole("textbox", {
        name: /create\.mappings\.tokenId/i,
      });
      await user.type(tokenInput, "abc123def456");

      expect(
        screen.getByRole("button", { name: /create\.mappings\.saveMapping/i }),
      ).toBeDisabled();
    });

    it("should disable save button when disconnected", async () => {
      mockConnected = false;
      const user = userEvent.setup();
      renderComponent();

      // Fill both fields
      const tokenInput = screen.getByRole("textbox", {
        name: /create\.mappings\.tokenId/i,
      });
      await user.type(tokenInput, "abc123def456");
      await user.type(
        screen.getByLabelText("create.custom.textareaLabel"),
        "**launch.random",
      );

      expect(
        screen.getByRole("button", { name: /create\.mappings\.saveMapping/i }),
      ).toBeDisabled();
    });

    it("should enable save button when form is valid and connected", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Fill both fields
      const tokenInput = screen.getByRole("textbox", {
        name: /create\.mappings\.tokenId/i,
      });
      await user.type(tokenInput, "abc123def456");
      await user.type(
        screen.getByLabelText("create.custom.textareaLabel"),
        "**launch.random",
      );

      expect(
        screen.getByRole("button", { name: /create\.mappings\.saveMapping/i }),
      ).not.toBeDisabled();
    });
  });

  describe("save mapping", () => {
    it("should call newMapping API when saving new mapping", async () => {
      const user = userEvent.setup();
      renderComponent();

      await fillAndSaveMapping(user, "abc123def456", "**launch.random");

      await waitFor(() => {
        expect(mockNewMapping).toHaveBeenCalledWith({
          label: "",
          enabled: true,
          type: "uid",
          match: "exact",
          pattern: "abc123def456",
          override: "**launch.random",
        });
      });
    });

    it("should call updateMapping API when saving existing mapping", async () => {
      mockMappingsData.current = {
        mappings: [
          {
            id: "42",
            added: new Date().toISOString(),
            label: "Test",
            enabled: true,
            type: "uid",
            match: "exact",
            pattern: "abc123def456",
            override: "old-script",
          },
        ],
      };

      const user = userEvent.setup();
      renderComponent();

      await fillAndSaveMapping(user, "abc123def456", "**launch.new");

      await waitFor(() => {
        expect(mockUpdateMapping).toHaveBeenCalledWith({
          id: 42,
          label: "",
          enabled: true,
          type: "uid",
          match: "exact",
          pattern: "abc123def456",
          override: "**launch.new",
        });
      });
    });

    it("should show success toast after saving", async () => {
      const user = userEvent.setup();
      renderComponent();

      await fillAndSaveMapping(user, "abc123def456", "**launch.random");

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalled();
      });
    });

    it("should refetch mappings after saving", async () => {
      const user = userEvent.setup();
      renderComponent();

      await fillAndSaveMapping(user, "abc123def456", "**launch.random");

      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled();
      });
    });
  });

  describe("clear mapping button", () => {
    it("should disable clear button when no existing mapping", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Type a token ID that doesn't exist
      const tokenInput = screen.getByRole("textbox", {
        name: /create\.mappings\.tokenId/i,
      });
      await user.type(tokenInput, "nonexistent");

      expect(
        screen.getByRole("button", { name: /create\.mappings\.clearMapping/i }),
      ).toBeDisabled();
    });

    it("should enable clear button when existing mapping found", async () => {
      mockMappingsData.current = {
        mappings: [
          {
            id: "42",
            added: new Date().toISOString(),
            label: "Test",
            enabled: true,
            type: "uid",
            match: "exact",
            pattern: "abc123def456",
            override: "**launch.random",
          },
        ],
      };

      const user = userEvent.setup();
      renderComponent();

      // Type the matching token ID
      const tokenInput = screen.getByRole("textbox", {
        name: /create\.mappings\.tokenId/i,
      });
      await user.type(tokenInput, "abc123def456");

      expect(
        screen.getByRole("button", { name: /create\.mappings\.clearMapping/i }),
      ).not.toBeDisabled();
    });

    it("should call deleteMapping API when clearing", async () => {
      mockMappingsData.current = {
        mappings: [
          {
            id: "42",
            added: new Date().toISOString(),
            label: "Test",
            enabled: true,
            type: "uid",
            match: "exact",
            pattern: "abc123def456",
            override: "**launch.random",
          },
        ],
      };

      const user = userEvent.setup();
      renderComponent();

      // Type the matching token ID
      const tokenInput = screen.getByRole("textbox", {
        name: /create\.mappings\.tokenId/i,
      });
      await user.type(tokenInput, "abc123def456");

      // Click clear
      await user.click(
        screen.getByRole("button", { name: /create\.mappings\.clearMapping/i }),
      );

      await waitFor(() => {
        expect(mockDeleteMapping).toHaveBeenCalledWith({ id: 42 });
      });
    });
  });

  describe("NFC scan", () => {
    it("should show NFC scanning dialog when NFC button clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("button", { name: /scan\.nfcMode/i }));

      // Real WriteModal renders with role="dialog"
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("should show cancel button in NFC dialog", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("button", { name: /scan\.nfcMode/i }));

      // WriteModal has a cancel button
      expect(
        screen.getByRole("button", { name: "nav.cancel" }),
      ).toBeInTheDocument();
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

  describe("NFC read completion", () => {
    it("should populate token ID when NFC read completes with tag data", async () => {
      const user = userEvent.setup();
      const { rerender } = renderComponent();

      // Click NFC button to start scan
      await user.click(screen.getByRole("button", { name: /scan\.nfcMode/i }));

      // Simulate NFC read completing with result
      mockNfcWriter.status = "success";
      mockNfcWriter.result = {
        info: {
          tag: { uid: "AABBCCDD" },
        },
      };

      // Re-render to trigger the useEffect
      const Mappings = getMappings();
      rerender(<Mappings />);

      // Token ID input should be populated
      await waitFor(() => {
        const tokenInput = screen.getByRole("textbox", {
          name: /create\.mappings\.tokenId/i,
        });
        expect(tokenInput).toHaveValue("AABBCCDD");
      });
    });

    it("should populate script when NFC read finds existing mapping", async () => {
      mockMappingsData.current = {
        mappings: [
          {
            id: "42",
            added: new Date().toISOString(),
            label: "Test",
            enabled: true,
            type: "uid",
            match: "exact",
            pattern: "AABBCCDD",
            override: "**launch.existing",
          },
        ],
      };

      const user = userEvent.setup();
      const { rerender } = renderComponent();

      // Click NFC button to start scan
      await user.click(screen.getByRole("button", { name: /scan\.nfcMode/i }));

      // Simulate NFC read completing with result that matches existing mapping
      mockNfcWriter.status = "success";
      mockNfcWriter.result = {
        info: {
          tag: { uid: "AABBCCDD" },
        },
      };

      // Re-render to trigger the useEffect
      const Mappings = getMappings();
      rerender(<Mappings />);

      // Script input should be populated with existing mapping's script
      await waitFor(() => {
        expect(
          screen.getByLabelText("create.custom.textareaLabel"),
        ).toHaveValue("**launch.existing");
      });
    });

    it("should clear script when NFC read finds no existing mapping", async () => {
      const user = userEvent.setup();
      const { rerender } = renderComponent();

      // First, manually enter a script
      await user.type(
        screen.getByLabelText("create.custom.textareaLabel"),
        "**launch.test",
      );

      // Click NFC button to start scan
      await user.click(screen.getByRole("button", { name: /scan\.nfcMode/i }));

      // Simulate NFC read completing with UID that has no mapping
      mockNfcWriter.status = "success";
      mockNfcWriter.result = {
        info: {
          tag: { uid: "NEW12345" },
        },
      };

      // Re-render to trigger the useEffect
      const Mappings = getMappings();
      rerender(<Mappings />);

      // Script should be cleared since there's no existing mapping
      await waitFor(() => {
        expect(
          screen.getByLabelText("create.custom.textareaLabel"),
        ).toHaveValue("");
      });
    });
  });

  describe("barcode scanner", () => {
    it("should populate token ID when barcode scan succeeds", async () => {
      mockBarcodeScan.mockResolvedValue({
        barcodes: [{ rawValue: "BARCODE123456" }],
      });

      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: /scan\.cameraMode/i }),
      );

      await waitFor(() => {
        const tokenInput = screen.getByRole("textbox", {
          name: /create\.mappings\.tokenId/i,
        });
        expect(tokenInput).toHaveValue("BARCODE123456");
      });
    });

    it("should populate script when barcode matches existing mapping", async () => {
      mockMappingsData.current = {
        mappings: [
          {
            id: "99",
            added: new Date().toISOString(),
            label: "Barcode Test",
            enabled: true,
            type: "uid",
            match: "exact",
            pattern: "BARCODE123456",
            override: "**launch.barcode",
          },
        ],
      };

      mockBarcodeScan.mockResolvedValue({
        barcodes: [{ rawValue: "BARCODE123456" }],
      });

      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: /scan\.cameraMode/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByLabelText("create.custom.textareaLabel"),
        ).toHaveValue("**launch.barcode");
      });
    });

    it("should clear script when barcode has no existing mapping", async () => {
      mockBarcodeScan.mockResolvedValue({
        barcodes: [{ rawValue: "NEWBARCODE" }],
      });

      const user = userEvent.setup();
      renderComponent();

      // First, manually enter a script
      await user.type(
        screen.getByLabelText("create.custom.textareaLabel"),
        "**launch.old",
      );

      await user.click(
        screen.getByRole("button", { name: /scan\.cameraMode/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByLabelText("create.custom.textareaLabel"),
        ).toHaveValue("");
      });
    });

    it("should not update fields when no barcodes returned", async () => {
      mockBarcodeScan.mockResolvedValue({
        barcodes: [],
      });

      const user = userEvent.setup();
      renderComponent();

      // Enter token ID first
      const tokenInput = screen.getByRole("textbox", {
        name: /create\.mappings\.tokenId/i,
      });
      await user.type(tokenInput, "EXISTING");

      await user.click(
        screen.getByRole("button", { name: /scan\.cameraMode/i }),
      );

      // Token ID should remain unchanged
      await waitFor(() => {
        expect(tokenInput).toHaveValue("EXISTING");
      });
    });

    it("should silently handle user cancellation", async () => {
      // Simulate user cancelling the scanner
      mockBarcodeScan.mockRejectedValue(new BarcodeScanCancelledError());

      const user = userEvent.setup();
      renderComponent();

      // Should not throw or show error
      await user.click(
        screen.getByRole("button", { name: /scan\.cameraMode/i }),
      );

      // Form should remain empty/unchanged
      const tokenInput = screen.getByRole("textbox", {
        name: /create\.mappings\.tokenId/i,
      });
      expect(tokenInput).toHaveValue("");
    });

    it("should handle scanner errors gracefully", async () => {
      mockBarcodeScan.mockRejectedValue(new Error("Camera access denied"));

      const user = userEvent.setup();
      renderComponent();

      // Should not crash
      await user.click(
        screen.getByRole("button", { name: /scan\.cameraMode/i }),
      );

      // Form should remain functional
      const tokenInput = screen.getByRole("textbox", {
        name: /create\.mappings\.tokenId/i,
      });
      expect(tokenInput).toBeInTheDocument();
    });
  });
});

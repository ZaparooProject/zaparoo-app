/**
 * Integration Test: Create Mappings Edit Route
 *
 * Tests the mapping editor page including:
 * - New mapping form (no id) — defaults, save flow
 * - Editing existing mapping — pre-fill from query cache, update flow
 * - Type/match segmented selection
 * - NFC and Camera scan helpers (only when type=ID)
 * - Regex pattern client-side validation
 * - Delete with SlideModal confirmation
 * - Disabled-when-disconnected state
 */

import React from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "../../test-utils";
import userEvent from "@testing-library/user-event";

const {
  mockGoBack,
  mockNavigate,
  mockToastSuccess,
  mockToastError,
  mockNewMapping,
  mockUpdateMapping,
  mockDeleteMapping,
  mockInvalidate,
  mockMappingsData,
  mockNfcWriter,
  mockBarcodeScan,
  mockCanGoBack,
} = vi.hoisted(() => ({
  mockGoBack: vi.fn(),
  mockNavigate: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockNewMapping: vi.fn(),
  mockUpdateMapping: vi.fn(),
  mockDeleteMapping: vi.fn(),
  mockInvalidate: vi.fn(),
  mockMappingsData: { current: { mappings: [] as any[] } },
  mockNfcWriter: {
    status: null as string | null,
    result: null as any,
    write: vi.fn(),
    end: vi.fn(),
    writing: false,
  },
  mockBarcodeScan: vi.fn(),
  mockCanGoBack: vi.fn(() => true),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useRouter: () => ({
      history: { back: mockGoBack, canGoBack: mockCanGoBack },
    }),
    useNavigate: () => mockNavigate,
    Link: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      to?: string;
    }) => <a {...props}>{children}</a>,
  };
});

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

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidate,
    }),
    useQuery: vi.fn(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === "mappings") {
        return {
          data: mockMappingsData.current,
          isLoading: false,
          isFetched: true,
          isFetching: false,
          isError: false,
          refetch: vi.fn(),
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
        isFetched: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      };
    }),
  };
});

vi.mock("react-hot-toast", () => ({
  default: {
    success: mockToastSuccess,
    error: mockToastError,
    dismiss: vi.fn(),
  },
}));

vi.mock("@/lib/writeNfcHook", () => ({
  useNfcWriter: () => mockNfcWriter,
  WriteMethod: {
    Auto: "auto",
    LocalNFC: "local",
    RemoteReader: "remote",
  },
  WriteAction: {
    Write: "write",
    Read: "read",
  },
}));

vi.mock("@capacitor-mlkit/barcode-scanning", () => ({
  BarcodeScanner: {
    scan: mockBarcodeScan,
  },
}));

vi.mock("@/lib/errors", () => ({
  wrapBarcodeScannerError: (error: Error) => error,
  BarcodeScanCancelledError: class BarcodeScanCancelledError extends Error {
    constructor() {
      super("cancelled");
      this.name = "BarcodeScanCancelledError";
    }
  },
}));

import { MappingEditor } from "@/routes/-pages/MappingEditor";

const buildMapping = (overrides: Partial<any> = {}) => ({
  id: "1",
  added: new Date().toISOString(),
  label: "",
  enabled: true,
  type: "uid",
  match: "exact",
  pattern: "AABB",
  override: "**launch.random",
  ...overrides,
});

describe("Create Mappings Edit Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnected = true;
    mockMappingsData.current = { mappings: [] };
    mockNewMapping.mockResolvedValue({ success: true });
    mockUpdateMapping.mockResolvedValue({ success: true });
    mockDeleteMapping.mockResolvedValue({ success: true });
    mockInvalidate.mockResolvedValue(undefined);
    mockNfcWriter.status = null;
    mockNfcWriter.result = null;
    mockNfcWriter.write.mockClear();
    mockNfcWriter.end.mockClear();
    mockBarcodeScan.mockReset();
    mockCanGoBack.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderEditor = (id?: number) => render(<MappingEditor id={id} />);

  describe("new mapping (no id)", () => {
    it("should render the 'new mapping' heading", () => {
      renderEditor();
      expect(
        screen.getByRole("heading", {
          name: "create.mappings.editor.titleNew",
        }),
      ).toBeInTheDocument();
    });

    it("should default type to ID and show NFC/Camera helpers", () => {
      renderEditor();
      const idRadio = screen.getByRole("radio", {
        name: "create.mappings.editor.typeId",
      });
      expect(idRadio).toHaveAttribute("aria-checked", "true");
      expect(
        screen.getByRole("button", { name: /scan\.nfcMode/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /scan\.cameraMode/i }),
      ).toBeInTheDocument();
    });

    it("should hide scan helpers when type is changed away from ID", async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(
        screen.getByRole("radio", {
          name: "create.mappings.editor.typeValue",
        }),
      );

      expect(
        screen.queryByRole("button", { name: /scan\.nfcMode/i }),
      ).not.toBeInTheDocument();
    });

    it("should disable Save until pattern is provided", async () => {
      renderEditor();
      const saveButton = screen.getByRole("button", {
        name: /create\.mappings\.editor\.save/i,
      });
      expect(saveButton).toBeDisabled();
    });

    it("should not show a Delete button for new mappings", () => {
      renderEditor();
      expect(
        screen.queryByRole("button", {
          name: /create\.mappings\.editor\.delete/i,
        }),
      ).not.toBeInTheDocument();
    });

    it("should call newMapping with form values on Save", async () => {
      const user = userEvent.setup();
      renderEditor();

      const patternInput = screen.getByLabelText(
        "create.mappings.editor.pattern",
      );
      await user.type(patternInput, "AABBCCDD");
      await user.type(
        screen.getByLabelText("create.mappings.editor.label"),
        "Test mapping",
      );
      await user.type(
        screen.getByLabelText("create.custom.textareaLabel"),
        "**launch.test",
      );
      await user.click(
        screen.getByRole("button", {
          name: /create\.mappings\.editor\.save/i,
        }),
      );

      await waitFor(() => {
        expect(mockNewMapping).toHaveBeenCalledWith({
          label: "Test mapping",
          enabled: true,
          type: "uid",
          match: "exact",
          pattern: "AABBCCDD",
          override: "**launch.test",
        });
      });
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({
          to: "/create/mappings",
          replace: true,
        });
      });
    });

    it("should show a regex error and disable Save for invalid regex", async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(
        screen.getByRole("radio", {
          name: "create.mappings.editor.matchRegex",
        }),
      );
      const patternInput = screen.getByLabelText(
        "create.mappings.editor.pattern",
      );
      await user.click(patternInput);
      await user.paste("[invalid(");

      expect(
        screen.getByText("create.mappings.editor.matchRegexInvalid"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: /create\.mappings\.editor\.save/i,
        }),
      ).toBeDisabled();

      await user.clear(patternInput);
      await user.paste("valid.*");

      expect(
        screen.queryByText("create.mappings.editor.matchRegexInvalid"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: /create\.mappings\.editor\.save/i,
        }),
      ).toBeEnabled();
    });

    it("should populate pattern when NFC scan completes", async () => {
      const user = userEvent.setup();
      const { rerender } = renderEditor();

      await user.click(screen.getByRole("button", { name: /scan\.nfcMode/i }));

      mockNfcWriter.status = "success";
      mockNfcWriter.result = { info: { tag: { uid: "FROMNFC" } } };

      rerender(<MappingEditor />);

      await waitFor(() => {
        expect(
          screen.getByLabelText("create.mappings.editor.pattern"),
        ).toHaveValue("FROMNFC");
      });
    });

    it("should populate pattern when barcode scan succeeds", async () => {
      mockBarcodeScan.mockResolvedValue({
        barcodes: [{ rawValue: "FROMCAM" }],
      });
      const user = userEvent.setup();
      renderEditor();

      await user.click(
        screen.getByRole("button", { name: /scan\.cameraMode/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByLabelText("create.mappings.editor.pattern"),
        ).toHaveValue("FROMCAM");
      });
    });
  });

  describe("editing existing (id provided)", () => {
    beforeEach(() => {
      mockMappingsData.current = {
        mappings: [
          buildMapping({
            id: "42",
            label: "Existing",
            type: "text",
            match: "partial",
            pattern: "zelda",
            override: "@snes/Zelda",
            enabled: false,
          }),
        ],
      };
    });

    it("should render the 'edit mapping' heading", () => {
      renderEditor(42);
      expect(
        screen.getByRole("heading", {
          name: "create.mappings.editor.titleEdit",
        }),
      ).toBeInTheDocument();
    });

    it("should pre-fill all fields from the existing mapping", async () => {
      renderEditor(42);

      await waitFor(() => {
        expect(
          screen.getByLabelText("create.mappings.editor.label"),
        ).toHaveValue("Existing");
      });
      expect(
        screen.getByLabelText("create.mappings.editor.pattern"),
      ).toHaveValue("zelda");
      expect(screen.getByLabelText("create.custom.textareaLabel")).toHaveValue(
        "@snes/Zelda",
      );
      expect(
        screen.getByRole("radio", {
          name: "create.mappings.editor.typeValue",
        }),
      ).toHaveAttribute("aria-checked", "true");
      expect(
        screen.getByRole("radio", {
          name: "create.mappings.editor.matchPartial",
        }),
      ).toHaveAttribute("aria-checked", "true");
    });

    it("should call updateMapping with the mapping id on Save", async () => {
      const user = userEvent.setup();
      renderEditor(42);

      await waitFor(() => {
        expect(
          screen.getByLabelText("create.mappings.editor.label"),
        ).toHaveValue("Existing");
      });

      await user.click(
        screen.getByRole("button", {
          name: /create\.mappings\.editor\.save/i,
        }),
      );

      await waitFor(() => {
        expect(mockUpdateMapping).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 42,
            label: "Existing",
            enabled: false,
            type: "text",
            match: "partial",
            pattern: "zelda",
            override: "@snes/Zelda",
          }),
        );
      });
    });

    it("should show a Delete button when editing", () => {
      renderEditor(42);
      expect(
        screen.getByRole("button", {
          name: /create\.mappings\.editor\.delete/i,
        }),
      ).toBeInTheDocument();
    });

    it("should open a confirmation modal on Delete and call deleteMapping when confirmed", async () => {
      const user = userEvent.setup();
      renderEditor(42);

      await user.click(
        screen.getByRole("button", {
          name: "create.mappings.editor.delete",
        }),
      );
      expect(
        await screen.findByRole("dialog", {
          name: "create.mappings.editor.deleteConfirmTitle",
        }),
      ).toBeInTheDocument();

      await user.click(
        screen.getByRole("button", {
          name: "create.mappings.editor.deleteConfirmAction",
        }),
      );

      await waitFor(() => {
        expect(mockDeleteMapping).toHaveBeenCalledWith({ id: 42 });
      });
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({
          to: "/create/mappings",
          replace: true,
        });
      });
    });

    it("should redirect to the list when the mapping is not found", async () => {
      mockMappingsData.current = { mappings: [] };
      renderEditor(42);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({
          to: "/create/mappings",
          replace: true,
        });
      });
      expect(mockToastError).toHaveBeenCalledWith(
        "create.mappings.editor.notFound",
      );
    });
  });

  describe("disconnected state", () => {
    it("should disable Save when disconnected", async () => {
      mockConnected = false;
      const user = userEvent.setup();
      renderEditor();

      await user.type(
        screen.getByLabelText("create.mappings.editor.pattern"),
        "AAA",
      );
      expect(
        screen.getByRole("button", {
          name: /create\.mappings\.editor\.save/i,
        }),
      ).toBeDisabled();
    });
  });
});

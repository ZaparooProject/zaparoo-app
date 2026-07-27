/**
 * Integration Test: Create Mappings List Route
 *
 * Tests the mapping management list page including:
 * - Empty state and CTA
 * - Rendering rows from query data with type/match badges
 * - Search/filter input
 * - Disabled mapping styling (off badge)
 * - Tap-to-edit navigation
 * - "+ New" header button navigation
 * - Reload config files action
 */

import React from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import type { MappingResponse } from "@/lib/models";

const {
  componentRef,
  mockGoBack,
  mockNavigate,
  mockToastSuccess,
  mockToastError,
  mockMappingsReload,
  mockRefetch,
  mockMappingsData,
  mockIsLoading,
} = vi.hoisted(() => ({
  componentRef: { current: null as any },
  mockGoBack: vi.fn(),
  mockNavigate: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockMappingsReload: vi.fn(),
  mockRefetch: vi.fn(),
  mockMappingsData: {
    current: { mappings: [] as MappingResponse[] } as
      | { mappings: MappingResponse[] }
      | undefined,
  },
  mockIsLoading: { current: false },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createFileRoute: () => (options: any) => {
      componentRef.current = options.component;
      return { options };
    },
    useRouter: () => ({ history: { back: mockGoBack } }),
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
    mappingsReload: mockMappingsReload,
    systems: vi.fn().mockResolvedValue({ systems: [] }),
    run: vi.fn().mockResolvedValue({}),
    reset: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
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
      }),
  };
});

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
      return {
        data: undefined,
        isLoading: false,
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

import "@/routes/create.mappings";

const buildMapping = (
  overrides: Partial<MappingResponse> = {},
): MappingResponse => ({
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

const getMappings = () => componentRef.current;

describe("Create Mappings List Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnected = true;
    mockMappingsData.current = { mappings: [] };
    mockIsLoading.current = false;
    mockMappingsReload.mockResolvedValue(undefined);
    mockRefetch.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderList = () => {
    const Mappings = getMappings();
    return render(<Mappings />);
  };

  describe("rendering", () => {
    it("should render the page title", () => {
      renderList();
      expect(
        screen.getByRole("heading", { name: "create.mappings.title" }),
      ).toBeInTheDocument();
    });

    it("should render the back button", () => {
      renderList();
      expect(screen.getByLabelText("nav.back")).toBeInTheDocument();
    });

    it("should render a header reload button", () => {
      renderList();
      expect(
        screen.getByLabelText("create.mappings.list.reload"),
      ).toBeInTheDocument();
    });

    it("should render a full-width 'new mapping' button when there are mappings", () => {
      mockMappingsData.current = {
        mappings: [buildMapping({ id: "1", label: "Zelda" })],
      };
      renderList();
      expect(
        screen.getByRole("button", {
          name: "create.mappings.list.newMapping",
        }),
      ).toBeInTheDocument();
    });

    it("should render blank content while mappings are initially loading", () => {
      mockMappingsData.current = undefined;
      mockIsLoading.current = true;

      renderList();

      expect(
        screen.getByRole("heading", { name: "create.mappings.title" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "create.mappings.list.newMapping",
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("create.mappings.list.empty"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("create.mappings.list.searchEmpty"),
      ).not.toBeInTheDocument();
    });

    it("should render the empty state when there are no mappings", () => {
      renderList();
      expect(
        screen.getByText("create.mappings.list.empty"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("create.mappings.list.emptyDescription"),
      ).toBeInTheDocument();
    });

    it("should render mapping rows from query data", () => {
      mockMappingsData.current = {
        mappings: [
          buildMapping({ id: "1", label: "Zelda", pattern: "zelda" }),
          buildMapping({ id: "2", label: "Mario", pattern: "mario:.*" }),
        ],
      };
      renderList();

      expect(screen.getByText("Zelda")).toBeInTheDocument();
      expect(screen.getByText("Mario")).toBeInTheDocument();
    });

    it("should fall back to pattern as primary text when label is empty", () => {
      mockMappingsData.current = {
        mappings: [buildMapping({ id: "1", label: "", pattern: "AABBCC" })],
      };
      renderList();
      expect(screen.getByText("AABBCC")).toBeInTheDocument();
    });

    it("should render type and match badges", () => {
      mockMappingsData.current = {
        mappings: [
          buildMapping({ id: "1", label: "Test", type: "uid", match: "exact" }),
        ],
      };
      renderList();
      expect(
        screen.getByText("create.mappings.editor.typeId"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("create.mappings.editor.matchExact"),
      ).toBeInTheDocument();
    });

    it("should show 'off' badge when mapping is disabled", () => {
      mockMappingsData.current = {
        mappings: [buildMapping({ id: "1", label: "Off", enabled: false })],
      };
      renderList();
      expect(
        screen.getByText("create.mappings.list.disabledBadge"),
      ).toBeInTheDocument();
    });
  });

  describe("search", () => {
    beforeEach(() => {
      mockMappingsData.current = {
        mappings: [
          buildMapping({ id: "1", label: "Zelda", pattern: "zelda" }),
          buildMapping({
            id: "2",
            label: "Mario",
            pattern: "mario",
            override: "@nes/Mario",
          }),
        ],
      };
    });

    it("should not render the search input in empty state", () => {
      mockMappingsData.current = { mappings: [] };
      renderList();
      expect(
        screen.queryByPlaceholderText("create.mappings.list.searchPlaceholder"),
      ).not.toBeInTheDocument();
    });

    it("should filter mappings by label", async () => {
      const user = userEvent.setup();
      renderList();

      await user.type(
        screen.getByPlaceholderText("create.mappings.list.searchPlaceholder"),
        "zelda",
      );

      expect(screen.getByText("Zelda")).toBeInTheDocument();
      expect(screen.queryByText("Mario")).not.toBeInTheDocument();
    });

    it("should filter mappings by override content", async () => {
      const user = userEvent.setup();
      renderList();

      await user.type(
        screen.getByPlaceholderText("create.mappings.list.searchPlaceholder"),
        "@nes",
      );

      expect(screen.getByText("Mario")).toBeInTheDocument();
      expect(screen.queryByText("Zelda")).not.toBeInTheDocument();
    });

    it("should show no-match message when filter excludes all rows", async () => {
      const user = userEvent.setup();
      renderList();

      await user.type(
        screen.getByPlaceholderText("create.mappings.list.searchPlaceholder"),
        "nothing",
      );

      expect(
        screen.getByText("create.mappings.list.searchEmpty"),
      ).toBeInTheDocument();
    });
  });

  describe("navigation", () => {
    it("should navigate back when back button clicked", async () => {
      const user = userEvent.setup();
      renderList();

      await user.click(screen.getByLabelText("nav.back"));

      expect(mockGoBack).toHaveBeenCalled();
    });

    it("should navigate to /create/mappings/new when '+ new' is clicked", async () => {
      mockMappingsData.current = {
        mappings: [buildMapping({ id: "1", label: "Zelda" })],
      };
      const user = userEvent.setup();
      renderList();

      await user.click(
        screen.getByRole("button", {
          name: "create.mappings.list.newMapping",
        }),
      );

      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/create/mappings/new",
      });
    });

    it("should navigate to /create/mappings/edit/$id when a row is tapped", async () => {
      mockMappingsData.current = {
        mappings: [buildMapping({ id: "42", label: "Zelda" })],
      };
      const user = userEvent.setup();
      renderList();

      await user.click(screen.getByText("Zelda"));

      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/create/mappings/edit/$id",
        params: { id: "42" },
      });
    });

    it("should navigate from the empty-state CTA to /create/mappings/new", async () => {
      const user = userEvent.setup();
      renderList();

      await user.click(
        screen.getByRole("button", {
          name: /create\.mappings\.list\.newMapping/i,
        }),
      );

      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/create/mappings/new",
      });
    });
  });

  describe("reload config", () => {
    it("should call mappingsReload and refetch when reload button is clicked", async () => {
      const user = userEvent.setup();
      renderList();

      await user.click(
        screen.getByRole("button", {
          name: /create\.mappings\.list\.reload/i,
        }),
      );

      await waitFor(() => {
        expect(mockMappingsReload).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith(
          "create.mappings.list.reloadedSuccess",
        );
      });
    });

    it("should disable reload when disconnected", () => {
      mockConnected = false;
      renderList();

      expect(
        screen.getByRole("button", {
          name: /create\.mappings\.list\.reload/i,
        }),
      ).toBeDisabled();
    });

    it("should toast an error when reload fails", async () => {
      mockMappingsReload.mockRejectedValueOnce(new Error("nope"));
      const user = userEvent.setup();
      renderList();

      await user.click(
        screen.getByRole("button", {
          name: /create\.mappings\.list\.reload/i,
        }),
      );

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          "create.mappings.list.reloadFailed",
        );
      });
    });
  });
});

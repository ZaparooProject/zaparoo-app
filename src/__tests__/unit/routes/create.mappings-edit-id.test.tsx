import type { ComponentType, RefObject } from "react";
import type { Mock } from "vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "../../../test-utils";

type RouteParams = { id: string };
type RouteOptions = { component: ComponentType };

const { componentRef, mockNavigate, mockToastError, mockParams } = vi.hoisted(
  (): {
    componentRef: RefObject<ComponentType | null>;
    mockNavigate: Mock;
    mockToastError: Mock;
    mockParams: RefObject<RouteParams>;
  } => ({
    componentRef: { current: null },
    mockNavigate: vi.fn(),
    mockToastError: vi.fn(),
    mockParams: { current: { id: "" } },
  }),
);

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: RouteOptions) => {
      componentRef.current = options.component;
      return {
        options,
        useParams: () => mockParams.current,
      };
    },
    useNavigate: () => mockNavigate,
  };
});

vi.mock("react-hot-toast", () => ({
  default: {
    error: mockToastError,
    success: vi.fn(),
    dismiss: vi.fn(),
  },
}));

const mockMappingEditor = vi.fn((_props: { id?: number }) => null);
vi.mock("@/routes/-pages/MappingEditor", () => ({
  MappingEditor: (props: { id?: number }) => mockMappingEditor(props),
}));

import "@/routes/create.mappings_.edit_.$id";

const getEditMapping = () => {
  if (!componentRef.current) {
    throw new Error("EditMapping component was not captured");
  }
  return componentRef.current;
};

describe("EditMapping route wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render MappingEditor with parsed numeric id when id is valid", () => {
    mockParams.current = { id: "42" };
    const EditMapping = getEditMapping();
    render(<EditMapping />);
    expect(mockMappingEditor).toHaveBeenCalledWith({ id: 42 });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("should redirect to list with toast when id is non-numeric", async () => {
    mockParams.current = { id: "abc" };
    const EditMapping = getEditMapping();
    render(<EditMapping />);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/create/mappings",
        replace: true,
      });
    });
    expect(mockToastError).toHaveBeenCalledWith(
      "create.mappings.editor.notFound",
    );
    expect(mockMappingEditor).not.toHaveBeenCalled();
  });

  it("should redirect when id is zero", async () => {
    mockParams.current = { id: "0" };
    const EditMapping = getEditMapping();
    render(<EditMapping />);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/create/mappings",
        replace: true,
      });
    });
    expect(mockToastError).toHaveBeenCalledWith(
      "create.mappings.editor.notFound",
    );
    expect(mockMappingEditor).not.toHaveBeenCalled();
  });

  it("should redirect when id is negative", async () => {
    mockParams.current = { id: "-5" };
    const EditMapping = getEditMapping();
    render(<EditMapping />);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/create/mappings",
        replace: true,
      });
    });
    expect(mockToastError).toHaveBeenCalledWith(
      "create.mappings.editor.notFound",
    );
    expect(mockMappingEditor).not.toHaveBeenCalled();
  });

  it("should redirect when id is empty string", async () => {
    mockParams.current = { id: "" };
    const EditMapping = getEditMapping();
    render(<EditMapping />);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/create/mappings",
        replace: true,
      });
    });
    expect(mockToastError).toHaveBeenCalledWith(
      "create.mappings.editor.notFound",
    );
    expect(mockMappingEditor).not.toHaveBeenCalled();
  });
});

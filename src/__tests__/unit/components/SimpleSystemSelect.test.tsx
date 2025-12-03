import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SimpleSystemSelect } from "@/components/SimpleSystemSelect";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";

// Mock CoreAPI
vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    systems: vi.fn(),
  },
}));

// Mock store
vi.mock("@/lib/store", () => ({
  useStatusStore: vi.fn(),
}));

const mockSystems = {
  systems: [
    { id: "snes", name: "Super Nintendo", category: "Nintendo" },
    { id: "nes", name: "Nintendo Entertainment System", category: "Nintendo" },
    { id: "genesis", name: "Sega Genesis", category: "Sega" },
    { id: "ps1", name: "PlayStation", category: "Sony" },
    { id: "n64", name: "Nintendo 64", category: "Nintendo" },
    { id: "saturn", name: "Sega Saturn", category: "Sega" },
  ],
};

describe("SimpleSystemSelect", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    vi.mocked(CoreAPI.systems).mockResolvedValue(mockSystems);
    vi.mocked(useStatusStore).mockReturnValue({
      gamesIndex: { indexing: false, exists: true },
    });
  });

  const renderComponent = (props: {
    value: string;
    onSelect: (systemId: string) => void;
    placeholder?: string;
    includeAllOption?: boolean;
    className?: string;
  }) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <SimpleSystemSelect {...props} />
      </QueryClientProvider>,
    );
  };

  it("renders a select element", () => {
    const onSelect = vi.fn();
    renderComponent({ value: "", onSelect });

    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
  });

  it("displays grouped systems by category", async () => {
    const onSelect = vi.fn();
    renderComponent({ value: "", onSelect });

    await waitFor(() => {
      // Check optgroups exist
      const nintendoGroup = screen.getByRole("group", { name: "Nintendo" });
      const segaGroup = screen.getByRole("group", { name: "Sega" });
      const sonyGroup = screen.getByRole("group", { name: "Sony" });

      expect(nintendoGroup).toBeInTheDocument();
      expect(segaGroup).toBeInTheDocument();
      expect(sonyGroup).toBeInTheDocument();
    });
  });

  it("sorts systems alphabetically within categories", async () => {
    const onSelect = vi.fn();
    renderComponent({ value: "", onSelect });

    await waitFor(() => {
      const options = screen.getAllByRole("option");
      const nintendoOptions = options.filter(
        (opt) =>
          opt.textContent === "Nintendo Entertainment System" ||
          opt.textContent === "Nintendo 64" ||
          opt.textContent === "Super Nintendo",
      );

      // NES comes before N64 which comes before SNES alphabetically
      expect(nintendoOptions[0]!.textContent).toBe("Nintendo 64");
      expect(nintendoOptions[1]!.textContent).toBe(
        "Nintendo Entertainment System",
      );
      expect(nintendoOptions[2]!.textContent).toBe("Super Nintendo");
    });
  });

  it("calls onSelect when a system is selected", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderComponent({ value: "", onSelect });

    // Wait for the options to actually load (not just the combobox to exist)
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: "Super Nintendo" }),
      ).toBeInTheDocument();
    });

    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "snes");

    expect(onSelect).toHaveBeenCalledWith("snes");
  });

  it("displays placeholder option when provided", () => {
    const onSelect = vi.fn();
    renderComponent({ value: "", onSelect, placeholder: "Select a system" });

    const placeholder = screen.getByRole("option", { name: "Select a system" });
    expect(placeholder).toBeInTheDocument();
  });

  it("includes 'All Systems' option when includeAllOption is true", async () => {
    const onSelect = vi.fn();
    renderComponent({ value: "", onSelect, includeAllOption: true });

    await waitFor(() => {
      const allOption = screen.getByRole("option", {
        name: "systemSelector.allSystems",
      });
      expect(allOption).toBeInTheDocument();
    });
  });

  it("does not include 'All Systems' option when includeAllOption is false", async () => {
    const onSelect = vi.fn();
    renderComponent({ value: "", onSelect, includeAllOption: false });

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    const allOption = screen.queryByRole("option", {
      name: "systemSelector.allSystems",
    });
    expect(allOption).not.toBeInTheDocument();
  });

  it("displays selected value", async () => {
    const onSelect = vi.fn();
    renderComponent({ value: "snes", onSelect });

    await waitFor(() => {
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe("snes");
    });
  });

  it("disables select when indexing", () => {
    vi.mocked(useStatusStore).mockReturnValue({
      gamesIndex: { indexing: true, exists: true },
    });

    const onSelect = vi.fn();
    renderComponent({ value: "", onSelect });

    const select = screen.getByRole("combobox");
    expect(select).toBeDisabled();
  });

  it("disables select when loading", () => {
    vi.mocked(CoreAPI.systems).mockReturnValue(new Promise(() => {})); // Never resolves

    const onSelect = vi.fn();
    renderComponent({ value: "", onSelect });

    const select = screen.getByRole("combobox");
    expect(select).toBeDisabled();
  });

  it("shows loading option while data is being fetched", () => {
    vi.mocked(CoreAPI.systems).mockReturnValue(new Promise(() => {}));

    const onSelect = vi.fn();
    renderComponent({ value: "", onSelect });

    const loadingOption = screen.getByRole("option", { name: "loading" });
    expect(loadingOption).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const onSelect = vi.fn();
    renderComponent({ value: "", onSelect, className: "custom-class" });

    const select = screen.getByRole("combobox");
    expect(select).toHaveClass("custom-class");
  });
});

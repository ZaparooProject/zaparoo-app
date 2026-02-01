import { render, screen, fireEvent } from "../../../test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommandsModal } from "@/components/CommandsModal";

// Mock external hooks that require native functionality
vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    impact: vi.fn(),
    notification: vi.fn(),
    vibrate: vi.fn(),
  }),
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
  },
}));

vi.mock("@/lib/store", () => ({
  useStatusStore: vi.fn((selector) => {
    const state = {
      safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
    };
    return selector ? selector(state) : state;
  }),
}));

describe("CommandsModal", () => {
  const mockClose = vi.fn();
  const mockOnSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render when open", () => {
    render(
      <CommandsModal isOpen={true} close={mockClose} onSelect={mockOnSelect} />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Modal title may appear multiple times due to test-utils wrapper
    const titles = screen.getAllByText("create.custom.commands");
    expect(titles.length).toBeGreaterThan(0);
  });

  it("should render all command categories", () => {
    render(
      <CommandsModal isOpen={true} close={mockClose} onSelect={mockOnSelect} />,
    );

    // Check for category headers
    expect(screen.getByText("Launch")).toBeInTheDocument();
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Playlist")).toBeInTheDocument();
    expect(screen.getByText("MiSTer")).toBeInTheDocument();
    expect(screen.getByText("HTTP")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("should render launch commands", () => {
    render(
      <CommandsModal isOpen={true} close={mockClose} onSelect={mockOnSelect} />,
    );

    // Check for launch commands
    expect(
      screen.getByRole("button", { name: "launch.system" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "launch.random" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "launch.search" }),
    ).toBeInTheDocument();
  });

  it("should render input commands", () => {
    render(
      <CommandsModal isOpen={true} close={mockClose} onSelect={mockOnSelect} />,
    );

    // Check for input commands
    expect(
      screen.getByRole("button", { name: "input.keyboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "input.gamepad" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "input.coinp1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "input.coinp2" }),
    ).toBeInTheDocument();
  });

  it("should render playlist commands", () => {
    render(
      <CommandsModal isOpen={true} close={mockClose} onSelect={mockOnSelect} />,
    );

    // Check for playlist commands
    expect(
      screen.getByRole("button", { name: "playlist.load" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "playlist.play" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "playlist.stop" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "playlist.next" }),
    ).toBeInTheDocument();
  });

  it("should call onSelect and close when command is clicked", () => {
    render(
      <CommandsModal isOpen={true} close={mockClose} onSelect={mockOnSelect} />,
    );

    // Click on a launch.system command button
    const launchSystemButton = screen.getByRole("button", {
      name: "launch.system",
    });
    fireEvent.click(launchSystemButton);

    expect(mockOnSelect).toHaveBeenCalledWith("**launch.system:");
    expect(mockClose).toHaveBeenCalled();
  });

  it("should call onSelect with correct command and close for different types", () => {
    render(
      <CommandsModal isOpen={true} close={mockClose} onSelect={mockOnSelect} />,
    );

    // Test stop command - calls onSelect and close
    fireEvent.click(screen.getByRole("button", { name: "stop" }));
    expect(mockOnSelect).toHaveBeenCalledWith("**stop");
    expect(mockClose).toHaveBeenCalledTimes(1);

    // Clear mocks for next test
    mockOnSelect.mockClear();
    mockClose.mockClear();

    // Test input.coinp1 command
    fireEvent.click(screen.getByRole("button", { name: "input.coinp1" }));
    expect(mockOnSelect).toHaveBeenCalledWith("**input.coinp1:1");
    expect(mockClose).toHaveBeenCalledTimes(1);

    // Clear mocks for next test
    mockOnSelect.mockClear();
    mockClose.mockClear();

    // Test delay command
    fireEvent.click(screen.getByRole("button", { name: "delay" }));
    expect(mockOnSelect).toHaveBeenCalledWith("**delay:");
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("should not render content when closed", () => {
    render(
      <CommandsModal
        isOpen={false}
        close={mockClose}
        onSelect={mockOnSelect}
      />,
    );

    // Modal should have aria-hidden when closed
    const modal = screen.getByRole("dialog", { hidden: true });
    expect(modal).toHaveAttribute("aria-hidden", "true");
  });
});

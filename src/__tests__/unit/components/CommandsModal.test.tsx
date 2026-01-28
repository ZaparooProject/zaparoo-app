import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { CommandsModal } from "@/components/CommandsModal";
import "@/test-setup";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock SlideModal
vi.mock("@/components/SlideModal", () => ({
  SlideModal: ({ isOpen, close, children }: any) => (
    <div data-testid="slide-modal" data-open={isOpen}>
      <button onClick={close} data-testid="close-button">
        Close
      </button>
      {children}
    </div>
  ),
}));

// Mock Button component
vi.mock("@/components/wui/Button", () => ({
  Button: ({ children, onClick, label, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {label || children}
    </button>
  ),
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

    const modal = screen.getByTestId("slide-modal");
    expect(modal).toHaveAttribute("data-open", "true");
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
    expect(screen.getByText("launch.system")).toBeInTheDocument();
    expect(screen.getByText("launch.random")).toBeInTheDocument();
    expect(screen.getByText("launch.search")).toBeInTheDocument();
  });

  it("should render input commands", () => {
    render(
      <CommandsModal isOpen={true} close={mockClose} onSelect={mockOnSelect} />,
    );

    // Check for input commands
    expect(screen.getByText("input.keyboard")).toBeInTheDocument();
    expect(screen.getByText("input.gamepad")).toBeInTheDocument();
    expect(screen.getByText("input.coinp1")).toBeInTheDocument();
    expect(screen.getByText("input.coinp2")).toBeInTheDocument();
  });

  it("should render playlist commands", () => {
    render(
      <CommandsModal isOpen={true} close={mockClose} onSelect={mockOnSelect} />,
    );

    // Check for playlist commands
    expect(screen.getByText("playlist.load")).toBeInTheDocument();
    expect(screen.getByText("playlist.play")).toBeInTheDocument();
    expect(screen.getByText("playlist.stop")).toBeInTheDocument();
    expect(screen.getByText("playlist.next")).toBeInTheDocument();
  });

  it("should call onSelect and close when command is clicked", () => {
    render(
      <CommandsModal isOpen={true} close={mockClose} onSelect={mockOnSelect} />,
    );

    // Click on a launch.system command button
    const launchSystemButton = screen.getByText("launch.system");
    fireEvent.click(launchSystemButton);

    expect(mockOnSelect).toHaveBeenCalledWith("**launch.system:");
    expect(mockClose).toHaveBeenCalled();
  });

  it("should call onSelect with correct command and close for different types", () => {
    render(
      <CommandsModal isOpen={true} close={mockClose} onSelect={mockOnSelect} />,
    );

    // Test stop command - calls onSelect and close
    fireEvent.click(screen.getByText("stop"));
    expect(mockOnSelect).toHaveBeenCalledWith("**stop");
    expect(mockClose).toHaveBeenCalledTimes(1);

    // Clear mocks for next test
    mockOnSelect.mockClear();
    mockClose.mockClear();

    // Test input.coinp1 command
    fireEvent.click(screen.getByText("input.coinp1"));
    expect(mockOnSelect).toHaveBeenCalledWith("**input.coinp1:1");
    expect(mockClose).toHaveBeenCalledTimes(1);

    // Clear mocks for next test
    mockOnSelect.mockClear();
    mockClose.mockClear();

    // Test delay command
    fireEvent.click(screen.getByText("delay"));
    expect(mockOnSelect).toHaveBeenCalledWith("**delay:");
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("should not render when closed", () => {
    render(
      <CommandsModal
        isOpen={false}
        close={mockClose}
        onSelect={mockOnSelect}
      />,
    );

    const modal = screen.getByTestId("slide-modal");
    expect(modal).toHaveAttribute("data-open", "false");
  });
});

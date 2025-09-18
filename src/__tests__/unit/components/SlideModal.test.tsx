import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";
import { SlideModal } from "../../../components/SlideModal";

// Mock useSmartSwipe
vi.mock("../../../hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({}))
}));

// Mock store
vi.mock("../../../lib/store", () => ({
  useStatusStore: vi.fn(() => ({
    top: 44,
    bottom: 34
  }))
}));

describe("SlideModal", () => {
  const mockProps = {
    isOpen: false,
    close: vi.fn(),
    title: "Test Modal",
    children: <div>Test Content</div>
  };

  it("renders modal when open", () => {
    render(<SlideModal {...mockProps} isOpen={true} />);
    
    expect(screen.getByText("Test Modal")).toBeInTheDocument();
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("closes modal when Escape key is pressed on overlay", () => {
    const closeMock = vi.fn();
    render(<SlideModal {...mockProps} isOpen={true} close={closeMock} />);
    
    const overlay = screen.getByRole("button", { name: "Close modal" });
    fireEvent.keyDown(overlay, { key: "Escape" });
    
    expect(closeMock).toHaveBeenCalled();
  });

  it("closes modal when drag handle is clicked", () => {
    const closeMock = vi.fn();
    render(<SlideModal {...mockProps} isOpen={true} close={closeMock} />);
    
    const dragHandle = screen.getByRole("button", { name: "Drag to close" });
    fireEvent.click(dragHandle);
    
    expect(closeMock).toHaveBeenCalled();
  });
});
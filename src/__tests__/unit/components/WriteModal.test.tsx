import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";
import { WriteModal } from "../../../components/WriteModal";

// Mock useSmartSwipe
vi.mock("../../../hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({}))
}));

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

describe("WriteModal", () => {
  it("renders null when not open", () => {
    const { container } = render(<WriteModal isOpen={false} close={vi.fn()} />);
    
    expect(container.firstChild).toBeNull();
  });

  it("renders modal content when open", () => {
    render(<WriteModal isOpen={true} close={vi.fn()} />);
    
    expect(screen.getByText(/spinner\.holdTag/)).toBeInTheDocument();
  });

  it("calls close when back icon is clicked", () => {
    const mockClose = vi.fn();
    const { container } = render(<WriteModal isOpen={true} close={mockClose} />);
    
    // The back icon is in a div with onClick, find by class
    const backDiv = container.querySelector('.flex.flex-row.gap-2');
    expect(backDiv).toBeInTheDocument();
    
    backDiv?.click();
    
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("calls close when Enter key is pressed on back button", () => {
    const mockClose = vi.fn();
    render(<WriteModal isOpen={true} close={mockClose} />);
    
    const backButton = screen.getByRole('button');
    expect(backButton).toBeInTheDocument();
    
    fireEvent.keyDown(backButton, { key: 'Enter' });
    
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
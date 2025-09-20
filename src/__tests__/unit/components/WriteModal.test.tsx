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
    
    if (backDiv) {
      fireEvent.click(backDiv);
    }
    
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("calls close when Enter key is pressed on spinner", () => {
    const mockClose = vi.fn();
    const { container } = render(<WriteModal isOpen={true} close={mockClose} />);

    // The keyboard handler is on the div with role="button" that contains the spinner
    const spinnerButton = container.querySelector('[role="button"][tabindex="0"]');
    expect(spinnerButton).toBeInTheDocument();

    fireEvent.keyDown(spinnerButton!, { key: 'Enter' });

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("calls close when Space key is pressed on spinner", () => {
    const mockClose = vi.fn();
    const { container } = render(<WriteModal isOpen={true} close={mockClose} />);

    // The keyboard handler is on the div with role="button" that contains the spinner
    const spinnerButton = container.querySelector('[role="button"][tabindex="0"]');
    expect(spinnerButton).toBeInTheDocument();

    fireEvent.keyDown(spinnerButton!, { key: ' ' });

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("does not call close for other keys on spinner", () => {
    const mockClose = vi.fn();
    const { container } = render(<WriteModal isOpen={true} close={mockClose} />);

    // The keyboard handler is on the div with role="button" that contains the spinner
    const spinnerButton = container.querySelector('[role="button"][tabindex="0"]');
    expect(spinnerButton).toBeInTheDocument();

    fireEvent.keyDown(spinnerButton!, { key: 'Escape' });

    expect(mockClose).not.toHaveBeenCalled();
  });

  it("renders spinner with correct layout structure", () => {
    const { container } = render(<WriteModal isOpen={true} close={vi.fn()} />);

    // Check for the main modal container
    const modalContainer = container.querySelector('.z-30.flex.h-screen.w-screen');
    expect(modalContainer).toBeInTheDocument();

    // Check for spinner text which is definitely present in the output
    const spinnerText = screen.getByText('spinner.holdTagReader');
    expect(spinnerText).toBeInTheDocument();

    // Check for cancel button which is also present
    const cancelButton = screen.getByText('nav.cancel');
    expect(cancelButton).toBeInTheDocument();
  });
});
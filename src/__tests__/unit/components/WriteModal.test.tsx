import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";
import { WriteModal } from "../../../components/WriteModal";

// Mock useSmartSwipe
vi.mock("../../../hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({})),
}));

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("WriteModal", () => {
  it("does not render modal content when not open", () => {
    const { container } = render(<WriteModal isOpen={false} close={vi.fn()} />);

    // The modal dialog should not be present
    const modalDialog = container.querySelector('[role="dialog"]');
    expect(modalDialog).not.toBeInTheDocument();
  });

  it("renders modal content when open", () => {
    render(<WriteModal isOpen={true} close={vi.fn()} />);

    // Check for cancel button text
    expect(screen.getByText("nav.cancel")).toBeInTheDocument();
  });

  it("calls close when cancel button is clicked", () => {
    const mockClose = vi.fn();
    render(<WriteModal isOpen={true} close={mockClose} />);

    // Find the cancel button by its text
    const cancelButton = screen.getByText("nav.cancel");
    fireEvent.click(cancelButton);

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("renders modal with correct accessibility attributes", () => {
    const { container } = render(<WriteModal isOpen={true} close={vi.fn()} />);

    // Check for the modal dialog role
    const modalDialog = container.querySelector('[role="dialog"]');
    expect(modalDialog).toBeInTheDocument();
    expect(modalDialog).toHaveAttribute("aria-modal", "true");
    expect(modalDialog).toHaveAttribute("aria-label", "spinner.holdTag");
  });

  it("renders modal with proper structure when open", () => {
    render(<WriteModal isOpen={true} close={vi.fn()} />);

    // Check for modal dialog using semantic query
    const modal = screen.getByRole("dialog");
    expect(modal).toBeInTheDocument();

    // Check for spinner status indicator
    expect(screen.getByRole("status")).toBeInTheDocument();

    // Check for cancel button
    expect(screen.getByText("nav.cancel")).toBeInTheDocument();
  });
});

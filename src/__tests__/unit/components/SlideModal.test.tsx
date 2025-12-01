import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "../../../test-utils";
import { SlideModal } from "../../../components/SlideModal";

// Mock useSmartSwipe
vi.mock("../../../hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({})),
}));

// Mock useSlideModalManager
vi.mock("../../../hooks/useSlideModalManager", () => ({
  useSlideModalManager: vi.fn(() => ({
    registerModal: vi.fn(),
    unregisterModal: vi.fn(),
    closeAllExcept: vi.fn(),
  })),
  SlideModalContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}));

// Mock store
vi.mock("../../../lib/store", () => ({
  useStatusStore: vi.fn(() => ({
    top: 44,
    bottom: 34,
  })),
}));

describe("SlideModal", () => {
  const mockProps = {
    isOpen: false,
    close: vi.fn(),
    title: "Test Modal",
    children: <div>Test Content</div>,
  };

  it("renders modal when open", () => {
    render(<SlideModal {...mockProps} isOpen={true} />);

    expect(screen.getByText("Test Modal")).toBeInTheDocument();
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("closes modal when overlay is clicked", () => {
    const closeMock = vi.fn();
    const { container } = render(
      <SlideModal {...mockProps} isOpen={true} close={closeMock} />,
    );

    // Target the overlay div specifically (has bg-black/50 class and aria-hidden)
    const overlay = container.querySelector(
      '.fixed.inset-0[aria-hidden="true"]',
    );
    expect(overlay).toBeInTheDocument();

    fireEvent.click(overlay!);

    expect(closeMock).toHaveBeenCalled();
  });

  it("closes modal when close button is clicked", () => {
    const closeMock = vi.fn();
    render(<SlideModal {...mockProps} isOpen={true} close={closeMock} />);

    // The close button has aria-label from t("nav.cancel")
    const closeButton = screen.getByRole("button", { name: "nav.cancel" });
    fireEvent.click(closeButton);

    expect(closeMock).toHaveBeenCalled();
  });
});

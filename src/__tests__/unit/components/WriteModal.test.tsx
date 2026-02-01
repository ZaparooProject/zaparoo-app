import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "../../../test-utils";
import { WriteModal, NFCModal } from "@/components/WriteModal";
import { useStatusStore } from "@/lib/store";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { useAnnouncer } from "@/components/A11yAnnouncer";

// Mock useSmartSwipe to capture the onSwipeRight callback
vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({})),
}));

// Mock useBackButtonHandler to capture the callback
vi.mock("@/hooks/useBackButtonHandler", () => ({
  useBackButtonHandler: vi.fn(),
}));

// Mock useAnnouncer - use a factory function
vi.mock("@/components/A11yAnnouncer", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/A11yAnnouncer")>();
  return {
    ...actual,
    useAnnouncer: vi.fn(() => ({ announce: vi.fn() })),
  };
});

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("WriteModal", () => {
  const mockAnnounce = vi.fn();
  const mockSwipeConfig: { onSwipeRight?: () => void } = {};
  const mockBackButtonConfig: {
    callback?: () => boolean | void;
    active?: boolean;
  } = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useStatusStore.setState(useStatusStore.getInitialState());

    // Setup mock implementations
    vi.mocked(useAnnouncer).mockReturnValue({ announce: mockAnnounce });

    vi.mocked(useSmartSwipe).mockImplementation((config) => {
      mockSwipeConfig.onSwipeRight = config?.onSwipeRight;
      return { ref: vi.fn() } as ReturnType<typeof useSmartSwipe>;
    });

    vi.mocked(useBackButtonHandler).mockImplementation(
      (_id, callback, _priority, active) => {
        mockBackButtonConfig.callback = callback;
        mockBackButtonConfig.active = active;
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("rendering", () => {
    it("does not render modal content when not open", () => {
      const { container } = render(
        <WriteModal isOpen={false} close={vi.fn()} />,
      );

      const modalDialog = container.querySelector('[role="dialog"]');
      expect(modalDialog).not.toBeInTheDocument();
    });

    it("renders modal content when open", () => {
      render(<WriteModal isOpen={true} close={vi.fn()} />);

      expect(screen.getByText("nav.cancel")).toBeInTheDocument();
    });

    it("renders modal with correct accessibility attributes", () => {
      const { container } = render(
        <WriteModal isOpen={true} close={vi.fn()} />,
      );

      const modalDialog = container.querySelector('[role="dialog"]');
      expect(modalDialog).toBeInTheDocument();
      expect(modalDialog).toHaveAttribute("aria-modal", "true");
      expect(modalDialog).toHaveAttribute("aria-label", "spinner.holdTag");
    });

    it("renders modal with proper structure when open", () => {
      render(<WriteModal isOpen={true} close={vi.fn()} />);

      const modal = screen.getByRole("dialog");
      expect(modal).toBeInTheDocument();

      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByText("nav.cancel")).toBeInTheDocument();
    });

    it("renders ScanSpinner in write mode", () => {
      render(<WriteModal isOpen={true} close={vi.fn()} />);

      // The ScanSpinner should be rendered with write prop
      const spinner = screen.getByRole("status");
      expect(spinner).toBeInTheDocument();
    });
  });

  describe("close functionality", () => {
    it("calls close when cancel button is clicked", () => {
      const mockClose = vi.fn();
      render(<WriteModal isOpen={true} close={mockClose} />);

      const cancelButton = screen.getByText("nav.cancel");
      fireEvent.click(cancelButton);

      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it("calls close when swiping right", () => {
      const mockClose = vi.fn();
      render(<WriteModal isOpen={true} close={mockClose} />);

      // Trigger the swipe callback
      if (mockSwipeConfig.onSwipeRight) {
        mockSwipeConfig.onSwipeRight();
      }

      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it("calls close when Android back button is pressed", () => {
      const mockClose = vi.fn();
      render(<WriteModal isOpen={true} close={mockClose} />);

      // Trigger the back button callback
      expect(mockBackButtonConfig.callback).toBeDefined();
      const result = mockBackButtonConfig.callback?.();

      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(result).toBe(true); // Event was consumed
    });

    it("returns false from back button handler when modal is closed", () => {
      const mockClose = vi.fn();
      render(<WriteModal isOpen={false} close={mockClose} />);

      // When modal is closed, callback should return false
      // (because of the isOpen check in the callback)
      if (mockBackButtonConfig.callback) {
        const result = mockBackButtonConfig.callback();
        expect(result).toBe(false);
      }
    });
  });

  describe("accessibility", () => {
    it("announces modal content when opened", () => {
      render(<WriteModal isOpen={true} close={vi.fn()} />);

      expect(mockAnnounce).toHaveBeenCalledWith("spinner.holdTag", "assertive");
    });

    it("does not announce when modal is closed", () => {
      render(<WriteModal isOpen={false} close={vi.fn()} />);

      expect(mockAnnounce).not.toHaveBeenCalled();
    });

    it("focuses the cancel button after modal opens", async () => {
      render(<WriteModal isOpen={true} close={vi.fn()} />);

      // Advance timer to trigger focus
      act(() => {
        vi.advanceTimersByTime(100);
      });

      const cancelButton = screen.getByRole("button", { name: "nav.cancel" });
      expect(cancelButton).toHaveFocus();
    });
  });

  describe("transition from closed to open", () => {
    it("handles transition from closed to open", () => {
      const mockClose = vi.fn();
      const { rerender } = render(
        <WriteModal isOpen={false} close={mockClose} />,
      );

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      rerender(<WriteModal isOpen={true} close={mockClose} />);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(mockAnnounce).toHaveBeenCalledWith("spinner.holdTag", "assertive");
    });
  });
});

describe("NFCModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStatusStore.setState(useStatusStore.getInitialState());
  });

  it("does not render when nfcModalOpen is false", () => {
    useStatusStore.setState({ nfcModalOpen: false });
    render(<NFCModal />);

    // Dialog should not be visible
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders dialog when nfcModalOpen is true", () => {
    useStatusStore.setState({ nfcModalOpen: true });
    render(<NFCModal />);

    // Dialog should be visible
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("calls setNfcModalOpen when dialog is closed", async () => {
    useStatusStore.setState({ nfcModalOpen: true });
    render(<NFCModal />);

    // The dialog should be open
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Close the dialog by pressing Escape
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(useStatusStore.getState().nfcModalOpen).toBe(false);
    });
  });

  it("contains ScanSpinner in write mode", () => {
    useStatusStore.setState({ nfcModalOpen: true });
    render(<NFCModal />);

    // Should have a spinner status element
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";
import { SlideModal } from "../../../components/SlideModal";

// Mock store for safe insets
vi.mock("@/lib/store", () => ({
  useStatusStore: vi.fn((selector) => {
    const state = {
      safeInsets: {
        top: "44px",
        bottom: "34px",
        left: "0px",
        right: "0px",
      },
    };
    return selector ? selector(state) : state;
  }),
}));

// Mock Capacitor plugins used by hooks
vi.mock("@capacitor/haptics", () => ({
  Haptics: {
    impact: vi.fn(),
    notification: vi.fn(),
    vibrate: vi.fn(),
  },
  ImpactStyle: {
    Light: "LIGHT",
    Medium: "MEDIUM",
    Heavy: "HEAVY",
  },
  NotificationType: {
    Success: "SUCCESS",
    Warning: "WARNING",
    Error: "ERROR",
  },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
    removeAllListeners: vi.fn(),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => "web",
  },
}));

// Mock preferences store for useHaptics
vi.mock("@/lib/preferencesStore", () => ({
  usePreferencesStore: vi.fn((selector) => {
    const state = {
      hapticsEnabled: false,
    };
    return selector ? selector(state) : state;
  }),
}));

describe("SlideModal", () => {
  const mockProps = {
    isOpen: false,
    close: vi.fn(),
    title: "Test Modal",
    children: <div>Test Content</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders modal when open", () => {
    render(<SlideModal {...mockProps} isOpen={true} />);

    // Title appears twice (mobile and desktop headers)
    const titles = screen.getAllByText("Test Modal");
    expect(titles.length).toBe(2);
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("renders modal dialog with proper role", () => {
    render(<SlideModal {...mockProps} isOpen={true} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("closes modal when overlay is clicked", () => {
    const closeMock = vi.fn();
    render(<SlideModal {...mockProps} isOpen={true} close={closeMock} />);

    const overlay = screen.getByTestId("modal-overlay");
    expect(overlay).toBeInTheDocument();

    fireEvent.click(overlay);

    expect(closeMock).toHaveBeenCalled();
  });

  it("closes modal when close button is clicked", () => {
    const closeMock = vi.fn();
    render(<SlideModal {...mockProps} isOpen={true} close={closeMock} />);

    // There are two close buttons (drag handle on mobile, X button on desktop)
    const closeButtons = screen.getAllByRole("button", { name: "nav.close" });
    expect(closeButtons.length).toBe(2);
    fireEvent.click(closeButtons[0]!);

    expect(closeMock).toHaveBeenCalled();
  });

  it("does not show content when closed", () => {
    render(<SlideModal {...mockProps} isOpen={false} />);

    // Dialog should be hidden
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog).toHaveAttribute("aria-hidden", "true");
  });

  it("renders with custom className", () => {
    render(
      <SlideModal {...mockProps} isOpen={true} className="custom-class" />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("custom-class");
  });

  it("renders footer when provided", () => {
    render(
      <SlideModal
        {...mockProps}
        isOpen={true}
        footer={<button>Footer Button</button>}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Footer Button" }),
    ).toBeInTheDocument();
  });
});

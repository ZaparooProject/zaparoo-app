import { createRef, useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createEvent,
  findA11yViolations,
  fireEvent,
  render,
  screen,
} from "@/test-utils";
import userEvent from "@testing-library/user-event";
import { SlideModal } from "@/components/SlideModal";

const backButtonMock = vi.hoisted(() => ({
  handler: undefined as (() => boolean | void) | undefined,
}));

vi.mock("@/hooks/useBackButtonHandler", () => ({
  useBackButtonHandler: (_id: string, handler: () => boolean | void): void => {
    backButtonMock.handler = handler;
  },
}));

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

let mockScreenReaderEnabled = false;
vi.mock("@/hooks/useScreenReaderEnabled", () => ({
  useScreenReaderEnabled: () => mockScreenReaderEnabled,
}));

function mockAnimationFrame(): () => void {
  let callback: ((time: number) => void) | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((next) => {
    callback = next;
    return 1;
  });

  return () => {
    const next = callback;
    callback = undefined;
    next?.(0);
  };
}

function mockDialogHeight(dialog: HTMLElement, height: number): void {
  vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    right: 320,
    bottom: height,
    left: 0,
    width: 320,
    height,
    toJSON: () => ({}),
  });
}

function withTimeStamp<T extends Event>(event: T, timeStamp: number): T {
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  return event;
}

function BlockingModalHarness() {
  const [laterOpen, setLaterOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setLaterOpen(true)}>
        Trigger later modal
      </button>
      <SlideModal
        isOpen
        close={vi.fn()}
        title="Mandatory blocker"
        dismissible={false}
      >
        <p>Complete requirements</p>
      </SlideModal>
      <SlideModal
        isOpen={laterOpen}
        close={() => setLaterOpen(false)}
        title="Later modal"
      >
        <button type="button">Later action</button>
      </SlideModal>
    </>
  );
}

describe("SlideModal", () => {
  it("should have no detectable accessibility violations while open", async () => {
    const { baseElement } = render(
      <SlideModal
        isOpen
        close={vi.fn()}
        title="Accessible dialog"
        footer={<button type="button">Persistent action</button>}
      >
        <button type="button">Dialog action</button>
      </SlideModal>,
    );

    expect(await findA11yViolations(baseElement)).toEqual([]);
  });

  const mockProps = {
    isOpen: false,
    close: vi.fn(),
    title: "Test Modal",
    children: <div>Test Content</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockScreenReaderEnabled = false;
    backButtonMock.handler = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders modal when open", () => {
    render(<SlideModal {...mockProps} isOpen={true} />);

    expect(
      screen.getByRole("heading", { name: "Test Modal" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("renders modal dialog with proper role", () => {
    render(<SlideModal {...mockProps} isOpen={true} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("slides from its mounted closed state when opened", () => {
    const { rerender } = render(<SlideModal {...mockProps} />);
    const dialog = screen.getByRole("dialog", { hidden: true });

    expect(dialog).toHaveStyle({
      transform: "translate3d(0, 100%, 0)",
      transition: "transform 0.2s ease-in-out",
    });

    rerender(<SlideModal {...mockProps} isOpen />);

    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(dialog).toHaveStyle({
      transform: "translate3d(0, 0, 0)",
      transition: "transform 0.2s ease-in-out",
    });
  });

  it("caps content-sized and requested-height modals at 80 percent", () => {
    const { rerender } = render(<SlideModal {...mockProps} isOpen={true} />);

    expect(screen.getByRole("dialog").style.maxHeight).toBe(
      "min(80vh, calc(100vh - 44px - 75px))",
    );
    expect(screen.getByRole("dialog").style.height).toBe("");

    rerender(<SlideModal {...mockProps} isOpen={true} fixedHeight="90vh" />);

    expect(screen.getByRole("dialog").style.height).toBe("90vh");
    expect(screen.getByRole("dialog").style.maxHeight).toBe(
      "min(80vh, calc(100vh - 44px - 75px))",
    );
  });

  it("closes modal when overlay is clicked", () => {
    const closeMock = vi.fn();
    render(<SlideModal {...mockProps} isOpen={true} close={closeMock} />);

    const overlay = screen.getByTestId("modal-overlay");
    expect(overlay).toBeInTheDocument();

    fireEvent.click(overlay);

    expect(closeMock).toHaveBeenCalled();
  });

  it("closes modal when close button is clicked", async () => {
    const user = userEvent.setup();
    const closeMock = vi.fn();
    render(<SlideModal {...mockProps} isOpen={true} close={closeMock} />);

    // There are two close buttons (drag handle on mobile, X button on desktop)
    const closeButtons = screen.getAllByRole("button", { name: "nav.close" });
    expect(closeButtons.length).toBe(2);
    await user.click(closeButtons[0]!);

    expect(closeMock).toHaveBeenCalled();
  });

  it("keeps a blocking modal active when a later modal is requested", async () => {
    const user = userEvent.setup();
    render(<BlockingModalHarness />);

    await user.click(
      screen.getByRole("button", { name: "Trigger later modal" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Mandatory blocker" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Later modal" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Later action" }),
    ).not.toBeInTheDocument();
  });

  it("blocks every passive dismissal path when non-dismissible", async () => {
    const user = userEvent.setup();
    const closeMock = vi.fn();
    render(
      <SlideModal
        {...mockProps}
        isOpen={true}
        close={closeMock}
        dismissible={false}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "nav.close" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("modal-overlay"));
    await user.keyboard("{Escape}");

    const content = screen.getByText("Test Content");
    fireEvent.touchStart(content, {
      touches: [{ clientX: 100, clientY: 20 }],
    });
    fireEvent.touchMove(content, {
      touches: [{ clientX: 100, clientY: 160 }],
    });
    fireEvent.touchEnd(content, {
      changedTouches: [{ clientX: 100, clientY: 160 }],
    });

    expect(backButtonMock.handler?.()).toBe(true);
    expect(closeMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveStyle({
      transform: "translate3d(0, 0, 0)",
    });
  });

  it("should close when swiping down from the modal title", () => {
    const closeMock = vi.fn();
    render(<SlideModal {...mockProps} isOpen={true} close={closeMock} />);

    const title = screen.getByRole("heading", { name: "Test Modal" });
    fireEvent.touchStart(title, {
      touches: [{ clientX: 100, clientY: 20 }],
    });
    fireEvent.touchMove(title, {
      touches: [{ clientX: 100, clientY: 100 }],
    });
    fireEvent.touchEnd(title, {
      changedTouches: [{ clientX: 100, clientY: 100 }],
    });

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("should follow the finger when dragging static content", () => {
    const flushAnimationFrame = mockAnimationFrame();
    render(
      <SlideModal {...mockProps} isOpen={true}>
        <p>Static area</p>
      </SlideModal>,
    );

    const staticArea = screen.getByText("Static area");
    const dialog = screen.getByRole("dialog");
    fireEvent.touchStart(staticArea, {
      touches: [{ clientX: 100, clientY: 20 }],
    });
    fireEvent.touchMove(staticArea, {
      touches: [{ clientX: 100, clientY: 140 }],
    });
    flushAnimationFrame();

    expect(dialog).toHaveStyle({ transform: "translate3d(0, 120px, 0)" });
    expect(mockProps.close).not.toHaveBeenCalled();

    fireEvent.touchCancel(staticArea);
  });

  it("should reset an active drag when a second touch starts", () => {
    const flushAnimationFrame = mockAnimationFrame();
    render(
      <SlideModal {...mockProps} isOpen={true}>
        <p>Static area</p>
      </SlideModal>,
    );

    const staticArea = screen.getByText("Static area");
    const dialog = screen.getByRole("dialog");
    fireEvent.touchStart(staticArea, {
      touches: [{ clientX: 100, clientY: 20 }],
    });
    fireEvent.touchMove(staticArea, {
      touches: [{ clientX: 100, clientY: 140 }],
    });
    flushAnimationFrame();
    expect(dialog).toHaveStyle({ transform: "translate3d(0, 120px, 0)" });

    fireEvent.touchStart(staticArea, {
      touches: [
        { clientX: 100, clientY: 140 },
        { clientX: 140, clientY: 140 },
      ],
    });

    expect(dialog).toHaveStyle({ transform: "translate3d(0, 0, 0)" });
  });

  it("should snap back when drag stays below close thresholds", () => {
    const closeMock = vi.fn();
    render(<SlideModal {...mockProps} isOpen={true} close={closeMock} />);

    const title = screen.getByRole("heading", { name: "Test Modal" });
    const dialog = screen.getByRole("dialog");
    mockDialogHeight(dialog, 400);
    fireEvent.touchStart(title, {
      touches: [{ clientX: 100, clientY: 20 }],
    });
    fireEvent.touchMove(title, {
      touches: [{ clientX: 100, clientY: 40 }],
    });
    fireEvent.touchEnd(title, {
      changedTouches: [{ clientX: 100, clientY: 40 }],
    });

    expect(closeMock).not.toHaveBeenCalled();
    expect(dialog).toHaveStyle({ transform: "translate3d(0, 0, 0)" });
  });

  it("should request close when drag passes the distance threshold", () => {
    const closeMock = vi.fn();
    render(<SlideModal {...mockProps} isOpen={true} close={closeMock} />);

    const staticArea = screen.getByText("Test Content");
    const dialog = screen.getByRole("dialog");
    mockDialogHeight(dialog, 400);
    fireEvent(
      staticArea,
      withTimeStamp(
        createEvent.touchStart(staticArea, {
          touches: [{ clientX: 100, clientY: 20 }],
        }),
        100,
      ),
    );
    fireEvent(
      staticArea,
      withTimeStamp(
        createEvent.touchMove(staticArea, {
          touches: [{ clientX: 100, clientY: 140 }],
        }),
        600,
      ),
    );
    fireEvent(
      staticArea,
      withTimeStamp(
        createEvent.touchEnd(staticArea, {
          changedTouches: [{ clientX: 100, clientY: 140 }],
        }),
        1100,
      ),
    );

    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveStyle({ transform: "translate3d(0, 0, 0)" });
  });

  it("should request close for a short fast flick", () => {
    const closeMock = vi.fn();
    render(<SlideModal {...mockProps} isOpen={true} close={closeMock} />);

    const staticArea = screen.getByText("Test Content");
    const dialog = screen.getByRole("dialog");
    mockDialogHeight(dialog, 400);
    fireEvent(
      staticArea,
      withTimeStamp(
        createEvent.touchStart(staticArea, {
          touches: [{ clientX: 100, clientY: 20 }],
        }),
        100,
      ),
    );
    fireEvent(
      staticArea,
      withTimeStamp(
        createEvent.touchMove(staticArea, {
          touches: [{ clientX: 100, clientY: 60 }],
        }),
        110,
      ),
    );
    fireEvent(
      staticArea,
      withTimeStamp(
        createEvent.touchEnd(staticArea, {
          changedTouches: [{ clientX: 100, clientY: 60 }],
        }),
        120,
      ),
    );

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("should not start dragging from interactive content", () => {
    const closeMock = vi.fn();
    render(
      <SlideModal {...mockProps} isOpen={true} close={closeMock}>
        <button type="button">Action</button>
      </SlideModal>,
    );

    const action = screen.getByRole("button", { name: "Action" });
    const dialog = screen.getByRole("dialog");
    fireEvent.touchStart(action, {
      touches: [{ clientX: 100, clientY: 20 }],
    });
    fireEvent.touchMove(action, {
      touches: [{ clientX: 100, clientY: 160 }],
    });
    fireEvent.touchEnd(action, {
      changedTouches: [{ clientX: 100, clientY: 160 }],
    });

    expect(closeMock).not.toHaveBeenCalled();
    expect(dialog).toHaveStyle({ transform: "translate3d(0, 0, 0)" });
  });

  it("should leave scrolling content alone when it is not at the top", () => {
    const closeMock = vi.fn();
    render(
      <SlideModal {...mockProps} isOpen={true} close={closeMock}>
        <div style={{ height: 100, overflowY: "auto" }}>
          <p>Scrollable content</p>
        </div>
      </SlideModal>,
    );

    const content = screen.getByText("Scrollable content");
    const scrollContainer = content.parentElement!;
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 400 },
    });
    scrollContainer.scrollTop = 40;

    fireEvent.touchStart(content, {
      touches: [{ clientX: 100, clientY: 20 }],
    });
    fireEvent.touchMove(content, {
      touches: [{ clientX: 100, clientY: 160 }],
    });
    fireEvent.touchEnd(content, {
      changedTouches: [{ clientX: 100, clientY: 160 }],
    });

    expect(closeMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveStyle({
      transform: "translate3d(0, 0, 0)",
    });
  });

  it("should allow dragging scrollable content when it is at the top", () => {
    const closeMock = vi.fn();
    render(
      <SlideModal {...mockProps} isOpen={true} close={closeMock}>
        <div style={{ height: 100, overflowY: "auto" }}>
          <p>Scrollable content</p>
        </div>
      </SlideModal>,
    );

    const content = screen.getByText("Scrollable content");
    const scrollContainer = content.parentElement!;
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 400 },
    });
    scrollContainer.scrollTop = 0;
    mockDialogHeight(screen.getByRole("dialog"), 400);

    fireEvent.touchStart(content, {
      touches: [{ clientX: 100, clientY: 20 }],
    });
    fireEvent.touchMove(content, {
      touches: [{ clientX: 100, clientY: 140 }],
    });
    fireEvent.touchEnd(content, {
      changedTouches: [{ clientX: 100, clientY: 140 }],
    });

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("should restore drag dismissal after being hidden and reopened", () => {
    const closeMock = vi.fn();
    const view = render(
      <SlideModal {...mockProps} isOpen={true} close={closeMock} />,
    );

    view.rerender(
      <SlideModal {...mockProps} isOpen={false} close={closeMock} />,
    );
    view.rerender(
      <SlideModal {...mockProps} isOpen={true} close={closeMock} />,
    );

    const content = screen.getByText("Test Content");
    mockDialogHeight(screen.getByRole("dialog"), 400);
    fireEvent.touchStart(content, {
      touches: [{ clientX: 100, clientY: 20 }],
    });
    fireEvent.touchMove(content, {
      touches: [{ clientX: 100, clientY: 160 }],
    });
    fireEvent.touchEnd(content, {
      changedTouches: [{ clientX: 100, clientY: 160 }],
    });

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("should disable drag dismissal while a screen reader is active", async () => {
    const user = userEvent.setup();
    mockScreenReaderEnabled = true;
    const closeMock = vi.fn();
    render(<SlideModal {...mockProps} isOpen={true} close={closeMock} />);

    const title = screen.getByRole("heading", { name: "Test Modal" });
    fireEvent.touchStart(title, {
      touches: [{ clientX: 100, clientY: 20 }],
    });
    fireEvent.touchMove(title, {
      touches: [{ clientX: 100, clientY: 160 }],
    });
    fireEvent.touchEnd(title, {
      changedTouches: [{ clientX: 100, clientY: 160 }],
    });

    expect(closeMock).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: "nav.close" })[0]!);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("makes closed modal content inert", () => {
    render(<SlideModal {...mockProps} isOpen={false} />);

    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog).toHaveAttribute("aria-hidden", "true");
    expect(dialog).toHaveAttribute("inert");
    expect(dialog).not.toHaveAttribute("aria-modal");
  });

  it("focuses its visible heading when opened", () => {
    render(<SlideModal {...mockProps} isOpen={true} />);

    expect(screen.getByRole("heading", { name: "Test Modal" })).toHaveFocus();
  });

  it("closes when Escape is pressed", async () => {
    const user = userEvent.setup();
    const closeMock = vi.fn();
    render(<SlideModal {...mockProps} isOpen={true} close={closeMock} />);

    await user.keyboard("{Escape}");

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("makes surrounding content inert only while open", () => {
    const { rerender } = render(
      <div>
        <button type="button">Outside</button>
        <SlideModal {...mockProps} isOpen={true} />
      </div>,
    );

    const outside = screen.getByRole("button", {
      name: "Outside",
      hidden: true,
    });
    expect(outside).toHaveAttribute("inert");

    rerender(
      <div>
        <button type="button">Outside</button>
        <SlideModal {...mockProps} isOpen={false} />
      </div>,
    );

    expect(screen.getByRole("button", { name: "Outside" })).not.toHaveAttribute(
      "inert",
    );
  });

  it("renders with custom className", () => {
    render(
      <SlideModal {...mockProps} isOpen={true} className="custom-class" />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("custom-class");
  });

  it("keeps footer actions interactive outside the scrollable body", async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    const scrollRef = createRef<HTMLDivElement>();
    render(
      <SlideModal
        {...mockProps}
        isOpen={true}
        scrollRef={scrollRef}
        footerSkipLabel="Skip to actions"
        footer={
          <button type="button" onClick={action}>
            Footer Button
          </button>
        }
      />,
    );

    const footerButton = screen.getByRole("button", { name: "Footer Button" });
    expect(scrollRef.current).not.toContainElement(footerButton);

    await user.click(screen.getByRole("link", { name: "Skip to actions" }));
    expect(footerButton.parentElement).toHaveFocus();

    await user.click(footerButton);
    expect(action).toHaveBeenCalledTimes(1);
  });
});

import { render, screen, fireEvent } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { useContext } from "react";
import { SlideModalProvider } from "@/components/SlideModalProvider";
import { SlideModalContext } from "@/hooks/useSlideModalManager";

// Consumer component that can trigger manager functions
function TestConsumer() {
  const manager = useContext(SlideModalContext);

  if (!manager) {
    return <div>No manager available</div>;
  }

  const mockClose1 = vi.fn();
  const mockClose2 = vi.fn();

  return (
    <div>
      <button
        onClick={() => {
          manager.registerModal("test1", mockClose1);
          manager.registerModal("test2", mockClose2);
        }}
        data-testid="register-modals"
      >
        Register Modals
      </button>
      <button
        onClick={() => manager.closeAllExcept("test1")}
        data-testid="close-all-except"
      >
        Close All Except test1
      </button>
      <button
        onClick={() => manager.unregisterModal("test1")}
        data-testid="unregister-modal"
      >
        Unregister test1
      </button>
    </div>
  );
}

describe("SlideModalProvider", () => {
  it("should render children correctly", () => {
    render(
      <SlideModalProvider>
        <div>Test Content</div>
      </SlideModalProvider>,
    );

    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("should provide SlideModalContext to children", () => {
    render(
      <SlideModalProvider>
        <TestConsumer />
      </SlideModalProvider>,
    );

    expect(screen.getByTestId("register-modals")).toBeInTheDocument();
    expect(screen.getByTestId("close-all-except")).toBeInTheDocument();
    expect(screen.getByTestId("unregister-modal")).toBeInTheDocument();
  });

  it("should allow registering and unregistering modals", () => {
    const mockClose = vi.fn();

    function TestComponent() {
      const manager = useContext(SlideModalContext);

      return (
        <div>
          <button
            onClick={() => manager?.registerModal("test", mockClose)}
            data-testid="register"
          >
            Register
          </button>
          <button
            onClick={() => manager?.unregisterModal("test")}
            data-testid="unregister"
          >
            Unregister
          </button>
        </div>
      );
    }

    render(
      <SlideModalProvider>
        <TestComponent />
      </SlideModalProvider>,
    );

    // Test registration
    fireEvent.click(screen.getByTestId("register"));

    // Test unregistration
    fireEvent.click(screen.getByTestId("unregister"));

    // Should not throw errors
    expect(screen.getByTestId("register")).toBeInTheDocument();
  });

  it("should close all modals except the specified one", () => {
    const mockClose1 = vi.fn();
    const mockClose2 = vi.fn();
    const mockClose3 = vi.fn();

    function TestComponent() {
      const manager = useContext(SlideModalContext);

      return (
        <div>
          <button
            onClick={() => {
              manager?.registerModal("modal1", mockClose1);
              manager?.registerModal("modal2", mockClose2);
              manager?.registerModal("modal3", mockClose3);
            }}
            data-testid="register-all"
          >
            Register All
          </button>
          <button
            onClick={() => manager?.closeAllExcept("modal2")}
            data-testid="close-except-modal2"
          >
            Close Except Modal2
          </button>
        </div>
      );
    }

    render(
      <SlideModalProvider>
        <TestComponent />
      </SlideModalProvider>,
    );

    // Register modals
    fireEvent.click(screen.getByTestId("register-all"));

    // Close all except modal2
    fireEvent.click(screen.getByTestId("close-except-modal2"));

    // Verify that modal1 and modal3 were closed but modal2 was not
    expect(mockClose1).toHaveBeenCalled();
    expect(mockClose2).not.toHaveBeenCalled();
    expect(mockClose3).toHaveBeenCalled();
  });

  it("should reject later modals while a blocking modal is registered", async () => {
    const user = userEvent.setup();
    const blockingClose = vi.fn();
    const laterClose = vi.fn();
    let accepted: boolean | undefined;

    function TestComponent() {
      const manager = useContext(SlideModalContext);

      return (
        <button
          onClick={() => {
            manager?.registerModal("blocking", blockingClose, {
              blocking: true,
            });
            accepted = manager?.closeAllExcept("later");
            if (accepted) manager?.registerModal("later", laterClose);
          }}
        >
          Try later modal
        </button>
      );
    }

    render(
      <SlideModalProvider>
        <TestComponent />
      </SlideModalProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Try later modal" }));

    expect(accepted).toBe(false);
    expect(blockingClose).not.toHaveBeenCalled();
    expect(laterClose).not.toHaveBeenCalled();
  });

  it("should handle closeAllExcept when no modals are registered", async () => {
    const user = userEvent.setup();

    function TestComponent() {
      const manager = useContext(SlideModalContext);

      return (
        <button onClick={() => manager?.closeAllExcept("nonexistent")}>
          Close All Except Nonexistent
        </button>
      );
    }

    render(
      <SlideModalProvider>
        <TestComponent />
      </SlideModalProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Close All Except Nonexistent" }),
    );

    expect(
      screen.getByRole("button", { name: "Close All Except Nonexistent" }),
    ).toBeInTheDocument();
  });
});

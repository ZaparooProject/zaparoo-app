import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test-utils";
import userEvent from "@testing-library/user-event";
import { useStatusStore } from "@/lib/store";
import { RemoteKeyboardModal } from "@/components/RemoteKeyboardModal";
import { CoreAPI } from "@/lib/coreApi";
import toast from "react-hot-toast";

interface KeyboardMockProps {
  layout: Record<string, string[]>;
  layoutName: string;
  display: Record<string, string>;
  onKeyPress: (button: string) => void;
}

vi.mock("react-simple-keyboard", () => ({
  default: ({ layout, layoutName, display, onKeyPress }: KeyboardMockProps) => (
    <div>
      {layout[layoutName]?.flatMap((row) =>
        row.split(" ").map((button) => (
          <button
            key={`${layoutName}-${button}`}
            type="button"
            onClick={() => onKeyPress(button)}
          >
            {display[button] ?? button}
          </button>
        )),
      )}
    </div>
  ),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    reset: vi.fn(),
    inputKeyboard: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue({
      path: "/media/fat/screenshots/MiSTer.png",
      data: "iVBORw0KGgo=",
      size: 12,
    }),
  },
}));

describe("RemoteKeyboardModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.reset();
    useStatusStore.setState({ connected: true, corePlatform: null });
  });

  it("should not render redundant description text", () => {
    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    expect(
      screen.queryByText("remoteKeyboard.description"),
    ).not.toBeInTheDocument();
  });

  it("should size modal to content instead of fixed height", () => {
    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    expect(screen.getByRole("dialog").style.height).toBe("");
  });

  it("should default to remote mode", () => {
    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "remoteKeyboard.ok" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "q" })).not.toBeInTheDocument();
  });

  it("should send remote directional actions", async () => {
    const user = userEvent.setup();

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "remoteKeyboard.up" }));

    await waitFor(() => {
      expect(CoreAPI.inputKeyboard).toHaveBeenCalledWith({ keys: "{up}" });
    });
  });

  it("should send remote OK action", async () => {
    const user = userEvent.setup();

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "remoteKeyboard.ok" }));

    await waitFor(() => {
      expect(CoreAPI.inputKeyboard).toHaveBeenCalledWith({ keys: "{enter}" });
    });
  });

  it("should send generic remote actions when platform is unknown", async () => {
    const user = userEvent.setup();

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: "remoteKeyboard.menu" }),
    );
    await user.click(
      screen.getByRole("button", { name: "remoteKeyboard.select" }),
    );

    await waitFor(() => {
      expect(CoreAPI.inputKeyboard).toHaveBeenCalledTimes(2);
    });
    expect(CoreAPI.inputKeyboard).toHaveBeenCalledWith({ keys: "{f12}" });
    expect(CoreAPI.inputKeyboard).toHaveBeenCalledWith({
      keys: "{backspace}",
    });
  });

  it("should send MiSTer remote actions when platform is MiSTer", async () => {
    const user = userEvent.setup();
    useStatusStore.setState({ corePlatform: "mister" });

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "remoteKeyboard.osd" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "remoteKeyboard.core" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "remoteKeyboard.osd" }),
    );

    await waitFor(() => {
      expect(CoreAPI.inputKeyboard).toHaveBeenCalledWith({ keys: "{f12}" });
    });
  });

  it("should send Batocera remote actions when platform is Batocera", async () => {
    const user = userEvent.setup();
    useStatusStore.setState({ corePlatform: "batocera" });

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "remoteKeyboard.minus" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "remoteKeyboard.equals" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "remoteKeyboard.context" }),
    );

    await waitFor(() => {
      expect(CoreAPI.inputKeyboard).toHaveBeenCalledWith({
        keys: "{backspace}",
      });
    });
  });

  it("should capture and show an inline screenshot result", async () => {
    const user = userEvent.setup();

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    await user.click(
      screen.getByRole("button", {
        name: "remoteKeyboard.screenshotAction",
      }),
    );

    await waitFor(() => {
      expect(CoreAPI.screenshot).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole("radio", { name: "remoteKeyboard.screenshotMode" }),
    ).not.toBeInTheDocument();
    expect(screen.getByAltText("remoteKeyboard.screenshotAlt")).toHaveAttribute(
      "src",
      "data:image/png;base64,iVBORw0KGgo=",
    );
    expect(
      screen.getByRole("link", {
        name: "remoteKeyboard.screenshotDownload",
      }),
    ).toHaveAttribute("download", "MiSTer.png");

    await user.click(
      screen.getByRole("button", { name: "remoteKeyboard.screenshotClear" }),
    );

    expect(
      screen.queryByAltText("remoteKeyboard.screenshotAlt"),
    ).not.toBeInTheDocument();
  });

  it("should show loading state while capturing screenshot", async () => {
    const user = userEvent.setup();
    let resolveScreenshot: (
      value: Awaited<ReturnType<typeof CoreAPI.screenshot>>,
    ) => void;
    vi.mocked(CoreAPI.screenshot).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveScreenshot = resolve;
      }),
    );

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    const screenshotButton = screen.getByRole("button", {
      name: "remoteKeyboard.screenshotAction",
    });
    await user.click(screenshotButton);

    expect(screenshotButton).toBeDisabled();
    expect(screenshotButton).toHaveAttribute("aria-busy", "true");

    resolveScreenshot!({
      path: "/media/fat/screenshots/loading.png",
      data: "iVBORw0KGgo=",
      size: 12,
    });

    await waitFor(() => {
      expect(screenshotButton).not.toBeDisabled();
    });
  });

  it("should show an error when screenshot capture fails", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.screenshot).mockRejectedValueOnce(new Error("failed"));

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    await user.click(
      screen.getByRole("button", {
        name: "remoteKeyboard.screenshotAction",
      }),
    );

    expect(
      await screen.findByText("remoteKeyboard.screenshotError"),
    ).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("remoteKeyboard.screenshotError");
  });

  it("should send literal key presses from keyboard mode", async () => {
    const user = userEvent.setup();

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    await user.click(
      screen.getByRole("radio", { name: "remoteKeyboard.keyboardMode" }),
    );
    await user.click(screen.getByRole("button", { name: "q" }));

    await waitFor(() => {
      expect(CoreAPI.inputKeyboard).toHaveBeenCalledWith({ keys: "q" });
    });
  });

  it("should send special key macros from keyboard mode", async () => {
    const user = userEvent.setup();

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    await user.click(
      screen.getByRole("radio", { name: "remoteKeyboard.keyboardMode" }),
    );
    await user.click(screen.getByRole("button", { name: "Enter" }));

    await waitFor(() => {
      expect(CoreAPI.inputKeyboard).toHaveBeenCalledWith({ keys: "{enter}" });
    });
  });

  it("should send function key macros from keyboard mode", async () => {
    const user = userEvent.setup();

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    await user.click(
      screen.getByRole("radio", { name: "remoteKeyboard.keyboardMode" }),
    );
    await user.click(screen.getByRole("button", { name: "Fn" }));
    await user.click(screen.getByRole("button", { name: "F12" }));

    await waitFor(() => {
      expect(CoreAPI.inputKeyboard).toHaveBeenCalledWith({ keys: "{f12}" });
    });
  });

  it("should escape literal brace input from keyboard mode", async () => {
    const user = userEvent.setup();

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    await user.click(
      screen.getByRole("radio", { name: "remoteKeyboard.keyboardMode" }),
    );
    await user.click(screen.getByRole("button", { name: "#+=" }));
    await user.click(screen.getByRole("button", { name: "{" }));

    await waitFor(() => {
      expect(CoreAPI.inputKeyboard).toHaveBeenCalledWith({ keys: "\\{" });
    });
  });

  it("should not send remote actions when disconnected", async () => {
    const user = userEvent.setup();
    useStatusStore.setState({ connected: false });

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: "remoteKeyboard.menu" }),
    );

    expect(CoreAPI.inputKeyboard).not.toHaveBeenCalled();
    expect(screen.getByText("remoteKeyboard.disconnected")).toBeInTheDocument();
  });
});

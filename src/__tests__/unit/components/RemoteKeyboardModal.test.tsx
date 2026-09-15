import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fireEvent,
  findA11yViolations,
  render,
  screen,
  waitFor,
} from "@/test-utils";
import userEvent from "@testing-library/user-event";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { RemoteKeyboardModal } from "@/components/RemoteKeyboardModal";
import { CoreAPI, CoreApiError } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import toast from "react-hot-toast";

interface KeyboardMockProps {
  layout: Record<string, string[]>;
  layoutName: string;
  display: Record<string, string>;
  onKeyPress: (button: string) => void;
  useButtonTag?: boolean;
}

vi.mock("react-simple-keyboard/build/index.modern.esm.js", () => ({
  default: ({
    layout,
    layoutName,
    display,
    onKeyPress,
    useButtonTag,
  }: KeyboardMockProps) => (
    <div data-use-button-tag={useButtonTag ? "true" : "false"}>
      {layout[layoutName]?.flatMap((row) =>
        row.split(" ").map((button) => {
          const label = display[button] ?? button;
          return useButtonTag ? (
            <button
              key={`${layoutName}-${button}`}
              type="button"
              onClick={() => onKeyPress(button)}
            >
              {label}
            </button>
          ) : (
            <div
              key={`${layoutName}-${button}`}
              role="button"
              tabIndex={0}
              onClick={() => onKeyPress(button)}
            >
              {label}
            </div>
          );
        }),
      )}
    </div>
  ),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("@/lib/coreApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/coreApi")>()),
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
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    CoreAPI.reset();
    useStatusStore.setState({ connected: true, corePlatform: null });
  });

  it("should render virtual keys as semantic buttons", async () => {
    const user = userEvent.setup();
    const { baseElement } = render(
      <RemoteKeyboardModal isOpen close={vi.fn()} />,
    );
    await user.click(
      screen.getByRole("radio", { name: "remoteKeyboard.keyboardMode" }),
    );

    expect(screen.getByRole("button", { name: "q" })).toBeInTheDocument();
    expect(await findA11yViolations(baseElement)).toEqual([]);
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

  it("should trigger light haptics for remote pad actions on native platforms", async () => {
    const user = userEvent.setup();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "remoteKeyboard.up" }));

    expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Light });
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
      screen.queryByText("/media/fat/screenshots/MiSTer.png"),
    ).not.toBeInTheDocument();
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

  it("should share screenshots on native platforms", async () => {
    const user = userEvent.setup();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

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
      screen.getByRole("button", {
        name: "remoteKeyboard.screenshotShare",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: "remoteKeyboard.screenshotDownload",
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "remoteKeyboard.screenshotShare",
      }),
    );

    await waitFor(() => {
      expect(Filesystem.writeFile).toHaveBeenCalledWith({
        path: "MiSTer.png",
        data: "iVBORw0KGgo=",
        directory: Directory.Cache,
      });
    });
    expect(Filesystem.getUri).toHaveBeenCalledWith({
      path: "MiSTer.png",
      directory: Directory.Cache,
    });
    expect(Share.share).toHaveBeenCalledWith({
      title: "remoteKeyboard.screenshotShareTitle",
      dialogTitle: "remoteKeyboard.screenshotShareTitle",
      files: ["file:///mock/path/file.txt"],
    });
  });

  it("should not show an error when native screenshot share is cancelled", async () => {
    const user = userEvent.setup();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Share.share).mockRejectedValueOnce(new Error("Share canceled"));

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    await user.click(
      screen.getByRole("button", {
        name: "remoteKeyboard.screenshotAction",
      }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "remoteKeyboard.screenshotShare",
      }),
    );

    await waitFor(() => {
      expect(Share.share).toHaveBeenCalled();
    });
    expect(toast.error).not.toHaveBeenCalledWith(
      "remoteKeyboard.screenshotShareError",
    );
  });

  it("should show an error when native screenshot share fails", async () => {
    const user = userEvent.setup();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Share.share).mockRejectedValueOnce(new Error("failed"));

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    await user.click(
      screen.getByRole("button", {
        name: "remoteKeyboard.screenshotAction",
      }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "remoteKeyboard.screenshotShare",
      }),
    );

    expect(toast.error).toHaveBeenCalledWith(
      "remoteKeyboard.screenshotShareError",
    );
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

  it.each([
    "screenshot failed: operation not supported on this platform",
    "client role does not permit this method",
  ])(
    "should show an error without reporting unavailable screenshots: %s",
    async (coreMessage) => {
      const user = userEvent.setup();
      const loggerError = vi.spyOn(logger, "error");
      vi.mocked(CoreAPI.screenshot).mockRejectedValueOnce(
        new CoreApiError(coreMessage, 1),
      );

      render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

      await user.click(
        screen.getByRole("button", {
          name: "remoteKeyboard.screenshotAction",
        }),
      );

      expect(
        await screen.findByText("remoteKeyboard.screenshotError"),
      ).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith(
        "remoteKeyboard.screenshotError",
      );
      expect(loggerError).not.toHaveBeenCalled();
      loggerError.mockRestore();
    },
  );

  it.each([
    [
      "screenshot failed: screenshot timed out after 10s",
      new CoreApiError("screenshot failed: screenshot timed out after 10s", 1),
      "warning",
    ],
    ["unexpected capture errors", new Error("failed"), "error"],
  ])(
    "should report %s with context",
    async (_description, captureError, severity) => {
      const user = userEvent.setup();
      const loggerError = vi
        .spyOn(logger, "error")
        .mockImplementation(() => {});
      vi.mocked(CoreAPI.screenshot).mockRejectedValueOnce(captureError);

      render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

      await user.click(
        screen.getByRole("button", {
          name: "remoteKeyboard.screenshotAction",
        }),
      );

      expect(
        await screen.findByText("remoteKeyboard.screenshotError"),
      ).toBeInTheDocument();
      expect(loggerError).toHaveBeenCalledWith(
        "remoteKeyboard.screenshotError",
        captureError,
        {
          category: "api",
          action: "remoteKeyboard.screenshot",
          severity,
        },
      );
      loggerError.mockRestore();
    },
  );

  it("should trigger light haptics for screenshot capture and clear controls", async () => {
    const user = userEvent.setup();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    await user.click(
      screen.getByRole("button", {
        name: "remoteKeyboard.screenshotAction",
      }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "remoteKeyboard.screenshotClear",
      }),
    );

    expect(Haptics.impact).toHaveBeenCalledTimes(2);
    expect(Haptics.impact).toHaveBeenNthCalledWith(1, {
      style: ImpactStyle.Light,
    });
    expect(Haptics.impact).toHaveBeenNthCalledWith(2, {
      style: ImpactStyle.Light,
    });
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

  it("should trigger light haptics for mode and keyboard key controls", async () => {
    const user = userEvent.setup();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

    render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

    await user.click(
      screen.getByRole("radio", { name: "remoteKeyboard.keyboardMode" }),
    );
    await user.click(screen.getByRole("button", { name: "q" }));

    expect(Haptics.impact).toHaveBeenCalledTimes(2);
    expect(Haptics.impact).toHaveBeenNthCalledWith(1, {
      style: ImpactStyle.Light,
    });
    expect(Haptics.impact).toHaveBeenNthCalledWith(2, {
      style: ImpactStyle.Light,
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

  describe("held remote input", () => {
    const sentKeys = () =>
      vi
        .mocked(CoreAPI.inputKeyboard)
        .mock.calls.map(([params]) => params.keys);

    beforeEach(() => {
      useStatusStore.setState({
        connected: true,
        connectionState: ConnectionState.CONNECTED,
        coreVersion: "2.17.0",
        coreVersionPending: false,
      });
    });

    it("should hold a remote button until it is released", async () => {
      const user = userEvent.setup();
      render(<RemoteKeyboardModal isOpen close={vi.fn()} />);
      const up = screen.getByRole("button", { name: "remoteKeyboard.up" });

      await user.pointer({ keys: "[TouchA>]", target: up });
      await waitFor(() => expect(sentKeys()).toEqual(["{press:up}"]));

      await user.pointer({ keys: "[/TouchA]", target: up });
      await waitFor(() =>
        expect(sentKeys()).toEqual(["{press:up}", "{release:up}"]),
      );
    });

    // user-event only lifts touches once every finger is up, so these tests
    // dispatch pointer events with explicit ids to lift one finger at a time.
    it("should hold several remote buttons at once", async () => {
      render(<RemoteKeyboardModal isOpen close={vi.fn()} />);
      const up = screen.getByRole("button", { name: "remoteKeyboard.up" });
      const right = screen.getByRole("button", {
        name: "remoteKeyboard.right",
      });
      const touch = (pointerId: number) => ({
        pointerId,
        pointerType: "touch",
      });

      fireEvent.pointerDown(up, touch(1));
      fireEvent.pointerDown(right, touch(2));
      fireEvent.pointerUp(up, touch(1));
      await waitFor(() =>
        expect(sentKeys()).toEqual([
          "{press:up}",
          "{press:right}",
          "{release:up}",
        ]),
      );

      fireEvent.pointerUp(right, touch(2));
      await waitFor(() =>
        expect(sentKeys()).toEqual([
          "{press:up}",
          "{press:right}",
          "{release:up}",
          "{release:right}",
        ]),
      );
    });

    it("should keep a button held until its last pointer lifts", async () => {
      render(<RemoteKeyboardModal isOpen close={vi.fn()} />);
      const ok = screen.getByRole("button", { name: "remoteKeyboard.ok" });
      const touch = (pointerId: number) => ({
        pointerId,
        pointerType: "touch",
      });

      fireEvent.pointerDown(ok, touch(1));
      fireEvent.pointerDown(ok, touch(2));
      fireEvent.pointerUp(ok, touch(1));
      await waitFor(() => expect(sentKeys()).toEqual(["{press:enter}"]));

      fireEvent.pointerUp(ok, touch(2));
      await waitFor(() =>
        expect(sentKeys()).toEqual(["{press:enter}", "{release:enter}"]),
      );
    });

    it("should not release a button before Core has pressed it", async () => {
      const user = userEvent.setup();
      let finishPress = () => {};
      vi.mocked(CoreAPI.inputKeyboard).mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishPress = resolve;
          }),
      );
      render(<RemoteKeyboardModal isOpen close={vi.fn()} />);
      const down = screen.getByRole("button", { name: "remoteKeyboard.down" });

      await user.pointer({ keys: "[TouchA>]", target: down });
      await user.pointer({ keys: "[/TouchA]", target: down });
      expect(sentKeys()).toEqual(["{press:down}"]);

      finishPress();
      await waitFor(() =>
        expect(sentKeys()).toEqual(["{press:down}", "{release:down}"]),
      );
    });

    it("should fall back to taps when the platform cannot hold input", async () => {
      const user = userEvent.setup();
      vi.mocked(CoreAPI.inputKeyboard).mockRejectedValueOnce(
        new CoreApiError(
          "persistent keyboard input requires a supported WebSocket session",
          1,
        ),
      );
      render(<RemoteKeyboardModal isOpen close={vi.fn()} />);
      const up = screen.getByRole("button", { name: "remoteKeyboard.up" });

      await user.pointer({ keys: "[TouchA>]", target: up });
      await waitFor(() => expect(sentKeys()).toEqual(["{press:up}", "{up}"]));
      await user.pointer({ keys: "[/TouchA]", target: up });

      await user.pointer({ keys: "[TouchA>][/TouchA]", target: up });
      await waitFor(() =>
        expect(sentKeys()).toEqual(["{press:up}", "{up}", "{up}"]),
      );
      expect(toast.error).not.toHaveBeenCalled();
      expect(
        screen.queryByText("remoteKeyboard.sendError"),
      ).not.toBeInTheDocument();
    });

    it("should forget held buttons when Core rejects a press", async () => {
      const user = userEvent.setup();
      vi.mocked(CoreAPI.inputKeyboard).mockRejectedValueOnce(
        new Error("keyboard press failed"),
      );
      render(<RemoteKeyboardModal isOpen close={vi.fn()} />);
      const up = screen.getByRole("button", { name: "remoteKeyboard.up" });

      await user.pointer({ keys: "[TouchA>]", target: up });
      expect(
        await screen.findByText("remoteKeyboard.sendError"),
      ).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith("remoteKeyboard.sendError");

      await user.pointer({ keys: "[/TouchA]", target: up });
      expect(sentKeys()).toEqual(["{press:up}"]);
    });

    it("should release held buttons when the modal closes", async () => {
      const user = userEvent.setup();
      const close = vi.fn();
      const { rerender } = render(<RemoteKeyboardModal isOpen close={close} />);
      const up = screen.getByRole("button", { name: "remoteKeyboard.up" });

      await user.pointer({ keys: "[TouchA>]", target: up });
      rerender(<RemoteKeyboardModal isOpen={false} close={close} />);

      await waitFor(() =>
        expect(sentKeys()).toEqual(["{press:up}", "{release:up}"]),
      );
    });

    it("should release a held button when its pointer capture is lost", async () => {
      const user = userEvent.setup();
      render(<RemoteKeyboardModal isOpen close={vi.fn()} />);
      const left = screen.getByRole("button", { name: "remoteKeyboard.left" });

      await user.pointer({ keys: "[MouseLeft>]", target: left });
      await waitFor(() => expect(sentKeys()).toEqual(["{press:left}"]));
      fireEvent.lostPointerCapture(left, { pointerId: 1 });

      await waitFor(() =>
        expect(sentKeys()).toEqual(["{press:left}", "{release:left}"]),
      );
    });

    it("should tap when a remote button is activated without a pointer", async () => {
      const user = userEvent.setup();
      render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

      screen.getByRole("button", { name: "remoteKeyboard.back" }).focus();
      await user.keyboard("{Enter}");

      await waitFor(() => expect(sentKeys()).toEqual(["{esc}"]));
    });

    it("should keep tapping remote buttons on Cores before 2.17.0", async () => {
      const user = userEvent.setup();
      useStatusStore.setState({ coreVersion: "2.16.0" });
      render(<RemoteKeyboardModal isOpen close={vi.fn()} />);

      await user.click(
        screen.getByRole("button", { name: "remoteKeyboard.up" }),
      );

      await waitFor(() => expect(sentKeys()).toEqual(["{up}"]));
    });
  });
});

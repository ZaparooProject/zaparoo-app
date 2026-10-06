import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "../../../test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CopyButton } from "../../../components/CopyButton";
import { Capacitor } from "@capacitor/core";
import { Clipboard } from "@capacitor/clipboard";
import { Haptics } from "@capacitor/haptics";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";

vi.mock("react-hot-toast", () => ({ default: { error: vi.fn() } }));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock("@capacitor/clipboard", () => ({
  Clipboard: {
    write: vi.fn(),
  },
}));

describe("CopyButton", () => {
  const mockWriteText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (Capacitor.isNativePlatform as ReturnType<typeof vi.fn>).mockReturnValue(
      true,
    );
    (Clipboard.write as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    mockWriteText.mockResolvedValue(undefined);

    // Mock navigator.clipboard using defineProperty
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should render on native platform", () => {
    render(<CopyButton text="test text" />);

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-label", "copyToClipboard");
  });

  it("should render on web platform", () => {
    (Capacitor.isNativePlatform as ReturnType<typeof vi.fn>).mockReturnValue(
      false,
    );

    render(<CopyButton text="test text" />);

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("should use Capacitor Clipboard on native platform", async () => {
    vi.useFakeTimers();
    render(<CopyButton text="test text" />);

    const button = screen.getByRole("button");

    fireEvent.click(button);

    expect(Clipboard.write).toHaveBeenCalledWith({ string: "test text" });
    expect(mockWriteText).not.toHaveBeenCalled();
  });

  it("should use navigator.clipboard on web platform", async () => {
    (Capacitor.isNativePlatform as ReturnType<typeof vi.fn>).mockReturnValue(
      false,
    );
    vi.useFakeTimers();
    render(<CopyButton text="test text" />);

    const button = screen.getByRole("button");

    fireEvent.click(button);

    expect(mockWriteText).toHaveBeenCalledWith("test text");
    expect(Clipboard.write).not.toHaveBeenCalled();
  });

  it("should show checkmark on click and revert after timeout", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<CopyButton text="test text" />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-label", "copyToClipboard");

    // Click button
    fireEvent.click(button);

    // Wait for the async copy operation to complete and show "copied" state
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-label", "copied");
    });

    // Advance timer by 2 seconds to trigger the setTimeout revert
    vi.advanceTimersByTime(2000);

    // Wait for the state to revert
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-label", "copyToClipboard");
    });
  });

  it.each([true, false])(
    "reports failed native=%s copy without success and allows retry",
    async (native) => {
      const user = userEvent.setup();
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(native);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: mockWriteText },
        configurable: true,
      });
      const write = native ? vi.mocked(Clipboard.write) : mockWriteText;
      write.mockRejectedValueOnce(new Error("Clipboard denied"));
      render(<CopyButton text="retry value" />);
      const button = screen.getByRole("button", { name: "copyToClipboard" });
      await user.click(button);
      await waitFor(() =>
        expect(
          within(
            screen.getByRole("button", { name: /^(copyToClipboard|copied)$/ }),
          ).getByRole("status"),
        ).toHaveTextContent("copyFailed"),
      );
      expect(toast.error).toHaveBeenCalledWith("copyFailed");
      expect(button).toHaveAccessibleName("copyToClipboard");
      expect(Haptics.notification).not.toHaveBeenCalled();
      await user.click(button);
      await waitFor(() => expect(button).toHaveAccessibleName("copied"));
      expect(write).toHaveBeenCalledTimes(2);
      expect(
        within(
          screen.getByRole("button", { name: /^(copyToClipboard|copied)$/ }),
        ).getByRole("status"),
      ).toHaveTextContent("copied");
    },
  );

  it("reports unavailable browser clipboard without claiming success", async () => {
    const user = userEvent.setup();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    render(<CopyButton text="value" />);
    await user.click(screen.getByRole("button", { name: "copyToClipboard" }));
    expect(
      within(
        screen.getByRole("button", { name: /^(copyToClipboard|copied)$/ }),
      ).getByRole("status"),
    ).toHaveTextContent("copyFailed");
    expect(
      screen.queryByRole("button", { name: "copied" }),
    ).not.toBeInTheDocument();
  });

  it("should accept custom size prop", () => {
    render(<CopyButton text="test" size={20} />);

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("should accept custom className prop", () => {
    render(<CopyButton text="test" className="custom-class" />);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("custom-class");
  });
});

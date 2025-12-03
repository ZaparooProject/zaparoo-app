import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CopyButton } from "../../../components/CopyButton";
import { Capacitor } from "@capacitor/core";
import { Clipboard } from "@capacitor/clipboard";

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
    expect(button).toHaveAttribute("aria-label", "Copy to clipboard");
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
    render(<CopyButton text="test text" />);

    const button = screen.getByRole("button");

    // Click button - the async handler will update state
    fireEvent.click(button);

    // Wait for the copied state to be set
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-label", "Copied");
    });

    // Wait for the state to revert after 2 seconds
    await waitFor(
      () => {
        expect(button).toHaveAttribute("aria-label", "Copy to clipboard");
      },
      { timeout: 3000 },
    );
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

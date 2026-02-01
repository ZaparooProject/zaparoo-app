import { render, screen, fireEvent } from "../../../test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MediaFinishedToast } from "../../../components/MediaFinishedToast";
import toast from "react-hot-toast";

vi.mock("react-hot-toast", () => ({
  default: {
    dismiss: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count !== undefined ? `${key}_${options.count}` : key,
  }),
}));

const mockNotification = vi.fn();
vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    notification: mockNotification,
  }),
}));

// Mock the selector pattern used by Zustand
type StoreState = { gamesIndex: { totalFiles: number } };
vi.mock("@/lib/store", () => ({
  useStatusStore: (selector: (state: StoreState) => unknown) =>
    selector({ gamesIndex: { totalFiles: 42 } }),
}));

describe("MediaFinishedToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render toast content with heading and file count", () => {
    render(<MediaFinishedToast id="test-id" />);

    expect(screen.getByText("toast.updatedDb")).toBeInTheDocument();
    expect(screen.getByText("toast.filesFound_42")).toBeInTheDocument();
  });

  it("should have correct accessibility attributes", () => {
    render(<MediaFinishedToast id="test-id" />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("tabIndex", "0");
  });

  it("should dismiss toast and trigger haptic on click", () => {
    render(<MediaFinishedToast id="test-id" />);

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(mockNotification).toHaveBeenCalledWith("success");
    expect(toast.dismiss).toHaveBeenCalledWith("test-id");
  });

  it("should dismiss toast on Enter key press", () => {
    render(<MediaFinishedToast id="test-id" />);

    const button = screen.getByRole("button");
    fireEvent.keyDown(button, { key: "Enter" });

    expect(mockNotification).toHaveBeenCalledWith("success");
    expect(toast.dismiss).toHaveBeenCalledWith("test-id");
  });

  it("should dismiss toast on Space key press", () => {
    render(<MediaFinishedToast id="test-id" />);

    const button = screen.getByRole("button");
    fireEvent.keyDown(button, { key: " " });

    expect(mockNotification).toHaveBeenCalledWith("success");
    expect(toast.dismiss).toHaveBeenCalledWith("test-id");
  });

  it("should not dismiss toast on other key presses", () => {
    render(<MediaFinishedToast id="test-id" />);

    const button = screen.getByRole("button");
    fireEvent.keyDown(button, { key: "Escape" });

    expect(mockNotification).not.toHaveBeenCalled();
    expect(toast.dismiss).not.toHaveBeenCalled();
  });
});

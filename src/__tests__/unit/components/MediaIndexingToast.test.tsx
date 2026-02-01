import { render, screen, fireEvent } from "../../../test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MediaIndexingToast } from "../../../components/MediaIndexingToast";
import toast from "react-hot-toast";

vi.mock("react-hot-toast", () => ({
  default: {
    dismiss: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockGamesIndex = {
  currentStep: 5,
  totalSteps: 10,
  currentStepDisplay: "Scanning folder 5/10",
  totalFiles: 0,
};

vi.mock("@/lib/store", () => ({
  useStatusStore: (
    selector: (state: {
      gamesIndex: typeof mockGamesIndex;
    }) => typeof mockGamesIndex,
  ) => selector({ gamesIndex: mockGamesIndex }),
}));

describe("MediaIndexingToast", () => {
  const mockSetHideToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock state
    mockGamesIndex.currentStep = 5;
    mockGamesIndex.totalSteps = 10;
    mockGamesIndex.currentStepDisplay = "Scanning folder 5/10";
  });

  it("should render toast content with heading", () => {
    render(<MediaIndexingToast id="test-id" setHideToast={mockSetHideToast} />);

    expect(screen.getByText("toast.updateDbHeading")).toBeInTheDocument();
  });

  it("should display current step when in progress", () => {
    render(<MediaIndexingToast id="test-id" setHideToast={mockSetHideToast} />);

    expect(screen.getByText("Scanning folder 5/10")).toBeInTheDocument();
  });

  it("should display preparing message when currentStepDisplay is empty", () => {
    mockGamesIndex.currentStepDisplay = "";

    render(<MediaIndexingToast id="test-id" setHideToast={mockSetHideToast} />);

    expect(screen.getByText("toast.preparingDb")).toBeInTheDocument();
  });

  it("should display writing message when at final step", () => {
    mockGamesIndex.currentStep = 10;
    mockGamesIndex.totalSteps = 10;

    render(<MediaIndexingToast id="test-id" setHideToast={mockSetHideToast} />);

    expect(screen.getByText("toast.writingDb")).toBeInTheDocument();
  });

  it("should render Hide button", () => {
    render(<MediaIndexingToast id="test-id" setHideToast={mockSetHideToast} />);

    expect(
      screen.getByRole("button", { name: "toast.hideLabel" }),
    ).toBeInTheDocument();
  });

  it("should have correct accessibility attributes on main area", () => {
    render(<MediaIndexingToast id="test-id" setHideToast={mockSetHideToast} />);

    const buttons = screen.getAllByRole("button");
    const mainToastArea = buttons[0]!;
    expect(mainToastArea).toHaveAttribute("tabIndex", "0");
  });

  it("should dismiss toast on main area click", () => {
    render(<MediaIndexingToast id="test-id" setHideToast={mockSetHideToast} />);

    const buttons = screen.getAllByRole("button");
    const mainToastArea = buttons[0]!;
    fireEvent.click(mainToastArea);

    expect(toast.dismiss).toHaveBeenCalledWith("test-id");
  });

  it("should call setHideToast and dismiss on Hide button click", () => {
    render(<MediaIndexingToast id="test-id" setHideToast={mockSetHideToast} />);

    const hideButton = screen.getByRole("button", { name: "toast.hideLabel" });
    fireEvent.click(hideButton);

    expect(mockSetHideToast).toHaveBeenCalledWith(true);
    expect(toast.dismiss).toHaveBeenCalledWith("test-id");
  });

  it("should dismiss toast on Enter key press", () => {
    render(<MediaIndexingToast id="test-id" setHideToast={mockSetHideToast} />);

    const buttons = screen.getAllByRole("button");
    const mainToastArea = buttons[0]!;
    fireEvent.keyDown(mainToastArea, { key: "Enter" });

    expect(toast.dismiss).toHaveBeenCalledWith("test-id");
  });

  it("should dismiss toast on Space key press", () => {
    render(<MediaIndexingToast id="test-id" setHideToast={mockSetHideToast} />);

    const buttons = screen.getAllByRole("button");
    const mainToastArea = buttons[0]!;
    fireEvent.keyDown(mainToastArea, { key: " " });

    expect(toast.dismiss).toHaveBeenCalledWith("test-id");
  });

  it("should not dismiss toast on other key presses", () => {
    render(<MediaIndexingToast id="test-id" setHideToast={mockSetHideToast} />);

    const buttons = screen.getAllByRole("button");
    const mainToastArea = buttons[0]!;
    fireEvent.keyDown(mainToastArea, { key: "Escape" });

    expect(toast.dismiss).not.toHaveBeenCalled();
  });

  it("should render progress bar with correct progress value", () => {
    render(<MediaIndexingToast id="test-id" setHideToast={mockSetHideToast} />);

    const progressBar = screen.getByRole("progressbar", {
      name: "Database indexing progress",
    });
    expect(progressBar).toBeInTheDocument();
    // 5/10 steps = 50%
    expect(progressBar).toHaveAttribute("aria-valuenow", "50");
    expect(progressBar).toHaveAttribute("aria-valuemin", "0");
    expect(progressBar).toHaveAttribute("aria-valuemax", "100");
  });
});

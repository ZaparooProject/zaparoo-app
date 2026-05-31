import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { act, render, screen, waitFor } from "@/test-utils";
import { StagedTokenModal } from "@/components/home/StagedTokenModal";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    confirm: vi.fn().mockResolvedValue(undefined),
    settings: vi.fn().mockResolvedValue({ launchGuardTimeout: 15 }),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({ impact: vi.fn(), notification: vi.fn() }),
}));

const stagedToken = {
  type: "ntag",
  uid: "STAGED",
  text: "**launch:nes/zelda.nes",
  data: "",
  scanTime: "2024-01-15T11:00:00Z",
};

function setStagedToken(ready = false) {
  useStatusStore.setState({
    ...useStatusStore.getInitialState(),
    stagedToken: { token: stagedToken, ready },
  });
}

describe("StagedTokenModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CoreAPI.settings).mockResolvedValue({
      runZapScript: false,
      debugLogging: false,
      errorReporting: false,
      audioScanFeedback: false,
      readersAutoDetect: false,
      readersScanMode: "tap",
      readersScanExitDelay: 0,
      readersScanIgnoreSystems: [],
      launchGuardTimeout: 15,
    });
    useStatusStore.setState(useStatusStore.getInitialState());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should render waiting staged-token copy", () => {
    setStagedToken(false);

    render(<StagedTokenModal />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("tokenStaging.waitingDescription"),
    ).toBeInTheDocument();
    expect(screen.getByText("**launch:nes/zelda.nes")).toBeInTheDocument();
  });

  it("should render ready staged-token copy", () => {
    setStagedToken(true);

    render(<StagedTokenModal />);

    expect(
      screen.getByText("tokenStaging.readyDescription"),
    ).toBeInTheDocument();
  });

  it("should auto-hide after configured launch guard timeout", async () => {
    vi.useFakeTimers();
    vi.mocked(CoreAPI.settings).mockResolvedValueOnce({
      runZapScript: false,
      debugLogging: false,
      errorReporting: false,
      audioScanFeedback: false,
      readersAutoDetect: false,
      readersScanMode: "tap",
      readersScanExitDelay: 0,
      readersScanIgnoreSystems: [],
      launchGuardTimeout: 3,
    });
    setStagedToken(true);

    render(<StagedTokenModal />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(useStatusStore.getState().stagedToken).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(useStatusStore.getState().stagedToken).toBeNull();
  });

  it("should not auto-hide when launch guard timeout is disabled", async () => {
    vi.useFakeTimers();
    vi.mocked(CoreAPI.settings).mockResolvedValueOnce({
      runZapScript: false,
      debugLogging: false,
      errorReporting: false,
      audioScanFeedback: false,
      readersAutoDetect: false,
      readersScanMode: "tap",
      readersScanExitDelay: 0,
      readersScanIgnoreSystems: [],
      launchGuardTimeout: -1,
    });
    setStagedToken(true);

    render(<StagedTokenModal />);

    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(useStatusStore.getState().stagedToken).not.toBeNull();
  });

  it("should confirm staged token and clear modal", async () => {
    const user = userEvent.setup();
    setStagedToken(true);

    render(<StagedTokenModal />);

    await user.click(
      screen.getByRole("button", { name: "tokenStaging.confirm" }),
    );

    await waitFor(() => {
      expect(CoreAPI.confirm).toHaveBeenCalled();
      expect(useStatusStore.getState().stagedToken).toBeNull();
    });
  });

  it("should hide staged token without confirming", async () => {
    const user = userEvent.setup();
    setStagedToken(false);

    render(<StagedTokenModal />);

    await user.click(
      screen.getByRole("button", { name: "tokenStaging.dismiss" }),
    );

    expect(CoreAPI.confirm).not.toHaveBeenCalled();
    expect(useStatusStore.getState().stagedToken).toBeNull();
  });

  it("should clear modal and show expired error when confirm finds no staged token", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.confirm).mockRejectedValueOnce(
      new Error("confirm failed: no staged token to confirm"),
    );
    setStagedToken(true);

    render(<StagedTokenModal />);

    await user.click(
      screen.getByRole("button", { name: "tokenStaging.confirm" }),
    );

    await waitFor(() => {
      expect(useStatusStore.getState().stagedToken).toBeNull();
      expect(toast.error).toHaveBeenCalledWith("tokenStaging.expiredError");
    });
  });

  it("should show error when confirm fails", async () => {
    const user = userEvent.setup();
    vi.mocked(CoreAPI.confirm).mockRejectedValueOnce(new Error("failed"));
    setStagedToken(true);

    render(<StagedTokenModal />);

    await user.click(
      screen.getByRole("button", { name: "tokenStaging.confirm" }),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("tokenStaging.confirmError");
    });
  });
});

import { act, renderHook, waitFor } from "@/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEVICE_LINK_TIMEOUT_MS,
  useDeviceLinking,
} from "@/hooks/useDeviceLinking";
import { NotSignedInError } from "@/lib/onlineApi";

const {
  mockCreateDeviceClaim,
  mockSettingsAuthClaim,
  mockSettingsAuthStatus,
  mockToastError,
  mockToastSuccess,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockCreateDeviceClaim: vi.fn(),
  mockSettingsAuthClaim: vi.fn(),
  mockSettingsAuthStatus: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    isAxiosError: (error: unknown) =>
      Boolean(
        error &&
        typeof error === "object" &&
        "isAxiosError" in error &&
        error.isAxiosError,
      ),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    settingsAuthClaim: mockSettingsAuthClaim,
    settingsAuthStatus: mockSettingsAuthStatus,
  },
  getDeviceAddress: () => "192.168.1.50",
  isRequestCancelledError: (error: unknown) =>
    error instanceof Error && /cancelled|aborted/i.test(error.message),
}));

vi.mock("@/lib/onlineApi", () => ({
  createDeviceClaim: mockCreateDeviceClaim,
  NotSignedInError: class NotSignedInError extends Error {},
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: mockLoggerError },
}));

const claim = {
  claim_url: "https://api.zaparoo.com/v1/device-claims/redeem",
  token: "zpc1_test",
  expires_at: "2026-08-04T10:00:00Z",
};

describe("useDeviceLinking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsAuthStatus.mockResolvedValue({ linked: false });
    mockCreateDeviceClaim.mockResolvedValue(claim);
    mockSettingsAuthClaim.mockResolvedValue({
      domains: ["https://api.zaparoo.com"],
    });
  });

  it("should report an existing device link", async () => {
    mockSettingsAuthStatus.mockResolvedValue({ linked: true });

    const { result } = renderHook(() => useDeviceLinking(true));

    await waitFor(() => expect(result.current.state).toBe("linked"));
    expect(mockSettingsAuthStatus).toHaveBeenCalledWith(
      { url: "https://api.zaparoo.com" },
      expect.any(AbortSignal),
    );
  });

  it("should clear linked state when device becomes unavailable", async () => {
    mockSettingsAuthStatus.mockResolvedValue({ linked: true });
    const { result, rerender } = renderHook(
      ({ enabled }) => useDeviceLinking(enabled),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.state).toBe("linked"));

    rerender({ enabled: false });
    await waitFor(() => expect(result.current.state).toBe("unavailable"));

    rerender({ enabled: true });
    expect(result.current.state).toBe("linked");
    expect(mockSettingsAuthStatus).toHaveBeenCalledTimes(1);
  });

  it("should create and redeem a one-shot claim", async () => {
    const { result } = renderHook(() => useDeviceLinking(true));
    await waitFor(() => expect(result.current.state).toBe("unlinked"));

    await act(async () => result.current.linkDevice());

    expect(mockCreateDeviceClaim).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(mockSettingsAuthClaim).toHaveBeenCalledWith(
      {
        claimUrl: claim.claim_url,
        token: claim.token,
      },
      expect.any(AbortSignal),
    );
    expect(result.current.state).toBe("linked");
    expect(mockToastSuccess).toHaveBeenCalledWith("online.deviceLink.success");
  });

  it("should create a fresh claim when retrying", async () => {
    mockCreateDeviceClaim.mockRejectedValueOnce(new Error("network failed"));
    const { result } = renderHook(() => useDeviceLinking(true));
    await waitFor(() => expect(result.current.state).toBe("unlinked"));

    await act(async () => result.current.linkDevice());
    expect(mockToastError).toHaveBeenCalledWith(
      "online.deviceLink.claimFailed",
    );

    await act(async () => result.current.linkDevice());

    expect(mockCreateDeviceClaim).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe("linked");
  });

  it("should surface claim rate limits", async () => {
    mockCreateDeviceClaim.mockRejectedValue({
      isAxiosError: true,
      response: { status: 429 },
    });
    const { result } = renderHook(() => useDeviceLinking(true));
    await waitFor(() => expect(result.current.state).toBe("unlinked"));

    await act(async () => result.current.linkDevice());

    expect(mockToastError).toHaveBeenCalledWith(
      "online.deviceLink.rateLimited",
    );
    expect(mockSettingsAuthClaim).not.toHaveBeenCalled();
  });

  it("should distinguish Core redemption failures", async () => {
    mockSettingsAuthClaim.mockRejectedValue(new Error("device offline"));
    const { result } = renderHook(() => useDeviceLinking(true));
    await waitFor(() => expect(result.current.state).toBe("unlinked"));

    await act(async () => result.current.linkDevice());

    expect(mockToastError).toHaveBeenCalledWith("online.deviceLink.linkFailed");
    expect(result.current.state).toBe("unlinked");
  });

  it("should time out a stalled device link", async () => {
    const { result } = renderHook(() => useDeviceLinking(true));
    await waitFor(() => expect(result.current.state).toBe("unlinked"));
    mockCreateDeviceClaim.mockImplementation(
      (signal: AbortSignal) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );

    vi.useFakeTimers();
    try {
      let linkPromise: Promise<void> | undefined;
      act(() => {
        linkPromise = result.current.linkDevice();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEVICE_LINK_TIMEOUT_MS + 1);
        await linkPromise;
      });

      expect(mockToastError).toHaveBeenCalledWith("online.deviceLink.timeout");
      expect(mockSettingsAuthClaim).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("should surface a signed-out claim failure", async () => {
    mockCreateDeviceClaim.mockRejectedValue(new NotSignedInError());
    const { result } = renderHook(() => useDeviceLinking(true));
    await waitFor(() => expect(result.current.state).toBe("unlinked"));

    await act(async () => result.current.linkDevice());

    expect(mockToastError).toHaveBeenCalledWith("online.notSignedInError");
    expect(mockSettingsAuthClaim).not.toHaveBeenCalled();
  });
});

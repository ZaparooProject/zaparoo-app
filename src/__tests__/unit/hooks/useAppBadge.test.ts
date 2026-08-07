import { act, renderHook, waitFor } from "@/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Badge } from "@capawesome/capacitor-badge";
import { useAppBadge } from "@/hooks/useAppBadge";
import { CoreAPI } from "@/lib/coreApi";
import { isNativePluginAvailable } from "@/lib/capacitorBridge";
import { InboxSeverity } from "@/lib/models";
import { useStatusStore } from "@/lib/store";
import { mockInboxMessage } from "@/test-utils/factories";

vi.mock("@capawesome/capacitor-badge", () => ({
  Badge: {
    isSupported: vi.fn(),
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("@/lib/capacitorBridge", () => ({
  isNativePluginAvailable: vi.fn(),
}));

describe("useAppBadge", () => {
  beforeEach(() => {
    CoreAPI.reset();
    vi.clearAllMocks();
    useStatusStore.setState({ inboxMessages: [] });
    vi.mocked(isNativePluginAvailable).mockReturnValue(true);
    vi.mocked(Badge.isSupported).mockResolvedValue({ isSupported: true });
    vi.mocked(Badge.checkPermissions).mockResolvedValue({
      display: "granted",
    });
    vi.mocked(Badge.requestPermissions).mockResolvedValue({
      display: "granted",
    });
    vi.mocked(Badge.set).mockResolvedValue();
  });

  it("should skip badge sync when the native plugin is unavailable", () => {
    vi.mocked(isNativePluginAvailable).mockReturnValue(false);

    renderHook(() => useAppBadge());

    expect(Badge.isSupported).not.toHaveBeenCalled();
  });

  it("should sync the app icon badge to the inbox count", async () => {
    useStatusStore.setState({
      inboxMessages: [
        mockInboxMessage({ id: 1, severity: InboxSeverity.Info }),
        mockInboxMessage({ id: 2, severity: InboxSeverity.Warning }),
      ],
    });

    renderHook(() => useAppBadge());

    await waitFor(() => {
      expect(Badge.set).toHaveBeenCalledWith({ count: 2 });
    });
  });

  it("should request permission when the first notification arrives", async () => {
    vi.mocked(Badge.checkPermissions).mockResolvedValue({ display: "prompt" });
    useStatusStore.setState({
      inboxMessages: [mockInboxMessage({ id: 1 })],
    });

    renderHook(() => useAppBadge());

    await waitFor(() => {
      expect(Badge.requestPermissions).toHaveBeenCalledOnce();
      expect(Badge.set).toHaveBeenCalledWith({ count: 1 });
    });
  });

  it("should not set the badge when permission is denied", async () => {
    vi.mocked(Badge.checkPermissions).mockResolvedValue({ display: "denied" });

    renderHook(() => useAppBadge());

    await waitFor(() => {
      expect(Badge.checkPermissions).toHaveBeenCalledOnce();
    });
    expect(Badge.requestPermissions).not.toHaveBeenCalled();
    expect(Badge.set).not.toHaveBeenCalled();
  });

  it("should serialize badge writes when the count changes during sync", async () => {
    let resolveFirstSet: (() => void) | undefined;
    const firstSet = new Promise<void>((resolve) => {
      resolveFirstSet = resolve;
    });
    vi.mocked(Badge.set)
      .mockImplementationOnce(() => firstSet)
      .mockResolvedValueOnce();
    useStatusStore.setState({
      inboxMessages: [mockInboxMessage({ id: 1 })],
    });
    renderHook(() => useAppBadge());

    await waitFor(() => {
      expect(Badge.set).toHaveBeenNthCalledWith(1, { count: 1 });
    });

    act(() => {
      useStatusStore.setState({
        inboxMessages: [
          mockInboxMessage({ id: 1 }),
          mockInboxMessage({ id: 2 }),
        ],
      });
    });

    expect(Badge.set).toHaveBeenCalledTimes(1);

    act(() => {
      resolveFirstSet?.();
    });

    await waitFor(() => {
      expect(Badge.set).toHaveBeenNthCalledWith(2, { count: 2 });
    });
  });

  it("should clear the badge after the inbox is emptied", async () => {
    useStatusStore.setState({
      inboxMessages: [mockInboxMessage({ id: 1 })],
    });
    renderHook(() => useAppBadge());

    await waitFor(() => {
      expect(Badge.set).toHaveBeenLastCalledWith({ count: 1 });
    });

    act(() => {
      useStatusStore.setState({ inboxMessages: [] });
    });

    await waitFor(() => {
      expect(Badge.set).toHaveBeenLastCalledWith({ count: 0 });
    });
  });
});

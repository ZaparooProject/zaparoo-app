import { act, renderHook, waitFor } from "@/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Badge } from "@capawesome/capacitor-badge";
import { useAppBadge } from "@/hooks/useAppBadge";
import { CoreAPI } from "@/lib/coreApi";
import { isNativePluginAvailable } from "@/lib/capacitorBridge";
import { InboxSeverity } from "@/lib/models";
import { usePreferencesStore } from "@/lib/preferencesStore";
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
  isPluginAvailable: vi.fn(() => true),
  isCapacitorPluginUnavailableError: vi.fn(() => false),
}));

describe("useAppBadge", () => {
  beforeEach(() => {
    CoreAPI.reset();
    vi.clearAllMocks();
    useStatusStore.setState({ inboxMessages: [] });
    usePreferencesStore.setState({ appBadgeEnabled: true });
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

  it("should show a rationale before requesting permission", async () => {
    vi.mocked(Badge.checkPermissions).mockResolvedValue({ display: "prompt" });
    useStatusStore.setState({
      inboxMessages: [mockInboxMessage({ id: 1 })],
    });

    const { result } = renderHook(() => useAppBadge());

    await waitFor(() => {
      expect(result.current.showPermissionRationale).toBe(true);
    });
    expect(Badge.requestPermissions).not.toHaveBeenCalled();
    expect(Badge.set).not.toHaveBeenCalled();
  });

  it("should set the current badge count after permission is granted", async () => {
    vi.mocked(Badge.checkPermissions).mockResolvedValue({ display: "prompt" });
    useStatusStore.setState({
      inboxMessages: [mockInboxMessage({ id: 1 })],
    });

    const { result } = renderHook(() => useAppBadge());

    await waitFor(() => {
      expect(result.current.showPermissionRationale).toBe(true);
    });

    act(() => {
      useStatusStore.setState({
        inboxMessages: [
          mockInboxMessage({ id: 1 }),
          mockInboxMessage({ id: 2 }),
        ],
      });
    });

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(Badge.requestPermissions).toHaveBeenCalledOnce();
    expect(Badge.set).toHaveBeenCalledWith({ count: 2 });
    expect(result.current.showPermissionRationale).toBe(false);
  });

  it("should disable badges when the native prompt is denied", async () => {
    vi.mocked(Badge.checkPermissions).mockResolvedValue({ display: "prompt" });
    vi.mocked(Badge.requestPermissions).mockResolvedValue({
      display: "denied",
    });
    useStatusStore.setState({
      inboxMessages: [mockInboxMessage({ id: 1 })],
    });

    const { result } = renderHook(() => useAppBadge());

    await waitFor(() => {
      expect(result.current.showPermissionRationale).toBe(true);
    });

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(usePreferencesStore.getState().appBadgeEnabled).toBe(false);
    expect(result.current.showPermissionDeniedHelp).toBe(true);
    expect(Badge.set).not.toHaveBeenCalled();
  });

  it("should persist opt-out when the rationale is declined", async () => {
    vi.mocked(Badge.checkPermissions).mockResolvedValue({ display: "prompt" });
    useStatusStore.setState({
      inboxMessages: [mockInboxMessage({ id: 1 })],
    });

    const { result } = renderHook(() => useAppBadge());

    await waitFor(() => {
      expect(result.current.showPermissionRationale).toBe(true);
    });

    act(() => {
      result.current.declinePermissionRationale();
    });

    expect(usePreferencesStore.getState().appBadgeEnabled).toBe(false);
    expect(result.current.showPermissionRationale).toBe(false);
    expect(Badge.requestPermissions).not.toHaveBeenCalled();
  });

  it("should show the rationale when badges are re-enabled in settings", async () => {
    vi.mocked(Badge.checkPermissions).mockResolvedValue({ display: "prompt" });
    usePreferencesStore.setState({ appBadgeEnabled: false });

    const { result } = renderHook(() => useAppBadge());

    expect(result.current.showPermissionRationale).toBe(false);

    act(() => {
      usePreferencesStore.getState().setAppBadgeEnabled(true);
    });

    await waitFor(() => {
      expect(result.current.showPermissionRationale).toBe(true);
    });
  });

  it("should clear an existing badge when disabled", async () => {
    useStatusStore.setState({
      inboxMessages: [mockInboxMessage({ id: 1 })],
    });
    usePreferencesStore.setState({ appBadgeEnabled: false });

    renderHook(() => useAppBadge());

    await waitFor(() => {
      expect(Badge.set).toHaveBeenCalledWith({ count: 0 });
    });
  });

  it("should explain how to recover when system permission is denied", async () => {
    vi.mocked(Badge.checkPermissions).mockResolvedValue({ display: "denied" });
    usePreferencesStore.setState({ appBadgeEnabled: false });

    const { result } = renderHook(() => useAppBadge());

    act(() => {
      usePreferencesStore.getState().setAppBadgeEnabled(true);
    });

    await waitFor(() => {
      expect(result.current.showPermissionDeniedHelp).toBe(true);
    });
    expect(usePreferencesStore.getState().appBadgeEnabled).toBe(false);
  });

  it("should disable badges when permission is denied", async () => {
    vi.mocked(Badge.checkPermissions).mockResolvedValue({ display: "denied" });

    renderHook(() => useAppBadge());

    await waitFor(() => {
      expect(usePreferencesStore.getState().appBadgeEnabled).toBe(false);
    });
    expect(Badge.checkPermissions).toHaveBeenCalled();
    expect(Badge.requestPermissions).not.toHaveBeenCalled();
    expect(Badge.set).not.toHaveBeenCalled();
    expect(usePreferencesStore.getState().appBadgeEnabled).toBe(false);
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

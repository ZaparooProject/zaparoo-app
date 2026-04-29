import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "../../../test-utils";

const {
  mockGetDeviceAddress,
  mockSetDeviceAddress,
  mockCoreReset,
  mockPreferencesRemove,
  mockResetConnectionState,
  mockSetTargetDeviceAddress,
  mockAddDeviceHistory,
  mockUpdateDeviceHistoryMeta,
  storeState,
} = vi.hoisted(() => ({
  mockGetDeviceAddress: vi.fn(() => "192.168.1.10:7497"),
  mockSetDeviceAddress: vi.fn(),
  mockCoreReset: vi.fn(),
  mockPreferencesRemove: vi.fn().mockResolvedValue(undefined),
  mockResetConnectionState: vi.fn(),
  mockSetTargetDeviceAddress: vi.fn(),
  mockAddDeviceHistory: vi.fn(),
  mockUpdateDeviceHistoryMeta: vi.fn(),
  storeState: {
    resetConnectionState: vi.fn(),
    setTargetDeviceAddress: vi.fn(),
    addDeviceHistory: vi.fn(),
    updateDeviceHistoryMeta: vi.fn(),
  },
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    remove: mockPreferencesRemove,
  },
}));

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: { reset: mockCoreReset },
  getDeviceAddress: () => mockGetDeviceAddress(),
  setDeviceAddress: (v: string) => mockSetDeviceAddress(v),
}));

vi.mock("@/lib/store", () => ({
  useStatusStore: (selector: (s: typeof storeState) => unknown) =>
    selector({
      resetConnectionState: mockResetConnectionState,
      setTargetDeviceAddress: mockSetTargetDeviceAddress,
      addDeviceHistory: mockAddDeviceHistory,
      updateDeviceHistoryMeta: mockUpdateDeviceHistoryMeta,
    } as unknown as typeof storeState),
}));

import { useSelectDevice } from "@/hooks/useSelectDevice";

describe("useSelectDevice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDeviceAddress.mockReturnValue("192.168.1.10:7497");
  });

  describe("selectDevice", () => {
    it("short-circuits when the new address equals the current address", () => {
      const { result } = renderHook(() => useSelectDevice());

      act(() => result.current.selectDevice("192.168.1.10:7497"));

      expect(mockSetDeviceAddress).not.toHaveBeenCalled();
      expect(mockResetConnectionState).not.toHaveBeenCalled();
      expect(mockSetTargetDeviceAddress).not.toHaveBeenCalled();
      expect(mockCoreReset).not.toHaveBeenCalled();
      expect(mockPreferencesRemove).not.toHaveBeenCalled();
    });

    it("resets connection, target, API state, and search filters when switching devices", () => {
      const { result } = renderHook(() => useSelectDevice());

      act(() => result.current.selectDevice("10.0.0.5:7497"));

      expect(mockSetDeviceAddress).toHaveBeenCalledWith("10.0.0.5:7497");
      expect(mockResetConnectionState).toHaveBeenCalledTimes(1);
      expect(mockSetTargetDeviceAddress).toHaveBeenCalledWith("10.0.0.5:7497");
      expect(mockCoreReset).toHaveBeenCalledTimes(1);
      expect(mockPreferencesRemove).toHaveBeenCalledWith({
        key: "searchSystem",
      });
      expect(mockPreferencesRemove).toHaveBeenCalledWith({
        key: "searchTags",
      });
    });
  });

  describe("selectScanDevice", () => {
    it("captures scan metadata immediately after selecting a new device", () => {
      const { result } = renderHook(() => useSelectDevice());

      act(() =>
        result.current.selectScanDevice({
          address: "10.0.0.5:7497",
          name: "Living Room",
          platform: "linux",
          version: "1.2.3",
        }),
      );

      expect(mockSetDeviceAddress).toHaveBeenCalledWith("10.0.0.5:7497");
      expect(mockAddDeviceHistory).toHaveBeenCalledWith("10.0.0.5:7497");
      expect(mockUpdateDeviceHistoryMeta).toHaveBeenCalledWith(
        "10.0.0.5:7497",
        {
          name: "Living Room",
          platform: "linux",
          version: "1.2.3",
        },
      );
    });

    it("still records metadata when the scan device matches the current address", () => {
      // selectDevice short-circuits, but selectScanDevice still wants to capture
      // freshly-discovered metadata onto the existing history entry.
      const { result } = renderHook(() => useSelectDevice());

      act(() =>
        result.current.selectScanDevice({
          address: "192.168.1.10:7497",
          name: "Office",
          platform: "linux",
          version: "1.0.0",
        }),
      );

      expect(mockResetConnectionState).not.toHaveBeenCalled();
      expect(mockAddDeviceHistory).toHaveBeenCalledWith("192.168.1.10:7497");
      expect(mockUpdateDeviceHistoryMeta).toHaveBeenCalledWith(
        "192.168.1.10:7497",
        {
          name: "Office",
          platform: "linux",
          version: "1.0.0",
        },
      );
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "../../../test-utils";

const {
  mockGetDeviceAddress,
  mockSetDeviceAddress,
  mockValidateDeviceAddress,
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
  mockValidateDeviceAddress: vi.fn((address: string): unknown => ({
    ok: true,
    address,
    host: address.split(":")[0] ?? address,
    port: 7497,
    wsUrl: `ws://${address}/api/v0.1`,
  })),
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
  validateDeviceAddress: (v: string) => mockValidateDeviceAddress(v),
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
    mockValidateDeviceAddress.mockImplementation((address: string) => ({
      ok: true,
      address,
      host: address.split(":")[0] ?? address,
      port: 7497,
      wsUrl: `ws://${address}/api/v0.1`,
    }));
  });

  describe("selectDevice", () => {
    it("should short-circuit when the new address equals the current address", () => {
      const { result } = renderHook(() => useSelectDevice());

      let selectionResult: unknown;
      act(() => {
        selectionResult = result.current.selectDevice("192.168.1.10:7497");
      });

      expect(mockSetDeviceAddress).not.toHaveBeenCalled();
      expect(mockResetConnectionState).not.toHaveBeenCalled();
      expect(mockSetTargetDeviceAddress).not.toHaveBeenCalled();
      expect(mockCoreReset).not.toHaveBeenCalled();
      expect(mockPreferencesRemove).not.toHaveBeenCalled();
      expect(selectionResult).toMatchObject({
        ok: true,
        address: "192.168.1.10:7497",
      });
    });

    it("should reset connection, target, API state, and search filters when switching devices", () => {
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

    it("should save normalized address when switching devices", () => {
      mockValidateDeviceAddress.mockReturnValue({
        ok: true,
        address: "10.0.0.5:8080",
        host: "10.0.0.5",
        port: 8080,
        wsUrl: "ws://10.0.0.5:8080/api/v0.1",
      });
      const { result } = renderHook(() => useSelectDevice());

      act(() => result.current.selectDevice(" http://10.0.0.5:8080/api/v0.1 "));

      expect(mockSetDeviceAddress).toHaveBeenCalledWith("10.0.0.5:8080");
      expect(mockSetTargetDeviceAddress).toHaveBeenCalledWith("10.0.0.5:8080");
    });

    it("should not save or reconnect when address is invalid", () => {
      mockValidateDeviceAddress.mockReturnValue({
        ok: false,
        errorKey: "settings.deviceAddressInvalid",
        message: "Invalid device address",
      });
      const { result } = renderHook(() => useSelectDevice());

      let selectionResult: unknown;
      act(() => {
        selectionResult = result.current.selectDevice("192.168.1.286");
      });

      expect(selectionResult).toMatchObject({
        ok: false,
        errorKey: "settings.deviceAddressInvalid",
      });
      expect(mockSetDeviceAddress).not.toHaveBeenCalled();
      expect(mockResetConnectionState).not.toHaveBeenCalled();
      expect(mockSetTargetDeviceAddress).not.toHaveBeenCalled();
      expect(mockCoreReset).not.toHaveBeenCalled();
      expect(mockPreferencesRemove).not.toHaveBeenCalled();
    });
  });

  describe("selectScanDevice", () => {
    it("should capture scan metadata immediately after selecting a new device", () => {
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

    it("should still record metadata when the scan device matches the current address", () => {
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

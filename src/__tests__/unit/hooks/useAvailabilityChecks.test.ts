import { renderHook, waitFor } from "../../../test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { CapacitorShake } from "@capgo/capacitor-shake";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useNfcAvailabilityCheck } from "@/hooks/useNfcAvailabilityCheck";
import { useCameraAvailabilityCheck } from "@/hooks/useCameraAvailabilityCheck";
import { useAccelerometerAvailabilityCheck } from "@/hooks/useAccelerometerAvailabilityCheck";

describe("Availability Check Hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store to initial state
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      nfcAvailable: false,
      _nfcAvailabilityHydrated: false,
      cameraAvailable: false,
      _cameraAvailabilityHydrated: false,
      accelerometerAvailable: false,
      _accelerometerAvailabilityHydrated: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("useNfcAvailabilityCheck", () => {
    it("should set available=false and hydrated=true on web platform", async () => {
      // Arrange
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

      // Act
      renderHook(() => useNfcAvailabilityCheck());

      // Assert
      await waitFor(() => {
        expect(usePreferencesStore.getState().nfcAvailable).toBe(false);
        expect(usePreferencesStore.getState()._nfcAvailabilityHydrated).toBe(
          true,
        );
      });
    });

    it("should set available=true based on plugin response on native", async () => {
      // Arrange
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: true, hce: false });

      // Act
      renderHook(() => useNfcAvailabilityCheck());

      // Assert
      await waitFor(() => {
        expect(usePreferencesStore.getState().nfcAvailable).toBe(true);
        expect(usePreferencesStore.getState()._nfcAvailabilityHydrated).toBe(
          true,
        );
      });
      expect(Nfc.isAvailable).toHaveBeenCalled();
    });

    it("should set available=false based on plugin response on native", async () => {
      // Arrange
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: false, hce: false });

      // Act
      renderHook(() => useNfcAvailabilityCheck());

      // Assert
      await waitFor(() => {
        expect(usePreferencesStore.getState().nfcAvailable).toBe(false);
        expect(usePreferencesStore.getState()._nfcAvailabilityHydrated).toBe(
          true,
        );
      });
    });

    it("should set available=false on plugin error", async () => {
      // Arrange
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Nfc.isAvailable).mockRejectedValue(new Error("Plugin error"));

      // Act
      renderHook(() => useNfcAvailabilityCheck());

      // Assert
      await waitFor(() => {
        expect(usePreferencesStore.getState().nfcAvailable).toBe(false);
        expect(usePreferencesStore.getState()._nfcAvailabilityHydrated).toBe(
          true,
        );
      });
    });
  });

  describe("useCameraAvailabilityCheck", () => {
    it("should set available=false and hydrated=true on web platform", async () => {
      // Arrange
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

      // Act
      renderHook(() => useCameraAvailabilityCheck());

      // Assert
      await waitFor(() => {
        expect(usePreferencesStore.getState().cameraAvailable).toBe(false);
        expect(usePreferencesStore.getState()._cameraAvailabilityHydrated).toBe(
          true,
        );
      });
    });

    it("should set available=true based on plugin response on native", async () => {
      // Arrange
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
      vi.mocked(BarcodeScanner.isSupported).mockResolvedValue({
        supported: true,
      });

      // Act
      renderHook(() => useCameraAvailabilityCheck());

      // Assert
      await waitFor(() => {
        expect(usePreferencesStore.getState().cameraAvailable).toBe(true);
        expect(usePreferencesStore.getState()._cameraAvailabilityHydrated).toBe(
          true,
        );
      });
      expect(BarcodeScanner.isSupported).toHaveBeenCalled();
    });

    it("should set available=false based on plugin response on native", async () => {
      // Arrange
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
      vi.mocked(BarcodeScanner.isSupported).mockResolvedValue({
        supported: false,
      });

      // Act
      renderHook(() => useCameraAvailabilityCheck());

      // Assert
      await waitFor(() => {
        expect(usePreferencesStore.getState().cameraAvailable).toBe(false);
        expect(usePreferencesStore.getState()._cameraAvailabilityHydrated).toBe(
          true,
        );
      });
    });

    it("should set available=false on plugin error", async () => {
      // Arrange
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
      vi.mocked(BarcodeScanner.isSupported).mockRejectedValue(
        new Error("Plugin error"),
      );

      // Act
      renderHook(() => useCameraAvailabilityCheck());

      // Assert
      await waitFor(() => {
        expect(usePreferencesStore.getState().cameraAvailable).toBe(false);
        expect(usePreferencesStore.getState()._cameraAvailabilityHydrated).toBe(
          true,
        );
      });
    });

    it("should check and install Google Barcode Scanner module on Android", async () => {
      // Arrange
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
      vi.mocked(
        BarcodeScanner.isGoogleBarcodeScannerModuleAvailable,
      ).mockResolvedValue({ available: false });
      vi.mocked(
        BarcodeScanner.installGoogleBarcodeScannerModule,
      ).mockResolvedValue(undefined);
      vi.mocked(BarcodeScanner.isSupported).mockResolvedValue({
        supported: true,
      });

      // Act
      renderHook(() => useCameraAvailabilityCheck());

      // Assert
      await waitFor(() => {
        expect(usePreferencesStore.getState().cameraAvailable).toBe(true);
      });
      expect(
        BarcodeScanner.isGoogleBarcodeScannerModuleAvailable,
      ).toHaveBeenCalled();
      expect(
        BarcodeScanner.installGoogleBarcodeScannerModule,
      ).toHaveBeenCalled();
    });
  });

  describe("useAccelerometerAvailabilityCheck", () => {
    it("should set available=false and hydrated=true on web platform", async () => {
      // Arrange
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

      // Act
      renderHook(() => useAccelerometerAvailabilityCheck());

      // Assert
      await waitFor(() => {
        expect(usePreferencesStore.getState().accelerometerAvailable).toBe(
          false,
        );
        expect(
          usePreferencesStore.getState()._accelerometerAvailabilityHydrated,
        ).toBe(true);
      });
    });

    it("should set available=true when listener can be added on native", async () => {
      // Arrange
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      const mockRemove = vi.fn();
      vi.mocked(CapacitorShake.addListener).mockResolvedValue({
        remove: mockRemove,
      });

      // Act
      renderHook(() => useAccelerometerAvailabilityCheck());

      // Assert
      await waitFor(() => {
        expect(usePreferencesStore.getState().accelerometerAvailable).toBe(
          true,
        );
        expect(
          usePreferencesStore.getState()._accelerometerAvailabilityHydrated,
        ).toBe(true);
      });
      expect(CapacitorShake.addListener).toHaveBeenCalledWith(
        "shake",
        expect.any(Function),
      );
      expect(mockRemove).toHaveBeenCalled();
    });

    it("should set available=false on plugin error", async () => {
      // Arrange
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(CapacitorShake.addListener).mockRejectedValue(
        new Error("Plugin error"),
      );

      // Act
      renderHook(() => useAccelerometerAvailabilityCheck());

      // Assert
      await waitFor(() => {
        expect(usePreferencesStore.getState().accelerometerAvailable).toBe(
          false,
        );
        expect(
          usePreferencesStore.getState()._accelerometerAvailabilityHydrated,
        ).toBe(true);
      });
    });
  });
});

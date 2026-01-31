import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "../../../test-utils";
import { useTextZoom } from "@/hooks/useTextZoom";
import { Capacitor } from "@capacitor/core";
import { TextZoom } from "@capacitor/text-zoom";

describe("useTextZoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("on web platform", () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    });

    it("should return default zoom level of 1.0", () => {
      // Arrange & Act
      const { result } = renderHook(() => useTextZoom());

      // Assert
      expect(result.current.zoomLevel).toBe(1.0);
    });

    it("should indicate text zoom is not available", () => {
      // Arrange & Act
      const { result } = renderHook(() => useTextZoom());

      // Assert
      expect(result.current.isAvailable).toBe(false);
    });

    it("should not be loading on web", () => {
      // Arrange & Act
      const { result } = renderHook(() => useTextZoom());

      // Assert
      expect(result.current.isLoading).toBe(false);
    });

    it("should return 1.0 from getPreferred on web", async () => {
      // Arrange
      const { result } = renderHook(() => useTextZoom());

      // Act
      const preferred = await result.current.getPreferred();

      // Assert
      expect(preferred).toBe(1.0);
      expect(TextZoom.getPreferred).not.toHaveBeenCalled();
    });

    it("should be a no-op for set on web", async () => {
      // Arrange
      const { result } = renderHook(() => useTextZoom());

      // Act
      await result.current.set(1.5);

      // Assert
      expect(TextZoom.set).not.toHaveBeenCalled();
      expect(result.current.zoomLevel).toBe(1.0); // Unchanged
    });
  });

  describe("on native platform", () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    });

    it("should indicate loading initially", () => {
      // Arrange & Act
      const { result } = renderHook(() => useTextZoom());

      // Assert - initially loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isAvailable).toBe(true);
    });

    it("should load current zoom level on mount", async () => {
      // Arrange
      vi.mocked(TextZoom.get).mockResolvedValue({ value: 1.25 });

      // Act
      const { result } = renderHook(() => useTextZoom());

      // Assert
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.zoomLevel).toBe(1.25);
      expect(result.current.isAvailable).toBe(true);
    });

    it("should handle error when loading zoom level fails", async () => {
      // Arrange
      vi.mocked(TextZoom.get).mockRejectedValue(new Error("Plugin error"));

      // Act
      const { result } = renderHook(() => useTextZoom());

      // Assert - should still complete loading but keep default values
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.zoomLevel).toBe(1.0); // Default value
    });

    it("should get preferred zoom level from system", async () => {
      // Arrange
      vi.mocked(TextZoom.getPreferred).mockResolvedValue({ value: 1.5 });
      const { result } = renderHook(() => useTextZoom());

      // Act
      const preferred = await result.current.getPreferred();

      // Assert
      expect(preferred).toBe(1.5);
      expect(TextZoom.getPreferred).toHaveBeenCalled();
    });

    it("should return 1.0 when getPreferred fails", async () => {
      // Arrange
      vi.mocked(TextZoom.getPreferred).mockRejectedValue(
        new Error("Plugin error"),
      );
      const { result } = renderHook(() => useTextZoom());

      // Act
      const preferred = await result.current.getPreferred();

      // Assert
      expect(preferred).toBe(1.0);
    });

    it("should set zoom level", async () => {
      // Arrange
      vi.mocked(TextZoom.get).mockResolvedValue({ value: 1.0 });
      vi.mocked(TextZoom.set).mockResolvedValue(undefined);
      const { result } = renderHook(() => useTextZoom());

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Act
      await act(async () => {
        await result.current.set(1.75);
      });

      // Assert
      expect(TextZoom.set).toHaveBeenCalledWith({ value: 1.75 });
      expect(result.current.zoomLevel).toBe(1.75);
    });

    it("should handle error when set fails", async () => {
      // Arrange
      vi.mocked(TextZoom.get).mockResolvedValue({ value: 1.0 });
      vi.mocked(TextZoom.set).mockRejectedValue(new Error("Plugin error"));
      const { result } = renderHook(() => useTextZoom());

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Act - should not throw
      await act(async () => {
        await result.current.set(2.0);
      });

      // Assert - zoom level should remain unchanged
      expect(result.current.zoomLevel).toBe(1.0);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { act, render, renderHook, screen } from "@/test-utils";
import { useAppUi } from "@/hooks/useAppUi";
import { useAppPreviewStore } from "@/lib/appPreviewStore";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { cancelSession, readTag, Status } from "@/lib/nfc";
import { ScanResult } from "@/lib/models";
import {
  isWriteModalOpen,
  useNfcWriter,
  WriteAction,
} from "@/lib/writeNfcHook";
import { ScanActions } from "@/components/home/ScanActions";
import { CoreAPI } from "@/lib/coreApi";

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

function enablePreview() {
  act(() => {
    useAppPreviewStore.setState({ enabled: true });
  });
}

describe("app preview", () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
  });

  describe("useAppUi", () => {
    it("reports no app UI on the web without preview", () => {
      const { result } = renderHook(() => useAppUi());

      expect(result.current.enabled).toBe(false);
      expect(result.current.nfc).toBe(false);
      expect(result.current.camera).toBe(false);
      expect(result.current.accelerometer).toBe(false);
    });

    it("reports every capability once preview is enabled", () => {
      const { result } = renderHook(() => useAppUi());

      enablePreview();

      expect(result.current.enabled).toBe(true);
      expect(result.current.preview).toBe(true);
      expect(result.current.nfc).toBe(true);
      expect(result.current.camera).toBe(true);
      expect(result.current.accelerometer).toBe(true);
    });

    it("keeps real capability flags authoritative on device", () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      act(() => {
        usePreferencesStore.setState({
          nfcAvailable: false,
          cameraAvailable: true,
        });
      });

      const { result } = renderHook(() => useAppUi());

      expect(result.current.enabled).toBe(true);
      expect(result.current.preview).toBe(false);
      expect(result.current.nfc).toBe(false);
      expect(result.current.camera).toBe(true);
    });
  });

  describe("app-only screens", () => {
    const actionProps = {
      layout: {
        leading: "nfc" as const,
        alternate: "camera" as const,
        canScan: true,
        showEmptyState: false,
      },
      scanSession: false,
      scanStatus: ScanResult.Default,
      nfcEnabled: true,
      onTapScan: vi.fn(),
      onCameraScan: vi.fn(),
      onOpenNfcSettings: vi.fn(),
    };

    it("hides the phone's scan controls in a plain browser", () => {
      render(<ScanActions {...actionProps} />);

      expect(
        screen.queryByRole("button", { name: "scan.tapTag" }),
      ).not.toBeInTheDocument();
    });

    it("renders the phone's scan controls in preview", () => {
      enablePreview();

      render(<ScanActions {...actionProps} />);

      expect(
        screen.getByRole("button", { name: "scan.tapTag" }),
      ).toBeInTheDocument();
    });
  });

  describe("simulated scans", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("hands the home scan a simulated tag", async () => {
      useAppPreviewStore.setState({ enabled: true, nfcResult: "success" });

      const scan = readTag();
      await vi.advanceTimersByTimeAsync(1500);
      const result = await scan;

      expect(result.status).toBe(Status.Success);
      expect(result.info.tag?.text).toBe("**launch.system:snes");
    });

    it("ends a waiting scan through cancelSession", async () => {
      useAppPreviewStore.setState({ enabled: true, nfcResult: "hold" });

      const scan = readTag();
      await vi.advanceTimersByTimeAsync(2000);
      await cancelSession();
      const result = await scan;

      expect(result.status).toBe(Status.Cancelled);
    });

    it("bounds a waiting scan like a reader-mode session", async () => {
      useAppPreviewStore.setState({ enabled: true, nfcResult: "hold" });

      const scan = readTag();
      await vi.advanceTimersByTimeAsync(60000);
      const result = await scan;

      expect(result.status).toBe(Status.Cancelled);
    });
  });

  describe("simulated NFC writes", () => {
    beforeEach(() => {
      vi.spyOn(CoreAPI, "write");
      vi.useFakeTimers();
    });

    it("settles a write without touching the NFC plugin or Core", async () => {
      enablePreview();
      act(() => {
        useAppPreviewStore.setState({ nfcResult: "success" });
      });
      const { result } = renderHook(() => useNfcWriter());

      act(() => {
        void result.current.write(WriteAction.Write, "**launch.system:snes");
      });
      await act(() => vi.advanceTimersByTimeAsync(1500));

      expect(result.current.status).toBe(Status.Success);
      expect(result.current.writing).toBe(false);
      expect(Nfc.write).not.toHaveBeenCalled();
      expect(CoreAPI.write).not.toHaveBeenCalled();
    });

    it("surfaces the verification failure state for the write modal", async () => {
      enablePreview();
      act(() => {
        useAppPreviewStore.setState({ nfcResult: "verifyFailed" });
      });
      const { result } = renderHook(() => useNfcWriter());

      act(() => {
        void result.current.write(WriteAction.Write, "**launch.system:snes");
      });
      await act(() => vi.advanceTimersByTimeAsync(1500));

      expect(result.current.verifyError).not.toBeNull();
      expect(result.current.status).toBe(Status.Error);
    });

    it("prompts for a re-tap before settling", async () => {
      enablePreview();
      act(() => {
        useAppPreviewStore.setState({ nfcResult: "retap" });
      });
      const { result } = renderHook(() => useNfcWriter());

      act(() => {
        void result.current.write(WriteAction.Write, "**launch.system:snes");
      });
      await act(() => vi.advanceTimersByTimeAsync(1000));

      expect(result.current.retapRequired).toBe(true);

      await act(() => vi.advanceTimersByTimeAsync(1500));
      expect(result.current.status).toBe(Status.Success);
    });

    it("waits on the scan screen until the write is cancelled", async () => {
      enablePreview();
      const { result } = renderHook(() => useNfcWriter());

      act(() => {
        void result.current.write(WriteAction.Write, "**launch.system:snes");
      });
      await act(() => vi.advanceTimersByTimeAsync(5000));

      expect(result.current.writing).toBe(true);
      expect(isWriteModalOpen(true, result.current)).toBe(true);

      await act(async () => {
        await result.current.end();
      });

      expect(result.current.writing).toBe(false);
      expect(isWriteModalOpen(true, result.current)).toBe(false);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "../../../test-utils";
import { useScanOperations } from "@/hooks/useScanOperations";
import {
  CAMERA_IDLE_STOP_MS,
  CAMERA_SINGLE_CLOSE_MS,
  SCANNER_BODY_CLASS,
} from "@/hooks/useContinuousCamera";
import { sessionManager } from "@/lib/nfc";
import { CoreAPI } from "@/lib/coreApi";
import { launchFeedback, type LaunchFeedbackEvent } from "@/lib/launchFeedback";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { Capacitor } from "@capacitor/core";
import {
  BarcodeScanner,
  BarcodeFormat,
  BarcodeValueType,
} from "@capacitor-mlkit/barcode-scanning";
import {
  __barcodeListenerCount,
  __emitBarcodesScanned,
  __resetBarcodeScannerMock,
} from "../../../../__mocks__/@capacitor-mlkit/barcode-scanning";

vi.mock("@/lib/logger", () => ({
  logger: { log: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const barcode = (rawValue: string) => ({
  rawValue,
  displayValue: rawValue,
  format: BarcodeFormat.QrCode,
  valueType: BarcodeValueType.Text,
  cornerPoints: [
    [100, 100],
    [300, 100],
    [300, 300],
    [100, 300],
  ],
});

describe("useScanOperations continuous camera", () => {
  const nfcWriter = {
    write: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    writing: false,
    result: null,
    status: null,
    verifyError: null,
    getVerifyError: vi.fn(() => null),
    retapRequired: false,
  };

  const props = {
    connected: true,
    hasData: true,
    launcherAccess: true,
    setLastToken: vi.fn(),
    setProPurchaseModalOpen: vi.fn(),
    setWriteOpen: vi.fn(),
    nfcWriter,
  };

  let runSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    __resetBarcodeScannerMock();
    sessionManager.shouldRestart = false;
    sessionManager.launchOnScan = true;
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    usePreferencesStore.setState({ continuousCamera: true });
    runSpy = vi.spyOn(CoreAPI, "run").mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.classList.remove(SCANNER_BODY_CLASS);
  });

  const openCamera = async () => {
    const view = renderHook(() => useScanOperations(props));
    await act(async () => {
      await view.result.current.handleCameraScan();
    });
    return view;
  };

  const emit = async (...codes: string[]) => {
    await act(async () => {
      __emitBarcodesScanned(codes.map(barcode));
      await vi.advanceTimersByTimeAsync(0);
    });
  };

  describe("with continuous camera off", () => {
    beforeEach(() => {
      usePreferencesStore.setState({ continuousCamera: false });
    });

    it("opens the app's own camera view, not the system sheet", async () => {
      const { result } = await openCamera();

      expect(BarcodeScanner.startScan).toHaveBeenCalled();
      expect(BarcodeScanner.scan).not.toHaveBeenCalled();
      expect(result.current.continuousCamera.active).toBe(true);
    });

    it("closes shortly after the first code launches", async () => {
      const { result } = await openCamera();

      await emit("game-a");
      expect(runSpy).toHaveBeenCalledTimes(1);
      await act(async () => {
        launchFeedback.mediaStarted({
          name: "Game A",
          systemId: "SNES",
          systemName: "SNES",
          path: "SNES/Game A.sfc",
        });
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.continuousCamera.result?.phase).toBe("launched");
      expect(result.current.continuousCamera.active).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(CAMERA_SINGLE_CLOSE_MS);
      });
      expect(result.current.continuousCamera.active).toBe(false);
      expect(BarcodeScanner.stopScan).toHaveBeenCalled();
    });

    it("ignores other codes while the first is launching", async () => {
      await openCamera();

      await emit("game-a");
      await emit("game-b");

      expect(runSpy).toHaveBeenCalledTimes(1);
    });

    it("stays open after a failed code so another can be scanned", async () => {
      runSpy.mockRejectedValueOnce(new Error("launcher not found"));
      const { result } = await openCamera();

      await emit("game-a");
      expect(result.current.continuousCamera.result?.phase).toBe("failed");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(CAMERA_SINGLE_CLOSE_MS);
      });
      expect(result.current.continuousCamera.active).toBe(true);

      await emit("game-b");
      expect(runSpy).toHaveBeenCalledTimes(2);
    });

    it("falls back to the system sheet on Android when camera access is refused", async () => {
      vi.mocked(BarcodeScanner.checkPermissions).mockResolvedValueOnce({
        camera: "denied",
      });
      vi.mocked(BarcodeScanner.requestPermissions).mockResolvedValueOnce({
        camera: "denied",
      });
      const { result } = await openCamera();

      expect(BarcodeScanner.scan).toHaveBeenCalled();
      expect(BarcodeScanner.startScan).not.toHaveBeenCalled();
      expect(result.current.continuousCamera.active).toBe(false);
    });
  });

  it("launches a second new code from the same frame on a later frame", async () => {
    await openCamera();

    await emit("game-a", "game-b");
    expect(runSpy).toHaveBeenCalledTimes(1);

    await emit("game-a", "game-b");
    expect(runSpy).toHaveBeenCalledTimes(2);
    expect(runSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      expect.objectContaining({ text: "game-a" }),
      expect.objectContaining({ text: "game-b" }),
    ]);
  });

  it("drops a failure that lands after the camera was closed and reopened", async () => {
    let failFirst: (error: Error) => void = () => {};
    runSpy.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failFirst = reject;
        }) as never,
    );
    const { result } = await openCamera();
    await emit("game-a");

    await act(async () => {
      result.current.continuousCamera.stop();
      await result.current.handleCameraScan();
    });
    await act(async () => {
      failFirst(new Error("launcher not found"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.continuousCamera.active).toBe(true);
    expect(result.current.continuousCamera.result).toBeNull();
  });

  it("shows refused camera access on the camera control on iPhone", async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
    usePreferencesStore.setState({ continuousCamera: false });
    vi.mocked(BarcodeScanner.checkPermissions).mockResolvedValueOnce({
      camera: "denied",
    });
    vi.mocked(BarcodeScanner.requestPermissions).mockResolvedValueOnce({
      camera: "denied",
    });
    const { result } = await openCamera();

    expect(BarcodeScanner.scan).not.toHaveBeenCalled();
    expect(result.current.scanError).toEqual({
      message: "create.mappings.editor.cameraPermissionDenied",
      source: "camera",
      prefill: null,
    });
  });

  it("starts the live camera behind a transparent app when on", async () => {
    const { result } = await openCamera();

    expect(BarcodeScanner.startScan).toHaveBeenCalled();
    expect(BarcodeScanner.scan).not.toHaveBeenCalled();
    expect(result.current.continuousCamera.active).toBe(true);
    expect(document.body).toHaveClass(SCANNER_BODY_CLASS);
    expect(__barcodeListenerCount("barcodesScanned")).toBe(1);
  });

  it("launches a code with the read beat and camera source", async () => {
    const events: LaunchFeedbackEvent[] = [];
    launchFeedback.subscribe((event) => events.push(event));
    const { result } = await openCamera();

    await emit("**launch.system:snes");

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: "**launch.system:snes" }),
    );
    expect(events.map((event) => [event.kind, event.source])).toEqual([
      ["read", "camera"],
      ["started", "camera"],
    ]);
    expect(result.current.continuousCamera.result).toMatchObject({
      phase: "launching",
      code: "**launch.system:snes",
    });
    expect(result.current.continuousCamera.outline).toEqual([
      [100, 100],
      [300, 100],
      [300, 300],
      [100, 300],
    ]);
  });

  it("ignores a code while it stays in view", async () => {
    await openCamera();

    await emit("game-a");
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      await emit("game-a");
    }

    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("launches the same code again after 2 s out of frame", async () => {
    await openCamera();

    await emit("game-a");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await emit("game-a");
    expect(runSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await emit("game-a");
    expect(runSpy).toHaveBeenCalledTimes(2);
  });

  it("launches a different code straight away", async () => {
    await openCamera();

    await emit("game-a");
    await emit("game-a", "game-b");

    expect(runSpy).toHaveBeenCalledTimes(2);
    expect(runSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: "game-b" }),
    );
  });

  it("stops after a minute without a scan and says why", async () => {
    const { result } = await openCamera();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAMERA_IDLE_STOP_MS - 1000);
    });
    expect(result.current.continuousCamera.active).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.continuousCamera.active).toBe(false);
    expect(result.current.continuousCamera.idleStopped).toBe(true);
    expect(BarcodeScanner.stopScan).toHaveBeenCalled();
    expect(document.body).not.toHaveClass(SCANNER_BODY_CLASS);
  });

  it("restarts the minute on every new code", async () => {
    const { result } = await openCamera();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAMERA_IDLE_STOP_MS - 1000);
    });
    await emit("game-a");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAMERA_IDLE_STOP_MS - 1000);
    });

    expect(result.current.continuousCamera.active).toBe(true);
  });

  it("clears the stopped notice when the camera opens again", async () => {
    const { result } = await openCamera();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAMERA_IDLE_STOP_MS);
    });
    expect(result.current.continuousCamera.idleStopped).toBe(true);

    await act(async () => {
      await result.current.handleCameraScan();
    });

    expect(result.current.continuousCamera.idleStopped).toBe(false);
  });

  it("removes listeners and the body class when stopped", async () => {
    const { result } = await openCamera();

    act(() => {
      result.current.continuousCamera.stop();
    });

    expect(__barcodeListenerCount("barcodesScanned")).toBe(0);
    expect(__barcodeListenerCount("scanError")).toBe(0);
    expect(document.body).not.toHaveClass(SCANNER_BODY_CLASS);
    expect(BarcodeScanner.stopScan).toHaveBeenCalled();
    expect(result.current.continuousCamera.idleStopped).toBe(false);
  });

  it("removes listeners and the body class on unmount", async () => {
    const { unmount } = await openCamera();

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(__barcodeListenerCount("barcodesScanned")).toBe(0);
    expect(document.body).not.toHaveClass(SCANNER_BODY_CLASS);
    expect(BarcodeScanner.stopScan).toHaveBeenCalled();
  });

  it("closes the camera when Pro is needed to launch", async () => {
    const setProPurchaseModalOpen = vi.fn();
    const { result } = renderHook(() =>
      useScanOperations({
        ...props,
        launcherAccess: false,
        setProPurchaseModalOpen,
      }),
    );
    await act(async () => {
      await result.current.handleCameraScan();
    });

    await emit("game-a");

    expect(setProPurchaseModalOpen).toHaveBeenCalledWith(true, "camera");
    expect(result.current.continuousCamera.active).toBe(false);
  });

  it("does not open when camera access is denied", async () => {
    vi.mocked(BarcodeScanner.checkPermissions).mockResolvedValueOnce({
      camera: "denied",
    });
    vi.mocked(BarcodeScanner.requestPermissions).mockResolvedValueOnce({
      camera: "denied",
    });
    const { result } = renderHook(() => useScanOperations(props));

    await act(async () => {
      await result.current.handleCameraScan();
    });

    expect(BarcodeScanner.startScan).not.toHaveBeenCalled();
    expect(result.current.continuousCamera.active).toBe(false);
    expect(document.body).not.toHaveClass(SCANNER_BODY_CLASS);
  });
});

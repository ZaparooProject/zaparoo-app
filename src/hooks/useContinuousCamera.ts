import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import {
  BarcodeScanner,
  type BarcodesScannedEvent,
} from "@capacitor-mlkit/barcode-scanning";
import { BarcodePermissionDeniedError } from "@/lib/errors";
import {
  launchFeedback,
  type LaunchError,
  type LaunchMedia,
} from "@/lib/launchFeedback";
import { logger } from "@/lib/logger";
import { TokenResponse } from "@/lib/models";
import type { ProPurchaseSource } from "@/lib/store";
import {
  mappingPrefillFor,
  runToken,
  type MappingPrefill,
} from "@/lib/tokenOperations.tsx";

/** Clears the app's backgrounds so the native camera preview shows through. */
export const SCANNER_BODY_CLASS = "barcode-scanner-active";
/** A code that stays in view is ignored until it has been gone this long. */
export const CAMERA_REARM_MS = 2000;
/** The camera closes itself after this long without a new code. */
export const CAMERA_IDLE_STOP_MS = 60_000;
/** A single scan shows its result for this long before the camera closes. */
export const CAMERA_SINGLE_CLOSE_MS = 900;
/** The outline hides when its code has not been seen for this long. */
const OUTLINE_HIDE_MS = 500;

export type CameraResultPhase = "launching" | "launched" | "scanned" | "failed";

export interface CameraScanResult {
  phase: CameraResultPhase;
  code: string;
  media: LaunchMedia | null;
  error: LaunchError | null;
  mapping: MappingPrefill | null;
}

export type CameraPoint = [number, number];

export interface ContinuousCamera {
  active: boolean;
  result: CameraScanResult | null;
  /** Corners of the current code in CSS pixels, clockwise from top-left. */
  outline: CameraPoint[] | null;
  torchAvailable: boolean;
  torchOn: boolean;
  /** The camera closed itself after a minute without a scan. */
  idleStopped: boolean;
  /**
   * Opens the camera. `single` closes it after the first code that launches
   * or is recorded; a code that fails leaves it open to try another.
   */
  start: (options?: { single?: boolean }) => Promise<void>;
  stop: () => void;
  toggleTorch: () => void;
}

interface LaunchState {
  connected: boolean;
  hasData: boolean;
  launcherAccess: boolean;
  setLastToken: (token: TokenResponse) => void;
  setProPurchaseModalOpen: (open: boolean, source?: ProPurchaseSource) => void;
}

interface UseContinuousCameraOptions extends LaunchState {
  /** A `**write:` code was read; the camera has already stopped. */
  onWriteCode: (value: string) => void;
  /** A code was read, before it launches. */
  onCodeRead: () => void;
}

/**
 * The plugin reports corner points in device pixels relative to the screen
 * (Android scales to DisplayMetrics pixels, iOS to bounds times scale), so
 * divide by the pixel ratio to land on CSS pixels.
 */
function toCssPoints(
  cornerPoints: BarcodesScannedEvent["barcodes"][number]["cornerPoints"],
): CameraPoint[] | null {
  if (!cornerPoints || cornerPoints.length !== 4) return null;
  const ratio = window.devicePixelRatio || 1;
  return cornerPoints.map(([x, y]) => [x / ratio, y / ratio]);
}

async function ensureCameraPermission() {
  const { camera } = await BarcodeScanner.checkPermissions();
  if (camera === "granted" || camera === "limited") return;
  const requested = await BarcodeScanner.requestPermissions();
  if (requested.camera !== "granted" && requested.camera !== "limited") {
    throw new BarcodePermissionDeniedError();
  }
}

/**
 * Scanner-gun camera: keeps the camera open behind the app and launches every
 * new code it sees. A code launches once while it stays in view.
 */
export function useContinuousCamera({
  onWriteCode,
  onCodeRead,
  ...launchState
}: UseContinuousCameraOptions): ContinuousCamera {
  const [active, setActive] = useState(false);
  const [result, setResult] = useState<CameraScanResult | null>(null);
  const [outline, setOutline] = useState<CameraPoint[] | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [idleStopped, setIdleStopped] = useState(false);

  const launchStateRef = useRef<LaunchState>(launchState);
  const callbacksRef = useRef({ onWriteCode, onCodeRead });
  useEffect(() => {
    launchStateRef.current = launchState;
    callbacksRef.current = { onWriteCode, onCodeRead };
  });

  const activeRef = useRef(false);
  // Bumped on every start and stop so late plugin answers from an earlier
  // session can't touch the current one.
  const sessionRef = useRef(0);
  const cleanupsRef = useRef<(() => void)[]>([]);
  const seenRef = useRef(new Map<string, number>());
  const currentCodeRef = useRef<string | null>(null);
  const scanIdRef = useRef(0);
  const launchIdRef = useRef<number | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleRef = useRef(false);
  // In single mode one code is in hand until it fails; others are ignored.
  const singleBusyRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopSession = useCallback((idle: boolean) => {
    if (!activeRef.current) return;
    activeRef.current = false;
    sessionRef.current++;
    for (const cleanup of cleanupsRef.current) cleanup();
    cleanupsRef.current = [];
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (outlineTimerRef.current) clearTimeout(outlineTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    idleTimerRef.current = null;
    outlineTimerRef.current = null;
    closeTimerRef.current = null;
    singleBusyRef.current = false;
    seenRef.current.clear();
    currentCodeRef.current = null;
    launchIdRef.current = null;
    // A launch still in flight belongs to this session, not the next one.
    scanIdRef.current++;
    document.body.classList.remove(SCANNER_BODY_CLASS);
    setActive(false);
    setResult(null);
    setOutline(null);
    setTorchOn(false);
    setTorchAvailable(false);
    setIdleStopped(idle);
    BarcodeScanner.stopScan().catch((error) => {
      logger.debug("Failed to stop camera scan:", error);
    });
  }, []);

  const stop = useCallback(() => stopSession(false), [stopSession]);

  const armIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      stopSession(true);
    }, CAMERA_IDLE_STOP_MS);
  }, [stopSession]);

  /** A single scan is done: leave its result up briefly, then close. */
  const closeAfterSingle = useCallback(() => {
    if (!singleRef.current || closeTimerRef.current) return;
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      stopSession(false);
    }, CAMERA_SINGLE_CLOSE_MS);
  }, [stopSession]);

  const showOutline = useCallback((points: CameraPoint[] | null) => {
    if (!points) return;
    setOutline(points);
    if (outlineTimerRef.current) clearTimeout(outlineTimerRef.current);
    outlineTimerRef.current = setTimeout(() => {
      outlineTimerRef.current = null;
      setOutline(null);
    }, OUTLINE_HIDE_MS);
  }, []);

  const launchCode = useCallback(
    (code: string) => {
      armIdleTimer();
      launchFeedback.read("camera", false);
      callbacksRef.current.onCodeRead();

      if (code.startsWith("**write:")) {
        const writeValue = code.slice(8);
        if (writeValue === "") return;
        stopSession(false);
        callbacksRef.current.onWriteCode(writeValue);
        return;
      }

      const scanId = ++scanIdRef.current;
      launchIdRef.current = null;
      singleBusyRef.current = singleRef.current;
      setResult({
        phase: "launching",
        code,
        media: null,
        error: null,
        mapping: null,
      });

      const state = launchStateRef.current;
      void runToken(
        code,
        code,
        state.launcherAccess,
        state.connected,
        state.setLastToken,
        (open) => state.setProPurchaseModalOpen(open, "camera"),
        false, // unsafe
        false, // override
        state.hasData, // canQueueCommands - only queue if we had a prior connection
        false, // requiresLaunch
        {
          source: "camera",
          onError: (error) => {
            if (scanIdRef.current !== scanId || !activeRef.current) return;
            // A failed code frees the camera to try another.
            singleBusyRef.current = false;
            setResult({
              phase: "failed",
              code,
              media: null,
              error,
              mapping: mappingPrefillFor(
                error,
                { uid: code, text: code },
                "camera",
              ),
            });
          },
        },
      ).then((ok) => {
        if (scanIdRef.current !== scanId || !activeRef.current) return;
        // A launch request went out; its outcome arrives as launch feedback.
        if (launchIdRef.current !== null) return;
        if (!ok) {
          // Blocked before reaching Core (the Pro purchase sheet opened), which
          // has to be visible above the app, not behind the camera.
          stopSession(false);
          return;
        }
        // Launch on scan is off, or offline: the code was only recorded.
        setResult((current) =>
          current?.code === code ? { ...current, phase: "scanned" } : current,
        );
        closeAfterSingle();
      });
    },
    [armIdleTimer, closeAfterSingle, stopSession],
  );

  const handleBarcodes = useCallback(
    (event: BarcodesScannedEvent) => {
      if (!activeRef.current) return;
      const now = Date.now();
      const seen = seenRef.current;
      let fresh: { code: string; points: CameraPoint[] | null } | null = null;

      for (const barcode of event.barcodes) {
        const code = barcode.rawValue;
        if (!code) continue;
        const lastSeen = seen.get(code);
        const rearmed =
          lastSeen === undefined || now - lastSeen >= CAMERA_REARM_MS;
        if (!rearmed) {
          seen.set(code, now);
          if (code === currentCodeRef.current) {
            showOutline(toCssPoints(barcode.cornerPoints));
          }
        } else if (!fresh) {
          fresh = { code, points: toCssPoints(barcode.cornerPoints) };
        }
        // A second new code in the same frame is left unseen, so it launches
        // on a later frame instead of being suppressed while it stays in view.
      }

      if (!fresh) return;
      if (singleBusyRef.current) return;
      seen.set(fresh.code, now);
      currentCodeRef.current = fresh.code;
      showOutline(fresh.points);
      launchCode(fresh.code);
    },
    [launchCode, showOutline],
  );

  const start = useCallback(
    async (options?: { single?: boolean }) => {
      if (activeRef.current) return;
      activeRef.current = true;
      singleRef.current = options?.single ?? false;
      singleBusyRef.current = false;
      const session = ++sessionRef.current;
      setIdleStopped(false);
      setResult(null);
      setOutline(null);
      document.body.classList.add(SCANNER_BODY_CLASS);
      setActive(true);

      cleanupsRef.current.push(
        launchFeedback.subscribe((event) => {
          if (event.kind === "read" || event.source !== "camera") return;
          if (event.kind === "started") {
            launchIdRef.current = event.id;
          } else if (
            event.kind === "launched" &&
            event.id === launchIdRef.current
          ) {
            setResult((current) =>
              current?.phase === "launching"
                ? { ...current, phase: "launched", media: event.media }
                : current,
            );
            closeAfterSingle();
          }
        }),
      );

      try {
        await ensureCameraPermission();
        if (sessionRef.current !== session) return;

        const handles: PluginListenerHandle[] = await Promise.all([
          BarcodeScanner.addListener("barcodesScanned", handleBarcodes),
          BarcodeScanner.addListener("scanError", (event) => {
            logger.debug("Camera scan error:", event.message);
          }),
        ]);
        const removeHandles = () => {
          for (const handle of handles) {
            handle.remove().catch((error: unknown) => {
              logger.debug("Failed to remove camera listener:", error);
            });
          }
        };
        if (sessionRef.current !== session) {
          removeHandles();
          return;
        }
        cleanupsRef.current.push(removeHandles);

        await BarcodeScanner.startScan();
        if (sessionRef.current !== session) return;
        armIdleTimer();

        BarcodeScanner.isTorchAvailable()
          .then(({ available }) => {
            if (sessionRef.current === session) setTorchAvailable(available);
          })
          .catch((error) => {
            logger.debug("Torch availability check failed:", error);
          });
      } catch (error) {
        if (sessionRef.current === session) stopSession(false);
        throw error;
      }
    },
    [armIdleTimer, closeAfterSingle, handleBarcodes, stopSession],
  );

  const toggleTorch = useCallback(() => {
    const session = sessionRef.current;
    BarcodeScanner.toggleTorch()
      .then(() => BarcodeScanner.isTorchEnabled())
      .then(({ enabled }) => {
        if (sessionRef.current === session) setTorchOn(enabled);
      })
      .catch((error) => {
        logger.debug("Failed to toggle torch:", error);
      });
  }, []);

  useEffect(() => () => stopSession(false), [stopSession]);

  return useMemo(
    () => ({
      active,
      result,
      outline,
      torchAvailable,
      torchOn,
      idleStopped,
      start,
      stop,
      toggleTorch,
    }),
    [
      active,
      result,
      outline,
      torchAvailable,
      torchOn,
      idleStopped,
      start,
      stop,
      toggleTorch,
    ],
  );
}

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import {
  cancelSession,
  readTag,
  readTagAndLaunch,
  sessionManager,
  Status,
  type Tag,
  type TagLaunchOutcome,
} from "@/lib/nfc";
import { nfcErrorMessageKey } from "@/lib/nfcErrorMessages";
import type { LaunchError, LaunchSource } from "@/lib/launchFeedback";
import { ScanResult, TokenResponse } from "@/lib/models";
import type { ProPurchaseSource } from "@/lib/store";
import { WriteAction, WriteNfcHook } from "@/lib/writeNfcHook";
import {
  mappingPrefillFor,
  runToken,
  type MappingPrefill,
} from "@/lib/tokenOperations.tsx";
import { logger } from "@/lib/logger";
import { useHaptics } from "@/hooks/useHaptics";
import { useContinuousCamera } from "@/hooks/useContinuousCamera";
import { launchFeedback } from "@/lib/launchFeedback";
import { usePreferencesStore } from "@/lib/preferencesStore";
import {
  BarcodePermissionDeniedError,
  BarcodeScanCancelledError,
  isExpectedNfcError,
  wrapBarcodeScannerError,
} from "@/lib/errors";

/** A failed scan, shown on the scan control instead of a toast. */
export interface ScanError {
  message: string;
  /** Which scan control failed, so the error shows on that one. */
  source: "nfc" | "camera";
  /** Set when the token is simply not set up yet; opens a new mapping. */
  prefill: MappingPrefill | null;
}

/**
 * The scan error for a failed launch. A token Core has nothing to run for
 * reads as "Not set up yet" with the mapping that would set it up.
 */
export function scanErrorFor(
  error: LaunchError,
  token: { uid: string; text: string; data?: string },
  source: LaunchSource,
  t: (key: string) => string,
): ScanError {
  const prefill = mappingPrefillFor(error, token, source);
  return {
    message: prefill ? t("scan.notSetUp") : error.message,
    source: source === "camera" ? "camera" : "nfc",
    prefill,
  };
}

// A tag still in the field is read again as soon as the next session opens.
// Within this window the same tag is the same tap, not a new one.
export const SAME_TAG_COOLDOWN_MS = 2000;
// How soon to look again while the same tag is still there. Shorter than the
// cooldown so each look renews it; at the full cooldown a held tag would pass
// as new on every other read and launch again.
export const SAME_TAG_RECHECK_MS = SAME_TAG_COOLDOWN_MS / 2;

interface UseScanOperationsProps {
  connected: boolean;
  hasData: boolean;
  launcherAccess: boolean;
  setLastToken: (token: TokenResponse) => void;
  setProPurchaseModalOpen: (open: boolean, source?: ProPurchaseSource) => void;
  setWriteOpen: (open: boolean) => void;
  nfcWriter: WriteNfcHook;
}

export function useScanOperations({
  connected,
  hasData,
  launcherAccess,
  setLastToken,
  setProPurchaseModalOpen,
  setWriteOpen,
  nfcWriter,
}: UseScanOperationsProps) {
  const { t } = useTranslation();
  const { notification } = useHaptics();
  const setLastScanMode = usePreferencesStore((state) => state.setLastScanMode);
  const [scanSession, setScanSession] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanResult>(ScanResult.Default);
  const [scanError, setScanError] = useState<ScanError | null>(null);
  const clearScanError = useCallback(() => setScanError(null), []);
  // A one-shot camera scan has closed its sheet by the time Core answers.
  const [cameraLaunching, setCameraLaunching] = useState(false);
  // Android's reader session has ended by the time Core answers. iOS keeps
  // its scan sheet open instead, and a restarting session stays "scanning".
  const [nfcLaunching, setNfcLaunching] = useState(false);
  const cameraAttemptRef = useRef(0);
  // The last tag a continuous NFC scan read, for the same-tag cooldown.
  const lastNfcReadRef = useRef<{ uid: string; at: number } | null>(null);

  const statusTimeout = 3000;

  // Timers owned by this hook: the iOS continuous-scan restart delay and the
  // status-reset delay. Both must be cancellable on stop/unmount so a stopped
  // scan can't silently restart a fresh NFC session.
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // Bumped on every user-initiated start/stop. Automatic continuous-scan
  // restarts inherit the current generation, so a blocked launch can still
  // stop its own restarted session - but a launch that fails late (e.g. a
  // 30s request timeout) can't tear down a scan the user started afterwards.
  const scanGenerationRef = useRef(0);
  // True only while a readTag() this hook started is waiting on the reader, so
  // unmount never cancels a write session another owner started.
  const ownsSessionRef = useRef(false);
  // Counts reader sessions, so a session that ends after a newer one started
  // cannot clear the newer one's state.
  const sessionSeqRef = useRef(0);
  // A continuous scan restarts from inside its own promise chain, long after
  // the render that started it. Read launch conditions from here so a tap made
  // after connecting or unlocking Pro uses the current state.
  const launchStateRef = useRef({ connected, hasData, launcherAccess });
  useEffect(() => {
    launchStateRef.current = { connected, hasData, launcherAccess };
  }, [connected, hasData, launcherAccess]);

  const scheduleStatusReset = useCallback(() => {
    if (statusResetTimerRef.current) {
      clearTimeout(statusResetTimerRef.current);
    }
    statusResetTimerRef.current = setTimeout(() => {
      statusResetTimerRef.current = null;
      setScanStatus(ScanResult.Default);
    }, statusTimeout);
  }, [statusTimeout]);

  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentional: invalidate in-flight launch cleanups on unmount; this is a counter, not a node ref
      scanGenerationRef.current++;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      if (statusResetTimerRef.current) {
        clearTimeout(statusResetTimerRef.current);
        statusResetTimerRef.current = null;
      }
      if (ownsSessionRef.current) {
        ownsSessionRef.current = false;
        cancelSession().catch((error) => {
          logger.error("Failed to cancel NFC session on unmount", error, {
            category: "nfc",
            action: "cancelSession",
            severity: "warning",
          });
        });
      }
    };
  }, []);

  // A tag still held to the phone is read again by every new session, so a
  // repeat read keeps the cooldown going until the tag has been away for it.
  const isRepeatNfcRead = useCallback((uid: string) => {
    const now = Date.now();
    const last = lastNfcReadRef.current;
    lastNfcReadRef.current = { uid, at: now };
    return (
      last !== null && last.uid === uid && now - last.at < SAME_TAG_COOLDOWN_MS
    );
  }, []);

  const recordNfcRead = useCallback(() => {
    setScanStatus(ScanResult.Success);
    scheduleStatusReset();
    // A mode counts as used when it produced a token, so a mistaken tap or
    // a session that timed out never re-orders the home page.
    setLastScanMode("nfc");
  }, [scheduleStatusReset, setLastScanMode]);

  /**
   * Run a tag an NFC scan read. A failure shows on the scan control; an
   * outcome that is not ok (failed, or blocked by the Pro gate) stops
   * continuous scanning.
   */
  const launchNfcTag = useCallback(
    async (tag: Tag, generation: number): Promise<TagLaunchOutcome> => {
      // Android's reader session already buzzed for this read.
      launchFeedback.read("nfc", Capacitor.getPlatform() === "android");
      recordNfcRead();

      const failure: { error: LaunchError | null } = { error: null };
      const launchState = launchStateRef.current;
      // Only queue commands if we were previously connected (reconnecting
      // scenario). If never connected (proper offline), just store the token.
      const ok = await runToken(
        tag.uid,
        tag.text,
        launchState.launcherAccess,
        launchState.connected,
        setLastToken,
        (open) => setProPurchaseModalOpen(open, "nfc"),
        false, // unsafe
        false, // override
        launchState.hasData, // canQueueCommands
        false, // requiresLaunch
        {
          type: tag.type,
          data: tag.data,
          source: "nfc",
          onError: (error) => {
            failure.error = error;
          },
        },
      );
      if (ok) return { ok: true };
      if (!failure.error) return { ok: false, errorMessage: "" };
      const error = scanErrorFor(failure.error, tag, "nfc", t);
      if (scanGenerationRef.current === generation) {
        setScanError(error);
      }
      return { ok: false, errorMessage: error.message };
    },
    [recordNfcRead, setLastToken, setProPurchaseModalOpen, t],
  );

  const doScan = useCallback(() => {
    const generation = scanGenerationRef.current;
    const ios = Capacitor.getPlatform() === "ios";
    setScanSession(true);
    ownsSessionRef.current = true;
    const sessionSeq = ++sessionSeqRef.current;
    const latest = () => sessionSeqRef.current === sessionSeq;

    const current = () => scanGenerationRef.current === generation;

    // A failed or blocked launch stops scanning entirely, including any
    // pending restart. Skipped when the user has since stopped or restarted
    // scanning themselves.
    const stopAfterFailure = () => {
      if (!current()) return;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      cancelSession().catch((e) => {
        logger.debug("Failed to cancel session after failed run:", e);
      });
      setScanSession(false);
    };

    const restart = (delayMs: number) => {
      if (!current()) return;
      logger.log("restarting scan");
      if (delayMs === 0) {
        // eslint-disable-next-line react-hooks/immutability -- Intentional: recursive callback for continuous NFC scanning
        doScan();
        return;
      }
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        doScan();
      }, delayMs);
    };

    // iOS runs the launch inside the session so its sheet stays open until
    // Core answers, then resolves once the sheet has gone.
    let iosLaunchOk = true;
    const session = ios
      ? readTagAndLaunch(
          async (tag) => {
            if (isRepeatNfcRead(tag.uid)) return { ok: true };
            const outcome = await launchNfcTag(tag, generation);
            iosLaunchOk = outcome.ok;
            return outcome;
          },
          { launchingMessage: t("scan.launching") },
        )
      : readTag();

    session
      .then((result) => {
        // A newer session owns the reader and the scan state now.
        if (!latest()) return;
        ownsSessionRef.current = false;
        if (result.status === Status.Cancelled) {
          // A cancelled scan is not a success - no announcement, no restart
          setScanStatus(ScanResult.Default);
          setScanSession(false);
          return;
        }

        const tag = result.info.tag;
        if (!tag) {
          recordNfcRead();
        } else if (ios) {
          if (!iosLaunchOk) {
            if (current()) setScanSession(false);
            return;
          }
        } else if (isRepeatNfcRead(tag.uid)) {
          // The same tag is still at the phone: wait out the cooldown
          // rather than reading it again straight away.
          if (sessionManager.shouldRestart) {
            restart(SAME_TAG_RECHECK_MS);
            return;
          }
        } else {
          if (!sessionManager.shouldRestart) setNfcLaunching(true);
          void launchNfcTag(tag, generation)
            .then((outcome) => {
              if (!outcome.ok) stopAfterFailure();
            })
            .finally(() => setNfcLaunching(false));
        }

        if (sessionManager.shouldRestart) {
          restart(0);
          return;
        }

        setScanSession(false);
      })
      .catch((error) => {
        if (!latest()) return;
        ownsSessionRef.current = false;
        setScanStatus(ScanResult.Error);
        setScanSession(false);
        if (isExpectedNfcError(error)) {
          logger.debug("Expected NFC scan failure", error);
        } else {
          logger.error("NFC scan failed", error, {
            category: "nfc",
            action: "doScan",
          });
        }
        if (current()) {
          setScanError({
            message: t(nfcErrorMessageKey(error) ?? "scan.scanError"),
            source: "nfc",
            prefill: null,
          });
        }
        scheduleStatusReset();
      });
  }, [isRepeatNfcRead, launchNfcTag, recordNfcRead, scheduleStatusReset, t]);

  const handleScanButton = useCallback(async () => {
    scanGenerationRef.current++;
    if (scanSession) {
      setScanSession(false);
      // Stop a pending iOS continuous-scan restart along with the session
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      cancelSession().catch((e) => {
        logger.debug("Failed to cancel scan session:", e);
      });
    } else {
      setScanStatus(ScanResult.Default);
      setScanError(null);
      lastNfcReadRef.current = null;
      doScan();
    }
  }, [scanSession, doScan]);

  const continuousCameraEnabled = usePreferencesStore(
    (state) => state.continuousCamera,
  );

  const startCameraWrite = useCallback(
    (writeValue: string) => {
      setWriteOpen(true);
      nfcWriter.write(WriteAction.Write, writeValue).catch((e) => {
        logger.error("Camera-initiated write failed:", e, {
          category: "nfc",
          action: "cameraWrite",
          severity: "error",
        });
      });
    },
    [setWriteOpen, nfcWriter],
  );

  const handleCameraError = useCallback(
    (error: unknown) => {
      // Wrap barcode scanner errors to get typed errors
      const wrappedError = wrapBarcodeScannerError(error);

      // User cancellation and denied camera access are expected outcomes.
      if (wrappedError instanceof BarcodeScanCancelledError) {
        logger.debug("Barcode scan canceled by user");
        return;
      }
      if (wrappedError instanceof BarcodePermissionDeniedError) {
        logger.debug("Barcode camera permission denied");
        notification("error");
        return;
      }

      logger.error("Barcode scan error:", wrappedError, {
        category: "camera",
        action: "barcodeScan",
      });
      notification("error");
    },
    [notification],
  );

  const recordCameraScan = useCallback(
    () => setLastScanMode("camera"),
    [setLastScanMode],
  );

  const continuousCamera = useContinuousCamera({
    connected,
    hasData,
    launcherAccess,
    setLastToken,
    setProPurchaseModalOpen,
    onWriteCode: startCameraWrite,
    onCodeRead: recordCameraScan,
  });
  const startContinuousCamera = continuousCamera.start;

  const handleCameraScan = useCallback(async () => {
    // App preview shows the camera action in a browser, where there is no
    // scanner plugin to open.
    if (!Capacitor.isNativePlatform()) return;

    // Both modes use the app's own camera view. Without continuous camera it
    // closes after the first code that launches.
    try {
      await startContinuousCamera({ single: !continuousCameraEnabled });
      return;
    } catch (error) {
      // Google's scanner sheet needs no camera permission, so Android can
      // still scan one code after camera access was refused.
      const denied =
        wrapBarcodeScannerError(error) instanceof BarcodePermissionDeniedError;
      if (
        !denied ||
        continuousCameraEnabled ||
        Capacitor.getPlatform() !== "android"
      ) {
        handleCameraError(error);
        // Refused camera access has no other way to be noticed or fixed.
        if (denied) {
          setScanError({
            message: t("create.mappings.editor.cameraPermissionDenied"),
            source: "camera",
            prefill: null,
          });
        }
        return;
      }
    }

    await BarcodeScanner.scan()
      .then((res) => {
        if (res.barcodes.length < 1) {
          return;
        }

        const barcode = res.barcodes[0];
        if (!barcode?.rawValue) return;

        launchFeedback.read("camera", false);
        setLastScanMode("camera");
        setScanError(null);

        if (barcode.rawValue.startsWith("**write:")) {
          const writeValue = barcode.rawValue.slice(8);

          if (writeValue === "") {
            return;
          }

          startCameraWrite(writeValue);
          return;
        }

        const code = barcode.rawValue;
        const attempt = ++cameraAttemptRef.current;
        setCameraLaunching(true);
        void runToken(
          code,
          code,
          launcherAccess,
          connected,
          setLastToken,
          (open) => setProPurchaseModalOpen(open, "camera"),
          false, // unsafe
          false, // override
          hasData, // canQueueCommands - only queue if we had a prior connection
          false, // requiresLaunch
          {
            source: "camera",
            onError: (error) => {
              // A slow failure must not replace a newer scan's result.
              if (cameraAttemptRef.current !== attempt) return;
              setScanError(
                scanErrorFor(error, { uid: code, text: code }, "camera", t),
              );
            },
          },
        ).finally(() => {
          if (cameraAttemptRef.current === attempt) setCameraLaunching(false);
        });
      })
      .catch(handleCameraError);
  }, [
    connected,
    hasData,
    launcherAccess,
    setLastToken,
    setLastScanMode,
    setProPurchaseModalOpen,
    continuousCameraEnabled,
    startContinuousCamera,
    startCameraWrite,
    handleCameraError,
    t,
  ]);

  const handleStopConfirm = useCallback(() => {
    void runToken(
      "**stop",
      "**stop",
      launcherAccess,
      connected,
      setLastToken,
      setProPurchaseModalOpen,
      false, // unsafe
      true, // override - stop works without Pro
      false, // canQueueCommands - never queue stop commands, only run when connected
    );
  }, [connected, launcherAccess, setLastToken, setProPurchaseModalOpen]);

  return useMemo(
    () => ({
      scanSession,
      scanStatus,
      scanError,
      showScanError: setScanError,
      clearScanError,
      cameraLaunching,
      nfcLaunching,
      handleScanButton,
      handleCameraScan,
      handleStopConfirm,
      continuousCamera,
    }),
    [
      scanSession,
      scanStatus,
      scanError,
      clearScanError,
      cameraLaunching,
      nfcLaunching,
      handleScanButton,
      handleCameraScan,
      handleStopConfirm,
      continuousCamera,
    ],
  );
}

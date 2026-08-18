import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import toast from "react-hot-toast";
import { cancelSession, readTag, sessionManager, Status } from "@/lib/nfc";
import { ScanResult, TokenResponse } from "@/lib/models";
import { WriteAction, WriteNfcHook } from "@/lib/writeNfcHook";
import { runToken } from "@/lib/tokenOperations.tsx";
import { logger } from "@/lib/logger";
import { useHaptics } from "@/hooks/useHaptics";
import {
  BarcodePermissionDeniedError,
  BarcodeScanCancelledError,
  isExpectedNfcError,
  wrapBarcodeScannerError,
} from "@/lib/errors";

interface UseScanOperationsProps {
  connected: boolean;
  hasData: boolean;
  launcherAccess: boolean;
  setLastToken: (token: TokenResponse) => void;
  setProPurchaseModalOpen: (open: boolean) => void;
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
  const { impact, notification } = useHaptics();
  const [scanSession, setScanSession] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanResult>(ScanResult.Default);

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
    };
  }, []);

  const doScan = useCallback(() => {
    const generation = scanGenerationRef.current;
    setScanSession(true);

    readTag()
      .then((result) => {
        if (result.status === Status.Cancelled) {
          // A cancelled scan is not a success - no announcement, no restart
          setScanStatus(ScanResult.Default);
          setScanSession(false);
          return;
        }

        setScanStatus(ScanResult.Success);
        scheduleStatusReset();

        if (result.info.tag) {
          // Only queue commands if we were previously connected (reconnecting scenario)
          // If never connected (proper offline), just store the token without queueing
          runToken(
            result.info.tag.uid,
            result.info.tag.text,
            launcherAccess,
            connected,
            setLastToken,
            setProPurchaseModalOpen,
            false, // unsafe
            false, // override
            hasData, // canQueueCommands - only queue if we had a prior connection
          ).then((ok) => {
            if (!ok && scanGenerationRef.current === generation) {
              // Launch was blocked (e.g. Pro gate opened the purchase modal):
              // stop scanning entirely, including any pending restart. Skipped
              // when the user has since stopped/restarted scanning themselves.
              if (restartTimerRef.current) {
                clearTimeout(restartTimerRef.current);
                restartTimerRef.current = null;
              }
              cancelSession().catch((e) => {
                logger.debug("Failed to cancel session after blocked run:", e);
              });
              setScanSession(false);
            }
          });
        }

        if (sessionManager.shouldRestart) {
          if (Capacitor.getPlatform() === "ios") {
            logger.log("delaying restart for ios");
            restartTimerRef.current = setTimeout(() => {
              restartTimerRef.current = null;
              logger.log("restarting scan");
              // eslint-disable-next-line react-hooks/immutability -- Intentional: recursive callback for continuous NFC scanning
              doScan();
            }, 4000);
          } else {
            logger.log("restarting scan");
            doScan();
          }
          return;
        }

        setScanSession(false);
      })
      .catch((error) => {
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
        toast.error(t("scan.scanError"));
        scheduleStatusReset();
      });
  }, [
    connected,
    hasData,
    launcherAccess,
    setLastToken,
    setProPurchaseModalOpen,
    scheduleStatusReset,
    t,
  ]);

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
      doScan();
    }
  }, [scanSession, doScan]);

  const handleCameraScan = useCallback(async () => {
    await BarcodeScanner.scan()
      .then((res) => {
        if (res.barcodes.length < 1) {
          return;
        }

        const barcode = res.barcodes[0];
        if (!barcode?.rawValue) return;

        // Heavy haptic feedback to confirm barcode was scanned
        impact("heavy");

        if (barcode.rawValue.startsWith("**write:")) {
          const writeValue = barcode.rawValue.slice(8);

          if (writeValue === "") {
            return;
          }

          setWriteOpen(true);
          nfcWriter.write(WriteAction.Write, writeValue).catch((e) => {
            logger.error("Camera-initiated write failed:", e, {
              category: "nfc",
              action: "cameraWrite",
              severity: "error",
            });
          });
          return;
        }

        void runToken(
          barcode.rawValue,
          barcode.rawValue,
          launcherAccess,
          connected,
          setLastToken,
          setProPurchaseModalOpen,
          false, // unsafe
          false, // override
          hasData, // canQueueCommands - only queue if we had a prior connection
        );
      })
      .catch((error) => {
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
      });
  }, [
    connected,
    hasData,
    launcherAccess,
    setLastToken,
    setProPurchaseModalOpen,
    setWriteOpen,
    nfcWriter,
    impact,
    notification,
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
      handleScanButton,
      handleCameraScan,
      handleStopConfirm,
      runToken,
    }),
    [
      scanSession,
      scanStatus,
      handleScanButton,
      handleCameraScan,
      handleStopConfirm,
    ],
  );
}

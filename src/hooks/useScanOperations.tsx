import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import toast from "react-hot-toast";
import { cancelSession, readTag, sessionManager, Status } from "../lib/nfc";
import { ScanResult, TokenResponse } from "../lib/models";
import { useNfcWriter, WriteAction } from "../lib/writeNfcHook";
import { runToken } from "../lib/tokenOperations.tsx";
import { logger } from "../lib/logger";
import { useAnnouncer } from "../components/A11yAnnouncer";
import { useHaptics } from "./useHaptics";

interface UseScanOperationsProps {
  connected: boolean;
  launcherAccess: boolean;
  setLastToken: (token: TokenResponse) => void;
  setProPurchaseModalOpen: (open: boolean) => void;
  setWriteOpen: (open: boolean) => void;
}

export function useScanOperations({
  connected,
  launcherAccess,
  setLastToken,
  setProPurchaseModalOpen,
  setWriteOpen,
}: UseScanOperationsProps) {
  const { t } = useTranslation();
  const nfcWriter = useNfcWriter();
  const { notification } = useHaptics();
  const { announce } = useAnnouncer();
  const [scanSession, setScanSession] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanResult>(ScanResult.Default);

  const statusTimeout = 3000;

  const doScan = useCallback(() => {
    setScanSession(true);

    readTag()
      .then((result) => {
        setScanStatus(ScanResult.Success);
        notification("success");
        announce(t("scan.scanSuccess"));
        setTimeout(() => {
          setScanStatus(ScanResult.Default);
        }, statusTimeout);

        if (result.info.tag) {
          const ok = runToken(
            result.info.tag.uid,
            result.info.tag.text,
            launcherAccess,
            connected,
            setLastToken,
            setProPurchaseModalOpen,
          );
          if (!ok) {
            cancelSession();
            setScanSession(false);
            return;
          }
        }

        if (
          sessionManager.shouldRestart &&
          result.status !== Status.Cancelled
        ) {
          if (Capacitor.getPlatform() === "ios") {
            logger.log("delaying restart for ios");
            setTimeout(() => {
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
        notification("error");
        logger.error("NFC scan failed", error, {
          category: "nfc",
          action: "doScan",
        });
        toast.error(t("scan.scanError"));
        setTimeout(() => {
          setScanStatus(ScanResult.Default);
        }, statusTimeout);
      });
  }, [
    connected,
    launcherAccess,
    setLastToken,
    setProPurchaseModalOpen,
    statusTimeout,
    t,
    notification,
    announce,
  ]);

  const handleScanButton = useCallback(async () => {
    if (scanSession) {
      setScanSession(false);
      cancelSession();
    } else {
      setScanStatus(ScanResult.Default);
      doScan();
    }
  }, [scanSession, doScan]);

  const handleCameraScan = useCallback(async () => {
    BarcodeScanner.scan()
      .then((res) => {
        if (res.barcodes.length < 1) {
          return;
        }

        const barcode = res.barcodes[0];
        if (!barcode) return;

        if (barcode.rawValue.startsWith("**write:")) {
          const writeValue = barcode.rawValue.slice(8);

          if (writeValue === "") {
            return;
          }

          setWriteOpen(true);
          nfcWriter.write(WriteAction.Write, writeValue);
          return;
        }

        runToken(
          barcode.rawValue,
          barcode.rawValue,
          launcherAccess,
          connected,
          setLastToken,
          setProPurchaseModalOpen,
        );
      })
      .catch((error) => {
        logger.error("Barcode scan error:", error, {
          category: "camera",
          action: "barcodeScan",
        });
      });
  }, [
    connected,
    launcherAccess,
    setLastToken,
    setProPurchaseModalOpen,
    setWriteOpen,
    nfcWriter,
  ]);

  const handleStopConfirm = useCallback(() => {
    runToken(
      "**launch.system:menu",
      "**launch.system:menu",
      launcherAccess,
      connected,
      setLastToken,
      setProPurchaseModalOpen,
      false,
      true,
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

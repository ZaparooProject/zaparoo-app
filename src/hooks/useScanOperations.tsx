import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import toast from "react-hot-toast";
import { cancelSession, readTag, sessionManager, Status } from "../lib/nfc";
import { ScanResult, TokenResponse } from "../lib/models";
import { useNfcWriter, WriteAction } from "../lib/writeNfcHook";
import { runToken } from "../lib/tokenOperations.tsx";

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
  setWriteOpen
}: UseScanOperationsProps) {
  const { t } = useTranslation();
  const nfcWriter = useNfcWriter();
  const [scanSession, setScanSession] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanResult>(ScanResult.Default);

  const statusTimeout = 3000;

  const doScan = useCallback(() => {
    setScanSession(true);

    readTag()
      .then((result) => {
        setScanStatus(ScanResult.Success);
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
            setProPurchaseModalOpen
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
            console.log("delaying restart for ios");
            setTimeout(() => {
              console.log("restarting scan");
              doScan();
            }, 4000);
          } else {
            console.log("restarting scan");
            doScan();
          }
          return;
        }

        setScanSession(false);
      })
      .catch(() => {
        setScanStatus(ScanResult.Error);
        setScanSession(false);
        toast.error((to) => (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <span
            className="flex grow flex-col"
            onClick={() => toast.dismiss(to.id)}
          >
            {t("scan.scanError")}
          </span>
        ));
        setTimeout(() => {
          setScanStatus(ScanResult.Default);
        }, statusTimeout);
      });
  }, [connected, launcherAccess, setLastToken, setProPurchaseModalOpen, statusTimeout, t]);

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
    BarcodeScanner.scan().then((res) => {
      if (res.barcodes.length < 1) {
        return;
      }

      const barcode = res.barcodes[0];

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
        setProPurchaseModalOpen
      );
    });
  }, [connected, launcherAccess, setLastToken, setProPurchaseModalOpen, setWriteOpen, nfcWriter]);

  const handleStopConfirm = useCallback(() => {
    runToken(
      "**launch.system:menu",
      "**launch.system:menu",
      launcherAccess,
      connected,
      setLastToken,
      setProPurchaseModalOpen,
      false,
      true
    );
  }, [connected, launcherAccess, setLastToken, setProPurchaseModalOpen]);

  return useMemo(() => ({
    scanSession,
    scanStatus,
    handleScanButton,
    handleCameraScan,
    handleStopConfirm,
    runToken
  }), [scanSession, scanStatus, handleScanButton, handleCameraScan, handleStopConfirm]);
}

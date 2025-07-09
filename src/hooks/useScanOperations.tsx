import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import toast from "react-hot-toast";
import { cancelSession, readTag, sessionManager, Status } from "../lib/nfc";
import { CoreAPI } from "../lib/coreApi";
import { ScanResult, TokenResponse } from "../lib/models";
import { useNfcWriter, WriteAction } from "../lib/writeNfcHook";
import { canUseRunToken, incrementRunTokenUsage } from "../lib/dailyUsage";

const zapUrls = [
  "https://zpr.au",
  "https://zaparoo.link",
  "https://go.tapto.life"
];

const isZapUrl = (url: string) => {
  return zapUrls.some((zapUrl) => url.toLowerCase().startsWith(zapUrl));
};

const runToken = async (
  uid: string,
  text: string,
  launcherAccess: boolean,
  connected: boolean,
  setLastToken: (token: TokenResponse) => void,
  setProPurchaseModalOpen: (open: boolean) => void,
  unsafe = false,
  override = false
): Promise<boolean> => {
  return new Promise((resolve) => {
    if (uid === "" && text === "") {
      return resolve(false);
    }

    const token = {
      uid: uid,
      text: text,
      scanTime: new Date().toISOString(),
      type: "",
      data: ""
    };
    setLastToken(token);

    if (!sessionManager.launchOnScan) {
      return resolve(true);
    }

    const run = async () => {
      if (launcherAccess || isZapUrl(text) || override) {
        if (!launcherAccess && !isZapUrl(text) && !override) {
          const usageCheck = await canUseRunToken(launcherAccess);
          if (!usageCheck.canUse) {
            setProPurchaseModalOpen(true);
            return resolve(false);
          }
        }

        if (!isZapUrl(text) && !override) {
          await incrementRunTokenUsage(launcherAccess);
        }

        CoreAPI.run({
          uid: uid,
          text: text,
          unsafe: unsafe
        })
          .then(() => {
            resolve(true);
          })
          .catch((e) => {
            toast.error((to) => (
              <span
                className="flex grow flex-col"
                onClick={() => toast.dismiss(to.id)}
              >
                {e.message}
              </span>
            ));
            console.error("launch error", e);
            resolve(false);
          });
        return;
      } else {
        const usageCheck = await canUseRunToken(launcherAccess);
        if (usageCheck.canUse) {
          await incrementRunTokenUsage(launcherAccess);

          CoreAPI.run({
            uid: uid,
            text: text,
            unsafe: unsafe
          })
            .then(() => {
              resolve(true);
            })
            .catch((e) => {
              toast.error((to) => (
                <span
                  className="flex grow flex-col"
                  onClick={() => toast.dismiss(to.id)}
                >
                  {e.message}
                </span>
              ));
              console.error("launch error", e);
              resolve(false);
            });
          return;
        } else {
          setProPurchaseModalOpen(true);
          return resolve(false);
        }
      }
    };

    if (!connected) {
      setTimeout(() => {
        run();
      }, 500);
    } else {
      run();
    }
  });
};

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

  const doScan = () => {
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
  };

  const handleScanButton = async () => {
    if (scanSession) {
      setScanSession(false);
      cancelSession();
    } else {
      setScanStatus(ScanResult.Default);
      doScan();
    }
  };

  const handleCameraScan = async () => {
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
  };

  const handleStopConfirm = () => {
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
  };

  return {
    scanSession,
    scanStatus,
    handleScanButton,
    handleCameraScan,
    handleStopConfirm,
    runToken
  };
}

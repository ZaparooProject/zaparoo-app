import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cancelSession, readTag, sessionManager, Status } from "../lib/nfc";
import { getDeviceAddress, CoreAPI } from "../lib/coreApi.ts";
import {
  CheckIcon,
  DeviceIcon,
  HistoryIcon,
  Logo,
  SettingsIcon,
  WarningIcon
} from "../lib/images";
import { useStatusStore } from "../lib/store";
import { useQuery } from "@tanstack/react-query";
import { KeepAwake } from "@capacitor-community/keep-awake";
import toast from "react-hot-toast";
import { ScanResult, TokenResponse } from "../lib/models";
import {
  errorColor,
  ScanSpinner,
  successColor
} from "../components/ScanSpinner";
import classNames from "classnames";
import { SlideModal } from "../components/SlideModal";
import { ToggleChip } from "../components/wui/ToggleChip";
import { Button } from "../components/wui/Button";
import { Card } from "../components/wui/Card";
import { ToggleSwitch } from "../components/wui/ToggleSwitch";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { PageFrame } from "../components/PageFrame";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { CopyButton } from "@/components/CopyButton.tsx";
import { useNfcWriter, WriteAction } from "@/lib/writeNfcHook.tsx";
import { useProPurchase } from "@/components/ProPurchase.tsx";
import { WriteModal } from "@/components/WriteModal.tsx";

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
  setProPurchaseModalOpen: (open: boolean) => void
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
      if (launcherAccess || isZapUrl(text)) {
        CoreAPI.launch(token)
          .then(() => {
            resolve(true);
          })
          .catch((e) => {
            toast.error((to) => (
              <span
                className="flex flex-grow flex-col"
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
    };

    if (!connected) {
      // try wait a little bit in case the app is cold starting
      setTimeout(() => {
        run();
      }, 500);
    } else {
      run();
    }
  });
};

const initData = {
  restartScan: false,
  launchOnScan: true,
  cameraDefault: false
};

export const Route = createFileRoute("/")({
  loader: async () => {
    initData.restartScan =
      (await Preferences.get({ key: "restartScan" })).value === "true";
    initData.launchOnScan =
      (await Preferences.get({ key: "launchOnScan" })).value !== "false";
    initData.cameraDefault =
      (await Preferences.get({ key: "cameraDefault" })).value === "true";
  },
  component: Index
});

const statusTimeout = 3000;

function Index() {
  const { t } = useTranslation();
  const nfcWriter = useNfcWriter();
  const [writeOpen, setWriteOpen] = useState(false);
  const closeWriteModal = () => {
    setWriteOpen(false);
    nfcWriter.end();
  };
  useEffect(() => {
    if (nfcWriter.status !== null) {
      setWriteOpen(false);
      nfcWriter.end();
    }
  }, [nfcWriter]);
  const { PurchaseModal, proPurchaseModalOpen, setProPurchaseModalOpen } =
    useProPurchase();

  const connected = useStatusStore((state) => state.connected);
  const playing = useStatusStore((state) => state.playing);
  const lastToken = useStatusStore((state) => state.lastToken);
  const setLastToken = useStatusStore((state) => state.setLastToken);

  const [cameraMode, setCameraMode] = useState(initData.cameraDefault);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scanSession, setScanSession] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanResult>(ScanResult.Default);

  const safeInsets = useStatusStore((state) => state.safeInsets);

  const runQueue = useStatusStore((state) => state.runQueue);
  const setRunQueue = useStatusStore((state) => state.setRunQueue);
  //const writeQueue = useStatusStore((state) => state.writeQueue);
  //const setWriteQueue = useStatusStore((state) => state.setWriteQueue);

  const [restartScan, setRestartScan] = useState(initData.restartScan);
  useEffect(() => {
    sessionManager.setShouldRestart(restartScan);
  }, [restartScan]);

  const [launchOnScan, setLaunchOnScan] = useState(initData.launchOnScan);
  useEffect(() => {
    sessionManager.setLaunchOnScan(launchOnScan);
  }, [launchOnScan]);

  const [launcherAccess, setLauncherAccess] = useState(false);
  useEffect(() => {
    Preferences.get({ key: "launcherAccess" }).then((result) => {
      if (result.value) {
        setLauncherAccess(result.value === "true");
      }
    });
  }, []);

  const history = useQuery({
    queryKey: ["history"],
    queryFn: () => CoreAPI.history()
  });

  useEffect(() => {
    if (historyOpen) {
      history.refetch();
    }
  }, [history, historyOpen]);

  useEffect(() => {
    KeepAwake.keepAwake();
    return () => {
      KeepAwake.allowSleep();
    };
  }, []);

  useEffect(() => {
    return () => {
      cancelSession();
    };
  }, []);

  useEffect(() => {
    if (runQueue === "") {
      return;
    }
    console.log("runQueue", runQueue);
    runToken(
      runQueue,
      runQueue,
      launcherAccess,
      connected,
      setLastToken,
      setProPurchaseModalOpen
    );
    setRunQueue("");
  }, [runQueue]);

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
            className="flex flex-grow flex-col"
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
    if (cameraMode) {
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
      return;
    }

    if (scanSession) {
      setScanSession(false);
      cancelSession();
    } else {
      setScanStatus(ScanResult.Default);
      doScan();
    }
  };

  return (
    <>
      <PageFrame>
        <div className="flex flex-row justify-between">
          <Logo width="140px" />
          <ToggleChip
            icon={<HistoryIcon size="32" />}
            state={historyOpen}
            setState={(s) => {
              if (!historyOpen && proPurchaseModalOpen) {
                setProPurchaseModalOpen(false);
                setTimeout(() => {
                  setHistoryOpen(s);
                }, 150);
              } else {
                setHistoryOpen(s);
              }
            }}
            disabled={!connected}
          />
        </div>

        {Capacitor.isNativePlatform() ? (
          <div className="mb-9 mt-8 text-center">
            <div onClick={handleScanButton}>
              <ScanSpinner status={scanStatus} spinning={scanSession} />
            </div>
          </div>
        ) : (
          <div className="mt-8"></div>
        )}

        <div>
          {!connected && (
            <>
              <Card className="mb-5">
                <div className="flex flex-row items-center justify-between gap-3">
                  <div className="px-1.5 text-error">
                    <WarningIcon size="24" />
                  </div>
                  <div className="flex flex-grow flex-col">
                    <span className="font-semibold">{t("scan.noDevices")}</span>
                  </div>
                  <Link
                    to="/settings"
                    search={{
                      focus: "address"
                    }}
                  >
                    <Button icon={<SettingsIcon size="24" />} variant="text" />
                  </Link>
                </div>
              </Card>

              <div className="mb-3 flex flex-col">
                <ToggleSwitch
                  label={t("scan.continuous")}
                  value={restartScan}
                  setValue={(v) => {
                    setRestartScan(v);
                    Preferences.set({
                      key: "restartScan",
                      value: v.toString()
                    });
                  }}
                />
              </div>
            </>
          )}

          {connected && (
            <div>
              <Card className="mb-4">
                <div className="flex flex-row items-center justify-between gap-3">
                  <div className="px-1.5 text-success">
                    <DeviceIcon size="24" />
                  </div>
                  <div className="flex flex-grow flex-col">
                    <span className="font-bold">
                      {t("scan.connectedHeading")}
                    </span>
                    <span>
                      {t("scan.connectedSub", {
                        ip: getDeviceAddress()
                      })}
                    </span>
                  </div>
                  <Link
                    to="/settings"
                    search={{
                      focus: "address"
                    }}
                  >
                    <Button icon={<SettingsIcon size="24" />} variant="text" />
                  </Link>
                </div>
              </Card>

              {Capacitor.isNativePlatform() && (
                <>
                  <div className="mb-3">
                    <div className="flex flex-row" role="group">
                      <button
                        type="button"
                        className={classNames(
                          "flex",
                          "flex-row",
                          "w-full",
                          "rounded-s-full",
                          "items-center",
                          "justify-center",
                          "py-1",
                          "font-medium",
                          "gap-1",
                          "tracking-[0.1px]",
                          "h-9",
                          "border",
                          "border-solid",
                          "border-bd-filled",
                          {
                            "bg-button-pattern": !cameraMode
                          }
                        )}
                        onClick={() => {
                          Preferences.set({
                            key: "cameraDefault",
                            value: "false"
                          });
                          setCameraMode(false);
                        }}
                      >
                        {!cameraMode && <CheckIcon size="28" />}
                        {t("scan.nfcMode")}
                      </button>
                      <button
                        type="button"
                        className={classNames(
                          "flex",
                          "flex-row",
                          "w-full",
                          "rounded-e-full",
                          "items-center",
                          "justify-center",
                          "py-1",
                          "font-medium",
                          "gap-1",
                          "tracking-[0.1px]",
                          "h-9",
                          "border",
                          "border-solid",
                          "border-bd-filled",
                          {
                            "bg-button-pattern": cameraMode
                          }
                        )}
                        onClick={() => {
                          Preferences.set({
                            key: "cameraDefault",
                            value: "true"
                          });
                          setCameraMode(true);
                        }}
                      >
                        {cameraMode && <CheckIcon size="28" />}
                        {t("scan.cameraMode")}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <ToggleSwitch
                      label={t("scan.continuous")}
                      disabled={cameraMode}
                      value={!cameraMode ? restartScan : false}
                      setValue={(v) => {
                        setRestartScan(v);
                        Preferences.set({
                          key: "restartScan",
                          value: v.toString()
                        });
                      }}
                    />
                    <ToggleSwitch
                      label={t("scan.launchOnScan")}
                      value={launchOnScan}
                      setValue={(v) => {
                        setLaunchOnScan(v);
                        Preferences.set({
                          key: "launchOnScan",
                          value: v.toString()
                        });
                      }}
                    />
                  </div>
                </>
              )}

              <div className="p-3 pt-6">
                <div className="flex flex-row items-center justify-between">
                  <p className="font-bold capitalize text-gray-400">
                    {t("scan.nowPlayingHeading")}
                  </p>
                </div>
                <div>
                  <p>
                    {t("scan.nowPlayingName", {
                      game: playing.mediaName === "" ? "-" : playing.mediaName
                    })}
                  </p>
                  <p>
                    {t("scan.nowPlayingSystem", {
                      system:
                        playing.systemName === "" ? "-" : playing.systemName
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="p-3">
            <div className="flex flex-row items-center justify-between">
              <p className="font-bold capitalize text-gray-400">
                {t("scan.lastScannedHeading")}
              </p>
            </div>
            <div
              className={classNames({
                color: scanStatus === ScanResult.Success ? successColor : ""
              })}
            >
              <p>
                {t("scan.lastScannedTime", {
                  time:
                    lastToken.uid === "" && lastToken.text === ""
                      ? "-"
                      : new Date(lastToken.scanTime).toLocaleString()
                })}
              </p>
              <p style={{ wordBreak: "break-all" }}>
                {t("scan.lastScannedUid", {
                  uid:
                    lastToken.uid === "" || lastToken.uid === "__api__"
                      ? "-"
                      : lastToken.uid
                })}
                {lastToken.uid !== "" && lastToken.uid !== "__api__" && (
                  <CopyButton text={lastToken.uid} />
                )}
              </p>
              <p style={{ wordBreak: "break-all" }}>
                {t("scan.lastScannedText", {
                  text: lastToken.text === "" ? "-" : lastToken.text
                })}
                {lastToken.text !== "" && <CopyButton text={lastToken.text} />}
              </p>
            </div>
          </div>
        </div>
      </PageFrame>

      <SlideModal
        isOpen={historyOpen}
        close={() => setHistoryOpen(false)}
        title={t("scan.historyTitle")}
      >
        {history.data && (
          <div style={{ paddingBottom: safeInsets.bottom }}>
            {history.data.entries &&
              history.data.entries.map((item, i) => (
                <div
                  key={i}
                  className={classNames("text-sm")}
                  style={{
                    color: item.success ? "" : errorColor,
                    borderBottom:
                      i === history.data.entries.length - 1
                        ? ""
                        : "1px solid rgba(255,255,255,0.6)",
                    padding: "0.5rem"
                  }}
                >
                  <p>
                    {t("scan.lastScannedTime", {
                      time:
                        item.uid === "" && item.text === ""
                          ? "-"
                          : new Date(item.time).toLocaleString()
                    })}
                  </p>
                  <p style={{ wordBreak: "break-all" }}>
                    {t("scan.lastScannedUid", {
                      uid:
                        item.uid === "" || item.uid === "__api__"
                          ? "-"
                          : item.uid
                    })}
                    {item.text !== "" && item.uid !== "__api__" && (
                      <CopyButton text={item.text} />
                    )}
                  </p>
                  <p style={{ wordBreak: "break-all" }}>
                    {t("scan.lastScannedText", {
                      text: item.text === "" ? "-" : item.text
                    })}
                    {item.text !== "" && <CopyButton text={item.text} />}
                  </p>
                </div>
              ))}
          </div>
        )}
      </SlideModal>
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
      <PurchaseModal />
    </>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cancelSession, readTag, sessionManager, Status } from "../lib/nfc";
import { getDeviceAddress, CoreAPI } from "../lib/coreApi.ts";
import { Clipboard } from "@capacitor/clipboard";
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
import { ScanResult } from "../lib/models";
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
import { Purchases, PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { Preferences } from "@capacitor/preferences";
import { PageFrame } from "../components/PageFrame";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { claimLink } from "../lib/onlineApi.ts";

const writeToClipboard = async (s: string) => {
  await Clipboard.write({
    string: s
  });
};

const CopyButton = (props: { text: string }) => {
  const [display, setDisplay] = useState("Copy");

  return (
    <span
      className="ml-1 rounded-full border px-1"
      onClick={() => {
        writeToClipboard(props.text).then(() => {
          setDisplay("Copied");
          setTimeout(() => {
            setDisplay("Copy");
          }, 3000);
        });
      }}
    >
      {display}
    </span>
  );
};

const initData = {
  restartScan: false,
  launchOnScan: false,
  cameraDefault: false
};

export const Route = createFileRoute("/")({
  loader: async () => {
    initData.restartScan =
      (await Preferences.get({ key: "restartScan" })).value === "true";
    initData.launchOnScan =
      (await Preferences.get({ key: "launchOnScan" })).value === "true";
    initData.cameraDefault =
      (await Preferences.get({ key: "cameraDefault" })).value === "true";
  },
  component: Index
});

const statusTimeout = 3000;

function Index() {
  const connected = useStatusStore((state) => state.connected);
  const playing = useStatusStore((state) => state.playing);

  const lastToken = useStatusStore((state) => state.lastToken);
  const setLastToken = useStatusStore((state) => state.setLastToken);

  const [cameraMode, setCameraMode] = useState(initData.cameraDefault);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [scanSession, setScanSession] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanResult>(ScanResult.Default);

  const [restartScan, setRestartScan] = useState(initData.restartScan);
  useEffect(() => {
    sessionManager.setShouldRestart(restartScan);
  }, [restartScan]);

  const [launchOnScan, setLaunchOnScan] = useState(initData.launchOnScan);
  useEffect(() => {
    sessionManager.setLaunchOnScan(launchOnScan);
  }, [launchOnScan]);

  const [purchaseLauncherOpen, setPurchaseLauncherOpen] = useState(false);
  const [launcherAccess, setLauncherAccess] = useState(false);
  useEffect(() => {
    if (import.meta.env.DEV) {
      setLauncherAccess(true);
      return;
    }

    Preferences.get({ key: "launcherAccess" }).then((result) => {
      if (result.value) {
        setLauncherAccess(result.value === "true");
      }
    });
  }, []);

  // const loggedInUser = useStatusStore((state) => state.loggedInUser);

  const [claimOpen, setClaimOpen] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimId, setClaimId] = useState("");

  const { t } = useTranslation();

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

  const doScan = () => {
    setScanSession(true);

    readTag()
      .then((result) => {
        setScanStatus(ScanResult.Success);
        setTimeout(() => {
          setScanStatus(ScanResult.Default);
        }, statusTimeout);

        if (result.info.tag && (!sessionManager.launchOnScan || !connected)) {
          setLastToken({
            uid: result.info.tag.uid,
            text: result.info.tag.text,
            scanTime: new Date().toISOString(),
            type: ""
          });
        } else if (result.info.tag && sessionManager.launchOnScan) {
          CoreAPI.launch({
            uid: result.info.tag.uid,
            text: result.info.tag.text
          });
        } else {
          console.log("no tag found");
        }

        if (
          sessionManager.shouldRestart &&
          result.status === Status.Cancelled
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

        // let onlineId = "";
        // if (barcode.rawValue.startsWith("https://go.tapto.life/")) {
        //   onlineId = barcode.rawValue.replace("https://go.tapto.life/", "");
        // } else if (barcode.rawValue.startsWith("https://zpr.au/")) {
        //   onlineId = barcode.rawValue.replace("https://zpr.au/", "");
        // }

        // if (onlineId !== "") {
        //   toast.loading("Checking Zap Link...", {
        //     id: "checkZapLink"
        //   });
        //   checkLink(onlineId)
        //     .then((res) => {
        //       console.log(res);
        //       if (!res.claimed) {
        //         if (loggedInUser !== null) {
        //           toast.dismiss("checkZapLink");
        //           setClaimId(onlineId);
        //           setClaimOpen(true);
        //         }
        //         return;
        //       } else {
        //         toast.success("Zap!", {
        //           id: "checkZapLink"
        //         });
        //       }
        //
        //       let text = barcode.rawValue;
        //       if (res.actions.length > 0) {
        //         text = res.actions[0].value;
        //       }
        //       CoreAPI.launch({
        //         uid: barcode.rawValue,
        //         text: text
        //       });
        //     })
        //     .catch((e) => {
        //       toast.error("Error checking Zap Link", {
        //         id: "checkZapLink"
        //       });
        //       console.error(e);
        //     });
        //   return;
        // } else {
        CoreAPI.launch({
          uid: barcode.rawValue,
          text: barcode.rawValue
        });
        // }

        setLastToken({
          type: "Barcode",
          uid: barcode.rawValue,
          text: barcode.rawValue,
          scanTime: new Date().toISOString()
        });
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

  const [launcherPackage, setLauncherPackage] =
    useState<PurchasesPackage | null>(null);

  useEffect(() => {
    if (
      Capacitor.getPlatform() !== "ios" &&
      Capacitor.getPlatform() !== "android"
    ) {
      return;
    }

    Purchases.getOfferings()
      .then((offerings) => {
        if (
          offerings.current &&
          offerings.current.availablePackages.length > 0
        ) {
          setLauncherPackage(offerings.current.availablePackages[0]);
        } else {
          console.error("no launcher purchase package found");
        }
      })
      .catch((e) => {
        console.error("offerings error", e);
      });

    Purchases.getCustomerInfo()
      .then((info) => {
        if (info.customerInfo.entitlements.active.tapto_launcher) {
          setLauncherAccess(true);
          Preferences.set({
            key: "launcherAccess",
            value: "true"
          });
        } else {
          setLauncherAccess(false);
          Preferences.set({
            key: "launcherAccess",
            value: "false"
          });
          setLaunchOnScan(false);
          Preferences.set({
            key: "launchOnScan",
            value: "false"
          });
        }
      })
      .catch((e) => {
        console.error("customer info error", e);
      });
  }, [setLauncherAccess, setLaunchOnScan]);

  return (
    <>
      <PageFrame>
        <div className="flex flex-row justify-between">
          <Logo width="140px" />
          <ToggleChip
            icon={<HistoryIcon size="32" />}
            state={historyOpen}
            setState={(s) => {
              if (!historyOpen && purchaseLauncherOpen) {
                setPurchaseLauncherOpen(false);
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

        <div className="mb-9 mt-8 text-center">
          <div onClick={handleScanButton}>
            <ScanSpinner status={scanStatus} spinning={scanSession} />
          </div>
        </div>

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
                    if (launcherAccess) {
                      setLaunchOnScan(v);
                      Preferences.set({
                        key: "launchOnScan",
                        value: v.toString()
                      });
                    } else {
                      setPurchaseLauncherOpen(true);
                    }
                  }}
                />
              </div>

              <div className="p-3 pt-6">
                <div className="flex flex-row items-center justify-between">
                  <p className="text-gray-400 font-bold capitalize">
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
              <p className="text-gray-400 font-bold capitalize">
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
        isOpen={purchaseLauncherOpen}
        close={() => setPurchaseLauncherOpen(false)}
        title={t("scan.purchaseProTitle")}
      >
        <div className="flex flex-col justify-center gap-2 p-2">
          <div>
            {t("scan.purchaseProP1", {
              price: launcherPackage
                ? launcherPackage.product.priceString
                : "$6.99 USD"
            })}
          </div>
          <div className="pb-2">{t("scan.purchaseProP2")}</div>
          <Button
            label={t("scan.purchaseProAction")}
            disabled={!launcherPackage}
            onClick={() => {
              if (launcherPackage) {
                Purchases.purchasePackage({ aPackage: launcherPackage })
                  .then((purchase) => {
                    console.log("purchase success", purchase);
                    setLauncherAccess(true);
                    Preferences.set({
                      key: "launcherAccess",
                      value: "true"
                    });
                    setLaunchOnScan(true);
                    Preferences.set({
                      key: "launchOnScan",
                      value: "true"
                    });
                    setPurchaseLauncherOpen(false);
                  })
                  .catch((e) => {
                    console.error("purchase error", e);
                  });
              }
            }}
          />
        </div>
      </SlideModal>

      <SlideModal
        isOpen={historyOpen}
        close={() => setHistoryOpen(false)}
        title={t("scan.historyTitle")}
      >
        {history.data && (
          <div style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
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

      <SlideModal
        isOpen={claimOpen}
        close={() => setClaimOpen(false)}
        title="Claim Zap Link"
      >
        <div className="flex flex-col justify-center gap-2 p-2">
          <div className="pb-2">
            This Zap Link has not been claimed. Add it to your Zaparoo Online
            account?
          </div>
          <Button
            label="Claim Zap Link"
            disabled={claimLoading}
            onClick={() => {
              setClaimLoading(true);
              claimLink(claimId)
                .then((res) => {
                  console.log(res);
                  setClaimOpen(false);
                  setClaimId("");
                  if (res.claimed) {
                    toast.success("Zap Link is yours!", {
                      id: "claimZapLink"
                    });
                  } else {
                    toast.error("Error claiming Zap Link", {
                      id: "claimZapLink"
                    });
                  }
                  setClaimLoading(false);
                })
                .catch((e) => {
                  console.error(e);
                  toast.error("Error claiming Zap Link", {
                    id: "claimZapLink"
                  });
                  setClaimLoading(false);
                });
            }}
          />
        </div>
      </SlideModal>
    </>
  );
}

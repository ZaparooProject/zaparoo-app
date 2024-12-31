import { createFileRoute, Link } from "@tanstack/react-router";
import { getDeviceAddress, setDeviceAddress, CoreAPI } from "../lib/coreApi.ts";
import { CheckIcon, DatabaseIcon, ExternalIcon, NextIcon } from "../lib/images";
import { Button } from "../components/wui/Button";
import classNames from "classnames";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TextInput } from "../components/wui/TextInput";
import { useStatusStore } from "../lib/store";
import { Browser } from "@capacitor/browser";
import { PageFrame } from "../components/PageFrame";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { Purchases, PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { Preferences } from "@capacitor/preferences";
import toast from "react-hot-toast";
import { Capacitor } from "@capacitor/core";
import { SlideModal } from "../components/SlideModal.tsx";
import { UpdateSettingsRequest } from "../lib/models.ts";
// import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

export const Route = createFileRoute("/settings/")({
  component: Settings
});

// const signInWithEmailAndPassword = async (email: string, password: string) => {
//   const result = await FirebaseAuthentication.signInWithEmailAndPassword({
//     email: email,
//     password: password
//   });
//   return result.user;
// };

function Settings() {
  const connected = useStatusStore((state) => state.connected);
  const connectionError = useStatusStore((state) => state.connectionError);
  const gamesIndex = useStatusStore((state) => state.gamesIndex);

  const [address, setAddress] = useState(getDeviceAddress());

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => CoreAPI.settings()
  });

  const { t } = useTranslation();

  const update = useMutation({
    mutationFn: (params: UpdateSettingsRequest) =>
      CoreAPI.settingsUpdate(params),
    onSuccess: () => {
      settings.refetch();
    }
  });

  const [launcherPackage, setLauncherPackage] =
    useState<PurchasesPackage | null>(null);
  const [launcherAccess, setLauncherAccess] = useState(false);
  const [purchaseLauncherOpen, setPurchaseLauncherOpen] = useState(false);

  // const [onlineUsername, setOnlineUsername] = useState("");
  // const [onlinePassword, setOnlinePassword] = useState("");
  // const [onlineLoggingIn, setOnlineLoggingIn] = useState(false);
  // const loggedInUser = useStatusStore((state) => state.loggedInUser);
  // const setLoggedInUser = useStatusStore((state) => state.setLoggedInUser);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
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
        }
      })
      .catch((e) => {
        console.error("customer info error", e);
      });
  }, []);

  return (
    <>
      <PageFrame title={t("settings.title")}>
        <div className="flex flex-col gap-5">
          <TextInput
            label={t("settings.device")}
            placeholder="192.168.1.23"
            value={address}
            setValue={setAddress}
            saveValue={(v) => {
              setDeviceAddress(v);
              location.reload();
            }}
          />

          {connectionError !== "" && (
            <div className="text-error">{connectionError}</div>
          )}

          <div>
            <span>{t("settings.modeLabel")}</span>
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
                    "bg-button-pattern":
                      settings.data?.readersScanMode === "tap" && connected
                  },
                  {
                    "bg-background": !connected,
                    "border-foreground-disabled": !connected,
                    "text-foreground-disabled": !connected
                  }
                )}
                onClick={() => update.mutate({ readersScanMode: "tap" })}
              >
                {settings.data?.readersScanMode === "tap" && connected && (
                  <CheckIcon size="28" />
                )}
                {t("settings.tapMode")}
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
                    "bg-button-pattern":
                      settings.data?.readersScanMode === "hold" && connected
                  },
                  {
                    "bg-background": !connected,
                    "border-foreground-disabled": !connected,
                    "text-foreground-disabled": !connected
                  }
                )}
                onClick={() => update.mutate({ readersScanMode: "hold" })}
              >
                {settings.data?.readersScanMode === "hold" && connected && (
                  <CheckIcon size="28" />
                )}
                {t("settings.insertMode")}
              </button>
            </div>
            {settings.data?.readersScanMode === "hold" && connected && (
              <p className="pt-1 text-sm">{t("settings.insertHelp")}</p>
            )}
          </div>

          <div>
            <Button
              label={t("settings.updateDb")}
              icon={<DatabaseIcon size="20" />}
              className="w-full"
              disabled={!connected || gamesIndex.indexing}
              onClick={() => CoreAPI.mediaIndex()}
            />
          </div>

          <div>
            <Button
              label={t("settings.designer")}
              className="w-full"
              icon={<ExternalIcon size="20" />}
              onClick={() =>
                Browser.open({ url: "https://design.zaparoo.org" })
              }
            />
          </div>

          <Button
            label={t("scan.purchaseProAction")}
            disabled={!launcherPackage || launcherAccess}
            onClick={() => setPurchaseLauncherOpen(true)}
          />

          <Button
            label={t("settings.advanced.restorePurchases")}
            className="w-full"
            onClick={() => {
              Purchases.restorePurchases()
                .then(() => {
                  Purchases.getCustomerInfo()
                    .then((info) => {
                      if (
                        info.customerInfo.entitlements.active.tapto_launcher
                      ) {
                        Preferences.set({
                          key: "launcherAccess",
                          value: "true"
                        });
                      } else {
                        Preferences.set({
                          key: "launcherAccess",
                          value: "false"
                        });
                        Preferences.set({
                          key: "launchOnScan",
                          value: "false"
                        });
                      }
                      location.reload();
                    })
                    .catch((e) => {
                      console.error("customer info error", e);
                    });
                  toast.success((to) => (
                    <span
                      className="flex flex-grow flex-col"
                      onClick={() => toast.dismiss(to.id)}
                    >
                      {t("settings.advanced.restoreSuccess")}
                    </span>
                  ));
                })
                .catch(() => {
                  toast.error((to) => (
                    <span
                      className="flex flex-grow flex-col"
                      onClick={() => toast.dismiss(to.id)}
                    >
                      {t("settings.advanced.restoreFail")}
                    </span>
                  ));
                });
            }}
          />

          {/*{loggedInUser !== null ? (*/}
          {/*  <div className="flex flex-col gap-3">*/}
          {/*    <Button*/}
          {/*      label={t("online.logout")}*/}
          {/*      onClick={() => {*/}
          {/*        FirebaseAuthentication.signOut()*/}
          {/*          .then(() => {*/}
          {/*            setLoggedInUser(null);*/}
          {/*          })*/}
          {/*          .catch((e) => {*/}
          {/*            console.error(e);*/}
          {/*          });*/}
          {/*      }}*/}
          {/*      className="w-full"*/}
          {/*    />*/}
          {/*  </div>*/}
          {/*) : (*/}
          {/*  <div className="flex flex-col gap-3">*/}
          {/*    <TextInput*/}
          {/*      label={t("online.email")}*/}
          {/*      placeholder="your@email.com"*/}
          {/*      value={onlineUsername}*/}
          {/*      setValue={setOnlineUsername}*/}
          {/*    />*/}
          {/*    <TextInput*/}
          {/*      label={t("online.password")}*/}
          {/*      placeholder=""*/}
          {/*      type="password"*/}
          {/*      value={onlinePassword}*/}
          {/*      setValue={setOnlinePassword}*/}
          {/*    />*/}
          {/*    <Button*/}
          {/*      label={t("online.login")}*/}
          {/*      onClick={() => {*/}
          {/*        setOnlineLoggingIn(true);*/}
          {/*        signInWithEmailAndPassword(onlineUsername, onlinePassword)*/}
          {/*          .then((result) => {*/}
          {/*            if (result) {*/}
          {/*              toast.success(t("online.loginSuccess"));*/}
          {/*            } else {*/}
          {/*              toast.error(t("online.loginWrong"));*/}
          {/*            }*/}
          {/*            setLoggedInUser(result);*/}
          {/*            setOnlineLoggingIn(false);*/}
          {/*          })*/}
          {/*          .catch((e) => {*/}
          {/*            console.error(e);*/}
          {/*            toast.error(t("online.loginFail"));*/}
          {/*            setOnlineLoggingIn(false);*/}
          {/*            setLoggedInUser(null);*/}
          {/*          });*/}
          {/*      }}*/}
          {/*      disabled={!onlineUsername || !onlinePassword || onlineLoggingIn}*/}
          {/*      className="w-full"*/}
          {/*    />*/}
          {/*  </div>*/}
          {/*)}*/}

          <div className="flex flex-col">
            <label className="text-white">{t("settings.language")}</label>
            <select
              className="rounded-md border border-solid border-bd-input bg-background p-3 text-foreground"
              value={i18n.languages[0]}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
            >
              <option value="en-GB">English (UK)</option>
              <option value="en-US">English (US)</option>
              <option value="fr-FR">Français</option>
              <option value="nl-NL">Nederlands</option>
              <option value="ko-KR">한국어</option>
              <option value="zh-CN">中文</option>
            </select>
          </div>

          <Link to="/settings/advanced">
            <div className="flex flex-row items-center justify-between">
              <p>{t("settings.advanced.title")}</p>
              <NextIcon size="20" />
            </div>
          </Link>

          <Link to="/settings/help">
            <div className="flex flex-row items-center justify-between">
              <p>{t("settings.help.title")}</p>
              <NextIcon size="20" />
            </div>
          </Link>

          <Link to="/settings/about">
            <div className="flex flex-row items-center justify-between">
              <p>{t("settings.about.title")}</p>
              <NextIcon size="20" />
            </div>
          </Link>
        </div>
      </PageFrame>

      <SlideModal
        isOpen={purchaseLauncherOpen}
        close={() => setPurchaseLauncherOpen(false)}
        title={t("scan.purchaseProTitle")}
      >
        <div className="flex flex-col justify-center gap-2 p-2">
          <div>{t("scan.purchaseProP1")}</div>
          <div className="pb-2">
            {t("scan.purchaseProP2", {
              price: launcherPackage
                ? launcherPackage.product.priceString
                : "$6.99 USD"
            })}
          </div>
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
    </>
  );
}

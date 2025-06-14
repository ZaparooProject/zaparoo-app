import { createFileRoute, Link } from "@tanstack/react-router";
import { getDeviceAddress, setDeviceAddress, CoreAPI } from "../lib/coreApi.ts";
import { CheckIcon, DatabaseIcon, ExternalIcon, NextIcon } from "../lib/images";
import { Button } from "../components/wui/Button";
import { Button as SCNButton } from "@/components/ui/button";
import classNames from "classnames";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TextInput } from "../components/wui/TextInput";
import { useStatusStore } from "../lib/store";
import { Browser } from "@capacitor/browser";
import { PageFrame } from "../components/PageFrame";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { Capacitor } from "@capacitor/core";
import { UpdateSettingsRequest } from "../lib/models.ts";
import {
  RestorePuchasesButton,
  useProPurchase
} from "@/components/ProPurchase.tsx";
import { Preferences } from "@capacitor/preferences";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog.tsx";
import { ArrowLeftRightIcon, TrashIcon } from "lucide-react";

export const Route = createFileRoute("/settings/")({
  component: Settings
});

function Settings() {
  const { PurchaseModal, setProPurchaseModalOpen, proAccess } =
    useProPurchase();

  const connected = useStatusStore((state) => state.connected);
  const connectionError = useStatusStore((state) => state.connectionError);
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  // const loggedInUser = useStatusStore((state) => state.loggedInUser);
  const deviceHistory = useStatusStore((state) => state.deviceHistory);
  const setDeviceHistory = useStatusStore((state) => state.setDeviceHistory);
  const removeDeviceHistory = useStatusStore(
    (state) => state.removeDeviceHistory
  );

  const [address, setAddress] = useState(getDeviceAddress());
  const [historyOpen, setHistoryOpen] = useState(false);

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => CoreAPI.settings()
  });

  const { t } = useTranslation();

  useEffect(() => {
    Preferences.get({ key: "deviceHistory" }).then((v) => {
      if (v.value) {
        setDeviceHistory(JSON.parse(v.value));
      }
    });
  }, []);

  const update = useMutation({
    mutationFn: (params: UpdateSettingsRequest) =>
      CoreAPI.settingsUpdate(params),
    onSuccess: () => {
      settings.refetch();
    }
  });

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

          {deviceHistory.length > 0 && (
            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
              <DialogTrigger asChild>
                <Button
                  icon={<ArrowLeftRightIcon size="20" />}
                  label={t("settings.deviceHistory")}
                  className="w-full"
                  onClick={() => setHistoryOpen(true)}
                />
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("settings.deviceHistory")}</DialogTitle>
                </DialogHeader>
                {deviceHistory
                  .sort((a, b) => (a.address > b.address ? 1 : -1))
                  .map((entry) => (
                    <div className="flex flex-row items-center justify-between gap-3">
                      <SCNButton
                        className="w-full"
                        key={entry.address}
                        onClick={() => {
                          setDeviceAddress(entry.address);
                          location.reload();
                        }}
                        variant="outline"
                      >
                        {entry.address}
                      </SCNButton>
                      <SCNButton
                        variant="ghost"
                        size="icon"
                        color="danger"
                        onClick={() => removeDeviceHistory(entry.address)}
                      >
                        <TrashIcon size="20" />
                      </SCNButton>
                    </div>
                  ))}
              </DialogContent>
            </Dialog>
          )}

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

          {!Capacitor.isNativePlatform() && (
            <div>
              <Button
                label={t("settings.getApp")}
                className="w-full"
                icon={<ExternalIcon size="20" />}
                onClick={() => Browser.open({ url: "https://zaparoo.app" })}
              />
            </div>
          )}

          {Capacitor.isNativePlatform() && (
            <div className="flex flex-col gap-5">
              <Button
                label={t("scan.purchaseProAction")}
                disabled={proAccess}
                onClick={() => setProPurchaseModalOpen(true)}
              />
              <RestorePuchasesButton />
            </div>
          )}

          {/* <div>
            {loggedInUser !== null ? (
              <div className="flex flex-col gap-3">
                <Link to="/settings/online">
                  <Button
                    label={t("online.settingsManageButton")}
                    className="w-full"
                  />
                </Link>
              </div>
            ) : (
              <Link to="/settings/online">
                <Button
                  label={t("online.settingsSignInButton")}
                  className="w-full"
                />
              </Link>
            )}
          </div> */}

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
              <option value="ja-JP">日本語</option>
              <option value="ko-KR">한국어</option>
              <option value="zh-CN">中文</option>
              <option value="de-DE">Deutsch</option>
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

      <PurchaseModal />
    </>
  );
}

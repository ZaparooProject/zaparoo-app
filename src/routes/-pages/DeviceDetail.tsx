import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useStatusStore } from "@/lib/store";
import { useConnection } from "@/hooks/useConnection";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useSelectDevice } from "@/hooks/useSelectDevice";
import { CoreAPI, getDeviceAddress, setDeviceAddress } from "@/lib/coreApi";
import { normalizeDeviceKey } from "@/lib/crypto/credentials";
import { decodeDeviceAddress } from "@/lib/deviceUrl";
import { PageFrame } from "@/components/PageFrame";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { Button } from "@/components/wui/Button";
import { TextInput } from "@/components/wui/TextInput";
import { SlideModal } from "@/components/SlideModal";
import { BackIcon } from "@/lib/images";
import { Route } from "@/routes/settings.devices_.$address";

export function DeviceDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = Route.useParams();
  const decoded = useMemo(() => {
    try {
      return decodeDeviceAddress(params.address);
    } catch {
      return "";
    }
  }, [params.address]);

  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  const deviceHistory = useStatusStore((s) => s.deviceHistory);
  const removeDeviceHistory = useStatusStore((s) => s.removeDeviceHistory);
  const updateDeviceHistoryMeta = useStatusStore(
    (s) => s.updateDeviceHistoryMeta,
  );
  const setTargetDeviceAddress = useStatusStore(
    (s) => s.setTargetDeviceAddress,
  );
  const resetConnectionState = useStatusStore((s) => s.resetConnectionState);

  const entry = deviceHistory.find((e) => e.address === decoded);
  const { isConnected } = useConnection();
  const { selectDevice } = useSelectDevice();

  const headingTitle = entry?.name ?? entry?.address ?? decoded;
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(headingTitle);

  const initialName = entry?.name ?? "";
  const [draftName, setDraftName] = useState(initialName);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!entry) {
      router.navigate({ to: "/settings/devices", replace: true });
    }
  }, [entry, router]);

  if (!entry) return null;

  const isCurrentDevice =
    normalizeDeviceKey(entry.address) ===
    normalizeDeviceKey(getDeviceAddress());
  const isActive = isCurrentDevice && isConnected;

  const handleSaveName = (next: string) => {
    const trimmed = next.trim();
    updateDeviceHistoryMeta(
      entry.address,
      { name: trimmed === "" ? undefined : trimmed },
      { source: "manual" },
    );
  };

  const handleUseThisDevice = () => {
    selectDevice(entry.address);
    router.navigate({ to: "/settings" });
  };

  const handleConfirmForget = () => {
    const wasCurrent = isCurrentDevice;
    removeDeviceHistory(entry.address);
    if (wasCurrent) {
      setDeviceAddress("");
      setTargetDeviceAddress("");
      resetConnectionState();
      CoreAPI.reset();
    }
    setConfirmOpen(false);
    router.navigate({ to: "/settings/devices", replace: true });
  };

  const lastConnectedLine =
    entry.lastConnectedAt !== undefined
      ? t("settings.deviceDetail.lastConnected", {
          when: new Date(entry.lastConnectedAt).toLocaleString(),
        })
      : t("settings.deviceDetail.neverConnected");

  return (
    <PageFrame
      {...swipeHandlers}
      headerLeft={
        <HeaderButton
          onClick={goBack}
          icon={<BackIcon size="24" />}
          aria-label={t("nav.back")}
        />
      }
      headerCenter={
        <h1
          ref={headingRef}
          className="text-foreground flex min-w-0 items-center gap-2 text-xl"
          title={headingTitle}
        >
          {isActive && (
            <span
              aria-label={t("settings.activeDevice")}
              style={{ backgroundColor: "var(--color-success)" }}
              className="h-2 w-2 shrink-0 rounded-full"
            />
          )}
          <span className="truncate">{headingTitle}</span>
        </h1>
      }
    >
      <div className="flex flex-col gap-6 p-3">
        <TextInput
          label={t("settings.deviceDetail.nameLabel")}
          placeholder={entry.address}
          value={draftName}
          setValue={setDraftName}
          saveValue={handleSaveName}
          saveDisabled={draftName.trim() === initialName.trim()}
          maxLength={120}
        />

        <section aria-labelledby="device-info-heading">
          <h2
            id="device-info-heading"
            className="font-bold text-gray-400 capitalize"
          >
            {t("settings.deviceDetail.infoHeading")}
          </h2>
          <p style={{ wordBreak: "break-all" }}>
            {t("settings.deviceDetail.address", { value: entry.address })}
          </p>
          {entry.platform && (
            <p>
              {t("settings.deviceDetail.platform", { value: entry.platform })}
            </p>
          )}
          {entry.version && (
            <p>
              {t("settings.deviceDetail.version", { value: entry.version })}
            </p>
          )}
          <p>{lastConnectedLine}</p>
        </section>

        {!isActive && (
          <Button
            label={t("settings.deviceDetail.useThisDevice")}
            intent="primary"
            onClick={handleUseThisDevice}
            className="w-full"
          />
        )}

        <Button
          label={t("settings.deviceDetail.forget")}
          variant="outline"
          onClick={() => setConfirmOpen(true)}
          className="w-full"
        />
      </div>

      <SlideModal
        isOpen={confirmOpen}
        close={() => setConfirmOpen(false)}
        title={t("settings.deviceDetail.forgetTitle")}
      >
        <div className="flex flex-col gap-4 py-4">
          <p className="text-center">{t("settings.deviceDetail.forgetBody")}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              label={t("settings.deviceDetail.forgetCancel")}
              onClick={() => setConfirmOpen(false)}
              className="flex-1"
            />
            <Button
              variant="outline"
              intent="destructive"
              label={t("settings.deviceDetail.forgetConfirm")}
              onClick={handleConfirmForget}
              className="border-error text-error flex-1"
            />
          </div>
        </div>
      </SlideModal>
    </PageFrame>
  );
}

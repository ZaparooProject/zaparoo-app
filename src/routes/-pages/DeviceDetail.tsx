import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  useConnection,
  useDeviceConnectionActions,
} from "@/hooks/useConnection";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useSelectDevice } from "@/hooks/useSelectDevice";
import {
  deviceRegistry,
  parsedEndpointForRecord,
  useDeviceRegistry,
  type DeviceRecord,
} from "@/lib/devices/deviceRegistry";
import { invalidateLibraryImageCache } from "@/lib/libraryImageCache";
import { PageFrame } from "@/components/PageFrame";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { Button } from "@/components/wui/Button";
import { TextInput } from "@/components/wui/TextInput";
import { SlideModal } from "@/components/SlideModal";
import { BackIcon } from "@/lib/images";
import { Route } from "@/routes/settings.devices_.$recordId";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";

const selectRecords = (state: { records: Record<string, DeviceRecord> }) =>
  state.records;
const selectActiveRecordId = (state: { activeRecordId: string | null }) =>
  state.activeRecordId;
/**
 * True once the stored devices have been read, either successfully or not.
 * A failed read never becomes hydrated, so waiting on `hydrated` alone would
 * leave this page blank for good.
 */
const selectRegistrySettled = (state: {
  hydrated: boolean;
  hydrationError: string | null;
}) => state.hydrated || state.hydrationError !== null;

export function DeviceDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = Route.useParams();
  const records = useDeviceRegistry(selectRecords);
  const activeRecordId = useDeviceRegistry(selectActiveRecordId);
  const registrySettled = useDeviceRegistry(selectRegistrySettled);

  const goBack = () =>
    void router.navigate(appBackNavigationOptions("/settings/devices"));

  const record = records[params.recordId];
  const endpoint = parsedEndpointForRecord(record);
  const { isConnected } = useConnection();
  const { forgetDevice } = useDeviceConnectionActions();
  const { selectRecord } = useSelectDevice();

  const headingTitle = record?.name ?? endpoint?.address ?? "";
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(headingTitle);

  const initialName = record?.name ?? "";
  const [draftName, setDraftName] = useState(initialName);
  const [trackedRecordId, setTrackedRecordId] = useState(record?.recordId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [forgetting, setForgetting] = useState(false);

  // Reset the draft when navigating between different device records.
  if (record?.recordId !== trackedRecordId) {
    setTrackedRecordId(record?.recordId);
    setDraftName(initialName);
  }

  // Records arrive asynchronously, so a page opened cold — a deep link, or a
  // reload sitting on this route — has no record yet through no fault of the
  // id in the URL. Redirecting before the read has settled would bounce the
  // user off a device that was about to appear.
  useEffect(() => {
    if (!forgetting && registrySettled && (!record || !endpoint)) {
      router.navigate({ to: "/settings/devices", replace: true });
    }
  }, [endpoint, forgetting, record, registrySettled, router]);

  if (!record || !endpoint) return null;

  const isCurrentDevice = activeRecordId === record.recordId;
  const isActive = isCurrentDevice && isConnected;

  const handleSaveName = (next: string) => {
    void deviceRegistry.setCustomName(record.recordId, next);
  };

  const handleUseThisDevice = () => {
    void selectRecord(record.recordId);
    router.navigate({ to: "/settings" });
  };

  const handleConfirmForget = async () => {
    if (forgetting) return;
    setForgetting(true);

    try {
      await forgetDevice(record.recordId);
      invalidateLibraryImageCache(record.recordId);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey.includes(record.recordId),
      });
      setConfirmOpen(false);
      router.navigate({ to: "/settings/devices", replace: true });
    } catch {
      // Registry writes roll back automatically. Credential cleanup failures
      // leave the record unchanged, so the user can retry from the same
      // confirmation instead of receiving a false success.
      setForgetting(false);
      toast.error(t("settings.deviceDetail.forgetFailed"));
    }
  };

  const lastConnectedLine =
    record.lastConnectedAt !== undefined
      ? t("settings.deviceDetail.lastConnected", {
          when: new Date(record.lastConnectedAt).toLocaleString(),
        })
      : t("settings.deviceDetail.neverConnected");

  return (
    <PageFrame
      onSwipeBack={goBack}
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
          placeholder={endpoint.address}
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
            {t("settings.deviceDetail.address", { value: endpoint.address })}
          </p>
          {record.platform && (
            <p>
              {t("settings.deviceDetail.platform", { value: record.platform })}
            </p>
          )}
          {record.version && (
            <p>
              {t("settings.deviceDetail.version", { value: record.version })}
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
        close={() => {
          if (!forgetting) setConfirmOpen(false);
        }}
        title={t("settings.deviceDetail.forgetTitle")}
      >
        <div className="flex flex-col gap-4 py-4">
          <p className="text-center">{t("settings.deviceDetail.forgetBody")}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              label={t("settings.deviceDetail.forgetCancel")}
              onClick={() => setConfirmOpen(false)}
              disabled={forgetting}
              className="flex-1"
            />
            <Button
              variant="outline"
              intent="destructive"
              label={t("settings.deviceDetail.forgetConfirm")}
              onClick={() => void handleConfirmForget()}
              disabled={forgetting}
              className={
                forgetting ? "flex-1" : "border-error text-error flex-1"
              }
            />
          </div>
        </div>
      </SlideModal>
    </PageFrame>
  );
}

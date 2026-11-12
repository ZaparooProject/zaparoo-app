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
import {
  credentialKeyForRecord,
  credentialStore,
} from "@/lib/crypto/credentials";
import { invalidateLibraryImageCache } from "@/lib/libraryImageCache";
import { logger } from "@/lib/logger";
import { DeviceRow } from "@/components/DeviceRow";
import { PageFrame } from "@/components/PageFrame";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { Card } from "@/components/wui/Card";
import { Button } from "@/components/wui/Button";
import { ModalActionBar } from "@/components/wui/ModalActionBar";
import { TextInput } from "@/components/wui/TextInput";
import { SlideModal } from "@/components/SlideModal";
import { formatAppDateTime } from "@/lib/formatDate";
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
  const address =
    endpoint?.address ??
    (record?.ble ? t("settings.bluetoothScan.viaBluetooth") : null);
  const { isConnected, activeConnection } = useConnection();
  const { forgetDevice } = useDeviceConnectionActions();
  const { selectRecord } = useSelectDevice();

  const headingTitle = record?.name || address || "";
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(headingTitle);

  const initialName = record?.name ?? "";
  const [draftName, setDraftName] = useState(initialName);
  const [trackedRecordId, setTrackedRecordId] = useState(record?.recordId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [combineOpen, setCombineOpen] = useState(false);
  const [combineWithId, setCombineWithId] = useState<string | null>(null);
  const [combineFailed, setCombineFailed] = useState(false);
  const [isCombining, setIsCombining] = useState(false);

  // Reset the draft when navigating between different device records. The
  // page is reused for the next record, so a combine that left for the
  // record it kept has to stop being busy here.
  if (record?.recordId !== trackedRecordId) {
    setTrackedRecordId(record?.recordId);
    setDraftName(initialName);
    if (record) setIsCombining(false);
  }

  // Records arrive asynchronously, so a page opened cold — a deep link, or a
  // reload sitting on this route — has no record yet through no fault of the
  // id in the URL. Redirecting before the read has settled would bounce the
  // user off a device that was about to appear.
  useEffect(() => {
    if (
      !forgetting &&
      !isCombining &&
      registrySettled &&
      (!record || !address)
    ) {
      router.navigate({ to: "/settings/devices", replace: true });
    }
  }, [address, forgetting, isCombining, record, registrySettled, router]);

  if (!record || !address) return null;

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

  const nameOf = (other: DeviceRecord) =>
    other.name ||
    parsedEndpointForRecord(other)?.address ||
    t("settings.bluetoothScan.unnamed");
  const otherRecords = Object.values(records)
    .filter((other) => other.recordId !== record.recordId)
    .sort(
      (left, right) =>
        (right.lastConnectedAt ?? 0) - (left.lastConnectedAt ?? 0),
    );
  const otherNameCounts = new Map<string, number>();
  for (const other of otherRecords) {
    const name = nameOf(other);
    otherNameCounts.set(name, (otherNameCounts.get(name) ?? 0) + 1);
  }
  /** Platform, plus what tells this record apart from one with its name. */
  const detailOf = (other: DeviceRecord) => {
    const name = nameOf(other);
    const distinction =
      parsedEndpointForRecord(other)?.address ??
      t("settings.bluetoothScan.viaBluetooth");
    return [
      other.platform,
      (otherNameCounts.get(name) ?? 0) > 1 && distinction !== name
        ? distinction
        : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const combineWith = combineWithId ? records[combineWithId] : undefined;

  const closeCombine = () => {
    if (isCombining) return;
    setCombineOpen(false);
    setCombineWithId(null);
    setCombineFailed(false);
  };

  const handleConfirmCombine = async () => {
    if (!combineWith || isCombining) return;
    setIsCombining(true);
    setCombineFailed(false);
    // Once this page's own record is merged away the page is leaving, and
    // the redirect for a missing record must not run over that navigation.
    let leaving = false;
    try {
      // The record that survives is the one in use, else one that holds a
      // pairing, else the one this page is showing.
      let keepOther = combineWith.recordId === activeRecordId;
      if (!keepOther && !isCurrentDevice) {
        const paired = new Set(
          (await credentialStore.list()).map((entry) => entry.deviceKey),
        );
        const hasCredentials = (candidate: DeviceRecord) =>
          paired.has(credentialKeyForRecord(candidate.recordId)) ||
          (candidate.legacyCredentialKey !== undefined &&
            paired.has(candidate.legacyCredentialKey));
        keepOther = !hasCredentials(record) && hasCredentials(combineWith);
      }
      const target = keepOther ? combineWith : record;
      const source = keepOther ? record : combineWith;
      await deviceRegistry.mergeRecords(target.recordId, source.recordId);
      for (const recordId of [target.recordId, source.recordId]) {
        invalidateLibraryImageCache(recordId);
        queryClient.removeQueries({
          predicate: (query) => query.queryKey.includes(recordId),
        });
      }
      setCombineOpen(false);
      setCombineWithId(null);
      if (keepOther) {
        leaving = true;
        router.navigate({
          to: "/settings/devices/$recordId",
          params: { recordId: target.recordId },
          replace: true,
        });
      }
    } catch (error) {
      logger.error("Failed to combine device records", error, {
        category: "storage",
        action: "combineDeviceRecords",
        severity: "error",
        recordId: record.recordId,
        otherRecordId: combineWith.recordId,
      });
      setCombineFailed(true);
    } finally {
      if (!leaving) setIsCombining(false);
    }
  };

  const lastConnectedLine =
    record.lastConnectedAt !== undefined
      ? t("settings.deviceDetail.lastConnected", {
          when: formatAppDateTime(record.lastConnectedAt) ?? "",
        })
      : t("settings.deviceDetail.neverConnected");

  return (
    <PageFrame
      headerMode="content-wide"
      breadcrumbs={[
        { to: "/settings", label: t("settings.title") },
        { to: "/settings/devices", label: t("scan.deviceSheetAllDevices") },
      ]}
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
          className="flex min-w-0 items-center gap-2"
          title={headingTitle}
        >
          {isActive && (
            <span
              role="img"
              aria-label={t("settings.activeDevice")}
              className="bg-success h-2 w-2 shrink-0 rounded-full"
            />
          )}
          <span className="truncate">{headingTitle}</span>
        </h1>
      }
    >
      <Card className="flex flex-col gap-4">
        <TextInput
          label={t("settings.deviceDetail.nameLabel")}
          placeholder={address}
          value={draftName}
          setValue={setDraftName}
          saveValue={handleSaveName}
          saveDisabled={draftName.trim() === initialName.trim()}
          maxLength={120}
        />

        <section aria-labelledby="device-info-heading">
          <h2
            id="device-info-heading"
            className="text-foreground mb-2 text-lg font-semibold"
          >
            {t("settings.deviceDetail.infoHeading")}
          </h2>
          <p className="break-all">
            {t("settings.deviceDetail.address", { value: address })}
          </p>
          {isActive && activeConnection?.link && (
            <p>
              {t("settings.deviceDetail.link", {
                value: t(
                  activeConnection.link === "bluetooth"
                    ? "connection.linkBluetooth"
                    : "connection.linkWifi",
                ),
              })}
            </p>
          )}
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

        {otherRecords.length > 0 && (
          <Button
            label={t("settings.deviceCombine.open")}
            variant="outline"
            onClick={() => setCombineOpen(true)}
            className="w-full"
          />
        )}

        <Button
          label={t("settings.deviceDetail.forget")}
          variant="outline"
          intent="destructive"
          onClick={() => setConfirmOpen(true)}
          className="w-full"
        />
      </Card>

      <SlideModal
        isOpen={confirmOpen}
        close={() => {
          if (!forgetting) setConfirmOpen(false);
        }}
        dismissible={!forgetting}
        title={t("settings.deviceDetail.forgetTitle")}
        footer={
          <ModalActionBar
            secondaryAction={
              <Button
                variant="secondary"
                label={t("settings.deviceDetail.forgetCancel")}
                onClick={() => setConfirmOpen(false)}
                disabled={forgetting}
                disabledAppearance="busy"
              />
            }
            primaryAction={
              <Button
                variant="outline"
                intent="destructive"
                label={t("settings.deviceDetail.forgetConfirm")}
                onClick={() => void handleConfirmForget()}
                disabled={forgetting}
                disabledAppearance="busy"
              />
            }
          />
        }
      >
        <p className="py-4 text-center">
          {t("settings.deviceDetail.forgetBody")}
        </p>
      </SlideModal>

      <SlideModal
        isOpen={combineOpen}
        close={closeCombine}
        dismissible={!isCombining}
        title={t(
          combineWith
            ? "settings.deviceCombine.title"
            : "settings.deviceCombine.choose",
        )}
        footer={
          combineWith ? (
            <ModalActionBar
              secondaryAction={
                <Button
                  variant="secondary"
                  label={t("settings.deviceCombine.cancel")}
                  onClick={closeCombine}
                  disabled={isCombining}
                  disabledAppearance="busy"
                />
              }
              primaryAction={
                <Button
                  intent="primary"
                  label={t("settings.deviceCombine.confirm")}
                  onClick={() => void handleConfirmCombine()}
                  disabled={isCombining}
                  disabledAppearance="busy"
                />
              }
            />
          ) : undefined
        }
      >
        {combineWith ? (
          <div className="flex flex-col gap-4 py-4 text-center">
            <p>
              {t("settings.deviceCombine.body", {
                first: nameOf(record),
                second: nameOf(combineWith),
              })}
            </p>
            {combineFailed && (
              <p className="text-error text-sm" role="alert">
                {t("settings.deviceCombine.failed")}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 py-2">
            {otherRecords.map((other) => {
              const detail = detailOf(other);
              return (
                <DeviceRow
                  key={other.recordId}
                  entry={{
                    name: nameOf(other),
                    ...(detail ? { detail } : {}),
                  }}
                  onSelect={() => setCombineWithId(other.recordId)}
                />
              );
            })}
          </div>
        )}
      </SlideModal>
    </PageFrame>
  );
}

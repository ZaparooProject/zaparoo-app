import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CameraIcon, NfcIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { TextInput } from "@/components/wui/TextInput.tsx";
import { ZapScriptInput } from "@/components/ZapScriptInput.tsx";
import { ToggleSwitch } from "@/components/wui/ToggleSwitch.tsx";
import { Segmented } from "@/components/wui/Segmented.tsx";
import { BackIcon } from "@/lib/images.tsx";
import { HeaderButton } from "@/components/wui/HeaderButton.tsx";
import { CoreAPI } from "@/lib/coreApi.ts";
import { useStatusStore } from "@/lib/store.ts";
import { MappingType } from "@/lib/models.ts";
import { logger } from "@/lib/logger";
import {
  wrapBarcodeScannerError,
  BarcodeScanCancelledError,
} from "@/lib/errors";
import { Button } from "@/components/wui/Button";
import { PageFrame } from "@/components/PageFrame";
import { SlideModal } from "@/components/SlideModal";
import { useNfcWriter, WriteAction, WriteMethod } from "@/lib/writeNfcHook";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { WriteModal } from "@/components/WriteModal";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";

type MatchType = "exact" | "partial" | "regex";

const TYPE_OPTIONS: {
  value: MappingType;
  labelKey: string;
  helpKey: string;
}[] = [
  {
    value: "uid",
    labelKey: "create.mappings.editor.typeId",
    helpKey: "create.mappings.editor.typeIdHelp",
  },
  {
    value: "text",
    labelKey: "create.mappings.editor.typeValue",
    helpKey: "create.mappings.editor.typeValueHelp",
  },
  {
    value: "data",
    labelKey: "create.mappings.editor.typeData",
    helpKey: "create.mappings.editor.typeDataHelp",
  },
];

const MATCH_OPTIONS: { value: MatchType; labelKey: string; helpKey: string }[] =
  [
    {
      value: "exact",
      labelKey: "create.mappings.editor.matchExact",
      helpKey: "create.mappings.editor.matchExactHelp",
    },
    {
      value: "partial",
      labelKey: "create.mappings.editor.matchPartial",
      helpKey: "create.mappings.editor.matchPartialHelp",
    },
    {
      value: "regex",
      labelKey: "create.mappings.editor.matchRegex",
      helpKey: "create.mappings.editor.matchRegexHelp",
    },
  ];

// "id"/"value" are Core's new mapping-type format; map them to the legacy
// "uid"/"text" that the app uses internally and sends back on write.
const normalizeType = (type: string): MappingType => {
  if (type === "id") return "uid";
  if (type === "value") return "text";
  if (type === "uid" || type === "text" || type === "data") return type;
  return "uid";
};

const normalizeMatch = (match: string): MatchType => {
  if (match === "exact" || match === "partial" || match === "regex") {
    return match;
  }
  return "exact";
};

interface MappingEditorProps {
  id?: number;
}

export function MappingEditor({ id }: MappingEditorProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const navigate = useNavigate();
  const editingId = id;
  const isEditing = editingId !== undefined;

  const goBack = () => {
    if (router.history.canGoBack()) {
      router.history.back();
    } else {
      navigate({ to: "/create/mappings" });
    }
  };

  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  const headingKey = isEditing
    ? "create.mappings.editor.titleEdit"
    : "create.mappings.editor.titleNew";
  usePageHeadingFocus(t(headingKey));

  const connected = useStatusStore((state) => state.connected);
  const queryClient = useQueryClient();
  const preferRemoteWriter = usePreferencesStore(
    (state) => state.preferRemoteWriter,
  );
  const nfcWriter = useNfcWriter(WriteMethod.Auto, preferRemoteWriter);
  const [writeIntent, setWriteIntent] = useState(false);
  const writeOpen = writeIntent && nfcWriter.status === null;
  const prevStatusRef = useRef(nfcWriter.status);

  const mappings = useQuery({
    queryKey: ["mappings"],
    queryFn: () => CoreAPI.mappings(),
  });

  const existing = useMemo(() => {
    if (!isEditing) return undefined;
    return mappings.data?.mappings.find(
      (m) => parseInt(m.id, 10) === editingId,
    );
  }, [mappings.data, isEditing, editingId]);

  const [label, setLabel] = useState("");
  const [type, setType] = useState<MappingType>("uid");
  const [match, setMatch] = useState<MatchType>("exact");
  const [pattern, setPattern] = useState("");
  const [override, setOverride] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [hydrated, setHydrated] = useState(!isEditing);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isEditing || hydrated) return;
    if (existing) {
      setLabel(existing.label);
      setType(normalizeType(existing.type));
      setMatch(normalizeMatch(existing.match));
      setPattern(existing.pattern);
      setOverride(existing.override);
      setEnabled(existing.enabled);
      setHydrated(true);
    } else if (mappings.isFetched && !mappings.isFetching) {
      toast.error(t("create.mappings.editor.notFound"));
      navigate({ to: "/create/mappings", replace: true });
    }
  }, [
    isEditing,
    hydrated,
    existing,
    mappings.isFetched,
    mappings.isFetching,
    navigate,
    t,
  ]);

  useEffect(() => {
    const justCompleted =
      prevStatusRef.current === null && nfcWriter.status !== null;
    prevStatusRef.current = nfcWriter.status;
    if (justCompleted && nfcWriter.result?.info.tag?.uid) {
      setPattern(nfcWriter.result.info.tag.uid);
    }
  }, [nfcWriter.result, nfcWriter.status]);

  const closeWriteModal = async () => {
    setWriteIntent(false);
    await nfcWriter.end();
  };

  const startNfcScan = () => {
    nfcWriter.write(WriteAction.Read);
    setWriteIntent(true);
  };

  const startBarcodeScan = () => {
    BarcodeScanner.scan()
      .then((res) => {
        if (res.barcodes.length < 1) return;
        const barcode = res.barcodes[0];
        if (!barcode?.rawValue) return;
        setPattern(barcode.rawValue);
      })
      .catch((error) => {
        const wrapped = wrapBarcodeScannerError(error);
        if (wrapped instanceof BarcodeScanCancelledError) return;
        logger.error("Barcode scan error:", wrapped, {
          category: "camera",
          action: "barcodeScan",
        });
      });
  };

  const regexInvalid = useMemo(() => {
    if (match !== "regex" || pattern === "") return false;
    try {
      new RegExp(pattern);
      return false;
    } catch {
      return true;
    }
  }, [match, pattern]);

  const canSave =
    connected && pattern.trim() !== "" && !regexInvalid && !saving;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["mappings"] });
  };

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        label,
        enabled,
        type,
        match,
        pattern,
        override,
      };
      if (isEditing && editingId !== undefined) {
        await CoreAPI.updateMapping({ id: editingId, ...payload });
      } else {
        await CoreAPI.newMapping(payload);
      }
      toast.success(t("create.mappings.savedSuccess"));
      await refresh();
      navigate({ to: "/create/mappings", replace: true });
    } catch (error) {
      logger.error("Failed to save mapping", error, {
        category: "api",
        action: isEditing ? "updateMapping" : "newMapping",
      });
      toast.error(t("create.mappings.editor.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!isEditing || editingId === undefined || deleting) return;
    setDeleting(true);
    try {
      await CoreAPI.deleteMapping({ id: editingId });
      toast.success(t("create.mappings.editor.deletedSuccess"));
      await refresh();
      setConfirmOpen(false);
      navigate({ to: "/create/mappings", replace: true });
    } catch (error) {
      logger.error("Failed to delete mapping", error, {
        category: "api",
        action: "deleteMapping",
      });
      toast.error(t("create.mappings.editor.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const matchHelp = MATCH_OPTIONS.find((o) => o.value === match)?.helpKey;
  const typeHelp = TYPE_OPTIONS.find((o) => o.value === type)?.helpKey;

  return (
    <>
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
          <h1 className="text-foreground text-xl">{t(headingKey)}</h1>
        }
      >
        {isEditing && !hydrated ? null : (
          <div className="flex flex-col gap-4">
            <TextInput
              label={t("create.mappings.editor.label")}
              placeholder={t("create.mappings.editor.labelPlaceholder")}
              value={label}
              setValue={setLabel}
              maxLength={255}
            />

            <Segmented
              label={t("create.mappings.editor.type")}
              help={typeHelp ? t(typeHelp) : undefined}
              options={TYPE_OPTIONS.map((o) => ({
                value: o.value,
                label: t(o.labelKey),
              }))}
              value={type}
              onChange={setType}
            />

            <Segmented
              label={t("create.mappings.editor.match")}
              help={matchHelp ? t(matchHelp) : undefined}
              options={MATCH_OPTIONS.map((o) => ({
                value: o.value,
                label: t(o.labelKey),
              }))}
              value={match}
              onChange={setMatch}
            />

            <div className="flex flex-col gap-2">
              <TextInput
                label={t("create.mappings.editor.pattern")}
                value={pattern}
                setValue={setPattern}
                error={
                  regexInvalid
                    ? t("create.mappings.editor.matchRegexInvalid")
                    : undefined
                }
              />
              {type === "uid" && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    className="w-full"
                    icon={<NfcIcon size="20" />}
                    onClick={startNfcScan}
                    label={t("scan.nfcMode")}
                  />
                  <Button
                    className="w-full"
                    icon={<CameraIcon size="20" />}
                    onClick={startBarcodeScan}
                    label={t("scan.cameraMode")}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col">
              <label className="mb-1 block">
                {t("create.mappings.editor.override")}
              </label>
              <ZapScriptInput
                value={override}
                setValue={setOverride}
                rows={4}
              />
              <span className="text-muted-foreground mt-1 text-sm">
                {t("create.mappings.editor.overrideHelp")}
              </span>
            </div>

            <ToggleSwitch
              label={t("create.mappings.editor.enabled")}
              value={enabled}
              setValue={setEnabled}
            />

            <Button
              icon={<SaveIcon size="20" />}
              label={t("create.mappings.editor.save")}
              disabled={!canSave}
              intent="primary"
              onClick={onSave}
            />

            {isEditing && (
              <Button
                variant="outline"
                intent="destructive"
                icon={<Trash2Icon size="20" />}
                label={t("create.mappings.editor.delete")}
                disabled={!connected || saving || deleting}
                onClick={() => setConfirmOpen(true)}
                className="border-error text-error"
              />
            )}
          </div>
        )}
      </PageFrame>

      <WriteModal isOpen={writeOpen} close={closeWriteModal} />

      <SlideModal
        isOpen={confirmOpen}
        close={() => setConfirmOpen(false)}
        title={t("create.mappings.editor.deleteConfirmTitle")}
      >
        <div className="flex flex-col gap-4 py-4">
          <p className="text-center">
            {t("create.mappings.editor.deleteConfirmBody")}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              label={t("create.mappings.editor.deleteCancel")}
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
              className="flex-1"
            />
            <Button
              variant="outline"
              intent="destructive"
              label={t("create.mappings.editor.deleteConfirmAction")}
              onClick={onDelete}
              disabled={deleting}
              className="border-error text-error flex-1"
            />
          </div>
        </div>
      </SlideModal>
    </>
  );
}

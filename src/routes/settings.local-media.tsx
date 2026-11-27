import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Trash2Icon } from "lucide-react";
import { PageFrame } from "@/components/PageFrame";
import { InlineLoading } from "@/components/InlineLoading";
import { StatRow } from "@/components/StatRow";
import { Button } from "@/components/wui/Button";
import { Card } from "@/components/wui/Card";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { RadioGroup } from "@/components/wui/RadioGroup";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useHaptics } from "@/hooks/useHaptics";
import { BackIcon } from "@/lib/images";
import { formatAppDateTime } from "@/lib/formatDate";
import { usePreferencesStore } from "@/lib/preferencesStore";
import {
  addLocalFolder,
  canIndexFiles,
  removeLocalFolder,
  scanLocalMedia,
} from "@/lib/localPlayback/player";
import { useLocalPlaybackStore } from "@/lib/localPlayback/store";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";

export const Route = createFileRoute("/settings/local-media")({
  component: LocalMediaSettings,
});

export function LocalMediaSettings() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("localMedia.title"),
  );
  const router = useRouter();
  const goBack = () =>
    void router.navigate(appBackNavigationOptions("/settings"));
  const { impact } = useHaptics();
  const playOn = usePreferencesStore((s) => s.playOn);
  const setPlayOn = usePreferencesStore((s) => s.setPlayOn);
  const ready = useLocalPlaybackStore((s) => s.ready);
  const folders = useLocalPlaybackStore((s) => s.folders);
  const index = useLocalPlaybackStore((s) => s.index);
  const scanning = useLocalPlaybackStore((s) => s.scanning);
  const [busy, setBusy] = useState(false);
  const indexing = canIndexFiles();

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      toast.error(
        t("localMedia.folderError", {
          msg: e instanceof Error ? e.message : String(e),
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  const scannedAt = index.scannedAt ? formatAppDateTime(index.scannedAt) : null;

  return (
    <PageFrame
      className="settings-panel-page wrap-anywhere"
      headerMode="content-wide"
      breadcrumbs={[{ to: "/settings", label: t("settings.title") }]}
      onSwipeBack={goBack}
      headerLeft={
        <HeaderButton
          onClick={goBack}
          icon={<BackIcon size="24" />}
          aria-label={t("nav.back")}
        />
      }
      headerCenter={
        <h1 ref={headingRef} className="text-foreground text-xl">
          {t("localMedia.title")}
        </h1>
      }
    >
      <div className="settings-panel-stack">
        <Card className="settings-form-rows flex flex-col gap-4">
          <RadioGroup
            label={t("localMedia.playOn")}
            help={t("localMedia.playOnHelp")}
            value={playOn}
            options={[
              { value: "device", label: t("localMedia.playOnDevice") },
              { value: "app", label: t("localMedia.playOnApp") },
            ]}
            onChange={(value) => {
              impact("light");
              setPlayOn(value);
            }}
          />
        </Card>

        {indexing && (
          <Card>
            <section
              className="flex flex-col gap-4"
              aria-labelledby="local-media-folders-heading"
            >
              <h2
                id="local-media-folders-heading"
                className="text-foreground text-lg font-semibold"
              >
                {t("localMedia.foldersTitle")}
              </h2>
              {!ready ? (
                <InlineLoading label={t("localMedia.loading")} />
              ) : (
                <ul className="flex flex-col gap-2">
                  {folders.map((folder) => (
                    <li
                      key={folder.id}
                      className="flex min-h-12 items-center justify-between gap-3"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium wrap-anywhere">
                          {folder.name}
                        </span>
                        <span className="text-muted-foreground text-sm">
                          {folder.kind === "app"
                            ? t("localMedia.appFolder")
                            : folder.available
                              ? t("localMedia.linkedFolder")
                              : t("localMedia.folderUnavailable")}
                        </span>
                      </div>
                      {folder.kind === "linked" && (
                        <Button
                          variant="text"
                          intent="destructive"
                          shape="square"
                          size="sm"
                          icon={<Trash2Icon size="20" />}
                          aria-label={t("localMedia.removeFolder", {
                            name: folder.name,
                          })}
                          disabled={busy || scanning}
                          onClick={() =>
                            void run(() => removeLocalFolder(folder.id))
                          }
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-col gap-2">
                <Button
                  label={t("localMedia.addFolder")}
                  variant="outline"
                  className="w-full"
                  disabled={!ready || busy || scanning}
                  onClick={() => void run(addLocalFolder)}
                />
                <Button
                  label={
                    scanning ? t("localMedia.scanning") : t("localMedia.rescan")
                  }
                  variant="outline"
                  className="w-full"
                  disabled={!ready || busy || scanning}
                  disabledAppearance={scanning ? "busy" : undefined}
                  onClick={() => void run(scanLocalMedia)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <StatRow label={t("localMedia.fileCount")}>
                  {index.files.length.toLocaleString()}
                </StatRow>
                <StatRow label={t("localMedia.lastScanned")}>
                  {scannedAt ?? t("localMedia.neverScanned")}
                </StatRow>
              </div>
            </section>
          </Card>
        )}
      </div>
    </PageFrame>
  );
}

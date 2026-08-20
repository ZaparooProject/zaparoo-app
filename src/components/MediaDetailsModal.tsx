import { type ReactElement, useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { Copy, FileCode, Folder, Tag } from "lucide-react";
import { useHaptics } from "@/hooks/useHaptics";
import { useSystemNameResolver } from "@/hooks/useSystemName";
import { CreateIcon, DeviceIcon, PlayIcon } from "@/lib/images";
import type { SearchResultGame } from "@/lib/models";
import { isFavoriteTag, searchResultToBrowseEntry } from "@/lib/libraryMedia";
import { filenameFromPath } from "@/lib/path";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { SlideModal } from "@/components/SlideModal";
import { TagBadge } from "@/components/TagBadge";
import { Button } from "@/components/wui/Button";
import { ModalActionRail } from "@/components/wui/ModalActionRail";
import { FavoriteButton } from "@/components/library/FavoriteButton";
import {
  buildTitleZapScript,
  parseTitleZapScript,
  titleTagKey,
} from "@/lib/titleZapScript";

type MediaDetailsAction = (value: string) => void | Promise<void>;

export interface MediaDetailsModalProps {
  isOpen: boolean;
  close: () => void;
  media: SearchResultGame | null;
  onWrite: MediaDetailsAction;
  onCopy?: MediaDetailsAction;
  onPreview?: MediaDetailsAction;
  previewDisabled?: boolean;
  primaryActionLabel?: string;
  primaryActionIcon?: ReactElement;
}

export function MediaDetailsModal({
  isOpen,
  close,
  media,
  onWrite,
  onCopy,
  onPreview,
  previewDisabled = false,
  primaryActionLabel,
  primaryActionIcon,
}: MediaDetailsModalProps) {
  const { t } = useTranslation();
  const { impact } = useHaptics();
  const showFilenames = usePreferencesStore((state) => state.showFilenames);
  const deviceKey = useActiveDeviceKey();
  const resolveSystemName = useSystemNameResolver();
  const radioGroupName = useId();
  const pathInputId = `${radioGroupName}-path`;
  const zapScriptInputId = `${radioGroupName}-zapscript`;
  const [writeMode, setWriteMode] = useState<"path" | "zapScript">("path");
  const [selectedTagKeys, setSelectedTagKeys] = useState<Set<string>>(
    new Set(),
  );
  const parsedZapScript = useMemo(
    () => (media?.zapScript ? parseTitleZapScript(media.zapScript) : null),
    [media],
  );

  useEffect(() => {
    if (media) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize state from newly selected external media.
      setWriteMode(media.zapScript ? "zapScript" : "path");
      setSelectedTagKeys(new Set(parsedZapScript?.tags.map(titleTagKey) ?? []));
    }
  }, [media, parsedZapScript]);

  const selectedZapScriptTags = useMemo(() => {
    if (!media || !parsedZapScript) return [];

    const orderedTags = [...parsedZapScript.tags, ...media.tags];
    const seenTags = new Set<string>();
    return orderedTags.filter((tag) => {
      const key = titleTagKey(tag);
      if (!selectedTagKeys.has(key) || seenTags.has(key)) return false;
      seenTags.add(key);
      return true;
    });
  }, [media, parsedZapScript, selectedTagKeys]);
  const favoriteEntry = useMemo(
    () => (media ? searchResultToBrowseEntry(media) : null),
    [media],
  );
  const visibleTags = media?.tags.filter((tag) => !isFavoriteTag(tag)) ?? [];
  const customizedZapScript = parsedZapScript
    ? buildTitleZapScript(parsedZapScript, selectedZapScriptTags)
    : media?.zapScript;
  const selectedValue =
    writeMode === "zapScript" && customizedZapScript
      ? customizedZapScript
      : (media?.path ?? "");
  const title = media
    ? showFilenames
      ? filenameFromPath(media.path) || media.name
      : media.name
    : "";
  const hasSecondaryActions = Boolean(favoriteEntry || onCopy || onPreview);
  const primaryAction = media ? (
    <Button
      label={primaryActionLabel ?? t("create.search.writeLabel")}
      icon={primaryActionIcon ?? <CreateIcon size="20" />}
      intent="primary"
      onClick={() => void onWrite(selectedValue)}
    />
  ) : undefined;
  const footer =
    media && primaryAction ? (
      hasSecondaryActions ? (
        <ModalActionRail
          aria-label={t("create.search.mediaActions")}
          actions={
            <>
              {favoriteEntry && (
                <FavoriteButton
                  entry={favoriteEntry}
                  fallbackSystemId={media.system.id}
                  deviceKey={deviceKey}
                  displayLabel={t("library.favorite")}
                  layout="responsive"
                  variant="text"
                  className="w-full whitespace-nowrap"
                />
              )}
              {onCopy && (
                <Button
                  label={t("create.search.copyLabel")}
                  icon={<Copy size="20" />}
                  layout="responsive"
                  variant="text"
                  className="whitespace-nowrap"
                  onClick={() => void onCopy(selectedValue)}
                />
              )}
              {onPreview && (
                <Button
                  label={t("create.search.playLabel")}
                  icon={<PlayIcon size="20" />}
                  layout="responsive"
                  variant="text"
                  className="whitespace-nowrap"
                  disabled={previewDisabled}
                  onClick={() => void onPreview(selectedValue)}
                />
              )}
            </>
          }
          primaryAction={primaryAction}
        />
      ) : (
        primaryAction
      )
    ) : undefined;

  return (
    <SlideModal isOpen={isOpen} close={close} title={title} footer={footer}>
      {media && (
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
              <div className="flex items-center gap-2 sm:min-w-[100px]">
                <DeviceIcon size="16" className="text-white/60" />
                <span className="text-sm text-white/60">
                  {t("create.search.systemLabel")}
                </span>
              </div>
              <span className="flex-1 font-medium">
                {resolveSystemName(media.system.id, media.system.name)}
              </span>
            </div>
            {visibleTags.length > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                <div className="flex items-center gap-2 sm:min-w-[100px]">
                  <Tag size={16} className="text-white/60" />
                  <span className="text-sm text-white/60">
                    {t("create.search.tagsLabel")}
                  </span>
                </div>
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {visibleTags.map((tag, index) => {
                    const key = titleTagKey(tag);
                    const selected = selectedTagKeys.has(key);

                    return parsedZapScript ? (
                      <button
                        key={`${key}:${index}`}
                        type="button"
                        aria-label={`${tag.type} ${tag.tag}`}
                        aria-pressed={selected}
                        className={classNames(
                          "rounded-full transition-opacity focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none",
                          { "opacity-40": !selected },
                        )}
                        onClick={() => {
                          impact("light");
                          setSelectedTagKeys((current) => {
                            const next = new Set(current);
                            if (next.has(key)) {
                              next.delete(key);
                            } else {
                              next.add(key);
                            }
                            return next;
                          });
                          setWriteMode("zapScript");
                        }}
                      >
                        <span aria-hidden="true">
                          <TagBadge type={tag.type} tag={tag.tag} />
                        </span>
                      </button>
                    ) : (
                      <TagBadge
                        key={`${key}:${index}`}
                        type={tag.type}
                        tag={tag.tag}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <fieldset
            className="space-y-2"
            role="radiogroup"
            aria-label={t("create.search.selectWriteValue")}
          >
            <legend className="sr-only">
              {t("create.search.selectWriteValue")}
            </legend>

            <div className="flex items-center gap-2">
              <input
                type="radio"
                id={pathInputId}
                name={radioGroupName}
                value="path"
                checked={writeMode === "path"}
                onChange={() => {
                  impact("light");
                  setWriteMode("path");
                }}
                className="peer sr-only"
              />
              <label
                htmlFor={pathInputId}
                aria-label={`${t("create.search.pathLabel")}: ${media.path}${writeMode === "path" ? `, ${t("selected")}` : ""}`}
                className={classNames(
                  "flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-white/50",
                  {
                    "border-white/30 bg-white/10": writeMode === "path",
                    "border-white/10 bg-white/5 hover:bg-white/[0.07]":
                      writeMode !== "path",
                  },
                )}
              >
                <div
                  className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3"
                  aria-hidden="true"
                >
                  <div className="flex items-center gap-2 sm:min-w-[100px]">
                    <Folder size={16} className="flex-shrink-0 text-white/60" />
                    <span className="text-sm text-white/60">
                      {t("create.search.pathLabel")}
                    </span>
                  </div>
                  <code className="flex-1 text-left font-mono text-sm break-all text-white/90">
                    {media.path}
                  </code>
                </div>
                <div
                  aria-hidden="true"
                  className={classNames(
                    "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all",
                    {
                      "border-white bg-white": writeMode === "path",
                      "border-white/30": writeMode !== "path",
                    },
                  )}
                >
                  {writeMode === "path" && (
                    <div className="bg-background h-2 w-2 rounded-full" />
                  )}
                </div>
              </label>
            </div>

            {customizedZapScript && (
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id={zapScriptInputId}
                  name={radioGroupName}
                  value="zapScript"
                  checked={writeMode === "zapScript"}
                  onChange={() => {
                    impact("light");
                    setWriteMode("zapScript");
                  }}
                  className="peer sr-only"
                />
                <label
                  htmlFor={zapScriptInputId}
                  aria-label={`${t("create.search.zapscriptLabel")}: ${customizedZapScript}${writeMode === "zapScript" ? `, ${t("selected")}` : ""}`}
                  className={classNames(
                    "flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-white/50",
                    {
                      "border-white/30 bg-white/10": writeMode === "zapScript",
                      "border-white/10 bg-white/5 hover:bg-white/[0.07]":
                        writeMode !== "zapScript",
                    },
                  )}
                >
                  <div
                    className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3"
                    aria-hidden="true"
                  >
                    <div className="flex items-center gap-2 sm:min-w-[100px]">
                      <FileCode
                        size={16}
                        className="flex-shrink-0 text-white/60"
                      />
                      <span className="text-sm text-white/60">
                        {t("create.search.zapscriptLabel")}
                      </span>
                    </div>
                    <code className="min-h-10 flex-1 text-left font-mono text-sm break-words text-white/90">
                      {customizedZapScript}
                    </code>
                  </div>
                  <div
                    aria-hidden="true"
                    className={classNames(
                      "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all",
                      {
                        "border-white bg-white": writeMode === "zapScript",
                        "border-white/30": writeMode !== "zapScript",
                      },
                    )}
                  >
                    {writeMode === "zapScript" && (
                      <div className="bg-background h-2 w-2 rounded-full" />
                    )}
                  </div>
                </label>
              </div>
            )}
          </fieldset>
        </div>
      )}
    </SlideModal>
  );
}

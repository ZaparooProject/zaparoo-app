import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { Copy, FileCode, Folder, Tag } from "lucide-react";
import { useHaptics } from "@/hooks/useHaptics";
import { CreateIcon, DeviceIcon, PlayIcon } from "@/lib/images";
import type { SearchResultGame } from "@/lib/models";
import { filenameFromPath } from "@/lib/path";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { SlideModal } from "@/components/SlideModal";
import { TagBadge } from "@/components/TagBadge";
import { Button } from "@/components/wui/Button";

type MediaDetailsAction = (value: string) => void | Promise<void>;

export interface MediaDetailsModalProps {
  isOpen: boolean;
  close: () => void;
  media: SearchResultGame | null;
  onWrite: MediaDetailsAction;
  onCopy?: MediaDetailsAction;
  onPreview?: MediaDetailsAction;
  previewDisabled?: boolean;
}

export function MediaDetailsModal({
  isOpen,
  close,
  media,
  onWrite,
  onCopy,
  onPreview,
  previewDisabled = false,
}: MediaDetailsModalProps) {
  const { t } = useTranslation();
  const { impact } = useHaptics();
  const showFilenames = usePreferencesStore((state) => state.showFilenames);
  const radioGroupName = useId();
  const pathInputId = `${radioGroupName}-path`;
  const zapScriptInputId = `${radioGroupName}-zapscript`;
  const [writeMode, setWriteMode] = useState<"path" | "zapScript">("path");

  useEffect(() => {
    if (media) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize mode from newly selected external media.
      setWriteMode(media.zapScript ? "zapScript" : "path");
    }
  }, [media]);

  const selectedValue =
    writeMode === "zapScript" && media?.zapScript
      ? media.zapScript
      : (media?.path ?? "");
  const title = media
    ? showFilenames
      ? filenameFromPath(media.path) || media.name
      : media.name
    : "";

  return (
    <SlideModal isOpen={isOpen} close={close} title={title}>
      {media && (
        <div className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
              <div className="flex items-center gap-2 sm:min-w-[100px]">
                <DeviceIcon size="16" className="text-white/60" />
                <span className="text-sm text-white/60">
                  {t("create.search.systemLabel")}
                </span>
              </div>
              <span className="flex-1 font-medium">{media.system.name}</span>
            </div>
            {media.tags.length > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                <div className="flex items-center gap-2 sm:min-w-[100px]">
                  <Tag size={16} className="text-white/60" />
                  <span className="text-sm text-white/60">
                    {t("create.search.tagsLabel")}
                  </span>
                </div>
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {media.tags.map((tag, index) => (
                    <TagBadge
                      key={`${tag.type}:${tag.tag}:${index}`}
                      type={tag.type}
                      tag={tag.tag}
                    />
                  ))}
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

            {media.zapScript && (
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
                  aria-label={`${t("create.search.zapscriptLabel")}: ${media.zapScript}${writeMode === "zapScript" ? `, ${t("selected")}` : ""}`}
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
                    <code className="flex-1 text-left font-mono text-sm break-words text-white/90">
                      {media.zapScript}
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

          <div className="flex flex-col gap-2 pt-2">
            <Button
              label={t("create.search.writeLabel")}
              icon={<CreateIcon size="20" />}
              intent="primary"
              onClick={() => void onWrite(selectedValue)}
              className="w-full"
            />
            {(onCopy || onPreview) && (
              <div className="flex flex-row gap-2">
                {onCopy && (
                  <Button
                    label={t("create.search.copyLabel")}
                    icon={<Copy size="20" />}
                    variant="outline"
                    onClick={() => void onCopy(selectedValue)}
                    className="flex-1"
                  />
                )}
                {onPreview && (
                  <Button
                    label={t("create.search.playLabel")}
                    icon={<PlayIcon size="20" />}
                    variant="outline"
                    disabled={previewDisabled}
                    onClick={() => void onPreview(selectedValue)}
                    className="flex-1"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </SlideModal>
  );
}

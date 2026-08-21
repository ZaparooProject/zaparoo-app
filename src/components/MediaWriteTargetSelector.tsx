import { useId } from "react";
import classNames from "classnames";
import { FileCode, Folder, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TagBadge } from "@/components/TagBadge";
import { useHaptics } from "@/hooks/useHaptics";
import type { MediaWriteTargetState } from "@/hooks/useMediaWriteTarget";
import { isFavoriteTag, isScraperTag } from "@/lib/libraryMedia";
import type { MediaWriteSource } from "@/lib/mediaWriteTarget";
import { titleTagKey } from "@/lib/titleZapScript";

export function MediaWriteTargetSelector(props: {
  media: MediaWriteSource;
  target: MediaWriteTargetState;
}) {
  const { t } = useTranslation();
  const { impact } = useHaptics();
  const radioGroupName = useId();
  const pathInputId = `${radioGroupName}-path`;
  const zapScriptInputId = `${radioGroupName}-zapscript`;
  const visibleTags = props.media.tags.filter(
    (tag) => !isFavoriteTag(tag) && !isScraperTag(tag),
  );

  return (
    <div className="flex flex-col gap-3">
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
              const selected = props.target.selectedTagKeys.has(key);
              const displayTag = tag.label || tag.tag;

              return props.target.parsedZapScript ? (
                <button
                  key={`${key}:${index}`}
                  type="button"
                  aria-label={`${tag.type} ${displayTag}`}
                  aria-pressed={selected}
                  className={classNames(
                    "rounded-full transition-opacity focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none",
                    { "opacity-40": !selected },
                  )}
                  onClick={() => {
                    impact("light");
                    props.target.toggleTag(tag);
                  }}
                >
                  <span aria-hidden="true">
                    <TagBadge
                      type={tag.type}
                      tag={tag.tag}
                      displayTag={displayTag}
                    />
                  </span>
                </button>
              ) : (
                <TagBadge
                  key={`${key}:${index}`}
                  type={tag.type}
                  tag={tag.tag}
                  displayTag={displayTag}
                />
              );
            })}
          </div>
        </div>
      )}

      <fieldset
        className="space-y-2"
        role="radiogroup"
        aria-label={t("create.search.selectWriteValue")}
      >
        <legend className="sr-only">
          {t("create.search.selectWriteValue")}
        </legend>

        {props.target.path && (
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id={pathInputId}
              name={radioGroupName}
              value="path"
              checked={props.target.writeMode === "path"}
              onChange={() => {
                impact("light");
                props.target.setWriteMode("path");
              }}
              className="peer sr-only"
            />
            <label
              htmlFor={pathInputId}
              aria-label={`${t("create.search.pathLabel")}: ${props.target.path}${props.target.writeMode === "path" ? `, ${t("selected")}` : ""}`}
              className={classNames(
                "flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-white/50",
                {
                  "border-white/30 bg-white/10":
                    props.target.writeMode === "path",
                  "border-white/10 bg-white/5 hover:bg-white/[0.07]":
                    props.target.writeMode !== "path",
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
                  {props.target.path}
                </code>
              </div>
              <div
                aria-hidden="true"
                className={classNames(
                  "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all",
                  {
                    "border-white bg-white": props.target.writeMode === "path",
                    "border-white/30": props.target.writeMode !== "path",
                  },
                )}
              >
                {props.target.writeMode === "path" && (
                  <div className="bg-background h-2 w-2 rounded-full" />
                )}
              </div>
            </label>
          </div>
        )}

        {props.target.customizedZapScript && (
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id={zapScriptInputId}
              name={radioGroupName}
              value="zapScript"
              checked={props.target.writeMode === "zapScript"}
              onChange={() => {
                impact("light");
                props.target.setWriteMode("zapScript");
              }}
              className="peer sr-only"
            />
            <label
              htmlFor={zapScriptInputId}
              aria-label={`${t("create.search.zapscriptLabel")}: ${props.target.customizedZapScript}${props.target.writeMode === "zapScript" ? `, ${t("selected")}` : ""}`}
              className={classNames(
                "flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-white/50",
                {
                  "border-white/30 bg-white/10":
                    props.target.writeMode === "zapScript",
                  "border-white/10 bg-white/5 hover:bg-white/[0.07]":
                    props.target.writeMode !== "zapScript",
                },
              )}
            >
              <div
                className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3"
                aria-hidden="true"
              >
                <div className="flex items-center gap-2 sm:min-w-[100px]">
                  <FileCode size={16} className="flex-shrink-0 text-white/60" />
                  <span className="text-sm text-white/60">
                    {t("create.search.zapscriptLabel")}
                  </span>
                </div>
                <code className="min-h-10 flex-1 text-left font-mono text-sm break-words text-white/90">
                  {props.target.customizedZapScript}
                </code>
              </div>
              <div
                aria-hidden="true"
                className={classNames(
                  "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all",
                  {
                    "border-white bg-white":
                      props.target.writeMode === "zapScript",
                    "border-white/30": props.target.writeMode !== "zapScript",
                  },
                )}
              >
                {props.target.writeMode === "zapScript" && (
                  <div className="bg-background h-2 w-2 rounded-full" />
                )}
              </div>
            </label>
          </div>
        )}
      </fieldset>
    </div>
  );
}

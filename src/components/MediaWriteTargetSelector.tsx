import { useId, type ReactNode } from "react";
import classNames from "classnames";
import { FileCode, Folder, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TagBadge } from "@/components/TagBadge";
import { useHaptics } from "@/hooks/useHaptics";
import type {
  MediaWriteMode,
  MediaWriteTargetState,
} from "@/hooks/useMediaWriteTarget";
import { isFavoriteTag, isScraperTag } from "@/lib/libraryMedia";
import type { MediaWriteSource } from "@/lib/mediaWriteTarget";
import { titleTagKey } from "@/lib/titleZapScript";

function WriteTargetOption(props: {
  id: string;
  name: string;
  mode: MediaWriteMode;
  icon: ReactNode;
  label: string;
  value: string;
  writeMode: MediaWriteMode;
  selectedLabel: string;
  onSelect: () => void;
}) {
  const selected = props.writeMode === props.mode;

  return (
    <div className="flex items-center gap-2">
      <input
        type="radio"
        id={props.id}
        name={props.name}
        value={props.mode}
        checked={selected}
        onChange={props.onSelect}
        className="peer sr-only"
      />
      <label
        htmlFor={props.id}
        aria-label={`${props.label}: ${props.value}${selected ? `, ${props.selectedLabel}` : ""}`}
        className={classNames(
          "flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-white/50",
          {
            "border-white/30 bg-white/10": selected,
            "border-white/10 bg-white/5 hover:bg-white/[0.07]": !selected,
          },
        )}
      >
        <div
          className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3"
          aria-hidden="true"
        >
          <div className="flex items-center gap-2 sm:min-w-[100px]">
            {props.icon}
            <span className="text-sm text-white/60">{props.label}</span>
          </div>
          <code
            className={classNames(
              "flex-1 text-left font-mono text-sm text-white/90",
              {
                "break-all": props.mode === "path",
                "min-h-10 break-words": props.mode === "zapScript",
              },
            )}
          >
            {props.value}
          </code>
        </div>
        <div
          aria-hidden="true"
          className={classNames(
            "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all",
            {
              "border-white bg-white": selected,
              "border-white/30": !selected,
            },
          )}
        >
          {selected && <div className="bg-background h-2 w-2 rounded-full" />}
        </div>
      </label>
    </div>
  );
}

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
          <WriteTargetOption
            id={pathInputId}
            name={radioGroupName}
            mode="path"
            icon={<Folder size={16} className="flex-shrink-0 text-white/60" />}
            label={t("create.search.pathLabel")}
            value={props.target.path}
            writeMode={props.target.writeMode}
            selectedLabel={t("selected")}
            onSelect={() => {
              impact("light");
              props.target.setWriteMode("path");
            }}
          />
        )}

        {props.target.customizedZapScript && (
          <WriteTargetOption
            id={zapScriptInputId}
            name={radioGroupName}
            mode="zapScript"
            icon={
              <FileCode size={16} className="flex-shrink-0 text-white/60" />
            }
            label={t("create.search.zapscriptLabel")}
            value={props.target.customizedZapScript}
            writeMode={props.target.writeMode}
            selectedLabel={t("selected")}
            onSelect={() => {
              impact("light");
              props.target.setWriteMode("zapScript");
            }}
          />
        )}
      </fieldset>
    </div>
  );
}

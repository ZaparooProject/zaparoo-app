import { useId, type ReactNode } from "react";
import classNames from "classnames";
import { FileCodeIcon, FolderIcon, TagIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/wui/Badge";
import { TagBadge } from "@/components/TagBadge";
import { useHaptics } from "@/hooks/useHaptics";
import type {
  MediaWriteMode,
  MediaWriteTargetState,
} from "@/hooks/useMediaWriteTarget";
import {
  isDeckTag,
  isMediaPreferenceTag,
  isScraperTag,
} from "@/lib/libraryMedia";
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
          "peer-focus-visible:ring-ring flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-200 peer-focus-visible:ring-2",
          {
            "border-input bg-surface-highlight": selected,
            "border-border bg-surface-inset hover:bg-surface-highlight":
              !selected,
          },
        )}
      >
        <div
          className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3"
          aria-hidden="true"
        >
          <div className="flex items-center gap-2 sm:min-w-[100px]">
            {props.icon}
            <span className="text-muted-foreground text-sm">{props.label}</span>
          </div>
          <code
            className={classNames(
              "text-foreground/90 flex-1 text-left font-mono text-sm",
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
            "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            {
              "border-foreground bg-foreground": selected,
              "border-input": !selected,
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
  const visibleTags = (props.media.tags ?? []).filter(
    (tag) =>
      !isMediaPreferenceTag(tag) && !isDeckTag(tag) && !isScraperTag(tag),
  );
  const tagsDisabled = props.target.writeMode !== "zapScript";
  const writeModeOrder: MediaWriteMode[] =
    props.target.preferredMode === "path"
      ? ["path", "zapScript"]
      : ["zapScript", "path"];

  return (
    <div className="flex flex-col gap-3">
      {visibleTags.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
          <div className="flex items-center gap-2 sm:min-w-[100px]">
            <TagIcon size={16} className="text-muted-foreground" />
            <span className="text-muted-foreground text-sm">
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
                    "focus-visible:ring-ring relative rounded-sm transition-opacity after:absolute after:inset-x-0 after:-inset-y-3 after:content-[''] focus-visible:ring-2 focus-visible:outline-none enabled:cursor-pointer enabled:hover:opacity-80 disabled:cursor-not-allowed",
                  )}
                  disabled={tagsDisabled}
                  onClick={() => {
                    impact("light");
                    props.target.toggleTag(tag);
                  }}
                >
                  {tagsDisabled ? (
                    <span aria-hidden="true">
                      <TagBadge
                        type={tag.type}
                        tag={tag.tag}
                        displayTag={`${tag.type}:${displayTag}`}
                      />
                    </span>
                  ) : (
                    <Badge aria-hidden={true} className="gap-1.5 pl-1">
                      <span
                        data-testid="tag-selection-indicator"
                        className={classNames(
                          "border-muted-foreground h-3.5 w-3.5 shrink-0 rounded-xs border",
                          { "bg-muted-foreground": selected },
                        )}
                      />
                      <span>{`${tag.type}:${displayTag}`}</span>
                    </Badge>
                  )}
                </button>
              ) : (
                <TagBadge
                  key={`${key}:${index}`}
                  type={tag.type}
                  tag={tag.tag}
                  displayTag={`${tag.type}:${displayTag}`}
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

        {writeModeOrder.map((mode) =>
          mode === "path"
            ? props.target.path && (
                <WriteTargetOption
                  key={mode}
                  id={pathInputId}
                  name={radioGroupName}
                  mode={mode}
                  icon={
                    <FolderIcon
                      size={16}
                      className="text-muted-foreground flex-shrink-0"
                    />
                  }
                  label={t("create.search.pathLabel")}
                  value={props.target.path}
                  writeMode={props.target.writeMode}
                  selectedLabel={t("selected")}
                  onSelect={() => {
                    impact("light");
                    props.target.setWriteMode(mode);
                  }}
                />
              )
            : props.target.customizedZapScript && (
                <WriteTargetOption
                  key={mode}
                  id={zapScriptInputId}
                  name={radioGroupName}
                  mode={mode}
                  icon={
                    <FileCodeIcon
                      size={16}
                      className="text-muted-foreground flex-shrink-0"
                    />
                  }
                  label={t("create.search.zapscriptLabel")}
                  value={props.target.customizedZapScript}
                  writeMode={props.target.writeMode}
                  selectedLabel={t("selected")}
                  onSelect={() => {
                    impact("light");
                    props.target.setWriteMode(mode);
                  }}
                />
              ),
        )}
      </fieldset>
    </div>
  );
}

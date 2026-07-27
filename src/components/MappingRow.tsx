import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { MappingResponse } from "@/lib/models";
import { NextIcon } from "@/lib/images";
import { Badge } from "@/components/wui/Badge";

const TYPE_LABEL_KEYS: Record<string, string> = {
  uid: "create.mappings.editor.typeId",
  id: "create.mappings.editor.typeId",
  text: "create.mappings.editor.typeValue",
  value: "create.mappings.editor.typeValue",
  data: "create.mappings.editor.typeData",
};

const MATCH_LABEL_KEYS: Record<string, string> = {
  exact: "create.mappings.editor.matchExact",
  partial: "create.mappings.editor.matchPartial",
  regex: "create.mappings.editor.matchRegex",
};

interface MappingRowProps {
  mapping: MappingResponse;
  onTap: () => void;
  isLast?: boolean;
}

export function MappingRow({ mapping, onTap, isLast }: MappingRowProps) {
  const { t } = useTranslation();

  const primaryText =
    mapping.label.trim() !== ""
      ? mapping.label
      : mapping.pattern || t("create.mappings.editor.titleNew");
  const overridePreview =
    mapping.override.trim() === ""
      ? t("create.mappings.list.noOverride")
      : mapping.override;
  const typeLabel = t(TYPE_LABEL_KEYS[mapping.type] ?? mapping.type);
  const matchLabel = t(MATCH_LABEL_KEYS[mapping.match] ?? mapping.match);
  const accessibleName = t("create.mappings.list.openMapping", {
    name: primaryText,
  });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTap();
        }
      }}
      className={classNames(
        "flex cursor-pointer flex-row items-center justify-between gap-3 px-1 py-3",
        "focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none",
        { "border-bd-outline border-b border-solid": !isLast },
      )}
    >
      <span className="sr-only">{accessibleName}</span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className={classNames("min-w-0 truncate font-medium", {
              "text-muted-foreground": !mapping.enabled,
            })}
          >
            {primaryText}
          </span>
          {!mapping.enabled && (
            <Badge variant="error">
              {t("create.mappings.list.disabledBadge")}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Badge>{typeLabel}</Badge>
          <Badge>{matchLabel}</Badge>
          {mapping.label.trim() !== "" && mapping.pattern && (
            <span className="text-muted-foreground truncate text-xs">
              {mapping.pattern}
            </span>
          )}
        </div>
        <div
          className={classNames("truncate font-mono text-sm", {
            "text-muted-foreground": !mapping.enabled,
          })}
        >
          {overridePreview}
        </div>
      </div>
      <div className="text-muted-foreground shrink-0">
        <NextIcon size="20" />
      </div>
    </div>
  );
}

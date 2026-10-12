import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon } from "lucide-react";
import { TagBadge } from "@/components/TagBadge";
import {
  LibraryMetadataLink,
  type MetadataLinkTarget,
} from "@/components/library/LibraryMetadataLink";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useLibraryFactValueLabel } from "@/components/library/useLibraryMediaFacts";
import type {
  LibraryDetailFact,
  LibraryDetailFactType,
} from "@/lib/libraryMedia";
import { libraryTagDisplayLabel } from "@/lib/libraryTagLabels";
import type { TagInfo } from "@/lib/models";

/** Label/value row; stacks on phones and inside the docked details pane. */
export function DetailRow(props: {
  label: string;
  value?: string;
  children?: ReactNode;
  mono?: boolean;
}) {
  if (!props.value && !props.children) return null;
  return (
    <div className="library-detail-row">
      <span className="text-muted-foreground text-sm sm:min-w-[120px]">
        {props.label}
      </span>
      <span
        className={`min-w-0 flex-1 break-words ${props.mono ? "font-mono text-sm" : "font-medium"}`}
      >
        {props.children ?? props.value}
      </span>
    </div>
  );
}

/** Collapsed reference section; down chevron turns up when open. */
export function TechnicalDetails(props: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <details className="group border-border border-t pt-2">
      <summary className="focus-visible:ring-ring flex min-h-12 cursor-pointer list-none items-center justify-between rounded-md px-1 focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <span className="font-medium">{t("library.technicalDetails")}</span>
        <ChevronDownIcon
          size={20}
          className="text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="flex flex-col gap-3 px-1 pt-2">{props.children}</div>
    </details>
  );
}

function factLabelKey(type: LibraryDetailFactType): string {
  switch (type) {
    case "year":
      return "library.releaseYear";
    case "players":
      return "library.players";
    case "developer":
      return "library.developer";
    case "publisher":
      return "library.publisher";
    case "genre":
      return "library.genre";
    case "rating":
      return "library.rating";
    case "gamefamily":
      return "library.gameFamily";
    case "arcadeboard":
      return "library.arcadeBoard";
    default:
      return `tagSelector.type.${type}`;
  }
}

/** Labelled rows whose values link to matching Library results. */
export function LibraryFactRows(props: {
  target: MetadataLinkTarget;
  facts: readonly LibraryDetailFact[];
}) {
  const { t } = useTranslation();
  const factValueLabel = useLibraryFactValueLabel();
  const libraryAvailable = useCoreFeature("mediaLibrary", {
    requireKnownSupport: true,
  }).available;
  const tagsAvailable = useCoreFeature("mediaTags", {
    requireKnownSupport: true,
  }).available;
  const canExploreTags = libraryAvailable && tagsAvailable;
  return (
    <>
      {props.facts.map((fact) => {
        const label = t(factLabelKey(fact.type));
        return (
          <DetailRow key={fact.type} label={label}>
            {fact.tags.map((tag, index) => {
              const value = factValueLabel(fact.type, tag);
              return (
                <Fragment key={`${tag.type}:${tag.tag}:${index}`}>
                  {index > 0 && ", "}
                  <LibraryMetadataLink
                    {...props.target}
                    tag={tag}
                    enabled={canExploreTags}
                    label={`${label}: ${value}`}
                  >
                    {value}
                  </LibraryMetadataLink>
                </Fragment>
              );
            })}
          </DetailRow>
        );
      })}
    </>
  );
}

/** The Details list: System, the everyday facts, then untyped tags. */
export function LibraryMediaFacts(props: {
  target: MetadataLinkTarget;
  systemName: string;
  facts: readonly LibraryDetailFact[];
  tags: readonly TagInfo[];
}) {
  const { t } = useTranslation();
  const libraryAvailable = useCoreFeature("mediaLibrary", {
    requireKnownSupport: true,
  }).available;
  const tagsAvailable = useCoreFeature("mediaTags", {
    requireKnownSupport: true,
  }).available;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("library.details")}</h2>
      <DetailRow label={t("library.system")}>
        <LibraryMetadataLink
          {...props.target}
          enabled={libraryAvailable}
          label={`${t("library.system")}: ${props.systemName}`}
        >
          {props.systemName}
        </LibraryMetadataLink>
      </DetailRow>
      <LibraryFactRows target={props.target} facts={props.facts} />
      {props.tags.length > 0 && (
        <DetailRow label={t("library.tags")}>
          <span className="flex flex-wrap gap-1.5">
            {props.tags.map((tag, index) => {
              const displayTag = `${tag.type}:${libraryTagDisplayLabel(tag, t)}`;
              return (
                <LibraryMetadataLink
                  key={`${tag.type}:${tag.tag}:${index}`}
                  {...props.target}
                  tag={tag}
                  enabled={libraryAvailable && tagsAvailable}
                  label={`${t("library.tags")}: ${displayTag}`}
                  variant="badge"
                >
                  <TagBadge
                    type={tag.type}
                    tag={tag.tag}
                    displayTag={displayTag}
                  />
                </LibraryMetadataLink>
              );
            })}
          </span>
        </DetailRow>
      )}
    </section>
  );
}

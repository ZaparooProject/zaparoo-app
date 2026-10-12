import { useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ZAP_COMMANDS } from "@/lib/zapscript/catalog";
import type { ZapCommandGroup, ZapCommandSpec } from "@/lib/zapscript/types";
import { SlideModal } from "@/components/SlideModal";
import { BackToTop } from "@/components/BackToTop";
import { EmptyState } from "@/components/wui/EmptyState";
import { TextInput } from "@/components/wui/TextInput";
import { selectorOptionClassName } from "@/components/selectorOptionClassName";
import { useHapticPress } from "@/hooks/useHapticPress";

const GROUP_ORDER: readonly ZapCommandGroup[] = [
  "launch",
  "playlist",
  "input",
  "ui",
  "profile",
  "utility",
  "http",
  "mister",
];

/**
 * The catalogue of ZapScript commands, grouped and searchable, each with its
 * plain-language description. Selecting one reports the command's name.
 */
export function CommandsModal(props: {
  isOpen: boolean;
  close: () => void;
  onSelect: (name: string) => void;
}) {
  const { t } = useTranslation();
  const handleHapticPress = useHapticPress();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  // Two catalogues can be mounted at once (steps and text), so ids are local.
  const id = useId();
  // Each opening starts from the whole catalogue.
  const close = () => {
    setQuery("");
    props.close();
  };

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Deprecated names still run, but are not offered for new scripts.
    const visible = ZAP_COMMANDS.filter(
      (command) =>
        !command.replacedBy &&
        !command.notOffered &&
        (needle === "" ||
          command.name.includes(needle) ||
          t(command.description).toLowerCase().includes(needle)),
    );
    return GROUP_ORDER.map((group) => ({
      group,
      commands: visible.filter((command) => command.group === group),
    })).filter(({ commands }) => commands.length > 0);
  }, [query, t]);

  const select = (command: ZapCommandSpec) => {
    props.onSelect(command.name);
    close();
  };

  return (
    <SlideModal
      isOpen={props.isOpen}
      close={close}
      title={t("create.custom.commandsTitle")}
      scrollRef={scrollContainerRef}
      layout="workspace"
      fixedHeight="90vh"
    >
      <TextInput
        type="search"
        inputMode="search"
        className="mb-3"
        aria-label={t("zapscript.builder.searchCommands")}
        placeholder={t("zapscript.builder.searchCommands")}
        value={query}
        setValue={setQuery}
        clearable
      />
      {groups.length === 0 ? (
        <EmptyState size="compact" title={t("zapscript.builder.noCommands")} />
      ) : (
        <div className="commands-workspace pb-16">
          {groups.map(({ group, commands }) => (
            <section
              key={group}
              aria-labelledby={`${id}-${group}`}
              className="flex flex-col gap-1"
            >
              <h3 id={`${id}-${group}`} className="text-lg font-semibold">
                {t(`zapscript.groups.${group}`)}
              </h3>
              <ul className="flex flex-col">
                {commands.map((command) => (
                  <li key={command.name}>
                    <button
                      type="button"
                      className={selectorOptionClassName(false, {
                        twoLine: true,
                      })}
                      onPointerUp={handleHapticPress}
                      onClick={() => select(command)}
                    >
                      <span className="flex min-w-0 flex-col">
                        {/* Plain language first; the name is for those who know it. */}
                        <span className="font-semibold">
                          {t(command.description)}
                        </span>
                        <span className="text-muted-foreground font-mono text-sm break-words">
                          {command.name}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <BackToTop scrollContainerRef={scrollContainerRef} threshold={200} />
    </SlideModal>
  );
}

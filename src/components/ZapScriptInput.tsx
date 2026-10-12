import { useTranslation } from "react-i18next";
import { useId, useRef, useState } from "react";
import { Browser } from "@capacitor/browser";
import { EraserIcon, PlusIcon } from "lucide-react";
import toast from "react-hot-toast";
import { useStatusStore } from "@/lib/store.ts";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { CoreAPI, logRunFailure } from "@/lib/coreApi";
import { zapCommand } from "@/lib/zapscript/catalog";
import {
  parseZapScript,
  serializeZapScript,
  type ZapParseResult,
  type ZapStep,
} from "@/lib/zapscript/script";
import { Button } from "@/components/wui/Button.tsx";
import { EmptyState } from "@/components/wui/EmptyState";
import { TabBar } from "@/components/wui/TabBar";
import { getTabBarPanelId, getTabBarTabId } from "@/components/wui/tabBarIds";
import { MediaSearchModal } from "@/components/MediaSearchModal.tsx";
import { CommandsModal } from "@/components/CommandsModal.tsx";
import { SystemSelector } from "@/components/SystemSelector.tsx";
import { ZapScriptSteps } from "@/components/zapscript/ZapScriptSteps";
import { ExternalIcon, PlayIcon } from "@/lib/images.tsx";
import { ConfirmClearModal } from "@/components/ConfirmClearModal.tsx";

type EditorView = "steps" | "text";

/**
 * The ZapScript builder: a step view with a form per command, and a text view
 * of the same script for writing it directly. `value` is always the ZapScript
 * text; the steps are read from it and written back on every edit.
 */
export function ZapScriptInput(props: {
  value: string;
  setValue: (value: string) => void;
  rows?: number;
  /**
   * Given room (from 1024px), show the steps and the text side by side
   * instead of as two tabs. For pages where the editor is the main content.
   */
  split?: boolean;
  /** Locks the editor and its tools, e.g. while its text is being written. */
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const connected = useStatusStore((state) => state.connected);
  const [systemsOpen, setSystemsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Last known caret. Null until the textarea has been focused, so inserts
  // into text the user has not placed a caret in go to the end.
  const caretRef = useRef<number | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const id = useId();
  const charCountId = `${id}-char-count`;
  const stepsTabId = getTabBarTabId("steps", `${id}-view`);
  const textTabId = getTabBarTabId("text", `${id}-view`);
  const disabled = props.disabled ?? false;
  const roomy = useMediaQuery("(min-width: 1024px)");
  const sideBySide = Boolean(props.split) && roomy;

  const { t } = useTranslation();

  // The steps are a reading of the text. They are kept while the text is the
  // one this editor last wrote, so step identity (and focus) survives edits,
  // and re-read whenever the text changes from outside.
  const [model, setModel] = useState<{ text: string; parsed: ZapParseResult }>(
    () => ({ text: props.value, parsed: parseZapScript(props.value) }),
  );
  if (model.text !== props.value) {
    setModel({ text: props.value, parsed: parseZapScript(props.value) });
  }
  const [view, setView] = useState<EditorView>(
    model.parsed.ok ? "steps" : "text",
  );
  // Side by side, both views are showing; remember the one last worked in so
  // narrowing to tabs keeps it (and its focus) on screen.
  const noteView = (next: EditorView) => {
    if (sideBySide && view !== next) setView(next);
  };
  const setSteps = (steps: ZapStep[]) => {
    const text = serializeZapScript(steps);
    setModel({ text, parsed: { ok: true, steps } });
    props.setValue(text);
  };

  const rememberCaret = (element: HTMLTextAreaElement) => {
    caretRef.current = element.selectionStart;
  };

  /**
   * `step` text is a command of its own, so it is set apart from the text
   * around it with `||`. Media placed straight after `:` or `,` is an
   * argument of the command being written and is left as it is.
   */
  const insertTextAtCursor = (
    textToInsert: string,
    options: { focus?: boolean; step?: "command" | "media" } = {},
  ) => {
    const { focus = false, step } = options;
    const position = Math.min(
      caretRef.current ?? props.value.length,
      props.value.length,
    );
    const before = props.value.substring(0, position);
    const after = props.value.substring(position);
    const written = before.trimEnd();
    const argument = step === "media" && /[:,]$/.test(written);
    const separate = step !== undefined && !argument;
    const lead =
      separate && written !== "" && !written.endsWith("||") ? "||" : "";
    const trail =
      separate && after.trim() !== "" && !after.trimStart().startsWith("||")
        ? "||"
        : "";
    const newText = before + lead + textToInsert + trail + after;
    // The caret stays inside the inserted command, before any separator.
    const newPosition = position + lead.length + textToInsert.length;

    props.setValue(newText);
    // Setting the value moves an unfocused textarea's caret to the end, so
    // the next insert continues from here rather than from the DOM.
    caretRef.current = newPosition;

    if (focus) {
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newPosition, newPosition);
      }, 0);
    }
  };

  return (
    <div
      className={
        sideBySide
          ? "zapscript-input zapscript-input-split"
          : "zapscript-input flex flex-col gap-3"
      }
    >
      {!sideBySide && (
        <TabBar
          label={t("zapscript.builder.view")}
          options={[
            {
              value: "steps",
              label: t("zapscript.builder.steps"),
              id: stepsTabId,
            },
            {
              value: "text",
              label: t("zapscript.builder.text"),
              id: textTabId,
            },
          ]}
          value={view}
          onChange={setView}
        />
      )}

      <div
        onFocus={() => noteView("steps")}
        {...(sideBySide
          ? { role: "group", "aria-label": t("zapscript.builder.steps") }
          : {
              id: getTabBarPanelId(stepsTabId),
              role: "tabpanel",
              "aria-labelledby": stepsTabId,
              hidden: view !== "steps",
            })}
      >
        {model.parsed.ok ? (
          <ZapScriptSteps
            steps={model.parsed.steps}
            disabled={disabled}
            connected={connected}
            onChange={setSteps}
          />
        ) : (
          <EmptyState
            size="compact"
            title={t("zapscript.builder.textOnly")}
            description={t("zapscript.builder.textOnlyHint")}
            action={
              <Button
                label={t("zapscript.builder.editAsText")}
                variant="outline"
                onClick={() => {
                  setView("text");
                  textareaRef.current?.focus();
                }}
              />
            }
          />
        )}
      </div>

      {/* Beside the steps, the text and the actions form the second column. */}
      <div className={sideBySide ? "flex min-w-0 flex-col gap-3" : "contents"}>
        <div
          {...(sideBySide
            ? { role: "group", "aria-label": t("zapscript.builder.text") }
            : {
                id: getTabBarPanelId(textTabId),
                role: "tabpanel",
                "aria-labelledby": textTabId,
                hidden: view !== "text",
              })}
          className="wui-editor flex flex-col"
        >
          <textarea
            ref={textareaRef}
            className="wui-input border-input rounded-b-none border border-solid p-3 font-mono text-base leading-relaxed"
            aria-label={props["aria-label"] ?? t("create.custom.textareaLabel")}
            aria-labelledby={props["aria-labelledby"]}
            placeholder={t("create.custom.textPlaceholder")}
            value={props.value}
            autoCapitalize="off"
            autoComplete="off"
            disabled={disabled}
            onChange={(e) => {
              props.setValue(e.target.value);
              rememberCaret(e.currentTarget);
            }}
            onFocus={(e) => {
              rememberCaret(e.currentTarget);
              noteView("text");
            }}
            onSelect={(e) => rememberCaret(e.currentTarget)}
            onBlur={(e) => rememberCaret(e.currentTarget)}
            style={{
              resize: "vertical",
            }}
            rows={props.rows ?? 4}
          />

          <div className="border-input bg-surface-raised grid grid-cols-2 gap-2 rounded-b-md border border-t-0 border-solid p-3">
            <Button
              aria-label={t("create.custom.insertMedia")}
              label={t("create.custom.searchMedia")}
              variant="outline"
              disabled={disabled || !connected}
              onClick={() => setSearchOpen(true)}
              className="w-full max-w-none"
              icon={<PlusIcon size={20} />}
            />
            <Button
              aria-label={t("create.custom.insertSystem")}
              label={t("create.custom.selectSystem")}
              variant="outline"
              disabled={disabled || !connected}
              onClick={() => setSystemsOpen(true)}
              className="w-full max-w-none"
              icon={<PlusIcon size={20} />}
            />
            <Button
              aria-label={t("create.custom.insertCommand")}
              label={t("create.custom.commands")}
              variant="outline"
              disabled={disabled}
              onClick={() => setCommandsOpen(true)}
              className="w-full max-w-none"
              icon={<PlusIcon size={20} />}
            />
            <Button
              label={t("create.custom.zapscriptHelp")}
              variant="outline"
              onClick={() =>
                Browser.open({
                  url: "https://zaparoo.org/docs/zapscript/",
                })
              }
              className="w-full max-w-none"
              icon={<ExternalIcon size="20" />}
            />
          </div>
        </div>

        {/* Shared by both views: what the script is, and what to do with it. */}
        <div className="zapscript-input-actions">
          <div
            id={charCountId}
            className="text-muted-foreground text-xs"
            aria-live="polite"
            aria-atomic="true"
          >
            {t("create.custom.characters", { count: props.value.length })}
          </div>
          <div className="flex gap-2">
            <Button
              icon={<EraserIcon size="20" />}
              aria-label={t("create.custom.clear")}
              label={t("create.custom.clear")}
              variant="text"
              intent="destructive"
              disabled={disabled || props.value === ""}
              onClick={() => setShowClearConfirm(true)}
            />
            <Button
              icon={<PlayIcon size="20" />}
              onClick={() => {
                CoreAPI.run({
                  uid: "",
                  text: props.value,
                }).catch((e) => {
                  toast.error(t("create.custom.failMsg"));
                  logRunFailure("ZapScript run failed:", e, {
                    action: "runZapScript",
                  });
                });
              }}
              variant="outline"
              disabled={props.value === "" || !connected}
              aria-label={t("create.custom.runZapScript")}
              label={t("create.custom.run")}
            />
          </div>
        </div>
      </div>

      <ConfirmClearModal
        isOpen={showClearConfirm}
        close={() => setShowClearConfirm(false)}
        onConfirm={() => {
          props.setValue("");
          caretRef.current = 0;
        }}
      />
      <SystemSelector
        isOpen={systemsOpen}
        onClose={() => setSystemsOpen(false)}
        onSelect={(systems) => {
          const firstSystem = systems[0];
          if (firstSystem) {
            insertTextAtCursor(firstSystem);
          }
        }}
        selectedSystems={[]}
        mode="insert"
        title={t("create.custom.selectSystem")}
        includeAllOption={false}
      />
      <MediaSearchModal
        isOpen={searchOpen}
        close={() => setSearchOpen(false)}
        onSelect={(path) => insertTextAtCursor(path, { step: "media" })}
      />
      <CommandsModal
        isOpen={commandsOpen}
        close={() => setCommandsOpen(false)}
        onSelect={(name) => {
          // Commands that take arguments are left ready for the first one.
          const takesArgs = (zapCommand(name)?.args.length ?? 0) > 0;
          insertTextAtCursor(`**${name}${takesArgs ? ":" : ""}`, {
            focus: true,
            step: "command",
          });
        }}
      />
    </div>
  );
}

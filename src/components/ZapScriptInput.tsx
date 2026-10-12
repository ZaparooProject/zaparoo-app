import { useTranslation } from "react-i18next";
import { useId, useRef, useState } from "react";
import { Browser } from "@capacitor/browser";
import { EraserIcon, PlusIcon } from "lucide-react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import toast from "react-hot-toast";
import { useStatusStore } from "@/lib/store.ts";
import { CoreAPI, logRunFailure } from "@/lib/coreApi";
import { Button } from "@/components/wui/Button.tsx";
import { MediaSearchModal } from "@/components/MediaSearchModal.tsx";
import { CommandsModal } from "@/components/CommandsModal.tsx";
import { SystemSelector } from "@/components/SystemSelector.tsx";
import { ExternalIcon, PlayIcon } from "@/lib/images.tsx";
import { ConfirmClearModal } from "@/components/ConfirmClearModal.tsx";

export function ZapScriptInput(props: {
  value: string;
  setValue: (value: string) => void;
  showPalette?: boolean;
  rows?: number;
  /** Locks the editor and its tools, e.g. while its text is being written. */
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const [showControls, setShowControls] = useState(props.showPalette ?? false);
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
  const controlsId = `${id}-controls`;
  const disabled = props.disabled ?? false;

  const { t } = useTranslation();

  const rememberCaret = (element: HTMLTextAreaElement) => {
    caretRef.current = element.selectionStart;
  };

  const insertTextAtCursor = (textToInsert: string, focus: boolean = false) => {
    const position = Math.min(
      caretRef.current ?? props.value.length,
      props.value.length,
    );
    const before = props.value.substring(0, position);
    const after = props.value.substring(position);
    const newText = before + textToInsert + after;
    const newPosition = position + textToInsert.length;

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
    <div className="zapscript-input">
      <div className="wui-editor flex flex-col">
        <textarea
          ref={textareaRef}
          className="wui-input border-input rounded-b-none border border-solid p-3 font-mono text-base leading-relaxed"
          aria-label={props["aria-label"] ?? t("create.custom.textareaLabel")}
          aria-labelledby={props["aria-labelledby"]}
          aria-describedby={charCountId}
          placeholder={t("create.custom.textPlaceholder")}
          value={props.value}
          autoCapitalize="off"
          autoComplete="off"
          disabled={disabled}
          onChange={(e) => {
            props.setValue(e.target.value);
            rememberCaret(e.currentTarget);
          }}
          onFocus={(e) => rememberCaret(e.currentTarget)}
          onSelect={(e) => rememberCaret(e.currentTarget)}
          onBlur={(e) => rememberCaret(e.currentTarget)}
          style={{
            resize: "vertical",
          }}
          rows={props.rows ?? 4}
        />

        <div className="border-input bg-surface-raised rounded-b-md border border-t-0 border-solid p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              id={charCountId}
              className="text-muted-foreground text-xs"
              style={{ flex: 1 }}
              aria-live="polite"
              aria-atomic="true"
            >
              {t("create.custom.characters", { count: props.value.length })}
            </div>
            <Button
              variant="text"
              size="sm"
              onClick={() => setShowControls(!showControls)}
              aria-expanded={showControls}
              aria-controls={controlsId}
              icon={
                showControls ? (
                  <ChevronUpIcon size={20} />
                ) : (
                  <ChevronDownIcon size={20} />
                )
              }
              label={t("create.custom.commandPalette")}
            />
          </div>

          {showControls && (
            <div id={controlsId} className="flex flex-wrap gap-2 pt-2">
              <div className="flex w-full flex-wrap items-end gap-2">
                <Button
                  label="**"
                  aria-label={t("create.custom.insertCommandStart")}
                  variant="outline"
                  onClick={() => insertTextAtCursor("**")}
                  disabled={disabled}
                  className="grow"
                />
                <Button
                  label="||"
                  aria-label={t("create.custom.insertCommandSeparator")}
                  variant="outline"
                  onClick={() => insertTextAtCursor("||")}
                  disabled={disabled}
                  className="grow"
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
                  className="grow"
                />
                <Button
                  icon={<EraserIcon size="20" />}
                  aria-label={t("create.custom.clear")}
                  label={t("create.custom.clear")}
                  variant="text"
                  intent="destructive"
                  disabled={disabled || props.value === ""}
                  onClick={() => setShowClearConfirm(true)}
                  className="grow"
                />
              </div>
              <div className="grid w-full grid-cols-2 gap-2">
                <Button
                  aria-label={t("create.custom.insertMedia")}
                  label={t("create.custom.searchMedia")}
                  variant="outline"
                  disabled={disabled || !connected}
                  onClick={() => setSearchOpen(true)}
                  className="w-full"
                  icon={<PlusIcon size={20} />}
                />
                <Button
                  aria-label={t("create.custom.insertSystem")}
                  label={t("create.custom.selectSystem")}
                  variant="outline"
                  disabled={disabled || !connected}
                  onClick={() => setSystemsOpen(true)}
                  className="w-full"
                  icon={<PlusIcon size={20} />}
                />
                <Button
                  aria-label={t("create.custom.insertCommand")}
                  label={t("create.custom.commands")}
                  variant="outline"
                  disabled={disabled}
                  onClick={() => setCommandsOpen(true)}
                  className="w-full"
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
                  className="w-full"
                  icon={<ExternalIcon size="20" />}
                />
              </div>
            </div>
          )}
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
        onSelect={(path) => {
          insertTextAtCursor(path);
        }}
      />
      <CommandsModal
        isOpen={commandsOpen}
        close={() => setCommandsOpen(false)}
        onSelect={(command) => {
          insertTextAtCursor(command, true);
        }}
      />
    </div>
  );
}

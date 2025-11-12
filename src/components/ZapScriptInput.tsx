import { useTranslation } from "react-i18next";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Browser } from "@capacitor/browser";
import { EraserIcon, HelpCircleIcon, PlusIcon } from "lucide-react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useStatusStore } from "@/lib/store.ts";
import { CoreAPI } from "@/lib/coreApi.ts";
import { Button } from "@/components/wui/Button.tsx";
import { MediaSearchModal } from "@/components/MediaSearchModal.tsx";
import { CommandsModal } from "@/components/CommandsModal.tsx";
import { SystemSelector } from "@/components/SystemSelector.tsx";
import { PlayIcon } from "@/lib/images.tsx";
import { ConfirmClearModal } from "@/components/ConfirmClearModal.tsx";

export function ZapScriptInput(props: {
  value: string;
  setValue: (value: string) => void;
  showPalette?: boolean;
  rows?: number;
}) {
  const [showControls, setShowControls] = useState(props.showPalette ?? false);
  const connected = useStatusStore((state) => state.connected);
  const [systemsOpen, setSystemsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const systems = useQuery({
    queryKey: ["systems"],
    queryFn: () => CoreAPI.systems()
  });

  const { t } = useTranslation();

  const insertTextAtCursor = (textToInsert: string, focus: boolean = false) => {
    const before = props.value.substring(0, cursorPosition);
    const after = props.value.substring(cursorPosition);
    const newText = before + textToInsert + after;
    const newPosition = cursorPosition + textToInsert.length;

    props.setValue(newText);
    setCursorPosition(newPosition); // Update cursor position state

    if (focus) {
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newPosition, newPosition);
      }, 0);
    }
  };

  return (
    <div>
      <div className="flex flex-col">
        <textarea
          ref={textareaRef}
          className="rounded-b-none border border-solid border-bd-input bg-background p-3"
          placeholder={t("create.custom.textPlaceholder")}
          value={props.value}
          autoCapitalize="off"
          onChange={(e) => {
            props.setValue(e.target.value);
          }}
          onSelect={(e) => {
            setCursorPosition(e.currentTarget.selectionStart);
          }}
          style={{
            resize: "vertical"
          }}
          rows={props.rows ?? 4}
        />

        <div className="rounded-b-md border border-t-0 border-solid border-bd-input bg-background p-2 pt-2">
          <div className="flex items-center justify-between">
            <div
              className="pl-3 text-sm text-muted-foreground"
              style={{ flex: 1 }}
            >
              {t("create.custom.characters", { count: props.value.length })}
            </div>
            <Button
              variant="text"
              size="sm"
              onClick={() => setShowControls(!showControls)}
              icon={
                showControls ? (
                  <ChevronUp size={20} />
                ) : (
                  <ChevronDown size={20} />
                )
              }
              label={t("create.custom.commandPalette")}
            />
          </div>

          {showControls && (
            <div className="flex flex-wrap gap-2 pt-2">
              <div className="flex w-full gap-2">
                {[
                  { label: "**", text: "**" },
                  { label: "||", text: "||" }
                ].map((item) => (
                  <Button
                    key={item.label}
                    label={item.label}
                    variant="outline"
                    onClick={() => insertTextAtCursor(item.text)}
                    className="grow"
                  />
                ))}
                <Button
                  icon={<PlayIcon size="20" />}
                  onClick={() => {
                    CoreAPI.run({
                      uid: "",
                      text: props.value
                    });
                  }}
                  variant="outline"
                  disabled={props.value === "" || !connected}
                  label={t("create.custom.run")}
                  className="grow"
                />
                <Button
                  icon={<EraserIcon size="20" />}
                  variant="outline"
                  disabled={props.value === ""}
                  onClick={() => setShowClearConfirm(true)}
                  className="grow"
                />
              </div>
              <div className="grid w-full grid-cols-2 gap-2">
                <Button
                  label={t("create.custom.searchMedia")}
                  variant="outline"
                  disabled={!connected}
                  onClick={() => setSearchOpen(true)}
                  className="w-full"
                  icon={<PlusIcon size={20} />}
                />
                <Button
                  label={t("create.custom.selectSystem")}
                  variant="outline"
                  disabled={!connected}
                  onClick={() => {
                    setSystemsOpen(true);
                    systems.refetch();
                  }}
                  className="w-full"
                  icon={<PlusIcon size={20} />}
                />
                <Button
                  label={t("create.custom.commands")}
                  variant="outline"
                  onClick={() => setCommandsOpen(true)}
                  className="w-full"
                  icon={<PlusIcon size={20} />}
                />
                <Button
                  label={t("create.custom.zapscriptHelp")}
                  variant="outline"
                  onClick={() =>
                    Browser.open({
                      url: "https://zaparoo.org/docs/zapscript/"
                    })
                  }
                  className="w-full"
                  icon={<HelpCircleIcon size={20} />}
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
        }}
      />
      <SystemSelector
        isOpen={systemsOpen}
        onClose={() => setSystemsOpen(false)}
        onSelect={(systems) => {
          if (systems.length > 0) {
            insertTextAtCursor(systems[0]);
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
